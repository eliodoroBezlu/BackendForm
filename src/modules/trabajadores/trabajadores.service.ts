import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trabajador } from './schema/trabajador.schema';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';

@Injectable()
export class TrabajadoresService {
  constructor(
    @InjectModel(Trabajador.name) private trabajadorModel: Model<Trabajador>,
  ) {}

  // Crear trabajador
  async create(createTrabajadorDto: CreateTrabajadorDto): Promise<Trabajador> {
    const createdTrabajador = new this.trabajadorModel(createTrabajadorDto);
    return createdTrabajador.save();
  }

  // Obtener todos los trabajadores
  async findAll(): Promise<Trabajador[]> {
    return this.trabajadorModel.find().exec();
  }

  // Obtener solo los nombres/identificadores de trabajadores (para autocomplete)
  async findAllNames(): Promise<string[]> {
    try {
      const trabajadores = await this.trabajadorModel
        .find()
        .select('nomina')
        .exec();
      
      console.log('Trabajadores encontrados:', trabajadores.length);
      console.log('Datos:', trabajadores);
      
      return trabajadores.map(t => t.nomina);
    } catch (error) {
      console.error('Error en findAllNames:', error);
      return [];
    }
  }


  // Buscar trabajadores por nómina o CI (devuelve objetos completos)
  async buscarTrabajadores(query: string): Promise<Trabajador[]> {
    if (typeof query !== 'string' || query.trim() === '') {
      return this.trabajadorModel.find().limit(10).exec();
    }
    
    return this.trabajadorModel
      .find({ 
        $or: [
          { nomina: { $regex: query, $options: 'i' } },
          { ci: { $regex: query, $options: 'i' } },
        ]
      })
      .limit(10)
      .exec();
  }

  // Buscar trabajadores y devolver solo los nombres (para autocomplete)
  async buscarTrabajadoresNames(query: string): Promise<string[]> {
    if (typeof query !== 'string' || query.trim() === '') {
      const trabajadores = await this.trabajadorModel
        .find()
        .select('nomina')
        .limit(20)
        .exec();
      return trabajadores.map(t => t.nomina);
    }
    
    const trabajadores = await this.trabajadorModel
      .find({ 
        $or: [
          { nomina: { $regex: query, $options: 'i' } },
          { ci: { $regex: query, $options: 'i' } },
        ]
      })
      .select('nomina')
      .limit(20)
      .exec();

    return trabajadores.map(t => t.nomina);
  }

  // Obtener un trabajador por ID
  async findOne(id: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel.findById(id).exec();
    
    if (!trabajador) {
      throw new NotFoundException(`Trabajador con ID ${id} no encontrado`);
    }
    
    return trabajador;
  }

  // Actualizar trabajador
  async update(id: string, updateTrabajadorDto: any): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel
      .findByIdAndUpdate(id, updateTrabajadorDto, { 
        new: true,
        runValidators: true 
      })
      .exec();
    
    if (!trabajador) {
      throw new NotFoundException(`Trabajador con ID ${id} no encontrado`);
    }
    
    return trabajador;
  }

  // Eliminar trabajador
  async remove(id: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel.findByIdAndDelete(id).exec();
    
    if (!trabajador) {
      throw new NotFoundException(`Trabajador con ID ${id} no encontrado`);
    }
    
    return trabajador;
  }

  async findAllCompletos(): Promise<Array<{ nomina: string; ci: string; puesto: string }>> {
  try {
    const trabajadores = await this.trabajadorModel
      .find()
      .select('nomina ci puesto') // Solo estos 3 campos
      .sort({ nomina: 1 }) // Ordenar alfabéticamente
      .lean() // Mejor performance
      .exec();
    
    console.log('Trabajadores completos encontrados:', trabajadores.length);
    
    return trabajadores.map(t => ({
      nomina: t.nomina || '',
      ci: t.ci || '',
      puesto: t.puesto || ''
    }));
  } catch (error) {
    console.error('Error en findAllCompletos:', error);
    return [];
  }
}
}
