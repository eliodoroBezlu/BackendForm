/**
 * Convierte a ObjectId el `templateId` de las inspecciones IRO/ISOP
 * (`instances`) que lo tienen guardado como texto.
 *
 * Por qué pasa: al editar una inspección, el `templateId` llegaba como texto y
 * se guardaba así (al crear sí se convertía). Desde 2026-10-24 la edición lo
 * convierte, pero las ya editadas quedaron en texto: el filtro por plantilla
 * de Reportes no las encontraba (en producción, 18 de 208 el 2026-10-22).
 *
 * Solo toca las que tienen un texto de 24 caracteres hexadecimales que además
 * corresponde a una plantilla existente; las demás se listan y no se tocan.
 * Cada escritura exige que el valor siga siendo el mismo texto.
 *
 * Idempotente: una segunda pasada no encuentra nada.
 *
 * Antes de `--apply`, respaldar:
 *   node scripts/respaldar-colecciones.cjs instances
 *
 * Uso:
 *   node scripts/reparar-templateid-texto.cjs           → dry-run (no escribe)
 *   node scripts/reparar-templateid-texto.cjs --apply   → aplica
 */
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

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

async function main() {
  console.log(`Base: ${destino(uri())}`);
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN (no escribe)'}`);

  const cliente = await MongoClient.connect(uri());
  try {
    const db = cliente.db();
    const plantillas = new Map(
      (
        await db
          .collection('templates')
          .find()
          .project({ code: 1, name: 1 })
          .toArray()
      ).map((p) => [String(p._id), p]),
    );

    const enTexto = await db
      .collection('instances')
      .find({ templateId: { $type: 'string' } })
      .project({ templateId: 1, createdAt: 1, status: 1 })
      .toArray();

    const convertibles = [];
    const raras = [];
    for (const i of enTexto) {
      const id = i.templateId;
      if (
        ObjectId.isValid(id) &&
        String(new ObjectId(id)) === id &&
        plantillas.has(id)
      ) {
        convertibles.push(i);
      } else {
        raras.push(i);
      }
    }

    console.log(`\nInspecciones con templateId en texto: ${enTexto.length}`);
    const porPlantilla = {};
    for (const i of convertibles) {
      const p = plantillas.get(i.templateId);
      const clave = `${p.code ?? '—'} ${p.name}`;
      porPlantilla[clave] = (porPlantilla[clave] ?? 0) + 1;
    }
    console.log(`== Se convierten: ${convertibles.length}`);
    for (const [clave, n] of Object.entries(porPlantilla)) {
      console.log(`  ${n} × ${clave}`);
    }
    console.log(
      `== No se tocan (no apuntan a una plantilla existente): ${raras.length}`,
    );
    for (const i of raras) {
      console.log(
        `  ${String(i._id)} templateId=${JSON.stringify(i.templateId)}`,
      );
    }

    if (!APLICAR) {
      console.log('\nDRY-RUN: no se escribió nada. Repetir con --apply.');
      return;
    }

    let escritas = 0;
    for (const i of convertibles) {
      const { modifiedCount } = await db
        .collection('instances')
        .updateOne(
          { _id: i._id, templateId: i.templateId },
          { $set: { templateId: new ObjectId(i.templateId) } },
        );
      if (modifiedCount === 1) escritas++;
      else
        console.warn(
          `  No se escribió ${String(i._id)}: cambió mientras corría el script`,
        );
    }
    console.log(
      `\nAPLICADO: ${escritas} de ${convertibles.length} convertidas.`,
    );
  } finally {
    await cliente.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
