import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTemplateHerraEquipoDto } from './dto/create-template-herra-equipo.dto';
import { UpdateTemplateHerraEquipoDto } from './dto/update-template-herra-equipo.dto';
import { InjectModel } from '@nestjs/mongoose';
import { TemplateHerraEquipos } from './schemas/template-herra-equipo.schema';
import { Model, Types } from 'mongoose';
import { InspectionHerraEquipos } from '../inspection-herra-equipos/schemas/inspection-herra-equipos.schema';
import {
  FILTRO_VIGENTE,
  FILTRO_VIGENTE_O_BORRADOR,
} from '../../common/versionado/versionado';
import {
  PlantillaVersionable,
  VersionadoPlantillas,
} from '../../common/versionado/versionado-plantillas';
import { ROLES_VISIBILIDAD_TOTAL } from '../auth/enums/role.enum';
import {
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';

@Injectable()
export class TemplateHerraEquiposService {
  /** Borrador / vigente / obsoleta: ver `common/versionado/versionado.ts`. */
  readonly versionado: VersionadoPlantillas<
    TemplateHerraEquipos & PlantillaVersionable
  >;

  constructor(
    @InjectModel(TemplateHerraEquipos.name)
    private templateHerraEquiposModel: Model<TemplateHerraEquipos>,
    @InjectModel(InspectionHerraEquipos.name)
    private inspectionModel: Model<InspectionHerraEquipos>,
  ) {
    this.versionado = new VersionadoPlantillas(
      this.templateHerraEquiposModel as unknown as Model<
        TemplateHerraEquipos & PlantillaVersionable
      >,
      (id: Types.ObjectId) =>
        this.inspectionModel.countDocuments({ templateId: id }).exec(),
    );
  }

  /**
   * Alta de una plantilla **nueva**. Una revisión nueva de una existente no
   * se crea por aquí sino con `POST :id/nueva-revision`: antes se admitía
   * dar de alta otra vez el mismo código con otra revisión, y así quedaron
   * dos documentos sueltos de 1.02.P06.F19 sin saber cuál valía.
   */
  async create(
    createTemplateDto: CreateTemplateHerraEquipoDto,
    usuario?: string,
  ): Promise<TemplateHerraEquipos> {
    await this.versionado.exigirCodigoLibre(createTemplateDto.code);
    const createdTemplate = new this.templateHerraEquiposModel({
      ...createTemplateDto,
      ...this.versionado.camposDeAlta(createTemplateDto.revision, usuario),
    });
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

  /**
   * Por defecto solo la revisión vigente de cada plantilla: es lo que se
   * ofrece para inspeccionar. `incluirBorradores` es para la pantalla de
   * administración. Las obsoletas se ven por `historial`, y una inspección
   * vieja abre la suya por id (`findOne`).
   */
  async findAll(
    filters?: { type?: string; incluirBorradores?: boolean },
    roles?: string[],
  ): Promise<TemplateHerraEquipos[]> {
    const query: Record<string, unknown> = {
      ...(filters?.incluirBorradores
        ? FILTRO_VIGENTE_O_BORRADOR
        : FILTRO_VIGENTE),
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
      .findOne({ code, ...FILTRO_VIGENTE, ...this.filtroPorRoles(roles) })
      .exec();
    if (!template) {
      throw new NotFoundException(`Template with code ${code} not found`);
    }
    return template;
  }

  /**
   * Edita en el lugar. Solo se puede con un borrador o con una vigente que
   * todavía no tiene inspecciones; si no, 409 con el motivo. El código y el
   * número de revisión los controla el versionado (ver
   * `VersionadoPlantillas.prepararEdicion`).
   */
  async update(
    id: string,
    updateTemplateDto: UpdateTemplateHerraEquipoDto,
  ): Promise<TemplateHerraEquipos> {
    const cambios = await this.versionado.prepararEdicion(
      id,
      updateTemplateDto,
    );
    const updatedTemplate = await this.templateHerraEquiposModel
      .findByIdAndUpdate(id, cambios, { new: true })
      .exec();

    if (!updatedTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    return updatedTemplate;
  }

  /**
   * Da de baja el registro; no lo borra.
   *
   * Devuelve el documento porque el interceptor de auditoria archiva lo que
   * devuelven los `DELETE`. Un `null` significa que no existe o que ya estaba
   * de baja: desde fuera las dos cosas son un 404.
   */
  async remove(id: string, usuario: string) {
    const result = await this.templateHerraEquiposModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();
    if (!result) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    return result;
  }

  /** Devuelve al uso un registro dado de baja. */
  async restaurar(id: string) {
    const result = await this.templateHerraEquiposModel
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

  async count(filters?: { type?: string }, roles?: string[]): Promise<number> {
    const query: Record<string, unknown> = {
      ...FILTRO_VIGENTE,
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
      FILTRO_VIGENTE,
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
