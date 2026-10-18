import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as sharpNs from 'sharp';
import {
  FORMA_ARCHIVO,
  LADO_MAXIMO,
  MIME_ADMITIDOS,
  UsoDeImagen,
} from './domain/archivos';

// Ver `common/utils/image-resize.util.ts`: sin `esModuleInterop`, el import
// por defecto de sharp no existe en tiempo de ejecución.
const sharp = sharpNs as unknown as typeof sharpNs.default;

export interface ArchivoGuardado {
  archivo: string;
  ancho: number;
  alto: number;
}

/**
 * Fotos y gráficos del reporte, en una carpeta **fuera** de `uploads/` (que
 * es pública). Solo se leen por el controlador del módulo, con el rol.
 */
@Injectable()
export class ArchivosMonitoreoService {
  /** Se puede cambiar en las pruebas. */
  carpeta = join(process.cwd(), 'archivos-privados', 'monitoreo-equipos');

  /**
   * Reduce la imagen sin recortarla —recortar una termografía puede cortar
   * la escala de la cámara— y la guarda con un nombre propio.
   *
   * Un PNG sigue en PNG: suele ser una captura de PI con texto, y el JPEG
   * borronea las letras chicas. Lo demás pasa a JPEG.
   */
  async guardar(
    contenido: Buffer,
    mime: string,
    uso: UsoDeImagen,
  ): Promise<ArchivoGuardado> {
    if (!MIME_ADMITIDOS.includes(mime)) {
      throw new BadRequestException('Solo se admiten imágenes JPG, PNG o WebP');
    }

    const esPng = mime === 'image/png';
    const lado = LADO_MAXIMO[uso];
    let salida: { data: Buffer; info: { width: number; height: number } };
    try {
      const imagen = sharp(contenido)
        .rotate() // respeta la orientación EXIF del celular
        .resize({
          width: lado,
          height: lado,
          fit: 'inside',
          withoutEnlargement: true,
        });
      salida = await (
        esPng
          ? imagen.png({ compressionLevel: 9 })
          : imagen.flatten({ background: '#ffffff' }).jpeg({ quality: 88 })
      ).toBuffer({ resolveWithObject: true });
    } catch {
      throw new BadRequestException('El archivo no es una imagen legible');
    }

    const archivo = `${randomUUID()}.${esPng ? 'png' : 'jpg'}`;
    await fs.mkdir(this.carpeta, { recursive: true });
    await fs.writeFile(join(this.carpeta, archivo), salida.data);
    return { archivo, ancho: salida.info.width, alto: salida.info.height };
  }

  /**
   * La ruta en disco de un archivo del módulo. El nombre se valida contra la
   * forma que pone el servidor: así no hay `../` posible.
   */
  async ruta(archivo: string): Promise<string> {
    if (!FORMA_ARCHIVO.test(archivo)) {
      throw new NotFoundException('Archivo no encontrado');
    }
    const ruta = join(this.carpeta, archivo);
    try {
      await fs.access(ruta);
    } catch {
      throw new NotFoundException('Archivo no encontrado');
    }
    return ruta;
  }

  /** Los que no existen en disco, para rechazar un reporte que apunta a nada. */
  async faltantes(archivos: string[]): Promise<string[]> {
    const faltan: string[] = [];
    for (const archivo of archivos) {
      try {
        await this.ruta(archivo);
      } catch {
        faltan.push(archivo);
      }
    }
    return faltan;
  }
}
