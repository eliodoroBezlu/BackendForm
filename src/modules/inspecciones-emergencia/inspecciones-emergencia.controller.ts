import { Controller, Get, Post, Body, Patch, Param, Delete, Put } from '@nestjs/common';
import { InspeccionesEmergenciaService } from './inspecciones-emergencia.service';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';

@Controller('inspecciones-emergencia')
export class InspeccionesEmergenciaController {
  constructor(private readonly inspeccionesEmergenciaService: InspeccionesEmergenciaService) {}

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
    return await this.inspeccionesEmergenciaService.actualizarMesPorTag(tag, mes, datosMes);
  }

  @Post('verificar-tag')
  async verificarTag(@Body() body: { tag: string; periodo: string; año: number }) {
    const { tag, periodo, año } = body;
    return await this.inspeccionesEmergenciaService.verificarTag(tag, periodo, año);
  }
  @Get()
  findAll() {
    return this.inspeccionesEmergenciaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inspeccionesEmergenciaService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInspeccionesEmergenciaDto: UpdateInspeccionesEmergenciaDto) {
    return this.inspeccionesEmergenciaService.update(+id, updateInspeccionesEmergenciaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inspeccionesEmergenciaService.remove(+id);
  }
}
