import { Injectable, Logger } from '@nestjs/common';
import { CreateExtintorDto } from './dto/create-extintor.dto';
import { UpdateExtintorDto } from './dto/update-extintor.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Extintor } from './schema/extintor.schema';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class ExtintorService {

  private readonly logger = new Logger(ExtintorService.name);
  constructor(
    @InjectModel(Extintor.name)
    private readonly extintorModel: Model<Extintor>,
  ) {}

  async create(createExtintorDto: CreateExtintorDto) {
    const extintor = new this.extintorModel(createExtintorDto);
    return await extintor.save();
  }

  

  async findAll() {
    return await this.extintorModel.find().exec();
  }

  async findByArea(tag: string) {
    try {
      console.log("Servicio - Buscando área:", tag);
      console.log("Filtro de consulta:", { Area: new RegExp(tag, 'i'), inspeccionado: false });
      
      const result = await this.extintorModel
        .find({
          Area: new RegExp(tag, 'i'),
          inspeccionado: false
        })
        .select('CodigoExtintor Ubicacion Area')
        .lean()
        .exec();
        console.log(tag+"prueba")
      return result;
    } catch (error) {
      console.error("Error en findByArea service:", error);
      throw new Error(`Error al buscar extintores: ${error.message}`);
    }
  }

  async findByCodigo(codigoExtintor: string){
    try {
      if (!codigoExtintor) {
        throw new Error('El código del extintor es requerido');
      }
      const result = await this.extintorModel
      .find({
        Codigo: codigoExtintor
      })
      .lean()
      .exec
    return result
    } catch (error) {
      
    }
  }

  update(id: number, updateExtintorDto: UpdateExtintorDto) {
    return `This action updates a #${id} extintor`;
  }

  remove(id: number) {
    return `This action removes a #${id} extintor`;
  }

  async marcarExtintoresComoInspeccionados(codigosExtintores: string[]) {
    if (!codigosExtintores || codigosExtintores.length === 0) {
      return { modified: 0 };
    }
    
    try {
      const resultado = await this.extintorModel.updateMany(
        { CodigoExtintor: { $in: codigosExtintores } },
        { $set: { inspeccionado: true } }
      );
      
      return { modified: resultado.modifiedCount };
    } catch (error) {
      console.error('Error al marcar extintores como inspeccionados:', error);
      throw new Error(`Error al actualizar extintores: ${error.message}`);
    }
  }

  async crearExtintor(codigosExtintores: string[]){

  }

  async deshabilitarExtintor(codigoExtintor: string){
    try {
      const resultado = await this.extintorModel.updateOne(
        { CodigoExtintor: codigoExtintor},
        { $set: {activo: false}}
      );

          if (resultado.matchedCount === 0) {
      return { exito: false, mensaje: 'No se encontró el extintor con ese código' };
    }
    
    return { exito: true, mensaje: 'Extintor deshabilitado correctamente' };
    } catch (error) {
      console.error('Error al desactivar el extintor')
    }
  }

  @Cron('59 23 L * *')
  async resetearTodosLosExtintoresFinalMes() {
    try {
      this.logger.log('Ejecutando reseteo automático de estado de inspección de extintores fin de mes');
      
      const resultado = await this.extintorModel.updateMany(
        {}, // Sin filtros - aplica a todos los extintores
        { $set: { inspeccionado: false } }
      );
      
      this.logger.log(`Reseteo fin de mes completado. ${resultado.modifiedCount} extintores actualizados.`);
      return { modified: resultado.modifiedCount };
    } catch (error) {
      this.logger.error(`Error en reseteo automático: ${error.message}`, error.stack);
      throw new Error(`Error al resetear estado de extintores: ${error.message}`);
    }
  }

  async resetearEstadoInspeccionado(codigosExtintores?: string[]) {
    try {
      let query = {};
      if (codigosExtintores && codigosExtintores.length > 0) {
        query = { CodigoExtintor: { $in: codigosExtintores } };
      }
      
      const resultado = await this.extintorModel.updateMany(
        query,
        { $set: { inspeccionado: false } }
      );
      
      return { modified: resultado.modifiedCount };
    } catch (error) {
      console.error('Error al resetear estado de extintores:', error);
      throw new Error(`Error al resetear extintores: ${error.message}`);
    }
  }
}
