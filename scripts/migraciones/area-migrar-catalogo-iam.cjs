#!/usr/bin/env node
/**
 * Fusiona el catálogo de Áreas/Superintendencias duplicado por el sync viejo.
 *
 * ── Qué pasó ──────────────────────────────────────────────────────────────
 *
 * El sync anterior emparejaba **por nombre exacto**. Como el IAM escribe
 * «Mec. Plta. Chancado…» donde BackendForm tenía «Mec. Planta Chancado…», y
 * «Generación» donde había «Generacion», cada arranque creaba un registro
 * nuevo y repuntaba las áreas hacia él. Resultado: 11 superintendencias donde
 * el IAM tiene 4, áreas duplicadas por tilde, y los datos partidos en dos
 * vocabularios — los PGR apuntando a un nombre y las matrices y el roster al
 * otro.
 *
 * ── Qué hace este script ──────────────────────────────────────────────────
 *
 * Fusiona cada par conservando **el documento viejo**: es el `_id` que
 * referencian las áreas y el `nombre` que referencian por texto los PGR, las
 * matrices y el roster ya cargados. Al viejo se le estampan `idIam` /
 * `nombreIam` (la clave con la que el sync nuevo empareja) y el `codigo`; el
 * duplicado se elimina.
 *
 * **No renombra nada.** Se eligió conservar los dos nombres —el local y el del
 * IAM— justamente para no tocar los datos que los referencian por texto.
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda vez.
 *
 *   node src/modules/area/scripts/migrar-catalogo-iam.cjs            # dry-run
 *   node src/modules/area/scripts/migrar-catalogo-iam.cjs --apply    # escribe
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APLICAR = process.argv.includes('--apply');
const RAIZ = path.resolve(__dirname, '../..');

/**
 * Equivalencias **explícitas**, no deducidas.
 *
 * El primer intento de este script las adivinaba por parecido de nombre y
 * produjo fusiones contradictorias: «Superintendencia de Mantenimiento» se
 * reduce al único token significativo `MANTENIMIENTO`, que está contenido en
 * todas las demás, así que empataba con las cuatro a la vez; y `PLANTA`
 * empataba con «…Eléctrico e Instrumentación **Planta**». Emparejar «Plta.»
 * con «Planta» es una decisión humana: va escrita acá, revisada, y no se
 * infiere.
 *
 * Se empareja por nombre —ignorando tildes y mayúsculas— y no por `_id`,
 * porque los `_id` de los duplicados son distintos en cada entorno.
 */
const PARES_SUPER = [
  {
    iam: 'Superintendencia de Mantenimiento - Mec. Plta. Chancado, Molienda y Lubricación',
    local: 'Superintendencia de Mantenimiento - Mec. Planta Chancado, Molienda y Lubricación',
  },
  {
    iam: 'Superintendencia de Mantenimiento - Mec. Plta. Flot., Filtros, Taller Gral. y RH',
    local: 'Superintendencia de Mantenimiento - Mec. Planta Flotación, Filtros, Taller General y RH',
  },
  {
    iam: 'Superintendencia de Mantenimiento - Eléctrico e Instrumentación Planta',
    local: 'Superintendencia de Mantenimiento - Eléctrico e Instrumentación Planta',
  },
  {
    iam: 'Superintendencia de Confiabilidad',
    local: 'Superintendencia de Mantenimiento - Ingeniería de Confiabilidad',
  },
];

/**
 * Áreas cuyo nombre no delata que son la misma. Confirmado con el área.
 *
 * `Generacion` es el caso que demuestra por qué el nombre no alcanza: el IAM
 * tiene «Generación» (3368) y «Equipos Industriales y Equipos Auxiliares»
 * (3316), y la que corresponde es **la segunda** — es la que tiene los 12
 * trabajadores, mientras que 3368 no tiene ninguno. Emparejar por nombre sin
 * tildes le habría dado el código equivocado a 99 inspecciones.
 *
 * `Vias ferreas` **no** entra acá: pertenece a Recursos Hídricos pero se
 * mantiene separada a propósito porque se le hacen inspecciones propias.
 */
const PARES_AREA = [
  { local: 'Taller Soldadura', iam: 'Taller General' },
  { local: 'Maq Herramientas', iam: 'Maquinas herramientas' },
  { local: 'Generacion', iam: 'Equipos Industriales y Equipos Auxiliares' },
];

/**
 * Áreas que el IAM ya no manda y que se confirmó que están inactivas allá.
 * Se desactivan acá también — no se borran: los datos históricos que las
 * referencian siguen intactos, solo dejan de ofrecerse en los formularios.
 */
const DESACTIVAR = ['3110', '3111'];

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

async function leerCatalogoIam() {
  const base = (process.env.IAM_CORE_URL || 'http://localhost:4000').replace(
    /\/+$/,
    '',
  );
  const res = await fetch(`${base}/api/rbac/catalog/areas`);
  if (!res.ok) throw new Error(`El IAM respondió ${res.status}`);
  const { areas } = await res.json();
  return areas ?? [];
}

(async () => {
  const db = (await mongoose.connect(leerUri())).connection.db;
  console.log(`Base: ${db.databaseName}`);
  console.log(APLICAR ? 'MODO: APLICAR (escribe)' : 'MODO: dry-run\n');

  const iam = await leerCatalogoIam();
  if (iam.length === 0) throw new Error('El catálogo del IAM vino vacío');
  if (!iam[0].superintendenciaId) {
    throw new Error(
      'El catálogo del IAM no trae `superintendenciaId`. Actualizá iam-core primero.',
    );
  }
  console.log(`IAM: ${iam.length} áreas activas\n`);

  const colAreas = db.collection('areas');
  const colSupers = db.collection('superintendencias');
  const areas = await colAreas.find({}).toArray();
  const supers = await colSupers.find({}).toArray();

  const acciones = [];

  // ── 1. Superintendencias ────────────────────────────────────────────────
  const supersIam = new Map();
  for (const a of iam) {
    supersIam.set(a.superintendenciaId, a.superintendenciaNombre);
  }

  // 1a. Resolver quién es la canónica de cada superintendencia del IAM. Este
  //     paso **no escribe**: hace falta conocer el conjunto completo antes de
  //     tocar nada.
  const canonicaPorIdIam = new Map();

  for (const [idIam, nombreIam] of supersIam) {
    const par = PARES_SUPER.find((p) => norm(p.iam) === norm(nombreIam));
    if (!par) {
      acciones.push(
        `⚠  SUPER "${nombreIam}" no está en PARES_SUPER — se dejará como está. ` +
          `Si equivale a alguna local, agregala a la tabla del script.`,
      );
      continue;
    }

    const canonica = supers.find((s) => norm(s.nombre) === norm(par.local));
    if (!canonica) {
      acciones.push(
        `⚠  SUPER local "${par.local}" no existe en esta base — el sync la creará`,
      );
      continue;
    }
    canonicaPorIdIam.set(idIam, canonica);
  }

  // 1b. Liberar los `idIam` mal asignados **antes** de estamparlos.
  //     `idIam` tiene índice único: si «Superintendencia TO» todavía retiene el
  //     de Flotación, el $set sobre la canónica falla con E11000 y la migración
  //     se corta a la mitad. Es lo que pasó la primera vez que se corrió.
  const idsCanonicos = new Set(
    [...canonicaPorIdIam.values()].map((s) => String(s._id)),
  );
  for (const s of supers) {
    if (s.idIam && !idsCanonicos.has(String(s._id))) {
      acciones.push(
        `LIMPIA superintendencia "${s.nombre}" (${s._id}) tenía idIam=${s.idIam} que no le corresponde`,
      );
      if (APLICAR) {
        await colSupers.updateOne(
          { _id: s._id },
          { $unset: { idIam: '', nombreIam: '' } },
        );
      }
    }
  }

  // 1c. Estampar la clave en las canónicas y absorber los duplicados.
  for (const [idIam, canonica] of canonicaPorIdIam) {
    const nombreIam = supersIam.get(idIam);

    acciones.push(
      `SUPER  conservar "${canonica.nombre}" (${canonica._id}) + idIam=${idIam}`,
    );
    if (APLICAR) {
      await colSupers.updateOne(
        { _id: canonica._id },
        { $set: { idIam, nombreIam, activo: true } },
      );
    }

    // El duplicado es el que creó el sync viejo con el nombre del IAM.
    const duplicados = supers.filter(
      (s) =>
        String(s._id) !== String(canonica._id) &&
        norm(s.nombre) === norm(nombreIam),
    );
    for (const dup of duplicados) {
      const nAreas = areas.filter(
        (a) => String(a.superintendencia) === String(dup._id),
      ).length;
      acciones.push(
        `SUPER  fusionar  "${dup.nombre}" (${dup._id}) → "${canonica.nombre}"  [${nAreas} área(s) repuntada(s)]`,
      );
      if (APLICAR) {
        await colAreas.updateMany(
          { superintendencia: dup._id },
          { $set: { superintendencia: canonica._id } },
        );
        await colSupers.deleteOne({ _id: dup._id });
      }
    }
  }

  // ── 2. Áreas ────────────────────────────────────────────────────────────
  const manualPorIam = new Map(
    PARES_AREA.map((p) => [norm(p.iam), norm(p.local)]),
  );

  /**
   * Nombre local → nombre del IAM al que está atado por `PARES_AREA`.
   *
   * Un área nombrada en la tabla **solo** puede ser la canónica de su pareja.
   * Sin esto, «Generacion» seguiría empatando con «Generación» (3368) por
   * parecido de nombre y le robaría el área a «Equipos Industriales» (3316),
   * que es la que de verdad le corresponde.
   */
  const atadoA = new Map(PARES_AREA.map((p) => [norm(p.local), norm(p.iam)]));
  const puedeSerCanonica = (a, nombreIamArea) => {
    const atado = atadoA.get(norm(a.nombre));
    return atado === undefined || atado === norm(nombreIamArea);
  };

  for (const iamArea of iam) {
    const nombreLocalAtado = manualPorIam.get(norm(iamArea.nombre));
    const conCodigo = areas.filter(
      (a) => a.codigo === iamArea.codigo && puedeSerCanonica(a, iamArea.nombre),
    );
    // Con pareja explícita se busca por nombre aunque ya tenga código: puede
    // tener uno mal asignado por una corrida anterior, y hay que corregirlo.
    const porNombre = nombreLocalAtado
      ? areas.filter((a) => norm(a.nombre) === nombreLocalAtado)
      : areas.filter(
          (a) =>
            !a.codigo &&
            norm(a.nombre) === norm(iamArea.nombre) &&
            puedeSerCanonica(a, iamArea.nombre),
        );

    // La canónica es la que ya usan los datos: la que existía sin código.
    const canonica = porNombre[0] ?? conCodigo[0];
    if (!canonica) {
      acciones.push(`⚠  Área ${iamArea.codigo} "${iamArea.nombre}" no existe local — se creará al sincronizar`);
      continue;
    }

    const duplicados = [
      ...porNombre.slice(1),
      ...areas.filter((a) => a.codigo === iamArea.codigo),
    ].filter((a) => String(a._id) !== String(canonica._id));

    const superCanonica = canonicaPorIdIam.get(iamArea.superintendenciaId);
    const nombreIam =
      iamArea.nombre === canonica.nombre ? null : iamArea.nombre;

    const cambiaSuper =
      superCanonica &&
      String(canonica.superintendencia) !== String(superCanonica._id);

    if (duplicados.length > 0 || !canonica.codigo || cambiaSuper) {
      acciones.push(
        `AREA   conservar "${canonica.nombre}" (${canonica._id}) + codigo=${iamArea.codigo}` +
          (nombreIam ? `  [IAM lo llama "${nombreIam}"]` : ''),
      );
    }
    if (cambiaSuper) {
      const desde =
        supers.find((s) => String(s._id) === String(canonica.superintendencia))
          ?.nombre ?? '(ninguna)';
      acciones.push(
        `AREA   repuntar  "${canonica.nombre}": "${desde}" → "${superCanonica.nombre}"`,
      );
    }

    if (APLICAR) {
      const set = { codigo: iamArea.codigo };
      if (nombreIam) set.nombreIam = nombreIam;
      if (superCanonica) set.superintendencia = superCanonica._id;
      // El duplicado se borra antes de estampar el código: es único.
      for (const dup of duplicados) {
        await colAreas.deleteOne({ _id: dup._id });
      }
      await colAreas.updateOne({ _id: canonica._id }, { $set: set });
    }

    for (const dup of duplicados) {
      acciones.push(`AREA   eliminar  "${dup.nombre}" (${dup._id}, codigo=${dup.codigo ?? '—'})`);
    }
  }

  // ── 3. Candidatas a baja ────────────────────────────────────────────────
  const codigosIam = new Set(iam.map((a) => a.codigo));
  for (const a of areas) {
    if (!a.codigo || !a.activo || codigosIam.has(a.codigo)) continue;

    if (DESACTIVAR.includes(a.codigo)) {
      acciones.push(
        `BAJA   "${a.nombre}" (codigo ${a.codigo}) — inactiva en el IAM, se desactiva acá también`,
      );
      if (APLICAR) {
        await colAreas.updateOne(
          { _id: a._id },
          { $set: { activo: false, actualizadoPor: 'migracion-catalogo-iam' } },
        );
      }
    } else {
      acciones.push(
        `BAJA?  "${a.nombre}" (codigo ${a.codigo}) ya no viene del IAM y sigue activa — ` +
          `confirmá en el IAM y agregala a DESACTIVAR si corresponde`,
      );
    }
  }

  console.log(acciones.join('\n'));

  // ── 5. Resumen final ────────────────────────────────────────────────────
  const areasFin = await colAreas.find({}).toArray();
  const supersFin = await colSupers.find({}).toArray();
  console.log(
    `\nResumen: áreas ${areas.length} → ${areasFin.length}, ` +
      `superintendencias ${supers.length} → ${supersFin.length}`,
  );
  if (!APLICAR) {
    console.log('\n(dry-run: no se escribió nada. Volvé a correr con --apply)');
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
