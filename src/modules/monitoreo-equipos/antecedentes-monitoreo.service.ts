import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Equipo } from '../equipos/schemas/equipo.schema';
import { BombasService, FichaBomba } from './bombas.service';
import { ESPECIFICACION_BOMBA } from './domain/bomba';
import { normalizarValor } from './domain/catalogos-iniciales';
import { minimosPorZona } from './domain/espesores';
import {
  AntecedentesReporte,
  armarAntecedentes,
  EstadoReporte,
  FichaDeAntecedentes,
  MedicionAnterior,
  PiezaDelReporte,
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
  /** Falta si el tag no está en el inventario (se habilitó por su plantilla). */
  equipo_id?: Types.ObjectId;
  /** «Bomba», el tipo del inventario, o nada si no está en el inventario. */
  tipo_equipo?: string;
  tag: string;
  antecedentes: AntecedentesReporte;
}

export interface OpcionesDeArmado {
  /** Sin bomba en el inventario no es error: el tag tiene plantilla de medición. */
  sinFicha?: boolean;
  /** La medición anterior se busca entre los reportes de esta técnica. */
  tecnica?: string;
}

type ReporteAnterior = Pick<
  ReporteMonitoreo,
  '_id' | 'codigo_interno' | 'fecha' | 'tecnica' | 'medicion'
>;

/**
 * Arma la sección ANTECEDENTES con lo que el sistema ya sabe del equipo: la
 * ficha de la bomba si lo es, el último informe emitido y, si hubo, los
 * mínimos de la última medición de espesores.
 */
@Injectable()
export class AntecedentesMonitoreoService {
  constructor(
    private readonly bombas: BombasService,
    @InjectModel(ReporteMonitoreo.name)
    private readonly reporteModel: Model<ReporteMonitoreo>,
    @InjectModel(Equipo.name)
    private readonly equipoModel: Model<Equipo>,
  ) {}

  /**
   * @param excluir el propio reporte: no puede ser su propio «informe anterior».
   * @param piezas las que el analista completó en el reporte, si las tocó.
   */
  async armar(
    tag: string,
    fecha: Date,
    horas?: number,
    excluir?: Types.ObjectId,
    piezas?: PiezaDelReporte[],
    opciones: OpcionesDeArmado = {},
  ): Promise<Prellenado> {
    const ficha = opciones.sinFicha
      ? await this.bombas.fichaSiExiste(tag)
      : await this.bombas.ficha(tag);
    const codigo = ficha?.equipo.codigo ?? tag.trim().toUpperCase();
    const equipo =
      ficha?.equipo ??
      (await this.equipoModel.findOne({ codigo }).lean<Equipo>().exec());
    const anteriores = await this.reporteModel
      .find({
        tag: codigo,
        estado: EstadoReporte.EMITIDO,
        fecha: { $lte: fecha },
        ...(excluir ? { _id: { $ne: excluir } } : {}),
      })
      .select('codigo_interno fecha tecnica medicion')
      .sort({ fecha: -1, emitidoEn: -1 })
      .lean<ReporteAnterior[]>()
      .exec();
    const anterior = anteriores[0];

    return {
      equipo_id: equipo?._id as Types.ObjectId | undefined,
      tipo_equipo: equipo?.tipo_equipo,
      tag: codigo,
      antecedentes: armarAntecedentes({
        ahora: new Date(),
        fecha,
        horas,
        ficha: ficha ? this.ficha(ficha) : {},
        componentes: (ficha?.componentes ?? [])
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
        intervenciones: (ficha?.intervenciones ?? []).map((i) => ({
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
        medicionAnterior: this.medicionAnterior(anteriores, opciones.tecnica),
        piezasDelReporte: piezas,
      }),
    };
  }

  /** La última medición de espesores emitida, de la misma técnica si se sabe. */
  private medicionAnterior(
    anteriores: ReporteAnterior[],
    tecnica?: string,
  ): MedicionAnterior | undefined {
    const misma = (t?: string) =>
      !tecnica || normalizarValor(t ?? '') === normalizarValor(tecnica);
    const r = anteriores.find((x) => x.medicion && misma(x.tecnica));
    if (!r?.medicion) return undefined;
    return {
      id: String(r._id),
      codigo_interno: r.codigo_interno,
      fecha: r.fecha,
      minimos: minimosPorZona(r.medicion.estructura, r.medicion.valores),
    };
  }

  private ficha({ equipo }: FichaBomba): FichaDeAntecedentes {
    const e = (equipo.especificaciones ?? {}) as Record<string, unknown>;
    return {
      fabricante: comoTexto(equipo.marca),
      modelo: comoTexto(equipo.modelo),
      alcance: comoTexto(e[ESPECIFICACION_BOMBA.alcance]),
      tag_pi: comoTexto(e[ESPECIFICACION_BOMBA.tagPi]),
      ot_modelo: comoTexto(e[ESPECIFICACION_BOMBA.otModelo]),
      frecuencia_dias: comoNumero(e[ESPECIFICACION_BOMBA.frecuencia]),
    };
  }
}
