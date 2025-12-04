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
  Request
} from '@nestjs/common';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Resource } from 'nest-keycloak-connect';

@Resource('area')
@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Post()
  async create(
    @Body() createAreaDto: CreateAreaDto,
    @Request() req: any
  ) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.areaService.create(createAreaDto, usuario);
  }

  @Get('buscar')
  async buscarAreas(@Query('query') query: string): Promise<string[]> {
    return this.areaService.buscarArea(query);
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
    @Request() req: any
  ) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.areaService.update(id, updateAreaDto, usuario);
  }

  @Put('desactivar/:id')
  async desactivar(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.areaService.desactivar(id, usuario);
  }

  @Put('activar/:id')
  async activar(@Param('id') id: string, @Request() req: any) {
    const usuario = req.user?.preferred_username || 'Sistema';
    return this.areaService.activar(id, usuario);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.areaService.remove(id);
  }
}