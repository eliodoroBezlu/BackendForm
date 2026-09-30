/**
 * Respalda colecciones de Mongo a archivos JSON (formato EJSON, que conserva
 * ObjectId y fechas), para cuando `mongodump` no está instalado.
 *
 * Solo lee la base. Escribe un archivo por colección en
 * `respaldos/<AAAA-MM-DD_HHMMSS>/<coleccion>.json`.
 *
 * Uso:
 *   node scripts/respaldar-colecciones.cjs templates templateherraequipos
 *   node scripts/respaldar-colecciones.cjs ubicacions
 *
 * Restaurar (vuelve cada documento del archivo a como estaba, por `_id`):
 *   node scripts/respaldar-colecciones.cjs --restaurar respaldos/<carpeta>/templates.json
 *
 * La restauración reemplaza los documentos que están en el archivo; no borra
 * los que se hayan creado después ni recrea índices borrados.
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

const RAIZ = path.join(__dirname, '..');

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

const marcaDeTiempo = () =>
  new Date().toISOString().replace('T', '_').replace(/[:]/g, '').slice(0, 17);

async function respaldar(db, colecciones) {
  const carpeta = path.join(RAIZ, 'respaldos', marcaDeTiempo());
  fs.mkdirSync(carpeta, { recursive: true });
  for (const nombre of colecciones) {
    const docs = await db.collection(nombre).find({}).toArray();
    const indices = await db.collection(nombre).indexes();
    const archivo = path.join(carpeta, `${nombre}.json`);
    fs.writeFileSync(archivo, EJSON.stringify({ coleccion: nombre, indices, docs }, null, 2, { relaxed: false }));
    console.log(`  ${nombre}: ${docs.length} documentos → ${path.relative(RAIZ, archivo)}`);
  }
  console.log(`\nRespaldo listo en ${path.relative(RAIZ, carpeta)}`);
}

async function restaurar(db, archivo) {
  const { coleccion, docs } = EJSON.parse(fs.readFileSync(path.resolve(archivo), 'utf8'), { relaxed: false });
  const col = db.collection(coleccion);
  let reemplazados = 0;
  for (const doc of docs) {
    const r = await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
    reemplazados += r.modifiedCount + r.upsertedCount;
  }
  console.log(`${coleccion}: ${docs.length} documentos del respaldo, ${reemplazados} restaurados.`);
}

(async () => {
  const args = process.argv.slice(2);
  const cliente = new MongoClient(uri());
  await cliente.connect();
  console.log(`Base: ${destino(uri())}`);
  try {
    const db = cliente.db();
    if (args[0] === '--restaurar') {
      if (!args[1]) throw new Error('Falta el archivo a restaurar');
      await restaurar(db, args[1]);
    } else {
      if (args.length === 0) throw new Error('Indique las colecciones a respaldar');
      await respaldar(db, args);
    }
  } finally {
    await cliente.close();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
