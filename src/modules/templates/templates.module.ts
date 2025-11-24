import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Template, TemplateSchema } from './schemas/template.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }])],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService, MongooseModule]
})
export class TemplatesModule {}
