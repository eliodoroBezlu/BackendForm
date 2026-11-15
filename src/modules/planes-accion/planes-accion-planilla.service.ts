import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlanDeAccion,
  PlanDeAccionDocument,
  TareaObservacion,
} from './schemas/plan-accion.schema';
import { Trabajador } from '../trabajadores/schemas/trabajador.schema';
import { ROLES_DE_CIERRE } from '../trabajadores/trabajadores.service';
import {
  type FilaPlanificada,
  planificarCarga,
  type ResponsableConocido,
  type ResultadoDeFila,
  type TareaDelPlan,
} from './domain/carga-planilla';
import { cambiosDeTarea } from './domain/requisitos-tarea';
import {
  calcularDiasRetraso,
  calcularMetadatos,
  soloTareasActivas,
} from './domain/metadatos-plan';
import {
  leerPlanillaDeSeguimiento,
  PlanillaInvalida,
} from './planilla-seguimiento';

export interface ResultadoCargaPlanilla {
  /** `false` en la revisión previa, o si ninguna fila cambia nada. */
  aplicado: boolean;
  resumen: Record<ResultadoDeFila, number>;
  filas: Omit<FilaPlanificada, 'pasos'>[];
}

/**
 * Carga en el plan la planilla de seguimiento que se descargó y se editó.
 *
 * **Por defecto solo revisa** y dice qué haría con cada fila; escribe solo con
 * `aplicar`. Las reglas de cada fila están en `domain/carga-planilla.ts`. Se
 * aplican las filas válidas y se informan las demás: cada tarea es
 * independiente, y lo que se cambió queda en su historial.
 */
@Injectable()
export class PlanesAccionPlanillaService {
  private readonly logger = new Logger(PlanesAccionPlanillaService.name);

  constructor(
    @InjectModel(PlanDeAccion.name)
    private readonly planModel: Model<PlanDeAccionDocument>,
    @InjectModel(Trabajador.name)
    private readonly trabajadorModel: Model<Trabajador>,
  ) {}

  async cargar(
    planId: string,
    contenido: Buffer,
    opciones: { aplicar: boolean; usuario: string; archivo?: string },
  ): Promise<ResultadoCargaPlanilla> {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('ID de plan inválido');
    }
    const plan = await this.planModel.findById(planId);
    if (!plan || plan.activo === false) {
      throw new NotFoundException('Plan no encontrado');
    }

    let leida: Awaited<ReturnType<typeof leerPlanillaDeSeguimiento>>;
    try {
      leida = await leerPlanillaDeSeguimiento(contenido);
    } catch (error) {
      if (error instanceof PlanillaInvalida) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (!leida.planId) {
      throw new BadRequestException(
        'La planilla no dice de qué plan es: se descargó antes de que se pudiera volver a subir. Descárguela de nuevo desde el plan.',
      );
    }
    if (leida.planId !== planId) {
      throw new BadRequestException(
        'Esta planilla es de otro plan de acción. Súbala desde el plan del que la descargó.',
      );
    }

    const filas = planificarCarga({
      filas: leida.filas,
      tareas: plan.tareas.map((t) => this.comoTarea(t)),
      responsables: await this.responsablesDeCierre(),
    });

    const aAplicar = filas.filter((f) => f.resultado === 'actualiza');
    const aplicado = opciones.aplicar && aAplicar.length > 0;
    if (aplicado) {
      const motivo = `Carga desde planilla${opciones.archivo ? ` «${opciones.archivo}»` : ''}`;
      for (const fila of aAplicar) {
        const tarea = plan.tareas.find((t) => String(t._id) === fila.tareaId);
        if (tarea) this.aplicarPasos(tarea, fila, opciones.usuario, motivo);
      }
      Object.assign(plan, calcularMetadatos(soloTareasActivas(plan.tareas)));
      plan.fechaUltimaActualizacion = new Date();
      plan.markModified('tareas');
      await plan.save();
      this.logger.log(
        `Plan ${planId}: ${aAplicar.length} tareas actualizadas desde planilla por ${opciones.usuario}`,
      );
    }

    const resumen: Record<ResultadoDeFila, number> = {
      actualiza: 0,
      'sin-cambios': 0,
      rechazada: 0,
      conflicto: 0,
      ignorada: 0,
    };
    for (const f of filas) resumen[f.resultado]++;

    return {
      aplicado,
      resumen,
      filas: filas.map(({ pasos: _pasos, ...resto }) => resto),
    };
  }

  /** Cada paso es un avance en el historial, como al usar la pantalla. */
  private aplicarPasos(
    tarea: TareaObservacion,
    fila: FilaPlanificada,
    usuario: string,
    motivo: string,
  ): void {
    for (const paso of fila.pasos) {
      const antes = this.comoObjeto(tarea);
      Object.assign(tarea, paso);
      const cambios = cambiosDeTarea(antes, paso);
      if (cambios.length > 0) {
        tarea.historial = [
          ...(tarea.historial ?? []),
          { fecha: new Date(), usuario, tipo: 'avance', cambios, motivo },
        ];
      }
    }
    if (tarea.fechaCumplimientoAcordada) {
      tarea.diasRetraso = calcularDiasRetraso(
        new Date(tarea.fechaCumplimientoAcordada),
        tarea.fechaCumplimientoEfectiva
          ? new Date(tarea.fechaCumplimientoEfectiva)
          : undefined,
      );
    }
  }

  /**
   * Los mismos que ofrece la pantalla al elegir responsables de cierre:
   * supervisores y superintendentes activos con acceso y usuario. Se usa lo
   * último sincronizado del IAM (la pantalla lo refresca al abrirse).
   */
  private async responsablesDeCierre(): Promise<ResponsableConocido[]> {
    const trabajadores = await this.trabajadorModel
      .find({
        activo: true,
        tiene_acceso_sistema: true,
        username: { $nin: [null, ''] },
        roles_iam: { $in: [...ROLES_DE_CIERRE] },
      })
      .select('nomina username')
      .lean()
      .exec();
    return trabajadores.map((t) => ({
      nomina: t.nomina,
      username: t.username as string,
    }));
  }

  private comoObjeto(tarea: TareaObservacion): TareaObservacion {
    const conToObject = tarea as TareaObservacion & {
      toObject?: () => TareaObservacion;
    };
    return conToObject.toObject ? conToObject.toObject() : { ...tarea };
  }

  private comoTarea(tarea: TareaObservacion): TareaDelPlan {
    const plana = this.comoObjeto(tarea);
    return { ...plana, _id: String(plana._id) } as unknown as TareaDelPlan;
  }
}
