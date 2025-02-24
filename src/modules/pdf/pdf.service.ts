// import { Injectable } from "@nestjs/common"
// import * as PDFDocument from "pdfkit"
// import type { Inspeccion } from "../inspecciones/schemas/inspeccion.schema"

// @Injectable()
// export class PdfService {
//   generateInspeccionPdf(inspeccion: Inspeccion): Buffer {
//     const doc = new PDFDocument()
//     const buffers: Buffer[] = []

//     doc.on("data", buffers.push.bind(buffers))

//     // Título
//     doc.fontSize(18).text("Formulario de Inspección de Arnés", { align: "center" })
//     doc.moveDown()

//     // Información General
//     doc.fontSize(14).text("Información General", { underline: true })
//     doc.moveDown()
//     Object.entries(inspeccion.informacionGeneral).forEach(([key, value]) => {
//       doc.fontSize(10).text(`${this.formatKey(key)}: ${value}`)
//     })
//     doc.moveDown()

//     // Resultados
//     doc.fontSize(14).text("Resultados de la Inspección", { underline: true })
//     doc.moveDown()
//     inspeccion.resultados.forEach((seccion) => {
//       doc.fontSize(12).text(seccion.category)
//       doc.moveDown(0.5)
//       seccion.items.forEach((item) => {
//         doc.fontSize(10).text(`${item.description}:`)
//         doc.fontSize(10).text(`Respuesta: ${item.response || "No respondido"}`)
//         if (item.observation) {
//           doc.fontSize(10).text(`Observación: ${item.observation}`)
//         }
//         doc.moveDown(0.5)
//       })
//       doc.moveDown()
//     })

//     // Observaciones Complementarias
//     doc.fontSize(14).text("Observaciones Complementarias", { underline: true })
//     doc.moveDown()
//     doc.fontSize(10).text(inspeccion.observacionesComplementarias || "Sin observaciones")
//     doc.moveDown()

//     // Firmas
//     doc.fontSize(14).text("Firmas", { underline: true })
//     doc.moveDown()
//     doc.fontSize(10).text(`Inspector: ${inspeccion.firmaInspector}`)
//     doc.fontSize(10).text(`Supervisor: ${inspeccion.firmaSupervisor}`)

//     doc.end()

//     return Buffer.concat(buffers)
//   }

//   private formatKey(key: string): string {
//     return key
//       .split(/(?=[A-Z])/)
//       .join(" ")
//       .replace(/^\w/, (c) => c.toUpperCase())
//   }
// }
