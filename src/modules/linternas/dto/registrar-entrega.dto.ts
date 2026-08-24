import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TipoEntrega } from '../schemas/entrega-linterna.schema';

export class ArchivoAdjuntoDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  mime?: string;

  @IsOptional()
  @IsNumber()
  tamano?: number;
}

export class DevolucionDto {
  @ValidateNested()
  @Type(() => ArchivoAdjuntoDto)
  foto: ArchivoAdjuntoDto;

  @IsOptional()
  @IsString()
  observacion?: string;
}

export class PerdidaDto {
  @IsString()
  @IsNotEmpty({ message: 'La justificación de la pérdida es obligatoria.' })
  justificacion: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchivoAdjuntoDto)
  evidencias?: ArchivoAdjuntoDto[];
}

export class RegistrarEntregaDto {
  @IsMongoId()
  trabajador: string;

  @IsEnum(TipoEntrega)
  tipo: TipoEntrega;

  /**
   * Firma de recibo del trabajador, como data URL. Llega **sin sellar**: el
   * hash y la fecha los pone el servidor, porque los del cliente no probarían
   * nada.
   *
   * Opcional en una pérdida, donde se firma después de aprobar.
   */
  @IsOptional()
  @IsString()
  firmaTrabajador?: string;

  /** `dibujada` o `subida`; queda registrado para poder ponderarlo después. */
  @IsOptional()
  @IsString()
  metodoFirma?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DevolucionDto)
  devolucion?: DevolucionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PerdidaDto)
  perdida?: PerdidaDto;

  @IsOptional()
  @IsString()
  observacion?: string;
}
