import { ConflictException, Injectable } from '@nestjs/common';
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
        area: createDto.area.trim()
      });
      
      return await created.save();
    } catch (error) {
      console.error('Error al crear:', error);
      throw error;
    }
  }

  async findByArea(area: string): Promise<OrdenTrabajo | null> {
    return this.ordenTrabajoModel.findOne({ area }).exec();
  }

  async findAll(): Promise<OrdenTrabajo[]> {
    return this.ordenTrabajoModel.find().exec();
  }

  findOne(id: number) {
    return `This action returns a #${id} tag`;
  }

  update(id: number, updateTagDto: UpdateTagDto) {
    return `This action updates a #${id} tag`;
  }

  remove(id: number) {
    return `This action removes a #${id} tag`;
  }
}
