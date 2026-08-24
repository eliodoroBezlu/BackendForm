/**
 * Migra las matrices de riesgo de `riesgos[]` plano a `actividades[]`.
 *
 * Agrupa por la tupla del encabezado —área + tarea + condición + categoría—
 * respetando el orden de aparición, igual que el importador.
 *
 * ⚠️ **`riesgo.numero` no se toca.** El PGR guarda ese correlativo en
 * `origenMatriz.riesgosCubiertos[].riesgoNumero`; renumerar dejaría las
 * actividades del PGR apuntando a riesgos que ya no existen, y sin ningún
 * error visible. Por eso el script verifica que el conjunto de números sea
 * idéntico antes y después, y aborta la matriz si no lo es.
 *
 * Uso:
 *   node scripts/migrar-actividades-matriz.cjs           → dry-run (no escribe)
 *   node scripts/migrar-actividades-matriz.cjs --apply   → aplica
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.join(__dirname, '..');

function uri() {
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) throw new Error('No se encontró MONGODB_URI en .env');
  return m[1].trim();
}

/** Mayúsculas, sin tildes, espacios colapsados. Igual que el backend. */
const normalizar = (v) =>
  String(v ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const ENCABEZADO = [
  'areaProcesoAlcance',
  'actividadTarea',
  'condicion',
  'categoria',
];

function agrupar(riesgos) {
  const actividades = [];
  const indices = new Map();

  for (const r of riesgos) {
    const clave = ENCABEZADO.map((c) => normalizar(r[c])).join('||');

    let i = indices.get(clave);
    if (i === undefined) {
      i = actividades.length;
      indices.set(clave, i);
      actividades.push({
        numero: i + 1,
        areaProcesoAlcance: r.areaProcesoAlcance,
        actividadTarea: r.actividadTarea,
        condicion: r.condicion,
        categoria: r.categoria,
        riesgos: [],
      });
    }

    // Se copia el riesgo sin los 4 campos del encabezado, que suben.
    const riesgo = { ...r };
    for (const c of ENCABEZADO) delete riesgo[c];
    actividades[i].riesgos.push(riesgo);
  }

  return actividades;
}

(async () => {
  const cliente = new MongoClient(uri());
  await cliente.connect();
  const matrices = cliente.db().collection('matrizriesgos');

  const docs = await matrices.find({}).toArray();
  console.log(
    `${APLICAR ? 'APLICANDO' : 'DRY-RUN (no escribe)'} — ${docs.length} matriz(ces)\n`,
  );

  let migradas = 0;
  let saltadas = 0;
  let abortadas = 0;

  for (const doc of docs) {
    if (Array.isArray(doc.actividades) && doc.actividades.length > 0) {
      console.log(`  ○ ${doc.codigo}: ya migrada, se salta`);
      saltadas++;
      continue;
    }
    const riesgos = doc.riesgos ?? [];
    if (riesgos.length === 0) {
      console.log(`  ○ ${doc.codigo}: sin riesgos, solo se renombra el campo`);
      if (APLICAR) {
        await matrices.updateOne(
          { _id: doc._id },
          { $set: { actividades: [] }, $unset: { riesgos: '' } },
        );
      }
      migradas++;
      continue;
    }

    const actividades = agrupar(riesgos);
    const despues = actividades.flatMap((a) => a.riesgos);

    // Verificaciones antes de tocar nada.
    const numerosAntes = riesgos.map((r) => r.numero).sort((a, b) => a - b);
    const numerosDespues = despues.map((r) => r.numero).sort((a, b) => a - b);
    const mismosNumeros =
      JSON.stringify(numerosAntes) === JSON.stringify(numerosDespues);
    const controlesAntes = riesgos.reduce(
      (n, r) => n + (r.controles?.length ?? 0),
      0,
    );
    const controlesDespues = despues.reduce(
      (n, r) => n + (r.controles?.length ?? 0),
      0,
    );

    if (
      despues.length !== riesgos.length ||
      !mismosNumeros ||
      controlesAntes !== controlesDespues
    ) {
      console.log(
        `  ✖ ${doc.codigo}: ABORTADA — riesgos ${riesgos.length}→${despues.length}, ` +
          `controles ${controlesAntes}→${controlesDespues}, ` +
          `numeración ${mismosNumeros ? 'ok' : 'ALTERADA'}`,
      );
      abortadas++;
      continue;
    }

    console.log(
      `  ✔ ${doc.codigo} [${doc.estado}]: ${riesgos.length} riesgos → ` +
        `${actividades.length} actividades, ${controlesAntes} controles intactos`,
    );
    actividades.forEach((a) =>
      console.log(
        `       ${String(a.numero).padStart(2)}. [${a.riesgos.length}] ${a.actividadTarea.slice(0, 62)}`,
      ),
    );

    if (APLICAR) {
      await matrices.updateOne(
        { _id: doc._id },
        { $set: { actividades }, $unset: { riesgos: '' } },
      );
    }
    migradas++;
  }

  console.log(
    `\n${migradas} migrada(s), ${saltadas} ya estaban, ${abortadas} abortada(s)`,
  );
  if (!APLICAR) console.log('Nada se escribió. Repetí con --apply.');
  if (abortadas > 0) process.exitCode = 1;

  await cliente.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
