import { PartialType } from '@nestjs/mapped-types';
import { CreateUbicacionDto } from './create-ubicacion.dto';

export class UpdateUbicacionDto extends PartialType(CreateUbicacionDto) {}
