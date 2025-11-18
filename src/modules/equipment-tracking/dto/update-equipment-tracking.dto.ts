import { PartialType } from '@nestjs/swagger';
import { CreateEquipmentTrackingDto } from './create-equipment-tracking.dto';

export class UpdateEquipmentTrackingDto extends PartialType(
  CreateEquipmentTrackingDto,
) {
  lastInspectionDate?: Date;
  nextDueDate?: Date;
  status?: string;
  needsFrecuenteInspection?: boolean;
}
