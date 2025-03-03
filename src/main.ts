import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from "@nestjs/config"

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const origin = configService.get<string>("CORS_ORIGIN")?.split(",").map(origin => origin.trim()); // Elimina espacios extra

  console.log("CORS Origins:", origin); // Para depuración

  app.enableCors({
    origin: origin, // Usamos el array limpio
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type, Authorization",
  });

  const port = 3001; // Define el puerto
  await app.listen(port); 
  console.log(`Aplicación corriendo en http://localhost:${port}`);
}
bootstrap();
