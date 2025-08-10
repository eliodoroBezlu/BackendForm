import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import type {
  FormularioInspeccionEmergencia,
  InspeccionExtintor,
} from '../schemas/inspeccion-emergencia.schema';
@Injectable()
export class InspeccionesEmergenciaExcelService {
  private readonly templatePath: string;
  private readonly logger = new Logger(InspeccionesEmergenciaExcelService.name);

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>('EXCEL_TEMPLATE_PATH') ||
      path.join(
        process.cwd(),
        'src',
        'templates',
        'Inspeccion_Sistemas_Emergencia_Externos.xlsx',
      );
  }

  private getCellCoordinates(cellRef: string): { row: number; col: number } {
    const colRef = cellRef.replace(/[^A-Z]/g, '');
    const row = Number.parseInt(cellRef.replace(/[^0-9]/g, ''), 10);

    let col = 0;
    for (let i = 0; i < colRef.length; i++) {
      col = col * 26 + (colRef.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }

    return { row, col };
  }

  private async insertarImagen(
    worksheet: ExcelJS.Worksheet,
    base64Image: string,
    cellRange: string,
  ) {
    try {
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer: ExcelJS.Buffer = Buffer.from(base64Data, "base64") as unknown as ExcelJS.Buffer;

      const imageId = worksheet.workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      });

      const [startCellRef, endCellRef] = cellRange.split(':');
      const start = this.getCellCoordinates(startCellRef);
      const end = endCellRef ? this.getCellCoordinates(endCellRef) : start;

      worksheet.addImage(imageId, {
        tl: { col: start.col - 1, row: start.row - 1 } as ExcelJS.Anchor,
        br: { col: end.col, row: end.row } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });

      worksheet.getRow(start.row).height = 25;
    } catch (error) {
      this.logger.error(`Error al insertar imagen: ${error.message}`);
      throw error;
    }
  }

  private async llenarInformacionGeneral(
    worksheet: ExcelJS.Worksheet,
    inspeccion: FormularioInspeccionEmergencia,
  ) {
    try {
      // Superintendencia (columna E, fila 4)
      worksheet.getCell('E4').value = inspeccion.superintendencia;

      // Área (columna L, fila 4)
      worksheet.getCell('L4').value = inspeccion.area;

      // TAG (columna S, fila 4)
      worksheet.getCell('S4').value = inspeccion.tag;

      // Responsable del edificio (columna E, fila 6)
      worksheet.getCell('E6').value = inspeccion.responsableEdificio;

      // Edificio (columna E, fila 7)
      worksheet.getCell('E7').value = inspeccion.edificio;
    } catch (error) {
      this.logger.error(
        `Error al llenar información general: ${error.message}`,
      );
      throw error;
    }
  }

  private async llenarInspeccionesPorMes(
    worksheet: ExcelJS.Worksheet,
    inspeccion: FormularioInspeccionEmergencia,
  ) {
    try {
      // Mapeo de meses a columnas (basado en la imagen)
      const columnasPorMes = {
        ENERO: 'L', // Enero va en columna L
        FEBRERO: 'N', // Febrero va en columna N
        MARZO: 'P', // Marzo va en columna P
        ABRIL: 'R', // Abril va en columna R
        MAYO: 'T', // Mayo va en columna T
        JUNIO: 'U', // Junio va en columna V
        JULIO: 'L', // Julio va en columna L (segundo semestre)
        AGOSTO: 'N', // Agosto va en columna N
        SEPTIEMBRE: 'P', // Septiembre va en columna P
        OCTUBRE: 'R', // Octubre va en columna R
        NOVIEMBRE: 'T', // Noviembre va en columna T
        DICIEMBRE: 'V', // Diciembre va en columna V
      };

      // Determinar si el mes pertenece al primer o segundo semestre
      const esPrimerSemestre = inspeccion.periodo === 'ENERO-JUNIO';
      const mesesPrimerSemestre = [
        'ENERO',
        'FEBRERO',
        'MARZO',
        'ABRIL',
        'MAYO',
        'JUNIO',
      ];
      const mesesSegundoSemestre = [
        'JULIO',
        'AGOSTO',
        'SEPTIEMBRE',
        'OCTUBRE',
        'NOVIEMBRE',
        'DICIEMBRE',
      ];

      // Obtener los meses que corresponden al período actual
      const mesesDelPeriodo = esPrimerSemestre
        ? mesesPrimerSemestre
        : mesesSegundoSemestre;

      // Fila donde se encuentran los encabezados "MES:"
      const filaMesHeader = 5;

      // Fila donde va el nombre del inspector (fila 6)
      const filaNombreInspector = 6;

      // Fila donde va la firma del inspector (fila 7)
      const filaFirmaInspector = 7;

      // Recorre todos los meses registrados en el formulario
      if (inspeccion.meses && inspeccion.meses.size > 0) {
        for (const [mes, dataMes] of inspeccion.meses.entries()) {
          // Verificar que el mes exista en nuestro mapeo y corresponda al período actual
          if (columnasPorMes[mes] && mesesDelPeriodo.includes(mes)) {
            const columna = columnasPorMes[mes];

            // Agregar el nombre del mes directamente (sabiendo que MES: ya existe)
            worksheet.getCell(`${columna}${filaMesHeader}`).value =
              `MES: ${mes}`;

            // Insertar el nombre del inspector en la fila 6
            if (dataMes.inspector && dataMes.inspector.nombre) {
              worksheet.getCell(`${columna}${filaNombreInspector}`).value =
                dataMes.inspector.nombre;

              // Si hay firma, insertarla en la fila 7
              if (dataMes.inspector.firma) {
                // Determinar el rango para la firma (ajustado para quedar en la fila 7)
                const rangoCelda = `${columna}${filaFirmaInspector}:${columna}${filaFirmaInspector}`;
                await this.insertarImagen(
                  worksheet,
                  dataMes.inspector.firma,
                  rangoCelda,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error al llenar inspecciones por mes: ${error.message}`,
      );
      throw error;
    }
  }

  private async llenarDatosDeInspeccion(
    worksheet: ExcelJS.Worksheet,
    inspeccion: FormularioInspeccionEmergencia,
  ) {
    try {
      // Mapeo de meses a sus columnas respectivas para cantidad y estado
      const columnasMesCantidadEstado = {
        ENERO: { cantidad: 'E', estado: 'F' },
        FEBRERO: { cantidad: 'G', estado: 'H' },
        MARZO: { cantidad: 'I', estado: 'J' },
        ABRIL: { cantidad: 'K', estado: 'L' },
        MAYO: { cantidad: 'M', estado: 'N' },
        JUNIO: { cantidad: 'O', estado: 'P' },
        JULIO: { cantidad: 'E', estado: 'F' },
        AGOSTO: { cantidad: 'G', estado: 'H' },
        SEPTIEMBRE: { cantidad: 'I', estado: 'J' },
        OCTUBRE: { cantidad: 'K', estado: 'L' },
        NOVIEMBRE: { cantidad: 'M', estado: 'N' },
        DICIEMBRE: { cantidad: 'O', estado: 'P' },
      };

      // Mapeo de filas para sistemas pasivos según la imagen
      const filasSistemasPasivos = {
        puertasEmergencia: 11,
        senaleticaViasEvacuacion: 12,
        planosEvacuacion: 13,
        registroPersonalEvacuacion: 14,
        numerosEmergencia: 15,
        luzEmergencia: 16,
        puntoReunion: 17,
      };

      // Mapeo de filas para sistemas activos según la imagen
      const filasSistemasActivos = {
        kitDerrame: 20,
        lavaOjos: 21,
        duchasEmergencia: 22,
        desfibriladorAutomatico: 23,
      };
      // Fila donde se encuentran los encabezados "MES:"
      const filaMesHeader = 9;
      // Determinar si el mes pertenece al primer o segundo semestre
      const esPrimerSemestre = inspeccion.periodo === 'ENERO-JUNIO';
      const mesesPrimerSemestre = [
        'ENERO',
        'FEBRERO',
        'MARZO',
        'ABRIL',
        'MAYO',
        'JUNIO',
      ];
      const mesesSegundoSemestre = [
        'JULIO',
        'AGOSTO',
        'SEPTIEMBRE',
        'OCTUBRE',
        'NOVIEMBRE',
        'DICIEMBRE',
      ];
      const observacionesSistemasPasivos = {};
      const observacionesSistemasActivos = {};

      Object.keys(filasSistemasPasivos).forEach((sistema) => {
        observacionesSistemasPasivos[sistema] = [];
      });

      Object.keys(filasSistemasActivos).forEach((sistema) => {
        observacionesSistemasActivos[sistema] = [];
      });

      // Obtener los meses que corresponden al período actual
      const mesesDelPeriodo = esPrimerSemestre
        ? mesesPrimerSemestre
        : mesesSegundoSemestre;

      // Recorre todos los meses registrados en el formulario
      if (inspeccion.meses && inspeccion.meses.size > 0) {
        for (const [mes, dataMes] of inspeccion.meses.entries()) {
          // Verificar que el mes exista en nuestro mapeo y corresponda al período actual
          if (columnasMesCantidadEstado[mes] && mesesDelPeriodo.includes(mes)) {
            const columnasCE = columnasMesCantidadEstado[mes];
            // Agregar el nombre del mes directamente (sabiendo que MES: ya existe)
            worksheet.getCell(`${columnasCE.cantidad}${filaMesHeader}`).value =
              `MES: ${mes}`;

            // Llenar datos de sistemas pasivos
            if (
              dataMes.inspeccionesActivos &&
              dataMes.inspeccionesActivos.sistemasPasivos
            ) {
              const sistemasPasivos =
                dataMes.inspeccionesActivos.sistemasPasivos;

              // Para cada sistema pasivo, llenar cantidad y estado
              for (const [sistema, fila] of Object.entries(
                filasSistemasPasivos,
              )) {
                if (sistemasPasivos[sistema]) {
                  // Llenar cantidad
                  worksheet.getCell(`${columnasCE.cantidad}${fila}`).value =
                    sistemasPasivos[sistema].cantidad || '';

                  // Llenar estado (✓, X, N/A)
                  worksheet.getCell(`${columnasCE.estado}${fila}`).value =
                    sistemasPasivos[sistema].estado || '';
                  // Recopilar observaciones con el mes correspondiente
                  if (
                    sistemasPasivos[sistema].observaciones &&
                    sistemasPasivos[sistema].observaciones.trim() !== ''
                  ) {
                    observacionesSistemasPasivos[sistema].push(
                      `${mes}: ${sistemasPasivos[sistema].observaciones}`,
                    );
                  }
                }
              }
            }

            // Llenar datos de sistemas activos
            if (
              dataMes.inspeccionesActivos &&
              dataMes.inspeccionesActivos.sistemasActivos
            ) {
              const sistemasActivos =
                dataMes.inspeccionesActivos.sistemasActivos;

              // Para cada sistema activo, llenar cantidad y estado
              for (const [sistema, fila] of Object.entries(
                filasSistemasActivos,
              )) {
                if (sistemasActivos[sistema]) {
                  // Llenar cantidad
                  worksheet.getCell(`${columnasCE.cantidad}${fila}`).value =
                    sistemasActivos[sistema].cantidad || '';

                  // Llenar estado (✓, X, N/A)
                  worksheet.getCell(`${columnasCE.estado}${fila}`).value =
                    sistemasActivos[sistema].estado || '';
                  // Recopilar observaciones con el mes correspondiente
                  if (
                    sistemasActivos[sistema].observaciones &&
                    sistemasActivos[sistema].observaciones.trim() !== ''
                  ) {
                    observacionesSistemasActivos[sistema].push(
                      `${mes}: ${sistemasActivos[sistema].observaciones}`,
                    );
                  }
                }
              }
            }

            // Agregar observaciones si existen
            if (
              dataMes.inspeccionesActivos &&
              dataMes.inspeccionesActivos.observaciones
            ) {
              // Fila y columna para observaciones según la imagen (ajustar según sea necesario)
              worksheet.getCell(`N11`).value =
                dataMes.inspeccionesActivos.observaciones;
            }
          }
        }
      }

      // Ahora, llena las observaciones combinadas en la columna Q
      for (const [sistema, fila] of Object.entries(filasSistemasPasivos)) {
        if (observacionesSistemasPasivos[sistema].length > 0) {
          worksheet.getCell(`Q${fila}`).value =
            observacionesSistemasPasivos[sistema].join('; ');
          worksheet.getCell(`Q${fila}`).alignment = { wrapText: true };
        }
      }

      for (const [sistema, fila] of Object.entries(filasSistemasActivos)) {
        if (observacionesSistemasActivos[sistema].length > 0) {
          worksheet.getCell(`Q${fila}`).value =
            observacionesSistemasActivos[sistema].join('; ');
          worksheet.getCell(`Q${fila}`).alignment = { wrapText: true };
        }
      }
    } catch (error) {
      this.logger.error(
        `Error al llenar datos de inspección: ${error.message}`,
      );
      throw error;
    }
  }

  private async llenarInspeccionesExtintores(
    worksheet: ExcelJS.Worksheet,
    inspeccion: FormularioInspeccionEmergencia,
  ) {
    try {
      // Determinar si el mes pertenece al primer o segundo semestre
      const esPrimerSemestre = inspeccion.periodo === 'ENERO-JUNIO';
      const mesesPrimerSemestre = [
        'ENERO',
        'FEBRERO',
        'MARZO',
        'ABRIL',
        'MAYO',
        'JUNIO',
      ];
      const mesesSegundoSemestre = [
        'JULIO',
        'AGOSTO',
        'SEPTIEMBRE',
        'OCTUBRE',
        'NOVIEMBRE',
        'DICIEMBRE',
      ];

      // Obtener los meses que corresponden al período actual
      const mesesDelPeriodo = esPrimerSemestre
        ? mesesPrimerSemestre
        : mesesSegundoSemestre;

      // Definición de las tablas
      const tablas = [
        // Primera tabla predefinida (filas 28-42)
        {
          filaInicio: 28,
          filaFin: 42,
          filaHeader: 26, // Fila con el encabezado "INSPECCIÓN DE EXTINTORES"
          capacidad: 15, // Cantidad de filas disponibles (filaFin - filaInicio + 1)
        },
        // Segunda tabla predefinida (filas 45-73)
        {
          filaInicio: 45,
          filaFin: 74,
          filaHeader: 43, // Fila con el encabezado "INSPECCIÓN DE EXTINTORES"
          capacidad: 30, // Cantidad de filas disponibles (filaFin - filaInicio + 1)
        },
        // Las tablas adicionales se agregarán dinámicamente
      ];

      // Función para agregar una nueva tabla después de la última
      const agregarNuevaTabla = (ultimaFila: number) => {
        const filaHeader = ultimaFila + 1;
        const filaInicio = filaHeader + 2; // +2 porque hay una fila de encabezado y una fila para los títulos de columna
        const filaFin = filaInicio + 25; // 26 filas en total para datos
        // Fusionar celdas para el encabezado (A-U)
        worksheet.mergeCells(`A${filaHeader}:U${filaHeader}`);

        // Crear el encabezado "INSPECCIÓN DE EXTINTORES"
        const headerRow = worksheet.getRow(filaHeader);

        // Copiar el formato del encabezado desde la tabla anterior
        const headerOriginal = worksheet.getRow(43); // Usamos el segundo encabezado como referencia

        const headerCell = worksheet.getCell(`A${filaHeader}`);
        headerCell.value = 'I N S P E C C I Ó N  D E  E X T I N T O R E S';
        headerCell.font = { bold: true, size: 12 };
        headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'D9D9D9' }, // Color gris claro
        };
        headerCell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };

        // Crear la fila de títulos de columna
        const titulosRow = worksheet.getRow(filaHeader + 1);
        const titulosOriginal = worksheet.getRow(44); // Usamos la segunda fila de títulos como referencia

        // Copiar los títulos y formato de las columnas
        const columnasConTitulos = [
          { col: 'A', titulo: 'FECHA INSPECCIÓN' },
          { col: 'B', titulo: 'CÓDIGO' },
          { col: 'C', titulo: 'UBICACIÓN' },
          { col: 'G', titulo: 'INSPECCIÓN MENSUAL' },
          { col: 'I', titulo: 'MANGUERA' },
          { col: 'K', titulo: 'CILINDRO' },
          { col: 'M', titulo: 'INDICADOR DE PRESIÓN' },
          { col: 'O', titulo: 'GATILLO, CHAVETA Y PRECINTO' },
          { col: 'Q', titulo: 'SEÑALIZACIÓN Y SOPORTE' },
          { col: 'S', titulo: 'OBSERVACIONES' },
        ];

        // Fusionar celdas según corresponda y aplicar formato
        worksheet.mergeCells(`A${filaHeader + 1}:A${filaHeader + 1}`);
        worksheet.mergeCells(`B${filaHeader + 1}:B${filaHeader + 1}`);
        worksheet.mergeCells(`C${filaHeader + 1}:F${filaHeader + 1}`);
        worksheet.mergeCells(`G${filaHeader + 1}:H${filaHeader + 1}`);
        worksheet.mergeCells(`I${filaHeader + 1}:J${filaHeader + 1}`);
        worksheet.mergeCells(`K${filaHeader + 1}:L${filaHeader + 1}`);
        worksheet.mergeCells(`M${filaHeader + 1}:N${filaHeader + 1}`);
        worksheet.mergeCells(`O${filaHeader + 1}:P${filaHeader + 1}`);
        worksheet.mergeCells(`Q${filaHeader + 1}:R${filaHeader + 1}`);
        worksheet.mergeCells(`S${filaHeader + 1}:U${filaHeader + 1}`);

        // Aplicar títulos y formato
        for (const columna of columnasConTitulos) {
          const cell = worksheet.getCell(`${columna.col}${filaHeader + 1}`);
          cell.value = columna.titulo;
          cell.font = { bold: true, size: 10 };
          cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'D9D9D9' }, // Color gris claro
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        // Establecer altura de fila para la cabecera
        headerRow.height = 20;
        titulosRow.height = 30;

        // Preparar las filas para datos con bordes
        for (let i = filaInicio; i <= filaFin; i++) {
          const row = worksheet.getRow(i);
          for (let colIndex = 1; colIndex <= 21; colIndex++) {
            // columnas A-U
            const cell = row.getCell(colIndex);
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          }
        }

        // Agregar la nueva tabla a nuestro array
        tablas.push({
          filaInicio,
          filaFin,
          filaHeader,
          capacidad: filaFin - filaInicio + 1,
        });

        return tablas[tablas.length - 1];
      };

      // Recopilar todos los extintores de los meses en el período actual
      const todosLosExtintores: InspeccionExtintor[] = [];

      if (inspeccion.meses && inspeccion.meses.size > 0) {
        for (const [mes, dataMes] of inspeccion.meses.entries()) {
          // Verificar que el mes corresponda al período actual
          if (
            mesesDelPeriodo.includes(mes) &&
            dataMes.inspeccionesExtintor &&
            dataMes.inspeccionesExtintor.length > 0
          ) {
            todosLosExtintores.push(...dataMes.inspeccionesExtintor);
          }
        }
      }

      this.logger.log(
        `Total de extintores a procesar: ${todosLosExtintores.length}`,
      );

      // Procesar todos los extintores recopilados
      let extintorProcesado = 0;
      let tablaActual = 0;

      while (extintorProcesado < todosLosExtintores.length) {
        // Verificar si necesitamos crear una nueva tabla
        if (tablaActual >= tablas.length) {
          // Obtener la última fila de la última tabla
          const ultimaTabla = tablas[tablas.length - 1];
          const nuevaTabla = agregarNuevaTabla(ultimaTabla.filaFin);
          tablaActual = tablas.length - 1;
        }

        // Obtener la tabla actual
        const tabla = tablas[tablaActual];

        // Determinar cuántos extintores podemos procesar en esta tabla
        const extintoresRestantes =
          todosLosExtintores.length - extintorProcesado;
        const cantidadAProcesar = Math.min(
          extintoresRestantes,
          tabla.capacidad,
        );

        // Procesar los extintores para esta tabla
        for (let i = 0; i < cantidadAProcesar; i++) {
          const extintor = todosLosExtintores[extintorProcesado + i];
          const filaActual = tabla.filaInicio + i;

          // Llenar datos del extintor en la fila correspondiente
          worksheet.getCell(`A${filaActual}`).value =
            extintor.fechaInspeccion || '';
          worksheet.getCell(`B${filaActual}`).value = extintor.codigo || '';
          worksheet.getCell(`C${filaActual}`).value = extintor.ubicacion || '';
          worksheet.getCell(`G${filaActual}`).value =
            extintor.inspeccionMensual || '';
          worksheet.getCell(`I${filaActual}`).value = extintor.manguera || '';
          worksheet.getCell(`K${filaActual}`).value = extintor.cilindro || '';
          worksheet.getCell(`M${filaActual}`).value =
            extintor.indicadorPresion || '';
          worksheet.getCell(`O${filaActual}`).value =
            extintor.gatilloChavetaPrecinto || '';
          worksheet.getCell(`Q${filaActual}`).value =
            extintor.senalizacionSoporte || '';
          worksheet.getCell(`S${filaActual}`).value =
            extintor.observaciones || '';
        }

        // Actualizar contador y pasar a la siguiente tabla si es necesario
        extintorProcesado += cantidadAProcesar;

        // Si hemos llenado toda la tabla actual, pasamos a la siguiente
        if (cantidadAProcesar === tabla.capacidad) {
          tablaActual++;
        }
      }

      this.logger.log(
        `Procesado ${extintorProcesado} de ${todosLosExtintores.length} extintores`,
      );
      this.logger.log(`Se crearon ${tablas.length - 2} tablas adicionales`);
    } catch (error) {
      this.logger.error(
        `Error al llenar inspecciones de extintores: ${error.message}`,
      );
      throw error;
    }
  }

  async generateExcelSingle(
    inspeccion: FormularioInspeccionEmergencia,
  ): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.templatePath);
      const worksheet = workbook.getWorksheet(1); // ExcelJS usa 1-based index

      if (!worksheet) {
        throw new Error('No se pudo encontrar la hoja de trabajo');
      }

      await this.llenarInformacionGeneral(worksheet, inspeccion);
      // await this.llenarInspeccionesPorMes(worksheet, inspeccion)

      await this.llenarInspeccionesPorMes(worksheet, inspeccion);

      await this.llenarDatosDeInspeccion(worksheet, inspeccion);
      await this.llenarInspeccionesExtintores(worksheet, inspeccion);

      const excelBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(excelBuffer);
    } catch (error) {
      this.logger.error(`Error al generar Excel: ${error.message}`);
      throw new Error(`Error al generar el archivo Excel: ${error.message}`);
    }
  }
}
