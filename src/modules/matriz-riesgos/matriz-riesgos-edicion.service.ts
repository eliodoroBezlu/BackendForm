import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ActividadRiesgo,
  EstadoMatriz,
  MatrizRiesgo,
  MatrizRiesgoDocument,
  RiesgoIdentificado,
} from './schemas/matriz-riesgo.schema';
import { CatalogoRiesgo, TipoCatalogo } from './schemas/catalogo-riesgo.schema';
import { Area } from '../area/schemas/area.schema';
import { CrearMatrizDto } from './dto/crear-matriz.dto';
import { RiesgoDto } from './dto/riesgo.dto';
import { ActividadDto } from './dto/actividad.dto';
import { normalizarNombre } from '../../common/utils/nombres-organizacion.util';
import { evaluarRiesgoCompleto } from './domain/evaluar-riesgo-completo';
import {
  CALIDADES_CONTROL,
  EficaciaControl,
  jerarquiaDeCategoria,
} from './domain/eficacia-control.util';
import {
  CategoriaRiesgo,
  CATEGORIAS,
  CONDICIONES,
  NivelRiesgo,
  requierePgr,
} from './domain/nivel-riesgo';
import { PrevisualizarRiesgoDto } from './dto/previsualizar-riesgo.dto';

/** Lo que devuelve la vista previa del nivel de riesgo. */
export interface PreviaRiesgo {
  probabilidad: number | null;
  resultado: number | null;
  nivelInicial: NivelRiesgo | null;
  nivelActual: NivelRiesgo | null;
  /** Eficacia de cada control, en el orden en que llegaron. */
  eficacias: (EficaciaControl | null)[];
  /** Con este nivel el riesgo obliga a programar actividades en el PGR. */
  requierePgr: boolean;
}

/** Área del maestro lista para ofrecer en el selector de alta. */
export interface AreaDisponible {
  codigo: string;
  nombre: string;
  superintendencia: string;
}

/** Todo lo que el formulario de un riesgo necesita para una categoría. */
export interface OpcionesDeCategoria {
  categoria: string;
  condiciones: readonly string[];
  calidades: readonly string[];
  /** De 6 (más efectiva) a 1: el orden es semántico, no alfabético. */
  jerarquias: string[];
  peligros: string[];
  riesgos: string[];
  controles: string[];
  familiasVerificador: string[];
  verificadores: string[];
  /**
   * `true` si esta categoría no tiene catálogo cargado. La UI debe dejar
   * escribir libremente en vez de mostrar listas vacías.
   */
  sinCatalogo: boolean;
}

/**
 * Alta y edición de matrices sin Excel.
 *
 * Existe aparte de `MatrizRiesgosService` —que se ocupa de importar, listar y
 * mover estados— porque son dos caminos de escritura distintos: allá el origen
 * es un archivo y acá el formulario. Comparten el motor de evaluación del
 * dominio, que es lo que de verdad no puede duplicarse.
 *
 * **Solo se edita en BORRADOR.** Una matriz aprobada es inmutable: si se
 * pudiera retocar, un PGR ya consolidado dejaría de corresponderse con los
 * riesgos que lo originaron.
 */
@Injectable()
export class MatrizRiesgosEdicionService {
  private readonly logger = new Logger(MatrizRiesgosEdicionService.name);

  constructor(
    @InjectModel(MatrizRiesgo.name)
    private readonly matrizModel: Model<MatrizRiesgoDocument>,
    @InjectModel(CatalogoRiesgo.name)
    private readonly catalogoModel: Model<CatalogoRiesgo>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<Area>,
  ) {}

  // ── Datos para los formularios ──────────────────────────────────────────

  /**
   * Áreas del maestro que pueden tener matriz.
   *
   * Se excluyen las que no tienen código: el código forma parte del
   * identificador legible (`MR-3310-2026-v1`) y de la clave única, así que un
   * área sin sincronizar con IAM no puede dar de alta una matriz todavía.
   */
  async areasDisponibles(): Promise<AreaDisponible[]> {
    const areas = await this.areaModel
      .find({ activo: true, codigo: { $exists: true, $ne: null } })
      .populate('superintendencia', 'nombre')
      .lean<
        {
          codigo?: string;
          nombre: string;
          superintendencia?: { nombre?: string } | null;
        }[]
      >()
      .exec();

    return areas
      .filter((a): a is typeof a & { codigo: string } => Boolean(a.codigo))
      .map((a) => ({
        codigo: a.codigo,
        nombre: a.nombre,
        superintendencia: a.superintendencia?.nombre ?? '',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  /** Opciones del formulario para una categoría de riesgo. */
  async opcionesDeCategoria(categoria: string): Promise<OpcionesDeCategoria> {
    if (!(CATEGORIAS as readonly string[]).includes(categoria)) {
      throw new BadRequestException(`Categoría desconocida: "${categoria}".`);
    }

    const entradas = await this.catalogoModel
      .find({ categoria, activo: true })
      .sort({ orden: 1, valor: 1 })
      .lean<{ tipo: TipoCatalogo; valor: string }[]>()
      .exec();

    const de = (tipo: TipoCatalogo): string[] =>
      entradas.filter((e) => e.tipo === tipo).map((e) => e.valor);

    const jerarquiaPorNivel = jerarquiaDeCategoria(
      categoria as CategoriaRiesgo,
    );
    const jerarquias = [6, 5, 4, 3, 2, 1].map(
      (n) => jerarquiaPorNivel[n as 1 | 2 | 3 | 4 | 5 | 6],
    );

    return {
      categoria,
      condiciones: CONDICIONES,
      calidades: CALIDADES_CONTROL,
      jerarquias,
      peligros: de(TipoCatalogo.PELIGRO),
      riesgos: de(TipoCatalogo.RIESGO),
      controles: de(TipoCatalogo.CONTROL),
      familiasVerificador: de(TipoCatalogo.FAMILIA_VERIFICADOR),
      verificadores: de(TipoCatalogo.VERIFICADOR),
      sinCatalogo: entradas.length === 0,
    };
  }

  /**
   * Evalúa un riesgo sin guardarlo, para que el formulario muestre el nivel
   * mientras se escribe.
   *
   * Usa exactamente el mismo motor que la escritura: es la razón de que exista
   * como endpoint en vez de replicar las tablas en el navegador.
   */
  previsualizar(dto: PrevisualizarRiesgoDto): PreviaRiesgo {
    const evaluado = evaluarRiesgoCompleto({
      exposicion: dto.exposicion,
      posibilidad: dto.posibilidad,
      severidad: dto.severidad,
      controles: (dto.controles ?? []).map((c) => ({
        calidadControl: c.calidadControl ?? '',
        jerarquiaControl: c.jerarquiaControl ?? '',
      })),
    });

    return {
      ...evaluado,
      requierePgr: evaluado.nivelActual
        ? requierePgr(evaluado.nivelActual)
        : false,
    };
  }

  // ── Alta de la matriz ───────────────────────────────────────────────────

  async crear(dto: CrearMatrizDto, usuario: string): Promise<MatrizRiesgo> {
    const area = await this.areaModel
      .findOne({ codigo: dto.areaCodigo, activo: true })
      .populate('superintendencia', 'nombre')
      .lean<{
        codigo?: string;
        nombre: string;
        superintendencia?: { nombre?: string } | null;
      }>()
      .exec();

    if (!area) {
      throw new NotFoundException(
        `No hay un área activa con código "${dto.areaCodigo}".`,
      );
    }
    const superintendencia = area.superintendencia?.nombre;
    if (!superintendencia) {
      throw new BadRequestException(
        `El área "${area.nombre}" no tiene superintendencia asignada. ` +
          `Sin ella la matriz no se podría consolidar en ningún PGR.`,
      );
    }

    // Una matriz por área y año. La versión N+1 sale de aprobar la anterior,
    // no de crear otra desde cero.
    const yaExiste = await this.matrizModel
      .exists({ areaCodigo: dto.areaCodigo, anio: dto.anio, activo: true })
      .exec();
    if (yaExiste) {
      throw new ConflictException(
        `Ya existe una matriz de "${area.nombre}" para ${dto.anio}. ` +
          `Abrila y editala, o generá una versión nueva.`,
      );
    }

    const matriz = new this.matrizModel({
      codigo: `MR-${dto.areaCodigo}-${dto.anio}-v1`,
      areaCodigo: dto.areaCodigo,
      areaNombre: area.nombre,
      superintendencia,
      gerencia: dto.gerencia,
      anio: dto.anio,
      version: 1,
      estado: EstadoMatriz.BORRADOR,
      elaboradoPor: dto.elaboradoPor ?? usuario,
      fechaElaboracion: new Date(),
      actividades: [],
      historial: [
        {
          usuario,
          fecha: new Date(),
          estadoAnterior: '—',
          estadoNuevo: EstadoMatriz.BORRADOR,
          observaciones: 'Matriz creada en blanco',
        },
      ],
    });

    const guardada = await matriz.save();
    this.logger.log(`${guardada.codigo} creada por ${usuario}`);
    return guardada;
  }

  // ── CRUD de actividades ─────────────────────────────────────────────────

  async agregarActividad(
    id: string,
    dto: ActividadDto,
    usuario: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarEditable(id);

    const yaExiste = matriz.actividades.some((a) => this.mismaTupla(a, dto));
    if (yaExiste) {
      throw new ConflictException(
        `La matriz ${matriz.codigo} ya tiene la actividad "${dto.actividadTarea}" ` +
          `con esa condición y categoría. Agregá los riesgos a la existente.`,
      );
    }

    const numero =
      matriz.actividades.reduce((max, a) => Math.max(max, a.numero), 0) + 1;
    matriz.actividades.push({ numero, ...dto, riesgos: [] });

    const guardada = await matriz.save();
    this.logger.log(
      `${guardada.codigo}: actividad N°${numero} "${dto.actividadTarea}" ` +
        `agregada por ${usuario}`,
    );
    return guardada;
  }

  /**
   * Edita el encabezado sin tocar los riesgos.
   *
   * Es lo que arregla de una sola vez las actividades que quedaron partidas
   * por un tipeo —"Trabajo en Taller" vs "Trabajos en Taller"— sin tener que
   * reescribir riesgo por riesgo.
   */
  async actualizarActividad(
    id: string,
    numeroActividad: number,
    dto: ActividadDto,
    usuario: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarEditable(id);
    const actividad = this.buscarActividad(matriz, numeroActividad);

    const colisiona = matriz.actividades.some(
      (a) => a.numero !== numeroActividad && this.mismaTupla(a, dto),
    );
    if (colisiona) {
      throw new ConflictException(
        `Ya hay otra actividad con esos mismos datos. Si querés unificarlas, ` +
          `movés los riesgos y borrás la que sobra.`,
      );
    }

    Object.assign(actividad, dto);

    const guardada = await matriz.save();
    this.logger.log(
      `${guardada.codigo}: actividad N°${numeroActividad} actualizada por ${usuario}`,
    );
    return guardada;
  }

  /** Borra la actividad **con todos sus riesgos** y renumera. */
  async eliminarActividad(
    id: string,
    numeroActividad: number,
    usuario: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarEditable(id);
    const actividad = this.buscarActividad(matriz, numeroActividad);
    const cuantos = actividad.riesgos.length;

    matriz.actividades = matriz.actividades.filter(
      (a) => a.numero !== numeroActividad,
    );
    matriz.actividades.forEach((a, i) => {
      a.numero = i + 1;
    });
    this.renumerarRiesgos(matriz);

    const guardada = await matriz.save();
    this.logger.log(
      `${guardada.codigo}: actividad N°${numeroActividad} eliminada por ` +
        `${usuario} (se llevó ${cuantos} riesgo(s))`,
    );
    return guardada;
  }

  // ── CRUD de riesgos ─────────────────────────────────────────────────────

  async agregarRiesgo(
    id: string,
    numeroActividad: number,
    dto: RiesgoDto,
    usuario: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarEditable(id);
    const actividad = this.buscarActividad(matriz, numeroActividad);

    // El correlativo es global a la matriz, como la columna A del Excel.
    const numero =
      matriz.actividades
        .flatMap((a) => a.riesgos)
        .reduce((max, r) => Math.max(max, r.numero), 0) + 1;
    actividad.riesgos.push(this.armarRiesgo(dto, numero));

    const guardada = await matriz.save();
    this.logger.log(
      `${guardada.codigo}: riesgo N°${numero} agregado por ${usuario}`,
    );
    return guardada;
  }

  async actualizarRiesgo(
    id: string,
    numeroActividad: number,
    numero: number,
    dto: RiesgoDto,
    usuario: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarEditable(id);
    const actividad = this.buscarActividad(matriz, numeroActividad);
    const indice = actividad.riesgos.findIndex((r) => r.numero === numero);
    if (indice === -1) {
      throw new NotFoundException(
        `La actividad N°${numeroActividad} de ${matriz.codigo} no tiene el ` +
          `riesgo N°${numero}.`,
      );
    }

    actividad.riesgos[indice] = this.armarRiesgo(dto, numero);

    const guardada = await matriz.save();
    this.logger.log(
      `${guardada.codigo}: riesgo N°${numero} actualizado por ${usuario}`,
    );
    return guardada;
  }

  /**
   * Elimina un riesgo y renumera los siguientes.
   *
   * Renumerar es seguro porque solo se edita en BORRADOR, y la consolidación
   * al PGR únicamente lee matrices APROBADAS: ningún `riesgoNumero` guardado
   * en un PGR puede apuntar a esta matriz todavía. A cambio, la numeración
   * sigue siendo correlativa como en el formulario impreso.
   */
  async eliminarRiesgo(
    id: string,
    numeroActividad: number,
    numero: number,
    usuario: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarEditable(id);
    const actividad = this.buscarActividad(matriz, numeroActividad);
    const indice = actividad.riesgos.findIndex((r) => r.numero === numero);
    if (indice === -1) {
      throw new NotFoundException(
        `La actividad N°${numeroActividad} de ${matriz.codigo} no tiene el ` +
          `riesgo N°${numero}.`,
      );
    }

    actividad.riesgos.splice(indice, 1);
    this.renumerarRiesgos(matriz);

    const guardada = await matriz.save();
    this.logger.log(
      `${guardada.codigo}: riesgo N°${numero} eliminado por ${usuario}`,
    );
    return guardada;
  }

  // ── Internos ────────────────────────────────────────────────────────────

  /** ¿Las dos actividades son la misma? Se comparan las cuatro columnas. */
  private mismaTupla(a: ActividadRiesgo, b: ActividadDto): boolean {
    const igual = (x: string, y: string) =>
      normalizarNombre(x) === normalizarNombre(y);
    return (
      igual(a.areaProcesoAlcance, b.areaProcesoAlcance) &&
      igual(a.actividadTarea, b.actividadTarea) &&
      a.condicion === b.condicion &&
      a.categoria === b.categoria
    );
  }

  private buscarActividad(
    matriz: MatrizRiesgoDocument,
    numeroActividad: number,
  ): ActividadRiesgo {
    const actividad = matriz.actividades.find(
      (a) => a.numero === numeroActividad,
    );
    if (!actividad) {
      throw new NotFoundException(
        `La matriz ${matriz.codigo} no tiene la actividad N°${numeroActividad}.`,
      );
    }
    return actividad;
  }

  /** Correlativo global, respetando el orden de las actividades. */
  private renumerarRiesgos(matriz: MatrizRiesgoDocument): void {
    let n = 1;
    for (const actividad of matriz.actividades) {
      for (const riesgo of actividad.riesgos) {
        riesgo.numero = n++;
      }
    }
  }

  private async cargarEditable(id: string): Promise<MatrizRiesgoDocument> {
    const matriz = await this.matrizModel.findById(id).exec();
    if (!matriz || !matriz.activo) {
      throw new NotFoundException(`No se encontró la matriz '${id}'.`);
    }
    if (matriz.estado !== EstadoMatriz.BORRADOR) {
      throw new ConflictException(
        `La matriz ${matriz.codigo} está en ${matriz.estado} y no se puede ` +
          `editar. Solo se modifica en BORRADOR.`,
      );
    }
    return matriz;
  }

  /** Arma el riesgo persistible calculando todos sus derivados. */
  private armarRiesgo(dto: RiesgoDto, numero: number): RiesgoIdentificado {
    const evaluado = evaluarRiesgoCompleto({
      exposicion: dto.exposicion,
      posibilidad: dto.posibilidad,
      severidad: dto.severidad,
      controles: dto.controles,
    });

    return {
      numero,
      familiaPeligro: dto.familiaPeligro,
      descripcionPeligro: dto.descripcionPeligro,
      familiaRiesgo: dto.familiaRiesgo,
      descripcionRiesgo: dto.descripcionRiesgo,
      exposicion: dto.exposicion,
      posibilidad: dto.posibilidad,
      severidad: dto.severidad,
      probabilidad: evaluado.probabilidad ?? undefined,
      resultado: evaluado.resultado ?? undefined,
      nivelInicial: evaluado.nivelInicial ?? undefined,
      nivelActual: evaluado.nivelActual ?? undefined,
      controles: dto.controles.map((c, i) => ({
        familiaControl: c.familiaControl,
        medida: c.medida,
        familiaVerificador: c.familiaVerificador,
        verificador: c.verificador,
        calidadControl: c.calidadControl,
        jerarquiaControl: c.jerarquiaControl,
        eficacia: evaluado.eficacias[i] ?? undefined,
      })),
      incidentesOcurridos: dto.incidentesOcurridos,
      trazabilidad: dto.trazabilidad,
    };
  }
}
