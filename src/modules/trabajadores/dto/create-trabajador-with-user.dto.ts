import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsNotEmpty, IsOptional, IsEmail, IsBoolean } from 'class-validator';
import { CreateTrabajadorDto } from './create-trabajador.dto';

export class CreateTrabajadorWithUserDto extends CreateTrabajadorDto {
  @ApiProperty({
    description: 'Nombre de usuario para Keycloak (opcional)',
    example: 'juan.perez',
    required: false
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({
    description: 'Email del usuario',
    example: 'juan.perez@empresa.com'
  })
  @IsEmail()
  @IsOptional()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Crear usuario en Keycloak automáticamente',
    example: true,
    default: false
  })
  @IsBoolean()
  @IsOptional()
  crear_usuario_keycloak?: boolean = false;

  @ApiProperty({
    description: 'Roles iniciales para el usuario',
    example: ['user'],
    required: false
  })
  @IsOptional()
  roles?: string[];
}