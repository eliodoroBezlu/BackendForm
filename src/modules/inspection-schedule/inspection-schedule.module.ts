import { Module } from '@nestjs/common';
import { InspectionScheduleService } from './inspection-schedule.service';
import { InspectionScheduleController } from './inspection-schedule.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { InspectionSchedule, InspectionScheduleSchema } from './entities/inspection-schedule.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { 
        name: InspectionSchedule.name, 
        schema: InspectionScheduleSchema 
      }
    ])
  ],
  controllers: [InspectionScheduleController],
  providers: [InspectionScheduleService],
  exports: [InspectionScheduleService]
})
export class InspectionScheduleModule {}