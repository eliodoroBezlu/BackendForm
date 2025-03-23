import { Module } from '@nestjs/common';
import { AreaService } from './area.service';
import { AreaController } from './area.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Area, AreaSchema } from './schema/area.schema';
import { Superintendencia, SuperintendenciaSchema } from '../superintendencia/schema/superintendencia.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
    ]),
  ],
  controllers: [AreaController],
  providers: [AreaService],
})
export class AreaModule {}
