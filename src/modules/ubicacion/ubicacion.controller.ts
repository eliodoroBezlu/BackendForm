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
import { UbicacionService } from './ubicacion.service';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { Permission } from '../auth/enums/permission.enum';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN)
@Controller('ubicaciones')
export class UbicacionController {
  constructor(private readonly ubicacionService: UbicacionService) {}

  @Post()
  @Permissions(Permission.MANAGE_SETTINGS)
  create(@Body() createDto: CreateUbicacionDto) {
    return this.ubicacionService.create(createDto);
  }

  @Get()
  findAll() {
    return this.ubicacionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ubicacionService.findOne(id);
  }

  @Patch(':id')
  @Permissions(Permission.MANAGE_SETTINGS)
  update(@Param('id') id: string, @Body() updateDto: UpdateUbicacionDto) {
    return this.ubicacionService.update(id, updateDto);
  }

  @Delete(':id')
  @Permissions(Permission.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.ubicacionService.remove(id);
  }
}
