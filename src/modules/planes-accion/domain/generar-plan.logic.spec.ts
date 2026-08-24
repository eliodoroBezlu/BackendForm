import {
  determinarFamiliaPeligro,
  extraerPuntaje,
  generarTareasDesdeInstancia,
  requierePlanDeAccion,
  type InstanceLike,
  type TemplateLike,
} from './generar-plan.logic';

describe('extraerPuntaje', () => {
  it('acepta el puntaje como numero o como texto', () => {
    expect(extraerPuntaje(2)).toBe(2);
    expect(extraerPuntaje('2')).toBe(2);
  });

  it('«N/A» no es un puntaje: la pregunta no aplicaba', () => {
    expect(extraerPuntaje('N/A')).toBeNull();
  });

  it('lo que no es un numero devuelve null, no NaN', () => {
    expect(extraerPuntaje('sin respuesta')).toBeNull();
    expect(extraerPuntaje('')).toBeNull();
  });

  it('el cero es un puntaje valido, no un vacio', () => {
    // Es el peor puntaje posible: confundirlo con «sin dato» dejaria fuera
    // justo las observaciones mas graves.
    expect(extraerPuntaje(0)).toBe(0);
    expect(extraerPuntaje('0')).toBe(0);
  });
});

describe('requierePlanDeAccion', () => {
  describe('por defecto (solo puntajes bajos y con comentario)', () => {
    it('un puntaje bajo con comentario genera tarea', () => {
      expect(requierePlanDeAccion(1, 'Falta baranda', {})).toBe(true);
    });

    it('un puntaje bajo SIN comentario no genera tarea', () => {
      expect(requierePlanDeAccion(1, undefined, {})).toBe(false);
      expect(requierePlanDeAccion(1, '   ', {})).toBe(false);
    });

    it('un puntaje conforme no genera tarea aunque haya comentario', () => {
      expect(requierePlanDeAccion(4, 'Todo correcto', {})).toBe(false);
    });

    it('el 3 queda fuera salvo que se pida expresamente', () => {
      expect(requierePlanDeAccion(3, 'Mejorable', {})).toBe(false);
    });
  });

  describe('con incluirPuntaje3', () => {
    it('el 3 entra, pero solo si trae comentario', () => {
      const opciones = { incluirPuntaje3: true };
      expect(requierePlanDeAccion(3, 'Mejorable', opciones)).toBe(true);
      expect(requierePlanDeAccion(3, undefined, opciones)).toBe(false);
    });
  });

  describe('con incluirSoloConComentario desactivado', () => {
    it('todo puntaje bajo entra, tenga o no comentario', () => {
      const opciones = { incluirSoloConComentario: false };
      expect(requierePlanDeAccion(1, undefined, opciones)).toBe(true);
      expect(requierePlanDeAccion(0, '', opciones)).toBe(true);
    });
  });
});

describe('determinarFamiliaPeligro', () => {
  it('reconoce la familia por una palabra de la seccion', () => {
    expect(determinarFamiliaPeligro('Trabajos en altura')).toBe(
      'Trabajo en Altura',
    );
    expect(determinarFamiliaPeligro('Izaje de cargas')).toBe('Izaje y Levante');
    expect(determinarFamiliaPeligro('Espacio confinado')).toBe(
      'Espacio Confinado',
    );
  });

  it('no distingue mayusculas', () => {
    expect(determinarFamiliaPeligro('TRABAJO EN CALIENTE')).toBe(
      'Trabajo en Caliente',
    );
  });

  it('acierta con «electrico» aunque lleve tilde o no', () => {
    // La clave del mapa es «eléctric», que corta antes de la terminacion.
    expect(determinarFamiliaPeligro('Riesgo eléctrico')).toBe(
      'Riesgo Eléctrico',
    );
    expect(determinarFamiliaPeligro('Instalaciones eléctricas')).toBe(
      'Riesgo Eléctrico',
    );
  });

  it('una seccion sin palabra reconocible cae en la familia general', () => {
    expect(determinarFamiliaPeligro('Orden y limpieza')).toBe(
      'Seguridad Industrial',
    );
    expect(determinarFamiliaPeligro('')).toBe('Seguridad Industrial');
  });
});

describe('generarTareasDesdeInstancia', () => {
  const plantilla: TemplateLike = {
    name: 'IROS Chancado',
    sections: [
      { _id: 's1', title: 'Trabajos en altura' },
      { _id: 's2', title: 'Orden y limpieza' },
    ],
  };

  interface RespuestaDePrueba {
    seccion: string;
    pregunta: string;
    valor: string | number;
    comentario?: string;
  }

  const instancia = (
    respuestas: RespuestaDePrueba[],
    verificacion: Record<string, string> = {},
  ): InstanceLike => ({
    createdAt: new Date(2026, 0, 15),
    verificationList: verificacion,
    sections: respuestas.map((r) => ({
      sectionId: r.seccion,
      questions: [
        {
          questionText: r.pregunta,
          response: r.valor,
          comment: r.comentario,
        },
      ],
    })),
  });

  it('genera una tarea por cada observacion que lo requiere', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([
        {
          seccion: 's1',
          pregunta: 'Usa arnes?',
          valor: 1,
          comentario: 'Sin arnes',
        },
        { seccion: 's2', pregunta: 'Piso despejado?', valor: 5 },
      ]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas).toHaveLength(1);
    expect(resultado.tareas[0].descripcionObservacion).toBe('Sin arnes');
  });

  it('clasifica la tarea con la familia de peligro de su seccion', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([
        {
          seccion: 's1',
          pregunta: 'Usa arnes?',
          valor: 1,
          comentario: 'Sin arnes',
        },
      ]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas[0].familiaPeligro).toBe('Trabajo en Altura');
    expect(resultado.tareas[0].sectionTitle).toBe('Trabajos en altura');
  });

  it('sin comentario, la descripcion es el texto de la pregunta', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([{ seccion: 's1', pregunta: 'Usa arnes?', valor: 1 }]),
      plantilla,
      'inst-1',
      { incluirSoloConComentario: false },
    );

    expect(resultado.tareas[0].descripcionObservacion).toBe('Usa arnes?');
  });

  it('la accion propuesta nace vacia: la escribe una persona', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([{ seccion: 's1', pregunta: 'P', valor: 1, comentario: 'x' }]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas[0].accionPropuesta).toBe('');
    expect(resultado.tareas[0].estado).toBe('abierto');
    expect(resultado.tareas[0].aprobado).toBe(false);
  });

  it('numera las tareas correlativamente desde 1', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([
        { seccion: 's1', pregunta: 'A', valor: 1, comentario: 'Uno' },
        { seccion: 's2', pregunta: 'B', valor: 0, comentario: 'Dos' },
      ]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas.map((t) => t.numeroItem)).toEqual([1, 2]);
  });

  it('toma los datos organizativos de la lista de verificacion', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([{ seccion: 's1', pregunta: 'P', valor: 1, comentario: 'x' }], {
        Vicepresidencia: 'Operaciones',
        Área: 'Chancado',
        Supervisor: 'jperez',
      }),
      plantilla,
      'inst-1',
    );

    expect(resultado.metadatosOrganizacionales.vicepresidencia).toBe(
      'Operaciones',
    );
    expect(resultado.metadatosOrganizacionales.areaFisica).toBe('Chancado');
    expect(resultado.tareas[0].responsableObservacion).toBe('jperez');
  });

  it('acepta la lista de verificacion como Map', () => {
    // Mongoose devuelve un Map; las pruebas y los seeds, un objeto plano.
    const resultado = generarTareasDesdeInstancia(
      {
        verificationList: new Map([['Vicepresidencia', 'Mina']]),
        sections: [
          {
            sectionId: 's1',
            questions: [{ questionText: 'P', response: 1, comment: 'x' }],
          },
        ],
      },
      plantilla,
      'inst-1',
    );

    expect(resultado.metadatosOrganizacionales.vicepresidencia).toBe('Mina');
  });

  it('cuando falta un dato organizativo lo deja marcado, no vacio', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([{ seccion: 's1', pregunta: 'P', valor: 1, comentario: 'x' }]),
      plantilla,
      'inst-1',
    );

    expect(resultado.metadatosOrganizacionales.vicepresidencia).toContain(
      'no especificada',
    );
    expect(resultado.tareas[0].responsableObservacion).toBe('No asignado');
  });

  it('una respuesta de una seccion que no esta en la plantilla se ignora', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([
        {
          seccion: 'seccion-borrada',
          pregunta: 'P',
          valor: 1,
          comentario: 'x',
        },
      ]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas).toEqual([]);
  });

  it('una inspeccion sin hallazgos no genera ninguna tarea', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([{ seccion: 's1', pregunta: 'P', valor: 5 }]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas).toEqual([]);
  });

  it('las preguntas marcadas N/A se ignoran', () => {
    const resultado = generarTareasDesdeInstancia(
      instancia([
        { seccion: 's1', pregunta: 'P', valor: 'N/A', comentario: 'no aplica' },
      ]),
      plantilla,
      'inst-1',
    );

    expect(resultado.tareas).toEqual([]);
  });
});
