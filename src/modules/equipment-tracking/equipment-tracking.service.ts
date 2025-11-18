
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  EquipmentInspectionTracking, 
  EquipmentInspectionTrackingDocument 
} from './schemas/equipment-tracking.schema';
import { TemplateConfigService } from './template-config.service';
import { RegisterInspectionParams, RegisterInspectionResult } from './types/inspection-frequency.type';

@Injectable()
export class EquipmentTrackingService {
  private readonly logger = new Logger(EquipmentTrackingService.name);

  constructor(
    @InjectModel(EquipmentInspectionTracking.name)
    private trackingModel: Model<EquipmentInspectionTrackingDocument>,
    private templateConfigService: TemplateConfigService,
  ) {}

  // ============================================
  // ✅ VERIFICACIÓN DE TAG Y DECISIÓN DE FORMULARIO
  // ============================================
  
  async checkEquipmentStatus(params: {
  equipmentId: string;
  requestedTemplateCode: string;
}): Promise<{
  canProceed: boolean;
  openForm: string;
  message: string;
  shouldRedirect: boolean;
  trackingData?: {
    preUsoCount?: number;
    usageInterval?: number;
    remainingUses?: number;
    lastInspection?: Date;
  };
}> {
  const { equipmentId, requestedTemplateCode } = params;

  this.logger.log(`🔍 Verificando TAG: ${equipmentId} para form: ${requestedTemplateCode}`);

  const config = this.templateConfigService.getConfig(requestedTemplateCode);

  // ============================================
  // CASO 1: INSPECCIÓN FRECUENTE (F25)
  // ============================================
  if (config.type === 'frecuente') {
    this.logger.log(`🔄 [FRECUENTE] Procesando form: ${requestedTemplateCode}`);
    
    // Buscar tracking del pre-uso relacionado
    const preUsoTemplateCode = config.linkedFormCode || '3.04.P37.F24';
    
    const tracking = await this.trackingModel
      .findOne({
        equipmentId,
        templateCode: preUsoTemplateCode,
      })
      .exec();

    // Si no existe tracking → REDIRIGIR a pre-uso
    if (!tracking) {
      this.logger.warn(`⚠️ ${equipmentId} sin historial → REDIRIGIR a pre-uso`);
      
      return {
        canProceed: true, // ✅ CAMBIAR a true para permitir redirección
        openForm: preUsoTemplateCode,
        shouldRedirect: true,
        message: `El equipo ${equipmentId} no tiene historial de pre-usos. Redirigiendo a inspección pre-uso.`,
      };
    }

    // Si NO requiere frecuente → REDIRIGIR a pre-uso
    if (!tracking.needsFrecuenteInspection) {
      const remainingUses = Math.max(0, (config.usageInterval || 6) - (tracking.preUsoCount || 0));
      
      this.logger.warn(`⚠️ ${equipmentId} solo tiene ${tracking.preUsoCount} pre-usos → REDIRIGIR`);
      
      return {
        canProceed: true, // ✅ CAMBIAR a true para permitir redirección
        openForm: preUsoTemplateCode,
        shouldRedirect: true,
        message: `El equipo ${equipmentId} tiene ${tracking.preUsoCount}/${config.usageInterval || 6} pre-usos (faltan ${remainingUses}). Redirigiendo a inspección pre-uso.`,
        trackingData: {
          preUsoCount: tracking.preUsoCount,
          usageInterval: config.usageInterval || 6,
          remainingUses,
        },
      };
    }

    // ✅ SÍ requiere frecuente → PERMITIR continuar con F25
    this.logger.log(`✅ ${equipmentId} requiere frecuente → PERMITIR`);
    
    return {
      canProceed: true,
      openForm: requestedTemplateCode,
      shouldRedirect: false,
      message: `El equipo ${equipmentId} ha alcanzado ${tracking.preUsoCount} pre-usos. Puede realizar la inspección frecuente.`,
      trackingData: {
        preUsoCount: tracking.preUsoCount,
        usageInterval: config.usageInterval || 6,
        lastInspection: tracking.lastInspectionDate,
      },
    };
  }

  // ============================================
  // CASO 2: PRE-USO CON CONTADOR (F24)
  // ============================================
  if (config.type === 'pre-uso-contador') {
    const tracking = await this.trackingModel
      .findOne({
        equipmentId,
        templateCode: requestedTemplateCode,
      })
      .exec();

    // Si no existe tracking → Primera vez → Permitir PRE-USO
    if (!tracking) {
      this.logger.log(`✅ Equipo ${equipmentId} nuevo → Permitir pre-uso`);
      
      return {
        canProceed: true,
        openForm: requestedTemplateCode,
        shouldRedirect: false,
        message: `Equipo ${equipmentId} será registrado al completar la inspección`,
        trackingData: {
          preUsoCount: 0,
          usageInterval: config.usageInterval || 6,
          remainingUses: config.usageInterval || 6,
        },
      };
    }

    // Si requiere inspección frecuente → REDIRIGIR a frecuente
    if (tracking.needsFrecuenteInspection) {
      const frecuenteFormCode = config.linkedFormCode || '3.04.P37.F25';
      
      this.logger.warn(`⚠️ ${equipmentId} requiere FRECUENTE → REDIRIGIR a ${frecuenteFormCode}`);
      
      return {
        canProceed: true, // ✅ CAMBIAR a true para permitir redirección
        openForm: frecuenteFormCode,
        shouldRedirect: true,
        message: `El equipo ${equipmentId} ha alcanzado ${tracking.preUsoCount} pre-usos. Debe realizar inspección frecuente.`,
        trackingData: {
          preUsoCount: tracking.preUsoCount,
          usageInterval: config.usageInterval || 6,
          lastInspection: tracking.lastInspectionDate,
        },
      };
    }

    // Puede hacer pre-uso → Permitir
    const remainingUses = Math.max(0, (config.usageInterval || 6) - (tracking.preUsoCount || 0));
    
    this.logger.log(`✅ ${equipmentId} puede hacer pre-uso (${tracking.preUsoCount}/${config.usageInterval || 6})`);
    
    return {
      canProceed: true,
      openForm: requestedTemplateCode,
      shouldRedirect: false,
      message: `Equipo ${equipmentId}: ${tracking.preUsoCount}/${config.usageInterval || 6} pre-usos realizados. Faltan ${remainingUses} para inspección frecuente.`,
      trackingData: {
        preUsoCount: tracking.preUsoCount,
        usageInterval: config.usageInterval || 6,
        remainingUses,
      },
    };
  }

  // ============================================
  // CASO 3: FORMULARIOS SIN TRACKING ESPECIAL
  // ============================================
  if (config.type === 'pre-uso' || config.type === 'diaria') {
    this.logger.log(`✅ Form ${requestedTemplateCode} no requiere verificación especial`);
    
    return {
      canProceed: true,
      openForm: requestedTemplateCode,
      shouldRedirect: false,
      message: 'Puede proceder con la inspección',
    };
  }

  // ============================================
  // CASO 4: FORMULARIOS PERIÓDICOS
  // ============================================
  this.logger.log(`✅ Form periódico ${requestedTemplateCode} → Permitir directo`);
  
  return {
    canProceed: true,
    openForm: requestedTemplateCode,
    shouldRedirect: false,
    message: 'Puede proceder con la inspección periódica',
  };
}

  // ============================================
  // ✅ REGISTRAR INSPECCIÓN CON TRACKING AUTOMÁTICO
  // ============================================
  
  async registerInspectionWithAutoTracking(
    params: RegisterInspectionParams
  ): Promise<RegisterInspectionResult> {
    const { inspectionId, templateCode, verificationData, inspectorName } = params;

    const config = this.templateConfigService.getConfig(templateCode);

    // Extraer equipmentId del formulario
    const equipmentId = this.extractEquipmentId(
      verificationData,
      config.equipmentFieldName
    );

    if (!equipmentId) {
      throw new BadRequestException(
        `Campo ${config.equipmentFieldName} no encontrado en el formulario`
      );
    }

    this.logger.log(`📝 Registrando inspección ${inspectionId} para equipo: ${equipmentId}`);

    // Buscar o crear tracking
    let tracking = await this.trackingModel
      .findOne({ equipmentId, templateCode })
      .exec();

    let isNewEquipment = false;

    if (!tracking) {
      this.logger.warn(`⚠️ Creando tracking automático para ${equipmentId}`);
      
      tracking = new this.trackingModel({
        equipmentId,
        equipmentName: this.extractEquipmentName(verificationData),
        equipmentType: this.inferEquipmentType(templateCode),
        templateCode,
        equipmentMetadata: this.extractMetadata(verificationData),
        status: 'ok',
      });

      isNewEquipment = true;
    }

    // Procesar según tipo de frecuencia
    let needsFrecuente = false;
    let message = '';

    switch (config.type) {
      case 'pre-uso-contador':
        const result = await this.handlePreUsoContador(
          tracking,
          inspectionId,
          inspectorName || 'Sin nombre',
          config.usageInterval || 6
        );
        needsFrecuente = result.needsFrecuente;
        message = result.message;
        break;

      case 'mensual':
      case 'semanal':
      case 'quincenal':
      case 'anual':
      case 'periodica':
        message = await this.handlePeriodic(
          tracking,
          inspectionId,
          config.intervalDays || 30
        );
        break;

      case 'pre-uso':
      case 'diaria':
      default:
        message = await this.handleSimple(tracking, inspectionId);
        break;
    }

    await tracking.save();

    this.logger.log(`✅ ${message}`);

    return {
      success: true,
      tracking,
      isNewEquipment,
      needsFrecuenteInspection: needsFrecuente,
      message,
    };
  }

  // ============================================
  // ✅ RESETEAR CONTADOR (después de frecuente)
  // ============================================
  
  async resetPreUsoCounter(equipmentId: string, templateCode: string): Promise<any> {
    const tracking = await this.trackingModel.findOne({ equipmentId, templateCode });

    if (!tracking) {
      throw new NotFoundException(`Tracking no encontrado para ${equipmentId}`);
    }

    tracking.preUsoCount = 0;
    tracking.preUsoInspections = [];
    tracking.needsFrecuenteInspection = false;
    tracking.status = 'ok';

    await tracking.save();

    this.logger.log(`🔄 Contador de ${equipmentId} reseteado a 0`);

    return {
      success: true,
      message: `Contador reseteado para ${equipmentId}`,
      tracking,
    };
  }

  // ============================================
  // MÉTODOS INTERNOS
  // ============================================

  private async handlePreUsoContador(
    tracking: EquipmentInspectionTrackingDocument,
    inspectionId: string,
    inspectorName: string,
    usageInterval: number
  ): Promise<{ needsFrecuente: boolean; message: string }> {
    if (!tracking.preUsoInspections) {
      tracking.preUsoInspections = [];
      tracking.preUsoCount = 0;
    }

    tracking.preUsoInspections.push({
      inspectionId,
      date: new Date(),
      inspector: inspectorName,
    });

    tracking.preUsoCount = (tracking.preUsoCount || 0) + 1;
    tracking.lastInspectionDate = new Date();

    if (tracking.preUsoCount >= usageInterval) {
      tracking.needsFrecuenteInspection = true;
      tracking.status = 'requires-frecuente';

      return {
        needsFrecuente: true,
        message: `⚠️ ${tracking.equipmentId} requiere inspección FRECUENTE (${tracking.preUsoCount}/${usageInterval})`,
      };
    }

    tracking.needsFrecuenteInspection = false;
    tracking.status = 'ok';

    return {
      needsFrecuente: false,
      message: `${tracking.equipmentId}: ${tracking.preUsoCount}/${usageInterval} pre-usos`,
    };
  }

  private async handlePeriodic(
    tracking: EquipmentInspectionTrackingDocument,
    inspectionId: string,
    intervalDays: number
  ): Promise<string> {
    tracking.lastInspectionDate = new Date();
    tracking.status = 'ok';

    tracking.nextDueDate = new Date();
    tracking.nextDueDate.setDate(tracking.nextDueDate.getDate() + intervalDays);

    return `${tracking.equipmentId}: Próxima inspección en ${intervalDays} días`;
  }

  private async handleSimple(
    tracking: EquipmentInspectionTrackingDocument,
    inspectionId: string
  ): Promise<string> {
    tracking.lastInspectionDate = new Date();
    tracking.status = 'ok';
    return `${tracking.equipmentId}: Inspección registrada`;
  }

  // ============================================
  // HELPERS
  // ============================================

  private extractEquipmentId(
    verificationData: Record<string, any>,
    fieldName: string
  ): string | null {
    const key = Object.keys(verificationData).find(
      (k) => k.trim().toLowerCase().replace(/\s+/g, '') === 
             fieldName.trim().toLowerCase().replace(/\s+/g, '')
    );

    if (!key) return null;

    const value = verificationData[key];
    return typeof value === 'string' ? value.trim() : String(value);
  }

  private extractEquipmentName(verificationData: Record<string, any>): string {
    const possibleFields = ['DESCRIPCION', 'NOMBRE', 'EQUIPO', 'TIPO'];

    for (const field of possibleFields) {
      const key = Object.keys(verificationData).find(
        (k) => k.trim().toLowerCase() === field.toLowerCase()
      );
      if (key && verificationData[key]) {
        return String(verificationData[key]);
      }
    }

    return 'Sin nombre';
  }

  private inferEquipmentType(templateCode: string): string {
    const typeMap: Record<string, string> = {
      '3.04.P37.F24': 'tecle',
      '3.04.P37.F25': 'tecle',
      '1.02.P06.F39': 'amoladora',
      '1.02.P06.F40': 'esmeril',
      '1.02.P06.F37': 'man-lift',
      '1.02.P06.F33': 'escalera',
      '3.04.P04.F23': 'puente-grua',
      '3.04.P04.F35': 'puente-grua',
      '1.02.P06.F20': 'cilindro-gas',
      '1.02.P06.F42': 'soldadura',
      '2.03.P10.F05': 'taladro',
    };

    return typeMap[templateCode] || 'generico';
  }

  private extractMetadata(verificationData: Record<string, any>): Record<string, string> {
    const metadata: Record<string, string> = {};
    const relevantFields = ['AREA', 'ÁREA', 'MARCA', 'MODELO', 'CAPACIDAD', 'SERIE'];

    for (const field of relevantFields) {
      const key = Object.keys(verificationData).find(
        (k) => k.trim().toLowerCase() === field.toLowerCase()
      );
      if (key && verificationData[key]) {
        metadata[field] = String(verificationData[key]);
      }
    }

    return metadata;
  }

  // ============================================
  // BUSINESS METHODS
  // ============================================

  async getDashboardData(): Promise<any> {
    const trackings = await this.trackingModel.find().exec();
    const now = new Date();

    trackings.forEach((t) => {
      if (t.nextDueDate) {
        const diffTime = t.nextDueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        t.daysUntilDue = diffDays;

        if (diffDays < 0) {
          t.status = 'overdue';
        } else if (diffDays <= 7) {
          t.status = 'due-soon';
        } else if (t.status !== 'requires-frecuente') {
          t.status = 'ok';
        }
      }
    });

    return {
      summary: {
        total: trackings.length,
        ok: trackings.filter((t) => t.status === 'ok').length,
        dueSoon: trackings.filter((t) => t.status === 'due-soon').length,
        overdue: trackings.filter((t) => t.status === 'overdue').length,
        requiresFrecuente: trackings.filter((t) => t.status === 'requires-frecuente').length,
      },
      equipments: trackings.map((t) => ({
        equipmentId: t.equipmentId,
        equipmentName: t.equipmentName,
        equipmentType: t.equipmentType,
        templateCode: t.templateCode,
        status: t.status,
        preUsoCount: t.preUsoCount,
        needsFrecuente: t.needsFrecuenteInspection,
        lastInspection: t.lastInspectionDate,
        nextDue: t.nextDueDate,
        daysUntilDue: t.daysUntilDue,
        metadata: t.equipmentMetadata,
      })),
    };
  }

  async findAll(): Promise<EquipmentInspectionTrackingDocument[]> {
    return this.trackingModel.find().exec();
  }

  async getEquipmentNeedingFrecuente(): Promise<EquipmentInspectionTrackingDocument[]> {
    return this.trackingModel
      .find({ 
        needsFrecuenteInspection: true,
        status: 'requires-frecuente'
      })
      .exec();
  }

  async getEquipmentStats(equipmentId: string): Promise<any> {
    const trackings = await this.trackingModel.find({ equipmentId }).exec();
    
    if (trackings.length === 0) {
      throw new NotFoundException(`No se encontró tracking para el equipo ${equipmentId}`);
    }

    const now = new Date();
    
    trackings.forEach((t) => {
      if (t.nextDueDate) {
        const diffTime = t.nextDueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        t.daysUntilDue = diffDays;

        if (diffDays < 0) {
          t.status = 'overdue';
        } else if (diffDays <= 7) {
          t.status = 'due-soon';
        } else if (t.status !== 'requires-frecuente') {
          t.status = 'ok';
        }
      }
    });

    return {
      equipmentId,
      totalTrackings: trackings.length,
      trackings: trackings.map(t => ({
        templateCode: t.templateCode,
        equipmentType: t.equipmentType,
        status: t.status,
        preUsoCount: t.preUsoCount,
        needsFrecuente: t.needsFrecuenteInspection,
        lastInspection: t.lastInspectionDate,
        nextDue: t.nextDueDate,
        daysUntilDue: t.daysUntilDue,
        metadata: t.equipmentMetadata
      }))
    };
  }
}