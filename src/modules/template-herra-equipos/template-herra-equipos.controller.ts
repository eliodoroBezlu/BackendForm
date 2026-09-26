import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { CreateTemplateHerraEquipoDto } from './dto/create-template-herra-equipo.dto';
import { UpdateTemplateHerraEquipoDto } from './dto/update-template-herra-equipo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('template-herra-equipos')
export class TemplateHerraEquiposController {
  constructor(
    private readonly templateHerraEquiposService: TemplateHerraEquiposService,
  ) {}

  /**
   * Crear la *estructura* de un formulario es exclusivo de admin: llenar
   * inspecciones es otra cosa y la puede hacer cualquier rol con acceso a
   * la plantilla.
   */
  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTemplateDto: CreateTemplateHerraEquipoDto) {
    return this.templateHerraEquiposService.create(createTemplateDto);
  }

  /**
   * El catálogo se acota según los roles del usuario: los restringidos solo
   * reciben las plantillas que los declaran en `rolesVisibles`.
   */
  @Get()
  findAll(
    @CurrentUser('roles') roles?: string[],
    @Query('type') type?: string,
  ) {
    return this.templateHerraEquiposService.findAll({ type }, roles);
  }

  @Get('search')
  search(
    @Query('q') searchTerm: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.templateHerraEquiposService.search(searchTerm, roles);
  }

  @Get('count')
  count(@CurrentUser('roles') roles?: string[], @Query('type') type?: string) {
    return this.templateHerraEquiposService.count({ type }, roles);
  }

  @Get('code/:code')
  findByCode(
    @Param('code') code: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.templateHerraEquiposService.findByCode(code, roles);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('roles') roles?: string[]) {
    return this.templateHerraEquiposService.findOne(id, roles);
  }

  /** Editar la estructura de una plantilla: solo admin. */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateHerraEquipoDto,
  ) {
    return this.templateHerraEquiposService.update(id, updateTemplateDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templateHerraEquiposService.remove(
      id,
      usuario ?? 'desconocido',
    );
  }
}
