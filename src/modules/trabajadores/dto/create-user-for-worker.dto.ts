// dto/create-user-for-worker.dto.ts
import { IsString, IsEmail, IsOptional, IsArray, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserForWorkerDto {
  @ApiProperty({ 
    description: 'Username único para el sistema',
    example: 'juan.perez'
  })
  @IsString()
  @MinLength(3, { message: 'El username debe tener al menos 3 caracteres' })
  username: string;

  @ApiPropertyOptional({ 
    description: 'Email del usuario (opcional)',
    example: 'juan.perez@empresa.com'
  })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  email?: string;

  // AGREGAR ESTOS CAMPOS QUE FALTAN
  @ApiProperty({ 
    description: 'Contraseña inicial para el usuario',
    example: 'MiPassword123!',
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiPropertyOptional({ 
    description: 'Si la contraseña es temporal (usuario debe cambiarla en el primer login)',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  temporary_password?: boolean;

  @ApiPropertyOptional({ 
    description: 'Roles a asignar al usuario',
    example: ['user', 'inspector']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}