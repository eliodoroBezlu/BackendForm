import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';
import { AmbitoEquipo, Equipo, EquipoDocument } from './schemas/equipo.schema';
import { ConfigFormularioService } from '../config-formulario/config-formulario.service';
import {
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';

@Injectable()
export class EquiposService {
  constructor(
    @InjectModel(Equipo.name)
    private readonly equipoModel: Model<EquipoDocument>,
    private readonly configService: ConfigFormularioService,
  ) {}

  private async validarEspecificaciones(
    tipoEquipo: string,
    especificaciones: Record<string, any> = {},
  ) {
    let config;
    try {
      config = await this.configService.findOne(tipoEquipo);
    } catch {
      // Si no hay configuración para este tipo de equipo, se permite sin validación estricta
      return;
    }

    for (const campo of config.campos) {
      const valor = especificaciones[campo.name];

      // Validar requeridos
      if (
        campo.required &&
        (valor === undefined || valor === null || valor === '')
      ) {
        throw new BadRequestException(
          `El campo de especificación '${campo.label}' es obligatorio para el tipo de equipo '${tipoEquipo}'`,
        );
      }

      // Validar opciones de select
      if (
        valor &&
        campo.type === 'select' &&
        campo.options &&
        campo.options.length > 0
      ) {
        if (!campo.options.includes(valor)) {
          throw new BadRequestException(
            `El valor '${valor}' no es una opción válida para '${campo.label}'. Opciones válidas: ${campo.options.join(', ')}`,
          );
        }
      }
    }
  }

  /**
   * Comprueba que el ámbito traiga la referencia que le corresponde.
   *
   * El código ya no se valida por duplicado: en el inventario de SPCC hay
   * pares de equipos físicamente distintos con el mismo ID interno. La
   * identidad de la unidad es `rfid`, y su unicidad la garantiza el índice.
   */
  private resolverAmbito(dto: CreateEquipoDto): Record<string, unknown> {
    const ambito = dto.ambito ?? AmbitoEquipo.AREA;

    const requerido: Record<AmbitoEquipo, keyof CreateEquipoDto> = {
      [AmbitoEquipo.AREA]: 'area_id',
      [AmbitoEquipo.SUPERINTENDENCIA]: 'superintendencia_id',
      [AmbitoEquipo.GERENCIA]: 'gerencia_id',
    };

    const campo = requerido[ambito];
    const valor = dto[campo] as string | undefined;
    if (!valor) {
      throw new BadRequestException(
        `Con ámbito '${ambito}' hace falta '${campo}'.`,
      );
    }

    // Solo se guarda la referencia del ámbito elegido: dejar las otras
    // pobladas haría que el equipo pareciera pertenecer a dos niveles.
    return { ambito, [campo]: new Types.ObjectId(valor) };
  }

  async create(createDto: CreateEquipoDto): Promise<Equipo> {
    const codigoClean = createDto.codigo.trim();

    if (createDto.rfid) {
      const exists = await this.equipoModel
        .findOne({ rfid: createDto.rfid.trim() })
        .exec();
      if (exists) {
        throw new ConflictException(
          `El RFID '${createDto.rfid}' ya está registrado en el equipo '${exists.codigo}'`,
        );
      }
    }

    // Validate dynamic specifications
    await this.validarEspecificaciones(
      createDto.tipo_equipo,
      createDto.especificaciones,
    );

    const created = new this.equipoModel({
      ...createDto,
      codigo: codigoClean,
      ...this.resolverAmbito(createDto),
      ubicacion_id: new Types.ObjectId(createDto.ubicacion_id),
      clasificacion_id: new Types.ObjectId(createDto.clasificacion_id),
    });

    return await created.save();
  }

  async findAll(): Promise<Equipo[]> {
    return this.equipoModel
      .find()
      .populate({
        path: 'area_id',
        populate: [{ path: 'superintendencia' }, { path: 'areaPadre' }],
      })
      .populate('superintendencia_id')
      .populate('gerencia_id')
      .populate('ubicacion_id')
      .populate('clasificacion_id')
      .exec();
  }

  /**
   * Trae varios equipos por id, ya poblados — mismo `populate` que
   * `findAll()`/`findOne()`, pero acotado a la selección que el usuario ya
   * filtró en pantalla (área/ubicación/búsqueda), para exportaciones en
   * lote. La baja lógica sigue excluyendo inactivos igual que en cualquier
   * otra consulta: el plugin actúa sobre `find()` sin que haga falta nada
   * especial acá.
   */
  async findByIds(ids: string[]): Promise<Equipo[]> {
    return this.equipoModel
      .find({ _id: { $in: ids } })
      .populate({
        path: 'area_id',
        populate: [{ path: 'superintendencia' }, { path: 'areaPadre' }],
      })
      .populate('superintendencia_id')
      .populate('gerencia_id')
      .populate('ubicacion_id')
      .populate('clasificacion_id')
      .exec();
  }

  async findOne(id: string): Promise<Equipo> {
    const item = await this.equipoModel
      .findById(id)
      .populate({
        path: 'area_id',
        populate: [{ path: 'superintendencia' }, { path: 'areaPadre' }],
      })
      .populate('superintendencia_id')
      .populate('gerencia_id')
      .populate('ubicacion_id')
      .populate('clasificacion_id')
      .exec();

    if (!item) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }
    return item;
  }

  async update(id: string, updateDto: UpdateEquipoDto): Promise<Equipo> {
    const existing = await this.equipoModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    if (updateDto.codigo) {
      // El código dejó de ser único a propósito: hay equipos distintos con el
      // mismo ID interno. La unicidad la lleva `rfid`.
      updateDto.codigo = updateDto.codigo.trim();
    }

    if (updateDto.rfid) {
      const exists = await this.equipoModel
        .findOne({ rfid: updateDto.rfid.trim(), _id: { $ne: id } })
        .exec();
      if (exists) {
        throw new ConflictException(
          `El RFID '${updateDto.rfid}' ya está registrado en el equipo '${exists.codigo}'`,
        );
      }
    }

    // Dynamic specs validation
    const tipoEquipo = updateDto.tipo_equipo || existing.tipo_equipo;
    const especificaciones = {
      ...existing.especificaciones,
      ...(updateDto.especificaciones || {}),
    };
    await this.validarEspecificaciones(tipoEquipo, especificaciones);

    const updateObj: any = { ...updateDto };
    if (updateDto.area_id)
      updateObj.area_id = new Types.ObjectId(updateDto.area_id);
    if (updateDto.ubicacion_id)
      updateObj.ubicacion_id = new Types.ObjectId(updateDto.ubicacion_id);
    if (updateDto.clasificacion_id)
      updateObj.clasificacion_id = new Types.ObjectId(
        updateDto.clasificacion_id,
      );

    const updated = await this.equipoModel
      .findByIdAndUpdate(id, updateObj, { new: true })
      .populate({
        path: 'area_id',
        populate: [{ path: 'superintendencia' }, { path: 'areaPadre' }],
      })
      .populate('superintendencia_id')
      .populate('gerencia_id')
      .populate('ubicacion_id')
      .populate('clasificacion_id')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    return updated;
  }

  /**
   * Da de baja el registro; no lo borra.
   *
   * Devuelve el documento porque el interceptor de auditoria archiva lo que
   * devuelven los `DELETE`. Un `null` significa que no existe o que ya estaba
   * de baja: desde fuera las dos cosas son un 404.
   */
  async remove(id: string, usuario: string) {
    const result = await this.equipoModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();
    if (!result) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }
    return result;
  }

  /** Devuelve al uso un registro dado de baja. */
  async restaurar(id: string) {
    const result = await this.equipoModel
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

  // Upsert helper for migration service
  async upsert(codigo: string, data: Partial<Equipo>): Promise<Equipo> {
    return this.equipoModel
      .findOneAndUpdate({ codigo }, data, { upsert: true, new: true })
      .exec();
  }
}
