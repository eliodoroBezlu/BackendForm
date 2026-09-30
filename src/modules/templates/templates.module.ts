import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Template, TemplateSchema } from './schemas/template.schema';
import { Instance, InstanceSchema } from '../instances/schemas/instance.schema';

@Module({
  imports: [
    // `Instance` se registra aquí para contar las inspecciones hechas con cada
    // revisión (el versionado no deja editar una revisión ya usada). No se
    // importa InstancesModule porque ese ya importa este.
    MongooseModule.forFeature([
      { name: Template.name, schema: TemplateSchema },
      { name: Instance.name, schema: InstanceSchema },
    ]),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService, MongooseModule],
})
export class TemplatesModule {}
