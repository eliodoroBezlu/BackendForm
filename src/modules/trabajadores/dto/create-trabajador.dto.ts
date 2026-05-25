  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, IsDateString, IsNotEmpty, IsOptional } from 'class-validator';
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

    @ApiProperty({
      description: 'Área a la que pertenece',
      example: 'Mina'
    })
    @IsString()
    @IsNotEmpty()
    area: string;

    @ApiProperty({ description: 'Código JDE del trabajador', example: '12345', required: false })
    @IsOptional()
    @IsString()
    jde?: string;

    @ApiProperty({ description: 'Número de bloque de residencia', example: 'B-3', required: false })
    @IsOptional()
    @IsString()
    no_bloque?: string;

    @ApiProperty({ description: 'Número de habitación', example: '205', required: false })
    @IsOptional()
    @IsString()
    no_habitacion?: string;

    @ApiProperty({ description: 'Residencia o campamento', example: 'Campamento Norte', required: false })
    @IsOptional()
    @IsString()
    residencia?: string;

    @ApiProperty({ description: 'Número de celular', example: '+591 71234567', required: false })
    @IsOptional()
    @IsString()
    celular?: string;
  }