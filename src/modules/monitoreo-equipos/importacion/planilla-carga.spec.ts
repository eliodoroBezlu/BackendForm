import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { TipoCatalogoMonitoreo } from '../domain/catalogos-iniciales';
import { fecha, leerPlanillaDeCarga, numero } from './planilla-carga';

const PLANILLA = path.join(
  __dirname,
  '__fixtures__',
  'planilla-carga-bombas.xlsx',
);

/** Una planilla mínima armada en la prueba: cada hoja con su cabecera y sus filas. */
async function planilla(hojas: Record<string, unknown[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    filas.forEach((f) => ws.addRow(f));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const CAB_BOMBAS = [
  'TAG',
  'OT modelo',
  'Frecuencia (días)',
  'Fabricante',
  'Modelo',
  'Servicio / proceso',
  'TMEF (hrs)',
  'Tag de horas en PI',
  'Bombas pares',
  'Ubicación',
];
const CAB_COMP = [
  'TAG',
  'Pieza',
  'Proveedor',
  'Material / código',
  'Dureza (HB)',
  'Condición inicial',
  'Espesor nominal (mm)',
  'Espesor de precaución (mm)',
  'Fecha de instalación',
];
const CAB_INT = [
  'TAG',
  'Fecha',
  'Tipo de intervención',
  'N° OT',
  'Horas al intervenir',
  'Piezas cambiadas',
  'Fuente / nota',
];
const LISTAS = [
  ['Fabricante', 'Proveedor', 'Condición inicial', 'Tipo de intervención'],
  ['Warman', 'Weir Vulco', 'Nuevo', 'Mantenimiento'],
];

describe('leerPlanillaDeCarga', () => {
  describe('con la planilla que se envió a Confiabilidad', () => {
    it('lee las 21 bombas con su OT modelo y frecuencia, sin problemas graves', async () => {
      const leida = await leerPlanillaDeCarga(fs.readFileSync(PLANILLA));
      expect(leida.problemas.filter((p) => p.grave)).toEqual([]);
      expect(leida.bombas).toHaveLength(21);
      expect(leida.bombas.find((b) => b.tag === '230PP013')).toMatchObject({
        otModelo: '489249',
        frecuenciaDias: 28,
        tmefHrs: 2900,
        fabricante: 'Warman',
        modelo: 'WARMAN ASH 550 MMC',
        pares: ['230PP012', '230PP112'],
        tagPi: '\\\\PI_SERVER\\230PP013/HR',
      });
      expect(leida.bombas.find((b) => b.tag === '420PP557')).toMatchObject({
        tmefHrs: 5000,
        pares: ['420PP556'],
      });
    });

    it('solo carga los componentes con datos: las 4 piezas de la 230PP013', async () => {
      const leida = await leerPlanillaDeCarga(fs.readFileSync(PLANILLA));
      expect(leida.componentes.map((c) => `${c.tag} ${c.pieza}`)).toEqual([
        '230PP013 Voluta',
        '230PP013 Impulsor',
        '230PP013 Disco prensa',
        '230PP013 Disco succión',
      ]);
      expect(leida.componentes[0]).toMatchObject({
        proveedor: 'ALTONA',
        espesorNominalMm: 132,
        espesorPrecaucionMm: 36,
        fechaInstalacion: new Date(Date.UTC(2026, 5, 28)),
      });
      expect(leida.componentes[3]).toMatchObject({
        material: 'A-68',
        durezaHb: 550,
      });
    });

    it('lee las intervenciones y las piezas cambiadas', async () => {
      const leida = await leerPlanillaDeCarga(fs.readFileSync(PLANILLA));
      expect(leida.intervenciones).toHaveLength(3);
      expect(leida.intervenciones[0]).toMatchObject({
        tag: '230PP013',
        tipo: 'Cambio de piezas',
      });
      expect(leida.intervenciones[0].piezas).toHaveLength(4);
      expect(leida.intervenciones[1]).toMatchObject({
        tag: '420PP557',
        ot: '912994',
        horas: 5736,
      });
    });

    it('trae las listas para los catálogos', async () => {
      const leida = await leerPlanillaDeCarga(fs.readFileSync(PLANILLA));
      expect(leida.listas[TipoCatalogoMonitoreo.PROVEEDOR]).toEqual([
        'Weir Vulco',
        'ALTONA',
      ]);
      expect(leida.listas[TipoCatalogoMonitoreo.PUNTO_REFERENCIA]).toContain(
        'Brida ciega',
      );
    });
  });

  describe('lo que no se puede cargar', () => {
    it('un TAG mal escrito o repetido es grave', async () => {
      const leida = await leerPlanillaDeCarga(
        await planilla({
          Bombas: [CAB_BOMBAS, ['230-PP-013'], ['230PP013'], ['230PP013']],
          Componentes: [CAB_COMP],
          Intervenciones: [CAB_INT],
          Listas: LISTAS,
        }),
      );
      expect(leida.bombas.map((b) => b.tag)).toEqual(['230PP013']);
      expect(leida.problemas).toEqual([
        expect.objectContaining({
          fila: 2,
          grave: true,
          mensaje: expect.stringContaining('230-PP-013') as string,
        }),
        expect.objectContaining({
          fila: 4,
          grave: true,
          mensaje: 'TAG «230PP013» repetido',
        }),
      ]);
    });

    it('un número que no es número es grave; la coma decimal se acepta', async () => {
      const leida = await leerPlanillaDeCarga(
        await planilla({
          Bombas: [
            CAB_BOMBAS,
            ['230PP013', null, 'cada mes', null, null, null, '4500,5'],
          ],
          Componentes: [CAB_COMP],
          Intervenciones: [CAB_INT],
          Listas: LISTAS,
        }),
      );
      expect(leida.bombas[0].tmefHrs).toBe(4500.5);
      expect(leida.problemas).toEqual([
        expect.objectContaining({
          grave: true,
          mensaje: '«Frecuencia (días)» no es un número',
        }),
      ]);
    });

    it('un componente de una bomba que no está, o con una pieza que no existe, es grave', async () => {
      const leida = await leerPlanillaDeCarga(
        await planilla({
          Bombas: [CAB_BOMBAS, ['230PP013']],
          Componentes: [
            CAB_COMP,
            ['999PP999', 'Voluta', 'Weir Vulco'],
            ['230PP013', 'Rodete', 'Weir Vulco'],
            ['230PP013', 'disco SUCCION', 'Weir Vulco'],
            ['230PP013', 'Impulsor'],
          ],
          Intervenciones: [CAB_INT],
          Listas: LISTAS,
        }),
      );
      expect(leida.componentes.map((c) => c.pieza)).toEqual(['Disco succión']);
      expect(leida.problemas.map((p) => p.mensaje)).toEqual([
        'TAG «999PP999» no está en la hoja Bombas',
        expect.stringContaining('Pieza «Rodete» no es una de'),
      ]);
    });

    it('una intervención sin fecha es grave; un valor fuera de las listas es solo un aviso', async () => {
      const leida = await leerPlanillaDeCarga(
        await planilla({
          Bombas: [CAB_BOMBAS, ['230PP013', null, null, 'KSB']],
          Componentes: [CAB_COMP, ['230PP013', 'Voluta', 'Metso']],
          Intervenciones: [
            CAB_INT,
            ['230PP013', null, 'Mantenimiento'],
            [
              '230PP013',
              '15/02/2026',
              'Overhaul',
              null,
              null,
              'voluta, carcasa',
            ],
          ],
          Listas: LISTAS,
        }),
      );
      expect(leida.intervenciones).toHaveLength(1);
      expect(leida.intervenciones[0]).toMatchObject({
        fecha: new Date(Date.UTC(2026, 1, 15)),
        piezas: ['Voluta'],
      });
      expect(
        leida.problemas.filter((p) => p.grave).map((p) => p.mensaje),
      ).toEqual(['230PP013: la intervención no tiene fecha']);
      expect(
        leida.problemas.filter((p) => !p.grave).map((p) => p.mensaje),
      ).toEqual([
        'Fabricante «KSB» no está en la hoja Listas',
        'Proveedor «Metso» no está en la hoja Listas',
        'Tipo «Overhaul» no está en la hoja Listas',
        expect.stringContaining('Pieza cambiada «carcasa»'),
      ]);
    });

    it('sin la hoja Bombas no hay nada que cargar', async () => {
      const leida = await leerPlanillaDeCarga(
        await planilla({ Otra: [['x']] }),
      );
      expect(
        leida.problemas.filter((p) => p.grave).map((p) => p.mensaje),
      ).toEqual([
        'Falta la hoja «Bombas»',
        'Falta la hoja «Componentes»',
        'Falta la hoja «Intervenciones»',
      ]);
    });
  });

  describe('valores de celda', () => {
    it('numero y fecha distinguen vacío de inválido', () => {
      expect(numero(null)).toBeUndefined();
      expect(numero('12')).toBe(12);
      expect(numero('doce')).toBeNull();
      expect(fecha(null)).toBeUndefined();
      expect(fecha('31/02/2026')).toBeNull();
      expect(fecha('28/06/2026')).toEqual(new Date(Date.UTC(2026, 5, 28)));
    });
  });
});
