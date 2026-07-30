/**
 * Migración: `mesesProgramados[]` → `programacion[]`
 * ───────────────────────────────────────────────────────────────────────────
 * Rellena el nuevo campo `programacion[]` de cada actividad a partir del
 * campo heredado `mesesProgramados`, asumiendo `programado = 1` por cada mes
 * marcado (el modelo viejo no guardaba cantidades, solo si el mes tocaba).
 *
 * Es ADITIVO: no borra `mesesProgramados` ni `frecuencia`. Esos campos se
 * retiran en un PR aparte, cuando el frontend ya escriba `programacion[]`.
 *
 * Es IDEMPOTENTE: salta las actividades que ya tienen `programacion` con
 * datos, así se puede volver a ejecutar sin duplicar ni pisar nada.
 *
 * Uso:
 *   node scripts/migrate-pgr-programacion.cjs            # simulacro (dry-run)
 *   node scripts/migrate-pgr-programacion.cjs --apply    # escribe de verdad
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** Acepta "Ene", "ENERO", "enero"… y devuelve 1-12, o null si no reconoce. */
function mesANumero(nombre) {
  if (!nombre) return null;
  const norm = String(nombre)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  const idx = MESES.findIndex((m) => norm.startsWith(m.toLowerCase()));
  return idx >= 0 ? idx + 1 : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Falta MONGODB_URI en el entorno.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const col = mongoose.connection.collection('pgrs');

  const docs = await col.find({}).toArray();
  console.log(`PGR encontrados: ${docs.length}`);

  let pgrTocados = 0;
  let actMigradas = 0;
  let actSaltadas = 0;
  const noReconocidos = new Set();

  for (const doc of docs) {
    const actividades = doc.actividades || [];
    let cambio = false;

    for (const act of actividades) {
      if (Array.isArray(act.programacion) && act.programacion.length > 0) {
        actSaltadas++;
        continue; // ya migrada
      }

      const meses = act.mesesProgramados || [];
      const programacion = [];
      for (const m of meses) {
        const n = mesANumero(m);
        if (n === null) {
          noReconocidos.add(String(m));
          continue;
        }
        programacion.push({
          mes: n,
          programado: 1, // el modelo viejo no guardaba cantidad
          realMesPasado: 0,
          realDelMes: 0,
          realMesAdelantado: 0,
        });
      }

      act.programacion = programacion;
      actMigradas++;
      cambio = true;
    }

    // Valores por defecto de las celdas de control del Excel
    const set = {};
    if (doc.mesCorte === undefined) set.mesCorte = 12;
    if (doc.ventanaGestion === undefined) set.ventanaGestion = 12;

    if (cambio || Object.keys(set).length > 0) {
      pgrTocados++;
      if (apply) {
        await col.updateOne(
          { _id: doc._id },
          { $set: { actividades, ...set } },
        );
      }
    }
  }

  console.log('─'.repeat(60));
  console.log(`PGR ${apply ? 'actualizados' : 'que se actualizarían'}: ${pgrTocados}`);
  console.log(`Actividades migradas:  ${actMigradas}`);
  console.log(`Actividades ya migradas (saltadas): ${actSaltadas}`);
  if (noReconocidos.size > 0) {
    console.log(`⚠️  Meses no reconocidos: ${[...noReconocidos].join(', ')}`);
  }
  if (!apply) {
    console.log('\nSimulacro. Nada se escribió. Reejecutá con --apply.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Error en la migración:', e);
  process.exit(1);
});
