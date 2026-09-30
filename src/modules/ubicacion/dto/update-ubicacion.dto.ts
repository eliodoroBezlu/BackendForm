import { PartialType } from '@nestjs/mapped-types';
import { CreateUbicacionDto } from './create-ubicacion.dto';

/**
 * Renombrar y/o mover. `padre: null` la sube a raíz; ausente, no la mueve.
 *
 * `activo` no se acepta aquí a propósito: la baja pasa por `DELETE` (que
 * comprueba hijos y equipos) y el alta por `POST :id/restaurar` (que
 * comprueba el padre). Un `PATCH { activo: false }` se saltaba las dos cosas.
 */
export class UpdateUbicacionDto extends PartialType(CreateUbicacionDto) {}
