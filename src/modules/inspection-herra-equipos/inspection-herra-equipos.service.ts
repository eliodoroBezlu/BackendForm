import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  InspectionHerraEquipos,
  InspectionHerraEquiposDocument,
} from './schemas/inspection-herra-equipos.schema';
import { CreateInspectionHerraEquipoDto } from './dto/create-inspection-herra-equipo.dto';
import {
  UpdateInspectionHerraEquipoDto,
  ApproveInspectionDto,
  RejectInspectionDto,
} from './dto/update-inspection-herra-equipo.dto';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { TemplateHerraEquiposService } from '../template-herra-equipos/template-herra-equipos.service';
import { ROLES_VISIBILIDAD_TOTAL } from '../auth/enums/role.enum';
import { TemplateHerraEquipos } from '../template-herra-equipos/schemas/template-herra-equipo.schema';
import { diasPorFrecuencia } from '../template-herra-equipos/domain/frecuencia.util';
import { InspectionStatus } from './types/IProps';

/**
 * Lo que un **listado** no enseña y sin embargo era casi todo su peso.
 *
 * Medido sobre las 2047 inspecciones de la colección: 47,1 MB en total, de los
 * cuales
 *
 *   firmas (las dos imágenes)      33,0 MB   69 %
 *   vehicle.damageImageBase64       9,0 MB   19 %
 *   responses                       3,5 MB    7 %
 *   ─────────────────────────────────────────────
 *   lo que la tabla sí usa          1,4 MB    3 %
 *
 * Una búsqueda sin filtro llegaba a tardar 15 segundos descargando 35 MB para
 * pintar diez filas de fecha, área y TAG. Recortando los adjuntos queda en
 * torno a 1,4 MB.
 *
 * ⚠️ Se quitan **las imágenes, no los objetos que las contienen**: la tarjeta
 * de actividad del panel lee `inspectorSignature.inspectorName`, y excluir
 * `inspectorSignature` entero la dejaría sin el nombre de quien inspeccionó.
 * Por eso la exclusión baja al subcampo.
 *
 * El detalle de una inspección **no pasa por aquí** —usa `findOne`, que
 * devuelve el documento completo—, así que abrir una sigue mostrándolo todo.
 */
const CAMPOS_FUERA_DEL_LISTADO = [
  '-inspectorSignature.inspectorSignature',
  '-supervisorSignature.supervisorSignature',
  '-vehicle.damageImageBase64',
  '-responses',
].join(' ');

/**
 * Techo del listado aunque quien llama pida más.
 *
 * No es una paginación —esa es harina de otro costal, porque el filtrado por
 * texto todavía ocurre en el cliente y paginar en el servidor lo rompería—.
 * Es solo un tope para que ninguna petición pueda volver a arrastrar la
 * colección entera.
 */
const TOPE_LISTADO = 500;

@Injectable()
export class InspectionsHerraEquiposService {
  private readonly logger = new Logger(InspectionsHerraEquiposService.name);

  constructor(
    @InjectModel(InspectionHerraEquipos.name)
    private inspectionModel: Model<InspectionHerraEquiposDocument>,
    private equipmentTrackingService: EquipmentTrackingService,
    private templateConfigService: TemplateConfigService,
    private templateHerraEquiposService: TemplateHerraEquiposService,
  ) {}

  /**
   * Carga el template por código sin bloquear la creación/aprobación de la
   * inspección si falla — el control de frecuencia/código es una mejora
   * opt-in, no una dependencia dura del flujo de guardado.
   */
  private async intentarObtenerTemplate(
    templateCode: string,
  ): Promise<TemplateHerraEquipos | null> {
    try {
      return await this.templateHerraEquiposService.findByCode(templateCode);
    } catch {
      return null;
    }
  }

  /**
   * Registra el tracking de frecuencia configurable (independiente de la
   * lógica hardcodeada de tecles en TemplateConfigService) cuando el
   * template tiene `frecuencia.activa` y `campoCodigoEquipo` configurados.
   */
  private async trackearFrecuenciaSiCorresponde(
    template: TemplateHerraEquipos | null,
    templateCode: string,
    verification: Record<string, string | number>,
  ): Promise<void> {
    if (!template?.frecuencia?.activa || !template.campoCodigoEquipo) return;

    const codigoEquipo = this.extractEquipmentId(
      verification,
      template.campoCodigoEquipo,
    );
    if (!codigoEquipo) return;

    await this.equipmentTrackingService.registrarProximaInspeccionPorFrecuencia(
      {
        equipmentId: codigoEquipo,
        templateCode,
        frecuenciaDias: diasPorFrecuencia(template.frecuencia),
      },
    );
  }

  // ============================================
  // CREAR INSPECCIÓN
  // ============================================
  async create(createDto: CreateInspectionHerraEquipoDto): Promise<any> {
    try {
      this.logger.log(`📝 Creando inspección: ${createDto.templateCode}`);

      const config = this.templateConfigService.getConfig(
        createDto.templateCode,
      );
      const template = await this.intentarObtenerTemplate(
        createDto.templateCode,
      );

      // ✅ Guardar inspección
      const inspection = new this.inspectionModel({
        ...createDto,
        submittedAt: new Date(createDto.submittedAt),
        // Extraer área desde verification (clave puede variar)
        area: this.extractAreaFromVerification(createDto.verification),
        // Código de equipo denormalizado (si el template lo tiene configurado)
        codigoEquipo: template?.campoCodigoEquipo
          ? (this.extractEquipmentId(
              createDto.verification,
              template.campoCodigoEquipo,
            ) ?? undefined)
          : undefined,
      });

      const saved = await inspection.save();
      this.logger.log(`✅ Inspección guardada con ID: ${saved._id}`);

      // Si requiere aprobación, no hacer tracking todavía
      if (
        saved.requiresApproval &&
        saved.status === InspectionStatus.PENDING_APPROVAL
      ) {
        this.logger.log(
          '⏳ Inspección pendiente de aprobación - tracking suspendido',
        );
        return { inspection: saved };
      }

      // ── A partir de aquí la inspección YA ESTÁ GUARDADA ────────────────
      //
      // Todo lo que sigue es contabilidad: llevar la cuenta de cuándo toca la
      // próxima revisión de cada equipo. Es útil, pero **es secundario**, y
      // por eso va dentro de un `try` propio.
      //
      // Antes no lo estaba, y una plantilla cuyo campo de código no cuadraba
      // con la configuración hacía fracasar toda la petición: el inspector
      // veía «Error al guardar borrador» y volvía a llenar el formulario,
      // cuando su inspección estaba guardada desde hacía tres líneas. Perder
      // el trabajo de quien inspecciona para no perder una fecha de
      // seguimiento es exactamente el intercambio equivocado.
      try {
        // 🆕 Frecuencia configurable desde el template — independiente de la
        // config hardcodeada de tecles, corre siempre que aplique.
        await this.trackearFrecuenciaSiCorresponde(
          template,
          createDto.templateCode,
          createDto.verification,
        );

        // Tracking normal para inspecciones que no requieren aprobación
        if (config.type === 'pre-uso' || config.type === 'diaria') {
          this.logger.log('✅ Inspección sin tracking especial');
          return { inspection: saved };
        }

        const trackingResult =
          await this.equipmentTrackingService.registerInspectionWithAutoTracking(
            {
              inspectionId: String(saved._id),
              templateCode: createDto.templateCode,
              verificationData: createDto.verification,
              inspectorName: createDto.submittedBy,
            },
          );

        this.logger.log(`✅ Tracking registrado: ${trackingResult.message}`);

        if (config.type === 'frecuente' && config.linkedFormCode) {
          const equipmentId = this.extractEquipmentId(
            createDto.verification,
            config.equipmentFieldName,
          );

          if (equipmentId) {
            await this.equipmentTrackingService.resetPreUsoCounter(
              equipmentId,
              config.linkedFormCode,
            );
            this.logger.log(`🔄 Contador reseteado para ${equipmentId}`);
          }
        }

        return {
          inspection: saved,
          tracking: trackingResult.tracking,
          warning: trackingResult.needsFrecuenteInspection
            ? `⚠️ El equipo requiere inspección FRECUENTE en el próximo uso`
            : null,
        };
      } catch (fallo) {
        // Se avisa fuerte en el registro —hay seguimiento que no se anotó y
        // alguien tendrá que mirarlo— pero la respuesta es un éxito, porque
        // guardar es lo que pidió quien llamó y guardar se hizo.
        const motivo =
          fallo instanceof Error ? fallo.message : 'error desconocido';
        this.logger.error(
          `⚠️ Inspección ${String(saved._id)} guardada, pero el seguimiento ` +
            `de frecuencia no se pudo registrar: ${motivo}`,
        );

        return {
          inspection: saved,
          warning:
            'La inspección se guardó. No se pudo registrar el seguimiento ' +
            `de frecuencia del equipo: ${motivo}`,
        };
      }
    } catch (error) {
      this.logger.error('❌ Error al crear inspección:', error);
      throw error;
    }
  }

  // ============================================
  // ✅ NUEVOS MÉTODOS DE APROBACIÓN
  // ============================================

  async approveInspection(
    id: string,
    approveDto: ApproveInspectionDto,
  ): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel.findById(id).exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    if (inspection.status !== InspectionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Solo se pueden aprobar inspecciones pendientes de aprobación',
      );
    }

    // Actualizar estado y aprobación
    inspection.status = InspectionStatus.APPROVED;
    inspection.approval = {
      status: 'approved',
      approvedBy: approveDto.approvedBy,
      approvedAt: new Date(),
      supervisorComments: approveDto.supervisorComments,
    };

    const approved = await inspection.save();

    this.logger.log(
      `✅ Inspección ${id} aprobada por ${approveDto.approvedBy}`,
    );

    // ✅ Ahora sí ejecutar tracking
    const config = this.templateConfigService.getConfig(
      inspection.templateCode,
    );
    const template = await this.intentarObtenerTemplate(
      inspection.templateCode,
    );

    await this.trackearFrecuenciaSiCorresponde(
      template,
      inspection.templateCode,
      inspection.verification,
    );

    if (config.type !== 'pre-uso' && config.type !== 'diaria') {
      try {
        await this.equipmentTrackingService.registerInspectionWithAutoTracking({
          inspectionId: String(approved._id),
          templateCode: inspection.templateCode,
          verificationData: inspection.verification,
          inspectorName: inspection.submittedBy,
        });

        this.logger.log(`✅ Tracking registrado después de aprobación`);
      } catch (error) {
        this.logger.error('⚠️ Error en tracking post-aprobación:', error);
      }
    }

    return approved;
  }

  async rejectInspection(
    id: string,
    rejectDto: RejectInspectionDto,
  ): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel.findById(id).exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    if (inspection.status !== InspectionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Solo se pueden rechazar inspecciones pendientes de aprobación',
      );
    }

    inspection.status = InspectionStatus.REJECTED;
    inspection.approval = {
      status: 'rejected',
      approvedBy: rejectDto.rejectedBy,
      approvedAt: new Date(),
      rejectionReason: rejectDto.rejectionReason,
    };

    const rejected = await inspection.save();

    this.logger.log(
      `❌ Inspección ${id} rechazada por ${rejectDto.rejectedBy}`,
    );

    return rejected;
  }

  async findPendingApprovals(
    options: {
      excludeSubmittedBy?: string;
      areas?: string[]; // array de áreas (soporte multi-área)
      isAdmin?: boolean;
    } = {},
  ): Promise<InspectionHerraEquiposDocument[]> {
    const { excludeSubmittedBy, areas, isAdmin } = options;

    const query: Record<string, unknown> = {
      status: InspectionStatus.PENDING_APPROVAL,
      requiresApproval: true,
    };

    // Excluir propias del supervisor (no puede aprobar las suyas)
    if (excludeSubmittedBy) {
      query.submittedBy = { $ne: excludeSubmittedBy };
    }

    // Si no es admin, filtrar estrictamente por áreas seleccionadas
    if (!isAdmin) {
      if (!areas || areas.length === 0) {
        this.logger.warn(
          '⚠️ Supervisor sin áreas definidas: devolviendo lista vacía',
        );
        return [];
      }
      // $in con regex case-insensitive por cada área seleccionada
      query.area = {
        $in: areas.map((a) => new RegExp(`^${this.escapeRegex(a)}$`, 'i')),
      };
    }

    this.logger.log(
      `📋 findPendingApprovals — áreas: [${areas?.join(', ') ?? 'TODAS'}] | isAdmin: ${isAdmin ?? false}`,
    );

    return this.inspectionModel
      .find(query)
      .populate('templateId')
      .sort({ submittedAt: -1 })
      .exec();
  }

  // ============================================
  // MÉTODOS EXISTENTES
  // ============================================

  // ============================================
  // HELPERS PRIVADOS
  // ============================================

  /**
   * Extrae el área desde `verification` para guardarla en su propio campo.
   *
   * Ese campo denormalizado es lo que usan los informes, el panel y el filtro
   * por área; si sale vacío, la inspección existe pero **no aparece en ninguna
   * vista organizada por área**, sin que nada falle ni avise.
   *
   * ── Por qué no basta una lista de grafías ────────────────────────────────
   *
   * Antes aceptaba exactamente `area` y `area/seccion`. Cada plantilla nombra
   * el campo a su manera, así que se quedaban fuera:
   *
   * ```
   * UBICACIÓN FÍSICA EL EQUIPO               F39, F40, F42   ← nótese «EL»
   * AREA FÍSICA DE UBICACIÓN DE LA ESCALERA  F33
   * ÁREA FÍSICA DEL MONTAJE DEL ANDAMIO      F30
   * ```
   *
   * 312 inspecciones con el área bien escrita se guardaron sin ella. La de F39
   * es además una errata de la plantilla —«FÍSICA EL EQUIPO»— que ninguna
   * lista de grafías habría previsto: de ahí que se reconozca por significado.
   *
   * Se descartan los campos que nombran a una persona: `SUPERVISOR DE ÁREA`
   * lleva «área» en la etiqueta y contiene un nombre propio.
   */
  private extractAreaFromVerification(
    verification: Record<string, string | number>,
  ): string | undefined {
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const esDePersona = (clave: string) =>
      /supervisor|responsable|inspector|persona|trabajador|jefe|firma/.test(
        clave,
      );

    const claves = Object.keys(verification ?? {}).filter(
      (k) => !esDePersona(normalize(k)),
    );

    /** Primera clave que cumple y **tiene valor**; vacío no cuenta. */
    const primeraConValor = (
      cumple: (claveNormalizada: string) => boolean,
    ): string | undefined => {
      for (const clave of claves) {
        if (!cumple(normalize(clave))) continue;
        const valor = verification[clave];
        const texto =
          valor === null || valor === undefined ? '' : String(valor).trim();
        if (texto) return texto;
      }
      return undefined;
    };

    // El orden importa: `2.03.P10.F05` tiene AREA y UBICACIÓN a la vez. Un
    // área es dónde trabaja la cuadrilla; una ubicación puede ser «Caja
    // soldadura 320», un sitio dentro del área. Gana la primera.
    return (
      primeraConValor((k) => k === 'area' || k === 'area/seccion') ??
      primeraConValor((k) => k.includes('area') || k.includes('seccion')) ??
      primeraConValor((k) => k.includes('ubicac'))
    );
  }

  /** Escapa caracteres especiales para usar en RegExp de MongoDB */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractEquipmentId(
    verificationData: Record<string, any>,
    fieldName: string,
  ): string | null {
    const key = Object.keys(verificationData).find(
      (k) =>
        k.trim().toLowerCase().replace(/\s+/g, '') ===
        fieldName.trim().toLowerCase().replace(/\s+/g, ''),
    );

    if (!key) return null;

    const value = verificationData[key];
    return typeof value === 'string' ? value.trim() : String(value);
  }

  async updateInProgress(
    id: string,
    updateDto: Partial<CreateInspectionHerraEquipoDto>,
  ): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel.findById(id).exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    if (inspection.status !== InspectionStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Solo se pueden actualizar inspecciones en progreso',
      );
    }

    if (updateDto.scaffold?.routineInspections) {
      inspection.scaffold = {
        ...inspection.scaffold,
        routineInspections: updateDto.scaffold.routineInspections,
      };
    }

    if (updateDto.status) {
      inspection.status = updateDto.status;
    }

    const updated = await inspection.save();

    this.logger.log('🔄 Inspección en progreso actualizada:', updated._id);

    return updated;
  }

  async findInProgress(
    filters?: any,
  ): Promise<InspectionHerraEquiposDocument[]> {
    const query: any = { status: InspectionStatus.IN_PROGRESS };

    if (filters?.templateCode) {
      query.templateCode = filters.templateCode;
    }

    if (filters?.submittedBy) {
      query.submittedBy = filters.submittedBy;
    }

    return this.inspectionModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findAll(
    filters?: any,
    roles?: string[],
  ): Promise<InspectionHerraEquiposDocument[]> {
    const query: any = {};

    if (filters?.status) query.status = filters.status;
    if (filters?.templateCode) query.templateCode = filters.templateCode;
    if (filters?.submittedBy) query.submittedBy = filters.submittedBy;

    // Acota el listado a las plantillas visibles para los roles del usuario.
    // Los roles de visibilidad total no se filtran; los restringidos ven
    // inspecciones de sus plantillas asignadas — de cualquier usuario, no
    // solo las propias.
    //
    // La regla de visibilidad se pide al servicio de plantillas en vez de
    // reimplementarla: duplicarla es la forma segura de que las dos copias
    // se desincronicen con el tiempo.
    if (
      roles?.length &&
      !roles.some((r) => ROLES_VISIBILIDAD_TOTAL.includes(r))
    ) {
      const visibles =
        await this.templateHerraEquiposService.codigosVisibles(roles);
      const pedido = query.templateCode as string | undefined;
      query.templateCode = pedido
        ? // Si ya pedía un código concreto, solo pasa si está permitido;
          // si no, se fuerza un resultado vacío en vez de devolverlo todo.
          visibles.includes(pedido)
          ? pedido
          : { $in: [] }
        : { $in: visibles };
    }

    if (filters?.startDate || filters?.endDate) {
      query.submittedAt = {};
      if (filters.startDate)
        query.submittedAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.submittedAt.$lte = new Date(filters.endDate);
    }

    const consulta = this.inspectionModel
      .find(query)
      .select(CAMPOS_FUERA_DEL_LISTADO)
      // Solo `revision`, que es lo único que la tabla enseña de la plantilla.
      // Traerla entera multiplicaba: 24 plantillas de 16 KB incrustadas en
      // 2047 filas son ~31 MB de repetir lo mismo una y otra vez.
      .populate('templateId', 'revision')
      .sort({ submittedAt: -1 });

    if (filters?.limit && filters.limit > 0) {
      consulta.limit(Math.min(filters.limit, TOPE_LISTADO));
    }

    return consulta.exec();
  }

  async findOne(id: string): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel
      .findById(id)
      .populate('templateId')
      .exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    return inspection;
  }

  async update(
    id: string,
    updateDto: UpdateInspectionHerraEquipoDto,
  ): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel
      .findByIdAndUpdate(
        id,
        { $set: updateDto },
        { new: true, runValidators: true },
      )
      .exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    return inspection;
  }

  /**
   * Da de baja una inspección. **No la borra.**
   *
   * Una inspección es el registro de que alguien revisó un equipo un día
   * concreto; eso no deja de haber ocurrido porque se retire el asiento de las
   * pantallas. Antes esto era un `findByIdAndDelete` y lo borrado no se podía
   * recuperar: la bitácora guardaba quién y cuándo, pero no el documento.
   *
   * Devuelve la inspección **tal como quedó** porque el interceptor de
   * auditoría archiva lo que devuelven los `DELETE`. Es la copia de seguridad
   * de segundo nivel, por si alguien vaciara la colección por otra vía.
   */
  async remove(
    id: string,
    usuario?: string,
  ): Promise<{ message: string; data: InspectionHerraEquiposDocument }> {
    const inspeccion = await this.inspectionModel
      .findByIdAndUpdate(
        id,
        {
          activo: false,
          eliminadaEn: new Date(),
          eliminadaPor: usuario ?? 'desconocido',
        },
        { new: true },
      )
      .exec();

    // El gancho del esquema ya excluye las dadas de baja, así que un `null`
    // aquí significa «no existe» o «ya estaba de baja». Las dos cosas son un
    // 404 desde fuera: para quien pregunta, no hay nada que dar de baja.
    if (!inspeccion) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    return { message: 'Inspección dada de baja', data: inspeccion };
  }

  /**
   * Revierte la baja. El filtro nombra `activo` a propósito: es lo que
   * desactiva el gancho de exclusión del esquema, sin el cual no se podría
   * encontrar lo que se quiere restaurar.
   */
  async restaurar(id: string): Promise<InspectionHerraEquiposDocument> {
    const inspeccion = await this.inspectionModel
      .findOneAndUpdate(
        { _id: id, activo: false },
        { activo: true, $unset: { eliminadaEn: '', eliminadaPor: '' } },
        { new: true },
      )
      .exec();

    if (!inspeccion) {
      throw new NotFoundException(
        `Inspección ${id} no encontrada entre las dadas de baja`,
      );
    }

    return inspeccion;
  }

  async findDrafts(userId?: string): Promise<InspectionHerraEquiposDocument[]> {
    const query: any = { status: 'draft' };

    if (userId) {
      query.submittedBy = userId;
    }

    return this.inspectionModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findByEquipo(
    equipoNombre: string,
  ): Promise<InspectionHerraEquiposDocument[]> {
    return this.inspectionModel
      .find({ 'verification.equipo': new RegExp(equipoNombre, 'i') })
      .sort({ submittedAt: -1 })
      .exec();
  }

  async findByTemplateCode(
    templateCode: string,
  ): Promise<InspectionHerraEquiposDocument[]> {
    return this.inspectionModel
      .find({ templateCode })
      .sort({ submittedAt: -1 })
      .exec();
  }

  async getStats(templateCode?: string) {
    const match: any = {};
    if (templateCode) {
      match.templateCode = templateCode;
    }

    const stats = await this.inspectionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const totalByType = await this.inspectionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$templateCode',
          count: { $sum: 1 },
          lastInspection: { $max: '$submittedAt' },
        },
      },
    ]);

    return {
      total: stats.reduce((acc, curr) => acc + curr.count, 0),
      byStatus: stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      byTemplateCode: totalByType,
    };
  }
}
