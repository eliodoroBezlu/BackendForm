import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateGerenciaDto } from './dto/create-gerencia.dto';
import { UpdateGerenciaDto } from './dto/update-gerencia.dto';
import { Gerencia } from './schemas/gerencia.schema';
import { Superintendencia } from '../superintendencia/schemas/superintendencia.schema';

/**
 * Gerencias: el nivel que faltaba en la cadena
 * **Gerencia → Superintendencia → Área → subárea**.
 *
 * Espeja a `SuperintendenciaService` a propósito: mismas operaciones, mismos
 * mensajes y el mismo criterio de que nada se borra si tiene hijos.
 */
@Injectable()
export class GerenciaService {
  constructor(
    @InjectModel(Gerencia.name)
    private readonly gerenciaModel: Model<Gerencia>,
    @InjectModel(Superintendencia.name)
    private readonly superintendenciaModel: Model<Superintendencia>,
  ) {}

  /** Escapa el texto: el nombre lo escribe el usuario y va dentro de un RegExp. */
  private exacto(nombre: string): RegExp {
    return new RegExp(
      `^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i',
    );
  }

  async create(createGerenciaDto: CreateGerenciaDto, usuario: string) {
    const existe = await this.gerenciaModel.findOne({
      nombre: { $regex: this.exacto(createGerenciaDto.nombre) },
    });

    if (existe) {
      throw new BadRequestException(
        `Ya existe una gerencia con el nombre "${createGerenciaDto.nombre}"`,
      );
    }

    return await new this.gerenciaModel({
      ...createGerenciaDto,
      creadoPor: usuario,
      activo: createGerenciaDto.activo ?? true,
    }).save();
  }

  async buscarGerencia(query: string): Promise<string[]> {
    const filtro =
      typeof query === 'string' && query.trim() !== ''
        ? { nombre: { $regex: query, $options: 'i' }, activo: true }
        : { activo: true };

    const gerencias = await this.gerenciaModel.find(filtro).limit(20).exec();
    return gerencias.map((g) => g.nombre);
  }

  async findAll() {
    return await this.gerenciaModel.find().sort({ nombre: 1 }).exec();
  }

  async findOne(id: string) {
    const gerencia = await this.gerenciaModel.findById(id).exec();
    if (!gerencia) {
      throw new NotFoundException(`Gerencia con ID "${id}" no encontrada`);
    }
    return gerencia;
  }

  /** Las superintendencias que cuelgan de esta gerencia. */
  async superintendencias(id: string) {
    await this.findOne(id);
    return this.superintendenciaModel
      .find({ gerencia_id: id })
      .sort({ nombre: 1 })
      .exec();
  }

  async update(
    id: string,
    updateGerenciaDto: UpdateGerenciaDto,
    usuario: string,
  ) {
    if (updateGerenciaDto.nombre) {
      const existe = await this.gerenciaModel.findOne({
        nombre: { $regex: this.exacto(updateGerenciaDto.nombre) },
        _id: { $ne: id },
      });
      if (existe) {
        throw new BadRequestException(
          `Ya existe otra gerencia con el nombre "${updateGerenciaDto.nombre}"`,
        );
      }
    }

    const gerencia = await this.gerenciaModel.findByIdAndUpdate(
      id,
      { ...updateGerenciaDto, actualizadoPor: usuario },
      { new: true },
    );

    if (!gerencia) {
      throw new NotFoundException(`Gerencia con ID "${id}" no encontrada`);
    }
    return gerencia;
  }

  async desactivar(id: string, usuario: string) {
    const gerencia = await this.findOne(id);
    if (!gerencia.activo) {
      return { exito: false, mensaje: 'La gerencia ya está desactivada' };
    }

    gerencia.activo = false;
    gerencia.actualizadoPor = usuario;
    await gerencia.save();
    return { exito: true, mensaje: 'Gerencia desactivada correctamente' };
  }

  async activar(id: string, usuario: string) {
    const gerencia = await this.findOne(id);
    if (gerencia.activo) {
      return { exito: false, mensaje: 'La gerencia ya está activa' };
    }

    gerencia.activo = true;
    gerencia.actualizadoPor = usuario;
    await gerencia.save();
    return { exito: true, mensaje: 'Gerencia activada correctamente' };
  }

  async remove(id: string) {
    // Borrar una gerencia con superintendencias dejaría a esas huérfanas y a
    // sus áreas sin raíz: se desactiva, no se borra.
    const colgando = await this.superintendenciaModel.countDocuments({
      gerencia_id: id,
    });
    if (colgando > 0) {
      throw new BadRequestException(
        `No se puede eliminar: ${colgando} superintendencia(s) dependen de esta gerencia. Desactivala en su lugar.`,
      );
    }

    const gerencia = await this.gerenciaModel.findByIdAndDelete(id).exec();
    if (!gerencia) {
      throw new NotFoundException(`Gerencia con ID "${id}" no encontrada`);
    }
    return { exito: true, mensaje: 'Gerencia eliminada correctamente' };
  }
}
