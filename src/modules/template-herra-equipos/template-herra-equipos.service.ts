import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateTemplateHerraEquipoDto } from './dto/create-template-herra-equipo.dto';
import { UpdateTemplateHerraEquipoDto } from './dto/update-template-herra-equipo.dto';
import { InjectModel } from '@nestjs/mongoose';
import { TemplateHerraEquipos } from './schema/template-herra-equipo.schema';
import { Model } from 'mongoose';

@Injectable()
export class TemplateHerraEquiposService {
  constructor(
    @InjectModel(TemplateHerraEquipos.name) private templateHerraEquiposModel: Model<TemplateHerraEquipos>,
  ) {}


  async create(createTemplateDto: CreateTemplateHerraEquipoDto): Promise<TemplateHerraEquipos> {
    // Verificar si ya existe un template con ese código
    const existingTemplate = await this.templateHerraEquiposModel.findOne({ 
      code: createTemplateDto.code 
    });
    
    if (existingTemplate) {
      throw new ConflictException(`Template with code ${createTemplateDto.code} already exists`);
    }

    const createdTemplate = new this.templateHerraEquiposModel(createTemplateDto);
    return createdTemplate.save();
  }


  async findAll(filters?: { type?: string }): Promise<TemplateHerraEquipos[]> {
    const query = filters?.type ? { type: filters.type } : {};
    return this.templateHerraEquiposModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<TemplateHerraEquipos> {
    const template = await this.templateHerraEquiposModel.findById(id).exec();
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    return template;
  }

  async findByCode(code: string): Promise<TemplateHerraEquipos> {
    const template = await this.templateHerraEquiposModel.findOne({ code }).exec();
    if (!template) {
      throw new NotFoundException(`Template with code ${code} not found`);
    }
    return template;
  }

  async update(id: string, updateTemplateDto: UpdateTemplateHerraEquipoDto): Promise<TemplateHerraEquipos> {
    // Si se está actualizando el código, verificar que no exista
    if (updateTemplateDto.code) {
      const existingTemplate = await this.templateHerraEquiposModel.findOne({
        code: updateTemplateDto.code,
        _id: { $ne: id }
      });
      
      if (existingTemplate) {
        throw new ConflictException(`Template with code ${updateTemplateDto.code} already exists`);
      }
    }

    const updatedTemplate = await this.templateHerraEquiposModel
      .findByIdAndUpdate(id, updateTemplateDto, { new: true })
      .exec();
      
    if (!updatedTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
    
    return updatedTemplate;
  }

  async remove(id: string): Promise<void> {
    const result = await this.templateHerraEquiposModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }
  }

  async count(filters?: { type?: string }): Promise<number> {
    const query = filters?.type ? { type: filters.type } : {};
    return this.templateHerraEquiposModel.countDocuments(query).exec();
  }

  async search(searchTerm: string): Promise<TemplateHerraEquipos[]> {
    return this.templateHerraEquiposModel
      .find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { code: { $regex: searchTerm, $options: 'i' } },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }
}
