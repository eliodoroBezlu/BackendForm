import { PartialType } from '@nestjs/mapped-types';
import { CreateFormularioInspeccionDto } from './create-inspecciones-emergencia.dto';

export class UpdateInspeccionesEmergenciaDto extends PartialType(CreateFormularioInspeccionDto) {}
