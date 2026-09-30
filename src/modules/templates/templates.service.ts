import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { FilterQuery, Model, Types } from 'mongoose';
import { Template, TemplateDocument } from './schemas/template.schema';
import { Instance } from '../instances/schemas/instance.schema';
import {
  FILTRO_VIGENTE,
  FILTRO_VIGENTE_O_BORRADOR,
} from '../../common/versionado/versionado';
import {
  PlantillaVersionable,
  VersionadoPlantillas,
} from '../../common/versionado/versionado-plantillas';
import type { CreateTemplateDto } from './dto/create-template.dto';
import type { UpdateTemplateDto } from './dto/update-template.dto';
import { InjectModel } from '@nestjs/mongoose';
import { escaparRegex } from '../../common/utils/escapar-regex.util';
import {
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';

@Injectable()
export class TemplatesService {
  /** Borrador / vigente / obsoleta: ver `common/versionado/versionado.ts`. */
  readonly versionado: VersionadoPlantillas<
    TemplateDocument & PlantillaVersionable
  >;

  constructor(
    @InjectModel(Template.name)
    private readonly templateModel: Model<TemplateDocument>,
    @InjectModel(Instance.name)
    private readonly instanceModel: Model<Instance>,
  ) {
    this.versionado = new VersionadoPlantillas(
      this.templateModel as unknown as Model<
        TemplateDocument & PlantillaVersionable
      >,
      (id: Types.ObjectId) =>
        this.instanceModel.countDocuments({ templateId: id }).exec(),
    );
  }

  async create(
    createTemplateDto: CreateTemplateDto,
    usuario?: string,
  ): Promise<Template> {
    await this.versionado.exigirCodigoLibre(createTemplateDto.code);
    try {
      const createdTemplate = new this.templateModel({
        ...createTemplateDto,
        ...this.versionado.camposDeAlta(createTemplateDto.revision, usuario),
      });
      return await createdTemplate.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Ya existe un template con este código');
      }
      throw error;
    }
  }

  async findAll(filters?: {
    type?: string;
    isActive?: boolean;
    search?: string;
    /** La pantalla de administración también ve los borradores. */
    incluirBorradores?: boolean;
  }): Promise<Template[]> {
    // Por defecto solo la revisión vigente de cada plantilla: es lo que se
    // ofrece para inspeccionar. Las obsoletas se ven por `historial`.
    const query: FilterQuery<Template> = {
      ...(filters?.incluirBorradores
        ? FILTRO_VIGENTE_O_BORRADOR
        : FILTRO_VIGENTE),
    };

    if (filters?.type) {
      query.type = filters.type;
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters?.search) {
      // Escapado: el texto lo escribe el usuario en el buscador de plantillas.
      const termino = escaparRegex(filters.search.trim());
      query.$or = [
        { name: { $regex: termino, $options: 'i' } },
        { code: { $regex: termino, $options: 'i' } },
      ];
    }

    return this.templateModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Template> {
    const template = await this.templateModel.findById(id).exec();
    if (!template) {
      throw new NotFoundException('Template no encontrado');
    }
    return template;
  }

  async findByCode(code: string): Promise<Template> {
    // La vigente: el código es de toda la familia de revisiones.
    const template = await this.templateModel
      .findOne({ code, ...FILTRO_VIGENTE })
      .exec();
    if (!template) {
      throw new NotFoundException('Template no encontrado');
    }
    return template;
  }

  /**
   * Edita en el lugar. Solo se puede con un borrador o con una vigente que
   * todavía no tiene inspecciones; si no, 409 con el motivo (ver
   * `VersionadoPlantillas.estadoEdicion`).
   */
  async update(
    id: string,
    updateTemplateDto: UpdateTemplateDto,
  ): Promise<Template> {
    const cambios = await this.versionado.prepararEdicion(
      id,
      updateTemplateDto,
    );
    try {
      const updatedTemplate = await this.templateModel
        .findByIdAndUpdate(id, cambios, { new: true })
        .exec();

      if (!updatedTemplate) {
        throw new NotFoundException('Template no encontrado');
      }

      return updatedTemplate;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Ya existe un template con este código');
      }
      throw error;
    }
  }

  /**
   * Da de baja el registro; no lo borra.
   *
   * Devuelve el documento porque el interceptor de auditoria archiva lo que
   * devuelven los `DELETE`. Un `null` significa que no existe o que ya estaba
   * de baja: desde fuera las dos cosas son un 404.
   */
  async remove(id: string, usuario: string) {
    const result = await this.templateModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();
    if (!result) {
      throw new NotFoundException('Template no encontrado');
    }
    return result;
  }

  /** Devuelve al uso un registro dado de baja. */
  async restaurar(id: string) {
    const result = await this.templateModel
      .findOneAndUpdate({ _id: id, activo: false }, marcarRestaurado(), {
        new: true,
      })
      .exec();
    if (!result) {
      throw new NotFoundException(
        'No encontrado o no estaba dado de baja: ' + id,
      );
    }
    return result;
  }

  async desactivate(id: string): Promise<Template> {
    const template = await this.templateModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();

    if (!template) {
      throw new NotFoundException('Template no encontrado');
    }

    return template;
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: { interna: number; externa: number };
  }> {
    const [total, active, byType] = await Promise.all([
      this.templateModel.countDocuments(FILTRO_VIGENTE).exec(),
      this.templateModel
        .countDocuments({ ...FILTRO_VIGENTE, isActive: true })
        .exec(),
      this.templateModel
        .aggregate([
          { $match: { activo: { $ne: false }, ...FILTRO_VIGENTE } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const typeStats = byType.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      { interna: 0, externa: 0 },
    );

    return {
      total,
      active,
      inactive: total - active,
      byType: typeStats,
    };
  }
}
