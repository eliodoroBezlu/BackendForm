import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { MLRecommendationsService } from './ml-recomendations.service';
import { InstancesService } from '../instances/instances.service';

/**
 * Este servicio habla con un servicio de ML externo, en Python. Lo que hay que
 * fijar es **cómo se comporta cuando ese servicio no está**: es una dependencia
 * de otro proceso, y caerse con ella arrastraría al formulario entero.
 *
 * `fetch` se simula: las pruebas no salen a la red.
 */
describe('MLRecommendationsService · el servicio externo falla', () => {
  let servicio: MLRecommendationsService;
  const fetchOriginal = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MLRecommendationsService,
        {
          provide: InstancesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            findForTraining: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://ml:8000') },
        },
      ],
    }).compile();

    servicio = module.get<MLRecommendationsService>(MLRecommendationsService);
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  describe('healthCheck', () => {
    it('con el servicio caido responde 503, no 500', async () => {
      // 503 dice «vuelve luego»; un 500 haria pensar que el fallo es nuestro.
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(servicio.healthCheck()).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });

    it('una respuesta no-OK tambien se traduce a 503', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(servicio.healthCheck()).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('con el servicio sano devuelve lo que informa', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy', modelo: 'v2' }),
      });

      await expect(servicio.healthCheck()).resolves.toMatchObject({
        status: 'healthy',
      });
    });

    it('no filtra la URL interna del servicio ML en el mensaje', async () => {
      // Esa URL es topologia interna: no tiene por que llegar al navegador.
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(servicio.healthCheck()).rejects.toThrow(
        /^(?!.*http:\/\/ml:8000).*$/,
      );
    });
  });

  describe('getRecommendation', () => {
    it('si el servicio no responde, el error sale con codigo HTTP', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        servicio.getRecommendation('¿Usa arnés?', 1),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('devuelve la recomendacion cuando el servicio contesta bien', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            recommendation: { recommended_actions: ['Instalar línea de vida'] },
          }),
      });

      await expect(
        servicio.getRecommendation('¿Usa arnés?', 1),
      ).resolves.toMatchObject({
        recommended_actions: ['Instalar línea de vida'],
      });
    });

    it('envia la pregunta y la respuesta al servicio', async () => {
      const peticion = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ success: true, recommendation: { x: 1 } }),
      });
      global.fetch = peticion;

      await servicio.getRecommendation('¿Usa arnés?', 1, 'Sin arnés');

      const [, opciones] = peticion.mock.calls[0] as [string, { body: string }];
      const cuerpo = JSON.parse(opciones.body) as Record<string, unknown>;
      expect(cuerpo.question_text).toBe('¿Usa arnés?');
      expect(cuerpo.current_response).toBe(1);
      expect(cuerpo.comment).toBe('Sin arnés');
    });

    it('sin comentario envia cadena vacia, no undefined', async () => {
      // `undefined` desaparece al serializar y el servicio Python recibiria un
      // campo ausente en vez de vacio.
      const peticion = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ success: true, recommendation: { x: 1 } }),
      });
      global.fetch = peticion;

      await servicio.getRecommendation('¿Usa arnés?', 1);

      const [, opciones] = peticion.mock.calls[0] as [string, { body: string }];
      const cuerpo = JSON.parse(opciones.body) as Record<string, unknown>;
      expect(cuerpo.comment).toBe('');
    });
  });
});
