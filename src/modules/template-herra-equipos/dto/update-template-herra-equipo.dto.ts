import { PartialType } from '@nestjs/swagger';
import { CreateTemplateHerraEquipoDto } from './create-template-herra-equipo.dto';

export class UpdateTemplateHerraEquipoDto extends PartialType(CreateTemplateHerraEquipoDto) {}
