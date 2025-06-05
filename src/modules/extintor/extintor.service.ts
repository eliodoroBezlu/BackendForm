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
          tag: new RegExp(tag, 'i'),
          inspeccionado: false,
          activo:true
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

  async findByCodigo(codigoExtintor: string) {
  try {
    if (!codigoExtintor) {
      throw new Error('El código del extintor es requerido');
    }
    
    // Corregido: campo "CodigoExtintor" en lugar de "Codigo" y exec() con paréntesis
    const result = await this.extintorModel
      .find({
        CodigoExtintor: codigoExtintor
      })
      .lean()
      .exec();
      
    return result;
  } catch (error) {
    this.logger.error(`Error al buscar extintor por código ${codigoExtintor}: ${error.message}`);
    throw new Error(`Error al buscar extintor: ${error.message}`);
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

async verificarYCrearExtintores(extintores: any[], tag: string, area:string) {
  if (!extintores || extintores.length === 0) {
    return { creados: 0, actualizados: 0 };
  }
  
  let creados = 0;
  let actualizados = 0;
  
  // Procesar cada extintor en la lista
  for (const extintor of extintores) {
    try {
      if (!extintor.codigo) {
        this.logger.warn(`Extintor sin código detectado, omitiendo`);
        continue;
      }
      
      // Verificar si el extintor ya existe
      const existentes = await this.findByCodigo(extintor.codigo);
      
      if (!existentes || existentes.length === 0) {
        // El extintor no existe, crear uno nuevo
        const nuevoExtintor = new this.extintorModel({
          CodigoExtintor: extintor.codigo,
          Ubicacion: extintor.ubicacion || 'No especificada',
          tag: tag,
          inspeccionado: true,
          activo: true,
          area: area
        });
        
        await nuevoExtintor.save();
        creados++;
        this.logger.log(`Extintor creado: ${extintor.codigo} en área ${tag}`);
      } else {
        // El extintor existe, actualizar si es necesario
        const extintorExistente = existentes[0];
        if (!extintorExistente.activo) {
          await this.extintorModel.updateOne(
            { CodigoExtintor: extintor.codigo },
            { 
              $set: { 
                inspeccionado: true,
                activo: true,
                Area: tag,
                Ubicacion: extintor.ubicacion || extintorExistente.Ubicacion
              } 
            }
          );
          actualizados++;
          this.logger.log(`Extintor reactivado: ${extintor.codigo}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error al procesar extintor ${extintor?.codigo}: ${error.message}`);
    }
  }
  
  return { creados, actualizados };
}


}
