import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FOTOS_POR_FILA_POR_DEFECTO } from './domain/reporte';
import { PlantillaMonitoreo } from './schemas/plantilla-monitoreo.schema';

export interface ConfiguracionPlantilla {
  tipo_equipo: string;
  fotos_por_fila: number;
}

/** La plantilla de reporte de cada tipo de equipo. */
@Injectable()
export class PlantillasMonitoreoService {
  constructor(
    @InjectModel(PlantillaMonitoreo.name)
    private readonly modelo: Model<PlantillaMonitoreo>,
  ) {}

  /** Sin plantilla guardada rige la de por defecto; leer no crea nada. */
  async obtener(tipoEquipo: string): Promise<ConfiguracionPlantilla> {
    const guardada = await this.modelo
      .findOne({ tipo_equipo: tipoEquipo })
      .lean<ConfiguracionPlantilla>()
      .exec();
    return {
      tipo_equipo: tipoEquipo,
      fotos_por_fila: guardada?.fotos_por_fila ?? FOTOS_POR_FILA_POR_DEFECTO,
    };
  }

  async guardar(
    tipoEquipo: string,
    fotosPorFila: number,
  ): Promise<ConfiguracionPlantilla> {
    await this.modelo
      .updateOne(
        { tipo_equipo: tipoEquipo },
        { $set: { fotos_por_fila: fotosPorFila } },
        { upsert: true, runValidators: true },
      )
      .exec();
    return { tipo_equipo: tipoEquipo, fotos_por_fila: fotosPorFila };
  }
}
