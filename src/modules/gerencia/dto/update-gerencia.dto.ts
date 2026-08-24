import { PartialType } from '@nestjs/mapped-types';
import { CreateGerenciaDto } from './create-gerencia.dto';

export class UpdateGerenciaDto extends PartialType(CreateGerenciaDto) {}
