import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlantillaMedicionDto } from './dto/plantilla-medicion.dto';
import { PlantillasMedicionService } from './plantillas-medicion.service';

/**
 * Las grillas de medición de espesores por tag y técnica. Mismo rol
 * exclusivo que el resto del módulo.
 */
@Controller('monitoreo-equipos/plantillas-medicion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MONITOREO_CONFIABILIDAD)
export class PlantillasMedicionController {
  constructor(private readonly plantillas: PlantillasMedicionService) {}

  @Get()
  listar() {
    return this.plantillas.listar();
  }

  @Post()
  crear(
    @Body() dto: PlantillaMedicionDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.plantillas.crear(dto, usuario);
  }

  @Put(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: PlantillaMedicionDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.plantillas.actualizar(id, dto, usuario);
  }

  /** Los reportes ya creados conservan su copia de la grilla. */
  @Delete(':id')
  eliminar(@Param('id') id: string) {
    return this.plantillas.eliminar(id);
  }
}
