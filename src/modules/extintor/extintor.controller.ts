import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpException,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { ExtintorService } from './extintor.service';
import { CreateExtintorDto } from './dto/create-extintor.dto';
import { UpdateExtintorDto } from './dto/update-extintor.dto';
import { take } from 'rxjs';

@Controller('extintor')
export class ExtintorController {
  constructor(private readonly extintorService: ExtintorService) {}

  @Post()
  async create(@Body() createExtintorDto: CreateExtintorDto) {
    return this.extintorService.create(createExtintorDto);
  }

  @Get()
  async findAll() {
    return this.extintorService.findAll();
  }

  // @Get(':area')
  // async findByArea(@Param('area') area: string) {
  //   return this.extintorService.findByArea(area);
  // }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateExtintorDto: UpdateExtintorDto,
  ) {
    return this.extintorService.update(+id, updateExtintorDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.extintorService.remove(+id);
  }

  @Get('tag/:tag')
  async findByTag(@Param('tag') tag: string) {
    try {
      console.log('Buscando extintores para el área:', tag);
      const resultado = await this.extintorService.findByTag(tag);
      console.log('Extintores encontrados:', resultado.extintores);

      return {
        success: true,
        extintores: resultado.extintores,
        count: resultado.extintores.length,
        totalExtintoresActivosArea: resultado.totalActivosArea,
      };
    } catch (error) {
      console.error('Error en findByArea:', error);
      throw new HttpException(
        error.message || 'Error al buscar extintores',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('desactivar/:codigo')
  async desactivarExtintor(@Param('codigo') codigo: string) {
    try {
      const resultado = await this.extintorService.deshabilitarExtintor(codigo);

      return resultado;
    } catch (error) {
      console.error('Error al desactivar extintor:', error);
      throw new HttpException(
        error.message || 'Error al desactivar extintor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('area/:area')
  async findByArea(@Param('area') area: string) {
    try {
      console.log('Buscando extintores para el área:', area);
      const resultado = await this.extintorService.findByArea(area);
      console.log('Extintores encontrados:', resultado.extintores);

      return {
        success: true,
        extintores: resultado.extintores,
        count: resultado.extintores.length,
        totalExtintoresActivosArea: resultado.totalActivosArea,
      };
    } catch (error) {
      console.error('Error en findByArea:', error);
      throw new HttpException(
        error.message || 'Error al buscar extintores',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
