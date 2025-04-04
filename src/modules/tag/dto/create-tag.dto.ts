import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateTagDto {
  @IsNotEmpty({ message: 'El tag es requerido' })
  @IsString({ message: 'El tag debe ser una cadena de texto' })
  @Matches(/^[A-Z0-9]+$/, { 
    message: 'El tag solo debe contener letras mayúsculas y números' 
  })
  readonly tag: string;

  @IsNotEmpty({ message: 'El área es requerida' })
  @IsString({ message: 'El área debe ser una cadena de texto' })
  readonly area: string;
}