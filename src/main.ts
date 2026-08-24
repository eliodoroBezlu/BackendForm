import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.use(cookieParser());
  app.use(helmet());
  // Parsers de JSON y URL.
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // 🔥 Servir archivos estáticos (uploads)
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });
  logger.log(
    `📁 Archivos estáticos servidos desde: ${join(__dirname, '..', 'uploads')}`,
  );

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Inspection Forms API')
    .setDescription('API para el sistema de formularios de inspección')
    .setVersion('1.0')
    .addTag('templates', 'Gestión de plantillas de formularios')
    .addTag('instances', 'Gestión de instancias de formularios')
    .addTag('upload', 'Gestión de archivos')
    .setContact(
      'API Support',
      'https://example.com/support',
      'support@example.com',
    )
    .addServer('http://localhost:3002', 'Desarrollo')
    .addServer('https://tu-dominio-produccion.com', 'Producción')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Inspection Forms API Docs',
    customfavIcon: '/favicon.ico',
  });

  // ✅ Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      validateCustomDecorators: false,
    }),
  );

  // 🌐 Configuración CORS
  const originsString = configService.get<string>('CORS_ORIGIN') || '';
  const allowedOrigins = originsString
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  logger.log(`🌐 Orígenes CORS permitidos: ${allowedOrigins.join(', ')}`);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Permitir requests sin origen (ej: Postman, aplicaciones móviles)
      if (!requestOrigin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(requestOrigin)) {
        callback(null, true);
      } else {
        logger.warn(`❌ Origen CORS no permitido: ${requestOrigin}`);
        callback(
          new Error(`CORS: Origen ${requestOrigin} no permitido`),
          false,
        );
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'Cache-Control',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'Set-Cookie',
      'X-Page-Count',
      'Link',
      // Permite correlacionar un error visto en el navegador con su linea de log.
      'X-Request-Id',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // 🚀 Configuración del puerto y inicio del servidor
  // El limite de tasa usa la IP del cliente. Detras del proxy de Next todas
  // las peticiones llegan con la misma IP, asi que sin esto un solo usuario
  // activo agotaria la cuota de todos. Confia en el primer salto.
  app.set('trust proxy', 1);

  // Cierra conexiones y trabajos en curso antes de morir, en vez de cortar
  // las peticiones en vuelo en cada despliegue.
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') || 3002;

  await app.listen(port);

  // 📊 Log de información del servidor
  logger.log(`🚀 Servidor corriendo en http://localhost:${port}`);
  logger.log(`📚 Documentación Swagger: http://localhost:${port}/api/docs`);
  logger.log(`💚 Health check: http://localhost:${port}/health`);
  logger.log(`📤 Uploads disponibles en: http://localhost:${port}/uploads`);
}

// 🛑 Manejo de errores globales
// Ultimo recurso: si el arranque falla, la app de Nest no llego a existir y
// con ella tampoco su Logger. `console.error` es aqui la unica salida fiable.
bootstrap().catch((error) => {
  console.error('Error al iniciar la aplicacion:', error);
  process.exit(1);
});
