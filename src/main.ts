import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:3000', 'http://172.25.112.1:3000'], // Permitir solo solicitudes de este origen
  });

  const port = 3001; // Define el puerto
  await app.listen(port); 
  console.log(`Aplicación corriendo en http://localhost:${port}`);
}
bootstrap();
