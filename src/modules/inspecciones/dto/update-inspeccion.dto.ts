 import { PartialType } from '@nestjs/mapped-types';
 import { CreateInspeccionDto } from './create-inspeccion.dto';

 export class UpdateInspeccionDto extends PartialType(CreateInspeccionDto) {}
