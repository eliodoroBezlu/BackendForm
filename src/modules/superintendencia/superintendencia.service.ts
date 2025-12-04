import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateSuperintendenciaDto } from './dto/create-superintendencia.dto';
import { UpdateSuperintendenciaDto } from './dto/update-superintendencia.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Superintendencia } from './schema/superintendencia.schema';
import { Model } from 'mongoose';

@Injectable()
export class SuperintendenciaService {

  constructor(
    @InjectModel(Superintendencia.name)
    private readonly superintendenciaModel: Model<Superintendencia>,
  ) {}

  async create(
    createSuperintendenciaDto: CreateSuperintendenciaDto, 
    usuario: string
  ) {
    // Verificar si ya existe una superintendencia con ese nombre
    const existe = await this.superintendenciaModel.findOne({
      nombre: { $regex: new RegExp(`^${createSuperintendenciaDto.nombre}$`, 'i') }
    });

    if (existe) {
      throw new BadRequestException(
        `Ya existe una superintendencia con el nombre "${createSuperintendenciaDto.nombre}"`
      );
    }

    const superintendencia = new this.superintendenciaModel({
      ...createSuperintendenciaDto,
      creadoPor: usuario,
      activo: createSuperintendenciaDto.activo ?? true,
    });

    return await superintendencia.save();
  }

  async buscarSuperintendencia(query: string): Promise<string[]> {
    // Si query no es válido, retornar las primeras 20
    if (typeof query !== 'string' || query.trim() === '') {
      const superintendencias = await this.superintendenciaModel
        .find({ activo: true })
        .limit(20)
        .exec();
      return superintendencias.map((sup) => sup.nombre);
    }

    // Si query es válido, realizar búsqueda con regex
    const superintendencias = await this.superintendenciaModel
      .find({ 
        nombre: { $regex: query, $options: 'i' },
        activo: true 
      })
      .limit(20)
      .exec();

    return superintendencias.map((sup) => sup.nombre);
  }

  async findAll() {
    return await this.superintendenciaModel
      .find()
      .sort({ nombre: 1 })
      .exec();
  }

  async findOne(id: string) {
    const superintendencia = await this.superintendenciaModel.findById(id).exec();
    
    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con ID "${id}" no encontrada`
      );
    }

    return superintendencia;
  }

  async update(
    id: string, 
    updateSuperintendenciaDto: UpdateSuperintendenciaDto,
    usuario: string
  ) {
    // Si se actualiza el nombre, verificar que no exista otro con ese nombre
    if (updateSuperintendenciaDto.nombre) {
      const existe = await this.superintendenciaModel.findOne({
        nombre: { $regex: new RegExp(`^${updateSuperintendenciaDto.nombre}$`, 'i') },
        _id: { $ne: id }
      });

      if (existe) {
        throw new BadRequestException(
          `Ya existe otra superintendencia con el nombre "${updateSuperintendenciaDto.nombre}"`
        );
      }
    }

    const superintendencia = await this.superintendenciaModel.findByIdAndUpdate(
      id,
      { 
        ...updateSuperintendenciaDto,
        actualizadoPor: usuario,
      },
      { new: true }
    );

    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con ID "${id}" no encontrada`
      );
    }

    return superintendencia;
  }

  async desactivar(id: string, usuario: string) {
    const superintendencia = await this.superintendenciaModel.findById(id);
    
    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con ID "${id}" no encontrada`
      );
    }

    if (!superintendencia.activo) {
      return {
        exito: false,
        mensaje: 'La superintendencia ya está desactivada'
      };
    }

    superintendencia.activo = false;
    superintendencia.actualizadoPor = usuario;
    await superintendencia.save();

    return {
      exito: true,
      mensaje: 'Superintendencia desactivada correctamente'
    };
  }

  async activar(id: string, usuario: string) {
    const superintendencia = await this.superintendenciaModel.findByIdAndUpdate(
      id,
      { 
        activo: true,
        actualizadoPor: usuario,
      },
      { new: true }
    );

    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con ID "${id}" no encontrada`
      );
    }

    return superintendencia;
  }

  async remove(id: string) {
    // Importante: Aquí deberías verificar si hay áreas asociadas
    // antes de permitir la eliminación física
    
    const result = await this.superintendenciaModel.findByIdAndDelete(id);

    if (!result) {
      throw new NotFoundException(
        `Superintendencia con ID "${id}" no encontrada`
      );
    }

    return { 
      success: true, 
      message: 'Superintendencia eliminada correctamente' 
    };
  }
}
