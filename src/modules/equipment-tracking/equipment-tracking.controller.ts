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
  HttpStatus 
} from '@nestjs/common';
import { EquipmentTrackingService } from './equipment-tracking.service';
import { Resource } from 'nest-keycloak-connect';


@Resource('equipment-tracking')
@Controller('equipment-tracking')
export class EquipmentTrackingController {
  constructor(private readonly equipmentTrackingService: EquipmentTrackingService) {}

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
    return this.equipmentTrackingService.resetPreUsoCounter(equipmentId, templateCode);
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