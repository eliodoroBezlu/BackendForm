#!/usr/bin/env node
/**
 * Carga la dotación de linternas que el personal **ya tenía** antes de que
 * existiera el módulo.
 *
 * Es una línea de base histórica, no una entrega de hoy. De ahí las dos
 * decisiones que lo separan del flujo normal:
 *
 *  - **Sin `fechaEntrega`.** Nadie sabe qué día se entregó cada una, y poner
 *    la fecha de la carga sería inventar un dato que después se leería como
 *    cierto en el acta y en los reportes. El esquema ya la tiene opcional
 *    justamente para esto; `estadoDeTrabajador` descarta las entregas sin
 *    fecha al calcular la última entrega, así que un hueco es correcto.
 *  - **No toca el stock.** Esas linternas salieron del almacén hace tiempo;
 *    las 50 que hay hoy son para cambios y reposiciones. Descontarlas dejaría
 *    el inventario en negativo y borraría el stock real.
 *
 * Excluye el área «Superintendencia» (los superintendentes, uno por
 * superintendencia) y a quien esté dado de baja — el mismo criterio
 * `activo != false` que usa el módulo en todas sus consultas.
 *
 * Idempotente: se salta a quien ya tenga dotación, y el índice único parcial
 * `una_dotacion_por_trabajador` es la última línea de defensa si dos
 * ejecuciones se cruzan.
 *
 *   node scripts/cargar-dotacion-inicial-linternas.cjs           # dry-run
 *   node scripts/cargar-dotacion-inicial-linternas.cjs --apply   # escribe
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const RAIZ = path.join(__dirname, '..');
const APLICAR = process.argv.includes('--apply');

/** Quién figura como responsable del registro. No es una persona: es la carga. */
const REGISTRADO_POR = 'carga-inicial';

/** Áreas que no reciben dotación. */
const AREAS_EXCLUIDAS = ['Superintendencia'];

async function main() {
  // Primero la variable de entorno y solo después el `.env`: en Railway no
  // hay archivo, la conexión llega como variable. Nunca se imprime.
  const rutaEnv = path.join(RAIZ, '.env');
  const uri =
    process.env.MONGODB_URI ||
    (fs.existsSync(rutaEnv)
      ? (fs.readFileSync(rutaEnv, 'utf8').match(/^MONGODB_URI=(.*)$/m) || [])[1]
      : undefined);

  if (!uri) {
    console.error(
      'Falta la conexión. Defina MONGODB_URI en el entorno o en BackendForm/.env',
    );
    process.exit(1);
  }

  const cliente = new MongoClient(uri.trim());
  await cliente.connect();
  const db = cliente.db();

  const trabajadores = db.collection('trabajadors');
  const entregas = db.collection('entregas_linterna');

  // Quién ya tiene dotación. Se pregunta a la base y no se asume que está
  // vacía: el script tiene que poder correrse dos veces sin duplicar nada.
  const yaDotados = await entregas.distinct('trabajador', { tipo: 'dotacion' });
  const yaDotadosTexto = new Set(yaDotados.map(String));

  const candidatos = await trabajadores
    .find({ activo: { $ne: false }, area: { $nin: AREAS_EXCLUIDAS } })
    .project({ nomina: 1, area: 1, superintendencia: 1 })
    .toArray();

  const pendientes = candidatos.filter((t) => !yaDotadosTexto.has(String(t._id)));

  // Un trabajador sin área o sin superintendencia rompería el esquema, que las
  // exige. Se apartan y se listan en vez de rellenarlos con un valor inventado.
  const incompletos = pendientes.filter((t) => !t.area || !t.superintendencia);
  const aCargar = pendientes.filter((t) => t.area && t.superintendencia);

  const excluidos = await trabajadores.countDocuments({
    activo: { $ne: false },
    area: { $in: AREAS_EXCLUIDAS },
  });

  console.log(`Modo          : ${APLICAR ? 'APLICAR (escribe en la base)' : 'DRY-RUN (no escribe nada)'}`);
  console.log(`Activos       : ${candidatos.length + excluidos}`);
  console.log(`Excluidos     : ${excluidos} (área ${AREAS_EXCLUIDAS.join(', ')})`);
  console.log(`Ya con dotación: ${yaDotadosTexto.size}`);
  console.log(`Sin área/sup. : ${incompletos.length}`);
  console.log(`A cargar      : ${aCargar.length}`);

  if (incompletos.length > 0) {
    console.log('\nSe omiten por datos incompletos:');
    for (const t of incompletos) {
      console.log(`  - ${t.nomina ?? t._id} (área: ${t.area ?? '—'}, sup.: ${t.superintendencia ?? '—'})`);
    }
  }

  const porArea = {};
  for (const t of aCargar) porArea[t.area] = (porArea[t.area] ?? 0) + 1;
  console.log('\nPor área:');
  for (const [area, n] of Object.entries(porArea).sort()) {
    console.log(`  ${String(n).padStart(4)}  ${area}`);
  }

  if (!APLICAR) {
    console.log('\nDry-run: no se escribió nada. Repita con --apply.');
    await cliente.close();
    return;
  }

  if (aCargar.length === 0) {
    console.log('\nNo hay nada que cargar.');
    await cliente.close();
    return;
  }

  const ahora = new Date();
  const documentos = aCargar.map((t) => ({
    trabajador: t._id,
    area: t.area,
    superintendencia: t.superintendencia,
    nombreTrabajador: t.nomina,
    tipo: 'dotacion',
    estado: 'registrada',
    // `fechaEntrega` se omite a propósito: ver la cabecera del archivo.
    // Marca que esta linterna no salió del stock que lleva el sistema, para
    // que el resumen no cuente 188 salidas contra 50 ingresos.
    previaAlSistema: true,
    registradoPor: REGISTRADO_POR,
    observacion: 'Dotación previa al sistema; fecha de entrega no registrada.',
    createdAt: ahora,
    updatedAt: ahora,
    __v: 0,
  }));

  // `ordered: false` para que un choque puntual con el índice único no aborte
  // el resto: si alguien recibió su dotación por la pantalla mientras esto
  // corría, se salta ese y sigue con los demás.
  let insertados = 0;
  try {
    const r = await entregas.insertMany(documentos, { ordered: false });
    insertados = r.insertedCount;
  } catch (error) {
    insertados = error.result?.insertedCount ?? 0;
    const choques = (error.writeErrors ?? []).length;
    console.log(`\nAviso: ${choques} documento(s) rechazados por el índice único (ya tenían dotación).`);
  }

  console.log(`\nInsertados: ${insertados}`);
  console.log(`Con dotación ahora: ${await entregas.countDocuments({ tipo: 'dotacion' })}`);

  await cliente.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
