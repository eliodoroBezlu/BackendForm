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
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto';
import { Trabajador } from './schema/trabajador.schema';

@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

  @Post()
  async create(
    @Body() createTrabajadorDto: CreateTrabajadorDto,
  ): Promise<Trabajador> {
    return this.trabajadoresService.create(createTrabajadorDto);
  }

  @Get('buscar')
  async buscarTrabajadores(
    @Query('query') query: string,
  ): Promise<Trabajador[]> {
    return this.trabajadoresService.buscarTrabajadores(query);
  }

  @Get()
  findAll() {
    return this.trabajadoresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trabajadoresService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTrabajadoreDto: UpdateTrabajadorDto,
  ) {
    return this.trabajadoresService.update(+id, updateTrabajadoreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.trabajadoresService.remove(+id);
  }
}
