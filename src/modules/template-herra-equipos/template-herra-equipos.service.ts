import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTemplateHerraEquipoDto } from './dto/create-template-herra-equipo.dto';
import { UpdateTemplateHerraEquipoDto } from './dto/update-template-herra-equipo.dto';
import { InjectModel } from '@nestjs/mongoose';
import { TemplateHerraEquipos } from './schema/template-herra-equipo.schema';
import { Model } from 'mongoose';
import { ROLES_VISIBILIDAD_TOTAL } from '../auth/enums/role.enum';

@Injectable()
export class TemplateHerraEquiposService {
  constructor(
    @InjectModel(TemplateHerraEquipos.name)
    private templateHerraEquiposModel: Model<TemplateHerraEquipos>,
  ) {}

  async create(
    createTemplateDto: CreateTemplateHerraEquipoDto,
  ): Promise<TemplateHerraEquipos> {
    // 1. Verificar si ya existe la combinación Código + Revisión
    const existingTemplate = await this.templateHerraEquiposModel.findOne({
      code: createTemplateDto.code,
      revision: createTemplateDto.revision, // <--- Agregamos esto
    });

    if (existingTemplate) {
      throw new ConflictException(
        `Template with code ${createTemplateDto.code} and revision ${createTemplateDto.revision} already exists`,
      );
    }

    const createdTemplate = new this.templateHerraEquiposModel(
      createTemplateDto,
    );
    return createdTemplate.save();
  }

  /**
   * Construye el fragmento de query que acota el catálogo según los roles.
   *
   * Los roles de visibilidad total no se filtran. El resto solo ve las
   * plantillas sin `rolesVisibles` (abiertas, comportamiento histórico) o
   * las que incluyan alguno de sus roles.
   *
   * Es `public` a propósito: otros módulos —los reportes de
   * `inspection-herra-equipos`— necesitan la misma regla para no acabar
   * duplicándola y que se desincronicen.
   */
  filtroPorRoles(roles?: string[]): Record<string, unknown> {
    if (!roles?.length) return {};
    if (roles.some((r) => ROLES_VISIBILIDAD_TOTAL.includes(r))) return {};

    return {
      $or: [
        { rolesVisibles: { $exists: false } },
        { rolesVisibles: { $size: 0 } },
        { rolesVisibles: { $in: roles } },
      ],
    };
  }

  /** Códigos de plantilla visibles para esos roles. */
  async codigosVisibles(roles?: string[]): Promise<string[]> {
    const docs = await this.templateHerraEquiposModel
      .find(this.filtroPorRoles(roles))
      .select('code')
      .lean()
      .exec();
    return docs.map((d) => (d as { code: string }).code);
  }

  async findAll(
    filters?: { type?: string },
    roles?: string[],
  ): Promise<TemplateHerraEquipos[]> {
    const query: Record<string, unknown> = {
      ...(filters?.type ? { type: filters.type } : {}),
      ...this.filtroPorRoles(roles),
    };
    return this.templateHerraEquiposModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, roles?: string[]): Promise<TemplateHerraEquipos> {
    const template = await this.templateHerraEquiposModel
      .findOne({ _id: id, ...this.filtroPorRoles(roles) })
      .exec();
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    return template;
  }

  /**
   * Busca por código. Si se pasan `roles`, aplica la misma restricción de
   * visibilidad que `findAll`: sin esto, un usuario restringido podría
   * abrir una plantilla fuera de su alcance escribiendo el código en la URL
   * (`/dashboard/form-herra-equipos/<code>`), saltándose el listado.
   *
   * Devuelve 404 —no 403— a propósito: no confirma la existencia de
   * plantillas que el usuario no debería ni saber que existen.
   */
  async findByCode(
    code: string,
    roles?: string[],
  ): Promise<TemplateHerraEquipos> {
    const template = await this.templateHerraEquiposModel
      .findOne({ code, ...this.filtroPorRoles(roles) })
      .exec();
    if (!template) {
      throw new NotFoundException(`Template with code ${code} not found`);
    }
    return template;
  }

  async update(
    id: string,
    updateTemplateDto: UpdateTemplateHerraEquipoDto,
  ): Promise<TemplateHerraEquipos> {
    // 1. Obtener el documento actual para saber qué valores tiene ahora
    const currentTemplate = await this.templateHerraEquiposModel.findById(id);

    if (!currentTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // 2. Determinar cuáles serán los nuevos valores (si vienen en el DTO o se mantienen los actuales)
    const codeToCheck = updateTemplateDto.code ?? currentTemplate.code;
    const revisionToCheck =
      updateTemplateDto.revision ?? currentTemplate.revision;

    // 3. Solo verificamos si ha cambiado el código o la revisión
    if (updateTemplateDto.code || updateTemplateDto.revision) {
      const existingTemplate = await this.templateHerraEquiposModel.findOne({
        code: codeToCheck,
        revision: revisionToCheck,
        _id: { $ne: id }, // Excluir el documento actual
      });

      if (existingTemplate) {
        throw new ConflictException(
          `Template with code ${codeToCheck} and revision ${revisionToCheck} already exists`,
        );
      }
    }

    // 4. Proceder con la actualización
    const updatedTemplate = await this.templateHerraEquiposModel
      .findByIdAndUpdate(id, updateTemplateDto, { new: true })
      .exec();

    if (!updatedTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    return updatedTemplate;
  }

  async remove(id: string): Promise<void> {
    const result = await this.templateHerraEquiposModel
      .findByIdAndDelete(id)
      .exec();
    if (!result) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
  }

  async count(filters?: { type?: string }, roles?: string[]): Promise<number> {
    const query: Record<string, unknown> = {
      ...(filters?.type ? { type: filters.type } : {}),
      ...this.filtroPorRoles(roles),
    };
    return this.templateHerraEquiposModel.countDocuments(query).exec();
  }

  async search(
    searchTerm: string,
    roles?: string[],
  ): Promise<TemplateHerraEquipos[]> {
    // `$and` explícito: el filtro por roles ya usa `$or`, y combinarlos al
    // mismo nivel haría que uno pisara al otro y se colara todo el catálogo.
    const condiciones: Record<string, unknown>[] = [
      {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { code: { $regex: searchTerm, $options: 'i' } },
        ],
      },
    ];
    const porRoles = this.filtroPorRoles(roles);
    if (Object.keys(porRoles).length > 0) condiciones.push(porRoles);

    return this.templateHerraEquiposModel
      .find({ $and: condiciones })
      .sort({ createdAt: -1 })
      .exec();
  }
}
