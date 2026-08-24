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
        await this.equipmentTrackingService.registerInspectionWithAutoTracking({
          inspectionId: String(saved._id),
          templateCode: createDto.templateCode,
          verificationData: createDto.verification,
          inspectorName: createDto.submittedBy,
        });

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
   * Extrae el valor del campo "área" desde el objeto verification.
   * La clave puede variar: "ÁREA", "AREA", "Área", "area", etc.
   * Se normaliza quitando tildes y convirtiendo a minúsculas para comparar.
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

    for (const key of Object.keys(verification)) {
      const normalizedKey = normalize(key);
      if (normalizedKey === 'area' || normalizedKey === 'area/seccion') {
        const val = verification[key];
        return typeof val === 'string' ? val.trim() : String(val);
      }
    }
    return undefined;
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

    return this.inspectionModel
      .find(query)
      .populate('templateId')
      .sort({ submittedAt: -1 })
      .exec();
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

  async remove(id: string): Promise<{ message: string }> {
    const result = await this.inspectionModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    return { message: 'Inspección eliminada exitosamente' };
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
