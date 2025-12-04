import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InspectionSchedule, InspectionScheduleDocument } from './entities/inspection-schedule.entity';
import { CreateInspectionScheduleDto } from './dto/create-inspection-schedule.dto';
import { UpdateInspectionScheduleDto } from './dto/update-inspection-schedule.dto';

@Injectable()
export class InspectionScheduleService {
  constructor(
    @InjectModel(InspectionSchedule.name) 
    private inspectionScheduleModel: Model<InspectionScheduleDocument>,
  ) {}

  async create(createDto: CreateInspectionScheduleDto): Promise<InspectionSchedule> {
    if (!createDto.firstSemesterDueDate && !createDto.secondSemesterDueDate) {
      throw new BadRequestException('Al menos una programación (primer o segundo semestre) debe estar presente');
    }

    console.log('First semester date:', createDto.firstSemesterDueDate, 'Type:', typeof createDto.firstSemesterDueDate);
    console.log('Second semester date:', createDto.secondSemesterDueDate, 'Type:', typeof createDto.secondSemesterDueDate);

    const inspectionSchedule = new this.inspectionScheduleModel({
      ...createDto,
      templateId: new Types.ObjectId(createDto.templateId),
      hasValidSchedule: !!(createDto.firstSemesterDueDate || createDto.secondSemesterDueDate)
    });

    return inspectionSchedule.save();
  }

  async findAll(): Promise<InspectionSchedule[]> {
    return this.inspectionScheduleModel
      .find()
      .sort({ managementYear: -1, createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<InspectionSchedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const inspectionSchedule = await this.inspectionScheduleModel
      .findById(id)
      .exec();

    if (!inspectionSchedule) {
      throw new NotFoundException('Programación no encontrada');
    }

    return inspectionSchedule;
  }

  async update(id: string, updateDto: UpdateInspectionScheduleDto): Promise<InspectionSchedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    console.log('Update - First semester date:', updateDto.firstSemesterDueDate, 'Type:', typeof updateDto.firstSemesterDueDate);
    console.log('Update - Second semester date:', updateDto.secondSemesterDueDate, 'Type:', typeof updateDto.secondSemesterDueDate);

    const updateData: any = {
      ...updateDto,
      hasValidSchedule: !!(updateDto.firstSemesterDueDate || updateDto.secondSemesterDueDate)
    };

    if (updateDto.templateId) {
      updateData.templateId = new Types.ObjectId(updateDto.templateId);
    }

    const updated = await this.inspectionScheduleModel
      .findByIdAndUpdate(
        id, 
        updateData, 
        { new: true }
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Programación no encontrada');
    }

    return updated;
  }

  async remove(id: string): Promise<InspectionSchedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }

    const deleted = await this.inspectionScheduleModel.findByIdAndDelete(id).exec();
    
    if (!deleted) {
      throw new NotFoundException('Programación no encontrada');
    }

    return deleted;
  }

  async registerCompletion(
    id: string, 
    semester: 'first' | 'second', 
    instanceId: string
  ): Promise<InspectionSchedule> {
    const updated = await this.inspectionScheduleModel.findByIdAndUpdate(
      id,
      {
        instanceId: new Types.ObjectId(instanceId),
        [`${semester}SemesterCompletionDate`]: new Date()
      },
      { new: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException('Programación no encontrada');
    }

    return updated;
  }

  async findByTemplateAndYear(templateId: string, year: number): Promise<InspectionSchedule[]> {
    return this.inspectionScheduleModel
      .find({ 
        templateId: new Types.ObjectId(templateId), 
        managementYear: year 
      })
      .exec();
  }

  async findByArea(area: string): Promise<InspectionSchedule[]> {
    return this.inspectionScheduleModel
      .find({ area, status: 'active' })
      .exec();
  }

  async getPendingInspections(): Promise<InspectionSchedule[]> {
    const today = new Date();
    
    return this.inspectionScheduleModel
      .find({
        status: 'active',
        $or: [
          { 
            firstSemesterDueDate: { $lt: today }, 
            firstSemesterCompletionDate: null 
          },
          { 
            secondSemesterDueDate: { $lt: today }, 
            secondSemesterCompletionDate: null 
          }
        ]
      })
      .exec();
  }
}