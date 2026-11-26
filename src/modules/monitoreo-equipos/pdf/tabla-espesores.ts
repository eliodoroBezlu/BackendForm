import {
  bajoAlerta,
  letraDePunto,
  minimosAnteriores,
  minimosPorZona,
} from '../domain/espesores';
import { MedicionAnterior, MedicionDelReporte } from '../domain/reporte';
import { C, diaCorto, Estilo, Hoja, ImagenParaPdf, LIMITE, M, W } from './hoja';

/** Espesores con dos decimales y coma, como el Excel: 5,70 y no 5,7. */
const mm = (n?: number): string =>
  n === undefined ? '' : n.toFixed(2).replace('.', ',');

/** Alto de cada anillo: con 60 filas la tabla de 250SA225 entra en una hoja. */
const ALTO_FILA = 9;
const ALTO_ENCABEZADO = 11;

/**
 * La tabla de espesores como la pegaban en el Excel: pieza, zona y anillo a
 * la izquierda, un punto por columna (A, B, C…) y el mínimo de cada zona a la
 * derecha, más el mínimo de la medición anterior si la hubo.
 *
 * Se dibuja, no se pega como imagen. Una zona no se corta entre páginas; si
 * la tabla sigue en otra, repite el encabezado y el nombre de la pieza.
 */
export function tablaDeEspesores(
  h: Hoja,
  medicion: MedicionDelReporte,
  fecha: Date,
  anterior?: MedicionAnterior,
): void {
  const { estructura, valores } = medicion;
  const conZonas = estructura.piezas.some((p) => p.zonas.some((z) => z.nombre));
  const conAnterior = !!anterior?.minimos.length;
  const maxPuntos = Math.max(
    ...estructura.piezas.flatMap((p) => p.zonas.map((z) => z.puntos)),
  );
  const minimos = minimosPorZona(estructura, valores);
  const previos =
    anterior && conAnterior
      ? minimosAnteriores(estructura, anterior.minimos)
      : [];

  const ancho = {
    pieza: 62,
    zona: conZonas ? 50 : 0,
    anillo: 28,
    minimo: 44,
    anterior: conAnterior ? 50 : 0,
  };
  const fijo =
    ancho.pieza + ancho.zona + ancho.anillo + ancho.minimo + ancho.anterior;
  const anchoPunto = (W - fijo) / maxPuntos;
  const x = {
    zona: M + ancho.pieza,
    anillo: M + ancho.pieza + ancho.zona,
    puntos: M + ancho.pieza + ancho.zona + ancho.anillo,
    minimo: M + W - ancho.minimo - ancho.anterior,
    anterior: M + W - ancho.anterior,
  };

  const cabecera: Estilo = {
    negrita: true,
    fondo: C.azulOscuro,
    color: '#FFFFFF',
    alinear: 'center',
    tamano: 6.5,
  };
  const encabezado = () => {
    const anchos = [ancho.pieza, ancho.zona, ancho.anillo]
      .concat(Array.from({ length: maxPuntos }, () => anchoPunto))
      .concat([ancho.minimo, ancho.anterior]);
    const titulos = ['Pieza', conZonas ? 'Zona' : '', 'Anillo']
      .concat(Array.from({ length: maxPuntos }, (_, i) => letraDePunto(i)))
      .concat([
        'Esp. mín.',
        anterior && conAnterior ? `Mín. ${diaCorto(anterior.fecha)}` : '',
      ]);
    const visibles = anchos
      .map((w, i) => ({ w, t: titulos[i] }))
      .filter(({ w }) => w > 0);
    h.fila(
      visibles.map((c) => c.w),
      visibles.map((c) => c.t),
      ALTO_ENCABEZADO,
      visibles.map(() => cabecera),
    );
  };

  h.reservar(12 + ALTO_ENCABEZADO + ALTO_FILA * 2);
  h.celda(
    M,
    h.y,
    W,
    12,
    `${estructura.titulo} · ${diaCorto(fecha)} (unidades mm)`,
    { negrita: true, alinear: 'center', tamano: 7 },
  );
  h.y += 12;
  encabezado();

  let indice = 0;
  estructura.piezas.forEach((p, i) => {
    let inicio = h.y;
    // La celda de la pieza abarca sus zonas de esta página.
    const cerrarPieza = () => {
      if (h.y > inicio) {
        h.celda(M, inicio, ancho.pieza, h.y - inicio, p.nombre, {
          negrita: true,
          fondo: C.azul,
          color: '#FFFFFF',
          alinear: 'center',
          tamano: 7,
        });
      }
    };

    p.zonas.forEach((z, j) => {
      const alto = z.anillos * ALTO_FILA;
      if (h.y + alto > LIMITE) {
        cerrarPieza();
        h.reservar(alto);
        encabezado();
        inicio = h.y;
      }
      if (conZonas) {
        h.celda(x.zona, h.y, ancho.zona, alto, z.nombre, {
          negrita: true,
          alinear: 'center',
          tamano: 6.5,
        });
      }
      for (let k = 0; k < z.anillos; k++) {
        const y = h.y + k * ALTO_FILA;
        h.celda(x.anillo, y, ancho.anillo, ALTO_FILA, String(k + 1), {
          alinear: 'center',
          tamano: 6.5,
        });
        for (let n = 0; n < z.puntos; n++) {
          const v = valores[i]?.[j]?.[k]?.[n] ?? undefined;
          const alerta = bajoAlerta(p, v);
          h.celda(x.puntos + n * anchoPunto, y, anchoPunto, ALTO_FILA, mm(v), {
            alinear: 'center',
            tamano: 6.5,
            negrita: alerta,
            color: alerta ? C.rojo : undefined,
          });
        }
      }
      // Los puntos que esta zona no tiene quedan como un solo bloque vacío.
      if (z.puntos < maxPuntos) {
        h.celda(
          x.puntos + z.puntos * anchoPunto,
          h.y,
          (maxPuntos - z.puntos) * anchoPunto,
          alto,
          '',
        );
      }
      const minimo = minimos[indice++]?.minimo;
      const alerta = bajoAlerta(p, minimo);
      h.celda(x.minimo, h.y, ancho.minimo, alto, mm(minimo), {
        negrita: true,
        alinear: 'center',
        tamano: 7,
        color: alerta ? C.rojo : undefined,
      });
      if (conAnterior) {
        h.celda(x.anterior, h.y, ancho.anterior, alto, mm(previos[i]?.[j]), {
          alinear: 'center',
          tamano: 7,
          color: C.tenue,
        });
      }
      h.y += alto;
    });
    cerrarPieza();
  });
  h.y += 4;
}

/** Alto de los diagramas: se leen los números de las piezas sin comerse la hoja. */
const ALTO_DIAGRAMA = 150;
const SEPARACION = 8;

/**
 * Los diagramas del equipo en una fila, centrados, del mismo alto y con su
 * leyenda debajo (como van junto a la tabla en el Excel). Si son muchos,
 * siguen en otra fila.
 */
export function diagramasDeMedicion(h: Hoja, diagramas: ImagenParaPdf[]): void {
  const porFila = Math.min(diagramas.length, 3);
  const ancho = Math.min(
    (W - SEPARACION * (porFila - 1)) / porFila,
    ALTO_DIAGRAMA * 1.4,
  );
  const d = h.documento;
  h.y += 4;
  for (let i = 0; i < diagramas.length; i += porFila) {
    const fila = diagramas.slice(i, i + porFila);
    d.font('Helvetica').fontSize(7);
    const altoLeyenda = Math.max(
      ...fila.map((f) =>
        f.descripcion ? d.heightOfString(f.descripcion, { width: ancho }) : 0,
      ),
    );
    h.reservar(ALTO_DIAGRAMA + altoLeyenda + 6);
    const total = fila.length * ancho + (fila.length - 1) * SEPARACION;
    fila.forEach((f, k) => {
      const x = M + (W - total) / 2 + k * (ancho + SEPARACION);
      h.imagen(f, x, h.y, ancho, ALTO_DIAGRAMA);
      if (f.descripcion) {
        d.fillColor(C.texto).text(f.descripcion, x, h.y + ALTO_DIAGRAMA + 2, {
          width: ancho,
          align: 'center',
        });
      }
    });
    h.y += ALTO_DIAGRAMA + altoLeyenda + 6;
  }
}
