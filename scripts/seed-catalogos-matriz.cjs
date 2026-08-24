#!/usr/bin/env node
/**
 * Siembra los catálogos de la matriz IPER desde el formulario oficial.
 *
 * La fuente de verdad es el propio Excel (`PARÁMETROS`, 54 rangos con nombre),
 * no una transcripción a mano: así, cuando Seguridad publique la Rev.8 basta
 * con reemplazar el archivo y volver a correr esto.
 *
 * Idempotente: usa `(categoria, tipo, valor)` como clave. Volver a ejecutarlo
 * no duplica ni pisa lo editado a mano — solo agrega lo que falte y reactiva
 * lo que el formulario siga trayendo.
 *
 *   node scripts/seed-catalogos-matriz.cjs            # dry-run (por defecto)
 *   node scripts/seed-catalogos-matriz.cjs --apply    # escribe en la base
 *   node scripts/seed-catalogos-matriz.cjs --apply --archivo=otra.xlsx
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { MongoClient } = require('mongodb');

const RAIZ = path.join(__dirname, '..');
const APLICAR = process.argv.includes('--apply');
const ARCHIVO =
  (process.argv.find((a) => a.startsWith('--archivo=')) || '').split('=')[1] ||
  '1.02.P06.F01_Identificacion_Evaluacion_Riesgos_Rev.7 (1).xlsx';

const COLECCION = 'catalogoriesgos';

/**
 * Categoría → rango con nombre de cada tipo de catálogo.
 *
 * Ojo con dos particularidades del formulario:
 *  - Medio Ambiente llama «Aspectos» e «Impactos» a lo que el resto llama
 *    peligros y riesgos (`FA_MA` / `FI_MA`), pero es la misma estructura.
 *  - Solo Seguridad y Medio Ambiente tienen una lista de verificadores
 *    concretos (`VS` / `VM`). En las demás categorías la validación de la
 *    columna S apunta a la propia familia de verificadores, así que el
 *    catálogo VERIFICADOR se siembra con esos mismos valores.
 */
const MAPA = {
  Seguridad: { PELIGRO: 'FP_SE', RIESGO: 'FR_SE', CONTROL: 'FC_SE', FAMILIA_VERIFICADOR: 'FV_SE', VERIFICADOR: 'VS' },
  'Medio Ambiente': { PELIGRO: 'FA_MA', RIESGO: 'FI_MA', CONTROL: 'FC_MA', FAMILIA_VERIFICADOR: 'FV_MA', VERIFICADOR: 'VM' },
  Salud: { PELIGRO: 'FP_SA', RIESGO: 'FR_SA', CONTROL: 'FC_SA', FAMILIA_VERIFICADOR: 'FV_SA', VERIFICADOR: 'FV_SA' },
  Legal: { PELIGRO: 'FP_L', RIESGO: 'FR_L', CONTROL: 'FC_L', FAMILIA_VERIFICADOR: 'FV_L', VERIFICADOR: 'FV_L' },
  'DSRC/Estratégico': { PELIGRO: 'FP_DS', RIESGO: 'FR_DS', CONTROL: 'FC_DS', FAMILIA_VERIFICADOR: 'FV_DS', VERIFICADOR: 'FV_DS' },
  'DSRC/Operativo': { PELIGRO: 'FP_DS', RIESGO: 'FR_DS', CONTROL: 'FC_DS', FAMILIA_VERIFICADOR: 'FV_DS', VERIFICADOR: 'FV_DS' },
  'Rel. Gubernamentales': { PELIGRO: 'FP_G', RIESGO: 'FR_G', CONTROL: 'FC_G', FAMILIA_VERIFICADOR: 'FV_G', VERIFICADOR: 'FV_G' },
  Operacional: { PELIGRO: 'FP_op', RIESGO: 'FR_OP', CONTROL: 'FC_OP', FAMILIA_VERIFICADOR: 'FV_OP', VERIFICADOR: 'FV_OP' },
  Financiero: { PELIGRO: 'FP_FI', RIESGO: 'FR_FI', CONTROL: 'FC_FI', FAMILIA_VERIFICADOR: 'FV_FI', VERIFICADOR: 'FV_FI' },
};

const texto = (v) => {
  if (v && typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) v = v.result;
    else if (v.text) v = v.text;
    else if (v.formula !== undefined) return '';
  }
  return String(v ?? '').replace(/\s+/g, ' ').trim();
};

const aColumna = (letras) => {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

async function leerCatalogos(rutaExcel) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaExcel);
  const hoja = wb.getWorksheet('PARÁMETROS');
  if (!hoja) throw new Error("El archivo no tiene la hoja 'PARÁMETROS'");

  const rangos = {};
  for (const d of wb.definedNames.model || []) {
    const r = (d.ranges || [])[0];
    if (!r) continue;
    const m = /'?PARÁMETROS'?!\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+)/.exec(r);
    if (m) rangos[d.name] = { col: aColumna(m[1]), desde: +m[2], hasta: +m[3] };
  }

  const entradas = [];
  const faltantes = [];
  const placeholders = [];

  for (const [categoria, tipos] of Object.entries(MAPA)) {
    for (const [tipo, nombreRango] of Object.entries(tipos)) {
      const r = rangos[nombreRango];
      if (!r) {
        faltantes.push(`${categoria}/${tipo} (${nombreRango})`);
        continue;
      }

      const celdas = [];
      for (let fila = r.desde; fila <= r.hasta; fila++) {
        const valor = texto(hoja.getCell(fila, r.col).value);
        if (valor) celdas.push(valor);
      }
      // Dentro de un mismo rango hay repetidos por copiar/pegar.
      const unicos = [...new Set(celdas)];

      // En la Rev.7 varias categorías traen el rango **sin llenar**: la misma
      // palabra repetida decenas de veces (`"salud"`, `"LEGAL"`, …) en lugar
      // del catálogo. Sembrarlo pondría "salud" como si fuera un peligro, y
      // luego el importador validaría contra basura. Se detecta y se omite.
      const esPlaceholder = celdas.length >= 5 && unicos.length <= 2;
      if (esPlaceholder) {
        placeholders.push(
          `${categoria}/${tipo}: ${celdas.length} celdas con ${unicos.length} valor(es) → ${unicos.map((u) => JSON.stringify(u.slice(0, 30))).join(', ')}`,
        );
        continue;
      }

      unicos.forEach((valor, orden) =>
        entradas.push({ categoria, tipo, valor, orden }),
      );
    }
  }
  return { entradas, faltantes, placeholders };
}

(async () => {
  const rutaExcel = path.join(RAIZ, 'src', 'templates', ARCHIVO);
  if (!fs.existsSync(rutaExcel)) {
    console.error(`No existe el archivo: ${rutaExcel}`);
    process.exit(1);
  }

  const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
  const uri = (env.match(/^MONGODB_URI=(.*)$/m) || [])[1];
  if (!uri) {
    console.error('No se encontró MONGODB_URI en .env');
    process.exit(1);
  }

  const { entradas, faltantes, placeholders } = await leerCatalogos(rutaExcel);

  console.log(`Archivo : ${ARCHIVO}`);
  console.log(`Modo    : ${APLICAR ? 'APLICAR (escribe en la base)' : 'DRY-RUN (no escribe nada)'}`);
  console.log(`Entradas leídas del formulario: ${entradas.length}`);
  if (faltantes.length) {
    console.log(`⚠ rangos no encontrados: ${faltantes.join(', ')}`);
  }
  if (placeholders.length) {
    console.log(
      `\n⚠ ${placeholders.length} catálogo(s) SIN LLENAR en el formulario (se omiten):`,
    );
    placeholders.forEach((p) => console.log(`    ${p}`));
    console.log(
      '  → Esas categorías no tendrán catálogo hasta que Seguridad los complete\n' +
        '    en el Excel o se carguen desde el panel de administración.',
    );
  }

  const porCategoria = {};
  for (const e of entradas) {
    porCategoria[e.categoria] = porCategoria[e.categoria] || {};
    porCategoria[e.categoria][e.tipo] = (porCategoria[e.categoria][e.tipo] || 0) + 1;
  }
  console.log('');
  for (const [cat, tipos] of Object.entries(porCategoria)) {
    console.log(`  ${cat.padEnd(22)} ${JSON.stringify(tipos)}`);
  }

  const cliente = new MongoClient(uri.trim());
  await cliente.connect();
  const col = cliente.db().collection(COLECCION);

  const existentes = await col.countDocuments();
  const claves = new Set(
    (await col.find({}, { projection: { categoria: 1, tipo: 1, valor: 1 } }).toArray()).map(
      (d) => `${d.categoria}|${d.tipo}|${d.valor}`,
    ),
  );
  const nuevas = entradas.filter((e) => !claves.has(`${e.categoria}|${e.tipo}|${e.valor}`));

  console.log(`\nYa en la base: ${existentes}`);
  console.log(`A insertar   : ${nuevas.length}`);
  console.log(`Sin cambios  : ${entradas.length - nuevas.length}`);

  if (!APLICAR) {
    console.log('\nDry-run: no se escribió nada. Volvé a correr con --apply.');
    if (nuevas.length) {
      console.log('\nMuestra de lo que se insertaría:');
      nuevas.slice(0, 5).forEach((e) =>
        console.log(`  · [${e.categoria}/${e.tipo}] ${e.valor.slice(0, 70)}`),
      );
    }
    await cliente.close();
    return;
  }

  if (nuevas.length) {
    const ahora = new Date();
    await col.insertMany(
      nuevas.map((e) => ({
        ...e,
        activo: true,
        desdeFormulario: true,
        creadoPor: 'seed-catalogos-matriz',
        createdAt: ahora,
        updatedAt: ahora,
      })),
    );
  }

  // Reactivar lo que el formulario sigue trayendo pero estaba dado de baja.
  const reactivadas = await col.updateMany(
    {
      activo: false,
      desdeFormulario: true,
      $or: entradas.map((e) => ({ categoria: e.categoria, tipo: e.tipo, valor: e.valor })),
    },
    { $set: { activo: true, actualizadoPor: 'seed-catalogos-matriz' } },
  );

  console.log(`\n✔ Insertadas : ${nuevas.length}`);
  console.log(`✔ Reactivadas: ${reactivadas.modifiedCount}`);
  console.log(`Total en la base: ${await col.countDocuments()}`);
  await cliente.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
