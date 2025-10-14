import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { OrdenTrabajo } from './schema/tag.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class TagService {
  constructor(
    @InjectModel(OrdenTrabajo.name)
    private readonly ordenTrabajoModel: Model<OrdenTrabajo>,
  ) {}

  async create(createDto: CreateTagDto): Promise<OrdenTrabajo> {
    // Validación explícita de los campos requeridos
    if (!createDto.tag || !createDto.area) {
      throw new Error('Los campos tag y area son requeridos');
    }

    // Verificar si el tag ya existe
    const exists = await this.ordenTrabajoModel.findOne({
      tag: createDto.tag
    }).exec();

    if (exists) {
      throw new ConflictException(`El tag ${createDto.tag} ya existe`);
    }

    try {
      const created = new this.ordenTrabajoModel({
        tag: createDto.tag.trim(), // Limpiar espacios
        area: createDto.area.trim(),
        activo: createDto.activo !== undefined ? createDto.activo : true
      });

      return await created.save();
    } catch (error) {
      console.error('Error al crear:', error);
      throw error;
    }
  }

  async findByArea(area: string): Promise<string[]> {
    const resultados = await this.ordenTrabajoModel.find({ 
      area,
      activo: true // Solo tags activos
    }).exec();
    // Extrae solo los valores de tag y los devuelve como array
    return resultados.map(doc => doc.tag);
  }

  async findAll(): Promise<OrdenTrabajo[]> {
    return this.ordenTrabajoModel.find().exec();
  }

  async findOne(id: string): Promise<OrdenTrabajo> {
    const tag = await this.ordenTrabajoModel.findById(id).exec();
    if (!tag) {
      throw new NotFoundException(`Tag con ID ${id} no encontrado`);
    }
    return tag;
  }

  async update(id: string, updateTagDto: UpdateTagDto): Promise<OrdenTrabajo> {
    // Si se está actualizando el tag, verificar que no exista otro con el mismo nombre
    if (updateTagDto.tag) {
      const exists = await this.ordenTrabajoModel.findOne({
        tag: updateTagDto.tag,
        _id: { $ne: id } // Excluir el documento actual
      }).exec();

      if (exists) {
        throw new ConflictException(`El tag ${updateTagDto.tag} ya existe`);
      }
    }

    const updated = await this.ordenTrabajoModel.findByIdAndUpdate(
      id,
      { 
        ...updateTagDto,
        tag: updateTagDto.tag?.trim(),
        area: updateTagDto.area?.trim()
      },
      { new: true, runValidators: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException(`Tag con ID ${id} no encontrado`);
    }

    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const result = await this.ordenTrabajoModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Tag con ID ${id} no encontrado`);
    }
    return { message: 'Tag eliminado correctamente' };
  }

  async desactivar(id: string): Promise<OrdenTrabajo> {
    const updated = await this.ordenTrabajoModel.findByIdAndUpdate(
      id,
      { activo: false },
      { new: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException(`Tag con ID ${id} no encontrado`);
    }

    return updated;
  }

  async activar(id: string): Promise<OrdenTrabajo> {
    const updated = await this.ordenTrabajoModel.findByIdAndUpdate(
      id,
      { activo: true },
      { new: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException(`Tag con ID ${id} no encontrado`);
    }

    return updated;
  }
}