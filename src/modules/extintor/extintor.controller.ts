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
  Query,
} from '@nestjs/common';
import { ExtintorService } from './extintor.service';
import { CreateExtintorDto } from './dto/create-extintor.dto';
import { UpdateExtintorDto } from './dto/update-extintor.dto';

@Controller('extintor')
export class ExtintorController {
  constructor(private readonly extintorService: ExtintorService) {}

  @Post()
  async create(@Body() createExtintorDto: CreateExtintorDto) {
    try {
      return await this.extintorService.create(createExtintorDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al crear extintor',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll() {
    try {
      return await this.extintorService.findAll();
    } catch (error) {
      throw new HttpException(
        'Error al obtener extintores',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Obtener extintor por ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.extintorService.findOne(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al obtener extintor',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // Obtener extintores con filtros
  @Get('filtrar')
  async findWithFilters(
    @Query('area') area?: string,
    @Query('tag') tag?: string,
    @Query('codigo') codigo?: string,
    @Query('activo') activo?: string,
    @Query('inspeccionado') inspeccionado?: string,
  ) {
    try {
      const filtros = {
        area,
        tag,
        codigo,
        activo: activo !== undefined ? activo === 'true' : undefined,
        inspeccionado: inspeccionado !== undefined ? inspeccionado === 'true' : undefined,
      };

      return await this.extintorService.findWithFilters(filtros);
    } catch (error) {
      throw new HttpException(
        'Error al obtener extintores filtrados',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('tag/:tag')
  async findByTag(@Param('tag') tag: string) {
    try {
      console.log('Buscando extintores para el tag:', tag);
      const resultado = await this.extintorService.findByTag(tag);
      console.log('Extintores encontrados:', resultado.extintores);

      return {
        success: true,
        extintores: resultado.extintores,
        count: resultado.extintores.length,
        totalExtintoresActivosArea: resultado.totalActivosArea,
      };
    } catch (error) {
      console.error('Error en findByTag:', error);
      throw new HttpException(
        error.message || 'Error al buscar extintores',
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

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateExtintorDto: UpdateExtintorDto,
  ) {
    try {
      return await this.extintorService.update(id, updateExtintorDto);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al actualizar extintor',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const resultado = await this.extintorService.remove(id);
      return {
        success: true,
        message: 'Extintor eliminado correctamente',
        ...resultado,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al eliminar extintor',
        HttpStatus.BAD_REQUEST,
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

  // Marcar extintores como inspeccionados
  @Put('marcar-inspeccionados')
  async marcarComoInspeccionados(
    @Body('codigosExtintores') codigosExtintores: string[],
  ) {
    try {
      const resultado = await this.extintorService.marcarExtintoresComoInspeccionados(
        codigosExtintores,
      );
      return resultado;
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al marcar extintores como inspeccionados',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Resetear estado de inspección
  @Put('resetear-inspeccion')
  async resetearInspeccion(
    @Body('codigosExtintores') codigosExtintores?: string[],
  ) {
    try {
      const resultado = await this.extintorService.resetearEstadoInspeccionado(
        codigosExtintores,
      );
      return resultado;
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al resetear estado de inspección',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Verificar y crear extintores
  @Post('verificar-crear')
  async verificarYCrear(
    @Body('extintores') extintores: any[],
    @Body('tag') tag: string,
    @Body('area') area: string,
  ) {
    try {
      const resultado = await this.extintorService.verificarYCrearExtintores(
        extintores,
        tag,
        area,
      );
      return resultado;
    } catch (error) {
      throw new HttpException(
        error.message || 'Error al verificar y crear extintores',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}