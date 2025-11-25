import { IsString, IsEmail, IsOptional, IsArray, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserForWorkerDto {
  @ApiProperty({ description: 'Username único para el sistema' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiPropertyOptional({ description: 'Email del usuario (opcional)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Contraseña inicial (opcional, se genera automática si no se proporciona)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ description: 'Roles a asignar', default: ['user'] })
  @IsOptional()
  @IsArray()
  roles?: string[];

  @ApiPropertyOptional({ description: 'Si la contraseña es temporal', default: true })
  @IsOptional()
  @IsBoolean()
  temporary_password?: boolean;
}

export class UpdateUserPasswordDto {
  @ApiProperty({ description: 'Nueva contraseña' })
  @IsString()
  @MinLength(8)
  new_password: string;

  @ApiProperty({ description: 'Si la contraseña es temporal', default: false })
  @IsOptional()
  @IsBoolean()
  temporary?: boolean;
}

export class UpdateUserRolesDto {
  @ApiProperty({ description: 'Nuevos roles para el usuario' })
  @IsArray()
  @IsString({ each: true })
  roles: string[];
}

export class DisableUserDto {
  @ApiProperty({ description: 'Motivo de la desactivación' })
  @IsString()
  reason: string;
}