  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, IsDateString, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';

  export class CreateTrabajadorDto {
    @ApiProperty({
      description: 'Número de cédula de identidad',
      example: '12345678'
    })
    @IsString()
    @IsNotEmpty()
    ci: string;

    @ApiProperty({
      description: 'Nombre y apellido del trabajador',
      example: 'juanito pérez'
    })
    @IsString()
    @IsNotEmpty()
    nomina: string;

    @ApiProperty({
      description: 'Puesto de trabajo',
      example: 'Ingeniero de Seguridad'
    })
    @IsString()
    @IsNotEmpty()
    puesto: string;

    @ApiProperty({
      description: 'Fecha de ingreso a la empresa',
      example: '2024-01-15'
    })
    @Type(() => Date)
    @IsNotEmpty()
    fecha_ingreso: Date;

    @ApiProperty({
      description: 'Superintendencia a la que pertenece',
      example: 'Superintendencia de Operaciones'
    })
    @IsString()
    @IsNotEmpty()
    superintendencia: string;
  }