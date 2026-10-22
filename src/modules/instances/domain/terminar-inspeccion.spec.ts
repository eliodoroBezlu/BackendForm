import {
  estadoAlGuardar,
  faltantesParaTerminar,
  seTermina,
  type InspeccionPorTerminar,
} from './terminar-inspeccion';

describe('faltantesParaTerminar', () => {
  const plantilla = {
    verificationFields: [
      { label: 'Área', required: true },
      { label: 'Observador', required: false },
    ],
  };

  const completa = (): InspeccionPorTerminar => ({
    verificationList: { Área: 'Flotación', Observador: '' },
    inspectionTeam: [
      { nombre: 'Ana', cargo: 'Supervisora', firma: 'data:image/png' },
    ],
    sections: [
      { questions: [{ response: 3 }, { response: 'N/A' }, { response: 0 }] },
    ],
    personalInvolucrado: [],
  });

  it('una inspeccion completa se puede terminar', () => {
    expect(faltantesParaTerminar(completa(), plantilla)).toEqual([]);
  });

  it('«N/A» y el cero cuentan como respondidas', () => {
    expect(faltantesParaTerminar(completa(), plantilla)).toEqual([]);
  });

  it('cuenta las preguntas sin responder', () => {
    const inspeccion = completa();
    inspeccion.sections = [
      { questions: [{ response: '' }, { response: null }, { response: 2 }] },
    ];

    expect(faltantesParaTerminar(inspeccion, plantilla)).toEqual([
      'Faltan responder 2 preguntas',
    ]);
  });

  it('pide los campos obligatorios de la lista de verificacion, no los opcionales', () => {
    const inspeccion = completa();
    inspeccion.verificationList = new Map([['Área', '  ']]);

    expect(faltantesParaTerminar(inspeccion, plantilla)).toEqual([
      'Faltan datos de la lista de verificación: Área',
    ]);
  });

  it('exige al menos un miembro del equipo, completo', () => {
    const sinEquipo = { ...completa(), inspectionTeam: [] };
    const sinFirma = {
      ...completa(),
      inspectionTeam: [{ nombre: 'Ana', cargo: 'Supervisora', firma: '' }],
    };

    expect(faltantesParaTerminar(sinEquipo, plantilla)).toEqual([
      'Falta el equipo de inspección',
    ]);
    expect(faltantesParaTerminar(sinFirma, plantilla)).toHaveLength(1);
  });

  it('el personal involucrado que se cargo debe estar completo', () => {
    const inspeccion = {
      ...completa(),
      personalInvolucrado: [{ nombre: 'Luis', ci: '' }],
    };

    expect(faltantesParaTerminar(inspeccion, plantilla)).toHaveLength(1);
  });
});

describe('estadoAlGuardar', () => {
  it('guardar avance deja el borrador como borrador', () => {
    expect(estadoAlGuardar('borrador', 'borrador')).toBe('borrador');
  });

  it('terminar pasa a completado', () => {
    expect(estadoAlGuardar('borrador', 'completado')).toBe('completado');
  });

  it('editar una terminada no la devuelve a borrador', () => {
    expect(estadoAlGuardar('completado', 'borrador')).toBe('completado');
    expect(estadoAlGuardar('aprobado', 'borrador')).toBe('aprobado');
  });

  it('sin estado pedido conserva el que tenia', () => {
    expect(estadoAlGuardar('completado', undefined)).toBe('completado');
    expect(estadoAlGuardar(undefined, undefined)).toBe('borrador');
  });
});

describe('seTermina', () => {
  it('solo el paso de borrador a terminada cuenta', () => {
    expect(seTermina('borrador', 'completado')).toBe(true);
    expect(seTermina(undefined, 'completado')).toBe(true);
    expect(seTermina('completado', 'completado')).toBe(false);
    expect(seTermina('borrador', 'borrador')).toBe(false);
  });
});
