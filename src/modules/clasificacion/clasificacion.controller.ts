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
} from '@nestjs/common';
import { ClasificacionService } from './clasificacion.service';
import { CreateClasificacionDto } from './dto/create-clasificacion.dto';
import { UpdateClasificacionDto } from './dto/update-clasificacion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { Permission } from '../auth/enums/permission.enum';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN)
@Controller('clasificaciones')
export class ClasificacionController {
  constructor(private readonly clasificacionService: ClasificacionService) {}

  @Post()
  @Permissions(Permission.MANAGE_SETTINGS)
  create(@Body() createDto: CreateClasificacionDto) {
    return this.clasificacionService.create(createDto);
  }

  @Get()
  findAll() {
    return this.clasificacionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clasificacionService.findOne(id);
  }

  @Patch(':id')
  @Permissions(Permission.MANAGE_SETTINGS)
  update(@Param('id') id: string, @Body() updateDto: UpdateClasificacionDto) {
    return this.clasificacionService.update(id, updateDto);
  }

  @Delete(':id')
  @Permissions(Permission.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.clasificacionService.remove(id);
  }
}
