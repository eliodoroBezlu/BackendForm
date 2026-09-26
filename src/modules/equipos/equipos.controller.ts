import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { EquiposService } from './equipos.service';
import { MigracionService } from './migracion.service';
import { EquiposExcelService } from './equipos-excel.service';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';
import { ExportarEquiposDto } from './dto/exportar-equipos.dto';
import {
  buildContentDispositionHeader,
  sanitizePart,
} from '../../common/utils/download-filename.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { Permission } from '../auth/enums/permission.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('equipos')
export class EquiposController {
  constructor(
    private readonly equiposService: EquiposService,
    private readonly migracionService: MigracionService,
    private readonly equiposExcelService: EquiposExcelService,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @Permissions(Permission.MANAGE_SETTINGS)
  create(@Body() createDto: CreateEquipoDto) {
    return this.equiposService.create(createDto);
  }

  @Get()
  @Roles(
    Role.ADMIN,
    Role.TECNICO,
    Role.SUPERVISOR,
    Role.SUPERINTENDENTE,
    Role.INSPECTOR,
  )
  findAll() {
    return this.equiposService.findAll();
  }

  @Get(':id')
  @Roles(
    Role.ADMIN,
    Role.TECNICO,
    Role.SUPERVISOR,
    Role.SUPERINTENDENTE,
    Role.INSPECTOR,
  )
  findOne(@Param('id') id: string) {
    return this.equiposService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @Permissions(Permission.MANAGE_SETTINGS)
  update(@Param('id') id: string, @Body() updateDto: UpdateEquipoDto) {
    return this.equiposService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @Permissions(Permission.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser('username') usuario?: string) {
    return this.equiposService.remove(id, usuario ?? 'desconocido');
  }

  @Post('migrar-excel')
  @Roles(Role.ADMIN)
  @Permissions(Permission.MANAGE_SETTINGS)
  @UseInterceptors(FileInterceptor('file'))
  async migrarExcel(@UploadedFile() file?: Express.Multer.File) {
    if (file) {
      // Si suben un archivo por HTTP, procesar el buffer
      return await this.migracionService.ejecutarMigracionDesdeBuffer(
        file.buffer,
      );
    } else {
      // De lo contrario, procesar el archivo local del servidor en src/templates/Inventario.xlsx
      return await this.migracionService.ejecutarMigracionDesdePath();
    }
  }

  /**
   * Exporta a Excel el lote de equipos que el frontend ya filtró en
   * pantalla — mismo nivel de permiso que crear/editar/borrar, porque el
   * inventario incluye costos. Si el lote mezcla `tipo_equipo` distintos,
   * `EquiposExcelService` arma una hoja por tipo en vez de mezclar columnas
   * incompatibles en una sola hoja.
   */
  @Post('exportar-excel')
  @Roles(Role.ADMIN)
  @Permissions(Permission.MANAGE_SETTINGS)
  async exportarExcel(@Body() dto: ExportarEquiposDto, @Res() res: Response) {
    const equipos = await this.equiposService.findByIds(dto.ids);
    const { buffer, tipos } = await this.equiposExcelService.generar(equipos);

    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo =
      tipos.length === 1
        ? `inventario_${sanitizePart(tipos[0])}_${fecha}.xlsx`
        : `inventario_completo_${fecha}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': buildContentDispositionHeader(nombreArchivo),
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
