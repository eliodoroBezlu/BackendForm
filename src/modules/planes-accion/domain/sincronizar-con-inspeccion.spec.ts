import {
  cambiosDesdeLaInspeccion,
  claveDePregunta,
  type DatosDeLaInspeccion,
} from './sincronizar-con-inspeccion';

const metadatos = {
  vicepresidencia: 'GERENCIA DE MANTENIMIENTO PLANTA',
  superintendenciaSenior: 'Superintendencia Senior no especificada',
  superintendencia: 'Sup. Flotación y Filtros',
  areaFisica: 'Filtros',
  empresa: 'MSC',
  supervisor: 'Jhonny Eugenio',
};
const PREGUNTA = claveDePregunta(
  'ALMACENAMIENTO',
  '¿Los productos están rotulados?',
);

const iro = (
  cambios: Partial<typeof metadatos> = {},
  descripcion = 'Bidones de solvente sin rotular en el estante 2',
): DatosDeLaInspeccion => ({
  metadatos: { ...metadatos, ...cambios },
  descripciones: { [PREGUNTA]: descripcion },
});

const tarea = (extra: Record<string, unknown> = {}) => ({
  instanceId: 'iro-1',
  activo: true,
  aprobado: false,
  sectionTitle: 'ALMACENAMIENTO',
  questionText: '¿Los productos están rotulados?',
  responsableObservacion: 'Prueba Supervisor',
  empresa: 'MSC',
  lugarFisico: 'Filtros',
  descripcionObservacion: 'Bidones de solvente sin rotular en el estante 2',
  responsableAreaCierre: 'Prueba Supervisor',
  ...extra,
});

describe('cambiosDesdeLaInspeccion', () => {
  it('el supervisor corregido en la IRO llega a sus tareas', () => {
    const { tareas } = cambiosDesdeLaInspeccion(
      { tareas: [tarea()] },
      'iro-1',
      iro(),
      iro({ supervisor: 'Prueba Supervisor' }),
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

  it('la observación reescrita en la IRO llega a la descripción de su tarea', () => {
    const { tareas } = cambiosDesdeLaInspeccion(
      { tareas: [tarea({ responsableObservacion: 'Jhonny Eugenio' })] },
      'iro-1',
      iro({}, 'Tres bidones de thinner sin etiqueta SGA, estante 2 del pañol'),
      iro(),
    );

    expect(tareas[0].cambios).toEqual({
      descripcionObservacion:
        'Tres bidones de thinner sin etiqueta SGA, estante 2 del pañol',
    });
  });

  it('reconoce la pregunta aunque la plantilla haya cambiado el id de la sección', () => {
    // La tarea guardó el id viejo y el título con otras mayúsculas.
    const { tareas } = cambiosDesdeLaInspeccion(
      {
        tareas: [
          tarea({
            sectionId: 'id-viejo',
            sectionTitle: 'Almacenamiento ',
            responsableObservacion: 'Jhonny Eugenio',
          }),
        ],
      },
      'iro-1',
      iro({}, 'Texto nuevo'),
      iro(),
    );

    expect(tareas[0].cambios).toEqual({
      descripcionObservacion: 'Texto nuevo',
    });
  });

  it('lo corregido en el plan se queda si en la IRO se editó otra cosa', () => {
    // En el plan se puso a dos responsables y se mejoró la descripción; en la
    // IRO solo se cambió la empresa.
    const { tareas } = cambiosDesdeLaInspeccion(
      {
        tareas: [
          tarea({
            responsableObservacion: 'Ana Pérez, Luis Mamani',
            descripcionObservacion: 'Texto corregido en el plan',
          }),
        ],
      },
      'iro-1',
      iro({ supervisor: 'Prueba Supervisor', empresa: 'Contratista X' }),
      iro({ supervisor: 'Prueba Supervisor' }),
    );

    expect(tareas[0].cambios).toEqual({ empresa: 'Contratista X' });
  });

  it('sin la IRO de antes (sincronizar a mano) trae todo lo de la IRO', () => {
    const { tareas } = cambiosDesdeLaInspeccion(
      {
        tareas: [
          tarea({ descripcionObservacion: 'Texto corregido en el plan' }),
        ],
      },
      'iro-1',
      iro(),
    );

    expect(tareas[0].cambios).toEqual({
      responsableObservacion: 'Jhonny Eugenio',
      responsableAreaCierre: 'Jhonny Eugenio',
      descripcionObservacion: 'Bidones de solvente sin rotular en el estante 2',
    });
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
      iro(),
      iro({ supervisor: 'Prueba Supervisor' }),
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
      iro(),
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
      iro(),
    );

    expect(cabecera).toEqual({
      vicepresidencia: 'GERENCIA DE MANTENIMIENTO PLANTA',
      areaFisica: 'Filtros',
    });
  });

  it('la cabecera corregida en el plan se queda si la IRO no la cambió', () => {
    const { cabecera } = cambiosDesdeLaInspeccion(
      { areaFisica: 'Flotación', tareas: [] },
      'iro-1',
      iro(),
      iro(),
    );

    expect(cabecera).toEqual({});
  });
});
