import { Module } from '@nestjs/common';
import { QrGeneratorService } from './qr-generator.service';
import { QrGeneratorController } from './qr-generator.controller';

@Module({
  providers: [QrGeneratorService],
  controllers: [QrGeneratorController],
  exports: [QrGeneratorService], // Para usar en otros módulos
})
export class QrGeneratorModule {}