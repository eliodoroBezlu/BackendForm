import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from "@nestjs/config"
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const config = new DocumentBuilder()
    .setTitle("Inspection Forms API")
    .setDescription("API para el sistema de formularios de inspección")
    .setVersion("1.0")
    .addTag("templates", "Gestión de plantillas de formularios")
    .addTag("instances", "Gestión de instancias de formularios")
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup("api/docs", app, document)

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  // Parsear los orígenes definidos
  const originsString = configService.get<string>("CORS_ORIGIN") || "";
  const allowedOrigins = originsString.split(",").map(origin => origin.trim());
  console.log("Orígenes permitidos:", allowedOrigins);
  app.enableCors({
    origin: (requestOrigin, callback) => {

      // Solo permitir orígenes específicamente definidos
      if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
        callback(null, true);
      } else {
        console.error(`Origen no permitido: ${requestOrigin}`);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos HTTP permitidos
    allowedHeaders: [
      'Origin', 
      'X-Requested-With', 
      'Content-Type', 
      'Accept', 
      'Authorization'
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  const port = configService.get<number>('PORT') || 3002; // Define el puerto
  await app.listen(port); 
  console.log(`Aplicación corriendo en http://localhost:${port}`);
}
bootstrap();

// para subir los cambios
