import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { PrestamosSpccService, Actor } from './prestamos-spcc.service';
import { SolicitudPrestamo } from './schemas/solicitud-prestamo.schema';
import { PrestamoSpcc } from './schemas/prestamo-spcc.schema';
import { Equipo } from '../equipos/schemas/equipo.schema';
import { FirmaService } from '../../common/firma/firma.service';

/**
 * A nombre de quien queda una solicitud.
 *
 * Nace de un caso real: alguien pide un arnes de palabra en la oficina y lo
 * registra el de almacen con su propio usuario. Hasta ahora el solicitante
 * salia entero de la sesion, asi que la solicitud quedaba a nombre de quien la
 * escribia — y anular y rehacer no lo arreglaba, porque la copia nueva volvia
 * a quedar igual.
 */

const TRABAJADOR = new Types.ObjectId().toHexString();
/** `buscar` valida que sea un ObjectId antes de consultar. */
const SOLICITUD = new Types.ObjectId().toHexString();

const actor = (extra: Partial<Actor> = {}): Actor => ({
  usuario: 'almacen1',
  nombre: 'Almacen Uno',
  ...extra,
});

describe('PrestamosSpccService - a nombre de quien queda la solicitud', () => {
  let servicio: PrestamosSpccService;
  let creado: Record<string, unknown>;
  let solicitudGuardada: Record<string, unknown>;

  const construir = async (solicitudExistente?: Record<string, unknown>) => {
    creado = {};
    solicitudGuardada = solicitudExistente ?? {};

    const solicitudes = {
      create: jest.fn((doc: Record<string, unknown>) => {
        creado = doc;
        return Promise.resolve(doc);
      }),
      // `buscar` llama a findById sin `.exec()`, asi que devuelve el
      // documento directamente.
      findById: jest.fn().mockResolvedValue(solicitudGuardada),
      countDocuments: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(0),
      })),
      findOne: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      })),
      // `siguienteNumero` saca el correlativo de una coleccion aparte a
      // traves de la conexion del propio modelo.
      db: {
        collection: () => ({
          findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }),
        }),
      },
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        PrestamosSpccService,
        { provide: getModelToken(SolicitudPrestamo.name), useValue: solicitudes },
        { provide: getModelToken(PrestamoSpcc.name), useValue: {} },
        {
          // `nombreDeTrabajador` y `resolverSolicitante` consultan la
          // coleccion de trabajadores a traves de la conexion del modelo de
          // equipos, no de un modelo propio.
          provide: getModelToken(Equipo.name),
          useValue: {
            db: {
              collection: () => ({
                findOne: jest.fn().mockResolvedValue({
                  nomina: 'PEREZ JUAN',
                  username: 'jperez',
                }),
              }),
            },
          },
        },
        { provide: FirmaService, useValue: { sellar: jest.fn() } },
      ],
    }).compile();

    servicio = modulo.get(PrestamosSpccService);
  };

  const dto = {
    areaSolicitante: 'Chancado',
    motivo: 'Trabajo en altura',
    fechaDevolucionPrevista: new Date(Date.now() + 86400000).toISOString(),
    solicitado: [{ tipoEquipo: 'Arnes', cantidad: 1 }],
  };

  describe('al crear', () => {
    it('sin solicitanteId, el solicitante sigue siendo quien teclea', async () => {
      await construir();

      await servicio.crear(dto as never, actor());

      expect(creado.solicitanteUsername).toBe('almacen1');
    });

    it('un admin puede atribuirla a otra persona', async () => {
      await construir();

      await servicio.crear(
        { ...dto, solicitanteId: TRABAJADOR } as never,
        actor({ puedeElegirSolicitante: true }),
      );

      expect(creado.solicitanteUsername).toBe('jperez');
      expect(creado.solicitanteNombre).toBe('PEREZ JUAN');
    });

    it('quien no puede elegirlo lo pide y se ignora', async () => {
      // No es un error: el almacen manda el campo y la solicitud simplemente
      // queda a su nombre, que es el comportamiento de siempre.
      await construir();

      await servicio.crear(
        { ...dto, solicitanteId: TRABAJADOR } as never,
        actor({ puedeElegirSolicitante: false }),
      );

      expect(creado.solicitanteUsername).toBe('almacen1');
    });

    it('registradoPor guarda siempre quien tecleo', async () => {
      // Sin esto, dejar elegir a quien pide haria imposible saber quien
      // registro el movimiento.
      await construir();

      await servicio.crear(
        { ...dto, solicitanteId: TRABAJADOR } as never,
        actor({ puedeElegirSolicitante: true }),
      );

      expect(creado.registradoPor).toBe('almacen1');
      expect(creado.solicitanteUsername).toBe('jperez');
    });
  });

  describe('corrigiendo una ya registrada', () => {
    const solicitudFirmada = () => {
      const doc: Record<string, unknown> = {
        _id: SOLICITUD,
        estado: 'entregada',
        solicitanteUsername: 'almacen1',
        solicitanteNombre: 'Almacen Uno',
        correcciones: [],
        save: jest.fn(),
      };
      doc.save = jest.fn().mockResolvedValue(doc);
      return doc;
    };

    it('funciona sobre una solicitud ya entregada', async () => {
      // Es el caso que hay que arreglar: las mal atribuidas son las viejas.
      const doc = solicitudFirmada();
      await construir(doc);

      await servicio.corregirSolicitante(
        SOLICITUD,
        { solicitanteId: TRABAJADOR, motivo: 'Lo pidio Perez en la oficina' },
        actor(),
      );

      expect(doc.solicitanteUsername).toBe('jperez');
    });

    it('NO pisa el valor anterior: queda en correcciones', async () => {
      const doc = solicitudFirmada();
      await construir(doc);

      await servicio.corregirSolicitante(
        SOLICITUD,
        { solicitanteId: TRABAJADOR, motivo: 'Lo pidio Perez en la oficina' },
        actor(),
      );

      const correcciones = doc.correcciones as Record<string, unknown>[];
      expect(correcciones).toHaveLength(1);
      expect(correcciones[0].valorAnterior).toBe('Almacen Uno');
      expect(correcciones[0].valorNuevo).toBe('PEREZ JUAN');
      expect(correcciones[0].corregidoPor).toBe('almacen1');
      expect(correcciones[0].motivo).toBe('Lo pidio Perez en la oficina');
    });

    it('dos correcciones seguidas conservan las dos', async () => {
      const doc = solicitudFirmada();
      await construir(doc);

      await servicio.corregirSolicitante(
        SOLICITUD,
        { solicitanteId: TRABAJADOR, motivo: 'primera' },
        actor(),
      );
      await servicio.corregirSolicitante(
        SOLICITUD,
        { solicitanteId: TRABAJADOR, motivo: 'segunda' },
        actor(),
      );

      expect(doc.correcciones as unknown[]).toHaveLength(2);
    });
  });
});
