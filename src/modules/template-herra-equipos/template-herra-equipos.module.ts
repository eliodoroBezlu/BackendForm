import { Module } from '@nestjs/common';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { TemplateHerraEquiposController } from './template-herra-equipos.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TemplateHerraEquipos,
  TemplateHerraEquiposSchema,
} from './schemas/template-herra-equipo.schema';
import {
  InspectionHerraEquipos,
  InspectionHerraEquiposSchema,
} from '../inspection-herra-equipos/schemas/inspection-herra-equipos.schema';

@Module({
  imports: [
    // Las inspecciones se registran aquí para contar cuántas usan cada
    // revisión (el versionado no deja editar una revisión ya usada). No se
    // importa InspectionHerraEquiposModule porque ese ya importa este.
    MongooseModule.forFeature([
      { name: TemplateHerraEquipos.name, schema: TemplateHerraEquiposSchema },
      {
        name: InspectionHerraEquipos.name,
        schema: InspectionHerraEquiposSchema,
      },
    ]),
  ],
  controllers: [TemplateHerraEquiposController],
  providers: [TemplateHerraEquiposService],
  exports: [TemplateHerraEquiposService],
})
export class TemplateHerraEquiposModule {}
