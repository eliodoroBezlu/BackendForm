import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Res,
  Put,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { InspeccionesEmergenciaExcelService } from './inspecciones-emergencia-excel/inspecciones-emergencia-excel.service'
import { ExtintorService } from '../extintor/extintor.service';
@Controller('inspecciones-emergencia')
export class InspeccionesEmergenciaController {
  constructor(
    private readonly inspeccionesEmergenciaService: InspeccionesEmergenciaService,
    private readonly formularioInspeccionEmergencia: InspeccionesEmergenciaExcelService,
    private readonly extintorService: ExtintorService,
  ) {}

  @Post('crear-formulario')
  async crearFormulario(@Body() createInspeccionesDto: CreateFormularioInspeccionDto) {
    console.log('Datos recibidos:', JSON.stringify(createInspeccionesDto, null, 2));
    console.log('Claves de meses:', Object.keys(createInspeccionesDto.meses || {}));
  
    return await this.inspeccionesEmergenciaService.create(createInspeccionesDto);
  }

  @Put('actualizar-mes/:tag')
  async actualizarMes(
  @Param('tag') tag: string,
  @Body() body: { mes: string; datosMes: any ; area: string },
) {
  const { mes, datosMes, area } = body;
  const resultado = await this.inspeccionesEmergenciaService.actualizarMesPorTag(tag, mes, datosMes, area);
  return resultado; // Devuelve { success: true, message: "Mes actualizado correctamente" }
}

@Post('verificar-tag')
async verificarTag(
  @Body() body: { tag: string; periodo: string; año: number; area: string },
) {
  const { tag, periodo, año, area } = body;
  return await this.inspeccionesEmergenciaService.verificarTag(
    tag,
    periodo,
    año,
    area,
  );
}

  @Get(":id/excel")
    async downloadExcel(@Param("id") id: string, @Res() res: Response) {
      try {
        const inspeccion = await this.inspeccionesEmergenciaService.findOne(id)
        if (!inspeccion) {
          return res.status(404).json({ message: "Inspección no encontrada" })
        }
  
        // Usar el método para una sola inspección
        const buffer = await this.formularioInspeccionEmergencia.generateExcelSingle(inspeccion)
  
        res.set({
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename=inspeccion-${id}.xlsx`,
          "Content-Length": buffer.length,
        })
  
        res.send(buffer)
      } catch (error) {
        console.error("Error al generar Excel:", error)
        res.status(500).json({ message: "Error al generar el archivo Excel" })
      }
    }
  
  @Get()
  findAll(
    @Query('area') area?: string,
    @Query('superintendencia') superintendencia?: string,
    @Query('mesActual') mesActual?: string,
    @Query('documentCode') documentCode?: string,
  ) {
    const filtros = {
      area,
      superintendencia,
      mesActual,
      documentCode,
    };
    
    return this.inspeccionesEmergenciaService.findAll(filtros);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInspeccionesEmergenciaDto: UpdateInspeccionesEmergenciaDto) {
    return this.inspeccionesEmergenciaService.update(+id, updateInspeccionesEmergenciaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inspeccionesEmergenciaService.remove(+id);
  }

  // En inspecciones-emergencia.controller.ts
@Put('actualizar-extintores/:tag')
async actualizarExtintores(
  @Param('tag') tag: string,
  @Body() body: { extintores: any[], area: string }
) {
    try {
      
      const { extintores, area } = body;

       if (!area) {
      throw new HttpException(
        'El área es requerida para actualizar extintores',
        HttpStatus.BAD_REQUEST
      );
    }
    console.log(`Actualizando extintores para tag: ${tag}, área: ${area}`);
      
      // Verificar y crear automáticamente solo los extintores que no existen
      await this.extintorService.verificarYCrearExtintores(extintores, tag, area);
      
      // Actualizar el formulario con todos los extintores
      const resultadoActualizacion = await this.inspeccionesEmergenciaService.actualizarExtintoresPorTag(tag, extintores, area);
      
      return {
        exito: true,
        actualizacion: resultadoActualizacion
      };
    } catch (error) {
      console.error('Error al actualizar extintores:', error);
      throw new HttpException(
        error.message || 'Error al actualizar extintores',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('verificar-inspecciones')
  async verificarInspecciones(
    @Query('area') area: string,
    @Query('mesActual') mesActual: string,
  ) {
    if (!area || !mesActual) {
      throw new HttpException(
        'Los parámetros area y mesActual son requeridos',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.inspeccionesEmergenciaService.verificarInspecciones(area, mesActual);
  }
}
