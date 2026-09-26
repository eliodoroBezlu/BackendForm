import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { Ubicacion, UbicacionDocument } from './schemas/ubicacion.schema';
import {
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';

@Injectable()
export class UbicacionService {
  constructor(
    @InjectModel(Ubicacion.name)
    private readonly ubicacionModel: Model<UbicacionDocument>,
  ) {}

  async create(createDto: CreateUbicacionDto): Promise<Ubicacion> {
    const nombreClean = createDto.nombre.trim();

    // Check duplication case-insensitive
    const exists = await this.ubicacionModel
      .findOne({
        nombre: {
          $regex: new RegExp(`^${this.escapeRegex(nombreClean)}$`, 'i'),
        },
      })
      .exec();

    if (exists) {
      throw new ConflictException(`La ubicación '${nombreClean}' ya existe`);
    }

    const created = new this.ubicacionModel({
      nombre: nombreClean,
      activo: createDto.activo !== undefined ? createDto.activo : true,
    });

    return await created.save();
  }

  async findAll(): Promise<Ubicacion[]> {
    return this.ubicacionModel.find().sort({ nombre: 1 }).exec();
  }

  async findOne(id: string): Promise<Ubicacion> {
    const item = await this.ubicacionModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Ubicación con ID ${id} no encontrada`);
    }
    return item;
  }

  async findByNameOrCreate(name: string): Promise<Ubicacion> {
    const nameClean = name.trim();
    let item = await this.ubicacionModel
      .findOne({
        nombre: { $regex: new RegExp(`^${this.escapeRegex(nameClean)}$`, 'i') },
      })
      .exec();

    if (!item) {
      item = new this.ubicacionModel({
        nombre: nameClean,
        activo: true,
      });
      await item.save();
    }
    return item;
  }

  async update(id: string, updateDto: UpdateUbicacionDto): Promise<Ubicacion> {
    if (updateDto.nombre) {
      const nombreClean = updateDto.nombre.trim();
      const exists = await this.ubicacionModel
        .findOne({
          nombre: {
            $regex: new RegExp(`^${this.escapeRegex(nombreClean)}$`, 'i'),
          },
          _id: { $ne: id },
        })
        .exec();

      if (exists) {
        throw new ConflictException(`La ubicación '${nombreClean}' ya existe`);
      }
      updateDto.nombre = nombreClean;
    }

    const updated = await this.ubicacionModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Ubicación con ID ${id} no encontrada`);
    }
    return updated;
  }

  /**
   * Da de baja el registro; no lo borra.
   *
   * Devuelve el documento porque el interceptor de auditoria archiva lo que
   * devuelven los `DELETE`. Un `null` significa que no existe o que ya estaba
   * de baja: desde fuera las dos cosas son un 404.
   */
  async remove(id: string, usuario: string) {
    const result = await this.ubicacionModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();
    if (!result) {
      throw new NotFoundException(`Ubicación con ID ${id} no encontrada`);
    }
    return result;
  }

  /** Devuelve al uso un registro dado de baja. */
  async restaurar(id: string) {
    const result = await this.ubicacionModel
      .findOneAndUpdate({ _id: id, activo: false }, marcarRestaurado(), {
        new: true,
      })
      .exec();
    if (!result) {
      throw new NotFoundException(
        'No encontrado o no estaba dado de baja: ' + id,
      );
    }
    return result;
  }

  private escapeRegex(string: string) {
    return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
}
