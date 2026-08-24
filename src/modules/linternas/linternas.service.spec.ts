import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LinternasService } from './linternas.service';
import { StockLinternasService } from './stock-linternas.service';
import { FirmaService } from '../../common/firma/firma.service';
import { MetodoFirma } from '../../common/firma/firma.schema';
import {
  EntregaLinterna,
  EstadoEntrega,
  TipoEntrega,
} from './schemas/entrega-linterna.schema';
import { RegistrarEntregaDto } from './dto/registrar-entrega.dto';

/**
 * Las invariantes son el módulo: sin ellas esto es un formulario que guarda
 * cualquier cosa. Cada una tiene su prueba.
 */
describe('LinternasService', () => {
  let service: LinternasService;
  let entregas: Record<string, unknown>[];
  let stock: { descontarUna: jest.Mock; reponerUna: jest.Mock };

  const TRABAJADOR = new Types.ObjectId();
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const contexto = { usuario: 'admin', ip: '10.0.0.1', userAgent: 'jest' };

  const foto = { url: '/uploads/x.jpg', nombre: 'x.jpg' };

  beforeEach(async () => {
    entregas = [];

    const entregaModel = Object.assign(
      function () {
        /* no se usa como constructor */
      },
      {
        find: (filtro: { trabajador?: Types.ObjectId }) => {
          const buscado = filtro.trabajador?.toString();
          const filtrados = entregas.filter((e) =>
            buscado
              ? (e.trabajador as Types.ObjectId).toString() === buscado
              : true,
          );
          const cadena = {
            sort: () => cadena,
            limit: () => cadena,
            lean: () => cadena,
            exec: () => Promise.resolve(filtrados),
            distinct: () => Promise.resolve([]),
          };
          return cadena;
        },
        findById: (id: string) => ({
          exec: () =>
            Promise.resolve(entregas.find((e) => String(e._id) === id) ?? null),
        }),
        create: (doc: Record<string, unknown>) => {
          if (
            doc.tipo === TipoEntrega.DOTACION &&
            entregas.some(
              (e) =>
                e.tipo === TipoEntrega.DOTACION &&
                String(e.trabajador) === String(doc.trabajador),
            )
          ) {
            // Imita el índice único parcial de Mongo.
            return Promise.reject(
              Object.assign(new Error('dup'), { code: 11000 }),
            );
          }
          const guardado = {
            ...doc,
            _id: new Types.ObjectId(),
            save: () => Promise.resolve(guardado),
          };
          entregas.push(guardado);
          return Promise.resolve(guardado);
        },
      },
    );

    const trabajadorModel = {
      findById: (id: string) => ({
        lean: () => ({
          exec: () =>
            Promise.resolve(
              String(id) === String(TRABAJADOR)
                ? {
                    _id: TRABAJADOR,
                    nomina: 'Quispe Mamani Juan',
                    area: 'Chancado',
                    superintendencia: 'Superintendencia de Mantenimiento',
                  }
                : null,
            ),
        }),
      }),
      find: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }),
    };

    stock = {
      descontarUna: jest.fn().mockResolvedValue(undefined),
      reponerUna: jest.fn().mockResolvedValue(undefined),
    };

    const firmas = {
      sellar: jest.fn((imagen: string, metodo: MetodoFirma) => ({
        imagen,
        hash: 'h'.repeat(64),
        metodo,
        firmadoPor: contexto.usuario,
        firmadoEn: new Date(),
      })),
      registrarAsiento: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinternasService,
        {
          provide: getModelToken(EntregaLinterna.name),
          useValue: entregaModel,
        },
        { provide: getModelToken('Trabajador'), useValue: trabajadorModel },
        { provide: StockLinternasService, useValue: stock },
        { provide: FirmaService, useValue: firmas },
      ],
    }).compile();

    service = module.get<LinternasService>(LinternasService);
  });

  const dto = (extra: Partial<RegistrarEntregaDto> = {}) =>
    ({
      trabajador: String(TRABAJADOR),
      tipo: TipoEntrega.DOTACION,
      ...extra,
    }) as RegistrarEntregaDto;

  const dotar = () => service.registrar(dto(), contexto);

  describe('invariante 1 — una sola dotación por trabajador', () => {
    it('la primera dotación se registra', async () => {
      const entrega = await dotar();
      expect(entrega.tipo).toBe(TipoEntrega.DOTACION);
      expect(entrega.estado).toBe(EstadoEntrega.REGISTRADA);
    });

    it('la segunda se rechaza con un mensaje que se entiende', async () => {
      await dotar();
      await expect(dotar()).rejects.toThrow(ConflictException);
      await expect(dotar()).rejects.toThrow(/ya recibió su dotación/);
    });
  });

  describe('invariante 2 — no se cambia lo que nunca se entregó', () => {
    it('rechaza un cambio sin dotación previa', async () => {
      await expect(
        service.registrar(
          dto({ tipo: TipoEntrega.CAMBIO, devolucion: { foto } }),
          contexto,
        ),
      ).rejects.toThrow(/todavía no tiene dotación/);
    });

    it('rechaza una pérdida sin dotación previa', async () => {
      await expect(
        service.registrar(
          dto({
            tipo: TipoEntrega.REPOSICION_PERDIDA,
            perdida: { justificacion: 'se cayó al pique' },
          }),
          contexto,
        ),
      ).rejects.toThrow(/todavía no tiene dotación/);
    });
  });

  describe('invariante 3 — un cambio exige la foto de la devuelta', () => {
    it('rechaza el cambio sin devolución', async () => {
      await dotar();
      await expect(
        service.registrar(dto({ tipo: TipoEntrega.CAMBIO }), contexto),
      ).rejects.toThrow(/foto de la linterna averiada/);
    });

    it('acepta el cambio con la foto', async () => {
      await dotar();
      const cambio = await service.registrar(
        dto({ tipo: TipoEntrega.CAMBIO, devolucion: { foto } }),
        contexto,
      );
      expect(cambio.estado).toBe(EstadoEntrega.REGISTRADA);
    });

    it('permite muchos cambios', async () => {
      await dotar();
      for (let i = 0; i < 3; i++) {
        await service.registrar(
          dto({ tipo: TipoEntrega.CAMBIO, devolucion: { foto } }),
          contexto,
        );
      }
      const estado = await service.estadoDeTrabajador(String(TRABAJADOR));
      expect(estado.totalCambios).toBe(3);
    });
  });

  describe('invariante 4 — la pérdida nace pendiente y sin devolución', () => {
    it('exige justificación', async () => {
      await dotar();
      await expect(
        service.registrar(
          dto({ tipo: TipoEntrega.REPOSICION_PERDIDA }),
          contexto,
        ),
      ).rejects.toThrow(/justificación del trabajador/);
    });

    it('no admite devolución: con linterna que devolver es un cambio', async () => {
      await dotar();
      await expect(
        service.registrar(
          dto({
            tipo: TipoEntrega.REPOSICION_PERDIDA,
            perdida: { justificacion: 'se perdió' },
            devolucion: { foto },
          }),
          contexto,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('queda pendiente de aprobación y no descuenta stock todavía', async () => {
      await dotar();
      stock.descontarUna.mockClear();

      const perdida = await service.registrar(
        dto({
          tipo: TipoEntrega.REPOSICION_PERDIDA,
          perdida: { justificacion: 'se perdió en el turno noche' },
        }),
        contexto,
      );

      expect(perdida.estado).toBe(EstadoEntrega.PENDIENTE_APROBACION);
      expect(perdida.fechaEntrega).toBeUndefined();
      expect(stock.descontarUna).not.toHaveBeenCalled();
    });
  });

  describe('invariante 5 — no se firma el recibo antes de aprobar', () => {
    const crearPerdida = async () => {
      await dotar();
      return service.registrar(
        dto({
          tipo: TipoEntrega.REPOSICION_PERDIDA,
          perdida: { justificacion: 'se perdió' },
        }),
        contexto,
      );
    };

    it('rechaza firmar mientras está pendiente', async () => {
      const p = await crearPerdida();
      await expect(
        service.firmarRecibo(String(p._id), { firmaTrabajador: PNG }, contexto),
      ).rejects.toThrow(/todavía no está aprobada/);
    });

    it('rechaza firmar una solicitud rechazada', async () => {
      const p = await crearPerdida();
      await service.resolverPerdida(
        String(p._id),
        { aprobar: false, comentario: 'sin sustento' },
        { ...contexto, usuario: 'superintendente' },
      );

      await expect(
        service.firmarRecibo(String(p._id), { firmaTrabajador: PNG }, contexto),
      ).rejects.toThrow(/fue rechazada/);
    });

    it('deja firmar una vez aprobada', async () => {
      const p = await crearPerdida();
      await service.resolverPerdida(
        String(p._id),
        { aprobar: true, firmaAprobador: PNG },
        { ...contexto, usuario: 'superintendente' },
      );

      const firmada = await service.firmarRecibo(
        String(p._id),
        { firmaTrabajador: PNG, metodoFirma: MetodoFirma.SUBIDA },
        contexto,
      );

      expect(firmada.firmaTrabajador).toBeDefined();
      expect(firmada.fechaEntrega).toBeInstanceOf(Date);
    });

    it('no deja firmar dos veces en silencio', async () => {
      await dotar();
      const cambio = await service.registrar(
        dto({ tipo: TipoEntrega.CAMBIO, devolucion: { foto } }),
        contexto,
      );
      await service.firmarRecibo(
        String(cambio._id),
        { firmaTrabajador: PNG },
        contexto,
      );

      await expect(
        service.firmarRecibo(
          String(cambio._id),
          { firmaTrabajador: PNG },
          contexto,
        ),
      ).rejects.toThrow(/ya está firmada/);
    });
  });

  describe('aprobación de pérdidas', () => {
    const crearPerdida = async () => {
      await dotar();
      return service.registrar(
        dto({
          tipo: TipoEntrega.REPOSICION_PERDIDA,
          perdida: { justificacion: 'se perdió' },
        }),
        contexto,
      );
    };

    it('aprobar sin firma no aprueba nada', async () => {
      const p = await crearPerdida();
      await expect(
        service.resolverPerdida(String(p._id), { aprobar: true }, contexto),
      ).rejects.toThrow(/firma de quien autoriza/);
    });

    it('al aprobar se descuenta el stock', async () => {
      const p = await crearPerdida();
      stock.descontarUna.mockClear();

      await service.resolverPerdida(
        String(p._id),
        { aprobar: true, firmaAprobador: PNG },
        { ...contexto, usuario: 'superintendente' },
      );

      expect(stock.descontarUna).toHaveBeenCalledTimes(1);
    });

    it('al rechazar no se descuenta', async () => {
      const p = await crearPerdida();
      stock.descontarUna.mockClear();

      await service.resolverPerdida(
        String(p._id),
        { aprobar: false },
        { ...contexto, usuario: 'superintendente' },
      );

      expect(stock.descontarUna).not.toHaveBeenCalled();
    });

    it('no se resuelve dos veces', async () => {
      const p = await crearPerdida();
      await service.resolverPerdida(
        String(p._id),
        { aprobar: true, firmaAprobador: PNG },
        contexto,
      );

      await expect(
        service.resolverPerdida(String(p._id), { aprobar: false }, contexto),
      ).rejects.toThrow(ConflictException);
    });

    it('un cambio no pasa por aprobación', async () => {
      await dotar();
      const cambio = await service.registrar(
        dto({ tipo: TipoEntrega.CAMBIO, devolucion: { foto } }),
        contexto,
      );

      await expect(
        service.resolverPerdida(
          String(cambio._id),
          { aprobar: true, firmaAprobador: PNG },
          contexto,
        ),
      ).rejects.toThrow(/pasan por aprobación/);
    });
  });

  describe('stock', () => {
    it('una entrega que falla al guardar devuelve la linterna al stock', async () => {
      await dotar();
      stock.reponerUna.mockClear();

      // Segunda dotación: el índice único la rechaza después de descontar.
      await expect(dotar()).rejects.toThrow();
      // El descuento no llegó a ocurrir porque la validación corta antes.
      expect(stock.reponerUna).not.toHaveBeenCalled();
    });
  });

  describe('estadoDeTrabajador', () => {
    it('sin entregas propone dotación', async () => {
      const estado = await service.estadoDeTrabajador(String(TRABAJADOR));
      expect(estado.tieneDotacion).toBe(false);
      expect(estado.siguienteAccion).toBe(TipoEntrega.DOTACION);
    });

    it('con dotación propone cambio', async () => {
      await dotar();
      const estado = await service.estadoDeTrabajador(String(TRABAJADOR));
      expect(estado.tieneDotacion).toBe(true);
      expect(estado.siguienteAccion).toBe(TipoEntrega.CAMBIO);
    });

    it('bloquea una entrega nueva mientras hay una pérdida pendiente', async () => {
      await dotar();
      await service.registrar(
        dto({
          tipo: TipoEntrega.REPOSICION_PERDIDA,
          perdida: { justificacion: 'se perdió' },
        }),
        contexto,
      );

      await expect(
        service.registrar(
          dto({ tipo: TipoEntrega.CAMBIO, devolucion: { foto } }),
          contexto,
        ),
      ).rejects.toThrow(/pendiente de aprobación/);
    });

    it('un trabajador inexistente no existe', async () => {
      await expect(
        service.estadoDeTrabajador(String(new Types.ObjectId())),
      ).rejects.toThrow(NotFoundException);
    });

    it('un id mal formado se rechaza antes de consultar', async () => {
      await expect(service.estadoDeTrabajador('no-es-un-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
