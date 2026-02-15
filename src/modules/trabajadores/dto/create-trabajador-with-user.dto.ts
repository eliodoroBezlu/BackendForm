import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsOptional, IsArray, MinLength, Matches } from 'class-validator';
import { CreateTrabajadorDto } from './create-trabajador.dto';

export class CreateTrabajadorWithUserDto extends CreateTrabajadorDto {
  @ApiProperty({
    description: 'Username para el sistema (único)',
    example: 'juan.perez',
  })
  @IsString()
  @MinLength(3, { message: 'El username debe tener al menos 3 caracteres' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'El username solo puede contener letras, números, puntos, guiones y guiones bajos'
  })
  username: string;

  @ApiProperty({
    description: 'Email del usuario',
    example: 'juan.perez@empresa.com',
  })
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Contraseña inicial (mínimo 8 caracteres)',
    example: 'Password123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiPropertyOptional({
    description: 'Contraseña temporal (debe cambiarla en el primer login)',
    default: true,
  })
  @IsOptional()
  temporary_password?: boolean;

  @ApiPropertyOptional({
    description: 'Nombre completo (opcional, se usa nomina si no se proporciona)',
    example: 'Juan Pérez González',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Roles del usuario',
    example: ['user'],
    default: ['user'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}