import { PartialType } from '@nestjs/swagger';
import { CreateInspectionScheduleDto } from './create-inspection-schedule.dto';

export class UpdateInspectionScheduleDto extends PartialType(CreateInspectionScheduleDto) {}