import { PartialType } from '@nestjs/mapped-types';
import { CreateSuperintendenciaDto } from './create-superintendencia.dto';

export class UpdateSuperintendenciaDto extends PartialType(CreateSuperintendenciaDto) {}
