import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IngresoLinterna,
  StockLinterna,
} from './schemas/stock-linterna.schema';

const CLAVE = 'linterna';

@Injectable()
export class StockLinternasService {
  private readonly logger = new Logger(StockLinternasService.name);

  constructor(
    @InjectModel(StockLinterna.name)
    private readonly stockModel: Model<StockLinterna>,
    @InjectModel(IngresoLinterna.name)
    private readonly ingresoModel: Model<IngresoLinterna>,
  ) {}

  async disponible(): Promise<number> {
    const stock = await this.stockModel.findOne({ clave: CLAVE }).exec();
    return stock?.cantidadDisponible ?? 0;
  }

  /**
   * Descuenta una linterna. **Atómico y condicionado**: la condición
   * `cantidadDisponible > 0` viaja en el propio update, así que dos entregas
   * simultáneas no pueden llevarse la última.
   *
   * Un `leer → comprobar → escribir` aquí deja entregar dos linternas cuando
   * solo queda una, y el descuadre no se nota hasta el inventario.
   */
  async descontarUna(): Promise<void> {
    const resultado = await this.stockModel
      .findOneAndUpdate(
        { clave: CLAVE, cantidadDisponible: { $gt: 0 } },
        { $inc: { cantidadDisponible: -1 } },
        { new: true },
      )
      .exec();

    if (!resultado) {
      throw new ConflictException(
        'No hay linternas disponibles en stock. Registre un ingreso antes de entregar.',
      );
    }
  }

  /** Devuelve una unidad al stock cuando la entrega no llegó a completarse. */
  async reponerUna(): Promise<void> {
    await this.stockModel
      .updateOne({ clave: CLAVE }, { $inc: { cantidadDisponible: 1 } })
      .exec();
  }

  async registrarIngreso(
    cantidad: number,
    registradoPor: string,
    observacion?: string,
  ): Promise<{ cantidadDisponible: number }> {
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new ConflictException(
        'La cantidad de un ingreso debe ser un entero mayor que cero.',
      );
    }

    await this.ingresoModel.create({
      cantidad,
      fecha: new Date(),
      registradoPor,
      observacion,
    });

    const stock = await this.stockModel
      .findOneAndUpdate(
        { clave: CLAVE },
        { $inc: { cantidadDisponible: cantidad } },
        { new: true, upsert: true },
      )
      .exec();

    this.logger.log(
      `Ingreso de ${cantidad} linterna(s) por ${registradoPor}. Disponible: ${stock.cantidadDisponible}`,
    );
    return { cantidadDisponible: stock.cantidadDisponible };
  }

  async historialIngresos(): Promise<IngresoLinterna[]> {
    return this.ingresoModel.find({}).sort({ fecha: -1 }).exec();
  }
}
