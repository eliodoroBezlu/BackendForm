import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FirmaService } from './firma.service';
import { AuditoriaFirma, AuditoriaFirmaSchema } from './auditoria-firma.schema';

/**
 * Sellado y verificación de firmas.
 *
 * Global porque cualquier módulo que guarde una firma —linternas hoy,
 * inspecciones e IRO-ISOP después— necesita el mismo servicio, y tener una sola
 * implementación es justamente el punto: si cada módulo calculara su hash a su
 * manera, la verificación dejaría de valer para el conjunto.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditoriaFirma.name, schema: AuditoriaFirmaSchema },
    ]),
  ],
  providers: [FirmaService],
  exports: [FirmaService],
})
export class FirmaModule {}
