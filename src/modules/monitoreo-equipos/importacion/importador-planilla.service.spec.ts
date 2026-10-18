import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Equipo } from '../../equipos/schemas/equipo.schema';
import {
  DestinoNoResuelto,
  ResolucionOrganizacionalService,
} from '../../equipos/importacion/resolucion-organizacional.service';
import { UbicacionService } from '../../ubicacion/ubicacion.service';
import { ClasificacionService } from '../../clasificacion/clasificacion.service';
import { ConfigFormularioService } from '../../config-formulario/config-formulario.service';
import { TipoCatalogoMonitoreo } from '../domain/catalogos-iniciales';
import { MonitoreoCatalogosService } from '../monitoreo-catalogos.service';
import { CatalogoMonitoreo } from '../schemas/catalogo-monitoreo.schema';
import { ComponenteEquipo } from '../schemas/componente-equipo.schema';
import { IntervencionEquipo } from '../schemas/intervencion-equipo.schema';
import { ImportadorPlanillaService } from './importador-planilla.service';
import { igual, ModeloEnMemoria } from '../__pruebas__/modelo-en-memoria';

// ── Planillas ─────────────────────────────────────────────────────────────

const PLANILLA = fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'planilla-carga-bombas.xlsx'),
);

async function planilla(hojas: Record<string, unknown[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    filas.forEach((f) => ws.addRow(f));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const unaVoluta = (fecha: string) =>
  planilla({
    Bombas: [['TAG'], ['230PP013']],
    Componentes: [
      ['TAG', 'Pieza', 'Proveedor', 'Fecha de instalación'],
      ['230PP013', 'Voluta', 'Weir Vulco', fecha],
    ],
    Intervenciones: [['TAG', 'Fecha']],
  });

// ── Pruebas ───────────────────────────────────────────────────────────────

describe('ImportadorPlanillaService', () => {
  let importador: ImportadorPlanillaService;
  let catalogos: MonitoreoCatalogosService;
  let equipos: ModeloEnMemoria;
  let componentes: ModeloEnMemoria;
  let intervenciones: ModeloEnMemoria;
  let listas: ModeloEnMemoria;

  const AREA_CONFIABILIDAD = new Types.ObjectId();
  const resolucion = {
    precargar: jest.fn().mockResolvedValue(undefined),
    resolver: jest.fn(),
  };
  const ubicaciones = {
    findOrCreateByRuta: jest.fn().mockResolvedValue({ _id: 'ubicacion' }),
  };
  const clasificaciones = {
    findByNameOrCreate: jest.fn().mockResolvedValue({ _id: 'clasificacion' }),
  };
  const configFormularios = { create: jest.fn() };

  beforeEach(async () => {
    equipos = new ModeloEnMemoria();
    componentes = new ModeloEnMemoria();
    intervenciones = new ModeloEnMemoria();
    listas = new ModeloEnMemoria();
    resolucion.resolver.mockReturnValue({
      ambito: 'area',
      area_id: AREA_CONFIABILIDAD,
    });
    configFormularios.create.mockResolvedValue({});

    const modulo = await Test.createTestingModule({
      providers: [
        ImportadorPlanillaService,
        MonitoreoCatalogosService,
        { provide: getModelToken(Equipo.name), useValue: equipos },
        {
          provide: getModelToken(ComponenteEquipo.name),
          useValue: componentes,
        },
        {
          provide: getModelToken(IntervencionEquipo.name),
          useValue: intervenciones,
        },
        { provide: getModelToken(CatalogoMonitoreo.name), useValue: listas },
        { provide: ResolucionOrganizacionalService, useValue: resolucion },
        { provide: UbicacionService, useValue: ubicaciones },
        { provide: ClasificacionService, useValue: clasificaciones },
        { provide: ConfigFormularioService, useValue: configFormularios },
      ],
    }).compile();
    importador = modulo.get(ImportadorPlanillaService);
    catalogos = modulo.get(MonitoreoCatalogosService);
  });

  afterEach(() => jest.clearAllMocks());

  const aplicar = (archivo: Buffer) =>
    importador.importar(archivo, { aplicar: true, usuario: 'eliodoro' });

  describe('con la planilla de Confiabilidad', () => {
    it('sin aplicar solo dice qué haría y no escribe nada', async () => {
      const r = await importador.importar(PLANILLA, {
        aplicar: false,
        usuario: 'eliodoro',
      });

      expect(r.aplicado).toBe(false);
      expect(r.problemas.filter((p) => p.grave)).toEqual([]);
      expect(r.bombas.nuevas).toHaveLength(21);
      expect(r.componentes).toEqual({
        nuevos: 4,
        reemplazados: 0,
        actualizados: 0,
      });
      expect(r.intervenciones).toEqual({ nuevas: 3, actualizadas: 0 });
      expect(equipos.docs).toHaveLength(0);
      expect(listas.docs).toHaveLength(0);
    });

    it('al aplicar deja las 21 bombas en el inventario, en el área Confiabilidad', async () => {
      const r = await aplicar(PLANILLA);

      expect(r.aplicado).toBe(true);
      expect(equipos.docs).toHaveLength(21);
      const bomba = equipos.docs.find((e) => e.codigo === '230PP013');
      expect(bomba).toMatchObject({
        tipo_equipo: 'Bomba',
        marca: 'Warman',
        modelo: 'WARMAN ASH 550 MMC',
        area_id: AREA_CONFIABILIDAD,
        ubicacion_id: 'ubicacion',
        clasificacion_id: 'clasificacion',
        especificaciones: {
          'OT modelo': '489249',
          'Frecuencia (días)': 28,
          'Bombas pares': '230PP012, 230PP112',
        },
      });
      expect(ubicaciones.findOrCreateByRuta).toHaveBeenCalledWith(
        'Sin Ubicación',
      );
      expect(clasificaciones.findByNameOrCreate).toHaveBeenCalledWith('Bombas');
    });

    it('la 230PP013 queda con sus 4 piezas montadas y su intervención del 28-jun-26', async () => {
      await aplicar(PLANILLA);
      const bomba = equipos.docs.find((e) => e.codigo === '230PP013');

      const piezas = componentes.docs.filter((c) =>
        igual(c.equipo_id, bomba?._id),
      );
      expect(piezas.map((c) => c.pieza)).toEqual([
        'Voluta',
        'Impulsor',
        'Disco prensa',
        'Disco succión',
      ]);
      expect(piezas.every((c) => c.vigente === true)).toBe(true);
      expect(piezas[0]).toMatchObject({
        espesor_nominal_mm: 132,
        espesor_precaucion_mm: 36,
        registradoPor: 'eliodoro',
      });

      expect(
        intervenciones.docs.filter((i) => igual(i.equipo_id, bomba?._id)),
      ).toEqual([
        expect.objectContaining({
          fecha: new Date(Date.UTC(2026, 5, 28)),
          tipo: 'Cambio de piezas',
          origen: 'planilla',
        }),
      ]);
    });

    it('siembra los catálogos y crea la ficha «Bomba»', async () => {
      await aplicar(PLANILLA);

      const tipos = new Set(listas.docs.map((d) => d.tipo));
      expect(tipos.size).toBe(Object.values(TipoCatalogoMonitoreo).length);
      expect(configFormularios.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo_equipo: 'Bomba' }),
      );
    });

    it('subirla dos veces deja la base igual que subirla una', async () => {
      await aplicar(PLANILLA);
      const r = await aplicar(PLANILLA);

      expect(r.bombas).toMatchObject({ nuevas: [] });
      expect(r.bombas.actualizadas).toHaveLength(21);
      expect(r.componentes).toEqual({
        nuevos: 0,
        reemplazados: 0,
        actualizados: 4,
      });
      expect(r.intervenciones).toEqual({ nuevas: 0, actualizadas: 3 });
      expect(equipos.docs).toHaveLength(21);
      expect(componentes.docs).toHaveLength(4);
      expect(intervenciones.docs).toHaveLength(3);
    });
  });

  describe('cambios de pieza', () => {
    beforeEach(() => aplicar(PLANILLA));

    it('una voluta instalada después retira la anterior y la conserva', async () => {
      const r = await aplicar(await unaVoluta('10/10/2026'));

      expect(r.componentes.reemplazados).toBe(1);
      const volutas = componentes.docs.filter((c) => c.pieza === 'Voluta');
      expect(volutas).toEqual([
        expect.objectContaining({
          vigente: false,
          retirado_en: new Date(Date.UTC(2026, 9, 10)),
          proveedor: 'ALTONA',
        }),
        expect.objectContaining({ vigente: true, proveedor: 'Weir Vulco' }),
      ]);
    });

    it('una voluta con fecha anterior a la montada no se carga y se avisa', async () => {
      const r = await aplicar(await unaVoluta('01/01/2026'));

      expect(r.aplicado).toBe(true);
      expect(r.problemas).toEqual([
        expect.objectContaining({
          grave: false,
          mensaje: expect.stringContaining('anterior') as string,
        }),
      ]);
      expect(componentes.docs.filter((c) => c.pieza === 'Voluta')).toEqual([
        expect.objectContaining({ vigente: true, proveedor: 'ALTONA' }),
      ]);
    });
  });

  describe('lo que la base no deja cargar', () => {
    it('un TAG que el inventario tiene como otro tipo de equipo es grave y no se escribe nada', async () => {
      await equipos.create({ codigo: '230PP013', tipo_equipo: 'Motor' });

      const r = await aplicar(PLANILLA);

      expect(r.aplicado).toBe(false);
      expect(r.problemas).toContainEqual(
        expect.objectContaining({
          grave: true,
          mensaje:
            '230PP013 ya está en el inventario como «Motor», no como bomba',
        }),
      );
      expect(equipos.docs).toHaveLength(1);
    });

    it('si el área Confiabilidad no está en el maestro, no se carga', async () => {
      resolucion.resolver.mockImplementation(() => {
        throw new DestinoNoResuelto('Área "Confiabilidad" no existe');
      });

      const r = await aplicar(PLANILLA);

      expect(r.aplicado).toBe(false);
      expect(r.problemas).toContainEqual(
        expect.objectContaining({ grave: true, hoja: 'Bombas' }),
      );
    });

    it('una bomba que ya estaba conserva lo que la planilla no trae', async () => {
      await equipos.create({
        codigo: '230PP013',
        tipo_equipo: 'Bomba',
        marca: 'KSB',
        especificaciones: { 'Cargado a mano': 'sí', 'TMEF (hrs)': 1 },
      });

      await aplicar(
        await planilla({
          Bombas: [
            ['TAG', 'TMEF (hrs)'],
            ['230PP013', 4500],
          ],
          Componentes: [['TAG', 'Pieza']],
          Intervenciones: [['TAG', 'Fecha']],
        }),
      );

      expect(equipos.docs[0]).toMatchObject({
        marca: 'KSB',
        especificaciones: { 'Cargado a mano': 'sí', 'TMEF (hrs)': 4500 },
      });
    });

    it('un archivo que no es Excel se rechaza con un mensaje claro', async () => {
      await expect(aplicar(Buffer.from('hola'))).rejects.toThrow(
        'El archivo no es un Excel .xlsx válido',
      );
    });
  });

  describe('MonitoreoCatalogosService', () => {
    it('sembrar solo llena los catálogos que nunca tuvieron nada', async () => {
      await listas.create({
        tipo: TipoCatalogoMonitoreo.FABRICANTE,
        valor: 'KSB',
        valor_normalizado: 'KSB',
        activo: false,
      });
      configFormularios.create.mockRejectedValue(new ConflictException());

      const r = await catalogos.sembrar();

      expect(r.sembrados).not.toContain(TipoCatalogoMonitoreo.FABRICANTE);
      expect(r.sembrados).toHaveLength(
        Object.values(TipoCatalogoMonitoreo).length - 1,
      );
      expect(r.fichaBombaCreada).toBe(false);
      expect((await catalogos.sembrar()).sembrados).toEqual([]);
    });

    it('no deja repetir un valor escrito de otra forma', async () => {
      await catalogos.crear({
        tipo: TipoCatalogoMonitoreo.PROVEEDOR,
        valor: 'Weir Vulco',
      });
      await expect(
        catalogos.crear({
          tipo: TipoCatalogoMonitoreo.PROVEEDOR,
          valor: '  weir   VULCO ',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('dar de alta un valor dado de baja lo restaura en vez de duplicarlo', async () => {
      const metso = await catalogos.crear({
        tipo: TipoCatalogoMonitoreo.PROVEEDOR,
        valor: 'Metso',
      });
      await catalogos.darDeBaja(String(metso._id), 'eliodoro');

      const otraVez = await catalogos.crear({
        tipo: TipoCatalogoMonitoreo.PROVEEDOR,
        valor: 'METSO',
      });

      expect(String(otraVez._id)).toBe(String(metso._id));
      expect(listas.docs).toHaveLength(1);
      expect(listas.docs[0]).toMatchObject({ activo: true, valor: 'METSO' });
    });

    it('la planilla no reactiva un valor que se dio de baja', async () => {
      const metso = await catalogos.crear({
        tipo: TipoCatalogoMonitoreo.PROVEEDOR,
        valor: 'Metso',
      });
      await catalogos.darDeBaja(String(metso._id), 'eliodoro');

      const r = await catalogos.agregarFaltantes(
        TipoCatalogoMonitoreo.PROVEEDOR,
        ['metso', 'Weir Vulco'],
      );

      expect(r).toEqual({ agregados: ['Weir Vulco'], dadosDeBaja: ['Metso'] });
    });
  });
});
