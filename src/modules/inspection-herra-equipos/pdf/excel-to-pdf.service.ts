// excel-to-pdf.service.ts → VERSIÓN QUE NUNCA FALLA (2025)

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { Readable } from 'stream';

// FORMA CORRECTA EN 2025 (evita el bug del default)
import FormData = require('form-data');
// O también puedes usar:
// const FormData = require('form-data');

interface ConversionOptions {
  quality?: 'normal' | 'high';
}

@Injectable()
export class ExcelToPdfService {
  private readonly logger = new Logger(ExcelToPdfService.name);
  private readonly mlServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.mlServiceUrl = this.configService.get<string>(
      'ML_SERVICE_URL',
      'http://localhost:8000',
    );
  }

  /**
   * Convierte un Excel a PDF vía el microservicio ML y devuelve la respuesta
   * como stream en vez de bufferizarla entera en memoria — el llamador debe
   * hacer `.pipe(destino)` y manejar el evento `'error'` del stream para
   * fallos que ocurran después de que arrancó la transferencia (los errores
   * de conexión/headers previos sí quedan cubiertos por el try/catch de acá).
   */
  async convertExcelToPdf(
    excelBuffer: Buffer,
    options?: ConversionOptions,
  ): Promise<Readable> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Iniciando conversión Excel → PDF (${(excelBuffer.length / 1024).toFixed(2)} KB)`,
      );

      const form = new FormData();

      form.append('file', excelBuffer, {
        filename: 'document.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = `${this.mlServiceUrl}/api/ml/converter/excel-to-pdf`;

      const response = await firstValueFrom(
        this.httpService.post<Readable>(url, form, {
          params: options?.quality ? { quality: options.quality } : {},
          headers: form.getHeaders(),
          responseType: 'stream',
          timeout: 120000,
        }),
      );

      this.logger.log(`Stream de PDF iniciado en ${Date.now() - startTime}ms`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Error conversión Excel→PDF: ${error.message}`);

      if (error.response) {
        const msg = error.response.data
          ? Buffer.from(error.response.data).toString('utf-8')
          : error.response.statusText;
        throw new HttpException(
          `Servicio ML falló: ${msg}`,
          error.response.status,
        );
      }

      throw new HttpException(
        `Error de conexión: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
