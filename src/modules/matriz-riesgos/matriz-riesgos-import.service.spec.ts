import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { MatrizRiesgosImportService } from './matriz-riesgos-import.service';
import { ResultadoAnalisis } from './dto/resultado-importacion';
import { MATRIZ_CHANCADO } from './domain/__fixtures__/matriz-chancado.fixture';

const PLANTILLAS = path.join(process.cwd(), 'src', 'templates');
const ARCHIVO_LLENO = 'Matriz de Riesgo Mantto  Planta Chancado (1).xlsx';
const ARCHIVO_VACIO =
  '1.02.P06.F01_Identificacion_Evaluacion_Riesgos_Rev.7 (1).xlsx';

describe('MatrizRiesgosImportService', () => {
  const servicio = new MatrizRiesgosImportService();

  const analizar = (archivo: string): Promise<ResultadoAnalisis> =>
    servicio.analizar(fs.readFileSync(path.join(PLANTILLAS, archivo)), archivo);

  describe('parsearFecha', () => {
    it('entiende el formato del formulario', () => {
      expect(servicio.parsearFecha('05 / Dic / 2024')).toEqual(
        new Date(2024, 11, 5),
      );
      expect(servicio.parsearFecha('02 / Ene / 2025')).toEqual(
        new Date(2025, 0, 2),
      );
    });

    it('devuelve undefined con basura', () => {
      expect(servicio.parsearFecha('no es fecha')).toBeUndefined();
      expect(servicio.parsearFecha(undefined)).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Matriz real ya llena
  // ──────────────────────────────────────────────────────────────────────────
  describe('matriz real de Planta Chancado', () => {
    let resultado: ResultadoAnalisis;
    beforeAll(async () => {
      resultado = await analizar(ARCHIVO_LLENO);
    });

    it('no tiene errores bloqueantes', () => {
      expect(resultado.errores).toEqual([]);
    });

    it('lee la cabecera pese al layout distinto de la plantilla', () => {
      expect(resultado.cabecera.area).toBe('Mantenimiento Chancado');
      expect(resultado.cabecera.superintendencia).toMatch(/SUPERINTENDENCIA/i);
      expect(resultado.cabecera.gerencia).toMatch(/GERENCIA/i);
      expect(resultado.cabecera.elaboradoPor).toBeTruthy();
      expect(resultado.cabecera.revisadoAprobadoPor).toBeTruthy();
      expect(resultado.cabecera.anio).toBe(2024);
    });

    it('detecta los 45 riesgos, incluidos los de un solo control', () => {
      expect(resultado.riesgos).toHaveLength(45);
      const deUnControl = resultado.riesgos.filter(
        (r) => r.controles.length === 1,
      );
      // Estos 6 no están en celdas combinadas: detectarlos por merges los perdía.
      expect(deUnControl).toHaveLength(6);
    });

    it('lee los 284 controles', () => {
      expect(resultado.resumen.totalControles).toBe(284);
    });

    /**
     * **Criterio de aceptación del MVP.** Si esto falla, el motor no reproduce
     * la metodología y nada de lo demás importa.
     */
    it('NO produce ninguna discrepancia contra los valores del Excel', () => {
      const detalle = resultado.riesgos.flatMap((r) =>
        r.discrepancias.map(
          (d) =>
            `fila ${d.fila} · ${d.campo}: Excel="${d.enExcel}" motor="${d.calculado}"`,
        ),
      );
      expect(detalle).toEqual([]);
      expect(resultado.resumen.totalDiscrepancias).toBe(0);
    });

    it('coincide riesgo por riesgo con el fixture del documento', () => {
      const porFila = new Map(resultado.riesgos.map((r) => [r.fila, r]));
      const fallos: string[] = [];

      for (const esperado of MATRIZ_CHANCADO) {
        const leido = porFila.get(esperado.fila);
        if (!leido) {
          fallos.push(`fila ${esperado.fila}: no se detectó el riesgo`);
          continue;
        }
        if (leido.probabilidad !== esperado.probabilidad)
          fallos.push(`fila ${esperado.fila}: probabilidad`);
        if (leido.resultado !== esperado.resultado)
          fallos.push(`fila ${esperado.fila}: resultado`);
        if (leido.nivelInicial !== esperado.nivelInicial)
          fallos.push(`fila ${esperado.fila}: nivelInicial`);
        if (leido.nivelActual !== esperado.nivelActual)
          fallos.push(`fila ${esperado.fila}: nivelActual`);
        if (leido.controles.length !== esperado.controles.length)
          fallos.push(`fila ${esperado.fila}: nº de controles`);
      }

      expect(fallos).toEqual([]);
    });

    it('identifica los riesgos que alimentarán el PGR', () => {
      expect(resultado.resumen.requierenPgr).toBe(15);
      const criticos = resultado.riesgos.filter((r) => r.requierePgr);
      for (const r of criticos) {
        expect(['SUSTANCIAL', 'INACEPTABLE']).toContain(r.nivelActual);
      }
    });

    it('resume la distribución por nivel', () => {
      expect(resultado.resumen.porNivel).toEqual({
        INACEPTABLE: 7,
        SUSTANCIAL: 8,
        'ACEPTABLE CON REVISIÓN': 15,
        BAJA: 13,
        ACEPTABLE: 2,
      });
      // Los 5 niveles suman el total, sin riesgos «sin calcular».
      const suma = Object.values(resultado.resumen.porNivel).reduce(
        (a, b) => a + b,
        0,
      );
      expect(suma).toBe(resultado.resumen.totalRiesgos);
      expect(resultado.resumen.categorias).toEqual(['Seguridad']);
    });

    it('extrae los verificadores que conectan con el PGR', () => {
      const verificadores = new Set(
        resultado.riesgos.flatMap((r) =>
          r.controles.map((c) => c.verificador).filter(Boolean),
        ),
      );
      expect(verificadores.size).toBeGreaterThanOrEqual(10);
      expect([...verificadores].some((v) => v.includes('ISOP'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Plantilla vacía: distinto layout, sin datos
  // ──────────────────────────────────────────────────────────────────────────
  describe('plantilla vacía Rev.7', () => {
    let resultado: ResultadoAnalisis;
    beforeAll(async () => {
      resultado = await analizar(ARCHIVO_VACIO);
    });

    it('encuentra la cabecera aunque esté en otras filas', () => {
      // En la plantilla la cabecera está en la fila 10; en la matriz llena, en
      // la 7. Localizarla por contenido es lo que hace que ambas funcionen.
      expect(resultado.hoja).toBe('MATRIZ DE RIESGOS');
    });

    it('reporta como error que no haya riesgos, en vez de importar vacío', () => {
      expect(resultado.riesgos).toHaveLength(0);
      expect(resultado.errores.join(' ')).toContain('no contiene riesgos');
    });
  });

  describe('archivo que no es una matriz', () => {
    it('falla con un mensaje entendible y sin excepción', async () => {
      const otro = await analizar('Amoladora.xlsx');
      expect(otro.errores.join(' ')).toContain('No se encontró la cabecera');
      expect(otro.riesgos).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Libro con la plantilla en blanco delante de la hoja real
  // ──────────────────────────────────────────────────────────────────────────

  /** Cabecera del formulario en la hoja: rótulos + fila de la tabla en la 8. */
  const armarCabecera = (ws: ExcelJS.Worksheet) => {
    ws.getCell('A4').value = 'Gerencia / Superintendencia Senior:';
    ws.getCell('D4').value = 'GERENCIA DE MANTENIMIENTO';
    ws.getCell('A5').value = 'Superintendencia:';
    ws.getCell('D5').value = 'SUPERINTENDENCIA DE MANTENIMIENTO - MEC. PLTA.';
    ws.getCell('A6').value = 'Area/Departamento:';
    ws.getCell('D6').value = 'LUBRICACION';
    ws.getCell('J8').value = 'Exposición';
    ws.getCell('K8').value = 'Posibilidad';
    ws.getCell('M8').value = 'Severidad';
  };

  /** Una fila de riesgo con un control. `categoria` se escribe tal cual. */
  const escribirRiesgo = (
    ws: ExcelJS.Worksheet,
    fila: number,
    numero: number,
    categoria: string,
  ) => {
    const c = (col: string, valor: string | number) => {
      ws.getCell(`${col}${fila}`).value = valor;
    };
    c('A', numero);
    c('B', 'Mantenimiento / Lubricación');
    c('C', 'Trabajos en Taller');
    c('D', 'Normal');
    c('E', categoria);
    c('F', 'Superficie irregular y/o resbaladiza.');
    c('G', 'Presencia de objetos en el piso');
    c('H', 'Caída al mismo nivel');
    c('I', 'Golpes por objetos');
    c('J', 2);
    c('K', 3);
    c('M', 2);
    c('P', 'Instrucción operacional');
    c('Q', 'Realizar la limpieza de áreas de trabajo');
    c('R', 'Verificadores Operacionales');
    c('S', 'Seguimiento al programa de inspecciones ISOP');
    c('T', 'B. 50% y 80%');
    c('U', '2. Administrativo/ Procedimientos/ Capacitación');
  };

  /**
   * Reproduce la forma real de 9 de las 11 matrices de Mantenimiento Planta:
   * una hoja "MATRIZ DE RIESGOS plantilla" —el formulario en blanco— **antes**
   * de la hoja con los datos. Se arma en memoria en vez de sumar otro .xlsx de
   * la empresa al repositorio.
   */
  const libroConPlantillaDelante = async (
    categoriaPrimerRiesgo = 'SEGURIDAD',
    categoriaSegundoRiesgo = 'Seguridad',
  ): Promise<Buffer> => {
    const wb = new ExcelJS.Workbook();

    const plantilla = wb.addWorksheet('MATRIZ DE RIESGOS plantilla');
    armarCabecera(plantilla);

    const datos = wb.addWorksheet('MATRIZ DE RIESGOS');
    armarCabecera(datos);
    escribirRiesgo(datos, 9, 1, categoriaPrimerRiesgo);
    escribirRiesgo(datos, 10, 2, categoriaSegundoRiesgo);

    return Buffer.from(await wb.xlsx.writeBuffer());
  };

  describe('libro con la plantilla en blanco delante', () => {
    let resultado: ResultadoAnalisis;
    beforeAll(async () => {
      resultado = await servicio.analizar(
        await libroConPlantillaDelante(),
        'con-plantilla.xlsx',
      );
    });

    /**
     * La plantilla también tiene la cabecera —es el mismo formulario—, así que
     * quedarse con la primera hoja que la tenga leía el formulario vacío y
     * contestaba "el archivo no contiene riesgos" sobre archivos que sí los
     * tenían.
     */
    it('elige la hoja con datos, no la plantilla vacía', () => {
      expect(resultado.hoja).toBe('MATRIZ DE RIESGOS');
      expect(resultado.riesgos).toHaveLength(2);
      expect(resultado.errores).toEqual([]);
    });

    it('lee la cabecera de la hoja elegida', () => {
      expect(resultado.cabecera.area).toBe('LUBRICACION');
      expect(resultado.cabecera.superintendencia).toMatch(/SUPERINTENDENCIA/);
    });

    it('canoniza la categoría y no la reporta como desconocida', () => {
      expect(resultado.riesgos.map((r) => r.categoria)).toEqual([
        'Seguridad',
        'Seguridad',
      ]);
      expect(resultado.resumen.categorias).toEqual(['Seguridad']);
      const avisos = resultado.riesgos.flatMap((r) => r.advertencias);
      expect(avisos.join(' ')).not.toContain('Categoría desconocida');
    });

    it('sigue avisando cuando la categoría de verdad no está en el catálogo', async () => {
      const otro = await servicio.analizar(
        await libroConPlantillaDelante('Ciberseguridad'),
        'categoria-rara.xlsx',
      );
      expect(otro.riesgos[0].categoria).toBe('Ciberseguridad');
      expect(otro.riesgos[0].advertencias.join(' ')).toContain(
        'Categoría desconocida',
      );
    });
  });
});
