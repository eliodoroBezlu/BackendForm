/**
 * Repone el `sectionId` de las inspecciones IRO/ISOP (`instances`) cuyas
 * secciones ya no existen en su plantilla.
 *
 * Por qué pasa: antes del versionado de plantillas (2026-09-27) una plantilla
 * con inspecciones se podía editar en el lugar, y al guardarla sus secciones
 * recibían `_id` nuevos. Las inspecciones ya llenas siguieron apuntando a los
 * viejos: el plan de acción no las encuentra («No se encontraron
 * observaciones…») y editarlas falla con «Sección … no encontrada».
 *
 * Cómo se empareja: **por posición**, igual que la pantalla de IRO, que ya
 * muestra cada respuesta junto a la sección de la plantilla en ese lugar.
 * Solo se repara una inspección si, sección por sección, coincide con la
 * plantilla actual:
 * - el mismo número de secciones (hojas, sin las que son solo padre);
 * - el mismo número de preguntas en cada sección;
 * - al menos el 80 % de los textos de pregunta iguales en el mismo lugar
 *   (sin distinguir tildes, mayúsculas ni espacios), para tolerar un texto
 *   retocado;
 * - si una sección ya tiene un `sectionId` válido, que sea el de su lugar.
 *
 * Lo que no cumple queda en la lista «no reparables» con el motivo: hace
 * falta la versión vieja de la plantilla (de un respaldo) o dejarla como
 * histórico. Las respuestas no se tocan; solo cambia `sectionId`.
 *
 * Idempotente: una inspección con todas sus secciones en la plantilla no se
 * mira. Cada escritura exige que el `sectionId` siga siendo el viejo.
 *
 * Antes de `--apply`, respaldar:
 *   node scripts/respaldar-colecciones.cjs instances
 *
 * Uso:
 *   node scripts/reparar-secciones-inspecciones.cjs           → dry-run (no escribe)
 *   node scripts/reparar-secciones-inspecciones.cjs --apply   → aplica
 *   node scripts/reparar-secciones-inspecciones.cjs --detalle → además, los textos que difieren
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const APLICAR = process.argv.includes('--apply');
const DETALLE = process.argv.includes('--detalle');
const RAIZ = path.join(__dirname, '..');

/** Parte mínima de textos de pregunta que deben coincidir en cada sección. */
const COINCIDENCIA_MINIMA = 0.8;

/**
 * La base a la que se conecta. La variable de entorno `MONGODB_URI` manda
 * sobre el `.env`: así el script se corre contra producción sin editar el
 * `.env` local (PowerShell: `$env:MONGODB_URI="..."; node scripts/...`).
 */
function uri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI.trim();
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) throw new Error('No se encontró MONGODB_URI en .env');
  return m[1].trim();
}

/** Servidor y base, sin usuario ni contraseña: para confirmar a dónde se escribe. */
const destino = (u) => u.replace(/\/\/[^@/]*@/, '//').replace(/\?.*$/, '');

const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Las secciones que reciben respuestas, en orden: igual que `flattenSections` del backend. */
function hojas(plantilla) {
  const resultado = [];
  const recorrer = (seccion) => {
    if (!seccion.isParent) resultado.push(seccion);
    (seccion.subsections ?? []).forEach(recorrer);
  };
  (plantilla.sections ?? []).forEach(recorrer);
  return resultado;
}

/**
 * Qué hacer con una inspección: `{ cambios, diferencias }` si se repara, o
 * `{ motivo }` si no.
 */
function evaluar(inspeccion, plantilla) {
  const secciones = hojas(plantilla);
  const respondidas = inspeccion.sections ?? [];
  const validos = new Set(secciones.map((s) => String(s._id)));

  if (respondidas.length !== secciones.length) {
    return {
      motivo: `tiene ${respondidas.length} secciones y la plantilla ${secciones.length}`,
    };
  }

  const cambios = [];
  const diferencias = [];
  for (let i = 0; i < respondidas.length; i++) {
    const respuesta = respondidas[i];
    const seccion = secciones[i];
    const actual = String(respuesta.sectionId);
    const nuevo = String(seccion._id);

    if (validos.has(actual) && actual !== nuevo) {
      return {
        motivo: `la sección ${i + 1} apunta a otra sección de la plantilla`,
      };
    }

    const preguntas = respuesta.questions ?? [];
    const delLugar = seccion.questions ?? [];
    if (preguntas.length !== delLugar.length) {
      return {
        motivo: `la sección ${i + 1} («${seccion.title}») tiene ${preguntas.length} preguntas y la plantilla ${delLugar.length}`,
      };
    }

    let iguales = 0;
    preguntas.forEach((p, j) => {
      if (normalizar(p.questionText) === normalizar(delLugar[j].text))
        iguales++;
      else
        diferencias.push({
          seccion: i + 1,
          antes: p.questionText,
          ahora: delLugar[j].text,
        });
    });
    if (
      preguntas.length > 0 &&
      iguales / preguntas.length < COINCIDENCIA_MINIMA
    ) {
      return {
        motivo: `la sección ${i + 1} («${seccion.title}») solo coincide en ${iguales} de ${preguntas.length} preguntas`,
      };
    }

    if (actual !== nuevo)
      cambios.push({ indice: i, antes: respuesta.sectionId, nuevo });
  }
  return { cambios, diferencias };
}

const recortar = (texto, largo = 70) => {
  const t = String(texto ?? '');
  return t.length > largo ? `${t.slice(0, largo)}…` : t;
};

async function main() {
  console.log(`Base: ${destino(uri())}`);
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN (no escribe)'}`);

  const cliente = await MongoClient.connect(uri());
  try {
    const db = cliente.db();
    const plantillas = new Map(
      (await db.collection('templates').find().toArray()).map((p) => [
        String(p._id),
        p,
      ]),
    );

    const reparables = [];
    const noReparables = [];
    let revisadas = 0;

    for await (const inspeccion of db.collection('instances').find()) {
      revisadas++;
      const plantilla = plantillas.get(String(inspeccion.templateId));
      if (!plantilla) continue;

      const validos = new Set(hojas(plantilla).map((s) => String(s._id)));
      const huerfanas = (inspeccion.sections ?? []).filter(
        (s) => !validos.has(String(s.sectionId)),
      );
      if (huerfanas.length === 0) continue;

      const ficha = {
        _id: inspeccion._id,
        id: String(inspeccion._id),
        plantilla: `${plantilla.code ?? '—'} ${plantilla.name}`,
        fecha: inspeccion.createdAt?.toISOString?.().slice(0, 10) ?? '—',
        estado: inspeccion.status ?? '—',
      };
      const resultado = evaluar(inspeccion, plantilla);
      if (resultado.motivo)
        noReparables.push({ ...ficha, motivo: resultado.motivo });
      else reparables.push({ ...ficha, ...resultado });
    }

    console.log(`\nInspecciones revisadas: ${revisadas}`);
    console.log(
      `Con secciones que no están en su plantilla: ${reparables.length + noReparables.length}`,
    );

    console.log(`\n== Reparables: ${reparables.length}`);
    for (const r of reparables) {
      console.log(
        `  ${r.id}  ${r.fecha}  ${r.estado}  ${r.plantilla}  → ${r.cambios.length} secciones, ${r.diferencias.length} textos distintos`,
      );
      if (DETALLE) {
        r.diferencias.forEach((d) =>
          console.log(
            `      sección ${d.seccion}: «${recortar(d.antes)}» → «${recortar(d.ahora)}»`,
          ),
        );
      }
    }

    console.log(`\n== No reparables: ${noReparables.length}`);
    for (const r of noReparables) {
      console.log(
        `  ${r.id}  ${r.fecha}  ${r.estado}  ${r.plantilla}  → ${r.motivo}`,
      );
    }

    if (!APLICAR) {
      console.log(
        '\nDRY-RUN: no se escribió nada. Repetir con --apply (y --detalle para ver los textos).',
      );
      return;
    }

    let escritas = 0;
    for (const r of reparables) {
      const filtro = { _id: r._id };
      const set = {};
      for (const c of r.cambios) {
        filtro[`sections.${c.indice}.sectionId`] = c.antes;
        set[`sections.${c.indice}.sectionId`] = c.nuevo;
      }
      const { modifiedCount } = await db
        .collection('instances')
        .updateOne(filtro, { $set: set });
      if (modifiedCount === 1) escritas++;
      else
        console.warn(
          `  No se escribió ${r.id}: cambió mientras corría el script`,
        );
    }
    console.log(
      `\nAPLICADO: ${escritas} de ${reparables.length} inspecciones reparadas.`,
    );
  } finally {
    await cliente.close();
  }
}

// La regla se reusa para revisar exportaciones JSON sin conectarse a la base.
module.exports = { evaluar, hojas };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
