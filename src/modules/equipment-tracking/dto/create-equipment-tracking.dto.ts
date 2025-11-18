export class CreateEquipmentTrackingDto {

 equipmentId: string;
  equipmentName: string;
  equipmentType: string;
  templateCode: string;
  preUsoCount?: number;
  equipmentMetadata?: Record<string, string>;
}
