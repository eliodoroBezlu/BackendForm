import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Post()
  async create(@Body() createAreaDto: CreateAreaDto, @Request() req: any) {
    const usuario = req.user?.username || 'Sistema';
    return this.areaService.create(createAreaDto, usuario);
  }

  @Get('buscar')
  async buscarAreas(@Query('query') query: string): Promise<string[]> {
    return this.areaService.buscarArea(query);
  }

  /**
   * Cada área con su superintendencia y su gerencia.
   *
   * Lo consumen los formularios para deducir esos dos campos del área elegida
   * en vez de pedírselos al inspector. Va antes que `@Get(':id')` a propósito:
   * si estuviera después, Nest tomaría «cadena» por un identificador.
   */
  @Get('cadena')
  async obtenerCadena() {
    return this.areaService.obtenerCadenaOrganizativa();
  }

  @Post('sync')
  async sync() {
    return this.areaService.syncAreasFromIam();
  }

  @Get()
  async findAll() {
    return this.areaService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.areaService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAreaDto: UpdateAreaDto,
    @Request() req: any,
  ) {
    const usuario = req.user?.username || 'Sistema';
    return this.areaService.update(id, updateAreaDto, usuario);
  }

  @Put('desactivar/:id')
  async desactivar(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.username || 'Sistema';
    return this.areaService.desactivar(id, usuario);
  }

  @Put('activar/:id')
  async activar(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.username || 'Sistema';
    return this.areaService.activar(id, usuario);
  }

  /**
   * Da de baja el área. **No la borra**: hay inspecciones, equipos y
   * trabajadores apuntando a ella.
   *
   * Solo administración, como el resto de bajas. El `PUT desactivar/:id` sigue
   * existiendo para el mantenimiento corriente del catálogo.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.username || 'Sistema';
    return this.areaService.remove(id, usuario);
  }

  @Post(':id/restaurar')
  @Roles(Role.ADMIN)
  async restaurar(@Param('id') id: string) {
    return {
      success: true,
      message: 'Área restaurada',
      data: await this.areaService.restaurar(id),
    };
  }
}
