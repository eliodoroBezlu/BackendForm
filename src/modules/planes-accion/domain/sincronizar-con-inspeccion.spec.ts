import { cambiosDesdeLaInspeccion } from './sincronizar-con-inspeccion';

const datos = {
  vicepresidencia: 'GERENCIA DE MANTENIMIENTO PLANTA',
  superintendenciaSenior: 'Superintendencia Senior no especificada',
  superintendencia: 'Sup. Flotación y Filtros',
  areaFisica: 'Filtros',
  empresa: 'MSC',
  supervisor: 'Jhonny Eugenio',
};

const tarea = (extra: Record<string, unknown> = {}) => ({
  instanceId: 'iro-1',
  activo: true,
  aprobado: false,
  responsableObservacion: 'Prueba Supervisor',
  empresa: 'MSC',
  lugarFisico: 'Filtros',
  responsableAreaCierre: 'Prueba Supervisor',
  ...extra,
});

describe('cambiosDesdeLaInspeccion', () => {
  it('el supervisor corregido en la IRO llega a sus tareas', () => {
    const { tareas } = cambiosDesdeLaInspeccion(
      { tareas: [tarea()] },
      'iro-1',
      datos,
    );

    expect(tareas).toEqual([
      {
        indice: 0,
        cambios: {
          responsableObservacion: 'Jhonny Eugenio',
          responsableAreaCierre: 'Jhonny Eugenio',
        },
      },
    ]);
  });

  it('si ya se eligió otro responsable de cierre, no se pisa', () => {
    const { tareas } = cambiosDesdeLaInspeccion(
      {
        tareas: [
          tarea({
            responsableAreaCierre: 'Marco A.',
            responsableAreaCierreUsername: 'marcoa',
          }),
        ],
      },
      'iro-1',
      datos,
    );

    expect(tareas[0].cambios).toEqual({
      responsableObservacion: 'Jhonny Eugenio',
    });
  });

  it('no toca tareas agregadas a mano, dadas de baja ni aprobadas', () => {
    const { tareas } = cambiosDesdeLaInspeccion(
      {
        tareas: [
          tarea({ instanceId: undefined }),
          tarea({ activo: false }),
          tarea({ aprobado: true }),
        ],
      },
      'iro-1',
      datos,
    );

    expect(tareas).toEqual([]);
  });

  it('la cabecera toma lo de la IRO, salvo lo que la IRO no dice', () => {
    const { cabecera } = cambiosDesdeLaInspeccion(
      {
        vicepresidencia: 'Otra gerencia',
        superintendenciaSenior: 'Sup. Sénior cargada a mano',
        superintendencia: 'Sup. Flotación y Filtros',
        areaFisica: 'Flotación',
        tareas: [],
      },
      'iro-1',
      datos,
    );

    expect(cabecera).toEqual({
      vicepresidencia: 'GERENCIA DE MANTENIMIENTO PLANTA',
      areaFisica: 'Filtros',
    });
  });
});
