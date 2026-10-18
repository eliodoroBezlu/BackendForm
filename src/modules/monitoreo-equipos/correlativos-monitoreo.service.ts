import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CorrelativoMonitoreo } from './schemas/correlativo-monitoreo.schema';

const esDuplicado = (error: unknown) =>
  (error as { code?: number })?.code === 11000;

/** El correlativo del código interno, por técnica y año. */
@Injectable()
export class CorrelativosMonitoreoService {
  constructor(
    @InjectModel(CorrelativoMonitoreo.name)
    private readonly modelo: Model<CorrelativoMonitoreo>,
  ) {}

  listar(): Promise<CorrelativoMonitoreo[]> {
    return this.modelo.find().sort({ anio: -1, tecnica_codigo: 1 }).exec();
  }

  /** Reserva el siguiente número. Atómico: dos emisiones no comparten uno. */
  async siguiente(tecnicaCodigo: string, anio: number): Promise<number> {
    const incrementar = () =>
      this.modelo
        .findOneAndUpdate(
          { tecnica_codigo: tecnicaCodigo, anio },
          { $inc: { ultimo: 1 } },
          { upsert: true, new: true },
        )
        .exec();
    try {
      return (await incrementar()).ultimo;
    } catch (error) {
      // Dos `upsert` a la vez sobre un contador que no existía: uno inserta y
      // el otro choca con el índice único. Reintentar ya lo encuentra.
      if (!esDuplicado(error)) throw error;
      return (await incrementar()).ultimo;
    }
  }

  /**
   * Fija el último número usado, para seguir la numeración del Excel (si el
   * último fue COTEM-0137, el sistema emite desde el 0138).
   *
   * **Solo sube**: bajarlo haría que el sistema repita códigos ya emitidos.
   */
  async fijar(
    tecnicaCodigo: string,
    anio: number,
    ultimo: number,
  ): Promise<CorrelativoMonitoreo> {
    const actual = await this.modelo
      .findOne({ tecnica_codigo: tecnicaCodigo, anio })
      .exec();
    if (actual && actual.ultimo >= ultimo) {
      throw new ConflictException(
        `${tecnicaCodigo} ${anio} ya va en ${actual.ultimo}; solo se puede subir`,
      );
    }
    try {
      const fijado = await this.modelo
        .findOneAndUpdate(
          { tecnica_codigo: tecnicaCodigo, anio, ultimo: { $lt: ultimo } },
          { $set: { ultimo } },
          { upsert: true, new: true },
        )
        .exec();
      return fijado;
    } catch (error) {
      // Entre la lectura y la escritura se emitió un reporte que lo pasó.
      if (!esDuplicado(error)) throw error;
      throw new ConflictException(
        `${tecnicaCodigo} ${anio} ya pasó de ${ultimo}; solo se puede subir`,
      );
    }
  }
}
