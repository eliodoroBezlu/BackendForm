import { Module } from '@nestjs/common';
import { SuperintendenciaService } from './superintendencia.service';
import { SuperintendenciaController } from './superintendencia.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Superintendencia, SuperintendenciaSchema } from './schema/superintendencia.schema';

@Module({
  
  imports: [MongooseModule.forFeature([{ name: Superintendencia.name, schema: SuperintendenciaSchema }])],
  controllers: [SuperintendenciaController],
  providers: [SuperintendenciaService],
})
export class SuperintendenciaModule {}
