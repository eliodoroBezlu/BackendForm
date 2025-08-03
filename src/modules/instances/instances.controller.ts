import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { InstancesService } from './instances.service';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { UpdateInstanceDto } from './dto/update-instance.dto';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva instancia de formulario' })
  @ApiResponse({ status: 201, description: 'Instancia creada exitosamente' })
  @ApiResponse({ status: 404, description: 'Template no encontrado' })
  create(@Body() createInstanceDto: CreateInstanceDto) {
    return this.instancesService.create(createInstanceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las instancias' })
  @ApiQuery({ name: 'templateId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['borrador', 'completado', 'revisado', 'aprobado'],
  })
  @ApiQuery({ name: 'createdBy', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: Date })
  @ApiQuery({ name: 'dateTo', required: false, type: Date })
  @ApiResponse({ status: 200, description: 'Lista de instancias' })
  async findAll(
    @Query('templateId') templateId?: string,
    @Query('status') status?: string,
    @Query('createdBy') createdBy?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('minCompliance', new DefaultValuePipe(0), ParseIntPipe)
    minCompliance?: number,
    @Query('maxCompliance', new DefaultValuePipe(100), ParseIntPipe)
    maxCompliance?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    const filters: any = {
      page,
      limit,
    };
    if (templateId) filters.templateId = templateId;
    if (status) filters.status = status;
    if (createdBy) filters.createdBy = createdBy;
    if (dateFrom) filters.dateFrom = new Date(dateFrom);
    if (dateTo) filters.dateTo = new Date(dateTo);
    if (minCompliance !== undefined) filters.minCompliance = minCompliance;
    if (maxCompliance !== undefined) filters.maxCompliance = maxCompliance;

    return await this.instancesService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de instancias' })
  @ApiQuery({ name: 'templateId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Estadísticas de instancias' })
  async getStats(@Query('templateId') templateId?: string) {
    return await this.instancesService.getStats(templateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una instancia por ID' })
  @ApiResponse({ status: 200, description: 'Instancia encontrada' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  async findOne(@Param('id') id: string) {
    return await this.instancesService.findOne(id);
  }

  @Get('compliance-report')
  @ApiOperation({
    summary: 'Obtener reporte detallado de cumplimiento',
    description:
      'Análisis por secciones con identificación de áreas problemáticas',
  })
  async getComplianceReport(@Query('templateId') templateId?: string) {
    return await this.instancesService.getComplianceReport(templateId);
  }

  // @Patch(':id')
  // @ApiOperation({ summary: 'Actualizar una instancia' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Instancia actualizada exitosamente',
  // })
  // @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  // async update(
  //   @Param('id') id: string,
  //   @Body() updateInstanceDto: UpdateInstanceDto,
  // ) {
  //   return await this.instancesService.update(id, updateInstanceDto);
  // }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de una instancia' })
  @ApiResponse({ status: 200, description: 'Estado actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; userId?: string },
  ) {
    return this.instancesService.updateStatus(id, body.status, body.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.instancesService.remove(id);
  }
}
