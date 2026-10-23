import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CreatePlanAccionDto } from './dto/create-planes-accion.dto';
import { UpdatePlanAccionDto } from './dto/update-planes-accion.dto';
import { AddTareaDto } from './dto/add-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { AprobarPlanDto } from './dto/aprobar-plan.dto';
import { FilterQuery, Model, Types } from 'mongoose';
import { GenerarPlanesDto } from './dto/generar-planes.dto';
import { InstancesService } from '../instances/instances.service';
import { TemplatesService } from '../templates/templates.service';
import { InjectModel } from '@nestjs/mongoose';
import {
  PlanDeAccion,
  TareaObservacion,
  type TipoDeInspeccion,
} from './schemas/plan-accion.schema';
import { Instance } from '../instances/schemas/instance.schema';
import { ConfigService } from '@nestjs/config';
import {
  generarTareasDesdeInstancia,
  motivoSinObservaciones,
  type GenerarPlanOpciones,
  type PlanGeneradoDesdeInstancia,
} from './domain/generar-plan.logic';
import { validarActualizacionTarea } from './domain/tarea-update.validation';
import {
  cambiosDeTarea,
  faltantesParaEstado,
  mensajeDeFaltantes,
  type CambioDeCampo,
} from './domain/requisitos-tarea';
import { CorregirTareaDto } from './dto/corregir-tarea.dto';
import {
  calcularDiasRetraso,
  calcularMetadatos,
  ESTADO_CERRADO,
  soloTareasActivas,
  type EstadisticasDePlanes,
} from './domain/metadatos-plan';
import {
  planEsVisible,
  puedeVerPlanesSinAprobar,
} from './domain/visibilidad-plan';
import {
  alcanceDe,
  planDentroDelAlcance,
  type AlcanceDePlanes,
  type AreaDelMaestro,
} from './domain/alcance-plan';
import { Area } from '../area/schemas/area.schema';
import { Trabajador } from '../trabajadores/schemas/trabajador.schema';

/**
 * El criterio del plan que se crea solo al terminar una IRO: el mismo que el
 * botón «Generar desde inspección» trae marcado por defecto.
 */
const CRITERIO_AL_TERMINAR: GenerarPlanOpciones = {
  incluirPuntaje3: false,
  incluirSoloConComentario: true,
};

/** Un plan que no está dado de baja. */
const ACTIVO = { activo: { $ne: false } };

@Injectable()
export class PlanesAccionService implements OnModuleInit {
  private readonly logger = new Logger(PlanesAccionService.name);

  constructor(
    @InjectModel(PlanDeAccion.name)
    private planDeAccionModel: Model<PlanDeAccion>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<Area>,
    @InjectModel(Trabajador.name)
    private readonly trabajadorModel: Model<Trabajador>,
    @InjectModel(Instance.name)
    private readonly instanceModel: Model<Instance>,

    private readonly instancesService: InstancesService,
    private readonly templatesService: TemplatesService,
    private readonly configService: ConfigService,
  ) {}

  /** Cada IRO que se termina recibe su plan (o su «sin observaciones»). */
  onModuleInit(): void {
    this.instancesService.alTerminar((instanceId) =>
      this.generarAlTerminar(instanceId),
    );
  }

  private async cargarInspeccion(instanceId: string) {
    const instance = await this.instancesService.findOne(instanceId);

    const templateId =
      instance.templateId instanceof Types.ObjectId
        ? instance.templateId.toString()
        : instance.templateId;

    const template = await this.templatesService.findOne(templateId);
    return { instance, template, templateId };
  }

  /** Una IRO tiene un solo plan: el que se creó al terminarla o a mano. */
  private planDeLaInspeccion(instanceId: string) {
    return this.planDeAccionModel.findOne({ instanceId, ...ACTIVO }).exec();
  }

  private guardarPlan(
    instanceId: string,
    {
      metadatosOrganizacionales: {
        vicepresidencia,
        superintendenciaSenior,
        superintendencia,
        areaFisica,
      },
      tareas,
    }: PlanGeneradoDesdeInstancia,
    motivoSinObs?: string,
  ): Promise<PlanDeAccion> {
    const metadatos = calcularMetadatos(
      tareas as unknown as TareaObservacion[],
    );

    const plan = new this.planDeAccionModel({
      vicepresidencia,
      superintendenciaSenior,
      superintendencia,
      areaFisica,
      instanceId,
      tareas,
      ...metadatos,
      // Sin tareas, `calcularMetadatos` lo daría por «abierto»: este nace
      // cerrado, no hay nada que hacer.
      ...(motivoSinObs && {
        estado: ESTADO_CERRADO,
        sinObservaciones: true,
        motivoSinObservaciones: motivoSinObs,
      }),
      fechaCreacion: new Date(),
      fechaUltimaActualizacion: new Date(),
    });
    return plan.save();
  }

  /**
   * Lo que pasa al terminar una IRO: si tiene observaciones que cumplen el
   * criterio se crea el plan con sus tareas; si no, un plan cerrado «sin
   * observaciones» que dice por qué. Idempotente: si ya tiene plan, no hace
   * nada.
   *
   * Devuelve `null` cuando no puede decidir: si alguna sección de la
   * inspección ya no está en su plantilla, un «sin observaciones» podría
   * ocultar hallazgos que no se pudieron leer.
   */
  async generarAlTerminar(instanceId: string): Promise<PlanDeAccion | null> {
    const existente = await this.planDeLaInspeccion(instanceId);
    if (existente) return existente;

    const { instance, template, templateId } =
      await this.cargarInspeccion(instanceId);
    const resultado = generarTareasDesdeInstancia(
      instance,
      template,
      instanceId,
      CRITERIO_AL_TERMINAR,
    );

    if (resultado.seccionesSinPlantilla > 0) {
      this.logger.warn(
        `IRO ${instanceId} terminada: ${resultado.seccionesSinPlantilla} de ${instance.sections.length} secciones no existen en la plantilla ${templateId} (reparar con scripts/reparar-secciones-inspecciones.cjs)`,
      );
      if (resultado.tareas.length === 0) return null;
    }

    if (resultado.tareas.length > 0) {
      return this.guardarPlan(instanceId, resultado);
    }
    return this.guardarPlan(
      instanceId,
      resultado,
      motivoSinObservaciones(instance, CRITERIO_AL_TERMINAR),
    );
  }

  /**
   * 🔥 Genera UN PLAN con múltiples tareas desde una instancia
   */
  async generarPlanDesdeInstancia(
    instanceId: string,
    opciones: GenerarPlanesDto = {},
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(instanceId)) {
      throw new BadRequestException('ID de instancia inválido');
    }

    if (await this.planDeLaInspeccion(instanceId)) {
      throw new ConflictException('Esta inspección ya tiene su plan de acción');
    }

    const { instance, template, templateId } =
      await this.cargarInspeccion(instanceId);

    // Reglas de puntaje/clasificación puras — no tocan Mongoose.
    const resultado = generarTareasDesdeInstancia(
      instance,
      template,
      instanceId,
      opciones,
    );
    const { tareas: tareasGeneradas, seccionesSinPlantilla } = resultado;

    if (seccionesSinPlantilla > 0) {
      const total = instance.sections.length;
      if (tareasGeneradas.length === 0) {
        throw new BadRequestException(
          `${seccionesSinPlantilla} de ${total} secciones de esta inspección ya no existen en su plantilla (la plantilla se editó después de llenarla), así que no se pudieron revisar. Pida al administrador del sistema que repare la inspección.`,
        );
      }
      this.logger.warn(
        `Plan de la inspección ${instanceId}: ${seccionesSinPlantilla} de ${total} secciones no existen en la plantilla ${templateId} y no se revisaron (reparar con scripts/reparar-secciones-inspecciones.cjs)`,
      );
    }

    if (tareasGeneradas.length === 0) {
      throw new BadRequestException(
        'No se encontraron observaciones que cumplan los criterios',
      );
    }

    return this.guardarPlan(instanceId, resultado);
  }

  /**
   * 🆕 Agregar tarea a un plan existente
   */
  async addTarea(planId: string, tareaDto: AddTareaDto): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const nuevaTarea: TareaObservacion = {
      ...tareaDto,
      numeroItem: plan.tareas.length + 1,
      fechaHallazgo: new Date(tareaDto.fechaHallazgo),
      fechaCumplimientoAcordada: new Date(tareaDto.fechaCumplimientoAcordada),
      fechaCumplimientoEfectiva: tareaDto.fechaCumplimientoEfectiva
        ? new Date(tareaDto.fechaCumplimientoEfectiva)
        : undefined,
      // 🔥 Calcular días de retraso automáticamente
      diasRetraso: calcularDiasRetraso(
        new Date(tareaDto.fechaCumplimientoAcordada),
        tareaDto.fechaCumplimientoEfectiva
          ? new Date(tareaDto.fechaCumplimientoEfectiva)
          : undefined,
      ),
      estado: 'abierto',
      aprobado: false,
      evidencias: tareaDto.evidencias || [],
    } as TareaObservacion;

    plan.tareas.push(nuevaTarea);
    // Con una tarea deja de ser «sin observaciones»: vuelve a ser un plan como
    // los demás, con su estado según sus tareas.
    plan.sinObservaciones = false;
    plan.motivoSinObservaciones = undefined;

    const metadatos = calcularMetadatos(soloTareasActivas(plan.tareas));
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  /**
   * 🆕 Actualizar una tarea específica
   */
  async updateTarea(
    planId: string,
    tareaId: string,
    updateDto: UpdateTareaDto,
    usuario = 'desconocido',
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const tareaIndex = plan.tareas.findIndex(
      (t) => t._id && t._id.toString() === tareaId,
    );
    if (tareaIndex === -1) {
      throw new NotFoundException('Tarea no encontrada');
    }

    const tareaActual = plan.tareas[tareaIndex];

    if (tareaActual.activo === false) {
      throw new NotFoundException('Tarea no encontrada');
    }

    // Validación de estado/campos bloqueados + normalización — función pura,
    // no toca Mongoose. Recibe un objeto plano: al copiar un subdocumento con
    // `...` no vienen sus campos, sino los internos de Mongoose.
    const antes = this.comoObjeto(tareaActual);
    const { error, actualizacionProcesada } = validarActualizacionTarea(
      antes,
      updateDto,
    );
    if (error) {
      throw new BadRequestException(error.message);
    }

    const estadoAnterior = tareaActual.estado;

    // Aplicar cambios
    Object.assign(plan.tareas[tareaIndex], actualizacionProcesada);
    this.anotarEnHistorial(
      plan.tareas[tareaIndex],
      'avance',
      usuario,
      cambiosDeTarea(antes, actualizacionProcesada),
    );

    // Calcular días de retraso
    const tareaActualizada = plan.tareas[tareaIndex];
    if (tareaActualizada.fechaCumplimientoAcordada) {
      tareaActualizada.diasRetraso = calcularDiasRetraso(
        new Date(tareaActualizada.fechaCumplimientoAcordada),
        tareaActualizada.fechaCumplimientoEfectiva
          ? new Date(tareaActualizada.fechaCumplimientoEfectiva)
          : undefined,
      );
    }

    // Enviar feedback ML cuando cambia de "abierto" a "en-progreso" —
    // fire-and-forget, no bloquea la respuesta ni afecta la operación
    // principal si falla.
    if (
      estadoAnterior === 'abierto' &&
      updateDto.estado === 'en-progreso' &&
      updateDto.mlMetadata
    ) {
      this.enviarFeedbackML({
        question_text: tareaActual.questionText || '',
        current_response: 0, // Asumimos crítico (puntaje bajo)
        comment: tareaActual.descripcionObservacion,
        accion_seleccionada: tareaActualizada.accionPropuesta || '',
        fue_recomendacion_ml:
          updateDto.mlMetadata.fue_recomendacion_ml || false,
        indice_recomendacion: updateDto.mlMetadata.indice_recomendacion,
        recomendaciones_originales:
          updateDto.mlMetadata.recomendaciones_originales,
        context: {
          familia_peligro: tareaActualizada.familiaPeligro,
          area: plan.areaFisica,
          empresa: tareaActual.empresa,
          vicepresidencia: plan.vicepresidencia,
          superintendencia: plan.superintendencia,
        },
        feedback_type: 'guardado',
        feedback_score: updateDto.mlMetadata.fue_recomendacion_ml ? 1.0 : 0.5,
      }).catch((error) => {
        this.logger.warn(
          `Error enviando feedback ML (no crítico): ${error.message}`,
        );
      });
    }

    // Recalcular metadatos del plan (solo tareas activas)
    const metadatos = calcularMetadatos(soloTareasActivas(plan.tareas));
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();

    plan.markModified('tareas');

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  private async enviarFeedbackML(feedback: {
    question_text: string;
    current_response: number;
    comment: string;
    accion_seleccionada: string;
    fue_recomendacion_ml: boolean;
    indice_recomendacion?: number;
    recomendaciones_originales?: string[];
    context: {
      familia_peligro?: string;
      area?: string;
      empresa?: string;
      vicepresidencia?: string;
      superintendencia?: string;
    };
    feedback_type: string;
    feedback_score: number;
  }): Promise<void> {
    try {
      const mlServiceUrl = this.configService.get<string>(
        'ML_SERVICE_URL',
        'http://localhost:8000',
      );

      const response = await fetch(`${mlServiceUrl}/api/ml/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedback),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Error enviando feedback al ML Service: ${errorText}`,
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      await response.json();
    } catch (error) {
      this.logger.error(
        `Error conectando con ML Service: ${(error as Error).message}`,
      );
      // No bloqueamos la operación principal si falla el feedback
      throw error; // Re-lanzar para que el catch externo lo maneje
    }
  }
  // ==========================================
  // NUEVO MÉTODO AUXILIAR: Calcular días de retraso
  // ==========================================

  /**
   * 🆕 Dar de baja una tarea (baja lógica, nunca se elimina físicamente)
   */
  async deleteTarea(planId: string, tareaId: string): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const tarea = plan.tareas.find(
      (t) => t._id && t._id.toString() === tareaId,
    );

    if (!tarea || tarea.activo === false) {
      throw new NotFoundException('Tarea no encontrada');
    }

    tarea.activo = false;

    // Renumerar solo las tareas activas
    const tareasActivas = soloTareasActivas(plan.tareas);
    tareasActivas.forEach((t, index) => {
      t.numeroItem = index + 1;
    });

    const metadatos = calcularMetadatos(tareasActivas);
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();
    plan.markModified('tareas');

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  /**
   * 🆕 Aprobar una tarea
   */
  async approveTarea(
    planId: string,
    tareaId: string,
    usuario = 'desconocido',
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const tareaIndex = plan.tareas.findIndex(
      (t) => t._id && t._id.toString() === tareaId,
    );

    if (tareaIndex === -1) {
      throw new NotFoundException('Tarea no encontrada');
    }

    const tarea = plan.tareas[tareaIndex];

    if (tarea.activo === false) {
      throw new NotFoundException('Tarea no encontrada');
    }

    // 🔥 VALIDACIÓN: Solo se puede aprobar si está cerrada
    if (tarea.estado !== 'cerrado') {
      throw new BadRequestException(
        'Solo se pueden aprobar tareas en estado "cerrado"',
      );
    }

    // 🔥 VALIDACIÓN: Debe tener fecha de cumplimiento efectiva
    if (!tarea.fechaCumplimientoEfectiva) {
      throw new BadRequestException(
        'La tarea debe tener una fecha de cumplimiento efectiva para ser aprobada',
      );
    }

    tarea.aprobado = true;
    this.anotarEnHistorial(tarea, 'aprobacion', usuario, [
      { campo: 'aprobado', antes: 'No', despues: 'Sí' },
    ]);
    plan.tareas[tareaIndex] = tarea;
    plan.markModified('tareas');

    plan.fechaUltimaActualizacion = new Date();

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  /**
   * 🆕 Aprobación global del plan por parte del Superintendente (o Admin).
   * Es un eje independiente del `aprobado` por tarea: mientras no esté en
   * estado 'aprobado', el plan no debe ser visible para el Supervisor
   * (ver `esAdminOSuperintendente` en findAll/findOne).
   */
  async aprobarGlobal(
    planId: string,
    usuario: string,
    dto: AprobarPlanDto,
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan || plan.activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    if (plan.estadoAprobacion === 'aprobado') {
      throw new BadRequestException('El plan ya fue aprobado');
    }

    const estadoAnterior = plan.estadoAprobacion;
    plan.estadoAprobacion = 'aprobado';
    plan.aprobadoPor = usuario;
    plan.fechaAprobacion = new Date();
    plan.observacionesAprobacion = dto.observaciones;
    plan.historialAprobacion.push({
      usuario,
      fecha: new Date(),
      estadoAnterior,
      estadoNuevo: 'aprobado',
      observaciones: dto.observaciones,
    });
    plan.fechaUltimaActualizacion = new Date();
    plan.markModified('historialAprobacion');

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  /**
   * Un Supervisor (sin ser también Admin o Superintendente) nunca debe
   * poder ver un plan cuyo `estadoAprobacion` no sea 'aprobado'.
   */
  // ==========================================
  // MÉTODOS AUXILIARES
  // ==========================================

  /**
   * Quita del array `tareas` las que están dadas de baja (activo === false)
   * antes de devolver el plan al frontend — nunca se eliminan físicamente,
   * solo dejan de mostrarse.
   */
  /**
   * Corrección del admin: cambia los datos de la tarea y su estado, también
   * hacia atrás (si se cargó mal, se puede volver a «abierto» o «en
   * progreso»). Pide un motivo y queda en el historial con lo que había antes.
   *
   * Lo que no puede es dejar la tarea en un estado sin los datos que ese
   * estado exige: corregir no es saltarse las reglas. Si la tarea estaba
   * aprobada y deja de estar cerrada, pierde la aprobación.
   */
  async corregirTarea(
    planId: string,
    tareaId: string,
    dto: CorregirTareaDto,
    usuario = 'desconocido',
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }
    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan || plan.activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }
    const indice = plan.tareas.findIndex(
      (t) => t._id?.toString() === tareaId && t.activo !== false,
    );
    if (indice === -1) {
      throw new NotFoundException('Tarea no encontrada');
    }

    const tarea = plan.tareas[indice];
    const antes = this.comoObjeto(tarea);
    const { motivo, ...campos } = dto;

    const cambiosPedidos: Record<string, unknown> = { ...campos };
    for (const fecha of [
      'fechaCumplimientoAcordada',
      'fechaCumplimientoEfectiva',
    ] as const) {
      if (campos[fecha] === '') cambiosPedidos[fecha] = undefined;
      else if (campos[fecha]) cambiosPedidos[fecha] = new Date(campos[fecha]);
    }

    const destino = campos.estado ?? antes.estado;
    const faltan = faltantesParaEstado(
      { ...antes, ...cambiosPedidos },
      destino,
    );
    if (faltan.length > 0) {
      throw new BadRequestException(mensajeDeFaltantes(destino, faltan));
    }
    if (antes.aprobado && destino !== 'cerrado') {
      cambiosPedidos.aprobado = false;
    }

    const cambios = cambiosDeTarea(antes, cambiosPedidos);
    if (cambios.length === 0) {
      throw new BadRequestException('La corrección no cambia nada');
    }

    Object.assign(tarea, cambiosPedidos);
    tarea.diasRetraso = tarea.fechaCumplimientoAcordada
      ? calcularDiasRetraso(
          new Date(tarea.fechaCumplimientoAcordada),
          tarea.fechaCumplimientoEfectiva
            ? new Date(tarea.fechaCumplimientoEfectiva)
            : undefined,
        )
      : 0;
    this.anotarEnHistorial(tarea, 'correccion', usuario, cambios, motivo);

    Object.assign(plan, calcularMetadatos(soloTareasActivas(plan.tareas)));
    plan.fechaUltimaActualizacion = new Date();
    plan.markModified('tareas');
    await plan.save();

    this.logger.log(
      `Tarea ${tareaId} del plan ${planId} corregida por ${usuario}: ${cambios.map((c) => c.campo).join(', ')}`,
    );
    return this.sanitizeTareas(plan);
  }

  /** La tarea como objeto plano (sin los internos de Mongoose). */
  private comoObjeto(tarea: TareaObservacion): TareaObservacion {
    const conToObject = tarea as TareaObservacion & {
      toObject?: () => TareaObservacion;
    };
    return conToObject.toObject ? conToObject.toObject() : { ...tarea };
  }

  private anotarEnHistorial(
    tarea: TareaObservacion,
    tipo: 'avance' | 'correccion' | 'aprobacion',
    usuario: string,
    cambios: CambioDeCampo[],
    motivo?: string,
  ): void {
    if (cambios.length === 0) return;
    tarea.historial = [
      ...(tarea.historial ?? []),
      { fecha: new Date(), usuario, tipo, cambios, motivo },
    ];
  }

  private sanitizeTareas<T extends { tareas: TareaObservacion[] }>(plan: T): T {
    plan.tareas = soloTareasActivas(plan.tareas);
    return plan;
  }

  /**
   * 📊 Calcular metadatos del plan basado en sus tareas
   */
  // ==========================================
  // MÉTODOS CRUD DE PLANES (sin cambios)
  // ==========================================

  async create(createDto: CreatePlanAccionDto): Promise<PlanDeAccion> {
    const tareas: TareaObservacion[] = (createDto.tareas || []).map(
      (t, index) =>
        ({
          ...t,
          numeroItem: index + 1,
          fechaHallazgo: new Date(t.fechaHallazgo),
          fechaCumplimientoAcordada: new Date(t.fechaCumplimientoAcordada),
          fechaCumplimientoEfectiva: t.fechaCumplimientoEfectiva
            ? new Date(t.fechaCumplimientoEfectiva)
            : undefined,
          diasRetraso: 0,
          estado: 'abierto',
          aprobado: false,
        }) as TareaObservacion,
    );

    const metadatos = calcularMetadatos(tareas);

    const planData = {
      ...createDto,
      tareas,
      ...metadatos,
      fechaCreacion: new Date(),
      fechaUltimaActualizacion: new Date(),
    };

    const plan = new this.planDeAccionModel(planData);
    return await plan.save();
  }

  async findAll(
    filters?: {
      estado?: string;
      vicepresidencia?: string;
      superintendencia?: string;
      areaFisica?: string;
    },
    requesterRoles?: string[],
    username?: string,
  ): Promise<PlanDeAccion[]> {
    const query: FilterQuery<PlanDeAccion> = { activo: { $ne: false } };

    if (filters?.estado) {
      query.estado = filters.estado;
    }
    if (filters?.vicepresidencia) {
      query.vicepresidencia = filters.vicepresidencia;
    }
    if (filters?.superintendencia) {
      query.superintendencia = filters.superintendencia;
    }
    if (filters?.areaFisica) {
      query.areaFisica = filters.areaFisica;
    }

    // 🔒 Barrera de seguridad server-side: quien no sea Admin/Superintendente
    // nunca recibe planes pendientes de aprobación global (los «sin
    // observaciones» no esperan aprobación: ver `planEsVisible`).
    if (!puedeVerPlanesSinAprobar(requesterRoles)) {
      query.$or = [
        { estadoAprobacion: 'aprobado' },
        { sinObservaciones: true },
      ];
    }

    const [planes, alcance] = await Promise.all([
      this.planDeAccionModel.find(query).sort({ fechaCreacion: -1 }).exec(),
      this.alcanceDe(requesterRoles, username),
    ]);

    // 🔒 Segunda barrera: solo los planes de su lugar en la organización.
    // Se filtra aquí y no en la consulta porque el área del plan es texto
    // libre y se compara normalizado.
    const visibles = planes.filter((p) => planDentroDelAlcance(p, alcance));
    const tipos = await this.tiposDeInspeccion(visibles);
    return visibles.map((p) =>
      this.sanitizeTareas({
        ...p.toObject(),
        tipoInspeccion: p.instanceId ? tipos.get(p.instanceId) : undefined,
      }),
    );
  }

  /**
   * De qué IRO o ISOP sale cada plan: la plantilla de su inspección. Se
   * deduce al listar (una consulta para todos) y no se guarda en el plan, así
   * los planes que ya existen lo tienen sin migrar nada.
   */
  private async tiposDeInspeccion(
    planes: { instanceId?: string }[],
  ): Promise<Map<string, TipoDeInspeccion>> {
    const ids = [
      ...new Set(
        planes
          .map((p) => p.instanceId)
          .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
      ),
    ];
    if (ids.length === 0) return new Map();

    const instancias = await this.instanceModel
      .find({ _id: { $in: ids } })
      .select('templateId')
      .populate({ path: 'templateId', select: 'code name' })
      .lean()
      .exec();

    const tipos = new Map<string, TipoDeInspeccion>();
    for (const i of instancias) {
      const plantilla = i.templateId as unknown as {
        code?: string;
        name?: string;
      } | null;
      if (plantilla?.code) {
        tipos.set(String(i._id), {
          codigo: plantilla.code,
          nombre: plantilla.name ?? plantilla.code,
        });
      }
    }
    return tipos;
  }

  /**
   * Qué planes le tocan a quien pregunta: su área y superintendencia salen de
   * su ficha de trabajador; las áreas de una superintendencia, del maestro.
   */
  private async alcanceDe(
    roles?: string[],
    username?: string,
  ): Promise<AlcanceDePlanes> {
    const sinMaestro = alcanceDe({ roles, username }, []);
    if (sinMaestro.todo) return sinMaestro;

    const [trabajador, areas] = await Promise.all([
      username
        ? this.trabajadorModel
            .findOne({ username })
            .select('area superintendencia')
            .lean()
            .exec()
        : null,
      this.areaModel
        .find({ activo: { $ne: false } })
        .select('nombre superintendencia')
        .populate({ path: 'superintendencia', select: 'nombre' })
        .lean()
        .exec(),
    ]);

    if (!trabajador) {
      this.logger.warn(
        `«${username ?? 'sin usuario'}» no tiene ficha de trabajador: solo ve los planes con tareas a su cargo`,
      );
    }

    const maestro: AreaDelMaestro[] = areas.map((a) => ({
      area: a.nombre,
      superintendencia:
        (a.superintendencia as unknown as { nombre?: string } | null)?.nombre ??
        null,
    }));
    return alcanceDe(
      {
        roles,
        username,
        area: trabajador?.area,
        superintendencia: trabajador?.superintendencia,
      },
      maestro,
    );
  }

  async findOne(
    id: string,
    requesterRoles?: string[],
    username?: string,
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const plan = await this.planDeAccionModel.findById(id).exec();

    if (!plan || plan.activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    // 🔒 Mismas barreras que en findAll, aplicadas al acceso directo por ID.
    if (!planEsVisible(plan, requesterRoles)) {
      throw new ForbiddenException(
        'Este plan aún no fue aprobado por el Superintendente',
      );
    }
    if (
      !planDentroDelAlcance(
        plan,
        await this.alcanceDe(requesterRoles, username),
      )
    ) {
      throw new ForbiddenException('Este plan no es de su área');
    }

    return this.sanitizeTareas(plan);
  }

  async update(
    id: string,
    updateDto: UpdatePlanAccionDto,
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const plan = await this.planDeAccionModel.findById(id);
    if (!plan || plan.activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    Object.assign(plan, updateDto);
    plan.fechaUltimaActualizacion = new Date();

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  /**
   * Baja lógica del plan — nunca se elimina físicamente de la base de datos.
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const plan = await this.planDeAccionModel.findById(id);
    if (!plan || plan.activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    plan.activo = false;
    plan.fechaUltimaActualizacion = new Date();
    await plan.save();
  }

  /**
   * Obtener estadísticas globales
   */
  async getStats(): Promise<EstadisticasDePlanes> {
    // Los «sin observaciones» no cuentan: nacen cerrados sin que nadie cerrara
    // nada, e inflarían la tasa de cierre.
    const activoFilter = {
      activo: { $ne: false },
      sinObservaciones: { $ne: true },
    };
    const [total, abiertos, enProgreso, cerrados] = await Promise.all([
      this.planDeAccionModel.countDocuments(activoFilter).exec(),
      this.planDeAccionModel
        .countDocuments({ ...activoFilter, estado: 'abierto' })
        .exec(),
      this.planDeAccionModel
        .countDocuments({ ...activoFilter, estado: 'en-progreso' })
        .exec(),
      this.planDeAccionModel
        .countDocuments({ ...activoFilter, estado: 'cerrado' })
        .exec(),
    ]);

    const planes = await this.planDeAccionModel.find(activoFilter).exec();
    const sumaPorcentajes = planes.reduce(
      (acc, plan) => acc + plan.porcentajeCierre,
      0,
    );
    const porcentajeCierre =
      total > 0 ? Math.round(sumaPorcentajes / total) : 0;

    return {
      totalPlanes: total,
      planesAbiertos: abiertos,
      planesEnProgreso: enProgreso,
      planesCerrados: cerrados,
      porcentajeCierre,
    };
  }
}
