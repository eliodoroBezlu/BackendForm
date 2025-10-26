import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { UpdateInstanceDto } from './dto/update-instance.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Instance,
  SectionResponse,
  QuestionResponse,
} from './schemas/instance.schema';
import { TemplatesService } from '../templates/templates.service';
import { Section } from '../templates/schemas/template.schema';

@Injectable()
export class InstancesService {
  constructor(
    @InjectModel(Instance.name)
    private instanceModel: Model<Instance>,
    private templatesService: TemplatesService,
  ) {}

  /**
   * Crea una nueva instancia con cálculos automáticos
   */
  async create(createInstanceDto: CreateInstanceDto): Promise<Instance> {
    // Verificar que el template existe
    const template = await this.templatesService.findOne(
      createInstanceDto.templateId,
    );

    // Aplanar secciones del template para validación
    const flatSections = this.flattenSections(template.sections);

    // Validar que todas las secciones enviadas existen en el template
    const validSectionIds = new Set(flatSections.map((s) => s._id.toString()));
    const invalidSections = createInstanceDto.sections.filter(
      (s) => !validSectionIds.has(s.sectionId),
    );

    if (invalidSections.length > 0) {
      throw new BadRequestException(
        `Las siguientes secciones no existen en el template: ${invalidSections.map((s) => s.sectionId).join(', ')}`,
      );
    }

    // ✅ CALCULAR MÉTRICAS AUTOMÁTICAMENTE EN EL BACKEND
    const calculatedSections = this.calculateAllSectionMetrics(
      createInstanceDto.sections,
      flatSections,
    );

    const instanceTotals = this.calculateInstanceTotals(calculatedSections);

    const instanceData = {
      templateId: new Types.ObjectId(createInstanceDto.templateId),
      verificationList: new Map(
        Object.entries(createInstanceDto.verificationList || {}),
      ),
      inspectionTeam: createInstanceDto.inspectionTeam,
      valoracionCriterio: createInstanceDto.valoracionCriterio,
      sections: calculatedSections,
      aspectosPositivos: createInstanceDto.aspectosPositivos || '',
      aspectosAdicionales: createInstanceDto.aspectosAdicionales || '',
      personalInvolucrado: createInstanceDto.personalInvolucrado,
      ...instanceTotals,
      status: createInstanceDto.status || 'borrador',
      createdBy: createInstanceDto.createdBy || 'system',
    };

    try {
      const createdInstance = new this.instanceModel(instanceData);
      const saved = await createdInstance.save();
      console.log('✅ Instance saved with calculated metrics:', {
        id: saved._id,
        totalObtained: saved.totalObtainedPoints,
        compliance: saved.overallCompliancePercentage,
      });
      return saved;
    } catch (error) {
      console.error('❌ Error saving instance:', error);
      throw new BadRequestException('Error al crear la instancia');
    }
  }

  /**
   * Actualiza una instancia recalculando métricas si es necesario
   */
  async update(
    id: string,
    updateInstanceDto: UpdateInstanceDto,
  ): Promise<Instance> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de instancia inválido');
    }

    // Si se actualizan las secciones, recalcular métricas
    if (updateInstanceDto.sections) {
      const instance = await this.findOne(id);
      const template = await this.templatesService.findOne(
        instance.templateId.toString(),
      );

      const flatSections = this.flattenSections(template.sections);

      // ✅ RECALCULAR MÉTRICAS
      const calculatedSections = this.calculateAllSectionMetrics(
        updateInstanceDto.sections,
        flatSections,
      );
      const instanceTotals = this.calculateInstanceTotals(calculatedSections);

      updateInstanceDto.sections = calculatedSections;
      Object.assign(updateInstanceDto, instanceTotals);
    }

    updateInstanceDto.updatedBy = updateInstanceDto.updatedBy || 'system';

    const updatedInstance = await this.instanceModel
      .findByIdAndUpdate(id, updateInstanceDto, {
        new: true,
        runValidators: true,
      })
      .populate('templateId')
      .exec();

    if (!updatedInstance) {
      throw new NotFoundException('Instancia no encontrada');
    }

    return updatedInstance;
  }

  async findAll(filters?: {
    templateId?: string;
    status?: string;
    createdBy?: string;
    dateFrom?: Date;
    dateTo?: Date;
    area?: string;
    superintendencia?: string;
    minCompliance?: number;
    maxCompliance?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Instance[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const query: any = {};

    if (filters?.templateId) {
      query.templateId = new Types.ObjectId(filters.templateId);
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.createdBy) {
      query.createdBy = filters.createdBy;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) {
        query.createdAt.$gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        query.createdAt.$lte = filters.dateTo;
      }
    }

    if (filters?.area) {
      query['verificationList.Área'] = {
        $regex: filters.area,
        $options: 'i',
      };
    }

    if (filters?.superintendencia) {
      query['verificationList.Superintendencia'] = {
        $regex: filters.superintendencia,
        $options: 'i',
      };
    }

    if (
      filters?.minCompliance !== undefined ||
      filters?.maxCompliance !== undefined
    ) {
      query.overallCompliancePercentage = {};
      if (filters.minCompliance !== undefined) {
        query.overallCompliancePercentage.$gte = filters.minCompliance;
      }
      if (filters.maxCompliance !== undefined) {
        query.overallCompliancePercentage.$lte = filters.maxCompliance;
      }
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.instanceModel
        .find(query)
        .populate('templateId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.instanceModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Instance> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de instancia inválido');
    }

    const instance = await this.instanceModel
      .findById(id)
      .populate('templateId')
      .exec();

    if (!instance) {
      throw new NotFoundException('Instancia no encontrada');
    }

    return instance;
  }

  async remove(id: string): Promise<void> {
    const result = await this.instanceModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Instancia no encontrada');
    }
  }

  async updateStatus(
    id: string,
    status: string,
    userId?: string,
  ): Promise<Instance> {
    if (!['borrador', 'completado', 'revisado', 'aprobado'].includes(status)) {
      throw new BadRequestException('Estado inválido');
    }

    const updateData: any = { status };

    switch (status) {
      case 'revisado':
        updateData.reviewedBy = userId;
        updateData.reviewedAt = new Date();
        break;
      case 'aprobado':
        updateData.approvedBy = userId;
        updateData.approvedAt = new Date();
        break;
    }

    const instance = await this.instanceModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('templateId')
      .exec();

    if (!instance) {
      throw new NotFoundException('Instancia no encontrada');
    }

    return instance;
  }

  // ========================================
  // MÉTODOS PRIVADOS PARA CÁLCULOS
  // ========================================

  /**
   * Aplana secciones recursivamente (incluye subsecciones)
   */
  private flattenSections(sections: any[]): any[] {
    const flattened: any[] = [];

    const flatten = (section: any) => {
      // Solo agregar secciones que NO sean padre
      if (!section.isParent) {
        flattened.push(section);
      }

      // Procesar subsecciones recursivamente
      if (section.subsections && section.subsections.length > 0) {
        section.subsections.forEach(flatten);
      }
    };

    sections.forEach(flatten);
    return flattened;
  }

  /**
   * ✅ MÉTODO PRINCIPAL: Calcula métricas para todas las secciones
   */
  private calculateAllSectionMetrics(
    sections: any[],
    templateSections: Section[],
  ): SectionResponse[] {
    return sections.map((section) => {
      // Buscar la sección correspondiente en el template para obtener maxPoints
      const templateSection = templateSections.find(
        (ts) => ts._id && ts._id.toString() === section.sectionId,
      );

      if (!templateSection) {
        throw new BadRequestException(
          `Sección ${section.sectionId} no encontrada en el template`,
        );
      }

      // Calcular métricas de cada pregunta
      const calculatedQuestions = section.questions.map((q: any) => ({
        ...q,
        points: q.response === 'N/A' ? 0 : Number(q.response) || 0,
      }));

      // Contar respuestas N/A
      const naCount = calculatedQuestions.filter(
        (q: QuestionResponse) => q.response === 'N/A',
      ).length;

      // Sumar puntos obtenidos
      const obtainedPoints = calculatedQuestions.reduce(
        (sum: number, q: QuestionResponse) => sum + q.points,
        0,
      );

      // maxPoints viene del template (es fijo)
      const maxPoints = templateSection.maxPoints;

      // applicablePoints = maxPoints (no cambia aunque haya N/A)
      const applicablePoints = maxPoints;

      // Calcular porcentaje de cumplimiento
      const compliancePercentage =
        applicablePoints > 0 ? (obtainedPoints / applicablePoints) * 100 : 0;

      return {
        sectionId: section.sectionId,
        questions: calculatedQuestions,
        maxPoints: Math.round(maxPoints * 100) / 100,
        obtainedPoints: Math.round(obtainedPoints * 100) / 100,
        applicablePoints: Math.round(applicablePoints * 100) / 100,
        naCount,
        compliancePercentage: Math.round(compliancePercentage * 100) / 100,
        sectionComment: section.sectionComment || '',
      };
    });
  }

  /**
   * ✅ Calcula totales generales de la instancia
   */
  private calculateInstanceTotals(sections: SectionResponse[]) {
    const totalObtainedPoints = sections.reduce(
      (sum, section) => sum + section.obtainedPoints,
      0,
    );
    const totalApplicablePoints = sections.reduce(
      (sum, section) => sum + section.applicablePoints,
      0,
    );
    const totalMaxPoints = sections.reduce(
      (sum, section) => sum + section.maxPoints,
      0,
    );
    const totalNaCount = sections.reduce(
      (sum, section) => sum + section.naCount,
      0,
    );
    const overallCompliancePercentage =
      totalApplicablePoints > 0
        ? (totalObtainedPoints / totalApplicablePoints) * 100
        : 0;

    return {
      totalObtainedPoints: Math.round(totalObtainedPoints * 100) / 100,
      totalApplicablePoints: Math.round(totalApplicablePoints * 100) / 100,
      totalMaxPoints: Math.round(totalMaxPoints * 100) / 100,
      totalNaCount,
      overallCompliancePercentage:
        Math.round(overallCompliancePercentage * 100) / 100,
    };
  }

  // ========================================
  // MÉTODOS DE ESTADÍSTICAS Y REPORTES
  // ========================================

  async getStats(templateId?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byTemplate: Array<{
      templateId: string;
      templateName: string;
      count: number;
    }>;
    recentActivity: Array<{ date: string; count: number }>;
    complianceDistribution: Array<{ range: string; count: number }>;
    averageCompliance: number;
  }> {
    const matchStage: any = {};
    if (templateId) {
      matchStage.templateId = new Types.ObjectId(templateId);
    }

    const [statusStats, templateStats, recentStats, complianceStats] =
      await Promise.all([
        this.instanceModel
          .aggregate([
            { $match: matchStage },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .exec(),

        this.instanceModel
          .aggregate([
            { $match: matchStage },
            {
              $lookup: {
                from: 'templates',
                localField: 'templateId',
                foreignField: '_id',
                as: 'template',
              },
            },
            { $unwind: '$template' },
            {
              $group: {
                _id: '$templateId',
                templateName: { $first: '$template.name' },
                count: { $sum: 1 },
              },
            },
          ])
          .exec(),

        this.instanceModel
          .aggregate([
            {
              $match: {
                ...matchStage,
                createdAt: {
                  $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .exec(),

        this.instanceModel
          .aggregate([
            { $match: matchStage },
            {
              $bucket: {
                groupBy: '$overallCompliancePercentage',
                boundaries: [0, 25, 50, 75, 90, 100],
                default: '100+',
                output: { count: { $sum: 1 } },
              },
            },
          ])
          .exec(),
      ]);

    const total = await this.instanceModel.countDocuments(matchStage).exec();

    const avgResult = await this.instanceModel
      .aggregate([
        { $match: matchStage },
        {
          $group: { _id: null, avg: { $avg: '$overallCompliancePercentage' } },
        },
      ])
      .exec();

    const averageCompliance = avgResult[0]?.avg || 0;

    const complianceRanges = ['0-25%', '25-50%', '50-75%', '75-90%', '90-100%'];
    const complianceDistribution = complianceStats.map((stat, index) => ({
      range: complianceRanges[index] || '100%+',
      count: stat.count,
    }));

    return {
      total,
      byStatus: statusStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byTemplate: templateStats.map((item) => ({
        templateId: item._id.toString(),
        templateName: item.templateName,
        count: item.count,
      })),
      recentActivity: recentStats.map((item) => ({
        date: item._id,
        count: item.count,
      })),
      complianceDistribution,
      averageCompliance: Math.round(averageCompliance * 100) / 100,
    };
  }

  async getComplianceReport(templateId?: string): Promise<{
    summary: {
      totalInstances: number;
      averageCompliance: number;
      bestPerformingSection: string;
      worstPerformingSection: string;
    };
    sectionAnalysis: Array<{
      sectionId: string;
      averageCompliance: number;
      totalQuestions: number;
      naCount: number;
    }>;
  }> {
    const matchStage: any = {};
    if (templateId) {
      matchStage.templateId = new Types.ObjectId(templateId);
    }

    const instances = await this.instanceModel.find(matchStage).exec();

    if (instances.length === 0) {
      return {
        summary: {
          totalInstances: 0,
          averageCompliance: 0,
          bestPerformingSection: 'N/A',
          worstPerformingSection: 'N/A',
        },
        sectionAnalysis: [],
      };
    }

    const sectionStats: Record<
      string,
      {
        totalCompliance: number;
        count: number;
        totalQuestions: number;
        totalNa: number;
      }
    > = {};

    instances.forEach((instance) => {
      instance.sections.forEach((section) => {
        if (!sectionStats[section.sectionId]) {
          sectionStats[section.sectionId] = {
            totalCompliance: 0,
            count: 0,
            totalQuestions: 0,
            totalNa: 0,
          };
        }
        sectionStats[section.sectionId].totalCompliance +=
          section.compliancePercentage;
        sectionStats[section.sectionId].count += 1;
        sectionStats[section.sectionId].totalQuestions +=
          section.questions.length;
        sectionStats[section.sectionId].totalNa += section.naCount;
      });
    });

    const sectionAnalysis = Object.entries(sectionStats).map(
      ([sectionId, stats]) => ({
        sectionId,
        averageCompliance:
          Math.round((stats.totalCompliance / stats.count) * 100) / 100,
        totalQuestions: Math.round(stats.totalQuestions / stats.count),
        naCount: Math.round(stats.totalNa / stats.count),
      }),
    );

    const sortedSections = sectionAnalysis.sort(
      (a, b) => b.averageCompliance - a.averageCompliance,
    );
    const bestPerformingSection = sortedSections[0]?.sectionId || 'N/A';
    const worstPerformingSection =
      sortedSections[sortedSections.length - 1]?.sectionId || 'N/A';

    const totalCompliance = instances.reduce(
      (sum, instance) => sum + instance.overallCompliancePercentage,
      0,
    );
    const averageCompliance =
      Math.round((totalCompliance / instances.length) * 100) / 100;

    return {
      summary: {
        totalInstances: instances.length,
        averageCompliance,
        bestPerformingSection,
        worstPerformingSection,
      },
      sectionAnalysis,
    };
  }
}
