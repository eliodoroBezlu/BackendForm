import * as ExcelJS from 'exceljs';
import { PlanesAccionExcelService } from './planes-accion-excel.service';
import {
  leerPlanillaDeSeguimiento,
  PLANILLA,
  PlanillaInvalida,
} from './planilla-seguimiento';
import { planificarCarga } from './domain/carga-planilla';
import type { PlanDeAccion } from './schemas/plan-accion.schema';

const tareaBase = {
  numeroItem: 1,
  fechaHallazgo: new Date('2026-10-21T04:00:00Z'),
  responsableObservacion: 'Pérez Juan',
  empresa: 'MSC',
  lugarFisico: 'Filtros',
  actividad: 'Mantenimiento',
  familiaPeligro: '',
  descripcionObservacion: 'Bidones sin etiqueta\ncerca del tanque',
  accionPropuesta: '',
  responsableAreaCierre: '',
  diasRetraso: 0,
  estado: 'abierto',
  aprobado: false,
  activo: true,
  evidencias: [],
};

const PLAN_ID = '6ad8c7764cad5e4a46481820';
const plan = {
  _id: PLAN_ID,
  vicepresidencia: 'VP',
  superintendenciaSenior: 'SS',
  superintendencia: 'S',
  areaFisica: 'Filtros',
  tareas: [
    {
      ...tareaBase,
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      historial: [{ fecha: new Date(), usuario: 'eliodoro' }],
    },
    {
      ...tareaBase,
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      numeroItem: 2,
      historial: [],
    },
  ],
} as unknown as PlanDeAccion;

const responsables = [
  { nomina: 'Aguayo Rojas Victor Hugo', username: 'vaguayo' },
];

async function descargarYEditar(
  editar: (hoja: ExcelJS.Worksheet) => void,
): Promise<Buffer> {
  const descargada = await new PlanesAccionExcelService().generarExcel(plan);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(
    descargada as unknown as Parameters<typeof libro.xlsx.load>[0],
  );
  editar(libro.getWorksheet(PLANILLA.hoja)!);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe('planilla de seguimiento: descargar, editar y subir', () => {
  it('sin tocar nada, cada fila llega a su tarea y no cambia nada', async () => {
    const leida = await leerPlanillaDeSeguimiento(
      await descargarYEditar(() => undefined),
    );
    expect(leida.planId).toBe(PLAN_ID);
    expect(leida.filas.map((f) => [f.fila, f.tareaId, f.version])).toEqual([
      [12, 'aaaaaaaaaaaaaaaaaaaaaaaa', 1],
      [13, 'bbbbbbbbbbbbbbbbbbbbbbbb', 0],
    ]);
    const resultado = planificarCarga({
      filas: leida.filas,
      tareas: plan.tareas as never,
      responsables,
    });
    expect(resultado.map((r) => r.resultado)).toEqual([
      'sin-cambios',
      'sin-cambios',
    ]);
  });

  it('lo que se escribe en la hoja llega a la tarea, aunque se ordenen las filas', async () => {
    const editada = await descargarYEditar((hoja) => {
      // La persona invierte las dos filas (con sus columnas ocultas) …
      const a = hoja.getRow(12).values;
      const b = hoja.getRow(13).values;
      hoja.getRow(12).values = b as ExcelJS.CellValue[];
      hoja.getRow(13).values = a as ExcelJS.CellValue[];
      // … y completa la que quedó arriba (la segunda tarea).
      hoja.getCell('G12').value = 'Sustancias peligrosas';
      hoja.getCell('I12').value = 'Etiquetar los bidones según la hoja';
      hoja.getCell('J12').value = 'Aguayo Rojas Victor Hugo';
      hoja.getCell('M12').value = '20/11/2026';
    });
    const leida = await leerPlanillaDeSeguimiento(editada);
    const [arriba, abajo] = planificarCarga({
      filas: leida.filas,
      tareas: plan.tareas as never,
      responsables,
    });
    expect(arriba).toMatchObject({
      tareaId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      resultado: 'actualiza',
    });
    expect(abajo.resultado).toBe('sin-cambios');
  });

  it('un Excel que no es la planilla no se acepta', async () => {
    const otro = new ExcelJS.Workbook();
    otro.addWorksheet('Hoja1');
    await expect(
      leerPlanillaDeSeguimiento(Buffer.from(await otro.xlsx.writeBuffer())),
    ).rejects.toThrow(PlanillaInvalida);
    await expect(
      leerPlanillaDeSeguimiento(Buffer.from('no es excel')),
    ).rejects.toThrow(PlanillaInvalida);
  });
});
