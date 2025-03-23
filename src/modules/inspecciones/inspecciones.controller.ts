import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UseGuards,
  Res,
  NotFoundException,
  Put,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { InspeccionesService } from './inspecciones.service';
import type { CreateInspeccionDto } from "./dto/create-inspeccion.dto"
import type { UpdateInspeccionDto } from './dto/update-inspeccion.dto'
import { ExcelService } from '../excel/excel.service';

@Controller('inspecciones')
//@UseGuards(JwtAuthGuard)
export class InspeccionesController {
  constructor(
    private readonly inspeccionesService: InspeccionesService,
    private readonly excelService: ExcelService,
  ) {}

  @Post()
  create(@Body() createInspeccionDto: CreateInspeccionDto) {
    return this.inspeccionesService.create(createInspeccionDto);
  }

  
  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.inspeccionesService.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Put(":id")
  update(@Param('id') id: string, @Body() updateInspeccionDto: UpdateInspeccionDto) {
    return this.inspeccionesService.update(id, updateInspeccionDto)
  }

  @Get()
  async findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('superintendencia') superintendencia?: string,
    @Query('operativo') operativo?: 'SI' | 'NO',
    @Query('numInspeccion') numInspeccion?: string,
  ) {
    if (startDate || endDate || superintendencia || operativo || numInspeccion) {
      return this.inspeccionesService.findAllWithFilters({
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        superintendencia,
        operativo,
        numInspeccion,
      })
    }
    return this.inspeccionesService.findAll()
  }


  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      await this.inspeccionesService.remove(id);
      return { message: 'Inspección eliminada con éxito' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(":id/excel")
  async downloadExcel(@Param("id") id: string, @Res() res: Response) {
    try {
      const inspeccion = await this.inspeccionesService.findOne(id)
      if (!inspeccion) {
        return res.status(404).json({ message: "Inspección no encontrada" })
      }

      // Usar el método para una sola inspección
      const buffer = await this.excelService.generateExcelSingle(inspeccion)

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
}
