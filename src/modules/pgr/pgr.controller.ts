import { Controller, Get, Post, Body, Patch, Param, Delete, Put } from '@nestjs/common';
import { PgrService } from './pgr.service';
import { CreatePgrDto } from './dto/create-pgr.dto';
import { UpdatePgrDto } from './dto/update-pgr.dto';
import { AprobarPgrDto } from './dto/aprobar-pgr.dto';
import { SeguimientoPgrDto } from './dto/seguimiento-pgr.dto';

@Controller('pgr')
export class PgrController {
  constructor(private readonly pgrService: PgrService) {}

  @Post()
  create(@Body() createPgrDto: CreatePgrDto) {
    return this.pgrService.create(createPgrDto);
  }

  @Get()
  findAll() {
    return this.pgrService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pgrService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updatePgrDto: UpdatePgrDto) {
    return this.pgrService.update(id, updatePgrDto);
  }

  @Patch(':id/aprobar')
  aprobar(@Param('id') id: string, @Body() aprobarPgrDto: AprobarPgrDto) {
    return this.pgrService.aprobar(id, aprobarPgrDto);
  }

  @Patch(':id/seguimiento/tarea/:tareaId')
  addSeguimiento(
    @Param('id') id: string,
    @Param('tareaId') tareaId: string,
    @Body() seguimientoDto: SeguimientoPgrDto,
  ) {
    return this.pgrService.addSeguimiento(id, tareaId, seguimientoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pgrService.remove(id);
  }
}
