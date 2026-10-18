import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Equipo } from '../../equipos/schemas/equipo.schema';
import {
  DestinoEquipo,
  DestinoNoResuelto,
  ResolucionOrganizacionalService,
} from '../../equipos/importacion/resolucion-organizacional.service';
import { UbicacionService } from '../../ubicacion/ubicacion.service';
import {
  partirRuta,
  PROFUNDIDAD_MAXIMA,
} from '../../ubicacion/arbol/ubicacion-arbol';
import { ClasificacionService } from '../../clasificacion/clasificacion.service';
import {
  AREA_CONFIABILIDAD,
  CLASIFICACION_BOMBAS,
  ESPECIFICACION_BOMBA,
  TIPO_EQUIPO_BOMBA,
  UBICACION_POR_DEFECTO,
} from '../domain/bomba';
import { TipoCatalogoMonitoreo } from '../domain/catalogos-iniciales';
import { MonitoreoCatalogosService } from '../monitoreo-catalogos.service';
import { ComponenteEquipo } from '../schemas/componente-equipo.schema';
import {
  IntervencionEquipo,
  OrigenIntervencion,
} from '../schemas/intervencion-equipo.schema';
import {
  BombaLeida,
  ComponenteLeido,
  IntervencionLeida,
  leerPlanillaDeCarga,
  PlanillaLeida,
  ProblemaDePlanilla,
} from './planilla-carga';

export interface ResultadoImportacion {
  /** `false` en la revisión previa o si hubo problemas graves. */
  aplicado: boolean;
  problemas: ProblemaDePlanilla[];
  bombas: { nuevas: string[]; actualizadas: string[] };
  componentes: {
    nuevos: number;
    /** Pieza con fecha de instalación más nueva: la anterior queda retirada. */
    reemplazados: number;
    actualizados: number;
  };
  intervenciones: { nuevas: number; actualizadas: number };
  /** Valores de la hoja «Listas» que se agregaron a los catálogos. */
  catalogosAgregados: Partial<Record<TipoCatalogoMonitoreo, string[]>>;
}

type AccionComponente = 'nuevo' | 'reemplazo' | 'actualizar';

interface Plan {
  existentes: Map<string, Equipo>;
  componentes: {
    leido: ComponenteLeido;
    accion: AccionComponente;
    anterior?: ComponenteEquipo;
  }[];
  intervenciones: {
    leida: IntervencionLeida;
    existente?: IntervencionEquipo;
  }[];
  destino?: DestinoEquipo;
}

const claveDia = (equipoId: unknown, fecha: Date) =>
  `${String(equipoId)}|${fecha.getTime()}`;

/**
 * Carga la planilla de bombas en el inventario: la ficha de cada bomba, sus
 * piezas instaladas y sus intervenciones.
 *
 * **Por defecto solo revisa** y dice qué haría; escribe únicamente con
 * `aplicar`, y nunca si hay un problema grave. Es idempotente: subir dos veces
 * la misma planilla deja la base igual que subirla una.
 */
@Injectable()
export class ImportadorPlanillaService {
  private readonly logger = new Logger(ImportadorPlanillaService.name);

  constructor(
    @InjectModel(Equipo.name) private readonly equipoModel: Model<Equipo>,
    @InjectModel(ComponenteEquipo.name)
    private readonly componenteModel: Model<ComponenteEquipo>,
    @InjectModel(IntervencionEquipo.name)
    private readonly intervencionModel: Model<IntervencionEquipo>,
    private readonly resolucion: ResolucionOrganizacionalService,
    private readonly ubicaciones: UbicacionService,
    private readonly clasificaciones: ClasificacionService,
    private readonly catalogos: MonitoreoCatalogosService,
  ) {}

  async importar(
    archivo: Buffer,
    opciones: { aplicar: boolean; usuario: string },
  ): Promise<ResultadoImportacion> {
    let leida: PlanillaLeida;
    try {
      leida = await leerPlanillaDeCarga(archivo);
    } catch {
      throw new BadRequestException('El archivo no es un Excel .xlsx válido');
    }

    const problemas = [...leida.problemas];
    const plan = await this.planificar(leida, problemas);
    const resultado: ResultadoImportacion = {
      aplicado: false,
      problemas,
      bombas: {
        nuevas: leida.bombas
          .filter((b) => !plan.existentes.has(b.tag))
          .map((b) => b.tag),
        actualizadas: leida.bombas
          .filter((b) => plan.existentes.has(b.tag))
          .map((b) => b.tag),
      },
      componentes: {
        nuevos: plan.componentes.filter((c) => c.accion === 'nuevo').length,
        reemplazados: plan.componentes.filter((c) => c.accion === 'reemplazo')
          .length,
        actualizados: plan.componentes.filter((c) => c.accion === 'actualizar')
          .length,
      },
      intervenciones: {
        nuevas: plan.intervenciones.filter((i) => !i.existente).length,
        actualizadas: plan.intervenciones.filter((i) => i.existente).length,
      },
      catalogosAgregados: {},
    };

    if (!opciones.aplicar || problemas.some((p) => p.grave)) return resultado;

    resultado.catalogosAgregados = await this.cargarListas(leida, problemas);
    const ids = await this.escribirBombas(leida.bombas, plan);
    await this.escribirComponentes(plan, ids, opciones.usuario);
    await this.escribirIntervenciones(plan, ids, opciones.usuario);
    resultado.aplicado = true;

    this.logger.log(
      `Planilla de bombas aplicada por ${opciones.usuario}: ` +
        `${resultado.bombas.nuevas.length} nuevas, ${resultado.bombas.actualizadas.length} actualizadas`,
    );
    return resultado;
  }

  // ── Revisión ────────────────────────────────────────────────────────────

  /** Todo lo que necesita la base para decidir, sin escribir nada. */
  private async planificar(
    leida: PlanillaLeida,
    problemas: ProblemaDePlanilla[],
  ): Promise<Plan> {
    const plan: Plan = {
      existentes: new Map(),
      componentes: [],
      intervenciones: [],
    };

    for (const b of leida.bombas) {
      if (b.ubicacion && partirRuta(b.ubicacion).length > PROFUNDIDAD_MAXIMA) {
        problemas.push({
          hoja: 'Bombas',
          fila: b.fila,
          grave: true,
          mensaje: `${b.tag}: la ubicación tiene más de ${PROFUNDIDAD_MAXIMA} niveles`,
        });
      }
    }

    await this.resolucion.precargar();
    try {
      plan.destino = this.resolucion.resolver(AREA_CONFIABILIDAD);
    } catch (error) {
      if (!(error instanceof DestinoNoResuelto)) throw error;
      problemas.push({ hoja: 'Bombas', grave: true, mensaje: error.message });
    }

    const tags = leida.bombas.map((b) => b.tag);
    const delInventario = await this.equipoModel
      .find({ codigo: { $in: tags } })
      .exec();
    for (const tag of tags) {
      const conEseCodigo = delInventario.filter((e) => e.codigo === tag);
      const fila = leida.bombas.find((b) => b.tag === tag)?.fila;
      if (conEseCodigo.length > 1) {
        problemas.push({
          hoja: 'Bombas',
          fila,
          grave: true,
          mensaje: `${tag}: hay ${conEseCodigo.length} equipos con ese código en el inventario`,
        });
      } else if (conEseCodigo.length === 1) {
        const [equipo] = conEseCodigo;
        if (equipo.tipo_equipo !== TIPO_EQUIPO_BOMBA) {
          problemas.push({
            hoja: 'Bombas',
            fila,
            grave: true,
            mensaje: `${tag} ya está en el inventario como «${equipo.tipo_equipo}», no como bomba`,
          });
        } else {
          plan.existentes.set(tag, equipo);
        }
      }
    }

    const ids = [...plan.existentes.values()].map((e) => e._id);
    const [vigentes, intervenciones] = ids.length
      ? await Promise.all([
          this.componenteModel
            .find({ equipo_id: { $in: ids }, vigente: true })
            .exec(),
          this.intervencionModel.find({ equipo_id: { $in: ids } }).exec(),
        ])
      : [[], []];

    for (const leido of leida.componentes) {
      const equipo = plan.existentes.get(leido.tag);
      const anterior = vigentes.find(
        (v) =>
          String(v.equipo_id) === String(equipo?._id) &&
          v.pieza === leido.pieza,
      );
      const accion = this.accionComponente(leido, anterior, problemas);
      if (accion) plan.componentes.push({ leido, accion, anterior });
    }

    const porDia = new Map(
      intervenciones.map((i) => [claveDia(i.equipo_id, i.fecha), i]),
    );
    for (const leida_ of leida.intervenciones) {
      const equipo = plan.existentes.get(leida_.tag);
      plan.intervenciones.push({
        leida: leida_,
        existente: equipo
          ? porDia.get(claveDia(equipo._id, leida_.fecha))
          : undefined,
      });
    }
    return plan;
  }

  /**
   * Una pieza con fecha de instalación **más nueva** que la montada es un
   * cambio de pieza: la anterior se retira. Una **más vieja** no se carga,
   * porque reemplazaría lo instalado hoy con algo que ya se sacó.
   */
  private accionComponente(
    leido: ComponenteLeido,
    anterior: ComponenteEquipo | undefined,
    problemas: ProblemaDePlanilla[],
  ): AccionComponente | undefined {
    if (!anterior) return 'nuevo';
    const nueva = leido.fechaInstalacion?.getTime();
    const montada = anterior.fecha_instalacion?.getTime();
    if (nueva === undefined || montada === undefined || nueva === montada)
      return 'actualizar';
    if (nueva > montada) return 'reemplazo';
    problemas.push({
      hoja: 'Componentes',
      fila: leido.fila,
      grave: false,
      mensaje: `${leido.tag} ${leido.pieza}: la fecha de instalación es anterior a la de la pieza montada; no se carga`,
    });
    return undefined;
  }

  // ── Escritura ───────────────────────────────────────────────────────────

  private async cargarListas(
    leida: PlanillaLeida,
    problemas: ProblemaDePlanilla[],
  ): Promise<Partial<Record<TipoCatalogoMonitoreo, string[]>>> {
    await this.catalogos.sembrar();
    const agregados: Partial<Record<TipoCatalogoMonitoreo, string[]>> = {};
    for (const [tipo, valores] of Object.entries(leida.listas) as [
      TipoCatalogoMonitoreo,
      string[],
    ][]) {
      const r = await this.catalogos.agregarFaltantes(tipo, valores);
      if (r.agregados.length) agregados[tipo] = r.agregados;
      for (const valor of r.dadosDeBaja) {
        problemas.push({
          hoja: 'Listas',
          grave: false,
          mensaje: `«${valor}» está dado de baja en la lista; no se reactivó`,
        });
      }
    }
    return agregados;
  }

  /** Devuelve el `_id` de cada bomba por TAG, nuevas y existentes. */
  private async escribirBombas(
    bombas: BombaLeida[],
    plan: Plan,
  ): Promise<Map<string, Types.ObjectId>> {
    const clasificacion =
      await this.clasificaciones.findByNameOrCreate(CLASIFICACION_BOMBAS);
    const ids = new Map<string, Types.ObjectId>();

    for (const b of bombas) {
      const especificaciones = this.especificaciones(b);
      const existente = plan.existentes.get(b.tag);

      if (existente) {
        // Solo lo que la planilla trae: una celda vacía no borra lo que se
        // cargó desde el panel de inventario. Las especificaciones se
        // fusionan clave por clave por la misma razón.
        const set: Record<string, unknown> = {};
        if (b.fabricante) set.marca = b.fabricante;
        if (b.modelo) set.modelo = b.modelo;
        if (b.ubicacion) {
          set.ubicacion_id = (
            await this.ubicaciones.findOrCreateByRuta(b.ubicacion)
          )._id;
        }
        for (const [clave, valor] of Object.entries(especificaciones)) {
          set[`especificaciones.${clave}`] = valor;
        }
        if (Object.keys(set).length) {
          await this.equipoModel
            .updateOne({ _id: existente._id }, { $set: set })
            .exec();
        }
        ids.set(b.tag, existente._id as Types.ObjectId);
        continue;
      }

      const ubicacion = await this.ubicaciones.findOrCreateByRuta(
        b.ubicacion ?? UBICACION_POR_DEFECTO,
      );
      const creado = await this.equipoModel.create({
        codigo: b.tag,
        descripcion: `Bomba ${b.tag}`,
        tipo_equipo: TIPO_EQUIPO_BOMBA,
        marca: b.fabricante,
        modelo: b.modelo,
        ambito: plan.destino?.ambito,
        area_id: plan.destino?.area_id,
        superintendencia_id: plan.destino?.superintendencia_id,
        gerencia_id: plan.destino?.gerencia_id,
        ubicacion_id: ubicacion._id,
        clasificacion_id: clasificacion._id,
        especificaciones,
      });
      ids.set(b.tag, creado._id as Types.ObjectId);
    }
    return ids;
  }

  private especificaciones(b: BombaLeida): Record<string, string | number> {
    const valores: [string, string | number | undefined][] = [
      [ESPECIFICACION_BOMBA.servicio, b.servicio],
      [ESPECIFICACION_BOMBA.tmef, b.tmefHrs],
      [ESPECIFICACION_BOMBA.tagPi, b.tagPi],
      [
        ESPECIFICACION_BOMBA.pares,
        b.pares.length ? b.pares.join(', ') : undefined,
      ],
      [ESPECIFICACION_BOMBA.otModelo, b.otModelo],
      [ESPECIFICACION_BOMBA.frecuencia, b.frecuenciaDias],
    ];
    return Object.fromEntries(
      valores.filter(([, v]) => v !== undefined),
    ) as Record<string, string | number>;
  }

  private async escribirComponentes(
    plan: Plan,
    ids: Map<string, Types.ObjectId>,
    usuario: string,
  ): Promise<void> {
    for (const { leido, accion, anterior } of plan.componentes) {
      const datos = this.sinVacios({
        proveedor: leido.proveedor,
        material: leido.material,
        dureza_hb: leido.durezaHb,
        condicion_inicial: leido.condicionInicial,
        espesor_nominal_mm: leido.espesorNominalMm,
        espesor_precaucion_mm: leido.espesorPrecaucionMm,
        fecha_instalacion: leido.fechaInstalacion,
      });

      if (accion === 'actualizar' && anterior) {
        await this.componenteModel
          .updateOne({ _id: anterior._id }, { $set: datos })
          .exec();
        continue;
      }
      if (accion === 'reemplazo' && anterior) {
        await this.componenteModel
          .updateOne(
            { _id: anterior._id },
            { $set: { vigente: false, retirado_en: leido.fechaInstalacion } },
          )
          .exec();
      }
      await this.componenteModel.create({
        ...datos,
        equipo_id: ids.get(leido.tag),
        tag: leido.tag,
        pieza: leido.pieza,
        vigente: true,
        registradoPor: usuario,
      });
    }
  }

  private async escribirIntervenciones(
    plan: Plan,
    ids: Map<string, Types.ObjectId>,
    usuario: string,
  ): Promise<void> {
    for (const { leida, existente } of plan.intervenciones) {
      const datos = this.sinVacios({
        tipo: leida.tipo,
        ot: leida.ot,
        horas: leida.horas,
        nota: leida.nota,
      });
      if (leida.piezas.length) datos.piezas = leida.piezas;

      if (existente) {
        await this.intervencionModel
          .updateOne({ _id: existente._id }, { $set: datos })
          .exec();
        continue;
      }
      await this.intervencionModel.create({
        ...datos,
        equipo_id: ids.get(leida.tag),
        tag: leida.tag,
        fecha: leida.fecha,
        origen: OrigenIntervencion.PLANILLA,
        registradoPor: usuario,
      });
    }
  }

  private sinVacios(datos: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(datos).filter(([, v]) => v !== undefined),
    );
  }
}
