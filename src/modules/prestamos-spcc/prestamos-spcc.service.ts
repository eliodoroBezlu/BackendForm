import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SolicitudPrestamo,
  EstadoSolicitud,
} from './schemas/solicitud-prestamo.schema';
import {
  PrestamoSpcc,
  EstadoPrestamo,
  EstadoDevolucion,
  ESTADOS_ACTIVOS,
} from './schemas/prestamo-spcc.schema';
import { Equipo } from '../equipos/schemas/equipo.schema';
import {
  AREA_PRESTADORA,
  ESTADOS_NO_PRESTABLES,
  TIPOS_PRESTABLES,
  normalizar,
} from './constantes';
import {
  CancelarDto,
  CrearSolicitudDto,
  DevolverDto,
  EntregarDto,
} from './dto/prestamos.dto';
import { FirmaService, ContextoFirma } from '../../common/firma/firma.service';
import { MetodoFirma } from '../../common/firma/firma.schema';

/** Lo que hace falta saber de quien realiza la acción. */
export interface Actor extends ContextoFirma {
  nombre?: string;
}

@Injectable()
export class PrestamosSpccService {
  constructor(
    @InjectModel(SolicitudPrestamo.name)
    private readonly solicitudes: Model<SolicitudPrestamo>,
    @InjectModel(PrestamoSpcc.name)
    private readonly prestamos: Model<PrestamoSpcc>,
    @InjectModel(Equipo.name)
    private readonly equipos: Model<Equipo>,
    private readonly firmas: FirmaService,
  ) {}

  // ── Consulta del catálogo prestable ────────────────────────────────────

  /**
   * Equipos que hoy se pueden pedir.
   *
   * Excluye los que ya están fuera consultando las líneas activas, en vez de
   * guardar una bandera «prestado» en el equipo: una bandera se desincroniza
   * en cuanto una operación falla a medias, y aquí el estado real es el
   * conjunto de líneas.
   */
  /**
   * Qué equipos están prestados ahora mismo y a qué área.
   *
   * Lo consume el selector del formulario SPCC para etiquetarlos. **No los
   * oculta**: un equipo prestado es precisamente el que se va a usar, así que
   * es el que más falta hace inspeccionar; la etiqueta solo dice dónde está.
   */
  async prestadosAhora(): Promise<Record<string, string>> {
    const activos = await this.prestamos
      .find({ estado: EstadoPrestamo.ENTREGADO })
      .select('codigo solicitud')
      .lean<{ codigo: string; solicitud: Types.ObjectId }[]>()
      .exec();

    if (activos.length === 0) return {};

    const cabeceras = await this.solicitudes
      .find({ _id: { $in: activos.map((a) => a.solicitud) } })
      .select('areaSolicitante')
      .lean<{ _id: Types.ObjectId; areaSolicitante: string }[]>()
      .exec();

    const areaPorSolicitud = new Map(
      cabeceras.map((c) => [String(c._id), c.areaSolicitante]),
    );

    const salida: Record<string, string> = {};
    for (const linea of activos) {
      const area = areaPorSolicitud.get(String(linea.solicitud));
      if (area) salida[linea.codigo] = area;
    }
    return salida;
  }

  async disponibles(tipo?: string): Promise<Equipo[]> {
    const area = await this.areaPrestadora();

    const ocupados = await this.prestamos.distinct('equipo', {
      estado: { $in: ESTADOS_ACTIVOS },
    });

    return this.equipos
      .find({
        area_id: area._id,
        tipo_equipo: tipo ? tipo : { $in: [...TIPOS_PRESTABLES] },
        estado: { $nin: ESTADOS_NO_PRESTABLES },
        _id: { $nin: ocupados },
      })
      .sort({ tipo_equipo: 1, codigo: 1 })
      .lean<Equipo[]>()
      .exec();
  }

  /**
   * El área que presta, resuelta por nombre normalizado.
   *
   * Se busca así y no por id fijo porque el maestro de áreas se sincroniza
   * desde el IAM y los ids pueden cambiar entre entornos.
   */
  private async areaPrestadora(): Promise<{ _id: Types.ObjectId }> {
    const areas = await this.equipos.db
      .collection('areas')
      .find({})
      .project({ nombre: 1 })
      .toArray();

    const buscada = normalizar(AREA_PRESTADORA);
    const area = areas.find(
      (a) => normalizar(String(a.nombre ?? '')) === buscada,
    );

    if (!area) {
      throw new NotFoundException(
        `No existe el área «${AREA_PRESTADORA}», que es la que presta los SPCC.`,
      );
    }
    return { _id: area._id as Types.ObjectId };
  }

  /**
   * Nombre del trabajador detrás de un usuario del sistema.
   *
   * El JWT trae `fullName: null` —el IAM no lo propaga—, así que sin esto el
   * acta y la lista mostraban el usuario de acceso (`natalia`) en vez de la
   * persona («Erquicia Landeau Natalia Sofia»). Un préstamo es un documento
   * sobre personas, no sobre cuentas.
   *
   * Si el usuario no está en la nómina se devuelve `undefined` y quien lo lea
   * caerá en el username, que es mejor que un hueco.
   */
  private async nombreDeTrabajador(
    username: string,
  ): Promise<string | undefined> {
    const trabajador = await this.equipos.db
      .collection('trabajadors')
      .findOne({ username }, { projection: { nomina: 1 } });

    const nomina = (trabajador as { nomina?: string } | null)?.nomina;
    return nomina?.trim() || undefined;
  }

  // ── Solicitar ──────────────────────────────────────────────────────────

  /**
   * Registra la **intención**: qué tipos, cuántos y para cuándo.
   *
   * Ya no se eligen equipos concretos. Quien pide sabe que necesita dos
   * arneses; cuáles salgan del almacén depende de qué haya libre el día de la
   * entrega, así que fijarlos aquí solo servía para que caducaran. Las líneas
   * de `prestamos_spcc` —y con ellas la reserva del equipo— nacen al entregar.
   */
  async crear(
    dto: CrearSolicitudDto,
    actor: Actor,
  ): Promise<SolicitudPrestamo> {
    const { inicio, devolucion } = this.validarPlazo(dto);
    const solicitado = this.validarSolicitado(dto.solicitado);

    const solicitud = await this.solicitudes.create({
      numero: await this.siguienteNumero(),
      areaSolicitante: dto.areaSolicitante,
      areaSolicitanteId: dto.areaSolicitanteId
        ? new Types.ObjectId(dto.areaSolicitanteId)
        : undefined,
      superintendenciaSolicitante: dto.superintendenciaSolicitante,
      solicitanteUsername: actor.usuario,
      solicitanteNombre:
        (await this.nombreDeTrabajador(actor.usuario)) ?? actor.nombre,
      motivo: dto.motivo,
      solicitado,
      fechaSolicitud: new Date(),
      fechaInicioPrevista: inicio,
      fechaDevolucionPrevista: devolucion,
      estado: EstadoSolicitud.SOLICITADA,
    });

    return solicitud;
  }

  /**
   * Un `YYYY-MM-DD` interpretado en la zona horaria **del servidor**.
   *
   * `new Date('2026-08-21')` es medianoche UTC, que en UTC−4 cae a las 20:00
   * del día anterior. Comparada contra un «hoy» local, la fecha de hoy quedaba
   * en el pasado y el formulario rechazaba cualquier préstamo que empezara
   * hoy. Los `<input type="date">` mandan exactamente ese formato, así que la
   * fecha hay que construirla por partes.
   */
  private aFechaLocal(texto: string): Date {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (!soloFecha) return new Date(texto);
    const [, anio, mes, dia] = soloFecha;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  }

  /**
   * Invariante 4, ahora con dos extremos: ni el inicio en el pasado, ni la
   * devolución antes del inicio. Un préstamo que termina antes de empezar no
   * es un dato raro, es un dato imposible.
   */
  private validarPlazo(dto: CrearSolicitudDto): {
    inicio: Date;
    devolucion: Date;
  } {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Sin fecha de inicio se asume hoy: es lo que hacían las solicitudes
    // anteriores a este campo, que empezaban el día que se pedían.
    const inicio = dto.fechaInicioPrevista
      ? this.aFechaLocal(dto.fechaInicioPrevista)
      : hoy;
    const devolucion = this.aFechaLocal(dto.fechaDevolucionPrevista);

    if (Number.isNaN(inicio.getTime()) || inicio < hoy) {
      throw new BadRequestException(
        'La fecha de inicio del préstamo no puede ser anterior a hoy.',
      );
    }
    if (Number.isNaN(devolucion.getTime()) || devolucion < inicio) {
      throw new BadRequestException(
        'La fecha de devolución no puede ser anterior a la de inicio.',
      );
    }
    return { inicio, devolucion };
  }

  /**
   * Invariante 3: una solicitud sin nada pedido no existe.
   *
   * Además agrupa los tipos repetidos en vez de rechazarlos: si el formulario
   * manda «Arnes 2» y «Arnes 1», lo que quiso decir son tres arneses.
   */
  private validarSolicitado(
    lineas: { tipoEquipo: string; cantidad: number }[],
  ): { tipoEquipo: string; cantidad: number }[] {
    const porTipo = new Map<string, number>();

    for (const linea of lineas) {
      if (!TIPOS_PRESTABLES.includes(linea.tipoEquipo as never)) {
        throw new BadRequestException(
          `«${linea.tipoEquipo}» no es un tipo de SPCC prestable.`,
        );
      }
      if (linea.cantidad > 0) {
        porTipo.set(
          linea.tipoEquipo,
          (porTipo.get(linea.tipoEquipo) ?? 0) + linea.cantidad,
        );
      }
    }

    if (porTipo.size === 0) {
      throw new BadRequestException('Hay que pedir al menos un equipo.');
    }

    return [...porTipo].map(([tipoEquipo, cantidad]) => ({
      tipoEquipo,
      cantidad,
    }));
  }

  /**
   * Comprueba que estos equipos se pueden prestar y los devuelve.
   *
   * Las tres invariantes que antes vivían dentro de `crear`: son del almacén,
   * son SPCC y no están dañados. Ahora se aplican al **entregar**, que es
   * cuando los equipos concretos entran en juego.
   */
  private async validarPrestables(ids: string[]): Promise<Equipo[]> {
    const unicos = [...new Set(ids)].map((id) => new Types.ObjectId(id));
    if (unicos.length === 0) {
      throw new BadRequestException('Hay que entregar al menos un equipo.');
    }

    const area = await this.areaPrestadora();
    const equipos = await this.equipos
      .find({ _id: { $in: unicos } })
      .lean<Equipo[]>()
      .exec();

    if (equipos.length !== unicos.length) {
      throw new BadRequestException(
        'Alguno de los equipos ya no existe en el inventario.',
      );
    }

    for (const equipo of equipos) {
      // Invariante 1: solo se presta lo del área prestadora.
      if (String(equipo.area_id) !== String(area._id)) {
        throw new BadRequestException(
          `El equipo ${equipo.codigo} no pertenece a ${AREA_PRESTADORA}.`,
        );
      }
      if (!TIPOS_PRESTABLES.includes(equipo.tipo_equipo as never)) {
        throw new BadRequestException(
          `El equipo ${equipo.codigo} no es un SPCC prestable.`,
        );
      }
      // Invariante 2: lo dañado o de baja no sale.
      if (equipo.estado && ESTADOS_NO_PRESTABLES.includes(equipo.estado)) {
        throw new BadRequestException(
          `El equipo ${equipo.codigo} está «${equipo.estado}» y no se puede prestar.`,
        );
      }
    }

    return equipos;
  }

  /**
   * Correlativo `PR-<año>-<n>`.
   *
   * Se calcula con un `findOneAndUpdate` sobre un contador por año: contar los
   * documentos existentes daría el mismo número a dos solicitudes creadas a la
   * vez, y el número es único en la base.
   */
  private async siguienteNumero(): Promise<string> {
    const anio = new Date().getFullYear();
    const contadores = this.solicitudes.db.collection('contadores');

    const resultado = await contadores.findOneAndUpdate(
      { _id: `prestamo-${anio}` as never },
      { $inc: { valor: 1 } },
      { upsert: true, returnDocument: 'after' },
    );

    const valor = (resultado as { valor?: number } | null)?.valor ?? 1;
    return `PR-${anio}-${String(valor).padStart(4, '0')}`;
  }

  /** Convierte el choque del índice único en un mensaje que se entienda. */
  private traducirChoque(error: unknown, equipos: Equipo[]): Error {
    const codigo = (error as { code?: number })?.code;
    if (codigo === 11000) {
      const mensaje = String((error as Error).message ?? '');
      const culpable = equipos.find((e) => mensaje.includes(String(e._id)));
      return new ConflictException(
        culpable
          ? `El equipo ${culpable.codigo} ya está en otro préstamo activo.`
          : 'Alguno de los equipos ya está en otro préstamo activo.',
      );
    }
    return error as Error;
  }

  // ── Entregar ───────────────────────────────────────────────────────────

  /**
   * Saca los equipos del almacén.
   *
   * **Es aquí donde se decide qué sale.** El admin manda los ids de los
   * equipos concretos y con ellos nacen las líneas de `prestamos_spcc`, que
   * son las que reservan cada equipo mediante el índice único.
   *
   * Las solicitudes anteriores a este cambio ya traen sus líneas creadas: en
   * ésas no se manda `equipos` y basta con marcarlas entregadas.
   */
  async entregar(
    id: string,
    dto: EntregarDto,
    actor: Actor,
  ): Promise<SolicitudPrestamo> {
    const solicitud = await this.buscar(id);

    // Invariante 5: solo se entrega lo que está solicitado.
    if (solicitud.estado !== EstadoSolicitud.SOLICITADA) {
      throw new ConflictException(
        `Esta solicitud está «${solicitud.estado}» y ya no se puede entregar.`,
      );
    }

    const yaTieneLineas = await this.prestamos.countDocuments({
      solicitud: solicitud._id,
      estado: EstadoPrestamo.SOLICITADO,
    });

    // Las líneas se crean **antes** de tocar la cabecera: si un equipo choca
    // con otro préstamo, la solicitud debe quedar como estaba y volver a
    // intentarse con otro código, no quedarse entregada y vacía.
    let equipos: Equipo[] = [];
    if (yaTieneLineas === 0) {
      equipos = await this.validarPrestables(dto.equipos ?? []);
      try {
        await this.prestamos.insertMany(
          equipos.map((equipo) => ({
            solicitud: solicitud._id,
            equipo: equipo._id,
            codigo: equipo.codigo,
            rfid: equipo.rfid,
            descripcion: equipo.descripcion,
            tipoEquipo: equipo.tipo_equipo,
            foto: equipo.fotos?.[0]?.url,
            estado: EstadoPrestamo.ENTREGADO,
          })),
          { ordered: true },
        );
      } catch (error) {
        // Deshace las líneas que sí entraron antes del choque: media entrega
        // dejaría equipos reservados para una solicitud que sigue pendiente.
        await this.prestamos.deleteMany({
          solicitud: solicitud._id,
          estado: EstadoPrestamo.ENTREGADO,
        });
        throw this.traducirChoque(error, equipos);
      }
    }

    solicitud.entrega = {
      fecha: new Date(),
      entregadoPor: actor.usuario,
      firmaEntrega: dto.firmaEntrega
        ? this.firmas.sellar(dto.firmaEntrega, MetodoFirma.DIBUJADA, actor)
        : undefined,
      firmaReceptor: dto.firmaReceptor
        ? this.firmas.sellar(dto.firmaReceptor, MetodoFirma.DIBUJADA, actor)
        : undefined,
      observacion: dto.observacion,
    };
    solicitud.estado = EstadoSolicitud.ENTREGADA;
    await solicitud.save();

    // Solo alcanza a las solicitudes antiguas; las nuevas ya nacieron
    // entregadas unas líneas más arriba.
    await this.prestamos.updateMany(
      { solicitud: solicitud._id, estado: EstadoPrestamo.SOLICITADO },
      { $set: { estado: EstadoPrestamo.ENTREGADO } },
    );

    return solicitud;
  }

  // ── Devolver ───────────────────────────────────────────────────────────

  async devolver(
    id: string,
    dto: DevolverDto,
    actor: Actor,
  ): Promise<SolicitudPrestamo> {
    const solicitud = await this.buscar(id);

    if (solicitud.estado !== EstadoSolicitud.ENTREGADA) {
      throw new ConflictException(
        `No se puede devolver: la solicitud está «${solicitud.estado}».`,
      );
    }

    for (const item of dto.items) {
      // Invariante 5: solo se devuelve lo que está fuera. La condición va en
      // el propio update para que dos devoluciones simultáneas del mismo ítem
      // no se pisen.
      const actualizado = await this.prestamos.findOneAndUpdate(
        {
          _id: new Types.ObjectId(item.prestamo),
          solicitud: solicitud._id,
          estado: EstadoPrestamo.ENTREGADO,
        },
        {
          $set: {
            estado: EstadoPrestamo.DEVUELTO,
            devolucion: {
              fecha: new Date(),
              registradoPor: actor.usuario,
              estado: item.estado,
              foto: item.foto,
              observacion: item.observacion,
            },
          },
        },
        { new: true },
      );

      if (!actualizado) {
        throw new ConflictException(
          'Alguno de los equipos ya estaba devuelto o no es de esta solicitud.',
        );
      }

      // Un equipo que vuelve dañado no puede reaparecer en el siguiente
      // préstamo como si nada: se refleja en el inventario.
      if (item.estado !== EstadoDevolucion.OPERATIVO) {
        await this.equipos.updateOne(
          { _id: actualizado.equipo },
          {
            $set: {
              estado:
                item.estado === EstadoDevolucion.BAJA
                  ? 'De Baja'
                  : 'Mantenimiento',
            },
          },
        );
      }
    }

    // Invariante 6: la cabecera cierra sola cuando no queda nada fuera.
    const pendientes = await this.prestamos.countDocuments({
      solicitud: solicitud._id,
      estado: { $in: ESTADOS_ACTIVOS },
    });

    if (pendientes === 0) {
      solicitud.estado = EstadoSolicitud.CERRADA;
      solicitud.fechaCierre = new Date();
      await solicitud.save();
    }

    return solicitud;
  }

  // ── Cancelar ───────────────────────────────────────────────────────────

  async cancelar(
    id: string,
    dto: CancelarDto,
    actor: Actor,
  ): Promise<SolicitudPrestamo> {
    const solicitud = await this.buscar(id);

    // Invariante 7: cancelar solo antes de entregar. Después ya hay equipos
    // fuera y lo que corresponde es devolverlos, no borrar el rastro.
    if (solicitud.estado !== EstadoSolicitud.SOLICITADA) {
      throw new ConflictException(
        `No se puede cancelar: la solicitud está «${solicitud.estado}».`,
      );
    }

    solicitud.estado = EstadoSolicitud.CANCELADA;
    solicitud.canceladaPor = actor.usuario;
    solicitud.motivoCancelacion = dto.motivo;
    await solicitud.save();

    // Las líneas pasan a canceladas y con eso liberan el índice: los equipos
    // vuelven a estar disponibles al instante.
    await this.prestamos.updateMany(
      { solicitud: solicitud._id, estado: EstadoPrestamo.SOLICITADO },
      { $set: { estado: EstadoPrestamo.CANCELADO } },
    );

    return solicitud;
  }

  // ── Lectura ────────────────────────────────────────────────────────────

  async buscar(id: string): Promise<SolicitudPrestamo> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Identificador de solicitud inválido.');
    }
    const solicitud = await this.solicitudes.findById(id);
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');
    return solicitud;
  }

  async lineas(solicitudId: string): Promise<PrestamoSpcc[]> {
    return this.prestamos
      .find({ solicitud: new Types.ObjectId(solicitudId) })
      .sort({ tipoEquipo: 1, codigo: 1 })
      .lean<PrestamoSpcc[]>()
      .exec();
  }

  async listar(filtros: {
    estado?: EstadoSolicitud;
    area?: string;
    solicitante?: string;
  }): Promise<SolicitudPrestamo[]> {
    const consulta: Record<string, unknown> = {};
    if (filtros.estado) consulta.estado = filtros.estado;
    if (filtros.area) consulta.areaSolicitante = filtros.area;
    if (filtros.solicitante) consulta.solicitanteUsername = filtros.solicitante;

    return this.solicitudes
      .find(consulta)
      .sort({ createdAt: -1 })
      .lean<SolicitudPrestamo[]>()
      .exec();
  }
}
