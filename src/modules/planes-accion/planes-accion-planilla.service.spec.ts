import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { PlanesAccionPlanillaService } from './planes-accion-planilla.service';
import { PlanesAccionExcelService } from './planes-accion-excel.service';
import { PLANILLA } from './planilla-seguimiento';
import type { PlanDeAccion } from './schemas/plan-accion.schema';

const PLAN_ID = '6ad8c7764cad5e4a46481820';
const TAREA_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const nuevoPlan = () => ({
  _id: PLAN_ID,
  activo: true,
  vicepresidencia: 'VP',
  superintendenciaSenior: 'SS',
  superintendencia: 'S',
  areaFisica: 'Filtros',
  tareasAbiertas: 1,
  tareasEnProgreso: 0,
  tareasCerradas: 0,
  tareas: [
    {
      _id: TAREA_ID,
      numeroItem: 1,
      fechaHallazgo: new Date('2026-10-21T04:00:00Z'),
      responsableObservacion: 'Pérez Juan',
      empresa: 'MSC',
      lugarFisico: 'Filtros',
      actividad: 'Mantenimiento',
      familiaPeligro: '',
      descripcionObservacion: 'Bidones sin etiqueta',
      accionPropuesta: '',
      responsableAreaCierre: '',
      diasRetraso: 0,
      estado: 'abierto',
      aprobado: false,
      activo: true,
      evidencias: [{ nombre: 'foto.txt', url: '/no-existe/foto.txt' }],
      historial: [] as unknown[],
    },
  ],
  markModified: jest.fn(),
  save: jest.fn(),
});

async function planillaEditada(
  plan: ReturnType<typeof nuevoPlan>,
  editar: (hoja: ExcelJS.Worksheet) => void,
): Promise<Buffer> {
  const bajada = await new PlanesAccionExcelService().generarExcel(
    plan as unknown as PlanDeAccion,
  );
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(
    bajada as unknown as Parameters<typeof libro.xlsx.load>[0],
  );
  editar(libro.getWorksheet(PLANILLA.hoja)!);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

function servicio(plan: ReturnType<typeof nuevoPlan>) {
  const planModel = { findById: jest.fn().mockResolvedValue(plan) };
  const trabajadorModel = {
    find: () => ({
      select: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve([
              { nomina: 'Aguayo Rojas Victor Hugo', username: 'vaguayo' },
            ]),
        }),
      }),
    }),
  };
  return new PlanesAccionPlanillaService(
    planModel as never,
    trabajadorModel as never,
  );
}

const completarYCerrar = (hoja: ExcelJS.Worksheet) => {
  hoja.getCell('G12').value = 'Sustancias peligrosas';
  hoja.getCell('I12').value = 'Etiquetar los bidones según la hoja';
  hoja.getCell('J12').value = 'Aguayo Rojas Victor Hugo';
  hoja.getCell('M12').value = new Date('2026-11-20T00:00:00Z');
  hoja.getCell('N12').value = new Date('2026-11-05T00:00:00Z');
};

describe('PlanesAccionPlanillaService', () => {
  it('sin «aplicar» solo revisa: no guarda nada', async () => {
    const plan = nuevoPlan();
    const archivo = await planillaEditada(plan, completarYCerrar);
    const r = await servicio(plan).cargar(PLAN_ID, archivo, {
      aplicar: false,
      usuario: 'admin',
    });
    expect(r.aplicado).toBe(false);
    expect(r.resumen.actualiza).toBe(1);
    expect(r.filas[0]).not.toHaveProperty('pasos');
    expect(plan.save).not.toHaveBeenCalled();
    expect(plan.tareas[0].estado).toBe('abierto');
  });

  it('al aplicar cierra en dos pasos, los anota y recalcula el plan', async () => {
    const plan = nuevoPlan();
    const archivo = await planillaEditada(plan, completarYCerrar);
    const r = await servicio(plan).cargar(PLAN_ID, archivo, {
      aplicar: true,
      usuario: 'admin',
      archivo: 'Planilla.xlsx',
    });
    expect(r.aplicado).toBe(true);
    expect(plan.save).toHaveBeenCalledTimes(1);
    const tarea = plan.tareas[0] as Record<string, unknown> & {
      historial: {
        tipo: string;
        motivo: string;
        cambios: { campo: string }[];
      }[];
    };
    expect(tarea.estado).toBe('cerrado');
    expect(tarea.responsablesAreaCierreUsernames).toEqual(['vaguayo']);
    expect(tarea.historial).toHaveLength(2);
    expect(tarea.historial.every((h) => h.tipo === 'avance')).toBe(true);
    expect(tarea.historial[0].motivo).toBe(
      'Carga desde planilla «Planilla.xlsx»',
    );
    expect(plan.tareasCerradas).toBe(1);

    // La misma planilla otra vez ya no sirve: la tarea cambió desde entonces.
    const otraVez = await servicio(plan).cargar(PLAN_ID, archivo, {
      aplicar: true,
      usuario: 'admin',
    });
    expect(otraVez.resumen.conflicto).toBe(1);
    expect(otraVez.aplicado).toBe(false);
  });

  it('la planilla de otro plan se rechaza entera', async () => {
    const plan = nuevoPlan();
    const archivo = await planillaEditada(plan, (hoja) => {
      hoja.getCell(PLANILLA.celdaPlan).value = '6ad8c7764cad5e4a46480000';
    });
    await expect(
      servicio(plan).cargar(PLAN_ID, archivo, { aplicar: true, usuario: 'a' }),
    ).rejects.toThrow(BadRequestException);
    expect(plan.save).not.toHaveBeenCalled();
  });
});
