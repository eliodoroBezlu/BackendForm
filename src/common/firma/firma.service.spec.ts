import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { FirmaService } from './firma.service';
import { MetodoFirma, Firma } from './firma.schema';
import { AccionFirma, AuditoriaFirma } from './auditoria-firma.schema';

/**
 * Estas pruebas son el módulo. Si el hash no detecta una alteración, o la
 * cadena no se rompe al manipular un asiento, la función de auditoría no
 * existe aunque el código compile.
 */
describe('FirmaService', () => {
  let service: FirmaService;
  /** Bitácora en memoria que imita lo justo del modelo de Mongoose. */
  let bitacora: Record<string, unknown>[];

  const contexto = {
    usuario: 'eliodoro',
    ip: '10.0.0.5',
    userAgent: 'jest',
  };

  // PNG de 1x1 real, para tener bytes que decodifiquen de verdad.
  const PNG_1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const OTRO_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(async () => {
    bitacora = [];

    const modelo = {
      findOne: () => ({
        sort: () => ({
          lean: () => ({
            exec: () => Promise.resolve(bitacora[bitacora.length - 1] ?? null),
          }),
        }),
      }),
      find: (filtro: Record<string, unknown>) => {
        // Honra `hashFirma` y el `$ne` sobre `documentoId`; sin esto el doble
        // devuelve de más y la prueba mide el filtro equivocado.
        const excluido = (filtro.documentoId as { $ne?: string } | undefined)
          ?.$ne;
        const filtrados = bitacora.filter(
          (a) =>
            (filtro.hashFirma === undefined ||
              a.hashFirma === filtro.hashFirma) &&
            (excluido === undefined || a.documentoId !== excluido),
        );
        return {
          lean: () => ({ exec: () => Promise.resolve([...bitacora]) }),
          exec: () => Promise.resolve(filtrados),
          sort: () => ({
            lean: () => ({ exec: () => Promise.resolve([...bitacora]) }),
          }),
        };
      },
      create: (doc: Record<string, unknown>) => {
        const guardado = { ...doc, _id: `a${bitacora.length + 1}` };
        bitacora.push(guardado);
        return Promise.resolve(guardado);
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirmaService,
        { provide: getModelToken(AuditoriaFirma.name), useValue: modelo },
      ],
    }).compile();

    service = module.get<FirmaService>(FirmaService);
  });

  const ubicacion = (documentoId = 'doc1') => ({
    coleccion: 'entregas_linterna',
    documentoId,
    campo: 'firmaTrabajador',
  });

  describe('sellar', () => {
    it('calcula hash, fecha y autoría en el servidor', () => {
      const firma = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);

      expect(firma.hash).toHaveLength(64);
      expect(firma.firmadoPor).toBe('eliodoro');
      expect(firma.metodo).toBe(MetodoFirma.DIBUJADA);
      expect(firma.firmadoEn).toBeInstanceOf(Date);
      expect(firma.imagen).toBe(PNG_1x1);
    });

    it('la misma imagen da el mismo hash; una distinta, otro', () => {
      const a = service.sellar(PNG_1x1, MetodoFirma.SUBIDA, contexto);
      const b = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);
      const c = service.sellar(OTRO_PNG, MetodoFirma.SUBIDA, contexto);

      expect(a.hash).toBe(b.hash);
      expect(a.hash).not.toBe(c.hash);
    });

    it('rechaza lo que no es un data URL de imagen', () => {
      expect(() =>
        service.sellar(
          'https://ejemplo/firma.png',
          MetodoFirma.SUBIDA,
          contexto,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.sellar(
          'data:application/pdf;base64,AAAA',
          MetodoFirma.SUBIDA,
          contexto,
        ),
      ).toThrow(BadRequestException);
    });

    it('rechaza una firma vacía', () => {
      expect(() =>
        service.sellar(
          'data:image/png;base64,',
          MetodoFirma.DIBUJADA,
          contexto,
        ),
      ).toThrow(BadRequestException);
    });

    it('rechaza una imagen que supera los 10 MB', () => {
      const enorme = `data:image/png;base64,${'A'.repeat(15 * 1024 * 1024)}`;
      expect(() =>
        service.sellar(enorme, MetodoFirma.SUBIDA, contexto),
      ).toThrow(BadRequestException);
    });
  });

  describe('verificar', () => {
    it('una firma intacta verifica', () => {
      const firma = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);
      expect(service.verificar(firma).integra).toBe(true);
    });

    it('detecta que la imagen fue reemplazada después de sellarla', () => {
      const firma = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);

      // Alguien edita el documento en la base y cambia la imagen dejando el
      // hash viejo. Es exactamente el escenario que esto debe cazar.
      const alterada = { ...firma, imagen: OTRO_PNG } as Firma;

      const r = service.verificar(alterada);
      expect(r.integra).toBe(false);
      expect(r.hashRecalculado).not.toBe(r.hashGuardado);
    });
  });

  describe('bitácora encadenada', () => {
    it('el primer asiento no tiene anterior y los siguientes encadenan', async () => {
      const f1 = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);
      const f2 = service.sellar(OTRO_PNG, MetodoFirma.SUBIDA, contexto);

      const a1 = await service.registrarAsiento(f1, ubicacion('doc1'));
      const a2 = await service.registrarAsiento(f2, ubicacion('doc2'));

      expect(a1.hashAnterior).toBe('');
      expect(a2.hashAnterior).toBe(a1.hashAsiento);
      expect((await service.verificarCadena()).intacta).toBe(true);
    });

    it('romper un asiento invalida la cadena', async () => {
      const f1 = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);
      const f2 = service.sellar(OTRO_PNG, MetodoFirma.SUBIDA, contexto);
      await service.registrarAsiento(f1, ubicacion('doc1'));
      await service.registrarAsiento(f2, ubicacion('doc2'));

      // Manipulación directa en la base: se cambia quién firmó el primero.
      bitacora[0].firmadoPor = 'otro';

      const r = await service.verificarCadena();
      expect(r.intacta).toBe(false);
      expect(r.rupturas).toContain('a1');
    });

    it('registra la acción de refirmar', async () => {
      const firma = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);
      const asiento = await service.registrarAsiento(
        firma,
        ubicacion(),
        AccionFirma.REFIRMADA,
      );

      expect(asiento.accion).toBe(AccionFirma.REFIRMADA);
    });
  });

  describe('reutilización de firmas', () => {
    it('encuentra la misma imagen usada en otro documento', async () => {
      const firma = service.sellar(PNG_1x1, MetodoFirma.SUBIDA, contexto);
      await service.registrarAsiento(firma, ubicacion('doc1'));
      await service.registrarAsiento(firma, ubicacion('doc2'));

      const repetidas = await service.buscarReutilizacion(firma.hash, 'doc2');

      expect(repetidas).toHaveLength(1);
      expect(repetidas[0].documentoId).toBe('doc1');
    });

    it('no marca nada cuando cada documento tiene su propia firma', async () => {
      const f1 = service.sellar(PNG_1x1, MetodoFirma.DIBUJADA, contexto);
      const f2 = service.sellar(OTRO_PNG, MetodoFirma.DIBUJADA, contexto);
      await service.registrarAsiento(f1, ubicacion('doc1'));
      await service.registrarAsiento(f2, ubicacion('doc2'));

      expect(await service.buscarReutilizacion(f2.hash, 'doc2')).toHaveLength(
        0,
      );
    });
  });
});
