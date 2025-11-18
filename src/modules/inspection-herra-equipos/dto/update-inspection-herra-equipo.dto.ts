import { PartialType } from '@nestjs/swagger';
import { CreateInspectionHerraEquipoDto } from './create-inspection-herra-equipo.dto';

export class UpdateInspectionHerraEquipoDto extends PartialType(CreateInspectionHerraEquipoDto) {}
