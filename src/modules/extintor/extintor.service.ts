import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateExtintorDto } from './dto/create-extintor.dto';
import { UpdateExtintorDto } from './dto/update-extintor.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Extintor } from './schema/extintor.schema';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';

interface FiltrosExtintor {
  area?: string;
  tag?: string;
  codigo?: string;
  activo?: boolean;
  inspeccionado?: boolean;
}

@Injectable()
export class ExtintorService {
  private readonly logger = new Logger(ExtintorService.name);
  
  constructor(
    @InjectModel(Extintor.name)
    private readonly extintorModel: Model<Extintor>,
  ) {}

  async create(createExtintorDto: CreateExtintorDto) {
    try {
      const extintor = new this.extintorModel(createExtintorDto);
      return await extintor.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Ya existe un extintor con ese código');
      }
      throw new Error(`Error al crear extintor: ${error.message}`);
    }
  }

  async findAll() {
    try {
      return await this.extintorModel.find().exec();
    } catch (error) {
      throw new Error(`Error al obtener extintores: ${error.message}`);
    }
  }

  async findOne(id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('ID de extintor inválido');
      }

      const extintor = await this.extintorModel.findById(id).exec();
      
      if (!extintor) {
        throw new NotFoundException('Extintor no encontrado');
      }

      return extintor;
    } catch (error) {
      throw new Error(`Error al obtener extintor: ${error.message}`);
    }
  }

  async findWithFilters(filtros: FiltrosExtintor) {
    try {
      let query: any = {};

      if (filtros.area) {
        query.area = new RegExp(filtros.area, 'i');
      }
      if (filtros.tag) {
        query.tag = new RegExp(filtros.tag, 'i');
      }
      if (filtros.codigo) {
        query.CodigoExtintor = new RegExp(filtros.codigo, 'i');
      }
      if (filtros.activo !== undefined) {
        query.activo = filtros.activo;
      }
      if (filtros.inspeccionado !== undefined) {
        query.inspeccionado = filtros.inspeccionado;
      }

      return await this.extintorModel.find(query).exec();
    } catch (error) {
      throw new Error(`Error al buscar extintores con filtros: ${error.message}`);
    }
  }

  async findByTag(tag: string) {
    try {
      console.log('Servicio - Buscando tag:', tag);
      
      const result = await this.extintorModel
        .find({
          tag: new RegExp(`^${tag}$`, 'i'),
          inspeccionado: false,
          activo: true,
        })
        .select('CodigoExtintor Ubicacion area tag inspeccionado activo')
        .lean()
        .exec();

      const uniqueTags = [...new Set(result.map(extintor => extintor.tag))];
      const tagCountMap = {};
      
      for (const tagItem of uniqueTags) {
        const count = await this.extintorModel
          .countDocuments({ 
            tag: tagItem,
            activo: true 
          })
          .exec();
        tagCountMap[tagItem] = count;
      }

      const extintoresConTotal = result.map(extintor => ({
        ...extintor,
        totalActivos: tagCountMap[extintor.tag]
      }));

      const totalExtintoresActivosArea = await this.extintorModel
        .countDocuments({ 
          tag: new RegExp(`^${tag}$`, 'i'),
          activo: true 
        })
        .exec();

      return {
        extintores: extintoresConTotal,
        totalActivosArea: totalExtintoresActivosArea
      };
    } catch (error) {
      console.error('Error en findByTag service:', error);
      throw new Error(`Error al buscar extintores: ${error.message}`);
    }
  }

  async findByArea(area: string) {
    try {
      console.log('Servicio - Buscando área:', area);
      
      const result = await this.extintorModel
        .find({
          area: new RegExp(area, 'i'),
          activo: true,
        })
        .select('CodigoExtintor Ubicacion area tag inspeccionado activo')
        .lean()
        .exec();

      const uniqueAreas = [...new Set(result.map(extintor => extintor.area))];
      const areaCountMap = {};
      
      for (const areaItem of uniqueAreas) {
        const count = await this.extintorModel
          .countDocuments({ 
            area: areaItem,
            activo: true 
          })
          .exec();
        areaCountMap[areaItem] = count;
      }

      const extintoresConTotal = result.map(extintor => ({
        ...extintor,
        totalActivos: areaCountMap[extintor.area]
      }));

      const totalExtintoresActivosArea = await this.extintorModel
        .countDocuments({ 
          area: new RegExp(area, 'i'),
          activo: true 
        })
        .exec();

      return {
        extintores: extintoresConTotal,
        totalActivosArea: totalExtintoresActivosArea
      };
    } catch (error) {
      console.error('Error en findByArea service:', error);
      throw new Error(`Error al buscar extintores: ${error.message}`);
    }
  }

  async findByCodigo(codigoExtintor: string) {
    try {
      if (!codigoExtintor) {
        throw new Error('El código del extintor es requerido');
      }

      const result = await this.extintorModel
        .find({
          CodigoExtintor: codigoExtintor,
        })
        .lean()
        .exec();

      return result;
    } catch (error) {
      this.logger.error(
        `Error al buscar extintor por código ${codigoExtintor}: ${error.message}`,
      );
      throw new Error(`Error al buscar extintor: ${error.message}`);
    }
  }

  async update(id: string, updateExtintorDto: UpdateExtintorDto) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('ID de extintor inválido');
      }

      const extintor = await this.extintorModel
        .findByIdAndUpdate(id, updateExtintorDto, { new: true })
        .exec();

      if (!extintor) {
        throw new NotFoundException('Extintor no encontrado');
      }

      return extintor;
    } catch (error) {
      throw new Error(`Error al actualizar extintor: ${error.message}`);
    }
  }

  async remove(id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('ID de extintor inválido');
      }

      const result = await this.extintorModel.findByIdAndDelete(id).exec();
      
      if (!result) {
        throw new NotFoundException('Extintor no encontrado');
      }

      return { deletedCount: 1 };
    } catch (error) {
      throw new Error(`Error al eliminar extintor: ${error.message}`);
    }
  }

  async marcarExtintoresComoInspeccionados(codigosExtintores: string[]) {
    if (!codigosExtintores || codigosExtintores.length === 0) {
      return { modified: 0 };
    }

    try {
      const resultado = await this.extintorModel.updateMany(
        { CodigoExtintor: { $in: codigosExtintores } },
        { $set: { inspeccionado: true } },
      );

      return { modified: resultado.modifiedCount };
    } catch (error) {
      console.error('Error al marcar extintores como inspeccionados:', error);
      throw new Error(`Error al actualizar extintores: ${error.message}`);
    }
  }

  async deshabilitarExtintor(codigoExtintor: string) {
    try {
      const resultado = await this.extintorModel.updateOne(
        { CodigoExtintor: codigoExtintor },
        { $set: { activo: false } },
      );

      if (resultado.matchedCount === 0) {
        return {
          exito: false,
          mensaje: 'No se encontró el extintor con ese código',
        };
      }

      return { 
        exito: true, 
        mensaje: 'Extintor desactivado correctamente' 
      };
    } catch (error) {
      console.error('Error al desactivar el extintor:', error);
      throw new Error(`Error al desactivar extintor: ${error.message}`);
    }
  }

  async resetearEstadoInspeccionado(codigosExtintores?: string[]) {
    try {
      let query = {};
      if (codigosExtintores && codigosExtintores.length > 0) {
        query = { CodigoExtintor: { $in: codigosExtintores } };
      }

      const resultado = await this.extintorModel.updateMany(query, {
        $set: { inspeccionado: false },
      });

      return { modified: resultado.modifiedCount };
    } catch (error) {
      console.error('Error al resetear estado de extintores:', error);
      throw new Error(`Error al resetear extintores: ${error.message}`);
    }
  }

  async verificarYCrearExtintores(
    extintores: any[],
    tag: string,
    area: string,
  ) {
    if (!extintores || extintores.length === 0) {
      return { creados: 0, actualizados: 0 };
    }

    let creados = 0;
    let actualizados = 0;

    for (const extintor of extintores) {
      try {
        if (!extintor.codigo) {
          this.logger.warn(`Extintor sin código detectado, omitiendo`);
          continue;
        }

        const existentes = await this.findByCodigo(extintor.codigo);

        if (!existentes || existentes.length === 0) {
          const nuevoExtintor = new this.extintorModel({
            CodigoExtintor: extintor.codigo,
            Ubicacion: extintor.ubicacion || 'No especificada',
            tag: tag,
            inspeccionado: true,
            activo: true,
            area: area,
          });

          await nuevoExtintor.save();
          creados++;
          this.logger.log(`Extintor creado: ${extintor.codigo} en área ${tag}`);
        } else {
          const extintorExistente = existentes[0];
          if (!extintorExistente.activo) {
            await this.extintorModel.updateOne(
              { CodigoExtintor: extintor.codigo },
              {
                $set: {
                  inspeccionado: true,
                  activo: true,
                  tag: tag,
                  Ubicacion: extintor.ubicacion || extintorExistente.Ubicacion,
                  area: area,
                },
              },
            );
            actualizados++;
            this.logger.log(`Extintor reactivado: ${extintor.codigo}`);
          }
        }
      } catch (error) {
        this.logger.error(
          `Error al procesar extintor ${extintor?.codigo}: ${error.message}`,
        );
      }
    }

    return { creados, actualizados };
  }

   @Cron('59 23 * * *', {
    name: 'reseteo-extintores-fin-mes',
    timeZone: 'America/La_Paz', // ← Ajusta tu zona horaria
  })
  async resetearTodosLosExtintoresFinalMes() {
    const ahora = new Date();
    const manana = new Date(ahora);
    manana.setDate(ahora.getDate() + 1);

    // Verificar si mañana es día 1 (hoy es el último día del mes)
    const esFinDeMes = manana.getDate() === 1;

    if (!esFinDeMes) {
      // No logear nada para evitar spam, o usar debug
      this.logger.debug(
        `⏭️ Hoy no es fin de mes (${ahora.getDate()}/${ahora.getMonth() + 1}). Saltando.`
      );
      return { executed: false, reason: 'No es fin de mes' };
    }

    try {
      this.logger.log(
        `🔥 ÚLTIMO DÍA DEL MES (${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()}) - Reseteando extintores...`
      );

      const resultado = await this.extintorModel.updateMany(
        { inspeccionado: true }, // ← Optimización: solo actualizar los que están en true
        { $set: { inspeccionado: false } },
      );

      this.logger.log(
        `✅ Reseteo fin de mes completado exitosamente. ${resultado.modifiedCount} extintores actualizados.`
      );

      // Opcional: Guardar log en BD para auditoría
      // await this.logModel.create({
      //   accion: 'RESETEO_FIN_MES',
      //   fecha: ahora,
      //   extintoresAfectados: resultado.modifiedCount,
      // });

      return {
        executed: true,
        modified: resultado.modifiedCount,
        date: ahora.toISOString(),
        mes: ahora.getMonth() + 1,
        año: ahora.getFullYear(),
      };

    } catch (error) {
      this.logger.error(
        `❌ Error en reseteo automático fin de mes: ${error.message}`,
        error.stack,
      );

      // Opcional: Enviar notificación de error
      // await this.notificationService.sendAlert('Error en reseteo de extintores', error);

      throw new Error(
        `Error al resetear estado de extintores: ${error.message}`,
      );
    }
  }
}