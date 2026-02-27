import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  BadRequestException,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { OrdenTrabajo } from './schema/tag.schema';
import { Resource } from 'nest-keycloak-connect';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tag')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  async create(@Body() createDto: CreateTagDto): Promise<OrdenTrabajo> {
    try {
      return await this.tagService.create(createDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al crear tag',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll() {
    try {
      return await this.tagService.findAll();
    } catch (error) {
      throw new HttpException(
        'Error al obtener tags',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ✅ Ruta específica ANTES de la genérica
  @Get('por-area')
  async findTagByArea(@Query('area') area: string) {
    if (!area || area.trim() === '') {
      throw new BadRequestException('Se requiere especificar un área válida');
    }

    try {
      const tags = await this.tagService.findByArea(area);
      
      return tags;
    } catch (error) {
      console.error('❌ Error al buscar tags por área:', error);
      throw new HttpException(
        error.message || 'Error al buscar tags por área',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ✅ Ruta genérica AL FINAL
  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.tagService.findOne(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al obtener tag',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    try {
      return await this.tagService.update(id, updateTagDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al actualizar tag',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch(':id/desactivar')
  async desactivar(@Param('id') id: string) {
    try {
      return await this.tagService.desactivar(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al desactivar tag',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch(':id/activar')
  async activar(@Param('id') id: string) {
    try {
      return await this.tagService.activar(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al activar tag',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      return await this.tagService.remove(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al eliminar tag',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}