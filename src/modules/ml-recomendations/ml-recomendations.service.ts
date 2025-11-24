import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Instance } from '../instances/schemas/instance.schema';
import {
  MLRecommendation,
  MLTrainingMetrics,
  MLHealthStatus,
  InstanceRecommendations,
} from './interfaces/ml-recommendation.interface';

@Injectable()
export class MLRecommendationsService {
  private readonly logger = new Logger(MLRecommendationsService.name);
  private readonly mlServiceUrl: string;

  constructor(
    @InjectModel(Instance.name)
    private instanceModel: Model<Instance>,
    private configService: ConfigService,
  ) {
    this.mlServiceUrl = this.configService.get<string>(
      'ML_SERVICE_URL',
      'http://localhost:8000',
    );
    this.logger.log(`ML Service configurado en: ${this.mlServiceUrl}`);
  }

  /**
   * Entrena el modelo ML con datos históricos de MongoDB
   */
  async trainModel(filters?: {
  templateId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<{
  success: boolean;
  metrics: MLTrainingMetrics;
  message: string;
}> {
  try {
    this.logger.log('🔄 Iniciando entrenamiento del modelo ML...');
    this.logger.debug(`📋 Filtros recibidos: ${JSON.stringify(filters, null, 2)}`);

    // Construir query para obtener solo instancias completadas
    const query: any = {
      status: { $in: ['completado', 'revisado', 'aprobado', 'borrador'] },
    };

    if (filters?.templateId) {
      query.templateId = new Types.ObjectId(filters.templateId);
      this.logger.debug(`🔍 Filtrando por templateId: ${filters.templateId}`);
    }

    if (filters?.dateFrom || filters?.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) {
        query.createdAt.$gte = filters.dateFrom;
        this.logger.debug(`📅 Fecha desde: ${filters.dateFrom.toISOString()}`);
      }
      if (filters.dateTo) {
        query.createdAt.$lte = filters.dateTo;
        this.logger.debug(`📅 Fecha hasta: ${filters.dateTo.toISOString()}`);
      }
    }

    this.logger.debug(`🔎 Query MongoDB: ${JSON.stringify(query, null, 2)}`);

    const totalInstances = await this.instanceModel.countDocuments({});
    this.logger.log(`📊 Total instancias en BD: ${totalInstances}`);

    const statusCounts = await this.instanceModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    this.logger.debug(`📈 Instancias por estado: ${JSON.stringify(statusCounts, null, 2)}`);

    const instances = await this.instanceModel
      .find(query)
      .populate('templateId')
      .lean()
      .exec();

    this.logger.log(`✅ Instancias encontradas con query: ${instances.length}`);

    if (instances.length === 0) {
      this.logger.warn('⚠️ No se encontraron instancias con el query especificado');
      this.logger.warn(`🔍 Query usado: ${JSON.stringify(query, null, 2)}`);
      const anyInstances = await this.instanceModel.find({ status: { $in: ['completado', 'revisado', 'aprobado'] } }).limit(5).lean();
      this.logger.debug(`💡 Ejemplos de instancias completadas (sin filtros): ${anyInstances.length}`);
      if (anyInstances.length > 0) {
        this.logger.debug(`📝 Primera instancia ejemplo: ${JSON.stringify({
          id: anyInstances[0]._id,
          status: anyInstances[0].status,
          templateId: anyInstances[0].templateId,
        }, null, 2)}`);
      }
      throw new HttpException(
        'No hay suficientes datos históricos para entrenar el modelo',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`📊 Preparando entrenamiento con ${instances.length} instancias...`);
    // ===============================================================================================
    // LOGGING RESUMIDO y SEGURO antes de enviar a ML Service
    this.logger.debug(`📦 Cantidad de instancias enviadas: ${instances.length}`);
    if (instances.length > 0) {
      this.logger.debug(`[trainModel] Primera instancia enviada: ` +
        JSON.stringify({
          _id: instances[0]._id,
          status: instances[0].status,
          templateId: instances[0].templateId
        })
      );
    }
    // ===============================================================================================

    this.logger.log(`🚀 Enviando datos al servicio ML en: ${this.mlServiceUrl}/api/ml/train`);

    const response = await fetch(`${this.mlServiceUrl}/api/ml/train/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instances }),
    });

    this.logger.debug(`📡 Respuesta ML Service - Status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // SOLO se muestra el campo 'detail', no el body completo
      this.logger.error(`❌ Error del ML Service: ${errorData.detail || 'Sin detalle'}`);
      throw new HttpException(
        errorData.detail || 'Error al entrenar modelo',
        response.status,
      );
    }

    const data = await response.json();
    this.logger.debug(`📊 Métricas recibidas: ${JSON.stringify(data.metrics, null, 2)}`);
    this.logger.log('✅ Modelo entrenado exitosamente');

    return {
      success: true,
      metrics: data.metrics,
      message: `Modelo entrenado con ${instances.length} instancias`,
    };
  } catch (error) {
    this.logger.error(`❌ Error entrenando modelo: ${error.message}`);
    this.logger.error(`Stack trace: ${error.stack}`);
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      `Error al entrenar modelo: ${error.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}



  /**
   * Obtiene recomendación para una observación específica
   */
  async getRecommendation(
  questionText: string,
  currentResponse: number,
  comment?: string,
  context?: {
    sectionCompliance?: number;
    overallCompliance?: number;
    area?: string;
    naCount?: number;
  },
): Promise<MLRecommendation> {
  try {
    this.logger.debug(`🤖 Solicitando recomendación para: "${questionText.substring(0, 50)}..."`);
    
    // 🔥 URL correcta del servicio Python ML
    const url = `${this.mlServiceUrl}/api/ml/recommend/`;
    
    this.logger.debug(`🎯 Llamando a: ${url}`);
    
    const requestBody = {
      question_text: questionText,
      current_response: currentResponse,
      comment: comment || '',
      context: context || {},
    };
    
    this.logger.debug(`📤 Body enviado: ${JSON.stringify(requestBody, null, 2)}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    this.logger.debug(`📡 Respuesta del ML Service - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`❌ Error en ML Service: ${response.status} - ${errorText}`);
      throw new HttpException(
        `Error al generar recomendación: ${errorText}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const data = await response.json();
    this.logger.debug(`✅ Datos recibidos del ML Service: ${JSON.stringify(data, null, 2)}`);
    
    // 🔥 El servicio Python retorna: { status: "success", recommendation: {...} }
    if (data.recommendation) {
      this.logger.log(`✅ Recomendación generada - Prioridad: ${data.recommendation.priority}`);
      return data.recommendation;
    } else {
      this.logger.error('⚠️ Respuesta sin campo "recommendation"');
      throw new HttpException(
        'Formato de respuesta inválido del ML Service',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  } catch (error) {
    this.logger.error(`❌ Error obteniendo recomendación: ${error.message}`);
    
    if (error instanceof HttpException) {
      throw error;
    }
    
    throw new HttpException(
      `Error al generar recomendación: ${error.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

  /**
   * Obtiene recomendaciones para toda una instancia
   */
  async getInstanceRecommendations(
    instanceId: string,
  ): Promise<InstanceRecommendations> {
    try {
      this.logger.log(`🔍 Generando recomendaciones para instancia: ${instanceId}`);
      
      // Obtener instancia completa
      const instance = await this.instanceModel
        .findById(instanceId)
        .populate('templateId')
        .exec();

      if (!instance) {
        this.logger.warn(`⚠️ Instancia no encontrada: ${instanceId}`);
        throw new HttpException(
          'Instancia no encontrada',
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.debug(`📋 Instancia encontrada - Secciones: ${instance.sections.length}`);

      const template = instance.templateId as any;
      const recommendations: Array<{
        sectionId: string;
        sectionTitle: any;
        questionText: string;
        currentScore: number;
        recommendation: MLRecommendation;
      }> = [];
      let highPriority = 0;
      let mediumPriority = 0;
      let lowPriority = 0;
      let totalGap = 0;

      // Procesar cada sección
      for (const section of instance.sections) {
        this.logger.debug(`📑 Procesando sección: ${section.sectionId}`);
        
        // Buscar título de sección en template
        const templateSection = this._findSectionInTemplate(
          template.sections,
          section.sectionId,
        );

        // Procesar cada pregunta
        for (const question of section.questions) {
          if (question.response === 'N/A') continue; // Saltar N/A

          const recommendation = await this.getRecommendation(
            question.questionText,
            Number(question.response),
            question.comment,
            {
              sectionCompliance: section.compliancePercentage,
              overallCompliance: instance.overallCompliancePercentage,
              naCount: section.naCount,
            },
          );

          recommendations.push({
            sectionId: section.sectionId,
            sectionTitle: templateSection?.title || 'Sección sin título',
            questionText: question.questionText,
            currentScore: Number(question.response),
            recommendation,
          });

          // Contadores de prioridad
          if (recommendation.priority === 'Alta') highPriority++;
          else if (recommendation.priority === 'Media') mediumPriority++;
          else lowPriority++;

          totalGap += recommendation.improvement_gap;
        }
      }

      this.logger.log(`✅ Recomendaciones generadas - Alta: ${highPriority}, Media: ${mediumPriority}, Baja: ${lowPriority}`);

      return {
        instanceId: instance._id.toString(),
        overallCompliance: instance.overallCompliancePercentage,
        recommendations: recommendations.filter(
          (r) => r.recommendation.improvement_gap > 0,
        ), // Solo mejoras potenciales
        summary: {
          totalQuestions: recommendations.length,
          highPriority,
          mediumPriority,
          lowPriority,
          averageImprovementGap:
            recommendations.length > 0 ? totalGap / recommendations.length : 0,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Error generando recomendaciones de instancia: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica estado del servicio ML
   */
  async healthCheck(): Promise<MLHealthStatus> {
    try {
      this.logger.debug(`🏥 Verificando salud de ML Service: ${this.mlServiceUrl}/health`);
      
      const response = await fetch(`${this.mlServiceUrl}/health`);
      
      if (!response.ok) {
        this.logger.error(`❌ ML Service health check falló: ${response.status}`);
        throw new Error('Servicio no disponible');
      }

      const health = await response.json();
      this.logger.log(`✅ ML Service saludable: ${JSON.stringify(health)}`);
      return health;
    } catch (error) {
      this.logger.error(`❌ ML Service no disponible: ${error.message}`);
      throw new HttpException(
        'Servicio ML no disponible',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Función helper para buscar sección en template recursivamente
   */
  private _findSectionInTemplate(sections: any[], sectionId: string): any {
    for (const section of sections) {
      if (section._id.toString() === sectionId) {
        return section;
      }
      if (section.subsections && section.subsections.length > 0) {
        const found = this._findSectionInTemplate(
          section.subsections,
          sectionId,
        );
        if (found) return found;
      }
    }
    return null;
  }
}