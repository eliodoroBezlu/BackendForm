import { 
  IsString, 
  MinLength, 
  MaxLength, 
  Matches, 
  IsEmail, 
  IsOptional,
  IsEnum 
} from 'class-validator';
import { Role } from '../enums/role.enum';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'El username solo puede contener letras, números, guiones y guiones bajos',
  })
  username: string;

  @IsOptional()
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  email?: string;

  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'La contraseña debe contener mayúsculas, minúsculas, números y caracteres especiales',
    },
  )
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}