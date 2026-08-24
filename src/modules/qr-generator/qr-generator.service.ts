import { Injectable, BadRequestException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { Response } from 'express';

export interface QROptions {
  width?: number;
  height?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface QRGenerationResult {
  dataUrl: string;
  buffer: Buffer;
  svg: string;
}

@Injectable()
export class QrGeneratorService {
  /**
   * Genera un código QR como Data URL (base64)
   */
  async generateQRDataURL(text: string, options?: QROptions): Promise<string> {
    try {
      this.validateInput(text, options?.errorCorrectionLevel ?? 'M');

      const qrOptions = this.getDefaultOptions(options);
      return await QRCode.toDataURL(text, qrOptions);
    } catch (error) {
      throw new BadRequestException(
        `Error generando código QR: ${error.message}`,
      );
    }
  }

  /**
   * Genera un código QR como Buffer (para descargas)
   */
  async generateQRBuffer(text: string, options?: QROptions): Promise<Buffer> {
    try {
      this.validateInput(text, options?.errorCorrectionLevel ?? 'M');

      const qrOptions = this.getDefaultOptions(options);
      return await QRCode.toBuffer(text, qrOptions);
    } catch (error) {
      throw new BadRequestException(
        `Error generando código QR: ${error.message}`,
      );
    }
  }

  /**
   * Genera un código QR como SVG
   */
  async generateQRSVG(text: string, options?: QROptions): Promise<string> {
    try {
      this.validateInput(text, options?.errorCorrectionLevel ?? 'M');

      const qrOptions = this.getDefaultOptions(options);
      return await QRCode.toString(text, {
        ...qrOptions,
        type: 'svg',
      });
    } catch (error) {
      throw new BadRequestException(
        `Error generando código QR: ${error.message}`,
      );
    }
  }

  /**
   * Genera todas las versiones del código QR
   */
  async generateQRComplete(
    text: string,
    options?: QROptions,
  ): Promise<QRGenerationResult> {
    try {
      this.validateInput(text, options?.errorCorrectionLevel ?? 'M');

      const [dataUrl, buffer, svg] = await Promise.all([
        this.generateQRDataURL(text, options),
        this.generateQRBuffer(text, options),
        this.generateQRSVG(text, options),
      ]);

      return { dataUrl, buffer, svg };
    } catch (error) {
      throw new BadRequestException(
        `Error generando código QR: ${error.message}`,
      );
    }
  }

  /**
   * Envía el código QR como imagen directamente en la respuesta HTTP
   */
  async sendQRImage(
    text: string,
    res: Response,
    options?: QROptions,
  ): Promise<void> {
    try {
      const buffer = await this.generateQRBuffer(text, options);

      res.set({
        'Content-Type': 'image/png',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `inline; filename="qr-code-${Date.now()}.png"`,
      });

      res.send(buffer);
    } catch (error) {
      throw new BadRequestException(
        `Error enviando imagen QR: ${error.message}`,
      );
    }
  }

  /**
   * Capacidad maxima en modo byte segun el nivel de correccion de errores.
   * Cuanta mas correccion, menos datos caben.
   *
   * El limite estaba fijado en 2953 —la capacidad del nivel L— pero el nivel
   * por defecto de este servicio es M, que solo admite 2331. Los textos entre
   * ambos valores pasaban esta comprobacion y reventaban despues dentro de la
   * libreria, con un mensaje mucho menos claro.
   */
  private static readonly CAPACIDAD_POR_NIVEL: Record<string, number> = {
    L: 2953,
    M: 2331,
    Q: 1663,
    H: 1273,
  };

  private validateInput(text: string, nivel: string = 'M'): void {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('El texto no puede estar vacío');
    }

    const maximo = QrGeneratorService.CAPACIDAD_POR_NIVEL[nivel] ?? 2331;

    if (text.length > maximo) {
      throw new BadRequestException(
        `El texto es demasiado largo para generar un código QR ` +
          `(${text.length} caracteres; el máximo con corrección «${nivel}» es ${maximo})`,
      );
    }
  }

  /**
   * Devolvia `any`, y eso hacia que TypeScript resolviera `QRCode.toDataURL`
   * contra su sobrecarga de callback —cuyo retorno es `void`—. El codigo
   * compilaba y funcionaba de milagro. Al tipar el retorno, la sobrecarga que
   * se elige es la que devuelve una promesa, que es la que aqui se espera.
   *
   * `height` no se emite: la libreria no tiene esa opcion (el QR es cuadrado y
   * se dimensiona con `width`). Se ignoraba en silencio.
   */
  private getDefaultOptions(
    options?: QROptions,
  ): QRCode.QRCodeRenderersOptions {
    return {
      width: options?.width || 256,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF',
      },
      errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
    };
  }
}
