import { PartialType } from '@nestjs/swagger';
import { CreatePlanAccionDto } from './create-planes-accion.dto';

export class UpdatePlanAccionDto extends PartialType(CreatePlanAccionDto) {}
