import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Area } from './schema/area.schema';
import { Model } from 'mongoose';
import { Superintendencia } from '../superintendencia/schema/superintendencia.schema';

@Injectable()
export class AreaService {

  constructor(
    @InjectModel(Area.name)
    private readonly areaModel: Model<Area>,
    @InjectModel(Superintendencia.name)
    private readonly superintendenciaModel: Model<Superintendencia>,
  ) {}
  async create(createAreaDto: CreateAreaDto) {
    // Buscar la superintendencia por nombre
    const superintendencia = await this.superintendenciaModel.findOne({
      nombre: createAreaDto.superintendencia,
    });

    // Si no se encuentra la superintendencia, lanzar un error
    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con nombre "${createAreaDto.superintendencia}" no encontrada`,
      );
    }

    // Crear el área con el ID de la superintendencia
    const area = new this.areaModel({
      nombre: createAreaDto.nombre,
      superintendencia: superintendencia._id, // Usar el ID de la superintendencia
    });

    return await area.save();
  }

  async buscarArea(query: string): Promise<string[]> {
    // Comprobar si query es un string válido
    if (typeof query !== 'string' || query.trim() === '') {
      // Si query no es válido, retornar todas las áreas (o las primeras 10)
      const areas = await this.areaModel.find().limit(20).exec();
      return areas.map((area) => area.nombre); // Devolver solo los nombres
    }
  
    // Si query es válido, realizar la búsqueda con regex
    const areas = await this.areaModel
      .find({ nombre: { $regex: query, $options: 'i' } }) // Buscar por "nombre"
      .limit(10)
      .exec();
  
    return areas.map((area) => area.nombre); // Devolver solo los nombres
  }

  async findAll() {
    return await this.areaModel.find().populate('superintendencia').exec();
  }
  

  findOne(id: number) {
    return `This action returns a #${id} area`;
  }

  update(id: number, updateAreaDto: UpdateAreaDto) {
    return `This action updates a #${id} area`;
  }

  remove(id: number) {
    return `This action removes a #${id} area`;
  }
}
