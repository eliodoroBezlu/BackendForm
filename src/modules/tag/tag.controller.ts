import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  BadRequestException 
} from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { OrdenTrabajo } from './schema/tag.schema';

@Controller('tag')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  async create(@Body() createDto: CreateTagDto): Promise<OrdenTrabajo> {
    return this.tagService.create(createDto);
  }

  @Get('por-area')
  async findTagByArea(@Query('area') area: string) {
    if (!area) {
      throw new BadRequestException('Se requiere especificar un área');
    }
    const tags = await this.tagService.findByArea(area);
    // Devuelve directamente el array de tags
    return tags;
  }

  @Get()
  findAll() {
    return this.tagService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tagService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagService.update(id, updateTagDto);
  }

  @Patch(':id/desactivar')
  async desactivar(@Param('id') id: string) {
    return this.tagService.desactivar(id);
  }

  @Patch(':id/activar')
  async activar(@Param('id') id: string) {
    return this.tagService.activar(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tagService.remove(id);
  }
}