import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SuperintendenciaService } from './superintendencia.service';
import { CreateSuperintendenciaDto } from './dto/create-superintendencia.dto';
import { UpdateSuperintendenciaDto } from './dto/update-superintendencia.dto';

@Controller('superintendencia')
export class SuperintendenciaController {
  constructor(private readonly superintendenciaService: SuperintendenciaService) {}

  @Post()
  async create(@Body() createSuperintendenciaDto: CreateSuperintendenciaDto) {
    return this.superintendenciaService.create(createSuperintendenciaDto);
  }

  @Get()
  async findAll() {
    return this.superintendenciaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.superintendenciaService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSuperintendenciaDto: UpdateSuperintendenciaDto) {
    return this.superintendenciaService.update(+id, updateSuperintendenciaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.superintendenciaService.remove(+id);
  }
}
