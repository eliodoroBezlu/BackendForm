import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Cuerpo de `POST :id/publicar`: el motivo es obligatorio (control documental). */
export class PublicarRevisionDto {
  @IsString()
  @IsNotEmpty({ message: 'Indique el motivo del cambio' })
  @MaxLength(1000)
  motivoCambio: string;
}
