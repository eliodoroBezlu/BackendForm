import { BadRequestException } from '@nestjs/common';
import { ConfigBienvenidaService } from './config-bienvenida.service';
import { BIENVENIDA_POR_DEFECTO } from './constantes';

/**
 * Lo que se prueba aquí es lo que no se ve mirando el código: que una
 * instalación vacía funcione, que un aviso caducado deje de mostrarse y que no
 * se pueda guardar una configuración incoherente.
 */
type Doc = Record<string, unknown> | null;

const servicioCon = (doc: Doc) => {
  const modelo = {
    findOne: () => ({ lean: () => ({ exec: () => Promise.resolve(doc) }) }),
    findOneAndUpdate: () => ({ exec: () => Promise.resolve(doc) }),
  };
  return new ConfigBienvenidaService(modelo as never);
};

const enDias = (dias: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
};

describe('ConfigBienvenidaService · sin configurar', () => {
  it('devuelve los valores por defecto en vez de fallar', async () => {
    // Una instalación recién montada tiene que arrancar sin que nadie entre a
    // configurar nada.
    const config = await servicioCon(null).obtener();

    expect(config.mensaje).toBe(BIENVENIDA_POR_DEFECTO.mensaje);
    expect(config.animacion).toBe(BIENVENIDA_POR_DEFECTO.animacion);
    expect(config.activa).toBe(true);
  });
});

describe('ConfigBienvenidaService · vigencia del mensaje', () => {
  const base = {
    clave: 'bienvenida',
    activa: true,
    mensaje: 'Parada de planta el sábado',
    submensaje: 'Coordine con su supervisor',
    animacion: 'barra',
  };

  it('muestra el mensaje dentro del plazo', async () => {
    const config = await servicioCon({
      ...base,
      vigenteDesde: enDias(-1),
      vigenteHasta: enDias(3),
    }).obtener();

    expect(config.mensaje).toBe('Parada de planta el sábado');
  });

  it('descarta el mensaje ya caducado', async () => {
    // Un aviso que no caduca solo se queda meses y la gente deja de leer la
    // pantalla entera.
    const config = await servicioCon({
      ...base,
      vigenteDesde: enDias(-10),
      vigenteHasta: enDias(-2),
    }).obtener();

    expect(config.mensaje).toBe(BIENVENIDA_POR_DEFECTO.mensaje);
  });

  it('descarta el mensaje que aún no empieza', async () => {
    const config = await servicioCon({
      ...base,
      vigenteDesde: enDias(5),
    }).obtener();

    expect(config.mensaje).toBe(BIENVENIDA_POR_DEFECTO.mensaje);
  });

  it('el último día de vigencia todavía cuenta', async () => {
    // `hasta` es inclusivo: un aviso «hasta el viernes» debe verse el viernes.
    const config = await servicioCon({
      ...base,
      vigenteHasta: enDias(0),
    }).obtener();

    expect(config.mensaje).toBe('Parada de planta el sábado');
  });

  it('sin fechas, el mensaje siempre se muestra', async () => {
    const config = await servicioCon(base).obtener();
    expect(config.mensaje).toBe('Parada de planta el sábado');
  });

  it('`crudo` no caduca nada', async () => {
    // Quien edita tiene que ver lo que hay guardado; si le llegara ya
    // filtrado, guardar borraría el aviso sin querer.
    const config = await servicioCon({
      ...base,
      vigenteHasta: enDias(-2),
    }).obtenerCrudo();

    expect(config.mensaje).toBe('Parada de planta el sábado');
  });
});

describe('ConfigBienvenidaService · operadores del upsert', () => {
  /**
   * Regresión de un 500 real: `mensaje` iba a la vez en `$set` y en
   * `$setOnInsert`, y Mongo rechaza que un campo aparezca en dos operadores
   * —«Updating the path 'mensaje' would create a conflict»—. Como el
   * formulario manda el objeto completo, fallaba en **cada** guardado.
   *
   * El spec anterior no podía detectarlo: el modelo simulado se limitaba a
   * resolver la promesa, así que nunca validaba la forma de la actualización.
   * Por eso aquí se inspecciona lo que se le pasa.
   */
  const construir = (dto: Record<string, unknown>) =>
    (
      servicioCon(null) as unknown as {
        construirActualizacion: (
          d: unknown,
          u: string,
        ) => {
          $set: Record<string, unknown>;
          $setOnInsert?: Record<string, unknown>;
        };
      }
    ).construirActualizacion(dto, 'admin');

  it('no repite ningún campo entre $set y $setOnInsert', () => {
    const { $set, $setOnInsert } = construir({
      mensaje: 'Hola',
      animacion: 'barra',
      submensaje: 'Abriendo…',
    });

    const repetidos = Object.keys($setOnInsert ?? {}).filter(
      (k) => k in $set,
    );
    expect(repetidos).toEqual([]);
  });

  it('con el objeto completo no manda $setOnInsert', () => {
    // Es el caso del formulario: si ya viene todo, no hay nada que rellenar
    // solo al crear.
    const { $setOnInsert } = construir({
      mensaje: 'Hola',
      animacion: 'barra',
    });

    expect($setOnInsert).toBeUndefined();
  });

  it('rellena los obligatorios que falten, para que el upsert sea válido', () => {
    // Un PATCH parcial que cree el documento debe dejarlo con los campos que
    // el esquema exige.
    const { $set, $setOnInsert } = construir({ submensaje: 'Solo esto' });

    expect($setOnInsert).toEqual({
      mensaje: BIENVENIDA_POR_DEFECTO.mensaje,
      animacion: BIENVENIDA_POR_DEFECTO.animacion,
    });
    expect($set.submensaje).toBe('Solo esto');
  });

  it('rellena solo el que falta', () => {
    const { $setOnInsert } = construir({ mensaje: 'Hola' });

    expect($setOnInsert).toEqual({
      animacion: BIENVENIDA_POR_DEFECTO.animacion,
    });
  });

  it('siempre fija la clave y quién lo cambió', () => {
    const { $set } = construir({ mensaje: 'Hola', animacion: 'barra' });

    expect($set.clave).toBe('bienvenida');
    expect($set.actualizadoPor).toBe('admin');
  });
});

describe('ConfigBienvenidaService · coherencia al guardar', () => {
  const guardar = (dto: Record<string, unknown>) =>
    servicioCon(null).actualizar(dto as never, 'admin');

  it('rechaza un mínimo mayor que el máximo', async () => {
    await expect(
      guardar({ duracionMinimaMs: 5000, duracionMaximaMs: 2000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una vigencia que termina antes de empezar', async () => {
    await expect(
      guardar({
        vigenteDesde: enDias(5).toISOString(),
        vigenteHasta: enDias(1).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza dos configuraciones para la misma área', async () => {
    // Con duplicados el resultado dependería del orden del array, que es justo
    // el tipo de dato que después «a veces» falla.
    await expect(
      guardar({
        porArea: [
          { area: 'Molienda', mensaje: 'A' },
          { area: 'molienda', mensaje: 'B' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta áreas distintas', async () => {
    await expect(
      guardar({
        porArea: [
          { area: 'Molienda', mensaje: 'A' },
          { area: 'Chancado', mensaje: 'B' },
        ],
      }),
    ).resolves.toBeDefined();
  });
});
