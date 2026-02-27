import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Put,
  Query,
  Request,
  UseGuards
} from '@nestjs/common';
import { SuperintendenciaService } from './superintendencia.service';
import { CreateSuperintendenciaDto } from './dto/create-superintendencia.dto';
import { UpdateSuperintendenciaDto } from './dto/update-superintendencia.dto';
import { Resource } from 'nest-keycloak-connect';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('superintendencia')
export class SuperintendenciaController {
  constructor(private readonly superintendenciaService: SuperintendenciaService) {}

  @Post()
  async create(
    @Body() createSuperintendenciaDto: CreateSuperintendenciaDto,
    @Request() req: any
  ) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.superintendenciaService.create(createSuperintendenciaDto, usuario);
  }

  @Get('buscar')
  async buscarSuperintendencias(@Query('query') query: string): Promise<string[]> {
    return this.superintendenciaService.buscarSuperintendencia(query);
  }

  @Get()
  async findAll() {
    return this.superintendenciaService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.superintendenciaService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string, 
    @Body() updateSuperintendenciaDto: UpdateSuperintendenciaDto,
    @Request() req: any
  ) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.superintendenciaService.update(id, updateSuperintendenciaDto, usuario);
  }

  @Put('desactivar/:id')
  async desactivar(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.superintendenciaService.desactivar(id, usuario);
  }

  @Put('activar/:id')
  async activar(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.superintendenciaService.activar(id, usuario);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.superintendenciaService.remove(id);
  }
}