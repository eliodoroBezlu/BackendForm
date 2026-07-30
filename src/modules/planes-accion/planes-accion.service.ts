import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePlanAccionDto } from './dto/create-planes-accion.dto';
import { UpdatePlanAccionDto } from './dto/update-planes-accion.dto';
import { AddTareaDto } from './dto/add-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { AprobarPlanDto } from './dto/aprobar-plan.dto';
import { Model, Types } from 'mongoose';
import { GenerarPlanesDto } from './dto/generar-planes.dto';
import { InstancesService } from '../instances/instances.service';
import { TemplatesService } from '../templates/templates.service';
import { InjectModel } from '@nestjs/mongoose';
import { PlanDeAccion, TareaObservacion } from './schemas/plan-accion.schema';
import { ConfigService } from '@nestjs/config';
import { generarTareasDesdeInstancia } from './domain/generar-plan.logic';
import { validarActualizacionTarea } from './domain/tarea-update.validation';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class PlanesAccionService {
  private readonly logger = new Logger(PlanesAccionService.name);

  constructor(
    @InjectModel(PlanDeAccion.name)
    private planDeAccionModel: Model<PlanDeAccion>,

    private readonly instancesService: InstancesService,
    private readonly templatesService: TemplatesService,
    private readonly configService: ConfigService,
  ) {}

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

    const instance = await this.instancesService.findOne(instanceId);

    const templateId =
      instance.templateId instanceof Types.ObjectId
        ? instance.templateId.toString()
        : instance.templateId;

    const template = await this.templatesService.findOne(templateId);

    // Reglas de puntaje/clasificación puras — no tocan Mongoose.
    const {
      metadatosOrganizacionales: {
        vicepresidencia,
        superintendenciaSenior,
        superintendencia,
        areaFisica,
      },
      tareas: tareasGeneradas,
    } = generarTareasDesdeInstancia(instance, template, instanceId, opciones);

    if (tareasGeneradas.length === 0) {
      throw new BadRequestException(
        'No se encontraron observaciones que cumplan los criterios',
      );
    }

    const metadatos = this.calcularMetadatos(
      tareasGeneradas as unknown as TareaObservacion[],
    );

    const planData = {
      vicepresidencia,
      superintendenciaSenior,
      superintendencia,
      areaFisica,
      instanceId: instanceId,
      tareas: tareasGeneradas,
      ...metadatos,
      fechaCreacion: new Date(),
      fechaUltimaActualizacion: new Date(),
    };

    const plan = new this.planDeAccionModel(planData);
    return plan.save();
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
      diasRetraso: this.calcularDiasRetraso(
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

    const metadatos = this.calcularMetadatos(
      plan.tareas.filter((t) => (t as any).activo !== false),
    );
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
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const tareaIndex = plan.tareas.findIndex(
      (t) => (t as any)._id && (t as any)._id.toString() === tareaId,
    );
    if (tareaIndex === -1) {
      throw new NotFoundException('Tarea no encontrada');
    }

    const tareaActual = plan.tareas[tareaIndex];

    if ((tareaActual as any).activo === false) {
      throw new NotFoundException('Tarea no encontrada');
    }

    // Validación de estado/campos bloqueados + normalización — función pura,
    // no toca Mongoose.
    const { error, actualizacionProcesada } = validarActualizacionTarea(
      tareaActual,
      updateDto,
    );
    if (error) {
      throw new BadRequestException(error.message);
    }

    const estadoAnterior = tareaActual.estado;

    // Aplicar cambios
    Object.assign(plan.tareas[tareaIndex], actualizacionProcesada);

    // Calcular días de retraso
    const tareaActualizada = plan.tareas[tareaIndex];
    if (tareaActualizada.fechaCumplimientoAcordada) {
      tareaActualizada.diasRetraso = this.calcularDiasRetraso(
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
    const metadatos = this.calcularMetadatos(
      plan.tareas.filter((t) => (t as any).activo !== false),
    );
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

  private calcularDiasRetraso(
    fechaAcordada: Date,
    fechaEfectiva?: Date,
  ): number {
    if (!fechaEfectiva) return 0;

    const acordada = new Date(fechaAcordada);
    const efectiva = new Date(fechaEfectiva);

    // Normalizar a medianoche para comparación exacta
    acordada.setHours(0, 0, 0, 0);
    efectiva.setHours(0, 0, 0, 0);

    const diffTime = efectiva.getTime() - acordada.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Solo contar como retraso si es positivo
    return Math.max(0, diffDays);
  }

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

    const tarea = plan.tareas.find((t) => {
      const tt = t as any;
      return tt._id && tt._id.toString() === tareaId;
    });

    if (!tarea || (tarea as any).activo === false) {
      throw new NotFoundException('Tarea no encontrada');
    }

    (tarea as any).activo = false;

    // Renumerar solo las tareas activas
    const tareasActivas = plan.tareas.filter(
      (t) => (t as any).activo !== false,
    );
    tareasActivas.forEach((t, index) => {
      t.numeroItem = index + 1;
    });

    const metadatos = this.calcularMetadatos(tareasActivas);
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();
    plan.markModified('tareas');

    await plan.save();

    return this.sanitizeTareas(plan);
  }

  /**
   * 🆕 Aprobar una tarea
   */
  async approveTarea(planId: string, tareaId: string): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    const tareaIndex = plan.tareas.findIndex(
      (t) => (t as any)._id && (t as any)._id.toString() === tareaId,
    );

    if (tareaIndex === -1) {
      throw new NotFoundException('Tarea no encontrada');
    }

    const tarea = plan.tareas[tareaIndex];

    if ((tarea as any).activo === false) {
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
    plan.tareas[tareaIndex] = tarea;

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
    if (!plan || (plan as any).activo === false) {
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
  private esAdminOSuperintendente(roles?: string[]): boolean {
    return (
      !!roles &&
      (roles.includes(Role.ADMIN) || roles.includes(Role.SUPERINTENDENTE))
    );
  }

  // ==========================================
  // MÉTODOS AUXILIARES
  // ==========================================

  /**
   * Quita del array `tareas` las que están dadas de baja (activo === false)
   * antes de devolver el plan al frontend — nunca se eliminan físicamente,
   * solo dejan de mostrarse.
   */
  private sanitizeTareas(plan: any): PlanDeAccion {
    plan.tareas = (plan.tareas || []).filter((t: any) => t.activo !== false);
    return plan;
  }

  /**
   * 📊 Calcular metadatos del plan basado en sus tareas
   */
  private calcularMetadatos(tareas: TareaObservacion[]) {
    const totalTareas = tareas.length;
    const tareasAbiertas = tareas.filter((t) => t.estado === 'abierto').length;
    const tareasEnProgreso = tareas.filter(
      (t) => t.estado === 'en-progreso',
    ).length;
    const tareasCerradas = tareas.filter((t) => t.estado === 'cerrado').length;
    const porcentajeCierre =
      totalTareas > 0 ? Math.round((tareasCerradas / totalTareas) * 100) : 0;

    // 🔥 LÓGICA MEJORADA: Todas las tareas deben estar en progreso para que el plan esté en progreso
    let estado: string;
    if (tareasCerradas === totalTareas && totalTareas > 0) {
      estado = 'cerrado';
    } else if (tareasEnProgreso > 0 || tareasCerradas > 0) {
      estado = 'en-progreso';
    } else {
      estado = 'abierto';
    }

    return {
      totalTareas,
      tareasAbiertas,
      tareasEnProgreso,
      tareasCerradas,
      porcentajeCierre,
      estado,
    };
  }
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

    const metadatos = this.calcularMetadatos(tareas);

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
  ): Promise<PlanDeAccion[]> {
    const query: any = { activo: { $ne: false } };

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
    // nunca recibe planes pendientes de aprobación global.
    if (!this.esAdminOSuperintendente(requesterRoles)) {
      query.estadoAprobacion = 'aprobado';
    }

    const planes = await this.planDeAccionModel
      .find(query)
      .sort({ fechaCreacion: -1 })
      .exec();

    return planes.map((p) => this.sanitizeTareas(p));
  }

  async findOne(id: string, requesterRoles?: string[]): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const plan = await this.planDeAccionModel.findById(id).exec();

    if (!plan || (plan as any).activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    // 🔒 Misma barrera que en findAll, aplicada al acceso directo por ID.
    if (
      !this.esAdminOSuperintendente(requesterRoles) &&
      plan.estadoAprobacion !== 'aprobado'
    ) {
      throw new ForbiddenException(
        'Este plan aún no fue aprobado por el Superintendente',
      );
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
    if (!plan || (plan as any).activo === false) {
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
    if (!plan || (plan as any).activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    (plan as any).activo = false;
    plan.fechaUltimaActualizacion = new Date();
    await plan.save();
  }

  /**
   * Obtener estadísticas globales
   */
  async getStats(): Promise<any> {
    const activoFilter = { activo: { $ne: false } };
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
