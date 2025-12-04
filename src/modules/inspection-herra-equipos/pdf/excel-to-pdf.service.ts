// excel-to-pdf.service.ts → VERSIÓN QUE NUNCA FALLA (2025)

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
    this.mlServiceUrl = this.configService.get<string>('ML_SERVICE_URL', 'http://localhost:8000');
  }

  async convertExcelToPdf(excelBuffer: Buffer, options?: ConversionOptions): Promise<Buffer> {
    const startTime = Date.now();

    try {
      this.logger.log(`Iniciando conversión Excel → PDF (${(excelBuffer.length / 1024).toFixed(2)} KB)`);

      const form = new FormData(); 

      form.append('file', excelBuffer, {
        filename: 'document.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = `${this.mlServiceUrl}/api/ml/converter/excel-to-pdf`;

      const response = await firstValueFrom(
        this.httpService.post(url, form, {
          params: options?.quality ? { quality: options.quality } : {},
          headers: form.getHeaders(), 
          responseType: 'arraybuffer',
          timeout: 120000,
        }),
      );

      const pdfBuffer = Buffer.from(response.data);
      this.logger.log(`PDF generado en ${Date.now() - startTime}ms (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);
      return pdfBuffer;

    } catch (error: any) {
      this.logger.error(`Error conversión Excel→PDF: ${error.message}`);

      if (error.response) {
        const msg = error.response.data
          ? Buffer.from(error.response.data).toString('utf-8')
          : error.response.statusText;
        throw new HttpException(`Servicio ML falló: ${msg}`, error.response.status);
      }

      throw new HttpException(
        `Error de conexión: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}