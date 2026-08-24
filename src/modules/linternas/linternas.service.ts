import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EntregaLinterna,
  EstadoEntrega,
  TipoEntrega,
} from './schemas/entrega-linterna.schema';
import { StockLinternasService } from './stock-linternas.service';
import { ContextoFirma, FirmaService } from '../../common/firma/firma.service';
import { MetodoFirma } from '../../common/firma/firma.schema';
import { RegistrarEntregaDto } from './dto/registrar-entrega.dto';
import {
  FirmarReciboDto,
  ResolverPerdidaDto,
} from './dto/resolver-perdida.dto';

/** Lo que hace falta saber de una persona antes de entregarle algo. */
export interface EstadoTrabajador {
  trabajador: string;
  nombre: string;
  area: string;
  superintendencia: string;
  tieneDotacion: boolean;
  /** Qué corresponde registrar ahora mismo. */
  siguienteAccion: TipoEntrega;
  totalCambios: number;
  totalPerdidas: number;
  ultimaEntrega?: Date;
  pendienteDeAprobacion: boolean;
}

interface DocTrabajador {
  _id: Types.ObjectId;
  nomina: string;
  area?: string;
  superintendencia?: string;
}

const COLECCION = 'entregas_linterna';

@Injectable()
export class LinternasService {
  private readonly logger = new Logger(LinternasService.name);

  constructor(
    @InjectModel(EntregaLinterna.name)
    private readonly entregaModel: Model<EntregaLinterna>,
    @InjectModel('Trabajador')
    private readonly trabajadorModel: Model<DocTrabajador>,
    private readonly stock: StockLinternasService,
    private readonly firmas: FirmaService,
  ) {}

  // ── Consulta ────────────────────────────────────────────────────────────

  /**
   * Estado derivado de los eventos. No se guarda en ningún lado: mantener un
   * «tiene / no tiene» aparte obliga a sincronizarlo y es de donde salen los
   * números que no cuadran.
   */
  async estadoDeTrabajador(trabajadorId: string): Promise<EstadoTrabajador> {
    const trabajador = await this.buscarTrabajador(trabajadorId);
    const entregas = await this.entregaModel
      .find({ trabajador: trabajador._id })
      .sort({ createdAt: 1 })
      .exec();

    const efectivas = entregas.filter(
      (e) => e.estado !== EstadoEntrega.RECHAZADA,
    );
    const tieneDotacion = efectivas.some(
      (e) => e.tipo === TipoEntrega.DOTACION,
    );
    const pendiente = entregas.some(
      (e) => e.estado === EstadoEntrega.PENDIENTE_APROBACION,
    );

    const conFecha = efectivas
      .map((e) => e.fechaEntrega)
      .filter((f): f is Date => !!f);

    return {
      trabajador: String(trabajador._id),
      nombre: trabajador.nomina,
      area: trabajador.area ?? 'Sin área',
      superintendencia: trabajador.superintendencia ?? 'Sin superintendencia',
      tieneDotacion,
      siguienteAccion: tieneDotacion
        ? TipoEntrega.CAMBIO
        : TipoEntrega.DOTACION,
      totalCambios: efectivas.filter((e) => e.tipo === TipoEntrega.CAMBIO)
        .length,
      totalPerdidas: efectivas.filter(
        (e) => e.tipo === TipoEntrega.REPOSICION_PERDIDA,
      ).length,
      ultimaEntrega: conFecha.length
        ? new Date(Math.max(...conFecha.map((f) => f.getTime())))
        : undefined,
      pendienteDeAprobacion: pendiente,
    };
  }

  /** Devuelve `null` en vez de lanzar: el controller decide qué responder. */
  async buscarPorId(id: string): Promise<EntregaLinterna | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.entregaModel.findById(id).exec();
  }

  async historialDeTrabajador(
    trabajadorId: string,
  ): Promise<EntregaLinterna[]> {
    return this.entregaModel
      .find({ trabajador: new Types.ObjectId(trabajadorId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async listar(filtros: {
    area?: string;
    tipo?: TipoEntrega;
    estado?: EstadoEntrega;
  }): Promise<EntregaLinterna[]> {
    const query: Record<string, unknown> = {};
    if (filtros.area) query.area = filtros.area;
    if (filtros.tipo) query.tipo = filtros.tipo;
    if (filtros.estado) query.estado = filtros.estado;

    return this.entregaModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
  }

  async pendientesDeAprobacion(): Promise<EntregaLinterna[]> {
    return this.entregaModel
      .find({ estado: EstadoEntrega.PENDIENTE_APROBACION })
      .sort({ createdAt: 1 })
      .exec();
  }

  /** Quiénes todavía no recibieron su dotación. */
  async sinDotacion(): Promise<
    { _id: string; nomina: string; area: string; superintendencia: string }[]
  > {
    const dotados = await this.entregaModel
      .find({ tipo: TipoEntrega.DOTACION })
      .distinct('trabajador');

    const pendientes = await this.trabajadorModel
      .find({ _id: { $nin: dotados }, activo: { $ne: false } })
      .lean<DocTrabajador[]>()
      .exec();

    return pendientes.map((t) => ({
      _id: String(t._id),
      nomina: t.nomina,
      area: t.area ?? 'Sin área',
      superintendencia: t.superintendencia ?? 'Sin superintendencia',
    }));
  }

  // ── Registro ────────────────────────────────────────────────────────────

  /**
   * Registra una entrega, aplicando las reglas que hoy están en la cabeza de
   * quien lleva el cuaderno.
   */
  async registrar(
    dto: RegistrarEntregaDto,
    contexto: ContextoFirma,
  ): Promise<EntregaLinterna> {
    const trabajador = await this.buscarTrabajador(dto.trabajador);
    const estado = await this.estadoDeTrabajador(dto.trabajador);

    this.validarTipoContraEstado(dto, estado);
    this.validarBloquesDelTipo(dto);

    const esPerdida = dto.tipo === TipoEntrega.REPOSICION_PERDIDA;

    // La reposición por pérdida no descuenta todavía: se autoriza primero, y la
    // linterna sale al aprobar. Descontar aquí bloquearía stock por solicitudes
    // que pueden terminar rechazadas.
    if (!esPerdida) {
      await this.stock.descontarUna();
    }

    try {
      const doc = await this.entregaModel.create({
        trabajador: trabajador._id,
        nombreTrabajador: trabajador.nomina,
        area: trabajador.area ?? 'Sin área',
        superintendencia: trabajador.superintendencia ?? 'Sin superintendencia',
        tipo: dto.tipo,
        estado: esPerdida
          ? EstadoEntrega.PENDIENTE_APROBACION
          : EstadoEntrega.REGISTRADA,
        fechaEntrega: esPerdida ? undefined : new Date(),
        registradoPor: contexto.usuario,
        entregadoPor: esPerdida ? undefined : contexto.usuario,
        devolucion: dto.devolucion,
        perdida: dto.perdida,
        observacion: dto.observacion,
      });

      if (dto.firmaTrabajador) {
        await this.aplicarFirmaRecibo(
          doc,
          dto.firmaTrabajador,
          dto.metodoFirma,
          contexto,
        );
      }

      return doc;
    } catch (error) {
      // Si la escritura falló tras descontar, la linterna no salió: devolverla
      // al stock evita que se pierdan unidades por un error transitorio.
      if (!esPerdida) await this.stock.reponerUna();
      throw this.traducirErrorDeIndice(error);
    }
  }

  /** Aprueba o rechaza una reposición por pérdida. */
  async resolverPerdida(
    id: string,
    dto: ResolverPerdidaDto,
    contexto: ContextoFirma,
  ): Promise<EntregaLinterna> {
    const entrega = await this.buscarEntrega(id);

    if (entrega.tipo !== TipoEntrega.REPOSICION_PERDIDA) {
      throw new BadRequestException(
        'Solo las reposiciones por pérdida pasan por aprobación.',
      );
    }
    if (entrega.estado !== EstadoEntrega.PENDIENTE_APROBACION) {
      throw new ConflictException(
        `Esta solicitud ya está ${entrega.estado}; no se puede volver a resolver.`,
      );
    }
    if (dto.aprobar && !dto.firmaAprobador) {
      throw new BadRequestException(
        'Para aprobar hace falta la firma de quien autoriza.',
      );
    }

    if (dto.aprobar) {
      // Se descuenta al aprobar, que es cuando la linterna sale de verdad.
      await this.stock.descontarUna();
    }

    entrega.estado = dto.aprobar
      ? EstadoEntrega.APROBADA
      : EstadoEntrega.RECHAZADA;

    if (entrega.perdida) {
      entrega.perdida.aprobadoPor = contexto.usuario;
      entrega.perdida.fechaAprobacion = new Date();
      entrega.perdida.comentarioAprobador = dto.comentario;

      if (dto.firmaAprobador) {
        const firma = this.firmas.sellar(
          dto.firmaAprobador,
          this.metodo(dto.metodoFirma),
          contexto,
        );
        entrega.perdida.firmaAprobador = firma;
        await this.firmas.registrarAsiento(firma, {
          coleccion: COLECCION,
          documentoId: String(entrega._id),
          campo: 'perdida.firmaAprobador',
        });
      }
    }

    if (dto.aprobar) entrega.fechaEntrega = new Date();

    await entrega.save();
    this.logger.log(
      `Pérdida ${id} ${dto.aprobar ? 'aprobada' : 'rechazada'} por ${contexto.usuario}`,
    );
    return entrega;
  }

  /**
   * Acuse de recibo del trabajador.
   *
   * En una pérdida solo se admite con la solicitud ya aprobada: firmar antes
   * dejaría un acta firmada por algo que nadie autorizó.
   */
  async firmarRecibo(
    id: string,
    dto: FirmarReciboDto,
    contexto: ContextoFirma,
  ): Promise<EntregaLinterna> {
    const entrega = await this.buscarEntrega(id);

    if (entrega.estado === EstadoEntrega.PENDIENTE_APROBACION) {
      throw new ConflictException(
        'La reposición todavía no está aprobada; no se puede firmar el recibo.',
      );
    }
    if (entrega.estado === EstadoEntrega.RECHAZADA) {
      throw new ConflictException(
        'La reposición fue rechazada; no hay entrega que firmar.',
      );
    }
    if (entrega.firmaTrabajador) {
      throw new ConflictException(
        'Esta entrega ya está firmada. Para reemplazar la firma hace falta refirmar de forma explícita.',
      );
    }

    await this.aplicarFirmaRecibo(
      entrega,
      dto.firmaTrabajador,
      dto.metodoFirma,
      contexto,
    );
    return entrega;
  }

  // ── Interno ─────────────────────────────────────────────────────────────

  private async aplicarFirmaRecibo(
    entrega: EntregaLinterna,
    imagen: string,
    metodo: string | undefined,
    contexto: ContextoFirma,
  ): Promise<void> {
    const firma = this.firmas.sellar(imagen, this.metodo(metodo), contexto);
    entrega.firmaTrabajador = firma;
    if (!entrega.fechaEntrega) entrega.fechaEntrega = new Date();
    await entrega.save();

    await this.firmas.registrarAsiento(firma, {
      coleccion: COLECCION,
      documentoId: String(entrega._id),
      campo: 'firmaTrabajador',
    });
  }

  private metodo(valor?: string): MetodoFirma {
    return valor === MetodoFirma.SUBIDA
      ? MetodoFirma.SUBIDA
      : MetodoFirma.DIBUJADA;
  }

  /** Invariantes 1, 2 y 6. */
  private validarTipoContraEstado(
    dto: RegistrarEntregaDto,
    estado: EstadoTrabajador,
  ): void {
    if (estado.pendienteDeAprobacion) {
      throw new ConflictException(
        `${estado.nombre} tiene una reposición pendiente de aprobación; resuélvala antes de registrar otra entrega.`,
      );
    }

    if (dto.tipo === TipoEntrega.DOTACION && estado.tieneDotacion) {
      throw new ConflictException(
        `${estado.nombre} ya recibió su dotación. Registre un cambio o una reposición por pérdida.`,
      );
    }

    if (dto.tipo !== TipoEntrega.DOTACION && !estado.tieneDotacion) {
      throw new ConflictException(
        `${estado.nombre} todavía no tiene dotación: no se puede cambiar ni reponer lo que nunca se entregó.`,
      );
    }
  }

  /** Invariantes 3 y 4: cada tipo trae lo suyo, y solo lo suyo. */
  private validarBloquesDelTipo(dto: RegistrarEntregaDto): void {
    if (dto.tipo === TipoEntrega.CAMBIO) {
      if (!dto.devolucion?.foto?.url) {
        throw new BadRequestException(
          'Un cambio exige la foto de la linterna averiada que se devuelve.',
        );
      }
      if (dto.perdida) {
        throw new BadRequestException(
          'Un cambio no lleva justificación de pérdida.',
        );
      }
    }

    if (dto.tipo === TipoEntrega.REPOSICION_PERDIDA) {
      if (!dto.perdida?.justificacion?.trim()) {
        throw new BadRequestException(
          'Una reposición por pérdida exige la justificación del trabajador.',
        );
      }
      if (dto.devolucion) {
        throw new BadRequestException(
          'Una pérdida no lleva devolución: si hay linterna que devolver, es un cambio.',
        );
      }
    }

    if (dto.tipo === TipoEntrega.DOTACION && (dto.devolucion || dto.perdida)) {
      throw new BadRequestException(
        'Una dotación no lleva devolución ni justificación de pérdida.',
      );
    }
  }

  private async buscarTrabajador(id: string): Promise<DocTrabajador> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Identificador de trabajador inválido.');
    }
    const trabajador = await this.trabajadorModel
      .findById(id)
      .lean<DocTrabajador>()
      .exec();
    if (!trabajador) {
      throw new NotFoundException('El trabajador no existe.');
    }
    return trabajador;
  }

  private async buscarEntrega(id: string): Promise<EntregaLinterna> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Identificador de entrega inválido.');
    }
    const entrega = await this.entregaModel.findById(id).exec();
    if (!entrega) throw new NotFoundException('La entrega no existe.');
    return entrega;
  }

  /**
   * El índice único parcial es la última línea de defensa contra dos dotaciones
   * simultáneas. Cuando salta, el error de Mongo no le dice nada a nadie.
   */
  private traducirErrorDeIndice(error: unknown): unknown {
    const codigo = (error as { code?: number }).code;
    if (codigo === 11000) {
      return new ConflictException(
        'Este trabajador ya tiene una dotación registrada.',
      );
    }
    return error;
  }
}
