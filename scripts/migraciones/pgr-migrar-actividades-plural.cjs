#!/usr/bin/env node
/**
 * Pasa las actividades del PGR a los campos plurales y limpia la cabecera.
 *
 * ── Qué cambia ────────────────────────────────────────────────────────────
 *
 *   Actividad.responsable  (string)  → responsables[] {tipo, referencia, nombre}
 *   Actividad.recurso      (string)  → recursos[]     {cantidad, unidad}
 *   Actividad.entregable   (string)  → entregables[]  string
 *   Actividad.areas                  → []  (vacío = todas las áreas)
 *   Pgr.supervisor / Pgr.responsable → se eliminan
 *
 * La responsabilidad se declara por actividad, no en la cabecera del plan; y
 * el recurso pasa a ser cantidad y unidad para poder sumar el esfuerzo del
 * programa, que con texto libre era imposible.
 *
 * ── Conversión conservadora ───────────────────────────────────────────────
 *
 * Un `responsable` suelto se convierte en un responsable de tipo `trabajador`
 * con su propio texto como referencia: no se inventa a quién apunta. Un
 * `recurso` solo se convierte si tiene forma de «cantidad unidad» (`2 HH`);
 * si no, se reporta y se descarta, porque guardar `NaN` arruinaría cualquier
 * suma posterior.
 *
 * Idempotente: una actividad que ya tiene los plurales no se vuelve a tocar.
 *
 *   node src/modules/pgr/scripts/migrar-actividades-plural.cjs           # dry-run
 *   node src/modules/pgr/scripts/migrar-actividades-plural.cjs --apply   # escribe
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.resolve(__dirname, '../..');

function leerUri() {
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = /^MONGODB_URI\s*=\s*(.+)$/m.exec(env);
  if (!m) throw new Error('No se encontró MONGODB_URI en .env');
  return m[1].trim();
}

/** `"2 HH"` → `{cantidad: 2, unidad: 'HH'}`; `null` si no tiene esa forma. */
function parsearRecurso(texto) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.+?)\s*$/.exec(String(texto ?? ''));
  if (!m) return null;
  const cantidad = Number(m[1].replace(',', '.'));
  return Number.isFinite(cantidad) ? { cantidad, unidad: m[2] } : null;
}

(async () => {
  const db = (await mongoose.connect(leerUri())).connection.db;
  console.log(`Base: ${db.databaseName}`);
  console.log(APLICAR ? 'MODO: APLICAR (escribe)\n' : 'MODO: dry-run\n');

  const col = db.collection('pgrs');
  const pgrs = await col.find({}).toArray();

  let planesTocados = 0;
  let actividadesTocadas = 0;
  let cabecerasLimpiadas = 0;
  const recursosDescartados = [];

  for (const pgr of pgrs) {
    const actividades = pgr.actividades ?? [];
    let cambio = false;

    for (const act of actividades) {
      // Idempotencia: si ya tiene los plurales, no se toca.
      const yaMigrada =
        Array.isArray(act.responsables) &&
        Array.isArray(act.recursos) &&
        Array.isArray(act.entregables) &&
        Array.isArray(act.areas);
      if (yaMigrada) continue;

      if (!Array.isArray(act.areas)) act.areas = [];

      if (!Array.isArray(act.responsables)) {
        const valor = String(act.responsable ?? '').trim();
        act.responsables = valor
          ? [{ tipo: 'trabajador', referencia: valor, nombre: valor }]
          : [];
      }

      if (!Array.isArray(act.recursos)) {
        const valor = String(act.recurso ?? '').trim();
        const parsed = valor ? parsearRecurso(valor) : null;
        if (valor && !parsed) {
          recursosDescartados.push(
            `${pgr.codigoAutogenerado} · "${act.descripcion?.slice(0, 30)}" → recurso "${valor}"`,
          );
        }
        act.recursos = parsed ? [parsed] : [];
      }

      if (!Array.isArray(act.entregables)) {
        const valor = String(act.entregable ?? '').trim();
        act.entregables = valor ? [valor] : [];
      }

      delete act.responsable;
      delete act.recurso;
      delete act.entregable;

      actividadesTocadas++;
      cambio = true;
    }

    const teniaCabecera =
      pgr.supervisor !== undefined || pgr.responsable !== undefined;
    if (teniaCabecera) cabecerasLimpiadas++;

    if (!cambio && !teniaCabecera) continue;
    planesTocados++;

    if (APLICAR) {
      await col.updateOne(
        { _id: pgr._id },
        {
          ...(cambio ? { $set: { actividades } } : {}),
          ...(teniaCabecera
            ? { $unset: { supervisor: '', responsable: '' } }
            : {}),
        },
      );
    }
  }

  console.log(`PGR revisados:        ${pgrs.length}`);
  console.log(`PGR modificados:      ${planesTocados}`);
  console.log(`Actividades migradas: ${actividadesTocadas}`);
  console.log(`Cabeceras limpiadas:  ${cabecerasLimpiadas}`);

  if (recursosDescartados.length > 0) {
    console.log(
      `\nRecursos sin forma «cantidad unidad» — se descartan (${recursosDescartados.length}):`,
    );
    for (const r of recursosDescartados.slice(0, 20)) console.log(`  ${r}`);
    if (recursosDescartados.length > 20) console.log('  …');
  }

  if (!APLICAR) {
    console.log('\n(dry-run: no se escribió nada. Volvé a correr con --apply)');
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
