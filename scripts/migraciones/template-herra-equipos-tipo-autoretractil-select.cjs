#!/usr/bin/env node
/**
 * Convierte «TIPO AUTORETRACTIL (E, F o G)» en una selección cerrada.
 *
 * ── Por qué ──────────────────────────────────────────────────────────────
 *
 * De ese tipo depende cuántos códigos pide el formulario: los de doble ramal
 * (E y G) llevan dos y el simple (F) uno solo. Con la pregunta como `textarea`
 * la decisión quedaba a merced de lo que el inspector escribiera —«e», «Tipo
 * E», «doble»— y una lista cerrada la vuelve fiable.
 *
 * No toca las inspecciones ya guardadas: el valor sigue siendo una cadena, así
 * que lo respondido antes se conserva y se sigue leyendo igual.
 *
 * Idempotente y con dry-run por defecto.
 *
 *   node src/modules/template-herra-equipos/scripts/tipo-autoretractil-select.cjs
 *   node src/modules/template-herra-equipos/scripts/tipo-autoretractil-select.cjs --apply
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.resolve(__dirname, '../..');

const OPCIONES = ['E', 'F', 'G'];
const PREFIJO_SECCION = 'AUTORETRACTIL PERSONAL';

const normalizar = (t) =>
  String(t)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

function leerUri() {
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = /^MONGODB_URI\s*=\s*(.+)$/m.exec(env);
  if (!m) throw new Error('No se encontró MONGODB_URI en .env');
  return m[1].trim();
}

(async () => {
  const db = (await mongoose.connect(leerUri())).connection.db;
  console.log(`Base: ${db.databaseName}`);
  console.log(APLICAR ? 'MODO: APLICAR (escribe)\n' : 'MODO: dry-run\n');

  const col = db.collection('templateherraequipos');
  const plantillas = await col.find({ 'sections.title': { $exists: true } }).toArray();

  let tocadas = 0;

  for (const plantilla of plantillas) {
    const seccion = (plantilla.sections || []).find((s) =>
      normalizar(s.title).startsWith(PREFIJO_SECCION),
    );
    if (!seccion) continue;

    const caracteristicas = (seccion.subsections || []).find((s) =>
      normalizar(s.title).startsWith('CARACTERISTICAS'),
    );
    if (!caracteristicas) continue;

    const pregunta = (caracteristicas.questions || []).find((q) =>
      normalizar(q.text).startsWith('TIPO'),
    );
    if (!pregunta) continue;

    const yaEsSelect =
      pregunta.responseConfig?.type === 'select' &&
      JSON.stringify((pregunta.responseConfig.options || []).map((o) => o.value)) ===
        JSON.stringify(OPCIONES);

    console.log(
      `${yaEsSelect ? '=' : '~'}  ${plantilla.code} — ${plantilla.name.slice(0, 45)}`,
    );
    console.log(
      `      pregunta: ${JSON.stringify(pregunta.text)}  tipo actual: ${pregunta.responseConfig?.type}`,
    );

    if (yaEsSelect) continue;
    tocadas++;

    if (!APLICAR) continue;

    pregunta.responseConfig = {
      ...pregunta.responseConfig,
      type: 'select',
      options: OPCIONES.map((v) => ({ label: v, value: v })),
    };

    await col.updateOne(
      { _id: plantilla._id },
      { $set: { sections: plantilla.sections, updatedAt: new Date() } },
    );
  }

  if (tocadas === 0) {
    console.log('\nNada que cambiar.');
  } else {
    console.log(`\n${APLICAR ? `Listo: ${tocadas} plantilla(s).` : `Dry-run: cambiaría ${tocadas}. Repetir con --apply.`}`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
