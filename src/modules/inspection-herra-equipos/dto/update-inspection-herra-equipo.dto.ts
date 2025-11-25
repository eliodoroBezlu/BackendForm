import { PartialType } from '@nestjs/swagger';
import { CreateInspectionHerraEquipoDto } from './create-inspection-herra-equipo.dto';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateInspectionHerraEquipoDto extends PartialType(CreateInspectionHerraEquipoDto) {}

// ✅ NUEVO: DTO específico para aprobación
export class ApproveInspectionDto {
  @IsString()
  @IsNotEmpty()
  approvedBy: string;

  @IsString()
  @IsOptional()
  supervisorComments?: string;
}

// ✅ NUEVO: DTO específico para rechazo
export class RejectInspectionDto {
  @IsString()
  @IsNotEmpty()
  rejectedBy: string;

  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}