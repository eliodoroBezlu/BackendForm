/**
 * Comprueba que la conversión a replica set quedó bien.
 *
 * No se conforma con `rs.status().ok`: abre una **transacción real** contra una
 * colección de prueba y la deshace. Es la única forma de saber que la Fase 4 es
 * viable de verdad — un conjunto mal iniciado puede responder `ok` y aun así
 * rechazar transacciones.
 *
 * Solo escribe en una colección propia (`_prueba_transaccion`) y siempre hace
 * rollback, así que no toca ningún dato del sistema.
 */
const RAIZ = require('path').resolve(__dirname, '../..');
require(RAIZ + '/node_modules/dotenv').config({ path: RAIZ + '/.env' });
const { MongoClient } = require(RAIZ + '/node_modules/mongodb');

let fallos = 0;
const ok = (c, t, x = '') => {
  if (!c) fallos++;
  console.log(`${c ? '  ok  ' : ' FALLA'} ${t}${x ? '   -> ' + x : ''}`);
};

(async () => {
  const uri = process.env.MONGODB_URI;
  console.log('URI:', uri.replace(/\/\/[^@]*@/, '//<credenciales>@'));
  console.log('');

  const cliente = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await cliente.connect();
  const admin = cliente.db().admin();

  console.log('== el conjunto esta activo ==');
  let estado = null;
  try {
    estado = await admin.command({ replSetGetStatus: 1 });
    ok(true, 'replSetGetStatus responde', `conjunto "${estado.set}"`);
  } catch (e) {
    ok(false, 'replSetGetStatus responde', e.codeName || e.message);
    console.log('\n  El contenedor no arranco con --replSet. Revisa el paso 3.');
    await cliente.close();
    process.exit(1);
  }

  const primario = estado.members.find((m) => m.stateStr === 'PRIMARY');
  ok(!!primario, 'hay un miembro PRIMARY', primario ? primario.name : 'ninguno');
  ok(
    estado.members.length === 1,
    'el conjunto tiene un solo miembro, como se planeo',
    String(estado.members.length),
  );

  console.log('\n== el host registrado es alcanzable desde Windows ==');
  const host = primario ? primario.name : '';
  ok(
    host.startsWith('localhost') || host.startsWith('127.0.0.1'),
    'el miembro se registro como localhost, no con el nombre del contenedor',
    host,
  );
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    console.log(
      '\n  Corrige con:\n' +
        '  rs.reconfig({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]}, {force:true})',
    );
  }

  console.log('\n== los datos siguen ahi ==');
  const db = cliente.db();
  const colecciones = await db.listCollections().toArray();
  ok(colecciones.length > 0, 'la base conserva sus colecciones', `${colecciones.length}`);
  const inspecciones = await db
    .collection('inspectionherraequipos')
    .countDocuments()
    .catch(() => -1);
  ok(inspecciones > 0, 'las inspecciones siguen presentes', String(inspecciones));

  console.log('\n== LO QUE IMPORTA: una transaccion real funciona ==');
  const sesion = cliente.startSession();
  try {
    await sesion.withTransaction(async () => {
      const prueba = db.collection('_prueba_transaccion');
      await prueba.insertOne({ momento: new Date() }, { session: sesion });
      // Se aborta a proposito: no queremos dejar rastro.
      throw new Error('deshacer-a-proposito');
    });
    ok(false, 'la transaccion deberia haberse deshecho');
  } catch (e) {
    if (e.message === 'deshacer-a-proposito') {
      ok(true, 'se abre, se escribe y se deshace una transaccion');
      const quedo = await db
        .collection('_prueba_transaccion')
        .countDocuments({});
      ok(quedo === 0, 'y no quedo nada escrito tras el rollback', String(quedo));
    } else {
      ok(false, 'la transaccion fallo', e.codeName || e.message);
      console.log('\n  Si dice "Transaction numbers are only allowed on a replica set"');
      console.log('  el conjunto no esta realmente activo.');
    }
  } finally {
    await sesion.endSession();
    await db.collection('_prueba_transaccion').drop().catch(() => {});
  }

  await cliente.close();
  console.log(
    `\n${fallos === 0 ? 'RESULTADO: TODO OK — la Fase 4 es viable' : `RESULTADO: ${fallos} FALLA(S)`}`,
  );
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nNo se pudo conectar:', e.message);
  console.error('Si el contenedor acaba de reiniciarse, espera unos segundos.');
  process.exit(1);
});
