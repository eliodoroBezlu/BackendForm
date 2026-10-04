/**
 * Convierte el campo «Empresa» de la cabecera de las plantillas en un
 * autocompletar con el catálogo de empresas (origen de datos `empresa`).
 *
 * Antes era texto libre en cada plantilla. El catálogo vive en el frontend
 * (`src/lib/catalogos/empresas.ts`); aquí solo se le dice a cada campo que lo
 * use: `type: 'autocomplete'` y `dataSource: 'empresa'`. El campo sigue
 * admitiendo texto libre, así que nada de lo ya respondido deja de valer.
 *
 * Cubre las dos colecciones de plantillas: IRO/ISOP (`templates`) y
 * herramientas y equipos (`templateherraequipos`). Se reconoce el campo por su
 * etiqueta («Empresa», «EMPRESA», con o sin tilde o espacios).
 *
 * No toca:
 * - las revisiones **obsoletas**: son el registro de cómo era el formulario;
 * - las plantillas de prueba (código que empieza por `TEST-`).
 *
 * Solo escribe en `verificationFields`; ni las preguntas ni las respuestas de
 * las inspecciones. Idempotente: una segunda corrida no encuentra nada.
 *
 * Uso:
 *   node scripts/configurar-campo-empresa.cjs           → dry-run (no escribe)
 *   node scripts/configurar-campo-empresa.cjs --apply   → aplica
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.join(__dirname, '..');
const COLECCIONES = ['templates', 'templateherraequipos'];
const TIPO = 'autocomplete';
const ORIGEN = 'empresa';

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

const esEmpresa = (etiqueta) =>
  String(etiqueta ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase() === 'EMPRESA';

const pendiente = (campo) =>
  esEmpresa(campo.label) && (campo.type !== TIPO || campo.dataSource !== ORIGEN);

(async () => {
  const cliente = new MongoClient(uri());
  await cliente.connect();
  const db = cliente.db();
  console.log(`Base: ${destino(uri())}`);
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN (no escribe)'}\n`);

  let total = 0;
  try {
    for (const nombre of COLECCIONES) {
      const col = db.collection(nombre);
      const plantillas = await col
        .find({
          estadoRevision: { $ne: 'obsoleta' },
          code: { $not: /^TEST-/ },
          'verificationFields.label': /empresa/i,
        })
        .toArray();

      for (const p of plantillas) {
        const campos = p.verificationFields ?? [];
        const indices = campos.flatMap((c, i) => (pendiente(c) ? [i] : []));
        if (!indices.length) continue;

        const set = {};
        for (const i of indices) {
          set[`verificationFields.${i}.type`] = TIPO;
          set[`verificationFields.${i}.dataSource`] = ORIGEN;
          const c = campos[i];
          console.log(
            `[${nombre}] ${p.code} ${p.name ?? ''} — campo ${i} «${c.label}»: ` +
              `${c.type ?? '-'}/${c.dataSource || '-'} → ${TIPO}/${ORIGEN}`,
          );
        }
        total += indices.length;
        if (!APLICAR) continue;

        // Se compara con la etiqueta leída: si alguien reordenó los campos
        // entretanto, el índice ya no es el de «Empresa» y no se escribe.
        const filtro = { _id: p._id };
        for (const i of indices) filtro[`verificationFields.${i}.label`] = campos[i].label;
        const r = await col.updateOne(filtro, { $set: set });
        if (r.modifiedCount !== 1) console.log('   ⚠️ No se aplicó: la plantilla cambió entretanto.');
      }
    }
    console.log(`\n${total} campo(s) ${APLICAR ? 'actualizados' : 'por actualizar'}.`);
    if (!APLICAR && total) console.log('DRY-RUN: no se escribió nada. Repetir con --apply.');
  } finally {
    await cliente.close();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
