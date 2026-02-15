import { IsString, IsEmail, IsOptional, IsArray, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserForWorkerDto {
  @ApiProperty({
    description: 'Username único para el sistema',
    example: 'juan.perez',
  })
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username: string;

  @ApiPropertyOptional({
    description: 'Email del usuario',
    example: 'juan.perez@empresa.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Contraseña inicial',
    example: 'Password123!',
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'Contraseña temporal',
    default: true,
  })
  @IsOptional()
  temporary_password?: boolean;

  @ApiPropertyOptional({
    description: 'Nombre completo (opcional)',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Roles a asignar',
    default: ['user'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}