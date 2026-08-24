#!/usr/bin/env node
/**
 * Deja `config_formularios` alineada con lo que el inventario guarda de verdad.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────
 *
 * `campo.name` **es la clave dentro de `especificaciones`**, no un id interno:
 * el panel de equipos lee `especificaciones[campo.name]`. El importador guarda
 * esas claves con el texto exacto de la cabecera del Excel («Tipo de escalera»,
 * «AMPERAJE», «Codigo Interno»), y las configuraciones existentes usaban
 * nombres en snake_case inventados a mano («tipo_escalera», «amperaje»).
 *
 * Consecuencia: ningún dato importado se veía en el panel, y al guardar se
 * creaba una segunda clave paralela con el mismo significado. Aquí cada `name`
 * es la cabecera real.
 *
 * También corrige `Taladro de banco` → `Taldro de banco`: el `tipo_equipo` sale
 * del nombre de la hoja del Excel, que viene con esa errata, y una
 * configuración que no coincide con el tipo no se aplica a nada.
 *
 * Idempotente y con dry-run por defecto.
 *
 *   node src/modules/config-formulario/scripts/sembrar-config-formularios.cjs
 *   node src/modules/config-formulario/scripts/sembrar-config-formularios.cjs --apply
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.resolve(__dirname, '../..');

const txt = (name, label) => ({
  name,
  label,
  type: 'text',
  required: false,
  options: [],
});

/**
 * Los cinco tipos en que se divide la hoja `ArnesAuConAncl` comparten estos
 * dos campos porque el inventario los trae para todos. A partir de aquí cada
 * uno puede divergir desde el panel —un retráctil tiene longitud de cable, un
 * arnés tiene talla— sin tocar a los demás; antes eran un solo `tipo_equipo` y
 * no había dónde poner esa diferencia.
 */
const camposSpcc = () => [
  // Etiqueta del lote: codifica gerencia, superintendencia, área, talla y
  // fecha de fabricación. Se repite entre equipos —no identifica a la
  // unidad, eso lo hace el RFID— pero es lo que está impreso en el arnés.
  txt('Codigo Interno', 'Código interno (etiqueta)'),
  {
    // Lista cerrada a propósito: son normas, y un tipeo aquí ensucia el
    // reporte. Si aparece una nueva se agrega desde el panel.
    name: 'Normativa',
    label: 'Normativa',
    type: 'select',
    required: false,
    options: [
      'ANSI Z359',
      'ANSI A10',
      'IRAM 3622',
      'EN 353',
      'EN 358',
      'EN 795',
      'OSHA 1910.66',
      'OSHA 29 CFR 1926.502',
      'OSHA 29 CFR1910',
      'OSHA 29CFR',
      'CSA Z259',
    ],
  },
];

const CONFIGS = [
  // La configuración que existía cubría la hoja entera; se reusa para `Arnes`
  // —el grupo más numeroso— y los otros cuatro tipos se crean.
  { tipo_equipo: 'Arnes', renombraDe: 'ArnesAuConAncl', campos: camposSpcc() },
  { tipo_equipo: 'ConectorTT', campos: camposSpcc() },
  { tipo_equipo: 'ConectorAN', campos: camposSpcc() },
  { tipo_equipo: 'Autoretractil', campos: camposSpcc() },
  { tipo_equipo: 'Retractil', campos: camposSpcc() },
  {
    tipo_equipo: 'Vehiculos',
    campos: [
      {
        name: 'Tipo de vehiculo',
        label: 'Tipo de vehículo',
        type: 'select',
        required: true,
        options: ['Camioneta', 'Camion', 'Vagoneta'],
      },
    ],
  },
  {
    tipo_equipo: 'Escalera',
    campos: [
      {
        name: 'Tipo de escalera',
        label: 'Tipo de escalera',
        type: 'select',
        required: true,
        options: ['Tijera', 'Extensión', 'Recta', 'Plataforma'],
      },
      txt('Longitud', 'Longitud (pies/metros)'),
      txt('Carga Maxima', 'Carga máxima (kg/lbs)'),
    ],
  },
  {
    tipo_equipo: 'Amoladora',
    campos: [
      txt('AMPERAJE', 'Amperaje (A)'),
      txt('Diametro de disco', 'Diámetro de disco (pulgadas)'),
      txt('Potencia', 'Potencia (W/HP)'),
      txt('voltaje', 'Voltaje (V)'),
      txt('RPMs', 'RPMs'),
    ],
  },
  {
    tipo_equipo: 'Esmeril de banco',
    campos: [
      txt('voltaje', 'Voltaje (V)'),
      txt('amperaje', 'Amperaje (A)'),
      txt('RPMs', 'RPMs'),
      txt('Diametro de discos', 'Diámetro de discos'),
    ],
  },
  {
    tipo_equipo: 'Taldro de banco',
    renombraDe: 'Taladro de banco',
    campos: [
      txt('Diametro máximo', 'Diámetro máximo'),
      txt('Potencia', 'Potencia'),
      txt('voltaje', 'Voltaje'),
      txt('AMPERAJE', 'Amperaje'),
    ],
  },
];

function leerUri() {
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = /^MONGODB_URI\s*=\s*(.+)$/m.exec(env);
  if (!m) throw new Error('No se encontró MONGODB_URI en .env');
  return m[1].trim();
}

const huella = (campos = []) =>
  JSON.stringify(
    campos.map((c) => [c.name, c.label, c.type, !!c.required, c.options ?? []]),
  );

(async () => {
  const db = (await mongoose.connect(leerUri())).connection.db;
  console.log(`Base: ${db.databaseName}`);
  console.log(APLICAR ? 'MODO: APLICAR (escribe)\n' : 'MODO: dry-run\n');

  const col = db.collection('config_formularios');
  const equipos = db.collection('equipos');

  for (const cfg of CONFIGS) {
    const cuantos = await equipos.countDocuments({
      tipo_equipo: cfg.tipo_equipo,
    });

    // Un `tipo_equipo` mal escrito no se puede corregir con un upsert: hay que
    // encontrar el documento viejo por su nombre anterior.
    let existente = await col.findOne({ tipo_equipo: cfg.tipo_equipo });
    if (!existente && cfg.renombraDe) {
      existente = await col.findOne({ tipo_equipo: cfg.renombraDe });
      if (existente) {
        console.log(
          `↻  renombrar "${cfg.renombraDe}" → "${cfg.tipo_equipo}" (así coincide con los equipos)`,
        );
      }
    }

    // «Al día» exige las dos cosas: los mismos campos **y** el mismo
    // `tipo_equipo`. Comparar solo los campos daba por bueno un documento que
    // todavía se llamaba como antes, y el renombrado nunca llegaba a
    // aplicarse: la configuración quedaba colgada de un tipo que ya no existe.
    const alDia =
      existente &&
      existente.tipo_equipo === cfg.tipo_equipo &&
      huella(existente.campos) === huella(cfg.campos);
    if (alDia) {
      console.log(`=  ${cfg.tipo_equipo}: ya está al día (${cuantos} equipos)`);
      continue;
    }

    console.log(
      `${existente ? '~' : '+'}  ${cfg.tipo_equipo}: ` +
        `${existente ? 'actualizar' : 'crear'} — ${cuantos} equipos de este tipo`,
    );
    for (const c of cfg.campos) {
      const conValor = await equipos.countDocuments({
        tipo_equipo: cfg.tipo_equipo,
        [`especificaciones.${c.name}`]: { $exists: true },
      });
      console.log(
        `      ${c.name.padEnd(20)} ${c.type.padEnd(7)} ` +
          `${String(conValor).padStart(4)}/${cuantos} equipos ya traen el dato`,
      );
    }

    if (!APLICAR) continue;

    if (existente) {
      await col.updateOne(
        { _id: existente._id },
        {
          $set: {
            tipo_equipo: cfg.tipo_equipo,
            campos: cfg.campos,
            updatedAt: new Date(),
          },
        },
      );
    } else {
      await col.insertOne({
        tipo_equipo: cfg.tipo_equipo,
        campos: cfg.campos,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Tipos que tienen equipos pero ninguna configuración: no se inventa una,
  // solo se avisa — sus especificaciones no se ven en el panel.
  const tipos = await equipos.distinct('tipo_equipo');
  const configurados = (await col.find({}).toArray()).map((c) => c.tipo_equipo);
  const sinConfig = tipos.filter((t) => !configurados.includes(t));
  if (sinConfig.length) {
    console.log(`\n⚠  sin configuración: ${sinConfig.join(', ')}`);
  }

  await mongoose.disconnect();
  console.log(`\n${APLICAR ? 'Listo.' : 'Dry-run. Repetir con --apply.'}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
