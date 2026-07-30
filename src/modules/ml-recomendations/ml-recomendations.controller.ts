import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrainModelDto } from './dto/train-model.dto';
import { GetRecommendationDto } from './dto/get-recommendation.dto';
import { MLRecommendationsService } from './ml-recomendations.service';

// 🔥 ELIMINAR la definición de clase inline, ahora se importa desde el archivo DTO

@ApiTags('ml-recommendations')
@Controller('ml-recommendations')
export class MLRecommendationsController {
  private readonly logger = new Logger(MLRecommendationsController.name);

  constructor(
    private readonly mlRecommendationsService: MLRecommendationsService,
  ) {}

  // 🔥 NUEVO ENDPOINT: Recomendación para UNA SOLA observación/pregunta
  @Post('recommend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener recomendación ML para una observación específica',
    description:
      'Genera recomendaciones ML para una pregunta/observación individual',
  })
  @ApiResponse({
    status: 200,
    description: 'Recomendación generada exitosamente',
    schema: {
      example: {
        status: 'success',
        recommendation: {
          current_score: 0,
          predicted_optimal_score: 3,
          current_level: 'Crítico',
          target_level: 'Óptimo',
          confidence: 0.85,
          improvement_gap: 3,
          priority: 'Alta',
          recommended_actions: [
            'Implementar medidas correctivas inmediatas',
            'Capacitar al personal sobre el riesgo identificado',
            'Documentar y hacer seguimiento semanal',
          ],
          analysis:
            'Brecha de 3 punto(s). Puede alcanzar nivel 3/3 con las acciones recomendadas.',
        },
      },
    },
  })
  async getRecommendation(@Body() dto: GetRecommendationDto) {
    this.logger.log('🤖 Solicitud de recomendación individual recibida');
    this.logger.debug(
      `📦 DTO completo recibido: ${JSON.stringify(dto, null, 2)}`,
    );

    // 🔥 Validación defensiva
    if (!dto.question_text) {
      this.logger.error('❌ question_text es undefined o vacío');
      throw new HttpException(
        'El campo "question_text" es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.current_response === undefined || dto.current_response === null) {
      this.logger.error('❌ current_response es undefined o null');
      throw new HttpException(
        'El campo "current_response" es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.debug(
      `📝 Pregunta: "${dto.question_text.substring(0, 50)}..."`,
    );
    this.logger.debug(`🔢 Puntaje actual: ${dto.current_response}`);

    try {
      const recommendation =
        await this.mlRecommendationsService.getRecommendation(
          dto.question_text,
          dto.current_response,
          dto.comment,
          dto.context,
        );

      this.logger.log(
        `✅ Recomendación generada - Prioridad: ${recommendation.priority}`,
      );

      return {
        status: 'success',
        recommendation,
      };
    } catch (error) {
      this.logger.error(`❌ Error generando recomendación: ${error.message}`);
      throw error;
    }
  }

  @Post('train')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Entrenar modelo ML con datos históricos',
    description:
      'Entrena el modelo de Machine Learning usando instancias completadas de MongoDB',
  })
  @ApiResponse({
    status: 200,
    description: 'Modelo entrenado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos insuficientes para entrenar',
  })
  async trainModel(@Body() filters: TrainModelDto) {
    this.logger.log('📥 Solicitud de entrenamiento recibida');
    this.logger.debug(`Filtros DTO: ${JSON.stringify(filters, null, 2)}`);

    const dateFilters: any = {};

    if (filters.dateFrom) {
      dateFilters.dateFrom = new Date(filters.dateFrom);
      this.logger.debug(`📅 Fecha desde parseada: ${dateFilters.dateFrom}`);
    }
    if (filters.dateTo) {
      dateFilters.dateTo = new Date(filters.dateTo);
      this.logger.debug(`📅 Fecha hasta parseada: ${dateFilters.dateTo}`);
    }

    const finalFilters = {
      templateId: filters.templateId,
      ...dateFilters,
    };

    this.logger.debug(
      `🔧 Filtros finales enviados al servicio: ${JSON.stringify(finalFilters, null, 2)}`,
    );

    return await this.mlRecommendationsService.trainModel(finalFilters);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Verificar estado del servicio ML',
  })
  async healthCheck() {
    this.logger.log('🏥 Health check solicitado');
    return await this.mlRecommendationsService.healthCheck();
  }

  @Get('instance/:id')
  @ApiOperation({
    summary: 'Obtener recomendaciones para una instancia completa',
    description:
      'Genera recomendaciones ML para todas las observaciones de una instancia',
  })
  @ApiResponse({
    status: 200,
    description: 'Recomendaciones generadas',
  })
  @ApiResponse({
    status: 404,
    description: 'Instancia no encontrada',
  })
  async getInstanceRecommendations(@Param('id') id: string) {
    this.logger.log(`🔍 Recomendaciones solicitadas para instancia: ${id}`);
    return await this.mlRecommendationsService.getInstanceRecommendations(id);
  }
}
