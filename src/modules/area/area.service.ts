import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async create(createAreaDto: CreateAreaDto, usuario: string) {
    // Buscar la superintendencia por ID
    const superintendencia = await this.superintendenciaModel.findById(
      createAreaDto.superintendencia
    );

    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con ID "${createAreaDto.superintendencia}" no encontrada`
      );
    }

    // Verificar que la superintendencia esté activa
    if (!superintendencia.activo) {
      throw new BadRequestException(
        'No se puede crear un área en una superintendencia inactiva'
      );
    }

    // Verificar si ya existe un área con ese nombre en la misma superintendencia
    const existe = await this.areaModel.findOne({
      nombre: { $regex: new RegExp(`^${createAreaDto.nombre}$`, 'i') },
      superintendencia: superintendencia._id,
    });

    if (existe) {
      throw new BadRequestException(
        `Ya existe un área con el nombre "${createAreaDto.nombre}" en esta superintendencia`
      );
    }

    const area = new this.areaModel({
      nombre: createAreaDto.nombre,
      superintendencia: superintendencia._id,
      creadoPor: usuario,
      activo: createAreaDto.activo ?? true,
    });

    return await area.save();
  }

  async buscarArea(query: string): Promise<string[]> {
    // Si query no es válido, retornar las primeras 20 áreas activas
    if (typeof query !== 'string' || query.trim() === '') {
      const areas = await this.areaModel
        .find({ activo: true })
        .limit(20)
        .exec();
      return areas.map((area) => area.nombre);
    }

    // Búsqueda con regex
    const areas = await this.areaModel
      .find({ 
        nombre: { $regex: query, $options: 'i' },
        activo: true 
      })
      .limit(20)
      .exec();

    return areas.map((area) => area.nombre);
  }

  async findAll() {
    return await this.areaModel
      .find()
      .populate('superintendencia')
      .sort({ nombre: 1 })
      .exec();
  }

  async findOne(id: string) {
    const area = await this.areaModel
      .findById(id)
      .populate('superintendencia')
      .exec();

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    return area;
  }

  async update(id: string, updateAreaDto: UpdateAreaDto, usuario: string) {
    const area = await this.areaModel.findById(id);

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    // Si se actualiza la superintendencia, verificar que exista y esté activa
    if (updateAreaDto.superintendencia) {
      const superintendencia = await this.superintendenciaModel.findById(
        updateAreaDto.superintendencia
      );

      if (!superintendencia) {
        throw new NotFoundException(
          `Superintendencia con ID "${updateAreaDto.superintendencia}" no encontrada`
        );
      }

      if (!superintendencia.activo) {
        throw new BadRequestException(
          'No se puede asignar un área a una superintendencia inactiva'
        );
      }
    }

    // Si se actualiza el nombre, verificar duplicados
    if (updateAreaDto.nombre) {
      const superintendenciaId = updateAreaDto.superintendencia || area.superintendencia;
      
      const existe = await this.areaModel.findOne({
        nombre: { $regex: new RegExp(`^${updateAreaDto.nombre}$`, 'i') },
        superintendencia: superintendenciaId,
        _id: { $ne: id }
      });

      if (existe) {
        throw new BadRequestException(
          `Ya existe otra área con el nombre "${updateAreaDto.nombre}" en esta superintendencia`
        );
      }
    }

    const areaActualizada = await this.areaModel.findByIdAndUpdate(
      id,
      { 
        ...updateAreaDto,
        actualizadoPor: usuario,
      },
      { new: true }
    ).populate('superintendencia');

    return areaActualizada;
  }

  async desactivar(id: string, usuario: string) {
    const area = await this.areaModel.findById(id);

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    if (!area.activo) {
      return {
        exito: false,
        mensaje: 'El área ya está desactivada'
      };
    }

    area.activo = false;
    area.actualizadoPor = usuario;
    await area.save();

    return {
      exito: true,
      mensaje: 'Área desactivada correctamente'
    };
  }

  async activar(id: string, usuario: string) {
    const area = await this.areaModel.findById(id).populate('superintendencia');

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    // Verificar que la superintendencia esté activa
    const superintendencia = area.superintendencia as any;
    if (!superintendencia.activo) {
      throw new BadRequestException(
        'No se puede activar un área cuya superintendencia está inactiva'
      );
    }

    area.activo = true;
    area.actualizadoPor = usuario;
    await area.save();

    return area;
  }

  async remove(id: string) {
    // Importante: Verificar si hay extintores asociados antes de eliminar
    const result = await this.areaModel.findByIdAndDelete(id);

    if (!result) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    return { 
      success: true, 
      message: 'Área eliminada correctamente' 
    };
  }
}