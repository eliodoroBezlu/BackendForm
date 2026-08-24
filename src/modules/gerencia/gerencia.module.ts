import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GerenciaService } from './gerencia.service';
import { GerenciaController } from './gerencia.controller';
import { Gerencia, GerenciaSchema } from './schemas/gerencia.schema';
import {
  Superintendencia,
  SuperintendenciaSchema,
} from '../superintendencia/schemas/superintendencia.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Gerencia.name, schema: GerenciaSchema },
      // Solo para contar las que cuelgan antes de borrar y para listarlas.
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
    ]),
  ],
  controllers: [GerenciaController],
  providers: [GerenciaService],
  exports: [GerenciaService],
})
export class GerenciaModule {}
