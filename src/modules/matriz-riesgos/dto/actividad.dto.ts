import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { CATEGORIAS, CONDICIONES } from '../domain/nivel-riesgo';

/**
 * El encabezado de una actividad (columnas B–E del formulario).
 *
 * Los cuatro campos juntos **identifican** la actividad: dos tareas con el
 * mismo nombre pero distinta categoría son dos actividades, igual que en el
 * Excel. Ver `ActividadRiesgo` en el schema.
 */
export class ActividadDto {
  @ApiProperty({ example: 'Mantenimiento Chancador' })
  @IsString()
  areaProcesoAlcance: string;

  @ApiProperty({
    example: 'Desmontaje y montaje de componentes del Chancador Primario',
  })
  @IsString()
  actividadTarea: string;

  @ApiProperty({ enum: CONDICIONES })
  @IsIn(CONDICIONES as readonly string[])
  condicion: string;

  @ApiProperty({
    enum: CATEGORIAS,
    description:
      'Discriminador maestro: define qué catálogos y qué jerarquía se ofrecen ' +
      'a todos los riesgos de esta actividad.',
  })
  @IsIn(CATEGORIAS as readonly string[])
  categoria: string;
}
