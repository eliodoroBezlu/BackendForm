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
import { PublicarRevisionDto } from '../../common/versionado/publicar-revision.dto';

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
  create(
    @Body() createTemplateDto: CreateTemplateHerraEquipoDto,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templateHerraEquiposService.create(createTemplateDto, usuario);
  }

  /**
   * El catálogo se acota según los roles del usuario: los restringidos solo
   * reciben las plantillas que los declaran en `rolesVisibles`.
   */
  @Get()
  findAll(
    @CurrentUser('roles') roles?: string[],
    @Query('type') type?: string,
    @Query('incluirBorradores') incluirBorradores?: string,
  ) {
    return this.templateHerraEquiposService.findAll(
      { type, incluirBorradores: incluirBorradores === 'true' },
      roles,
    );
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

  /** Todas las revisiones de un código, de la más nueva a la más vieja. */
  @Get('code/:code/historial')
  historial(@Param('code') code: string) {
    return this.templateHerraEquiposService.versionado.historial(code);
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

  /** Si la revisión se puede editar en el lugar, y si no, por qué. */
  @Get(':id/estado-edicion')
  estadoEdicion(@Param('id') id: string) {
    return this.templateHerraEquiposService.versionado.estadoEdicion(id);
  }

  /** Clona la revisión vigente como borrador de la siguiente. */
  @Post(':id/nueva-revision')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  nuevaRevision(
    @Param('id') id: string,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templateHerraEquiposService.versionado.crearRevision(
      id,
      usuario ?? 'desconocido',
    );
  }

  /** El borrador pasa a vigente y la vigente anterior a obsoleta. */
  @Post(':id/publicar')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  publicar(
    @Param('id') id: string,
    @Body() dto: PublicarRevisionDto,
    @CurrentUser('username') usuario?: string,
  ) {
    return this.templateHerraEquiposService.versionado.publicar(
      id,
      dto.motivoCambio,
      usuario ?? 'desconocido',
    );
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
  remove(@Param('id') id: string, @CurrentUser('username') usuario?: string) {
    return this.templateHerraEquiposService.remove(
      id,
      usuario ?? 'desconocido',
    );
  }
}
