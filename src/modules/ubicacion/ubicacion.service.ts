import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import { UpdateUbicacionDto } from './dto/update-ubicacion.dto';
import { Ubicacion, UbicacionDocument } from './schemas/ubicacion.schema';
import { Equipo, EquipoDocument } from '../equipos/schemas/equipo.schema';
import {
  INCLUIR_DADOS_DE_BAJA,
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';
import {
  NIVEL_MAXIMO,
  NodoPadre,
  NodoPlano,
  PROFUNDIDAD_MAXIMA,
  alturaSubarbol,
  derivadosDe,
  formariaCiclo,
  limpiarNombre,
  partirRuta,
  recalcularDescendientes,
} from './arbol/ubicacion-arbol';

/** Campos del árbol tal como se guardan: ids como `ObjectId`. */
interface CamposArbol {
  padre: Types.ObjectId | null;
  ancestros: Types.ObjectId[];
  ruta: string;
  nivel: number;
  nombreNormalizado?: string;
}

@Injectable()
export class UbicacionService {
  constructor(
    @InjectModel(Ubicacion.name)
    private readonly ubicacionModel: Model<UbicacionDocument>,
    @InjectModel(Equipo.name)
    private readonly equipoModel: Model<EquipoDocument>,
  ) {}

  async create(createDto: CreateUbicacionDto): Promise<Ubicacion> {
    const nombre = limpiarNombre(createDto.nombre);
    const padre = createDto.padre
      ? this.comoNodo(await this.padreActivo(createDto.padre))
      : null;

    const derivados = derivadosDe(nombre, padre);
    if (derivados.nivel > NIVEL_MAXIMO) {
      throw new BadRequestException(
        `'${padre?.ruta}' ya está en el nivel ${PROFUNDIDAD_MAXIMA}, el máximo: no admite ubicaciones debajo`,
      );
    }
    await this.exigirHermanoLibre(derivados.padre, derivados.nombreNormalizado);

    return this.ubicacionModel.create({
      nombre,
      ...this.aMongo(derivados),
    });
  }

  /**
   * Lista plana ordenada por ruta; el árbol lo arma el frontend.
   *
   * `incluirBajas` es para la pantalla de administración, que necesita ver lo
   * dado de baja para poder restaurarlo. El resto de pantallas (el selector de
   * ubicación de un equipo) lo omite.
   */
  async findAll(incluirBajas = false): Promise<Ubicacion[]> {
    return this.ubicacionModel
      .find()
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: incluirBajas })
      .collation({ locale: 'es', strength: 1 })
      .sort({ ruta: 1 })
      .exec();
  }

  async findOne(id: string): Promise<UbicacionDocument> {
    const item = await this.ubicacionModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Ubicación con ID ${id} no encontrada`);
    }
    return item;
  }

  /**
   * Resuelve la columna «Ubicación» del Excel de importación.
   *
   * `"Taller de flotación > Bodega 1 > Estante A"` busca o crea cada tramo
   * **bajo el anterior** y devuelve el último. Un nombre sin `>` es una raíz:
   * nunca se busca entre nodos de otros niveles, porque en cuanto haya dos
   * «Estante A» en bodegas distintas el nombre suelto sería ambiguo.
   *
   * Lanza —y el importador omite la fila y lo reporta— si la ruta pasa de
   * {@link PROFUNDIDAD_MAXIMA} tramos o atraviesa una ubicación dada de baja.
   */
  async findOrCreateByRuta(texto: string): Promise<UbicacionDocument> {
    const tramos = partirRuta(texto);
    if (tramos.length === 0) {
      throw new BadRequestException(`La ubicación '${texto}' está vacía`);
    }
    if (tramos.length > PROFUNDIDAD_MAXIMA) {
      throw new BadRequestException(
        `La ubicación '${texto}' tiene ${tramos.length} niveles; el máximo es ${PROFUNDIDAD_MAXIMA}`,
      );
    }

    let actual: UbicacionDocument | null = null;
    for (const tramo of tramos) {
      const derivados = derivadosDe(tramo, actual && this.comoNodo(actual));
      const existente = await this.hermano(
        derivados.padre,
        derivados.nombreNormalizado,
      );
      if (existente?.activo === false) {
        throw new BadRequestException(
          `La ubicación '${existente.ruta}' está dada de baja: hay que restaurarla o corregir la ruta en el Excel`,
        );
      }
      actual =
        existente ??
        (await this.ubicacionModel.create({
          nombre: tramo,
          ...this.aMongo(derivados),
        }));
    }
    return actual as UbicacionDocument;
  }

  /**
   * Renombra y/o mueve. Las dos cosas cambian la `ruta` de todo lo que cuelga
   * del nodo, así que se recalcula el subárbol entero —incluidos los
   * descendientes dados de baja: si no, al restaurarlos traerían una ruta
   * vieja—.
   *
   * No es atómico (no hay transacciones en este despliegue): si falla a mitad
   * de los descendientes, volver a guardar el mismo nodo los termina de
   * recalcular, porque el cálculo parte siempre del nodo, no de lo guardado.
   */
  async update(id: string, updateDto: UpdateUbicacionDto): Promise<Ubicacion> {
    const nodo = await this.findOne(id);
    const nombre =
      updateDto.nombre !== undefined
        ? limpiarNombre(updateDto.nombre)
        : nodo.nombre;

    const padreId =
      updateDto.padre !== undefined
        ? updateDto.padre
        : nodo.padre
          ? String(nodo.padre)
          : null;
    const padre = padreId
      ? this.comoNodo(await this.padreActivo(padreId))
      : null;

    if (padre && formariaCiclo(id, padre)) {
      throw new BadRequestException(
        'No se puede mover una ubicación dentro de sí misma ni de una que cuelga de ella',
      );
    }

    const derivados = derivadosDe(nombre, padre);
    const descendientes = await this.descendientesDe(id);
    const altura = alturaSubarbol(id, descendientes);
    if (derivados.nivel + altura > NIVEL_MAXIMO) {
      throw new BadRequestException(
        `No cabe: '${nombre}' tiene ${altura} nivel(es) debajo y el más hondo quedaría en el nivel ${derivados.nivel + altura + 1}; el máximo es ${PROFUNDIDAD_MAXIMA}`,
      );
    }
    await this.exigirHermanoLibre(
      derivados.padre,
      derivados.nombreNormalizado,
      id,
    );

    const actualizado = await this.ubicacionModel
      .findByIdAndUpdate(
        id,
        { nombre, ...this.aMongo(derivados) },
        { new: true },
      )
      .exec();
    if (!actualizado) {
      throw new NotFoundException(`Ubicación con ID ${id} no encontrada`);
    }

    const cambios = recalcularDescendientes(
      { _id: id, ...derivados },
      descendientes,
    );
    if (cambios.length > 0) {
      // `bulkWrite` no pasa por los ganchos de baja lógica: actualiza también
      // los descendientes inactivos, que es lo que se quiere.
      await this.ubicacionModel.bulkWrite(
        cambios.map(({ _id, ...campos }) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(_id) },
            update: { $set: this.aMongo(campos) },
          },
        })),
      );
    }
    return actualizado;
  }

  /**
   * Da de baja el registro; no lo borra.
   *
   * Se bloquea si le quedan ubicaciones hijas o equipos activos: darla de
   * baja los dejaría colgando de algo que ya no aparece en ninguna lista.
   *
   * Devuelve el documento porque el interceptor de auditoria archiva lo que
   * devuelven los `DELETE`. Un `null` significa que no existe o que ya estaba
   * de baja: desde fuera las dos cosas son un 404.
   */
  async remove(id: string, usuario: string) {
    const oid = new Types.ObjectId(id);
    const [hijos, equipos] = await Promise.all([
      this.ubicacionModel.countDocuments({ padre: oid }).exec(),
      this.equipoModel.countDocuments({ ubicacion_id: oid }).exec(),
    ]);
    if (hijos > 0 || equipos > 0) {
      const partes = [
        hijos > 0 ? `${hijos} ubicación(es) debajo` : '',
        equipos > 0 ? `${equipos} equipo(s)` : '',
      ].filter(Boolean);
      throw new ConflictException(
        `No se puede dar de baja: tiene ${partes.join(' y ')}. Primero hay que moverlos a otra ubicación o darlos de baja.`,
      );
    }

    const result = await this.ubicacionModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();
    if (!result) {
      throw new NotFoundException(`Ubicación con ID ${id} no encontrada`);
    }
    return result;
  }

  /**
   * Devuelve al uso un registro dado de baja. Exige que su padre esté activo:
   * si no, reaparecería colgando de algo que no se ve.
   */
  async restaurar(id: string) {
    const nodo = await this.ubicacionModel
      .findOne({ _id: id, activo: false })
      .exec();
    if (!nodo) {
      throw new NotFoundException(
        'No encontrado o no estaba dado de baja: ' + id,
      );
    }
    if (nodo.padre) {
      const padre = await this.ubicacionModel.findById(nodo.padre).exec();
      if (!padre) {
        throw new BadRequestException(
          'La ubicación de la que cuelga está dada de baja: hay que restaurar primero esa',
        );
      }
    }

    return this.ubicacionModel
      .findOneAndUpdate({ _id: id, activo: false }, marcarRestaurado(), {
        new: true,
      })
      .exec();
  }

  /**
   * Junta `origen` en `destino`: sus equipos y sus ubicaciones hijas pasan al
   * destino, y el origen queda dado de baja. Es para los casi-duplicados
   * heredados del inventario («TALLER SOLDADURA» → «TALLER DE SOLDADURA»).
   *
   * Se valida todo antes de mover nada: que el destino no cuelgue del origen,
   * que ninguna hija choque de nombre con una del destino, y que el subárbol
   * quepa en la profundidad máxima. Los equipos dados de baja también se
   * mueven, para que al restaurarlos no caigan en una ubicación inactiva.
   */
  async fusionar(origenId: string, destinoId: string, usuario: string) {
    if (origenId === destinoId) {
      throw new BadRequestException(
        'La ubicación de origen y la de destino son la misma',
      );
    }
    const origen = await this.findOne(origenId);
    const destino = this.comoNodo(await this.findOne(destinoId));

    if (formariaCiclo(origenId, destino)) {
      throw new BadRequestException(
        'No se puede fusionar una ubicación en otra que cuelga de ella',
      );
    }

    const altura = alturaSubarbol(
      origenId,
      await this.descendientesDe(origenId),
    );
    if (destino.nivel + altura > NIVEL_MAXIMO) {
      throw new BadRequestException(
        `No cabe: lo que cuelga de '${origen.ruta}' pasaría del nivel ${PROFUNDIDAD_MAXIMA}`,
      );
    }

    const hijas = await this.ubicacionModel.find({ padre: origen._id }).exec();
    for (const hija of hijas) {
      const choque = await this.hermano(destino._id, hija.nombreNormalizado);
      if (choque) {
        throw new ConflictException(
          `'${destino.ruta}' ya tiene una ubicación '${choque.nombre}'${choque.activo === false ? ' (dada de baja)' : ''}: hay que renombrar o fusionar esa primero`,
        );
      }
    }

    for (const hija of hijas) {
      await this.update(String(hija._id), { padre: destino._id });
    }
    const { modifiedCount } = await this.equipoModel
      .updateMany(
        { ubicacion_id: origen._id },
        { ubicacion_id: new Types.ObjectId(destino._id) },
      )
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .exec();
    await this.remove(origenId, usuario);

    return {
      destino: await this.findOne(destinoId),
      equiposMovidos: modifiedCount,
      ubicacionesMovidas: hijas.length,
    };
  }

  /** El padre pedido, que debe existir y estar activo. */
  private async padreActivo(id: string): Promise<UbicacionDocument> {
    const padre = await this.ubicacionModel.findById(id).exec();
    if (!padre) {
      throw new BadRequestException(
        'La ubicación padre no existe o está dada de baja',
      );
    }
    return padre;
  }

  /** El hermano con ese nombre normalizado, activo o no. */
  private hermano(
    padre: string | null,
    nombreNormalizado: string,
    excluirId?: string,
  ) {
    const filtro: FilterQuery<UbicacionDocument> = {
      padre: padre ? new Types.ObjectId(padre) : null,
      nombreNormalizado,
    };
    if (excluirId) filtro._id = { $ne: new Types.ObjectId(excluirId) };
    return this.ubicacionModel
      .findOne(filtro)
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .exec();
  }

  /**
   * El índice único `{padre, nombreNormalizado}` no distingue activas de
   * inactivas. Sin esta comprobación, crear una ubicación que existe dada de
   * baja devolvería un error de duplicado que no explica nada; así, el 409
   * dice qué pasa.
   *
   * Va sin el id de la dada de baja: el filtro global de errores solo
   * reenvía `mensaje`. La pantalla de administración ya la tiene en su lista
   * (`?incluirBajas=true`) y ofrece restaurarla antes de llegar aquí.
   */
  private async exigirHermanoLibre(
    padre: string | null,
    nombreNormalizado: string,
    excluirId?: string,
  ) {
    const existente = await this.hermano(padre, nombreNormalizado, excluirId);
    if (!existente) return;
    if (existente.activo === false) {
      throw new ConflictException(
        `La ubicación '${existente.ruta}' ya existe, dada de baja. Se puede restaurar en vez de crearla de nuevo.`,
      );
    }
    throw new ConflictException(`La ubicación '${existente.ruta}' ya existe`);
  }

  /** Todo lo que cuelga de `id`, incluidos los dados de baja, en plano. */
  private async descendientesDe(id: string): Promise<NodoPlano[]> {
    const docs = await this.ubicacionModel
      .find({ ancestros: new Types.ObjectId(id) })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .select('nombre padre')
      .lean<
        Array<{
          _id: Types.ObjectId;
          nombre: string;
          padre?: Types.ObjectId | null;
        }>
      >()
      .exec();
    return docs.map((d) => ({
      _id: String(d._id),
      nombre: d.nombre,
      padre: d.padre ? String(d.padre) : null,
    }));
  }

  /**
   * Un documento como nodo del árbol. Los valores por defecto cubren
   * documentos anteriores a la migración, que todavía no tienen los campos.
   */
  private comoNodo(doc: UbicacionDocument): NodoPadre {
    return {
      _id: String(doc._id),
      ancestros: (doc.ancestros ?? []).map(String),
      ruta: doc.ruta ?? doc.nombre,
      nivel: doc.nivel ?? 0,
    };
  }

  private aMongo(campos: {
    padre: string | null;
    ancestros: string[];
    ruta: string;
    nivel: number;
    nombreNormalizado?: string;
  }): CamposArbol {
    return {
      ...campos,
      padre: campos.padre ? new Types.ObjectId(campos.padre) : null,
      ancestros: campos.ancestros.map((a) => new Types.ObjectId(a)),
    };
  }
}
