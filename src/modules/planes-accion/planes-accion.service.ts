import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePlanAccionDto } from './dto/create-planes-accion.dto';
import { UpdatePlanAccionDto } from './dto/update-planes-accion.dto';
import { AddTareaDto } from './dto/add-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { Model, Types } from 'mongoose';
import { GenerarPlanesDto } from './dto/generar-planes.dto';
import { InstancesService } from '../instances/instances.service';
import { TemplatesService } from '../templates/templates.service';
import { InjectModel } from '@nestjs/mongoose';
import { PlanDeAccion, TareaObservacion } from './schemas/plan-accion.schema';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PlanesAccionService {
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

    const tareasGeneradas: TareaObservacion[] = [];
    let numeroItem = 0;

    const sectionsMap = this.crearMapaSecciones(template.sections);
    const verificationMap = this.convertToMap(instance.verificationList);

    console.log(
      '🔍 DEBUG - verificationList ORIGINAL:',
      instance.verificationList,
    );
    console.log(
      '🔍 DEBUG - verificationMap entries:',
      Array.from(verificationMap.entries()),
    );

    const vicepresidencia =
      verificationMap.get('Vicepresidencia') ||
      verificationMap.get('Gerencia') ||
      verificationMap.get('Gerencia / Vicepresidencia') ||
      'Vicepresidencia no especificada';

    const superintendenciaSenior =
      verificationMap.get('Superintendencia Senior') ||
      verificationMap.get('Superintendencia Sénior') ||
      verificationMap.get('Sup. Senior') ||
      'Superintendencia Senior no especificada';

    const superintendencia =
      verificationMap.get('Superintendencia') ||
      verificationMap.get('Sup.') ||
      'Superintendencia no especificada';

    const areaFisica =
      verificationMap.get('Área') ||
      verificationMap.get('Area') ||
      verificationMap.get('Área Física') ||
      verificationMap.get('Lugar') ||
      'Área no especificada';

    const empresa =
      verificationMap.get('Empresa') ||
      verificationMap.get('Compañía') ||
      'MSC';

    console.log('✅ DATOS EXTRAÍDOS:', {
      vicepresidencia,
      superintendenciaSenior,
      superintendencia,
      areaFisica,
      empresa,
    });

    // Generar tareas
    for (const section of instance.sections) {
      console.log(`🔍 Procesando sección con ID: ${section.sectionId}`);

      const sectionInfo = sectionsMap.get(section.sectionId);

      if (!sectionInfo) {
        console.warn(
          `⚠️ Sección ${section.sectionId} no encontrada en template`,
        );
        continue;
      }

      console.log(`✅ Sección encontrada: "${sectionInfo.title}"`);

      for (const question of section.questions) {
        console.log(`  🔎 Procesando pregunta: "${question.questionText}"`);

        const puntaje = this.extraerPuntaje(question.response);
        console.log(`    Puntaje extraído: ${puntaje}`);

        if (puntaje === null) {
          console.log(`    ❌ Puntaje nulo o inválido. Saltando pregunta.`);
          continue;
        }

        const necesitaPlan = this.requierePlanDeAccion(
          puntaje,
          question.comment,
          opciones,
        );
        console.log(`    ¿Requiere plan de acción? ${necesitaPlan}`);

        if (!necesitaPlan) {
          continue;
        }

        numeroItem++;
        console.log(`    ✅ Generando tarea de observación #${numeroItem}`);

        const tarea: TareaObservacion = {
          numeroItem,
          fechaHallazgo: instance.createdAt || new Date(),
          responsableObservacion:
            instance.verificationList.get('Supervisor') || 'No asignado',
          empresa: empresa,
          lugarFisico: areaFisica,
          actividad: template.name || 'Actividad no especificada',
          familiaPeligro: this.determinarFamiliaPeligro(sectionInfo.title),
          descripcionObservacion: question.comment || question.questionText,

          // 🔥 CAMBIO PRINCIPAL: accionPropuesta ahora viene VACÍA
          accionPropuesta: '', // ← Usuario la completará manualmente con ayuda de ML

          responsableAreaCierre:
            instance.verificationList.get('Supervisor') || 'No asignado',
          diasRetraso: 0,
          estado: 'abierto',
          aprobado: false,

          // Trazabilidad
          instanceId: instanceId,
          sectionId: section.sectionId,
          sectionTitle: sectionInfo.title,
          questionText: question.questionText,
        } as TareaObservacion;

        console.log(`    📝 Tarea generada:`, tarea);
        tareasGeneradas.push(tarea);
      }
    }

    console.log(`✅ Total de tareas generadas: ${tareasGeneradas.length}`);

    if (tareasGeneradas.length === 0) {
      throw new BadRequestException(
        'No se encontraron observaciones que cumplan los criterios',
      );
    }

    // Crear el plan con todas las tareas
    const metadatos = this.calcularMetadatos(tareasGeneradas);

    const planData = {
      vicepresidencia,
      superintendenciaSenior,
      superintendencia,
      areaFisica,
      tareas: tareasGeneradas,
      ...metadatos,
      fechaCreacion: new Date(),
      fechaUltimaActualizacion: new Date(),
    };

    const plan = new this.planDeAccionModel(planData);
    const planGuardado = await plan.save();

    console.log(`✅ Plan creado con ${tareasGeneradas.length} tareas`);
    return planGuardado;
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

    const metadatos = this.calcularMetadatos(plan.tareas);
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();

    return await plan.save();
  }

  /**
   * 🆕 Actualizar una tarea específica
   */
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

    // 🔥 VALIDACIÓN: No permitir editar si está aprobada
    if (tareaActual.aprobado) {
      throw new BadRequestException('No se puede editar una tarea aprobada');
    }

    // 🔥 CAMPOS BLOQUEADOS para tareas generadas desde inspección
    const camposBloqueados = [
      'fechaHallazgo',
      'responsableObservacion',
      'empresa',
      'lugarFisico',
      'actividad',
      'descripcionObservacion',
    ];

    // 🔥 VALIDACIÓN: Si viene de inspección, solo permitir campos editables
    if (tareaActual.instanceId) {
      const camposEnviados = Object.keys(updateDto);
      const intentoCambiarBloqueado = camposEnviados.some(
        (campo) => camposBloqueados.includes(campo)
      );

      if (intentoCambiarBloqueado) {
        throw new BadRequestException(
          `No se pueden modificar los siguientes campos en tareas generadas desde inspección: ${camposBloqueados.join(', ')}`
        );
      }
    }

    // 🔥 CAPTURAR ESTADO ANTERIOR para detectar cambios
    const estadoAnterior = tareaActual.estado;

    // 🔥 Procesar actualización
    const actualizacionProcesada: any = { ...updateDto };
    
    // Convertir fechas
    if (updateDto.fechaCumplimientoAcordada) {
      actualizacionProcesada.fechaCumplimientoAcordada = new Date(updateDto.fechaCumplimientoAcordada);
    }
    if (updateDto.fechaCumplimientoEfectiva) {
      actualizacionProcesada.fechaCumplimientoEfectiva = new Date(updateDto.fechaCumplimientoEfectiva);
    }

    // Procesar evidencias si vienen en el DTO
    if (updateDto.evidencias !== undefined) {
      actualizacionProcesada.evidencias = updateDto.evidencias
        .filter(ev => ev && ev.nombre && ev.url)
        .map(ev => ({
          nombre: String(ev.nombre).trim(),
          url: String(ev.url).trim()
        }));
    }

    // 🔥 VALIDACIONES DE CAMBIO DE ESTADO
    if (updateDto.estado) {
      const tareaConCambios = { ...tareaActual, ...actualizacionProcesada };

      if (updateDto.estado === 'en-progreso') {
        if (!tareaConCambios.familiaPeligro || 
            !tareaConCambios.accionPropuesta || 
            !tareaConCambios.responsableAreaCierre ||
            !tareaConCambios.fechaCumplimientoAcordada) {
          throw new BadRequestException(
            'Para pasar a "en-progreso", la tarea debe tener: Familia de Peligro, Acción Propuesta, Responsable y Fecha Acordada'
          );
        }
      }

      if (updateDto.estado === 'cerrado') {
        if (!tareaConCambios.fechaCumplimientoEfectiva) {
          throw new BadRequestException(
            'Para cerrar la tarea, debe tener una Fecha de Cumplimiento Efectiva'
          );
        }
      }
    }

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

    // 🔥 NUEVO: Enviar feedback cuando cambia de "abierto" a "en-progreso"
    if (estadoAnterior === 'abierto' && updateDto.estado === 'en-progreso') {
      if (updateDto.mlMetadata) {
        console.log('🔥 Detectado cambio a "en-progreso" - Enviando feedback ML...');
        
        // No esperar el feedback para no bloquear la respuesta
        this.enviarFeedbackML({
          question_text: tareaActual.questionText || '',
          current_response: 0, // Asumimos crítico (puntaje bajo)
          comment: tareaActual.descripcionObservacion,
          accion_seleccionada: tareaActualizada.accionPropuesta || '',
          fue_recomendacion_ml: updateDto.mlMetadata.fue_recomendacion_ml || false,
          indice_recomendacion: updateDto.mlMetadata.indice_recomendacion,
          recomendaciones_originales: updateDto.mlMetadata.recomendaciones_originales,
          context: {
            familia_peligro: tareaActualizada.familiaPeligro,
            area: plan.areaFisica,
            empresa: tareaActual.empresa,
            vicepresidencia: plan.vicepresidencia,
            superintendencia: plan.superintendencia,
          },
          feedback_type: 'guardado',
          feedback_score: updateDto.mlMetadata.fue_recomendacion_ml ? 1.0 : 0.5,
        }).catch(error => {
          // Log del error pero no afectar la operación principal
          console.error('⚠️ Error enviando feedback (no crítico):', error.message);
        });
      }
    }

    // Recalcular metadatos del plan
    const metadatos = this.calcularMetadatos(plan.tareas);
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();

    plan.markModified('tareas');

    return await plan.save();
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

      console.log('📤 Enviando feedback a ML Service:', mlServiceUrl);
      console.log('📊 Datos del feedback:', JSON.stringify(feedback, null, 2));

      const response = await fetch(`${mlServiceUrl}/api/ml/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedback),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error enviando feedback al ML Service:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Feedback enviado exitosamente:', result);
    } catch (error) {
      console.error('❌ Error conectando con ML Service:', error);
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
   * 🆕 Eliminar una tarea
   */
  async deleteTarea(planId: string, tareaId: string): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }

    const plan = await this.planDeAccionModel.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    plan.tareas = plan.tareas.filter((t) => {
      const tarea = t as any;
      return tarea._id ? tarea._id.toString() !== tareaId : true;
    });

    // Renumerar tareas
    plan.tareas.forEach((tarea, index) => {
      tarea.numeroItem = index + 1;
    });

    const metadatos = this.calcularMetadatos(plan.tareas);
    Object.assign(plan, metadatos);
    plan.fechaUltimaActualizacion = new Date();

    return await plan.save();
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

    return await plan.save();
  }

  // ==========================================
  // MÉTODOS AUXILIARES
  // ==========================================

  private convertToMap(verificationList: any): Map<string, string> {
    if (verificationList instanceof Map) {
      return verificationList;
    }

    if (typeof verificationList === 'object' && verificationList !== null) {
      return new Map(Object.entries(verificationList));
    }

    return new Map();
  }

  private extraerPuntaje(response: string | number): number | null {
    if (response === 'N/A') return null;

    const puntaje =
      typeof response === 'number'
        ? response
        : parseInt(response as string, 10);

    return isNaN(puntaje) ? null : puntaje;
  }

  private requierePlanDeAccion(
    puntaje: number,
    comentario: string | undefined,
    opciones: GenerarPlanesDto,
  ): boolean {
    const { incluirPuntaje3 = false, incluirSoloConComentario = true } =
      opciones;

    if (puntaje < 3) {
      if (incluirSoloConComentario) {
        return !!comentario && comentario.trim().length > 0;
      }
      return true;
    }

    if (puntaje === 3 && incluirPuntaje3) {
      return !!comentario && comentario.trim().length > 0;
    }

    return false;
  }

  private crearMapaSecciones(sections: any[]): Map<string, any> {
    const map = new Map();

    const procesarSeccion = (section: any) => {
      if (!section.isParent && section._id) {
        const sectionId = section._id.toString();
        map.set(sectionId, section);
      }

      if (section.subsections?.length > 0) {
        section.subsections.forEach(procesarSeccion);
      }
    };

    sections.forEach(procesarSeccion);
    return map;
  }

  private determinarFamiliaPeligro(sectionTitle: string): string {
    const title = sectionTitle.toLowerCase();

    const familias: Record<string, string> = {
      altura: 'Trabajo en Altura',
      eléctric: 'Riesgo Eléctrico',
      confinado: 'Espacio Confinado',
      caliente: 'Trabajo en Caliente',
      aislamiento: 'Aislamiento de Energía',
      izaje: 'Izaje y Levante',
      sustancia: 'Sustancias Peligrosas',
      maquinaria: 'Uso de Maquinaria',
    };

    for (const [keyword, familia] of Object.entries(familias)) {
      if (title.includes(keyword)) {
        return familia;
      }
    }

    return 'Seguridad Industrial';
  }

  

  /**
   * 📊 Calcular metadatos del plan basado en sus tareas
   */
  private calcularMetadatos(tareas: TareaObservacion[]) {
  const totalTareas = tareas.length;
  const tareasAbiertas = tareas.filter((t) => t.estado === 'abierto').length;
  const tareasEnProgreso = tareas.filter((t) => t.estado === 'en-progreso').length;
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

  async findAll(filters?: {
    estado?: string;
    vicepresidencia?: string;
    superintendencia?: string;
    areaFisica?: string;
  }): Promise<PlanDeAccion[]> {
    const query: any = {};

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

    return await this.planDeAccionModel
      .find(query)
      .sort({ fechaCreacion: -1 })
      .exec();
  }

  async findOne(id: string): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const plan = await this.planDeAccionModel.findById(id).exec();

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    return plan;
  }

  async update(
    id: string,
    updateDto: UpdatePlanAccionDto,
  ): Promise<PlanDeAccion> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const plan = await this.planDeAccionModel.findById(id);
    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    Object.assign(plan, updateDto);
    plan.fechaUltimaActualizacion = new Date();

    return await plan.save();
  }

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const result = await this.planDeAccionModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException('Plan no encontrado');
    }
  }

  /**
   * Obtener estadísticas globales
   */
  async getStats(): Promise<any> {
    const [total, abiertos, enProgreso, cerrados] = await Promise.all([
      this.planDeAccionModel.countDocuments().exec(),
      this.planDeAccionModel.countDocuments({ estado: 'abierto' }).exec(),
      this.planDeAccionModel.countDocuments({ estado: 'en-progreso' }).exec(),
      this.planDeAccionModel.countDocuments({ estado: 'cerrado' }).exec(),
    ]);

    const planes = await this.planDeAccionModel.find().exec();
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
