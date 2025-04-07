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
} from '@nestjs/common';
import { Response } from 'express';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { InspeccionesEmergenciaExcelService } from './inspecciones-emergencia-excel/inspecciones-emergencia-excel.service'
@Controller('inspecciones-emergencia')
export class InspeccionesEmergenciaController {
  constructor(
    private readonly inspeccionesEmergenciaService: InspeccionesEmergenciaService,
    private readonly formularioInspeccionEmergencia: InspeccionesEmergenciaExcelService,
  ) {}

  @Post('crear-formulario')
  async crearFormulario(@Body() createInspeccionesDto: CreateFormularioInspeccionDto) {
    return await this.inspeccionesEmergenciaService.create(createInspeccionesDto);
  }

  @Put('actualizar-mes/:tag')
  async actualizarMes(
  @Param('tag') tag: string,
  @Body() body: { mes: string; datosMes: any },
) {
  const { mes, datosMes } = body;
  const resultado = await this.inspeccionesEmergenciaService.actualizarMesPorTag(tag, mes, datosMes);
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
  findAll() {
    return this.inspeccionesEmergenciaService.findAll();
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
      @Body() body: { extintores: any[] }
    ) {
      const { extintores } = body;
      return await this.inspeccionesEmergenciaService.actualizarExtintoresPorTag(tag, extintores);
    }
}
