import { 
  IsString, 
  IsNotEmpty, 
  IsObject, 
  IsOptional, 
  IsEnum, 
  IsDateString,
  IsArray
} from 'class-validator';
import { InspectionStatus } from '../types/IProps';

export class CreateInspectionHerraEquipoDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsString()
  @IsNotEmpty()
  templateCode: string;

  @IsString()
  @IsOptional()
  templateName?: string;

  @IsObject()
  @IsNotEmpty()
  verification: Record<string, string | number>;

  @IsObject()
  @IsNotEmpty()
  responses: Record<string, Record<string, any>>;

  @IsString()
  @IsOptional()
  generalObservations?: string;

  @IsObject()
  @IsOptional()
  inspectorSignature?: Record<string, string | number>;

  @IsObject()
  @IsOptional()
  supervisorSignature?: Record<string, string | number>;

  @IsObject()
  @IsOptional()
  outOfService?: any;

  @IsObject()
  @IsOptional()
  accesoriosConfig?: Record<string, any>;

  @IsObject()
  @IsOptional()
  vehicle?: any;

  @IsObject()
  @IsOptional()
  scaffold?: any;

  @IsArray()
  @IsOptional()
  selectedSubsections?: string[];

  @IsObject()
  @IsOptional()
  selectedItems?: Record<string, string[]>;

  @IsEnum(InspectionStatus)
  @IsNotEmpty()
  status: InspectionStatus;

  @IsDateString()
  @IsNotEmpty()
  submittedAt: string;

  @IsString()
  @IsOptional()
  submittedBy?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  project?: string;
}