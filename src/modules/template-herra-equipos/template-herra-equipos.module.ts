import { Module } from '@nestjs/common';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { TemplateHerraEquiposController } from './template-herra-equipos.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TemplateHerraEquipos,
  TemplateHerraEquiposSchema,
} from './schemas/template-herra-equipo.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TemplateHerraEquipos.name, schema: TemplateHerraEquiposSchema },
    ]),
  ],
  controllers: [TemplateHerraEquiposController],
  providers: [TemplateHerraEquiposService],
  exports: [TemplateHerraEquiposService],
})
export class TemplateHerraEquiposModule {}
