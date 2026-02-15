import { IsString, IsOptional } from 'class-validator';

export class InspectorLoginDto {
  @IsString()
  inspectorKey: string; // API Key única del inspector

  @IsOptional()
  @IsString()
  deviceId?: string; // ID del dispositivo (opcional, para seguridad)
}