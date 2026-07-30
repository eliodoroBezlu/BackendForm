// src/equipment-tracking/equipment-tracking.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { EquipmentTrackingService } from './equipment-tracking.service';
import { Resource } from 'nest-keycloak-connect';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('equipment-tracking')
export class EquipmentTrackingController {
  constructor(
    private readonly equipmentTrackingService: EquipmentTrackingService,
  ) {}

  /**
   * 🔥 ÚNICO ENDPOINT NECESARIO: Verificar TAG
   * GET /equipment-tracking/check-status?equipmentId=TECLE-001&templateCode=3.04.P37.F24
   */
  @Get('check-status')
  @HttpCode(HttpStatus.OK)
  checkEquipmentStatus(
    @Query('equipmentId') equipmentId: string,
    @Query('templateCode') templateCode: string,
  ) {
    return this.equipmentTrackingService.checkEquipmentStatus({
      equipmentId,
      requestedTemplateCode: templateCode,
    });
  }

  @Post('reset-counter/:equipmentId')
  @HttpCode(HttpStatus.OK)
  resetCounter(
    @Param('equipmentId') equipmentId: string,
    @Body('templateCode') templateCode: string,
  ) {
    return this.equipmentTrackingService.resetPreUsoCounter(
      equipmentId,
      templateCode,
    );
  }

  /**
   * 🆕 Disponibilidad de códigos de equipo para un template, según la
   * frecuencia configurada en ese template (si no tiene frecuencia activa,
   * devuelve todos los códigos como disponibles — sin restricción).
   * GET /equipment-tracking/disponibilidad?templateCode=1.02.P06.F33&area=Producción
   */
  @Get('disponibilidad')
  listarDisponibilidad(
    @Query('templateCode') templateCode: string,
    @Query('area') area?: string,
  ) {
    return this.equipmentTrackingService.listarDisponibilidad(
      templateCode,
      area,
    );
  }

  @Get('dashboard')
  getDashboard() {
    return this.equipmentTrackingService.getDashboardData();
  }

  @Get('pending-frecuente')
  getPendingFrecuente() {
    return this.equipmentTrackingService.getEquipmentNeedingFrecuente();
  }

  @Get()
  findAll() {
    return this.equipmentTrackingService.findAll();
  }
}
