import { Module } from '@nestjs/common';
import { EquipmentTrackingService } from './equipment-tracking.service';
import { EquipmentTrackingController } from './equipment-tracking.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentInspectionTracking,
  EquipmentInspectionTrackingSchema,
} from './schemas/equipment-tracking.schema';
import { TemplateConfigService } from './template-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: EquipmentInspectionTracking.name,
        schema: EquipmentInspectionTrackingSchema,
      },
    ]),
  ],

  controllers: [EquipmentTrackingController],
  providers: [EquipmentTrackingService, TemplateConfigService],
  exports: [EquipmentTrackingService, TemplateConfigService],
})
export class EquipmentTrackingModule {}
