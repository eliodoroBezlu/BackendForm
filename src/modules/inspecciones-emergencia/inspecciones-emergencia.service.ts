import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateFormularioInspeccionDto,
  InspeccionMensualDto,
} from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { FormularioInspeccionEmergencia } from './schemas/inspeccion-emergencia.schema';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ExtintorService } from '../extintor/extintor.service';
import { Area } from '../area/schemas/area.schema';
import {
  AreaDelMaestro,
  consultaDelReporte,
  FiltrosReporte,
  MESES,
} from './domain/consulta-reporte';
import {
  esMesValido,
  mesesGuardados,
  mesesQueFaltan,
  periodoDeMes,
  ultimoMes,
} from './domain/meses-formulario';

@Injectable()
export class InspeccionesEmergenciaService {
  private readonly logger = new Logger(InspeccionesEmergenciaService.name);

  constructor(
    @InjectModel(FormularioInspeccionEmergencia.name)
    private inspeccionEmergenciaModel: Model<FormularioInspeccionEmergencia>,
    private extintorService: ExtintorService,
    @InjectModel(Area.name)
    private areaModel: Model<Area>,
  ) {}

  async autoCompletarFormulariosVencidos(): Promise<void> {
    const fechaActual = new Date();
    const añoActual = fechaActual.getFullYear();
    const mesIndex = fechaActual.getMonth(); // 0 = Enero, 1 = Febrero, ..., 5 = Junio, 6 = Julio, ..., 11 = Diciembre

    // 1. Completar todos los de años anteriores
    await this.inspeccionEmergenciaModel
      .updateMany(
        { año: { $lt: añoActual }, estado: 'activo' },
        { $set: { estado: 'completado' } },
      )
      .exec();

    // 2. Si estamos en el segundo semestre (Julio-Diciembre), completar los del primer semestre (ENERO-JUNIO) del año actual
    if (mesIndex >= 6) {
      await this.inspeccionEmergenciaModel
        .updateMany(
          { año: añoActual, periodo: 'ENERO-JUNIO', estado: 'activo' },
          { $set: { estado: 'completado' } },
        )
        .exec();
    }
  }

  /**
   * El formulario activo del tag para ese semestre. Antes se buscaba solo por tag: con dos
   * formularios activos del mismo tag (las copias de agosto de 2026) se escribía en el primero que
   * devolviera la base.
   */
  private async validarEstadoActivo(tag: string, periodo: string) {
    const formulario = await this.inspeccionEmergenciaModel.findOne({
      tag,
      periodo,
      estado: 'activo',
    });

    if (!formulario) {
      throw new NotFoundException(
        `No se encontró formulario activo con TAG: ${tag}`,
      );
    }

    if (formulario.estado !== 'activo') {
      throw new ForbiddenException(
        `No se puede modificar el formulario con TAG: ${tag}. Estado actual: ${formulario.estado}. Solo se pueden modificar formularios en estado 'activo'.`,
      );
    }
    return formulario;
  }

  /** Da de alta los extintores nuevos y los marca como inspeccionados. */
  private async registrarExtintores(
    extintores: { codigo: string; ubicacion?: string }[] | undefined,
    tag: string,
    area: string,
  ): Promise<void> {
    if (!extintores?.length) return;
    await this.extintorService.verificarYCrearExtintores(
      extintores.map((extintor) => ({
        codigo: extintor.codigo,
        ubicacion: extintor.ubicacion || 'No especificada',
      })),
      tag,
      area,
    );
    await this.extintorService.marcarExtintoresComoInspeccionados(
      extintores.map((extintor) => extintor.codigo),
    );
  }

  /**
   * «Crear» llegó para un formulario que ya existe: se agregan los meses que el envío trae y el
   * formulario no tiene (ver `domain/meses-formulario.ts`). Sin esto, en agosto de 2026 se
   * insertaron copias, y después el mes enviado se descartaba en silencio.
   */
  private async completarMesesFaltantes(
    existente: FormularioInspeccionEmergencia,
    dto: CreateFormularioInspeccionDto,
  ) {
    const guardados = mesesGuardados(
      existente.meses as unknown as Map<string, unknown>,
    );
    const faltan = mesesQueFaltan(guardados, dto.meses, existente.periodo);
    if (faltan.length === 0) return existente;

    if (existente.estado !== 'activo') {
      throw new ForbiddenException(
        `El formulario del TAG ${existente.tag} (${existente.periodo} ${existente.año}) está ${existente.estado}: no se le pueden agregar meses.`,
      );
    }

    for (const mes of faltan) {
      await this.registrarExtintores(
        dto.meses[mes]?.inspeccionesExtintor,
        existente.tag,
        dto.area,
      );
    }

    const $set: Record<string, unknown> = {
      mesActual: ultimoMes([...guardados, ...faltan]),
      fechaUltimaModificacion: new Date(),
    };
    for (const mes of faltan) $set[`meses.${mes}`] = dto.meses[mes];

    const id = (existente as unknown as { _id: unknown })._id;
    await this.inspeccionEmergenciaModel.updateOne({ _id: id }, { $set });
    this.logger.warn(
      `crear-formulario recibió el TAG ${existente.tag} (${existente.periodo} ${existente.año}), que ya existía: se agregaron ${faltan.join(', ')} al formulario existente en vez de crear otro.`,
    );
    return this.inspeccionEmergenciaModel.findById(id).exec();
  }

  async create(createInspeccionesEmergenciaDto: CreateFormularioInspeccionDto) {
    if (!createInspeccionesEmergenciaDto.tag) {
      throw new BadRequestException(
        'El tag es requerido para crear un formulario',
      );
    }

    // Autocompletar vencidos
    await this.autoCompletarFormulariosVencidos();

    // Buscar si ya existe para tag, periodo y año (evita duplicidad). Las copias archivadas no
    // cuentan: su contenido ya está en el original.
    const formularioExistente = await this.inspeccionEmergenciaModel.findOne({
      tag: createInspeccionesEmergenciaDto.tag,
      periodo: createInspeccionesEmergenciaDto.periodo,
      año: createInspeccionesEmergenciaDto.año,
      estado: { $ne: 'archivado' },
    });

    if (formularioExistente) {
      return this.completarMesesFaltantes(
        formularioExistente,
        createInspeccionesEmergenciaDto,
      );
    }

    // Crear la inspección
    const createInspeccionEmergencia = new this.inspeccionEmergenciaModel(
      createInspeccionesEmergenciaDto,
    );
    const savedInspection = await createInspeccionEmergencia.save();

    // Actualizar los extintores que fueron inspeccionados
    const mesActual = createInspeccionesEmergenciaDto.mesActual;
    await this.registrarExtintores(
      createInspeccionesEmergenciaDto.meses[mesActual]?.inspeccionesExtintor,
      createInspeccionesEmergenciaDto.tag,
      createInspeccionesEmergenciaDto.area,
    );

    return savedInspection;
  }

  async verificarTag(tag: string, periodo: string, año: number, area: string) {
    // Autocompletar vencidos
    await this.autoCompletarFormulariosVencidos();

    // Buscar el formulario por tag, periodo y año (activo o completado; nunca una copia archivada)
    const formularioExistente = await this.inspeccionEmergenciaModel.findOne({
      tag,
      periodo,
      año,
      estado: { $ne: 'archivado' },
    });

    // Buscar extintores por área
    const extintores = await this.extintorService.findByTag(tag);

    // Buscar información del área incluyendo la superintendencia
    const areaInfo = await this.areaModel
      .findOne({ nombre: area })
      .populate('superintendencia')
      .exec();

    const superintendencia = areaInfo?.superintendencia?.nombre || '';

    if (formularioExistente) {
      const esActivo = formularioExistente.estado === 'activo';
      return {
        existe: true,
        formulario: formularioExistente,
        extintores,
        superintendencia,
        esActivo,
        estado: formularioExistente.estado,
        puedeModificar: esActivo,
      };
    } else {
      return {
        existe: false,
        extintores,
        superintendencia,
        esActivo: true,
        estado: null,
        puedeModificar: true,
      };
    }
  }

  async actualizarMesPorTag(
    tag: string,
    mes: string,
    datosMes: InspeccionMensualDto,
    area: string,
  ) {
    // Autocompletar vencidos
    await this.autoCompletarFormulariosVencidos();

    if (!esMesValido(mes)) {
      throw new BadRequestException(`Mes no válido: ${mes}`);
    }

    // El formulario activo del tag **para el semestre de ese mes**.
    const formulario = await this.validarEstadoActivo(tag, periodoDeMes(mes));

    await this.registrarExtintores(datosMes.inspeccionesExtintor, tag, area);

    // Crear el objeto de actualización
    const updateQuery = {
      $set: {
        [`meses.${mes}`]: datosMes,
        mesActual: mes,
        fechaUltimaModificacion: new Date(),
      },
    };

    const resultado = await this.inspeccionEmergenciaModel.updateOne(
      { _id: (formulario as unknown as { _id: unknown })._id },
      updateQuery,
    );

    if (resultado.matchedCount === 0) {
      throw new Error(`No se encontró un formulario activo con el tag: ${tag}`);
    }

    return { success: true, message: 'Mes actualizado correctamente' };
  }

  /** Reporte: ver `domain/consulta-reporte.ts` para cómo se resuelve cada filtro. */
  async findAll(filtros: FiltrosReporte = {}) {
    const maestro = filtros.superintendencia?.trim()
      ? await this.areasDelMaestro()
      : [];
    return this.inspeccionEmergenciaModel
      .find(consultaDelReporte(filtros, maestro))
      .sort({ fechaUltimaModificacion: -1 })
      .exec();
  }

  /** Áreas activas con el nombre de su superintendencia. */
  private async areasDelMaestro(): Promise<AreaDelMaestro[]> {
    const areas = await this.areaModel
      .find({ activo: { $ne: false } })
      .select('nombre superintendencia')
      .populate({ path: 'superintendencia', select: 'nombre' })
      .lean()
      .exec();
    return areas.map((a) => ({
      nombre: a.nombre,
      superintendencia:
        (a.superintendencia as unknown as { nombre?: string } | null)?.nombre ??
        null,
    }));
  }

  async findOne(id: string): Promise<FormularioInspeccionEmergencia> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    const inspeccion = await this.inspeccionEmergenciaModel.findById(id).exec();
    if (!inspeccion) {
      throw new NotFoundException(`Inspección con ID ${id} no encontrada`);
    }
    return inspeccion;
  }

  update(
    id: number,
    _updateInspeccionesEmergenciaDto: UpdateInspeccionesEmergenciaDto,
  ) {
    return `This action updates a #${id} inspeccionesEmergencia`;
  }

  remove(id: number) {
    return `This action removes a #${id} inspeccionesEmergencia`;
  }

  // En el archivo inspecciones-emergencia.service.ts
  async actualizarExtintoresPorTag(
    tag: string,
    extintores: any[],
    _area: string,
  ) {
    // Autocompletar vencidos
    await this.autoCompletarFormulariosVencidos();

    // El formulario activo del tag para el semestre en curso (este endpoint no recibe el mes).
    const formularioExistente = await this.validarEstadoActivo(
      tag,
      periodoDeMes(MESES[new Date().getMonth()]),
    );

    // Verificar extintores
    if (!extintores || extintores.length === 0) {
      throw new BadRequestException(
        'No se proporcionaron extintores para actualizar',
      );
    }
    // Extraer códigos de extintores para marcarlos como inspeccionados
    const codigosExtintores = extintores.map((extintor) => extintor.codigo);
    await this.extintorService.marcarExtintoresComoInspeccionados(
      codigosExtintores,
    );

    // Obtener el mes actual
    const mesActual = formularioExistente.mesActual;

    // Crear el objeto de actualización para añadir los extintores (no sobrescribir)
    const updateQuery = {
      $push: {
        [`meses.${mesActual}.inspeccionesExtintor`]: {
          $each: extintores, // Añade cada elemento del array
        },
      },
      $set: {
        fechaUltimaModificacion: new Date(), // Actualiza la fecha de última modificación
      },
    };

    // Actualizar el documento
    const resultado = await this.inspeccionEmergenciaModel.updateOne(
      { _id: (formularioExistente as unknown as { _id: unknown })._id },
      updateQuery,
    );

    if (resultado.matchedCount === 0) {
      throw new NotFoundException(
        `No se encontró un formulario activo con el tag: ${tag}`,
      );
    }

    return {
      success: true,
      message: 'Extintores añadidos correctamente',
      añadidos: extintores.length,
    };
  }

  async verificarInspecciones(area: string, mesActual: string) {
    // Validar que el mes sea válido
    const mesesValidos = [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ];

    if (!mesesValidos.includes(mesActual)) {
      throw new BadRequestException(`Mes no válido: ${mesActual}`);
    }

    // Construir y ejecutar la consulta
    const inspecciones = await this.inspeccionEmergenciaModel
      .find({
        area: { $regex: new RegExp(area, 'i') },
        mesActual: mesActual,
      })
      .select('tag') // Solo necesitamos el campo tag
      .lean()
      .exec();

    // Transformar los resultados al formato requerido
    return inspecciones.map((inspeccion) => ({
      tag: inspeccion.tag,
      inspeccionado: true,
    }));
  }
}
