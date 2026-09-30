/**
 * Convierte las ubicaciones planas en raíces del árbol de ubicaciones.
 *
 * Antes cada ubicación era solo un `nombre` único en toda la colección. Ahora
 * es un nodo de árbol (`padre`, `ancestros`, `ruta`, `nivel`,
 * `nombreNormalizado`) y el nombre es único **entre hermanos**. Este script:
 *
 * 1. Da a cada ubicación sin campos de árbol los de una raíz. No inventa
 *    jerarquía: reorganizar en árbol lo hace el usuario desde la pantalla.
 * 2. Borra el índice único global `nombre_1` —Mongoose no borra índices
 *    viejos al cambiar el esquema— y crea `{ padre, nombreNormalizado }`
 *    único y `{ ancestros }`.
 *
 * ⚠️ **La colección `equipos` no se escribe.** Los equipos apuntan a la
 * ubicación por `_id`, que no cambia. Aun así el script cuenta los equipos
 * por ubicación antes y después y aborta si no coinciden.
 *
 * Aborta sin escribir si dos nombres colisionan al normalizarlos (mayúsculas,
 * tildes, espacios): el índice único nuevo no se podría crear.
 *
 * Idempotente: una segunda corrida no encuentra nada que convertir.
 *
 * Antes de `--apply`, respaldar la colección:
 *   mongodump --uri "<MONGODB_URI>" --collection ubicacions
 *
 * Uso:
 *   node scripts/migrar-ubicaciones-jerarquia.cjs           → dry-run (no escribe)
 *   node scripts/migrar-ubicaciones-jerarquia.cjs --apply   → aplica
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const APLICAR = process.argv.includes('--apply');
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

/** Mayúsculas, sin tildes, espacios colapsados. Igual que el backend. */
const normalizar = (v) =>
  String(v ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Recorta y colapsa espacios, como `limpiarNombre` del backend. */
const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

async function equiposPorUbicacion(db) {
  const filas = await db
    .collection('equipos')
    .aggregate([{ $group: { _id: '$ubicacion_id', n: { $sum: 1 } } }])
    .toArray();
  return new Map(filas.map((f) => [String(f._id), f.n]));
}

function mismosConteos(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

(async () => {
  const cliente = new MongoClient(uri());
  await cliente.connect();
  const db = cliente.db();
  const ubicaciones = db.collection('ubicacions');

  console.log(`Base: ${destino(uri())}`);
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN (no escribe)'}`);

  try {
    const todas = await ubicaciones.find({}).toArray();
    const antes = await equiposPorUbicacion(db);
    const totalEquipos = [...antes.values()].reduce((a, n) => a + n, 0);
    const ids = new Set(todas.map((u) => String(u._id)));
    const huerfanos = [...antes.entries()].filter(([id]) => !ids.has(id));

    console.log(`Ubicaciones: ${todas.length} | Equipos: ${totalEquipos}`);
    if (huerfanos.length > 0) {
      console.error(
        `ABORTA: ${huerfanos.reduce((a, [, n]) => a + n, 0)} equipos apuntan a ubicaciones inexistentes:`,
        huerfanos.map(([id]) => id),
      );
      process.exitCode = 1;
      return;
    }

    // Ya migradas: tienen `ruta`. Las demás se convierten en raíces.
    const pendientes = todas.filter((u) => typeof u.ruta !== 'string');
    console.log(
      `Ya migradas: ${todas.length - pendientes.length} | A convertir en raíz: ${pendientes.length}`,
    );

    // Colisiones: entre raíces (padre null) la clave es solo el nombre normalizado.
    const porClave = new Map();
    for (const u of todas) {
      const padre = u.ruta === undefined ? null : (u.padre ?? null);
      const clave = `${padre ? String(padre) : 'raiz'}|${u.nombreNormalizado ?? normalizar(u.nombre)}`;
      porClave.set(clave, [...(porClave.get(clave) ?? []), u.nombre]);
    }
    const colisiones = [...porClave.values()].filter((l) => l.length > 1);
    if (colisiones.length > 0) {
      console.error(
        'ABORTA: estos nombres quedan iguales al normalizarlos y el índice único no se podría crear. Renombrar o fusionar antes:',
      );
      colisiones.forEach((l) => console.error('  -', l.join('  |  ')));
      process.exitCode = 1;
      return;
    }
    console.log('Colisiones de nombre normalizado: 0');

    for (const u of pendientes) {
      const nombre = limpiar(u.nombre);
      console.log(
        `  ${u.activo === false ? '[baja] ' : ''}${nombre} → raíz (${antes.get(String(u._id)) ?? 0} equipos)`,
      );
    }

    const indices = await ubicaciones.indexes();
    const tieneViejo = indices.some((i) => i.name === 'nombre_1');
    console.log(
      `Índice nombre_1: ${tieneViejo ? 'existe → se borra' : 'ya no existe'}`,
    );

    if (!APLICAR) {
      console.log('\nDRY-RUN: no se escribió nada. Repetir con --apply.');
      return;
    }

    if (pendientes.length > 0) {
      await ubicaciones.bulkWrite(
        pendientes.map((u) => {
          const nombre = limpiar(u.nombre);
          return {
            updateOne: {
              filter: { _id: u._id, ruta: { $exists: false } },
              update: {
                $set: {
                  nombre,
                  nombreNormalizado: normalizar(nombre),
                  padre: null,
                  ancestros: [],
                  ruta: nombre,
                  nivel: 0,
                },
              },
            },
          };
        }),
      );
    }

    if (tieneViejo) await ubicaciones.dropIndex('nombre_1');
    // Mismos nombres que generaría Mongoose, para que al arrancar los vea
    // como existentes y no intente crearlos otra vez.
    await ubicaciones.createIndex(
      { padre: 1, nombreNormalizado: 1 },
      { unique: true, name: 'padre_1_nombreNormalizado_1', background: true },
    );
    await ubicaciones.createIndex(
      { ancestros: 1 },
      { name: 'ancestros_1', background: true },
    );

    // Verificación: los equipos siguen exactamente donde estaban.
    const despues = await equiposPorUbicacion(db);
    if (!mismosConteos(antes, despues)) {
      console.error(
        'ALERTA: los equipos por ubicación cambiaron durante la migración. Revisar contra el respaldo.',
      );
      process.exitCode = 1;
      return;
    }
    const sinRuta = await ubicaciones.countDocuments({ ruta: { $exists: false } });
    console.log(
      `\nListo. Equipos por ubicación idénticos (${totalEquipos}). Ubicaciones sin ruta: ${sinRuta}.`,
    );
  } finally {
    await cliente.close();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
