import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  InspectionHerraEquipos,
  InspectionHerraEquiposDocument,
} from './schemas/inspection-herra-equipos.schema';
import { CreateInspectionHerraEquipoDto } from './dto/create-inspection-herra-equipo.dto';
import { UpdateInspectionHerraEquipoDto } from './dto/update-inspection-herra-equipo.dto';
import { EquipmentTrackingService } from '../equipment-tracking/equipment-tracking.service';
import { TemplateConfigService } from '../equipment-tracking/template-config.service';
import { InspectionStatus } from './types/IProps';

@Injectable()
export class InspectionsHerraEquiposService {
  private readonly logger = new Logger(InspectionsHerraEquiposService.name);
  constructor(
    @InjectModel(InspectionHerraEquipos.name)
    private inspectionModel: Model<InspectionHerraEquiposDocument>,
    private equipmentTrackingService: EquipmentTrackingService,
    private templateConfigService: TemplateConfigService,
  ) {}

  // ============================================
  // CREAR INSPECCIÓN (Draft o Completed)
  // ============================================
  async create(createDto: CreateInspectionHerraEquipoDto): Promise<any> {
    try {
      this.logger.log(`📝 Creando inspección: ${createDto.templateCode}`);

      const config = this.templateConfigService.getConfig(
        createDto.templateCode,
      );

      // ✅ 1. GUARDAR INSPECCIÓN
      const inspection = new this.inspectionModel({
        ...createDto,
        submittedAt: new Date(createDto.submittedAt),
      });

      const saved = await inspection.save();
      this.logger.log(`✅ Inspección guardada con ID: ${saved._id}`);

      // ✅ 2. SI NO REQUIERE TRACKING, RETORNAR
      if (config.type === 'pre-uso' || config.type === 'diaria') {
        this.logger.log('✅ Inspección sin tracking especial');
        return { inspection: saved };
      }

      // ✅ 3. REGISTRAR EN TRACKING
      const trackingResult =
        await this.equipmentTrackingService.registerInspectionWithAutoTracking({
          inspectionId: String(saved._id),
          templateCode: createDto.templateCode,
          verificationData: createDto.verification,
          inspectorName: createDto.submittedBy,
        });

      this.logger.log(`✅ Tracking registrado: ${trackingResult.message}`);

      // ✅ 4. SI ES FRECUENTE, RESETEAR CONTADOR
      if (config.type === 'frecuente' && config.linkedFormCode) {
        const equipmentId = this.extractEquipmentId(
          createDto.verification,
          config.equipmentFieldName,
        );

        if (equipmentId) {
          await this.equipmentTrackingService.resetPreUsoCounter(
            equipmentId,
            config.linkedFormCode, // El template pre-uso (F24)
          );
          this.logger.log(`🔄 Contador reseteado para ${equipmentId}`);
        }
      }

      return {
        inspection: saved,
        tracking: trackingResult.tracking,
        warning: trackingResult.needsFrecuenteInspection
          ? `⚠️ El equipo requiere inspección FRECUENTE en el próximo uso`
          : null,
      };
    } catch (error) {
      this.logger.error('❌ Error al crear inspección:', error);
      throw error;
    }
  }
  private extractEquipmentId(
    verificationData: Record<string, any>,
    fieldName: string,
  ): string | null {
    const key = Object.keys(verificationData).find(
      (k) =>
        k.trim().toLowerCase().replace(/\s+/g, '') ===
        fieldName.trim().toLowerCase().replace(/\s+/g, ''),
    );

    if (!key) return null;

    const value = verificationData[key];
    return typeof value === 'string' ? value.trim() : String(value);
  }

  async updateInProgress(
    id: string,
    updateDto: Partial<CreateInspectionHerraEquipoDto>
  ): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel.findById(id).exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    // Solo permitir actualizar si está en progreso
    if (inspection.status !== InspectionStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Solo se pueden actualizar inspecciones en progreso'
      );
    }

    // Actualizar solo campos permitidos
    if (updateDto.scaffold?.routineInspections) {
      inspection.scaffold = {
        ...inspection.scaffold,
        routineInspections: updateDto.scaffold.routineInspections,
      };
    }

    if (updateDto.status) {
      inspection.status = updateDto.status as InspectionStatus;
    }

    const updated = await inspection.save();
    
    console.log('🔄 Inspección en progreso actualizada:', updated._id);

    return updated;
  }

  async findInProgress(filters?: any): Promise<InspectionHerraEquiposDocument[]> {
    const query: any = { status: InspectionStatus.IN_PROGRESS };

    if (filters?.templateCode) {
      query.templateCode = filters.templateCode;
    }

    if (filters?.submittedBy) {
      query.submittedBy = filters.submittedBy;
    }

    return this.inspectionModel
      .find(query)
      .sort({ updatedAt: -1 })
      .exec();
  }
  // ============================================
  // OBTENER TODAS LAS INSPECCIONES (con filtros)
  // ============================================
  // En inspection-herra-equipos.service.ts
async findAll(filters?: any): Promise<InspectionHerraEquiposDocument[]> {
  const query: any = {};

  if (filters?.status) query.status = filters.status;
  if (filters?.templateCode) query.templateCode = filters.templateCode;
  if (filters?.submittedBy) query.submittedBy = filters.submittedBy;

  if (filters?.startDate || filters?.endDate) {
    query.submittedAt = {};
    if (filters.startDate)
      query.submittedAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.submittedAt.$lte = new Date(filters.endDate);
  }

  return this.inspectionModel
    .find(query)
    .populate('templateId') // ← AGREGAR ESTE POPULATE
    .sort({ submittedAt: -1 })
    .exec();
}
  async findOne(id: string): Promise<InspectionHerraEquiposDocument> {

    const inspection = await this.inspectionModel
      .findById(id)
      .populate('templateId') // ← POPULATE CRÍTICO para revision
      .exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    console.log('✅ Inspección encontrada:', {
      id: inspection._id,
      templateCode: inspection.templateCode,
      templatePopulated: !!(inspection.templateId as any)?.revision,
    });

    return inspection;
  }

  async update(
    id: string,
    updateDto: UpdateInspectionHerraEquipoDto,
  ): Promise<InspectionHerraEquiposDocument> {
    const inspection = await this.inspectionModel
      .findByIdAndUpdate(
        id,
        { $set: updateDto },
        { new: true, runValidators: true },
      )
      .exec();

    if (!inspection) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    return inspection;
  }

  async remove(id: string): Promise<{ message: string }> {
    const result = await this.inspectionModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    return { message: 'Inspección eliminada exitosamente' };
  }

  async findDrafts(userId?: string): Promise<InspectionHerraEquiposDocument[]> {
    const query: any = { status: 'draft' };

    if (userId) {
      query.submittedBy = userId;
    }

    return this.inspectionModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  // ============================================
  // BUSCAR POR EQUIPO/HERRAMIENTA (ejemplo custom)
  // ============================================
  async findByEquipo(
    equipoNombre: string,
  ): Promise<InspectionHerraEquiposDocument[]> {
    return this.inspectionModel
      .find({ 'verification.equipo': new RegExp(equipoNombre, 'i') })
      .sort({ submittedAt: -1 })
      .exec();
  }

  // ============================================
  // BUSCAR POR CÓDIGO DE FORMULARIO
  // ============================================
  async findByTemplateCode(
    templateCode: string,
  ): Promise<InspectionHerraEquiposDocument[]> {
    return this.inspectionModel
      .find({ templateCode })
      .sort({ submittedAt: -1 })
      .exec();
  }

  // ============================================
  // ESTADÍSTICAS
  // ============================================
  async getStats(templateCode?: string) {
    const match: any = {};
    if (templateCode) {
      match.templateCode = templateCode;
    }

    const stats = await this.inspectionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const totalByType = await this.inspectionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$templateCode',
          count: { $sum: 1 },
          lastInspection: { $max: '$submittedAt' },
        },
      },
    ]);

    return {
      total: stats.reduce((acc, curr) => acc + curr.count, 0),
      byStatus: stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      byTemplateCode: totalByType,
    };
  }
}
