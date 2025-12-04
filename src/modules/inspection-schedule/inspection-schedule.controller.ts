import { Controller, Get, Post, Body, Patch, Param, Delete, Put, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { InspectionScheduleService } from './inspection-schedule.service';
import { CreateInspectionScheduleDto } from './dto/create-inspection-schedule.dto';
import { UpdateInspectionScheduleDto } from './dto/update-inspection-schedule.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Resource } from 'nest-keycloak-connect';

@Resource('inspection-schedule')
@ApiTags('inspection-schedule')
@Controller('inspection-schedule')
export class InspectionScheduleController {
  constructor(private readonly inspectionScheduleService: InspectionScheduleService) {}

  @Post()
  @UsePipes(new ValidationPipe({ 
    transform: true,
    transformOptions: { enableImplicitConversion: true } 
  }))
  @ApiOperation({ summary: 'Create new inspection schedule' })
  create(@Body() createDto: CreateInspectionScheduleDto) {
    return this.inspectionScheduleService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all inspection schedules' })
  findAll() {
    return this.inspectionScheduleService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inspection schedule by ID' })
  findOne(@Param('id') id: string) {
    return this.inspectionScheduleService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ 
    transform: true,
    transformOptions: { enableImplicitConversion: true } 
  }))
  @ApiOperation({ summary: 'Update inspection schedule' })
  update(@Param('id') id: string, @Body() updateDto: UpdateInspectionScheduleDto) {
    return this.inspectionScheduleService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete inspection schedule' })
  remove(@Param('id') id: string) {
    return this.inspectionScheduleService.remove(id);
  }


  @Put(':id/complete/:semester')
  @ApiOperation({ summary: 'Register inspection completion' })
  completeInspection(
    @Param('id') id: string,
    @Param('semester') semester: 'first' | 'second',
    @Body() body: { instanceId: string }
  ) {
    return this.inspectionScheduleService.registerCompletion(id, semester, body.instanceId);
  }

  @Get('template/:templateId')
  @ApiOperation({ summary: 'Get inspections by template and year' })
  findByTemplate(@Param('templateId') templateId: string, @Query('year') year: number) {
    return this.inspectionScheduleService.findByTemplateAndYear(templateId, +year);
  }

  @Get('area/:area')
  @ApiOperation({ summary: 'Get inspections by area' })
  findByArea(@Param('area') area: string) {
    return this.inspectionScheduleService.findByArea(area);
  }

  @Get('pending/all')
  @ApiOperation({ summary: 'Get pending inspections' })
  getPendingInspections() {
    return this.inspectionScheduleService.getPendingInspections();
  }
}