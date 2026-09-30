/**
 * Pone en marcha el versionado de plantillas (borrador / vigente / obsoleta)
 * en las dos colecciones: `templates` (IRO/ISOP) y `templateherraequipos`.
 *
 * Para cada plantilla sin estado:
 * - `numeroRevision` sale del texto que ya tiene («Revisión: 7» → 7, «Rev. 1»
 *   → 1, «4» → 4; sin número, 1).
 * - Dentro de cada código, la de número más alto (y activa) queda **vigente**
 *   y las demás **obsoletas**. Hoy solo 1.02.P06.F19 de herramientas tiene
 *   dos documentos: la Rev. 5 (444 inspecciones) queda vigente y la 4 (sin
 *   uso) obsoleta.
 *
 * Índices:
 * - En `templates` se borra el índice único `code_1`: todas las revisiones
 *   de una plantilla comparten el código.
 * - En las dos: único `{ code, numeroRevision }` y único parcial «una sola
 *   vigente por código». Con los mismos nombres que declara el esquema, para
 *   que Mongoose no intente crearlos otra vez.
 *
 * ⚠️ Las inspecciones no se tocan: siguen apuntando a su plantilla por
 * `templateId`, que no cambia. El script cuenta las inspecciones por
 * plantilla antes y después y avisa si difieren.
 *
 * Aborta sin escribir si dos plantillas del mismo código quedarían con el
 * mismo número de revisión (el índice único no se podría crear).
 *
 * Idempotente: una plantilla que ya tiene `estadoRevision` no se toca.
 *
 * Antes de `--apply`, respaldar:
 *   mongodump --uri "<MONGODB_URI>" --collection templates
 *   mongodump --uri "<MONGODB_URI>" --collection templateherraequipos
 *
 * Uso:
 *   node scripts/migrar-versionado-plantillas.cjs           → dry-run (no escribe)
 *   node scripts/migrar-versionado-plantillas.cjs --apply   → aplica
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.join(__dirname, '..');

const COLECCIONES = [
  { plantillas: 'templates', inspecciones: 'instances', borrarCodeUnico: true },
  {
    plantillas: 'templateherraequipos',
    inspecciones: 'inspections_herra_equipos',
    borrarCodeUnico: false,
  },
];

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

/** Igual que `numeroDesdeTexto` del backend. */
function numeroDesdeTexto(texto) {
  const numeros = String(texto ?? '').match(/\d+/g);
  const n = numeros ? Number(numeros[numeros.length - 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function inspeccionesPorPlantilla(db, coleccion) {
  const filas = await db
    .collection(coleccion)
    .aggregate([{ $group: { _id: '$templateId', n: { $sum: 1 } } }])
    .toArray();
  return new Map(filas.map((f) => [String(f._id), f.n]));
}

function mismosConteos(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** Decide estado y número de cada plantilla. Devuelve [cambios, colisiones]. */
function planificar(docs) {
  const porCodigo = new Map();
  for (const d of docs) {
    const lista = porCodigo.get(d.code) ?? [];
    lista.push(d);
    porCodigo.set(d.code, lista);
  }

  const cambios = [];
  const colisiones = [];
  for (const [codigo, lista] of porCodigo) {
    const numerados = lista.map((d) => ({
      d,
      numero: d.numeroRevision ?? numeroDesdeTexto(d.revision),
    }));

    const vistos = new Map();
    for (const { d, numero } of numerados) {
      if (vistos.has(numero)) {
        colisiones.push(`${codigo}: «${vistos.get(numero)}» y «${d.revision}» quedan ambas como revisión ${numero}`);
      }
      vistos.set(numero, d.revision);
    }

    // Si la familia ya tiene una vigente migrada, esa manda.
    const yaVigente = numerados.find(({ d }) => d.estadoRevision === 'vigente');
    const candidatas = numerados
      .filter(({ d }) => d.activo !== false)
      .sort((a, b) => b.numero - a.numero || new Date(b.d.createdAt) - new Date(a.d.createdAt));
    const vigente = yaVigente ?? candidatas[0];

    for (const { d, numero } of numerados) {
      if (d.estadoRevision) continue; // ya migrada
      const esVigente = vigente && String(vigente.d._id) === String(d._id);
      cambios.push({
        _id: d._id,
        codigo,
        revision: d.revision,
        numero,
        estado: esVigente ? 'vigente' : 'obsoleta',
        baja: d.activo === false,
        campos: esVigente
          ? { numeroRevision: numero, estadoRevision: 'vigente', vigenteDesde: d.createdAt ?? new Date() }
          : { numeroRevision: numero, estadoRevision: 'obsoleta', obsoletaDesde: new Date() },
      });
    }
  }
  return [cambios, colisiones];
}

(async () => {
  const cliente = new MongoClient(uri());
  await cliente.connect();
  const db = cliente.db();
  console.log(`Base: ${destino(uri())}`);
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN (no escribe)'}`);

  try {
    // 1. Planificar todo antes de escribir nada.
    const planes = [];
    let abortar = false;
    for (const col of COLECCIONES) {
      const docs = await db.collection(col.plantillas).find({}).toArray();
      const [cambios, colisiones] = planificar(docs);
      const antes = await inspeccionesPorPlantilla(db, col.inspecciones);
      const indices = await db.collection(col.plantillas).indexes();
      planes.push({ col, cambios, antes, indices });

      console.log(`\n== ${col.plantillas}: ${docs.length} plantillas, ${cambios.length} a migrar`);
      for (const c of cambios) {
        console.log(
          `  ${c.codigo}  «${c.revision}» → Rev ${c.numero} ${c.estado.toUpperCase()}${c.baja ? ' (dada de baja)' : ''}  · ${antes.get(String(c._id)) ?? 0} inspecciones`,
        );
      }
      if (colisiones.length > 0) {
        abortar = true;
        console.error('  ABORTA: números de revisión repetidos dentro de un código:');
        colisiones.forEach((c) => console.error('   -', c));
      }
      const codeUnico = indices.find((i) => i.name === 'code_1' && i.unique);
      if (col.borrarCodeUnico) {
        console.log(`  Índice único code_1: ${codeUnico ? 'existe → se borra' : 'no existe'}`);
      }
    }

    if (abortar) {
      process.exitCode = 1;
      return;
    }
    if (!APLICAR) {
      console.log('\nDRY-RUN: no se escribió nada. Repetir con --apply.');
      return;
    }

    // 2. Aplicar.
    for (const { col, cambios, antes, indices } of planes) {
      const coleccion = db.collection(col.plantillas);

      // Primero obsoletas y después vigentes: el índice parcial no admite dos
      // vigentes ni por un instante (relevante si ya existiera).
      const ordenados = [...cambios].sort((a) => (a.estado === 'obsoleta' ? -1 : 1));
      for (const c of ordenados) {
        await coleccion.updateOne(
          { _id: c._id, estadoRevision: { $exists: false } },
          { $set: c.campos },
        );
      }

      if (col.borrarCodeUnico && indices.some((i) => i.name === 'code_1' && i.unique)) {
        await coleccion.dropIndex('code_1');
      }
      await coleccion.createIndex(
        { code: 1, numeroRevision: 1 },
        { unique: true, name: 'code_1_numeroRevision_1' },
      );
      await coleccion.createIndex(
        { code: 1, estadoRevision: 1 },
        {
          unique: true,
          partialFilterExpression: { estadoRevision: 'vigente' },
          name: 'code_vigente_unica',
        },
      );
      await coleccion.createIndex({ estadoRevision: 1 }, { name: 'estadoRevision_1' });

      // 3. Verificar.
      const despues = await inspeccionesPorPlantilla(db, col.inspecciones);
      if (!mismosConteos(antes, despues)) {
        console.error(`ALERTA ${col.plantillas}: cambiaron los conteos de inspecciones. Revisar contra el respaldo.`);
        process.exitCode = 1;
      }
      const sinEstado = await coleccion.countDocuments({ estadoRevision: { $exists: false } });
      const vigentes = await coleccion
        .aggregate([
          { $match: { estadoRevision: 'vigente' } },
          { $group: { _id: '$code', n: { $sum: 1 } } },
          { $match: { n: { $gt: 1 } } },
        ])
        .toArray();
      console.log(
        `\n${col.plantillas}: listo. Sin estado: ${sinEstado}. Códigos con más de una vigente: ${vigentes.length}.`,
      );
    }
  } finally {
    await cliente.close();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
