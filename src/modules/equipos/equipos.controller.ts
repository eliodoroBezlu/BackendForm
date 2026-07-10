import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EquiposService } from './equipos.service';
import { MigracionService } from './migracion.service';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { Permission } from '../auth/enums/permission.enum';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('equipos')
export class EquiposController {
  constructor(
    private readonly equiposService: EquiposService,
    private readonly migracionService: MigracionService,
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
  remove(@Param('id') id: string) {
    return this.equiposService.remove(id);
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
}
