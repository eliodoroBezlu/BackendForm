import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigFormularioService } from './config-formulario.service';
import { CreateConfigFormularioDto } from './dto/create-config-formulario.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { Permission } from '../auth/enums/permission.enum';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN)
@Controller('config-formulario')
export class ConfigFormularioController {
  constructor(private readonly configService: ConfigFormularioService) {}

  @Post()
  @Permissions(Permission.MANAGE_SETTINGS)
  create(@Body() createDto: CreateConfigFormularioDto) {
    return this.configService.create(createDto);
  }

  @Get()
  findAll() {
    return this.configService.findAll();
  }

  @Get(':tipoEquipo')
  findOne(@Param('tipoEquipo') tipoEquipo: string) {
    return this.configService.findOne(tipoEquipo);
  }

  @Put(':tipoEquipo')
  @Permissions(Permission.MANAGE_SETTINGS)
  update(
    @Param('tipoEquipo') tipoEquipo: string,
    @Body() updateDto: CreateConfigFormularioDto,
  ) {
    return this.configService.update(tipoEquipo, updateDto);
  }

  @Delete(':tipoEquipo')
  @Permissions(Permission.MANAGE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('tipoEquipo') tipoEquipo: string) {
    return this.configService.remove(tipoEquipo);
  }
}
