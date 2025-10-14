import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('trabajadores')
@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

  @Post()
  @ApiOperation({ summary: 'Crear trabajador' })
  @ApiResponse({ status: 201, description: 'Trabajador creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async create(@Body() createTrabajadorDto: CreateTrabajadorDto) {
    return this.trabajadoresService.create(createTrabajadorDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los trabajadores' })
  @ApiResponse({ status: 200, description: 'Lista de trabajadores' })
  findAll() {
    return this.trabajadoresService.findAll();
  }

  @Get('nombres/all')
  @ApiOperation({ summary: 'Obtener solo nombres de todos los trabajadores (para autocomplete)' })
  @ApiResponse({ status: 200, description: 'Lista de nombres de trabajadores' })
  async findAllNames(): Promise<string[]> {
    return this.trabajadoresService.findAllNames();
  }

  @Get('buscar/autocomplete')
  @ApiOperation({ summary: 'Buscar trabajadores y devolver solo nombres (para autocomplete)' })
  @ApiResponse({ status: 200, description: 'Nombres de trabajadores encontrados' })
  async buscarTrabajadoresNames(@Query('query') query: string): Promise<string[]> {
    return this.trabajadoresService.buscarTrabajadoresNames(query);
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Buscar trabajadores por nómina o CI' })
  @ApiResponse({ status: 200, description: 'Trabajadores encontrados' })
  async buscarTrabajadores(@Query('query') query: string) {
    return this.trabajadoresService.buscarTrabajadores(query);
  }

  // ⚠️ IMPORTANTE: Este endpoint DEBE ir ANTES de @Get(':id')
  @Get('completos')
  @ApiOperation({ summary: 'Obtener trabajadores completos (nomina, CI, puesto)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de trabajadores con nomina, CI y puesto',
    schema: {
      example: [
        { nomina: "Juan Pérez", ci: "12345678", puesto: "Ingeniero" },
        { nomina: "María López", ci: "87654321", puesto: "Supervisor" }
      ]
    }
  })
  async findAllCompletos() {
    return this.trabajadoresService.findAllCompletos();
  }

  // ⚠️ Este endpoint DEBE ir al FINAL porque captura cualquier string como :id
  @Get(':id')
  @ApiOperation({ summary: 'Obtener trabajador por ID' })
  @ApiResponse({ status: 200, description: 'Trabajador encontrado' })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  findOne(@Param('id') id: string) {
    return this.trabajadoresService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar trabajador' })
  @ApiResponse({ status: 200, description: 'Trabajador actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  update(@Param('id') id: string, @Body() updateTrabajadorDto: any) {
    return this.trabajadoresService.update(id, updateTrabajadorDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar trabajador' })
  @ApiResponse({ status: 200, description: 'Trabajador eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Trabajador no encontrado' })
  remove(@Param('id') id: string) {
    return this.trabajadoresService.remove(id);
  }
}