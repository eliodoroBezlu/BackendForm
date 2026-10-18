import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Cambio de contraseña del propio usuario. Solo se exige la forma: las reglas
 * de la contraseña nueva las aplica el IAM, que es quien la guarda.
 */
export class CambiarClaveDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
