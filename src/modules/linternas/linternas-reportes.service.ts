import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import {
  ESTADOS_SIN_EFECTO,
  EntregaLinterna,
  EstadoEntrega,
  TipoEntrega,
} from './schemas/entrega-linterna.schema';
import { StockLinternasService } from './stock-linternas.service';

export interface FilaPorArea {
  area: string;
  superintendencia: string;
  dotados: number;
  cambios: number;
  perdidas: number;
  /** Entregas que salieron de stock: dotaciones + cambios + pérdidas aprobadas. */
  entregadas: number;
}

export interface FilaPorTrabajador {
  trabajador: string;
  nombre: string;
  area: string;
  superintendencia: string;
  tieneDotacion: boolean;
  fechaDotacion?: Date;
  cambios: number;
  ultimoCambio?: Date;
  perdidas: number;
  ultimaEntrega?: Date;
  /** Dotación + cambios + pérdidas: cuántas linternas consumió en total. */
  totalRecibidas: number;
  pendienteDeAprobacion: boolean;
}

export interface ResumenLinternas {
  totalTrabajadores: number;
  conDotacion: number;
  sinDotacion: number;
  totalCambios: number;
  totalPerdidas: number;
  perdidasPendientes: number;
  stockDisponible: number;
  ingresadas: number;
  entregadas: number;
}

interface DocTrabajador {
  _id: Types.ObjectId;
}

/**
 * Los números que el cuaderno de papel no da: cuánta gente falta por dotar,
 * dónde se pierden más linternas y si el consumo cuadra con lo que entró.
 *
 * Va aparte del servicio de entregas porque son preguntas de lectura, con sus
 * propias agregaciones, y mezclarlas con las reglas de negocio engorda un
 * archivo que ya carga las siete invariantes.
 */
@Injectable()
export class LinternasReportesService {
  constructor(
    @InjectModel(EntregaLinterna.name)
    private readonly entregaModel: Model<EntregaLinterna>,
    @InjectModel('Trabajador')
    private readonly trabajadorModel: Model<DocTrabajador>,
    private readonly stock: StockLinternasService,
  ) {}

  /**
   * Una entrega «cuenta» si no fue rechazada. Las pérdidas pendientes todavía
   * no salieron de stock, así que tampoco suman como entregadas.
   */
  private get salioDeStock() {
    return {
      $or: [
        { tipo: { $ne: TipoEntrega.REPOSICION_PERDIDA } },
        { estado: EstadoEntrega.APROBADA },
      ],
      estado: { $nin: ESTADOS_SIN_EFECTO },
      // Las dotaciones anteriores al sistema no salieron de este stock: ya las
      // tenía la gente cuando se empezó a llevar la cuenta. Contarlas aquí
      // dejaría «entregadas» por encima de «ingresadas» sin que falte nada.
      previaAlSistema: { $ne: true },
    };
  }

  async resumen(): Promise<ResumenLinternas> {
    const [
      totalTrabajadores,
      dotados,
      totalCambios,
      totalPerdidas,
      perdidasPendientes,
      entregadas,
      stockDisponible,
      ingresos,
    ] = await Promise.all([
      this.trabajadorModel.countDocuments({ activo: { $ne: false } }),
      this.entregaModel.countDocuments({ tipo: TipoEntrega.DOTACION }),
      this.entregaModel.countDocuments({
        tipo: TipoEntrega.CAMBIO,
        estado: { $nin: ESTADOS_SIN_EFECTO },
      }),
      this.entregaModel.countDocuments({
        tipo: TipoEntrega.REPOSICION_PERDIDA,
        estado: { $nin: ESTADOS_SIN_EFECTO },
      }),
      this.entregaModel.countDocuments({
        estado: EstadoEntrega.PENDIENTE_APROBACION,
      }),
      this.entregaModel.countDocuments(this.salioDeStock),
      this.stock.disponible(),
      this.stock.historialIngresos(),
    ]);

    return {
      totalTrabajadores,
      conDotacion: dotados,
      sinDotacion: Math.max(0, totalTrabajadores - dotados),
      totalCambios,
      totalPerdidas,
      perdidasPendientes,
      stockDisponible,
      ingresadas: ingresos.reduce((suma, i) => suma + i.cantidad, 0),
      entregadas,
    };
  }

  /** Distribución por área, para ver dónde se concentran las pérdidas. */
  async porArea(): Promise<FilaPorArea[]> {
    const etapas: PipelineStage[] = [
      { $match: { estado: { $nin: ESTADOS_SIN_EFECTO } } },
      {
        $group: {
          _id: { area: '$area', superintendencia: '$superintendencia' },
          dotados: {
            $sum: { $cond: [{ $eq: ['$tipo', TipoEntrega.DOTACION] }, 1, 0] },
          },
          cambios: {
            $sum: { $cond: [{ $eq: ['$tipo', TipoEntrega.CAMBIO] }, 1, 0] },
          },
          perdidas: {
            $sum: {
              $cond: [{ $eq: ['$tipo', TipoEntrega.REPOSICION_PERDIDA] }, 1, 0],
            },
          },
          // Mismo criterio que `salioDeStock`, escrito como expresión porque
          // aquí es un `$cond` dentro del grupo y no un filtro. Si cambia uno
          // hay que cambiar el otro: el resumen y este desglose cuentan lo
          // mismo y discrepar entre ellos es peor que no tener el dato.
          entregadas: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $or: [
                        { $ne: ['$tipo', TipoEntrega.REPOSICION_PERDIDA] },
                        { $eq: ['$estado', EstadoEntrega.APROBADA] },
                      ],
                    },
                    { $ne: ['$previaAlSistema', true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { perdidas: -1, '_id.area': 1 } },
    ];

    const filas = await this.entregaModel
      .aggregate<{
        _id: { area: string; superintendencia: string };
        dotados: number;
        cambios: number;
        perdidas: number;
        entregadas: number;
      }>(etapas)
      .exec();

    return filas.map((f) => ({
      area: f._id.area,
      superintendencia: f._id.superintendencia,
      dotados: f.dotados,
      cambios: f.cambios,
      perdidas: f.perdidas,
      entregadas: f.entregadas,
    }));
  }

  /**
   * Una fila por persona **con movimientos**: si recibió dotación y cuándo,
   * cuántas veces cambió y cuándo fue la última, y cuántas perdió.
   *
   * Ordena por total recibido, que es la pregunta real detrás del reporte:
   * quién está consumiendo más linternas. Los que nunca recibieron nada no
   * salen aquí —no tienen movimientos que contar— sino en `sinDotacion()`.
   *
   * El área se toma con `$last` sobre el orden cronológico: si la persona
   * cambió de área, interesa dónde está ahora, aunque cada entrega conserve la
   * suya para el acta.
   */
  async porTrabajador(): Promise<FilaPorTrabajador[]> {
    const esTipo = (tipo: TipoEntrega) => ({ $eq: ['$tipo', tipo] });

    const etapas: PipelineStage[] = [
      { $match: { estado: { $nin: ESTADOS_SIN_EFECTO } } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$trabajador',
          nombre: { $first: '$nombreTrabajador' },
          area: { $last: '$area' },
          superintendencia: { $last: '$superintendencia' },
          fechaDotacion: {
            // `$min` ignora los nulos, así que sale la fecha de la dotación.
            $min: {
              $cond: [esTipo(TipoEntrega.DOTACION), '$fechaEntrega', null],
            },
          },
          cambios: { $sum: { $cond: [esTipo(TipoEntrega.CAMBIO), 1, 0] } },
          ultimoCambio: {
            $max: {
              $cond: [esTipo(TipoEntrega.CAMBIO), '$fechaEntrega', null],
            },
          },
          perdidas: {
            $sum: {
              $cond: [esTipo(TipoEntrega.REPOSICION_PERDIDA), 1, 0],
            },
          },
          ultimaEntrega: { $max: '$fechaEntrega' },
          totalRecibidas: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $ne: ['$tipo', TipoEntrega.REPOSICION_PERDIDA] },
                    { $eq: ['$estado', EstadoEntrega.APROBADA] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          pendientes: {
            $sum: {
              $cond: [
                { $eq: ['$estado', EstadoEntrega.PENDIENTE_APROBACION] },
                1,
                0,
              ],
            },
          },
          dotaciones: {
            $sum: { $cond: [esTipo(TipoEntrega.DOTACION), 1, 0] },
          },
        },
      },
      { $sort: { totalRecibidas: -1, nombre: 1 } },
    ];

    const filas = await this.entregaModel
      .aggregate<{
        _id: Types.ObjectId;
        nombre: string;
        area: string;
        superintendencia: string;
        fechaDotacion?: Date;
        cambios: number;
        ultimoCambio?: Date;
        perdidas: number;
        ultimaEntrega?: Date;
        totalRecibidas: number;
        pendientes: number;
        dotaciones: number;
      }>(etapas)
      .exec();

    return filas.map((f) => ({
      trabajador: String(f._id),
      nombre: f.nombre,
      area: f.area,
      superintendencia: f.superintendencia,
      tieneDotacion: f.dotaciones > 0,
      fechaDotacion: f.fechaDotacion ?? undefined,
      cambios: f.cambios,
      ultimoCambio: f.ultimoCambio ?? undefined,
      perdidas: f.perdidas,
      ultimaEntrega: f.ultimaEntrega ?? undefined,
      totalRecibidas: f.totalRecibidas,
      pendienteDeAprobacion: f.pendientes > 0,
    }));
  }

  /** Pérdidas de un período, para la revisión mensual. */
  async perdidas(desde?: string, hasta?: string): Promise<EntregaLinterna[]> {
    const rango: Record<string, Date> = {};
    if (desde) rango.$gte = new Date(desde);
    if (hasta) rango.$lte = new Date(hasta);

    return this.entregaModel
      .find({
        tipo: TipoEntrega.REPOSICION_PERDIDA,
        ...(Object.keys(rango).length ? { createdAt: rango } : {}),
      })
      .sort({ createdAt: -1 })
      .exec();
  }
}
