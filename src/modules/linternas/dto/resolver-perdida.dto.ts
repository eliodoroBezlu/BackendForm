import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Decisión del superintendente o supervisor sobre una pérdida. */
export class ResolverPerdidaDto {
  @IsBoolean()
  aprobar: boolean;

  /**
   * Firma de quien aprueba, como data URL. Obligatoria al aprobar: una
   * autorización sin firma no autoriza nada.
   */
  @IsOptional()
  @IsString()
  firmaAprobador?: string;

  @IsOptional()
  @IsString()
  metodoFirma?: string;

  @IsOptional()
  @IsString()
  comentario?: string;
}

/** Acuse de recibo, una vez aprobada la reposición. */
export class FirmarReciboDto {
  @IsString()
  @IsNotEmpty()
  firmaTrabajador: string;

  @IsOptional()
  @IsString()
  metodoFirma?: string;
}

export class RegistrarIngresoDto {
  @IsNotEmpty()
  cantidad: number;

  @IsOptional()
  @IsString()
  observacion?: string;
}
