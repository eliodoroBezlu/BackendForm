import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { QrGeneratorService, QROptions } from './qr-generator.service';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Resource } from 'nest-keycloak-connect';

class ColorOptions {
  @IsOptional()
  @IsString()
  dark?: string;

  @IsOptional()
  @IsString()
  light?: string;
}

class GenerateQRDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  margin?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ColorOptions)
  color?: ColorOptions;

  @IsOptional()
  @IsIn(['L', 'M', 'Q', 'H'])
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

@Resource('qr-generator') 
@Controller('qr')
export class QrGeneratorController {
  constructor(private readonly qrService: QrGeneratorService) {}

  /**
   * POST /qr/generate - Genera código QR como base64
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async generateQR(@Body() dto: GenerateQRDto) {
    const { text, ...options } = dto;
    const dataUrl = await this.qrService.generateQRDataURL(text, options);

    return {
      success: true,
      data: {
        text,
        qrCode: dataUrl,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * POST /qr/complete - Genera todas las versiones del código QR
   */
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async generateCompleteQR(@Body() dto: GenerateQRDto) {
    const { text, ...options } = dto;
    const result = await this.qrService.generateQRComplete(text, options);

    return {
      success: true,
      data: {
        text,
        ...result,
        timestamp: new Date().toISOString(),
      },
    };
  }
  // En tu controlador NestJS
  @Get('image')
  async getQRImage(
    @Query('text') text: string,
    @Res() res: Response,
    @Query('width') width?: string,
    @Query('height') height?: string,
    @Query('margin') margin?: string,
    @Query('download') download?: string, // Nuevo parámetro
  ) {
    const options: QROptions = {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      margin: margin ? parseInt(margin) : undefined,
    };

    const buffer = await this.qrService.generateQRBuffer(text, options);

    // Determinar si es descarga o visualización
    const disposition = download === 'true' ? 'attachment' : 'inline';

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `${disposition}; filename="qr-code-${Date.now()}.png"`,
      'Cache-Control': 'no-cache',
    });

    res.send(buffer);
  }

  @Get('svg')
  async getQRSVG(
    @Query('text') text: string,
    @Res() res: Response,
    @Query('width') width?: string,
    @Query('height') height?: string,
    @Query('download') download?: string, // Nuevo parámetro
  ) {
    const options: QROptions = {
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
    };

    const svg = await this.qrService.generateQRSVG(text, options);

    // Determinar si es descarga o visualización
    const disposition = download === 'true' ? 'attachment' : 'inline';

    res.set({
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `${disposition}; filename="qr-code-${Date.now()}.svg"`,
      'Cache-Control': 'no-cache',
    });

    res.send(svg);
  }
}
