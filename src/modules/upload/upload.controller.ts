import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  OnModuleInit,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CARPETAS_SUBIDA, rutaDeCarpeta } from './carpetas-permitidas';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('upload')
@Controller('upload')
export class UploadController implements OnModuleInit {
  private readonly logger = new Logger(UploadController.name);

  onModuleInit() {
    for (const ruta of Object.values(CARPETAS_SUBIDA)) {
      if (!existsSync(ruta)) {
        mkdirSync(ruta, { recursive: true });
        this.logger.log(`Carpeta creada: ${ruta}`);
      }
    }
  }

  @Post()
  @ApiOperation({ summary: 'Subir archivo (evidencia de tarea)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // El destino sale de la lista blanca, nunca del texto que llega.
        destination: (req, _file, callback) => {
          const clave = (req.query as { carpeta?: string })?.carpeta;
          callback(null, rutaDeCarpeta(clave));
        },
        filename: (_req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException('Tipo de archivo no permitido'),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('carpeta') carpeta?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó archivo');
    }

    // `rutaDeCarpeta` empieza por `./uploads/`; la URL pública se sirve desde
    // `/uploads/`, así que se quita el punto inicial.
    const base = rutaDeCarpeta(carpeta).replace(/^\./, '');

    return {
      url: `${base}/${file.filename}`,
      path: file.path,
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  }
}
