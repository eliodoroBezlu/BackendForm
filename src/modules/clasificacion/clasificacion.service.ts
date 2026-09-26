import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateClasificacionDto } from './dto/create-clasificacion.dto';
import { UpdateClasificacionDto } from './dto/update-clasificacion.dto';
import {
  Clasificacion,
  ClasificacionDocument,
} from './schemas/clasificacion.schema';
import {
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';

@Injectable()
export class ClasificacionService {
  constructor(
    @InjectModel(Clasificacion.name)
    private readonly clasificacionModel: Model<ClasificacionDocument>,
  ) {}

  async create(createDto: CreateClasificacionDto): Promise<Clasificacion> {
    const nombreClean = createDto.nombre.trim();

    // Check duplication case-insensitive
    const exists = await this.clasificacionModel
      .findOne({
        nombre: {
          $regex: new RegExp(`^${this.escapeRegex(nombreClean)}$`, 'i'),
        },
      })
      .exec();

    if (exists) {
      throw new ConflictException(
        `La clasificación '${nombreClean}' ya existe`,
      );
    }

    const created = new this.clasificacionModel({
      nombre: nombreClean,
      activo: createDto.activo !== undefined ? createDto.activo : true,
    });

    return await created.save();
  }

  async findAll(): Promise<Clasificacion[]> {
    return this.clasificacionModel.find().sort({ nombre: 1 }).exec();
  }

  async findOne(id: string): Promise<Clasificacion> {
    const item = await this.clasificacionModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Clasificación con ID ${id} no encontrada`);
    }
    return item;
  }

  async findByNameOrCreate(name: string): Promise<Clasificacion> {
    const nameClean = name.trim();
    let item = await this.clasificacionModel
      .findOne({
        nombre: { $regex: new RegExp(`^${this.escapeRegex(nameClean)}$`, 'i') },
      })
      .exec();

    if (!item) {
      item = new this.clasificacionModel({
        nombre: nameClean,
        activo: true,
      });
      await item.save();
    }
    return item;
  }

  async update(
    id: string,
    updateDto: UpdateClasificacionDto,
  ): Promise<Clasificacion> {
    if (updateDto.nombre) {
      const nombreClean = updateDto.nombre.trim();
      const exists = await this.clasificacionModel
        .findOne({
          nombre: {
            $regex: new RegExp(`^${this.escapeRegex(nombreClean)}$`, 'i'),
          },
          _id: { $ne: id },
        })
        .exec();

      if (exists) {
        throw new ConflictException(
          `La clasificación '${nombreClean}' ya existe`,
        );
      }
      updateDto.nombre = nombreClean;
    }

    const updated = await this.clasificacionModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Clasificación con ID ${id} no encontrada`);
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
    const result = await this.clasificacionModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();
    if (!result) {
      throw new NotFoundException(`Clasificación con ID ${id} no encontrada`);
    }
    return result;
  }

  /** Devuelve al uso un registro dado de baja. */
  async restaurar(id: string) {
    const result = await this.clasificacionModel
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
