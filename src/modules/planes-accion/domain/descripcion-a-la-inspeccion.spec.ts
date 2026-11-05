import { comentarioALaInspeccion } from './descripcion-a-la-inspeccion';

const plantilla = {
  sections: [
    { _id: 's-general', title: 'GENERAL' },
    {
      _id: 'padre',
      title: 'EQUIPOS',
      isParent: true,
      subsections: [{ _id: 's-extintores', title: 'Extintores' }],
    },
  ],
};

const secciones = [
  {
    sectionId: 's-general',
    questions: [
      { questionText: '¿Hay orden y limpieza?', response: 3 },
      {
        questionText: '¿Las sustancias peligrosas están ordenadas?',
        response: 1,
        comment: 'Bidones sin rotular',
      },
    ],
  },
  {
    sectionId: 's-extintores',
    questions: [
      {
        questionText: '¿Tienen carga vigente?',
        response: 2,
        comment: 'Uno vencido',
      },
    ],
  },
];

const tarea = (extra: Record<string, unknown> = {}) => ({
  instanceId: 'iro-1',
  activo: true,
  aprobado: false,
  sectionTitle: 'GENERAL',
  questionText: '¿Las sustancias peligrosas están ordenadas?',
  descripcionObservacion: 'Bidones de solvente sin rotular en el estante 2',
  ...extra,
});

describe('comentarioALaInspeccion', () => {
  it('la descripción corregida va al comentario de su pregunta', () => {
    expect(comentarioALaInspeccion(tarea(), secciones, plantilla)).toEqual({
      seccion: 0,
      pregunta: 1,
      antes: 'Bidones sin rotular',
      despues: 'Bidones de solvente sin rotular en el estante 2',
    });
  });

  it('encuentra la pregunta en una subsección y sin importar mayúsculas ni tildes', () => {
    expect(
      comentarioALaInspeccion(
        tarea({
          sectionTitle: 'extintores ',
          questionText: '¿TIENEN CARGA VIGENTE?',
          descripcionObservacion: 'Extintor 4 vencido en marzo\n',
        }),
        secciones,
        plantilla,
      ),
    ).toEqual({
      seccion: 1,
      pregunta: 0,
      antes: 'Uno vencido',
      despues: 'Extintor 4 vencido en marzo',
    });
  });

  it('si la IRO ya dice lo mismo, no hay nada que escribir', () => {
    expect(
      comentarioALaInspeccion(
        tarea({ descripcionObservacion: 'Bidones sin rotular ' }),
        secciones,
        plantilla,
      ),
    ).toBeNull();
  });

  it('no toca la IRO por tareas aprobadas, dadas de baja o agregadas a mano', () => {
    for (const extra of [
      { aprobado: true },
      { activo: false },
      { instanceId: undefined },
    ]) {
      expect(
        comentarioALaInspeccion(tarea(extra), secciones, plantilla),
      ).toBeNull();
    }
  });

  it('si la pregunta ya no está en la IRO, no escribe nada', () => {
    expect(
      comentarioALaInspeccion(
        tarea({ questionText: 'Una pregunta que no existe' }),
        secciones,
        plantilla,
      ),
    ).toBeNull();
  });
});
