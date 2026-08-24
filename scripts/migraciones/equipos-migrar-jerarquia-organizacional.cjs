#!/usr/bin/env node
/**
 * Cierra la cadena **Gerencia → Superintendencia → Área → subárea** y pone a
 * los equipos existentes en el nuevo modelo de ámbito.
 *
 * ── Qué hace ──────────────────────────────────────────────────────────────
 *
 * 1. Crea la gerencia «GERENCIA DE MANTENIMIENTO PLANTA» si no existe.
 * 2. Le cuelga las superintendencias de mantenimiento.
 * 3. Hace de «Vias ferreas» una subárea de «Recursos Hidricos» — en el fondo
 *    son la misma, pero se mantiene aparte porque se le hacen inspecciones
 *    propias.
 * 4. Marca los equipos existentes con `ambito: 'area'`, que es lo que eran
 *    antes de que el ámbito existiera.
 *
 * Idempotente y con dry-run por defecto.
 *
 *   node src/modules/equipos/scripts/migrar-jerarquia-organizacional.cjs
 *   node src/modules/equipos/scripts/migrar-jerarquia-organizacional.cjs --apply
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.resolve(__dirname, '../..');

const GERENCIA = 'GERENCIA DE MANTENIMIENTO PLANTA';

/**
 * Superintendencias que cuelgan de esa gerencia, por nombre local.
 *
 * Va explícito y no por heurística: «Superintendencia TO» y «PLANTA» **no**
 * pertenecen a Mantenimiento Planta, y adivinar por parecido de nombre ya nos
 * costó caro una vez en el sync de áreas.
 */
const SUPERINTENDENCIAS = [
  'Superintendencia de Mantenimiento - Mec. Planta Chancado, Molienda y Lubricación',
  'Superintendencia de Mantenimiento - Mec. Planta Flotación, Filtros, Taller General y RH',
  'Superintendencia de Mantenimiento - Eléctrico e Instrumentación Planta',
  'Superintendencia de Mantenimiento - Ingeniería de Confiabilidad',
  'Superintendencia de Mantenimiento - Planificación',
  'Superintendencia de Mantenimiento',
];

/** Subáreas: `hija` pasa a colgar de `padre`. */
const SUBAREAS = [{ hija: 'Vias ferreas', padre: 'Recursos Hidricos' }];

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

function leerUri() {
  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const m = /^MONGODB_URI\s*=\s*(.+)$/m.exec(env);
  if (!m) throw new Error('No se encontró MONGODB_URI en .env');
  return m[1].trim();
}

(async () => {
  const db = (await mongoose.connect(leerUri())).connection.db;
  console.log(`Base: ${db.databaseName}`);
  console.log(APLICAR ? 'MODO: APLICAR (escribe)\n' : 'MODO: dry-run\n');

  const colGer = db.collection('gerencias');
  const colSup = db.collection('superintendencias');
  const colArea = db.collection('areas');
  const colEq = db.collection('equipos');

  // ── 1. Gerencia ──────────────────────────────────────────────────────────
  let gerencia = await colGer.findOne({ nombre: GERENCIA });
  if (gerencia) {
    console.log(`GERENCIA  ya existe "${GERENCIA}" (${gerencia._id})`);
  } else {
    console.log(`GERENCIA  crear "${GERENCIA}"`);
    if (APLICAR) {
      const r = await colGer.insertOne({
        nombre: GERENCIA,
        activo: true,
        creadoPor: 'migracion-jerarquia',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      gerencia = { _id: r.insertedId };
    }
  }

  // ── 2. Superintendencias → gerencia ──────────────────────────────────────
  const sups = await colSup.find({}).toArray();
  for (const nombre of SUPERINTENDENCIAS) {
    const sup = sups.find((s) => norm(s.nombre) === norm(nombre));
    if (!sup) {
      console.log(`⚠  SUPER  "${nombre}" no existe en esta base`);
      continue;
    }
    if (gerencia && String(sup.gerencia_id) === String(gerencia._id)) {
      continue; // ya ligada
    }
    console.log(`SUPER     "${sup.nombre.slice(0, 58)}" → ${GERENCIA}`);
    if (APLICAR && gerencia) {
      await colSup.updateOne(
        { _id: sup._id },
        { $set: { gerencia_id: gerencia._id } },
      );
    }
  }

  const sinLigar = sups.filter(
    (s) => !SUPERINTENDENCIAS.some((n) => norm(n) === norm(s.nombre)),
  );
  for (const s of sinLigar) {
    console.log(`          (sin gerencia, a propósito) "${s.nombre.slice(0, 50)}"`);
  }

  // ── 3. Subáreas ──────────────────────────────────────────────────────────
  const areas = await colArea.find({}).toArray();
  for (const { hija, padre } of SUBAREAS) {
    const a = areas.find((x) => norm(x.nombre) === norm(hija));
    const p = areas.find((x) => norm(x.nombre) === norm(padre));
    if (!a || !p) {
      console.log(`⚠  SUBAREA  falta "${!a ? hija : padre}" en esta base`);
      continue;
    }
    if (String(a.areaPadre) === String(p._id)) continue;
    console.log(`SUBAREA   "${a.nombre}" pasa a colgar de "${p.nombre}"`);
    if (APLICAR) {
      await colArea.updateOne({ _id: a._id }, { $set: { areaPadre: p._id } });
    }
  }

  // ── 4. Equipos existentes → ámbito de área ───────────────────────────────
  const sinAmbito = await colEq.countDocuments({ ambito: { $exists: false } });
  console.log(
    `\nEQUIPOS   ${sinAmbito} sin ámbito → 'area' (es lo que eran antes)`,
  );
  if (APLICAR && sinAmbito > 0) {
    await colEq.updateMany(
      { ambito: { $exists: false } },
      { $set: { ambito: 'area' } },
    );
  }

  const huerfanos = await colEq.countDocuments({
    ambito: 'area',
    $or: [{ area_id: { $exists: false } }, { area_id: null }],
  });
  if (huerfanos > 0) {
    console.log(
      `⚠  ${huerfanos} equipo(s) con ámbito 'area' y sin área — revisar a mano`,
    );
  }

  // ── 5. Índices obsoletos de `equipos` ────────────────────────────────────
  //
  // Mongoose **no borra** índices que ya no están en el esquema: hay que
  // hacerlo a mano o quedan aplicando reglas viejas.
  //
  //   `codigo_1`          era único; ahora la identidad es el par
  //                       `(codigo, rfid)` y este índice rechazaría los SPCC
  //                       que comparten ID interno.
  //   `superintendencia_1`,
  //   `gerencia_1`        quedaron de una versión intermedia en la que esos
  //                       campos eran texto; hoy son `*_id` por referencia.
  const OBSOLETOS = ['codigo_1', 'superintendencia_1', 'gerencia_1'];
  const indices = await colEq.indexes();
  console.log('');
  for (const nombre of OBSOLETOS) {
    if (!indices.some((i) => i.name === nombre)) continue;
    console.log(`INDICE    eliminar "${nombre}" de equipos`);
    if (APLICAR) await colEq.dropIndex(nombre);
  }

  const compuesto = indices.find((i) => i.name === 'codigo_1_rfid_1');
  if (!compuesto) {
    console.log('INDICE    crear único compuesto (codigo, rfid)');
    if (APLICAR) {
      await colEq.createIndex({ codigo: 1, rfid: 1 }, { unique: true });
    }
  }

  if (!APLICAR) {
    console.log('\n(dry-run: no se escribió nada. Volvé a correr con --apply)');
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
