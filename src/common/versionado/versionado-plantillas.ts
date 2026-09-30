import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { INCLUIR_DADOS_DE_BAJA } from '../baja-logica/baja-logica.plugin';
import {
  CAMPOS_NO_COPIABLES,
  EstadoRevision,
  FILTRO_VIGENTE,
  estadoDe,
  numeroDesdeTexto,
  textoDeRevision,
} from './versionado';

/** Lo mínimo que el versionado necesita de un documento de plantilla. */
export interface PlantillaVersionable {
  _id: Types.ObjectId;
  code: string;
  name?: string;
  revision: string;
  numeroRevision?: number;
  estadoRevision?: EstadoRevision;
  revisionAnteriorId?: Types.ObjectId | null;
  motivoCambio?: string;
  vigenteDesde?: Date;
  obsoletaDesde?: Date;
  publicadaPor?: string;
  creadaPor?: string;
  createdAt?: Date;
  toObject?: () => Record<string, unknown>;
}

export interface EstadoEdicion {
  editable: boolean;
  estado: EstadoRevision;
  inspecciones: number;
  /** Por qué no se puede editar; vacío si se puede. */
  motivo?: string;
}

export interface EntradaHistorial {
  _id: string;
  name?: string;
  revision: string;
  numeroRevision: number;
  estadoRevision: EstadoRevision;
  motivoCambio?: string;
  vigenteDesde?: Date;
  obsoletaDesde?: Date;
  publicadaPor?: string;
  creadaPor?: string;
  createdAt?: Date;
  inspecciones: number;
}

/**
 * Operaciones de versionado, compartidas por las plantillas IRO/ISOP y las de
 * herramientas. Cada servicio la instancia con su modelo y con cómo contar
 * las inspecciones hechas con una revisión.
 *
 * No es un provider de Nest a propósito: son dos colecciones distintas con
 * la misma regla, y la regla no depende de nada inyectable.
 */
export class VersionadoPlantillas<T extends PlantillaVersionable> {
  constructor(
    private readonly modelo: Model<T>,
    private readonly contarInspecciones: (
      id: Types.ObjectId,
    ) => Promise<number>,
  ) {}

  /**
   * Si una revisión se puede editar en el lugar:
   * - borrador → sí;
   * - obsoleta → nunca;
   * - vigente → solo si todavía no tiene inspecciones. Con inspecciones, los
   *   cambios van en una revisión nueva.
   */
  async estadoEdicion(id: string): Promise<EstadoEdicion> {
    const doc = await this.buscar(id);
    const estado = estadoDe(doc);
    if (estado === EstadoRevision.BORRADOR) {
      return { editable: true, estado, inspecciones: 0 };
    }
    const inspecciones = await this.contarInspecciones(doc._id);
    if (estado === EstadoRevision.OBSOLETA) {
      return {
        editable: false,
        estado,
        inspecciones,
        motivo:
          'Es una revisión obsoleta: se conserva tal como se usó y no se modifica.',
      };
    }
    if (inspecciones > 0) {
      return {
        editable: false,
        estado,
        inspecciones,
        motivo: `Ya tiene ${inspecciones} inspección(es) hechas con esta revisión. Para cambiarla, cree una nueva revisión.`,
      };
    }
    return { editable: true, estado, inspecciones };
  }

  /** Lanza 409 si la revisión no se puede editar en el lugar. */
  async exigirEditable(id: string): Promise<void> {
    const estado = await this.estadoEdicion(id);
    if (!estado.editable) throw new ConflictException(estado.motivo);
  }

  /**
   * El código une a todas las revisiones de una familia, así que solo se
   * puede cambiar mientras la plantilla sea la única de su familia y el
   * código nuevo no esté en uso.
   */
  async exigirCodigoCambiable(
    doc: T,
    nuevoCodigo: string | undefined,
  ): Promise<void> {
    if (!nuevoCodigo || nuevoCodigo === doc.code) return;
    if (!(await this.esUnica(doc))) {
      throw new BadRequestException(
        'El código no se puede cambiar: es lo que une a las revisiones de esta plantilla.',
      );
    }
    await this.exigirCodigoLibre(nuevoCodigo);
  }

  /**
   * Valida una edición y devuelve los cambios a aplicar.
   *
   * - La revisión tiene que ser editable (ver {@link estadoEdicion}).
   * - El código solo cambia si la plantilla es la única de su familia.
   * - El texto de la revisión («Revisión: 7») también: si la plantilla es la
   *   única, se acepta y se recalcula `numeroRevision`; si tiene hermanas, el
   *   número lo gobierna el versionado y el texto que llegue se ignora.
   */
  async prepararEdicion<D extends { code?: string; revision?: string }>(
    id: string,
    cambios: D,
  ): Promise<D & { numeroRevision?: number }> {
    await this.exigirEditable(id);
    const actual = await this.buscar(id);
    await this.exigirCodigoCambiable(actual, cambios.code);

    const resultado: D & { numeroRevision?: number } = { ...cambios };
    if (
      cambios.revision !== undefined &&
      cambios.revision !== actual.revision
    ) {
      // El número se elige en un borrador (la organización puede saltear
      // números) o en una plantilla que todavía es la única de su familia.
      // En una vigente con hermanas lo gobierna el versionado: se ignora.
      const esBorrador = estadoDe(actual) === EstadoRevision.BORRADOR;
      if (esBorrador || (await this.esUnica(actual))) {
        const numero = numeroDesdeTexto(cambios.revision);
        const ultima = await this.mayorNumero(actual.code, actual._id);
        if (numero <= ultima) {
          throw new BadRequestException(
            `La revisión tiene que ser mayor que ${ultima}, la última de esta plantilla.`,
          );
        }
        resultado.numeroRevision = numero;
      } else {
        delete resultado.revision;
      }
    }
    return resultado;
  }

  /** Para dar de alta una plantilla nueva: el código no puede tener ya una vigente. */
  async exigirCodigoLibre(codigo: string): Promise<void> {
    const existente = await this.modelo
      .findOne({ code: codigo, ...FILTRO_VIGENTE })
      .exec();
    if (existente) {
      throw new ConflictException(
        `Ya existe una plantilla vigente con el código ${codigo}. Para cambiarla, cree una nueva revisión desde ella.`,
      );
    }
  }

  /** Campos de versionado de una plantilla recién creada: vigente desde ahora. */
  camposDeAlta(revisionTexto: string, usuario?: string) {
    return {
      numeroRevision: numeroDesdeTexto(revisionTexto),
      estadoRevision: EstadoRevision.VIGENTE,
      vigenteDesde: new Date(),
      creadaPor: usuario,
    };
  }

  /**
   * Clona la revisión vigente como **borrador** de la siguiente. El borrador
   * no se ofrece para inspeccionar hasta que se publica.
   */
  async crearRevision(id: string, usuario: string): Promise<T> {
    const base = await this.buscar(id);
    if (estadoDe(base) !== EstadoRevision.VIGENTE) {
      throw new BadRequestException(
        'Solo se crea una revisión nueva a partir de la vigente.',
      );
    }

    const borrador = await this.modelo
      .findOne({ code: base.code, estadoRevision: EstadoRevision.BORRADOR })
      .exec();
    if (borrador) {
      throw new ConflictException(
        `Ya hay una revisión en preparación (${borrador.revision}). Edítela o descártela antes de crear otra.`,
      );
    }

    const numero = (await this.mayorNumero(base.code)) + 1;
    const datos = (base.toObject?.() ?? { ...base }) as unknown as Record<
      string,
      unknown
    >;
    for (const campo of CAMPOS_NO_COPIABLES) delete datos[campo];

    try {
      return await this.modelo.create({
        ...datos,
        numeroRevision: numero,
        revision: textoDeRevision(base.revision, numero),
        estadoRevision: EstadoRevision.BORRADOR,
        revisionAnteriorId: base._id,
        creadaPor: usuario,
      });
    } catch (error) {
      // Duplicado de clave sin que haya otro borrador ni otro número igual:
      // la base todavía tiene un índice único sobre `code` de antes del
      // versionado (el `code_1` de IRO). Sin esta traducción el usuario solo
      // ve un error genérico.
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'No se pudo crear la revisión: la base todavía exige un código único por plantilla. Falta aplicar la migración del versionado (scripts/migrar-versionado-plantillas.cjs).',
        );
      }
      throw error;
    }
  }

  /**
   * Publica un borrador: pasa a vigente y la vigente anterior a obsoleta.
   *
   * Primero se marca obsoleta la anterior y después vigente la nueva: el
   * índice único parcial no admite dos vigentes ni por un instante. Si el
   * segundo paso falla, la anterior se devuelve a vigente para no dejar la
   * familia sin ninguna.
   */
  async publicar(id: string, motivoCambio: string, usuario: string) {
    const motivo = (motivoCambio ?? '').trim();
    if (!motivo) {
      throw new BadRequestException(
        'Indique el motivo del cambio para publicar la revisión.',
      );
    }
    const borrador = await this.buscar(id);
    if (estadoDe(borrador) !== EstadoRevision.BORRADOR) {
      throw new BadRequestException(
        'Solo se publica una revisión en borrador.',
      );
    }

    const ahora = new Date();
    const anterior = await this.modelo
      .findOne({
        code: borrador.code,
        ...FILTRO_VIGENTE,
        _id: { $ne: borrador._id },
      })
      .exec();

    if (anterior) {
      await this.modelo
        .updateOne(
          { _id: anterior._id },
          { estadoRevision: EstadoRevision.OBSOLETA, obsoletaDesde: ahora },
        )
        .exec();
    }

    try {
      const publicada = await this.modelo
        .findOneAndUpdate(
          { _id: borrador._id },
          {
            estadoRevision: EstadoRevision.VIGENTE,
            vigenteDesde: ahora,
            publicadaPor: usuario,
            motivoCambio: motivo,
          },
          { new: true },
        )
        .exec();
      return { publicada, obsoleta: anterior?._id ?? null };
    } catch (error) {
      if (anterior) {
        await this.modelo
          .updateOne(
            { _id: anterior._id },
            {
              $set: { estadoRevision: EstadoRevision.VIGENTE },
              $unset: { obsoletaDesde: '' },
            },
          )
          .exec();
      }
      throw error;
    }
  }

  /** Todas las revisiones de un código, de la más nueva a la más vieja. */
  async historial(codigo: string): Promise<EntradaHistorial[]> {
    // `lean`: sin los valores por defecto del esquema (ver `numeroDe`).
    const docs = await this.modelo
      .find({ code: codigo })
      .sort({ numeroRevision: -1, createdAt: -1 })
      .lean<T[]>()
      .exec();
    const ordenados = [...docs].sort((a, b) => numeroDe(b) - numeroDe(a));
    return Promise.all(
      ordenados.map(async (d) => ({
        _id: String(d._id),
        name: d.name,
        revision: d.revision,
        numeroRevision: numeroDe(d),
        estadoRevision: estadoDe(d),
        motivoCambio: d.motivoCambio,
        vigenteDesde: d.vigenteDesde,
        obsoletaDesde: d.obsoletaDesde,
        publicadaPor: d.publicadaPor,
        creadaPor: d.creadaPor,
        createdAt: d.createdAt,
        inspecciones: await this.contarInspecciones(d._id),
      })),
    );
  }

  /** `true` si es la única revisión de su código (contando las dadas de baja). */
  private async esUnica(doc: T): Promise<boolean> {
    const hermanas = await this.modelo
      .countDocuments({ code: doc.code, _id: { $ne: doc._id } })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .exec();
    return hermanas === 0;
  }

  private async buscar(id: string): Promise<T> {
    const doc = await this.modelo.findById(id).exec();
    if (!doc) throw new NotFoundException('Plantilla no encontrada');
    return doc;
  }

  /**
   * El número más alto usado en la familia, incluidas las revisiones dadas de
   * baja: el índice único `{ code, numeroRevision }` también las cuenta.
   */
  private async mayorNumero(
    codigo: string,
    excluirId?: Types.ObjectId,
  ): Promise<number> {
    const docs = await this.modelo
      .find({
        code: codigo,
        ...(excluirId ? { _id: { $ne: excluirId } } : {}),
      })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .select('numeroRevision revision')
      .lean<Array<Pick<T, 'numeroRevision' | 'revision'>>>()
      .exec();
    return docs.reduce((max, d) => Math.max(max, numeroDe(d)), 0);
  }
}

/**
 * El número de revisión de un documento **tal como está guardado**.
 *
 * Se lee con `lean()` a propósito: al hidratar un documento, Mongoose le
 * completa `numeroRevision` con el valor por defecto del esquema (1) si no lo
 * tiene. Las plantillas anteriores a la migración no lo tienen, y ese 1
 * falso hizo que la revisión siguiente de «Revisión: 7» saliera «Revisión: 2».
 * Sin el campo, el número sale del texto.
 */
function numeroDe(d: { numeroRevision?: number; revision: string }): number {
  return d.numeroRevision ?? numeroDesdeTexto(d.revision);
}
