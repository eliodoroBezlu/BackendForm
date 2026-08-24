import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { InspeccionesEmergenciaController } from './inspecciones-emergencia.controller';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { InspeccionesEmergenciaDocumentService } from './inspecciones-emergencia-document.service';
import { ExtintorService } from '../extintor/extintor.service';
import { BulkDownloadService } from '../../common/services/bulk-download.service';
import { ES_PUBLICO } from '../../common/nucleo/publico.decorator';

/**
 * El controlador desarma el cuerpo de la petición y reparte sus campos entre
 * los argumentos del servicio. Ahí es donde se cuelan los errores silenciosos:
 * `tag`, `periodo` y `area` son todos cadenas, así que cambiarlos de orden
 * **compila** y el formulario se busca con los datos equivocados.
 *
 * También se comprueba que ninguna ruta quede abierta sin autenticación.
 */
describe('InspeccionesEmergenciaController', () => {
  let controller: InspeccionesEmergenciaController;
  let servicio: {
    create: jest.Mock;
    actualizarMesPorTag: jest.Mock;
    verificarTag: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    verificarInspecciones: jest.Mock;
    actualizarExtintoresPorTag: jest.Mock;
  };
  const reflector = new Reflector();

  beforeEach(async () => {
    servicio = {
      create: jest.fn().mockResolvedValue({ _id: 'nuevo' }),
      actualizarMesPorTag: jest.fn().mockResolvedValue({ success: true }),
      verificarTag: jest.fn().mockResolvedValue({ existe: false }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      verificarInspecciones: jest.fn().mockResolvedValue({}),
      actualizarExtintoresPorTag: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspeccionesEmergenciaController],
      providers: [
        { provide: InspeccionesEmergenciaService, useValue: servicio },
        {
          provide: InspeccionesEmergenciaDocumentService,
          useValue: { generar: jest.fn() },
        },
        { provide: ExtintorService, useValue: { findByTag: jest.fn() } },
        { provide: BulkDownloadService, useValue: { descargar: jest.fn() } },
      ],
    }).compile();

    controller = module.get<InspeccionesEmergenciaController>(
      InspeccionesEmergenciaController,
    );
  });

  describe('verificar-tag', () => {
    it('reparte los cuatro campos del cuerpo en el orden correcto', async () => {
      await controller.verificarTag({
        tag: 'TAG-01',
        periodo: 'primer-semestre',
        año: 2026,
        area: 'Chancado',
      });

      expect(servicio.verificarTag).toHaveBeenCalledWith(
        'TAG-01',
        'primer-semestre',
        2026,
        'Chancado',
      );
    });

    it('devuelve la respuesta del servicio sin alterarla', async () => {
      servicio.verificarTag.mockResolvedValue({
        existe: true,
        puedeModificar: false,
        estado: 'completado',
      });

      // `puedeModificar` es lo que el frontend usa para bloquear el formulario:
      // perderlo por el camino dejaria editar una inspeccion ya cerrada.
      await expect(
        controller.verificarTag({
          tag: 'T',
          periodo: 'p',
          año: 2026,
          area: 'a',
        }),
      ).resolves.toMatchObject({ puedeModificar: false });
    });
  });

  describe('actualizar-mes', () => {
    it('el tag viene de la URL y el resto del cuerpo', async () => {
      await controller.actualizarMes('TAG-01', {
        mes: 'ENERO',
        datosMes: { inspeccionesExtintor: [] },
        area: 'Chancado',
      } as never);

      expect(servicio.actualizarMesPorTag).toHaveBeenCalledWith(
        'TAG-01',
        'ENERO',
        { inspeccionesExtintor: [] },
        'Chancado',
      );
    });
  });

  describe('crear-formulario', () => {
    it('pasa el DTO completo al servicio', async () => {
      const dto = { tag: 'TAG-01', periodo: 'primer-semestre', año: 2026 };

      await controller.crearFormulario(dto as never);

      expect(servicio.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('superficie de seguridad', () => {
    it('ninguna ruta esta abierta al publico', () => {
      const rutas = [
        'crearFormulario',
        'actualizarMes',
        'verificarTag',
        'findAll',
        'findOne',
      ] as const;

      rutas.forEach((ruta) => {
        const metodo = (controller as unknown as Record<string, unknown>)[ruta];
        expect(metodo).toBeDefined();
        expect(reflector.get<boolean>(ES_PUBLICO, metodo as never)).not.toBe(
          true,
        );
      });
    });
  });
});
