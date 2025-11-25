import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { CreateTemplateHerraEquipoDto } from './dto/create-template-herra-equipo.dto';
import { UpdateTemplateHerraEquipoDto } from './dto/update-template-herra-equipo.dto';
import { Resource } from 'nest-keycloak-connect';
@Resource('template-herra-equipos')
@Controller('template-herra-equipos')

export class TemplateHerraEquiposController {
  constructor(private readonly templateHerraEquiposService: TemplateHerraEquiposService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTemplateDto: CreateTemplateHerraEquipoDto) {
    return this.templateHerraEquiposService.create(createTemplateDto);
  }

  @Get()
  findAll(@Query('type') type?: string) {
    return this.templateHerraEquiposService.findAll({ type });
  }

  @Get('search')
  search(@Query('q') searchTerm: string) {
    return this.templateHerraEquiposService.search(searchTerm);
  }

  @Get('count')
  count(@Query('type') type?: string) {
    return this.templateHerraEquiposService.count({ type });
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.templateHerraEquiposService.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateHerraEquiposService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTemplateDto: UpdateTemplateHerraEquipoDto) {
    return this.templateHerraEquiposService.update(id, updateTemplateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.templateHerraEquiposService.remove(id);
  }
}
