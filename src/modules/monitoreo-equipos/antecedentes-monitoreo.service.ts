import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BombasService, FichaBomba } from './bombas.service';
import { ESPECIFICACION_BOMBA } from './domain/bomba';
import {
  AntecedentesReporte,
  armarAntecedentes,
  EstadoReporte,
  FichaDeAntecedentes,
} from './domain/reporte';
import { ReporteMonitoreo } from './schemas/reporte-monitoreo.schema';

/** Un número de la ficha: el panel de inventario puede haberlo guardado como texto. */
const comoNumero = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
/** Solo valores simples: un objeto en la ficha no es un dato que mostrar. */
const comoTexto = (v: unknown): string | undefined =>
  (typeof v === 'string' && v !== '') ||
  typeof v === 'number' ||
  typeof v === 'boolean'
    ? String(v)
    : undefined;

export interface Prellenado {
  equipo_id: Types.ObjectId;
  tag: string;
  antecedentes: AntecedentesReporte;
}

/** Arma la sección ANTECEDENTES con lo que el sistema ya sabe de la bomba. */
@Injectable()
export class AntecedentesMonitoreoService {
  constructor(
    private readonly bombas: BombasService,
    @InjectModel(ReporteMonitoreo.name)
    private readonly reporteModel: Model<ReporteMonitoreo>,
  ) {}

  /**
   * @param excluir el propio reporte: no puede ser su propio «informe anterior».
   */
  async armar(
    tag: string,
    fecha: Date,
    horas?: number,
    excluir?: Types.ObjectId,
  ): Promise<Prellenado> {
    const ficha = await this.bombas.ficha(tag);
    const anterior = await this.reporteModel
      .findOne({
        tag: ficha.equipo.codigo,
        estado: EstadoReporte.EMITIDO,
        fecha: { $lte: fecha },
        ...(excluir ? { _id: { $ne: excluir } } : {}),
      })
      .sort({ fecha: -1, emitidoEn: -1 })
      .lean<ReporteMonitoreo>()
      .exec();

    return {
      equipo_id: ficha.equipo._id as Types.ObjectId,
      tag: ficha.equipo.codigo,
      antecedentes: armarAntecedentes({
        ahora: new Date(),
        fecha,
        horas,
        ficha: this.ficha(ficha),
        componentes: ficha.componentes
          .filter((c) => c.vigente)
          .map((c) => ({
            pieza: c.pieza,
            proveedor: c.proveedor,
            material: c.material,
            dureza_hb: c.dureza_hb,
            condicion_inicial: c.condicion_inicial,
            espesor_nominal_mm: c.espesor_nominal_mm,
            espesor_precaucion_mm: c.espesor_precaucion_mm,
            fecha_instalacion: c.fecha_instalacion,
          })),
        intervenciones: ficha.intervenciones.map((i) => ({
          fecha: i.fecha,
          tipo: i.tipo,
          ot: i.ot,
          horas: i.horas,
          piezas: i.piezas ?? [],
        })),
        informeAnterior: anterior
          ? {
              id: String(anterior._id),
              codigo_interno: anterior.codigo_interno,
              fecha: anterior.fecha,
            }
          : undefined,
      }),
    };
  }

  private ficha({ equipo }: FichaBomba): FichaDeAntecedentes {
    const e = (equipo.especificaciones ?? {}) as Record<string, unknown>;
    return {
      fabricante: comoTexto(equipo.marca),
      modelo: comoTexto(equipo.modelo),
      servicio: comoTexto(e[ESPECIFICACION_BOMBA.servicio]),
      tmef_hrs: comoNumero(e[ESPECIFICACION_BOMBA.tmef]),
      tag_pi: comoTexto(e[ESPECIFICACION_BOMBA.tagPi]),
      pares: comoTexto(e[ESPECIFICACION_BOMBA.pares]),
      ot_modelo: comoTexto(e[ESPECIFICACION_BOMBA.otModelo]),
      frecuencia_dias: comoNumero(e[ESPECIFICACION_BOMBA.frecuencia]),
    };
  }
}
