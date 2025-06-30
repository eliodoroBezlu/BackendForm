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
      this.validateInput(text);
      
      const qrOptions = this.getDefaultOptions(options);
      return await QRCode.toDataURL(text, qrOptions);
    } catch (error) {
      throw new BadRequestException(`Error generando código QR: ${error.message}`);
    }
  }

  /**
   * Genera un código QR como Buffer (para descargas)
   */
  async generateQRBuffer(text: string, options?: QROptions): Promise<Buffer> {
    try {
      this.validateInput(text);
      
      const qrOptions = this.getDefaultOptions(options);
      return await QRCode.toBuffer(text, qrOptions);
    } catch (error) {
      throw new BadRequestException(`Error generando código QR: ${error.message}`);
    }
  }

  /**
   * Genera un código QR como SVG
   */
  async generateQRSVG(text: string, options?: QROptions): Promise<string> {
    try {
      this.validateInput(text);
      
      const qrOptions = this.getDefaultOptions(options);
      return await QRCode.toString(text, { 
        ...qrOptions, 
        type: 'svg' 
      });
    } catch (error) {
      throw new BadRequestException(`Error generando código QR: ${error.message}`);
    }
  }

  /**
   * Genera todas las versiones del código QR
   */
  async generateQRComplete(text: string, options?: QROptions): Promise<QRGenerationResult> {
    try {
      this.validateInput(text);
      
      const [dataUrl, buffer, svg] = await Promise.all([
        this.generateQRDataURL(text, options),
        this.generateQRBuffer(text, options),
        this.generateQRSVG(text, options)
      ]);

      return { dataUrl, buffer, svg };
    } catch (error) {
      throw new BadRequestException(`Error generando código QR: ${error.message}`);
    }
  }

  /**
   * Envía el código QR como imagen directamente en la respuesta HTTP
   */
  async sendQRImage(text: string, res: Response, options?: QROptions): Promise<void> {
    try {
      const buffer = await this.generateQRBuffer(text, options);
      
      res.set({
        'Content-Type': 'image/png',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `inline; filename="qr-code-${Date.now()}.png"`
      });
      
      res.send(buffer);
    } catch (error) {
      throw new BadRequestException(`Error enviando imagen QR: ${error.message}`);
    }
  }

  private validateInput(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('El texto no puede estar vacío');
    }

    if (text.length > 2953) {
      throw new BadRequestException('El texto es demasiado largo para generar un código QR');
    }
  }

  private getDefaultOptions(options?: QROptions): any {
    return {
      width: options?.width || 256,
      height: options?.height || 256,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF'
      },
      errorCorrectionLevel: options?.errorCorrectionLevel || 'M'
    };
  }
}