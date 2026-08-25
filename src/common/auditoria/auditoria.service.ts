import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { Auditoria } from './auditoria.schema';

export interface AsientoAuditoria {
  usuario: string;
  roles: string[];
  metodo: string;
  ruta: string;
  recurso: string;
  documentoId?: string;
  estado: number;
  fallo: boolean;
  mensajeError?: string;
  datos?: Record<string, unknown>;
  /** Documento afectado por un `DELETE`, tal como estaba antes de la baja. */
  documento?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  duracionMs?: number;
  fecha: Date;
}

export interface FiltrosAuditoria {
  usuario?: string;
  recurso?: string;
  metodo?: string;
  documentoId?: string;
  soloFallos?: boolean;
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

export interface PaginaAuditoria {
  filas: Auditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Escribe y consulta la bitácora.
 *
 * **No expone actualización ni borrado**, a propósito: una auditoría que se
 * puede editar no prueba nada. Los asientos solo desaparecen cuando vence su
 * retención, y de eso se encarga Mongo.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectModel(Auditoria.name)
    private readonly modelo: Model<Auditoria>,
  ) {}

  /**
   * Anexa un asiento.
   *
   * **Nunca lanza.** Si la auditoría fallara y eso tumbara la petición, un
   * problema de registro se convertiría en una caída del sistema: la operación
   * del usuario ya se hizo y no tiene por qué perderse. El fallo se queda en el
   * log del servidor.
   */
  async registrar(asiento: AsientoAuditoria): Promise<void> {
    try {
      await this.modelo.create(asiento);
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la auditoría de ${asiento.metodo} ${asiento.ruta}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async buscar(filtros: FiltrosAuditoria = {}): Promise<PaginaAuditoria> {
    const consulta: FilterQuery<Auditoria> = {};

    if (filtros.usuario) consulta.usuario = filtros.usuario;
    if (filtros.recurso) consulta.recurso = filtros.recurso;
    if (filtros.metodo) consulta.metodo = filtros.metodo.toUpperCase();
    if (filtros.documentoId) consulta.documentoId = filtros.documentoId;
    if (filtros.soloFallos) consulta.fallo = true;

    if (filtros.desde || filtros.hasta) {
      // El rango se arma aparte y se asigna entero: escribir sobre
      // `consulta.fecha` campo a campo pierde el tipo por el camino.
      const rango: { $gte?: Date; $lte?: Date } = {};
      if (filtros.desde) rango.$gte = new Date(filtros.desde);
      if (filtros.hasta) {
        // «hasta el 5» incluye el día 5 entero; sin esto se pierde lo de ese día.
        const hasta = new Date(filtros.hasta);
        hasta.setHours(23, 59, 59, 999);
        rango.$lte = hasta;
      }
      consulta.fecha = rango;
    }

    const pagina = Math.max(1, filtros.pagina ?? 1);
    const porPagina = Math.min(200, Math.max(1, filtros.porPagina ?? 50));

    const [filas, total] = await Promise.all([
      this.modelo
        .find(consulta)
        .sort({ fecha: -1 })
        .skip((pagina - 1) * porPagina)
        .limit(porPagina)
        .lean<Auditoria[]>()
        .exec(),
      this.modelo.countDocuments(consulta),
    ]);

    return { filas, total, pagina, porPagina };
  }

  /** Valores existentes, para llenar los filtros de la pantalla. */
  async recursos(): Promise<string[]> {
    return (await this.modelo.distinct('recurso')).sort();
  }

  async usuarios(): Promise<string[]> {
    return (await this.modelo.distinct('usuario')).sort();
  }
}
