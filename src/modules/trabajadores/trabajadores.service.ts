import { Injectable } from '@nestjs/common';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Trabajador } from './schema/trabajador.schema';
import { Model } from 'mongoose';

@Injectable()
export class TrabajadoresService {

  constructor(
    @InjectModel(Trabajador.name) private trabajadorModel: Model<Trabajador>,
  ){}
  async create(createTrabajadorDto: CreateTrabajadorDto): Promise<Trabajador> {
    const createdTrabajador = new this.trabajadorModel(createTrabajadorDto);
    return createdTrabajador.save();
  }

  async buscarTrabajadores(query: string): Promise<Trabajador[]> {
    // Comprobar si query es un string válido
    if (typeof query !== 'string' || query.trim() === '') {
      // Si query no es válido, retornar todos los trabajadores (o los primeros 10)
      return this.trabajadorModel.find().limit(10).exec();
    }
    
    // Si query es válido, realizar la búsqueda con regex
    return this.trabajadorModel
      .find({ nomina: { $regex: query, $options: 'i' } })
      .limit(10)
      .exec();
  }

  async findAll(): Promise<Trabajador[]> {
    const result = await this.trabajadorModel.find().exec();
    return result;
  }

  findOne(id: number) {
    return `This action returns a #${id} trabajadore`;
  }

  update(id: number, updateTrabajadoreDto: UpdateTrabajadorDto) {
    return `This action updates a #${id} trabajadore`;
  }

  remove(id: number) {
    return `This action removes a #${id} trabajadore`;
  }
}
