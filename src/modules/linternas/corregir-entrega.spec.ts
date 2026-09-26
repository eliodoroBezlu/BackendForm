import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LinternasService } from './linternas.service';
import {
  EntregaLinterna,
  EstadoEntrega,
  TipoEntrega,
} from './schemas/entrega-linterna.schema';
import { StockLinternasService } from './stock-linternas.service';
import { FirmaService } from '../../common/firma/firma.service';

/**
 * Corregir una entrega mal registrada.
 *
 * El caso real: se registro un «cambio» cuando era una «perdida». No es un
 * campo mal puesto — los dos tipos son actos distintos:
 *
 *   cambio   → exige foto de la averiada, descuenta stock ya, nace registrada
 *   perdida  → exige justificacion, no descuenta, nace pendiente_aprobacion
 *
 * Escribir `tipo` a secas dejaria una unidad descontada que no debia, un estado
 * que no corresponde y una foto que sobra. Lo que se comprueba aqui es que la
 * conversion mueve **las tres cosas** a la vez.
 */

const ID = new Types.ObjectId().toHexString();

const entrega = (
  tipo: TipoEntrega,
  estado: EstadoEntrega,
  extra: Record<string, unknown> = {},
) => {
  const doc: Record<string, unknown> = {
    _id: ID,
    tipo,
    estado,
    devolucion: undefined,
    perdida: undefined,
    reclasificaciones: [],
    set: jest.fn((cambios: Record<string, unknown>) => {
      Object.assign(doc, cambios);
    }),
    save: jest.fn(),
    ...extra,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};

describe('LinternasService - corregir una entrega mal registrada', () => {
  let servicio: LinternasService;
  let stock: { descontarUna: jest.Mock; reponerUna: jest.Mock };
  let documento: Record<string, unknown>;

  const construir = async (doc: Record<string, unknown>) => {
    documento = doc;
    stock = {
      descontarUna: jest.fn().mockResolvedValue(undefined),
      reponerUna: jest.fn().mockResolvedValue(undefined),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        LinternasService,
        {
          provide: getModelToken(EntregaLinterna.name),
          useValue: {
            findById: jest.fn(() => ({
              exec: jest.fn().mockResolvedValue(doc),
            })),
            find: jest.fn(() => ({
              sort: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          // El servicio inyecta el modelo de trabajadores por nombre.
          provide: getModelToken('Trabajador'),
          useValue: { findById: jest.fn(), findOne: jest.fn() },
        },
        { provide: StockLinternasService, useValue: stock },
        {
          provide: FirmaService,
          useValue: { sellar: jest.fn(), registrarAsiento: jest.fn() },
        },
      ],
    }).compile();

    servicio = modulo.get(LinternasService);
  };

  const contexto = { usuario: 'almacen1' } as never;

  describe('reclasificar', () => {
    const aPerdida = {
      tipo: TipoEntrega.REPOSICION_PERDIDA,
      trabajador: new Types.ObjectId().toHexString(),
      perdida: { justificacion: 'Se cayo al pique' },
      motivo: 'Se registro mal',
    } as never;

    it('de cambio a perdida devuelve la unidad al stock', async () => {
      // El cambio la descontó al registrarse; en el flujo de perdida la
      // linterna sale al aprobar, asi que ahora no debe estar descontada.
      await construir(
        entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA, {
          devolucion: { foto: { url: 'x' } },
        }),
      );

      await servicio.reclasificar(ID, aPerdida, contexto);

      expect(stock.reponerUna).toHaveBeenCalledTimes(1);
      expect(stock.descontarUna).not.toHaveBeenCalled();
    });

    it('de cambio a perdida deja la entrega pendiente de aprobacion', async () => {
      await construir(
        entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA, {
          devolucion: { foto: { url: 'x' } },
        }),
      );

      await servicio.reclasificar(ID, aPerdida, contexto);

      expect(documento.estado).toBe(EstadoEntrega.PENDIENTE_APROBACION);
      expect(documento.tipo).toBe(TipoEntrega.REPOSICION_PERDIDA);
    });

    it('suelta la devolucion, que en una perdida no pinta nada', async () => {
      await construir(
        entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA, {
          devolucion: { foto: { url: 'x' } },
        }),
      );

      await servicio.reclasificar(ID, aPerdida, contexto);

      expect(documento.devolucion).toBeUndefined();
      expect(documento.perdida).toEqual({ justificacion: 'Se cayo al pique' });
    });

    it('exige la justificacion que pide el tipo nuevo', async () => {
      await construir(entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA));

      await expect(
        servicio.reclasificar(
          ID,
          {
            tipo: TipoEntrega.REPOSICION_PERDIDA,
            motivo: 'x',
          } as never,
          contexto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deja el rastro de que a que, quien y por que', async () => {
      await construir(
        entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA, {
          devolucion: { foto: { url: 'x' } },
        }),
      );

      await servicio.reclasificar(ID, aPerdida, contexto);

      const rastro = documento.reclasificaciones as Record<string, unknown>[];
      expect(rastro).toHaveLength(1);
      expect(rastro[0].tipoAnterior).toBe(TipoEntrega.CAMBIO);
      expect(rastro[0].tipoNuevo).toBe(TipoEntrega.REPOSICION_PERDIDA);
      expect(rastro[0].reclasificadaPor).toBe('almacen1');
      expect(rastro[0].motivo).toBe('Se registro mal');
    });

    it('NO reclasifica una entrega ya firmada', async () => {
      // El acta dice lo que alguien firmo y no se reescribe.
      await construir(
        entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA, {
          firmaTrabajador: { hash: 'abc' },
        }),
      );

      await expect(
        servicio.reclasificar(ID, aPerdida, contexto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stock.reponerUna).not.toHaveBeenCalled();
    });

    it('rechaza reclasificar al mismo tipo', async () => {
      await construir(entrega(TipoEntrega.CAMBIO, EstadoEntrega.REGISTRADA));

      await expect(
        servicio.reclasificar(
          ID,
          { tipo: TipoEntrega.CAMBIO, motivo: 'x' } as never,
          contexto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('corregir la observacion', () => {
    it('la cambia mientras no haya firma', async () => {
      await construir(
        entrega(TipoEntrega.DOTACION, EstadoEntrega.REGISTRADA, {
          observacion: 'mal escrito',
        }),
      );

      await servicio.corregir(ID, { observacion: 'bien escrito' }, contexto);

      expect(documento.observacion).toBe('bien escrito');
    });

    it('NO la cambia si ya esta firmada', async () => {
      await construir(
        entrega(TipoEntrega.DOTACION, EstadoEntrega.REGISTRADA, {
          observacion: 'lo firmado',
          firmaTrabajador: { hash: 'abc' },
        }),
      );

      await expect(
        servicio.corregir(ID, { observacion: 'otra cosa' }, contexto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(documento.observacion).toBe('lo firmado');
    });
  });

  describe('anular', () => {
    it('marca anulada y deja motivo, quien y cuando', async () => {
      await construir(entrega(TipoEntrega.DOTACION, EstadoEntrega.REGISTRADA));

      await servicio.anular(ID, { motivo: 'Registro duplicado' }, contexto);

      expect(documento.estado).toBe(EstadoEntrega.ANULADA);
      expect(documento.motivoAnulacion).toBe('Registro duplicado');
      expect(documento.anuladaPor).toBe('almacen1');
      expect(documento.fechaAnulacion).toBeInstanceOf(Date);
    });

    it('NO repone el stock si no se declara que la linterna volvio', async () => {
      // El sistema no puede saberlo, y suponerlo dejaria en el inventario una
      // unidad de mas que no esta en el almacen.
      await construir(entrega(TipoEntrega.DOTACION, EstadoEntrega.REGISTRADA));

      await servicio.anular(ID, { motivo: 'x' }, contexto);

      expect(stock.reponerUna).not.toHaveBeenCalled();
    });

    it('repone el stock si se declara que volvio', async () => {
      await construir(entrega(TipoEntrega.DOTACION, EstadoEntrega.REGISTRADA));

      await servicio.anular(
        ID,
        { motivo: 'x', linternaRecuperada: true },
        contexto,
      );

      expect(stock.reponerUna).toHaveBeenCalledTimes(1);
    });

    it('una perdida sin aprobar no repone nada, porque nunca descontó', async () => {
      await construir(
        entrega(
          TipoEntrega.REPOSICION_PERDIDA,
          EstadoEntrega.PENDIENTE_APROBACION,
        ),
      );

      await servicio.anular(
        ID,
        { motivo: 'x', linternaRecuperada: true },
        contexto,
      );

      expect(stock.reponerUna).not.toHaveBeenCalled();
    });

    it('no se anula dos veces', async () => {
      await construir(entrega(TipoEntrega.DOTACION, EstadoEntrega.ANULADA));

      await expect(
        servicio.anular(ID, { motivo: 'x' }, contexto),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
