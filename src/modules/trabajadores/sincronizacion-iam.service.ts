import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trabajador } from './schemas/trabajador.schema';
import { SincronizacionIam } from './schemas/sincronizacion-iam.schema';
import {
  FichaIam,
  FichaLocal,
  ItemDelPlan,
  PersonaDelRol,
  PlanDeRol,
  PlanDeSincronizacion,
  planificar,
  planificarRol,
} from './domain/plan-de-sincronizacion';

/** El rol de forms que acompaña a la sincronización del padrón. */
const ROL_SINCRONIZADO = 'supervisor';

export interface UltimaSincronizacion {
  fecha: Date;
  usuario: string;
  nuevos: number;
  actualizados: number;
  bajas: number;
  fallidos: number;
}

export interface VistaPrevia extends PlanDeSincronizacion {
  supervisores: PlanDeRol;
  ultima: UltimaSincronizacion | null;
}

export interface ResultadoDeItem {
  idIam: string;
  nomina: string;
  tipo: ItemDelPlan['tipo'];
  ok: boolean;
  error?: string;
}

export interface ResultadoDeAplicar {
  resultados: ResultadoDeItem[];
  /** Elegidos que ya no estaban en el plan (alguien los cambió en el IAM). */
  omitidos: string[];
  supervisores: { ganan: number; pierden: number; error?: string } | null;
}

interface UsuarioDelServicioIam {
  username: string;
  trabajador: { id: string; nomina: string } | null;
}

/**
 * Sincronización del padrón de trabajadores con el IAM, en dos pasos: la
 * vista previa (qué cambiaría, sin escribir) y aplicar lo que el admin eligió.
 * La comparación vive en `domain/plan-de-sincronizacion.ts`.
 */
@Injectable()
export class SincronizacionIamService {
  private readonly logger = new Logger(SincronizacionIamService.name);

  constructor(
    @InjectModel(Trabajador.name)
    private readonly trabajadores: Model<Trabajador>,
    @InjectModel(SincronizacionIam.name)
    private readonly historial: Model<SincronizacionIam>,
    private readonly config: ConfigService,
  ) {}

  async vistaPrevia(): Promise<VistaPrevia> {
    const { plan, supervisores } = await this.planActual();
    return { ...plan, supervisores, ultima: await this.ultima() };
  }

  async aplicar(
    ids: string[] | undefined,
    actualizarSupervisores: boolean,
    usuario: string,
  ): Promise<ResultadoDeAplicar> {
    // Se vuelve a comparar: entre la vista previa y este pedido el IAM pudo cambiar.
    const { plan, supervisores } = await this.planActual();
    const aplicables = [...plan.nuevos, ...plan.conCambios, ...plan.bajas];
    const elegidos = ids
      ? aplicables.filter((i) => ids.includes(i.idIam))
      : aplicables;
    const omitidos = ids
      ? ids.filter((id) => !aplicables.some((i) => i.idIam === id))
      : [];

    const resultados: ResultadoDeItem[] = [];
    for (const item of elegidos) {
      try {
        await this.escribir(item, usuario);
        resultados.push({
          idIam: item.idIam,
          nomina: item.nomina,
          tipo: item.tipo,
          ok: true,
        });
      } catch (error) {
        const mensaje =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.warn(
          `Sincronización: ${item.nomina} (${item.idIam}) falló: ${mensaje}`,
        );
        resultados.push({
          idIam: item.idIam,
          nomina: item.nomina,
          tipo: item.tipo,
          ok: false,
          error: mensaje,
        });
      }
    }

    const resultadoRol = actualizarSupervisores
      ? await this.aplicarRol(supervisores)
      : null;

    const cuenta = (tipo: ItemDelPlan['tipo']) =>
      resultados.filter((r) => r.ok && r.tipo === tipo).length;
    await this.historial.create({
      usuario,
      nuevos: cuenta('nuevo'),
      actualizados: cuenta('cambio'),
      bajas: cuenta('baja'),
      fallidos: resultados.filter((r) => !r.ok).length,
      supervisoresGanan: resultadoRol?.ganan ?? 0,
      supervisoresPierden: resultadoRol?.pierden ?? 0,
    });

    return { resultados, omitidos, supervisores: resultadoRol };
  }

  // ── Lectura ────────────────────────────────────────────────────────

  private async planActual(): Promise<{
    plan: PlanDeSincronizacion;
    supervisores: PlanDeRol;
  }> {
    const [fichasIam, conRol, locales] = await Promise.all([
      this.pedirAlIam<{ trabajadores?: FichaIam[] }>('/api/rbac/trabajadores'),
      this.pedirAlIam<{ users?: UsuarioDelServicioIam[] }>(
        `/api/rbac/services/forms/users?role=${ROL_SINCRONIZADO}`,
      ),
      this.fichasLocales(),
    ]);

    const personasConRol: PersonaDelRol[] = (conRol.users ?? [])
      .filter((u) => u.trabajador)
      .map((u) => ({ idIam: u.trabajador!.id, nomina: u.trabajador!.nomina }));

    return {
      plan: planificar(fichasIam.trabajadores ?? [], locales),
      supervisores: planificarRol(ROL_SINCRONIZADO, personasConRol, locales),
    };
  }

  /** Todas las fichas de forms, también las dadas de baja. */
  private async fichasLocales(): Promise<FichaLocal[]> {
    const docs = await this.trabajadores
      .find({})
      .setOptions({ incluirDadosDeBaja: true })
      .select(
        'iam_trabajador_id ci nomina puesto superintendencia area jde celular residencia no_bloque no_habitacion fecha_ingreso username tiene_acceso_sistema activo roles_iam',
      )
      .lean()
      .exec();
    return docs.map((d) => ({
      ...(d as unknown as FichaLocal),
      id: (d._id as { toString(): string }).toString(),
    }));
  }

  private async pedirAlIam<T>(ruta: string): Promise<T> {
    const base = (
      this.config.get<string>('IAM_CORE_URL') || 'http://localhost:4000'
    ).replace(/\/+$/, '');
    const apiKey = this.config.get<string>('IAM_CORE_API_KEY') || '';
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}${ruta}`, {
        headers: { 'X-Api-Key': apiKey },
        cache: 'no-store',
      });
    } catch {
      throw new BadGatewayException(
        'No se pudo conectar con el IAM. Intentá de nuevo en unos minutos.',
      );
    }
    if (!respuesta.ok) {
      throw new BadGatewayException(
        `El IAM respondió con estado ${respuesta.status}. No se cambió nada.`,
      );
    }
    return (await respuesta.json()) as T;
  }

  async ultima(): Promise<UltimaSincronizacion | null> {
    const r = await this.historial
      .findOne()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (!r) return null;
    return {
      fecha: r.createdAt,
      usuario: r.usuario,
      nuevos: r.nuevos,
      actualizados: r.actualizados,
      bajas: r.bajas,
      fallidos: r.fallidos,
    };
  }

  // ── Escritura ──────────────────────────────────────────────────────

  private async escribir(item: ItemDelPlan, usuario: string): Promise<void> {
    if (item.tipo === 'nuevo') {
      await new this.trabajadores(item.datos).save();
      return;
    }
    if (!item.idLocal) throw new Error('Sin ficha en forms para actualizar');

    const datos =
      item.tipo === 'baja'
        ? {
            activo: false,
            eliminadaEn: new Date(),
            eliminadaPor: `${usuario} (sincronización IAM)`,
          }
        : item.datos;

    const r = await this.trabajadores
      .updateOne(
        { _id: item.idLocal },
        { $set: datos },
        { runValidators: true },
      )
      .setOptions({ incluirDadosDeBaja: true })
      .exec();
    if (r.matchedCount === 0) throw new Error('La ficha ya no existe en forms');
  }

  private async aplicarRol(
    plan: PlanDeRol,
  ): Promise<{ ganan: number; pierden: number; error?: string }> {
    try {
      const ganan = plan.ganan.map((p) => p.idIam);
      const pierden = plan.pierden.map((p) => p.idIam).filter(Boolean);
      const g = await this.trabajadores
        .updateMany(
          { iam_trabajador_id: { $in: ganan } },
          { $addToSet: { roles_iam: plan.rol } },
        )
        .setOptions({ incluirDadosDeBaja: true })
        .exec();
      // Quienes ya no tienen el rol en el IAM lo pierden aquí, incluidas las
      // fichas viejas sin vínculo (el IAM es la fuente de verdad también para quitar).
      const sinVincular = plan.pierden.some((p) => !p.idIam);
      const p = await this.trabajadores
        .updateMany(
          {
            roles_iam: plan.rol,
            $or: [
              { iam_trabajador_id: { $in: pierden } },
              ...(sinVincular
                ? [
                    { iam_trabajador_id: { $in: [null, ''] } },
                    { iam_trabajador_id: { $exists: false } },
                  ]
                : []),
            ],
          },
          { $pull: { roles_iam: plan.rol } },
        )
        .setOptions({ incluirDadosDeBaja: true })
        .exec();
      return { ganan: g.modifiedCount, pierden: p.modifiedCount };
    } catch (error) {
      return {
        ganan: 0,
        pierden: 0,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}
