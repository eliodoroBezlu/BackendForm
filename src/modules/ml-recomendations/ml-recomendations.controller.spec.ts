import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { MLRecommendationsController } from './ml-recomendations.controller';
import { MLRecommendationsService } from './ml-recomendations.service';

/**
 * Este controlador es la puerta al servicio de ML. Lo que se fija aquí es su
 * **validación defensiva**: sin texto de pregunta no tiene sentido llamar al
 * modelo, y conviene cortar antes de gastar la llamada.
 */
describe('MLRecommendationsController', () => {
  let controller: MLRecommendationsController;
  let servicio: Record<string, jest.Mock>;

  beforeEach(async () => {
    servicio = {
      getRecommendation: jest.fn().mockResolvedValue({ x: 1 }),
      trainModel: jest.fn().mockResolvedValue({}),
      healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
      getInstanceRecommendations: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MLRecommendationsController],
      providers: [{ provide: MLRecommendationsService, useValue: servicio }],
    }).compile();

    controller = module.get<MLRecommendationsController>(
      MLRecommendationsController,
    );
  });

  describe('validación previa', () => {
    it('sin texto de pregunta no se llama al modelo', async () => {
      await expect(
        controller.getRecommendation({ current_response: 1 } as never),
      ).rejects.toBeInstanceOf(HttpException);

      expect(servicio.getRecommendation).not.toHaveBeenCalled();
    });

    it('un texto vacio tampoco pasa', async () => {
      await expect(
        controller.getRecommendation({
          question_text: '',
          current_response: 1,
        } as never),
      ).rejects.toBeInstanceOf(HttpException);

      expect(servicio.getRecommendation).not.toHaveBeenCalled();
    });
  });

  describe('paso de parametros', () => {
    it('reenvia pregunta, respuesta, comentario y contexto en orden', async () => {
      await controller.getRecommendation({
        question_text: '¿Usa arnés?',
        current_response: 1,
        comment: 'Sin arnés',
        context: { area: 'Chancado' },
      } as never);

      expect(servicio.getRecommendation).toHaveBeenCalledWith(
        '¿Usa arnés?',
        1,
        'Sin arnés',
        { area: 'Chancado' },
      );
    });

    it('la respuesta 0 se reenvia (es el peor puntaje, no un vacio)', async () => {
      // Si se tratara como ausente, justo el caso mas grave no recibiria
      // recomendacion.
      await controller.getRecommendation({
        question_text: '¿Usa arnés?',
        current_response: 0,
      } as never);

      const [, respuesta] = servicio.getRecommendation.mock.calls[0] as [
        string,
        number,
      ];
      expect(respuesta).toBe(0);
    });
  });

  describe('health', () => {
    it('devuelve lo que informa el servicio', async () => {
      await expect(controller.healthCheck()).resolves.toMatchObject({
        status: 'healthy',
      });
    });
  });
});
