import * as sharpNs from 'sharp';

// `sharp` publica tipos ESM (`export default`) pero el paquete real que
// resuelve Node en runtime bajo CommonJS es el export directo (sin
// `.default`) — con `esModuleInterop` desactivado en este proyecto,
// `import sharp from 'sharp'` compila a `sharp_1.default(...)`, que no
// existe en runtime y rompe silenciosamente (cae al catch). El namespace
// import sí resuelve al valor real; solo hace falta castear el tipo.
const sharp = sharpNs as unknown as typeof sharpNs.default;

/**
 * Redimensiona/comprime una imagen antes de incrustarla en un Excel — las
 * fotos de celular o firmas capturadas sin límite de tamaño (base64 crudo
 * en Mongo, o archivos subidos tal cual) son la causa principal del
 * consumo de memoria al generar los reportes. Siempre devuelve JPEG para
 * que los call sites no necesiten detectar el formato original.
 *
 * Si la imagen no se puede procesar (formato corrupto/no soportado), se
 * devuelve el buffer original sin redimensionar antes que romper el export.
 */
export async function resizeImageBuffer(
  buffer: Buffer,
  maxDimension = 1200,
  quality = 80,
): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // JPEG no soporta transparencia — sin esto, sharp aplana el canal
      // alfa contra negro por defecto. Las firmas (PNG con fondo
      // transparente y trazo oscuro) quedaban como un recuadro negro
      // sólido; con fondo blanco el trazo se ve normal.
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality })
      .toBuffer();
  } catch {
    return buffer;
  }
}
