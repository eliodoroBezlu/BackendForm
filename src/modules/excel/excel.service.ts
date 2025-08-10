import { Injectable, Logger } from "@nestjs/common"
import{ ConfigService } from "@nestjs/config"
import * as ExcelJS from "exceljs"
import type { Inspeccion } from "../inspecciones/schemas/inspeccion.schema"
import * as path from "path"

@Injectable()
export class ExcelService {
  private readonly templatePath: string
  private readonly logger = new Logger(ExcelService.name)
  private readonly filasExcluidas = new Set([15, 18, 23, 26, 27, 34, 38, 43, 44, 45, 53, 54, 61])
  private readonly CARACTERES_POR_FILA = 100

  constructor(private readonly configService: ConfigService) {
    this.templatePath =
      this.configService.get<string>("EXCEL_TEMPLATE_PATH") ||
      path.join(process.cwd(), "src", "templates", "arnes_checklist.xlsx")
  }



 

  private getCellCoordinates(cellRef: string): { row: number; col: number } {
    const colRef = cellRef.replace(/[^A-Z]/g, "")
    const row = Number.parseInt(cellRef.replace(/[^0-9]/g, ""), 10)

    let col = 0
    for (let i = 0; i < colRef.length; i++) {
      col = col * 26 + (colRef.charCodeAt(i) - "A".charCodeAt(0) + 1)
    }

    return { row, col }
  }

  private async insertarImagen(worksheet: ExcelJS.Worksheet, base64Image: string, cellRange: string) {
    try {
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer: ExcelJS.Buffer = Buffer.from(base64Data, "base64") as unknown as ExcelJS.Buffer;



        const imageId = worksheet.workbook.addImage({
            buffer: imageBuffer,
            extension: "png",
        });

        const [startCellRef, endCellRef] = cellRange.split(":");
        const start = this.getCellCoordinates(startCellRef);
        const end = endCellRef ? this.getCellCoordinates(endCellRef) : start;

        worksheet.addImage(imageId, {
            tl: { col: start.col - 1, row: start.row - 1 } as ExcelJS.Anchor,
            br: { col: end.col, row: end.row } as ExcelJS.Anchor,
            editAs: "oneCell",
        });

        worksheet.getRow(start.row).height = 25;
    } catch (error) {
        this.logger.error(`Error al insertar imagen: ${error.message}`);
        throw error;
    }
}


  private getSiguienteFilaValida(currentRow: number): number {
    while (this.filasExcluidas.has(currentRow)) {
      currentRow++
    }
    return currentRow
  }

  private dividirTextoEnFilas(texto: string): string[] {
    const palabras = texto.split(" ")
    const filas: string[] = []
    let filaActual = ""

    for (const palabra of palabras) {
      if ((filaActual + " " + palabra).length <= this.CARACTERES_POR_FILA) {
        filaActual = filaActual ? filaActual + " " + palabra : palabra
      } else {
        filas.push(filaActual)
        filaActual = palabra
      }
    }

    if (filaActual) {
      filas.push(filaActual)
    }

    return filas
  }

  private async llenarInformacionGeneral(worksheet: ExcelJS.Worksheet, inspeccion: Inspeccion, rowIndex: number) {
    try {
      // Superintendencia
      worksheet.getCell(`C${rowIndex}`).value = inspeccion.informacionGeneral.superintendencia

      // Área/Sección
      worksheet.getCell(`E${rowIndex}`).value = inspeccion.informacionGeneral.area

      // Nombre Trabajador
      worksheet.getCell(`M${rowIndex}`).value = inspeccion.informacionGeneral.trabajador

      // FECHA
      worksheet.getCell(`C${rowIndex + 1}`).value = inspeccion.informacionGeneral.fecha
        ? new Date(inspeccion.informacionGeneral.fecha)
        : null

      // Número de inspección
      worksheet.getCell(`E${rowIndex + 1}`).value = inspeccion.informacionGeneral.numInspeccion

      // Supervisor
      worksheet.getCell(`M${rowIndex + 1}`).value = inspeccion.informacionGeneral.supervisor

      // Códigos
      worksheet.getCell(`C${rowIndex + 2}`).value = inspeccion.informacionGeneral.codArnes
      
      worksheet.getCell(`E${rowIndex + 2}`).value = inspeccion.informacionGeneral.codConector

      // Operativo
      const filaOperativo = rowIndex + 62
      if (inspeccion.operativo === "SI") {
        const cell = worksheet.getCell(`N${filaOperativo}`)
        cell.value = "X"
        cell.font = { bold: true, size: 14 }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      } else if (inspeccion.operativo === "NO") {
        const cell = worksheet.getCell(`O${filaOperativo}`)
        cell.value = "X"
        cell.font = { bold: true, size: 14 }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      }

      // Observaciones complementarias
      if (inspeccion.observacionesComplementarias) {
        const filaInicioObs = rowIndex + 65
        const filaFinObs = rowIndex + 74
        const filasTexto = this.dividirTextoEnFilas(inspeccion.observacionesComplementarias)

        for (let i = 0; i < filasTexto.length && i < filaFinObs - filaInicioObs + 1; i++) {
          const currentRow = filaInicioObs + i
          worksheet.getCell(`J${currentRow}`).value = filasTexto[i]
        }
      }

      // Firmas y nombres
      const filaFirmas = rowIndex + 76
      worksheet.getCell(`A${filaFirmas}`).value = inspeccion.inspectionConductedBy

      if (inspeccion.firmaInspector) {
        try {
          await this.insertarImagen(worksheet, inspeccion.firmaInspector, `D${filaFirmas}:F${filaFirmas}`)
        } catch (error) {
          this.logger.error(`Error al insertar firma del inspector: ${error.message}`)
        }
      }

      worksheet.getCell(`G${filaFirmas}`).value = inspeccion.inspectionApprovedBy

      if (inspeccion.firmaSupervisor) {
        try {
          await this.insertarImagen(worksheet, inspeccion.firmaSupervisor, `M${filaFirmas}:N${filaFirmas}`)
        } catch (error) {
          this.logger.error(`Error al insertar firma del supervisor: ${error.message}`)
        }
      }

      worksheet.getCell(`O${filaFirmas}`).value = inspeccion.reviewDate ? new Date(inspeccion.reviewDate) : null
    } catch (error) {
      this.logger.error(`Error al llenar información general: ${error.message}`)
      throw error
    }
  }

  private async llenarRespuestas(worksheet: ExcelJS.Worksheet, inspeccion: Inspeccion, startRow: number) {
    try {
      let currentRow = startRow

      for (const titulo of inspeccion.resultados) {
        for (const seccion of titulo.items) {
          for (const item of seccion.items) {
            currentRow = this.getSiguienteFilaValida(currentRow)

            if (item.response === "si") {
              worksheet.getCell(`E${currentRow}`).value = "X"
            } else if (item.response === "no") {
              worksheet.getCell(`G${currentRow}`).value = "X"
            } else if (item.response === "na") {
              worksheet.getCell(`I${currentRow}`).value = "X"
            }

            if (item.observation) {
              worksheet.getCell(`K${currentRow}`).value = item.observation
            }

            currentRow++
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error al llenar respuestas: ${error.message}`)
      throw error
    }
  }

  async generateExcelSingle(inspeccion: Inspeccion): Promise<Buffer> {
    return this.generateExcel([inspeccion])
  }

  async generateExcel(inspecciones: Inspeccion[]): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.templatePath)
      
      const worksheet = workbook.getWorksheet(1) // ExcelJS usa 1-based index

      if (!worksheet) {
        throw new Error("No se pudo encontrar la hoja de trabajo en el repositorio")
      }

      for (const [index, inspeccion] of inspecciones.entries()) {
        const rowIndex = 4 + index * 3
        await this.llenarInformacionGeneral(worksheet, inspeccion, rowIndex)
        await this.llenarRespuestas(worksheet, inspeccion, rowIndex + 8)
      }

      const excelBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(excelBuffer);
    } catch (error) {
      this.logger.error(`Error al generar Excel: ${error.message}`)
      throw new Error("Error al generar el archivo Excel")
    }
  }
}

