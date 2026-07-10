import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';
import { Equipo, EquipoDocument } from './schemas/equipo.schema';
import { ConfigFormularioService } from '../config-formulario/config-formulario.service';

@Injectable()
export class EquiposService {
  constructor(
    @InjectModel(Equipo.name)
    private readonly equipoModel: Model<EquipoDocument>,
    private readonly configService: ConfigFormularioService,
  ) {}

  private async validarEspecificaciones(tipoEquipo: string, especificaciones: Record<string, any> = {}) {
    let config;
    try {
      config = await this.configService.findOne(tipoEquipo);
    } catch (e) {
      // Si no hay configuración para este tipo de equipo, se permite sin validación estricta
      return;
    }

    for (const campo of config.campos) {
      const valor = especificaciones[campo.name];

      // Validar requeridos
      if (campo.required && (valor === undefined || valor === null || valor === '')) {
        throw new BadRequestException(`El campo de especificación '${campo.label}' es obligatorio para el tipo de equipo '${tipoEquipo}'`);
      }

      // Validar opciones de select
      if (valor && campo.type === 'select' && campo.options && campo.options.length > 0) {
        if (!campo.options.includes(valor)) {
          throw new BadRequestException(`El valor '${valor}' no es una opción válida para '${campo.label}'. Opciones válidas: ${campo.options.join(', ')}`);
        }
      }
    }
  }

  async create(createDto: CreateEquipoDto): Promise<Equipo> {
    const codigoClean = createDto.codigo.trim();

    // Check duplicate code
    const exists = await this.equipoModel.findOne({ codigo: codigoClean }).exec();
    if (exists) {
      throw new ConflictException(`El código de equipo '${codigoClean}' ya está registrado`);
    }

    // Validate dynamic specifications
    await this.validarEspecificaciones(createDto.tipo_equipo, createDto.especificaciones);

    const created = new this.equipoModel({
      ...createDto,
      codigo: codigoClean,
      area_id: new Types.ObjectId(createDto.area_id),
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
        populate: { path: 'superintendencia' }
      })
      .populate('ubicacion_id')
      .populate('clasificacion_id')
      .exec();
  }

  async findOne(id: string): Promise<Equipo> {
    const item = await this.equipoModel
      .findById(id)
      .populate({
        path: 'area_id',
        populate: { path: 'superintendencia' }
      })
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
      const codigoClean = updateDto.codigo.trim();
      const exists = await this.equipoModel.findOne({
        codigo: codigoClean,
        _id: { $ne: id }
      }).exec();

      if (exists) {
        throw new ConflictException(`El código de equipo '${codigoClean}' ya está registrado`);
      }
      updateDto.codigo = codigoClean;
    }

    // Dynamic specs validation
    const tipoEquipo = updateDto.tipo_equipo || existing.tipo_equipo;
    const especificaciones = {
      ...existing.especificaciones,
      ...(updateDto.especificaciones || {})
    };
    await this.validarEspecificaciones(tipoEquipo, especificaciones);

    const updateObj: any = { ...updateDto };
    if (updateDto.area_id) updateObj.area_id = new Types.ObjectId(updateDto.area_id);
    if (updateDto.ubicacion_id) updateObj.ubicacion_id = new Types.ObjectId(updateDto.ubicacion_id);
    if (updateDto.clasificacion_id) updateObj.clasificacion_id = new Types.ObjectId(updateDto.clasificacion_id);

    const updated = await this.equipoModel
      .findByIdAndUpdate(id, updateObj, { new: true })
      .populate({
        path: 'area_id',
        populate: { path: 'superintendencia' }
      })
      .populate('ubicacion_id')
      .populate('clasificacion_id')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.equipoModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }
  }

  // Upsert helper for migration service
  async upsert(codigo: string, data: Partial<Equipo>): Promise<Equipo> {
    return this.equipoModel.findOneAndUpdate(
      { codigo },
      data,
      { upsert: true, new: true }
    ).exec();
  }
}
