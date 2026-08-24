import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MatrizRiesgosService } from '../matriz-riesgos/matriz-riesgos.service';
import {
  ActividadRiesgo,
  MatrizRiesgo,
  RiesgoIdentificado,
} from '../matriz-riesgos/schemas/matriz-riesgo.schema';
import {
  ESCALA_NIVELES,
  requierePgr,
} from '../matriz-riesgos/domain/nivel-riesgo';
import {
  Actividad,
  Pgr,
  PgrDocument,
  PgrEstado,
  RiesgoCubierto,
} from './schemas/pgr.schema';
import { normalizarNombre } from '../../common/utils/nombres-organizacion.util';

/** Una actividad propuesta a partir de los controles de la matriz. */
export interface ActividadPropuesta {
  clave: string;
  verificador: string;
  /** Texto propuesto, tomado de la medida de control. Es editable. */
  descripcion: string;
  riesgosCubiertos: RiesgoCubierto[];
  nivelRiesgoMaximo: string;
  areas: string[];
  /** Qué pasaría al consolidar. */
  efecto: 'nueva' | 'acumula' | 'sube-nivel' | 'sin-cambios';
}

export interface VistaPreviaConsolidacion {
  superintendencia: string;
  gestion: string;
  pgrId?: string;
  pgrCodigo?: string;
  /** Áreas con matriz aprobada que se van a consolidar. */
  areasConMatriz: { areaCodigo: string; areaNombre: string; matriz: string }[];
  /** Áreas ya consolidadas en una pasada anterior. */
  areasYaConsolidadas: string[];
  propuestas: ActividadPropuesta[];
  advertencias: string[];
}

export interface ResultadoConsolidacion {
  pgrId: string;
  actividadesNuevas: number;
  actividadesActualizadas: number;
  areasConsolidadas: string[];
  advertencias: string[];
}

/**
 * Consolida las matrices de riesgo aprobadas de una superintendencia en su PGR.
 *
 * ── Por qué vive en el módulo `pgr` ────────────────────────────────────────
 *
 * El PGR es el dueño de su agregado: solo este módulo lo escribe. La
 * dependencia va `pgr → matriz-riesgos` (lectura), nunca al revés.
 *
 * ── El eslabón que conecta los dos mundos ─────────────────────────────────
 *
 *   Riesgo crítico → Control → Verificador → Actividad del PGR
 *
 * La matriz es **por área**; el PGR es **por superintendencia**. Por eso esto
 * agrupa varias matrices en un solo programa, y dos controles de áreas
 * distintas con el mismo verificador y la misma medida producen **una** sola
 * actividad que acumula los riesgos de ambas.
 */
@Injectable()
export class PgrConsolidacionService {
  private readonly logger = new Logger(PgrConsolidacionService.name);

  constructor(
    @InjectModel(Pgr.name) private readonly pgrModel: Model<PgrDocument>,
    private readonly matrices: MatrizRiesgosService,
  ) {}

  private normalizar(s: string): string {
    return normalizarNombre(s);
  }

  private masGrave(a: string, b: string): string {
    return ESCALA_NIVELES.indexOf(a as never) >=
      ESCALA_NIVELES.indexOf(b as never)
      ? a
      : b;
  }

  /**
   * Clave de consolidación.
   *
   * Sin `desdoblarPorArea`, dos áreas que declaran el mismo verificador y la
   * misma medida caen en la misma actividad. Con la opción activada, cada área
   * mantiene la suya —el PGR real usa ambas formas: hay verificadores unificados
   * y otros desdoblados con prefijo `AREA <NOMBRE>`.
   */
  private clave(
    verificador: string,
    medida: string,
    areaCodigo: string,
    desdoblarPorArea: boolean,
  ): string {
    const base = `${this.normalizar(verificador)}||${this.normalizar(medida)}`;
    return desdoblarPorArea ? `${areaCodigo}||${base}` : base;
  }

  /** Recorre los riesgos críticos y arma una propuesta por cada control. */
  private proponerDesde(
    matrices: MatrizRiesgo[],
    desdoblarPorArea: boolean,
  ): { propuestas: Map<string, ActividadPropuesta>; advertencias: string[] } {
    const propuestas = new Map<string, ActividadPropuesta>();
    const advertencias: string[] = [];

    for (const matriz of matrices) {
      // Los riesgos cuelgan de una actividad; se aplana conservando de qué
      // actividad viene cada uno, que es lo que da la trazabilidad completa
      // «actividad → riesgo → control → actividad del PGR».
      const criticos = matriz.actividades.flatMap((actividad) =>
        actividad.riesgos
          .filter((r) => requierePgr(r.nivelActual as never))
          .map((riesgo) => ({ actividad, riesgo })),
      );
      if (criticos.length === 0) {
        advertencias.push(
          `La matriz ${matriz.codigo} (${matriz.areaNombre}) no tiene riesgos ` +
            `SUSTANCIAL ni INACEPTABLE: no aporta actividades.`,
        );
      }

      for (const { actividad, riesgo } of criticos) {
        for (const control of riesgo.controles) {
          if (!control.verificador) continue;

          const clave = this.clave(
            control.verificador,
            control.medida,
            matriz.areaCodigo,
            desdoblarPorArea,
          );

          const cubierto = this.aRiesgoCubierto(matriz, actividad, riesgo);
          const existente = propuestas.get(clave);

          if (existente) {
            existente.riesgosCubiertos.push(cubierto);
            existente.nivelRiesgoMaximo = this.masGrave(
              existente.nivelRiesgoMaximo,
              cubierto.nivelActual,
            );
            if (!existente.areas.includes(matriz.areaNombre)) {
              existente.areas.push(matriz.areaNombre);
            }
            continue;
          }

          propuestas.set(clave, {
            clave,
            verificador: desdoblarPorArea
              ? `AREA ${matriz.areaNombre.toUpperCase()} ${control.verificador}`
              : control.verificador,
            // El texto sale de la medida de control, pero es una propuesta: en
            // el PGR real está reformulado ("Capacitar sobre el instructivo X"
            // → "Difundir el Instructivo X"). La UI debe dejarlo editar.
            descripcion: control.medida,
            riesgosCubiertos: [cubierto],
            nivelRiesgoMaximo: cubierto.nivelActual,
            areas: [matriz.areaNombre],
            efecto: 'nueva',
          });
        }
      }
    }

    return { propuestas, advertencias };
  }

  private aRiesgoCubierto(
    matriz: MatrizRiesgo,
    actividad: ActividadRiesgo,
    riesgo: RiesgoIdentificado,
  ): RiesgoCubierto {
    return {
      matrizId: String((matriz as unknown as { _id: unknown })._id),
      matrizCodigo: matriz.codigo,
      matrizVersion: matriz.version,
      areaCodigo: matriz.areaCodigo,
      areaNombre: matriz.areaNombre,
      // `riesgoNumero` es la referencia estable a la matriz: no se recalcula
      // ni se reasigna nunca desde acá.
      riesgoNumero: riesgo.numero,
      actividadTarea: actividad.actividadTarea,
      descripcionRiesgo: riesgo.descripcionRiesgo,
      categoria: actividad.categoria,
      nivelActual: riesgo.nivelActual ?? 'SUSTANCIAL',
    };
  }

  /**
   * El PGR destino, cargado por id.
   *
   * Se identifica por id y no por (superintendencia, gestión) porque esa pareja
   * **no es única**: la base tiene varios PGR de la misma superintendencia y el
   * mismo año, y elegir uno con `findOne` significaría escribir programación en
   * un documento al azar. El id lo pone quien abre el PGR en pantalla.
   */
  private async cargarPgr(pgrId: string): Promise<PgrDocument> {
    const pgr = await this.pgrModel.findById(pgrId).exec();
    if (!pgr || pgr.activo === false) {
      throw new NotFoundException(`No existe el PGR ${pgrId}.`);
    }
    return pgr;
  }

  /**
   * Áreas que ya aportaron actividades, deducidas de las propias actividades.
   *
   * **No** se lee `pgr.areas`: ese campo lo llena la creación del PGR con todas
   * las áreas que el maestro le asigna a la superintendencia, tenga o no matriz.
   * Usarlo aquí haría que la previsualización diera por consolidadas áreas que
   * nunca aportaron nada.
   */
  private areasConsolidadas(pgr: PgrDocument): string[] {
    const nombres = new Set<string>();
    for (const act of pgr.actividades ?? []) {
      for (const r of act.origenMatriz?.riesgosCubiertos ?? []) {
        nombres.add(r.areaNombre);
      }
    }
    return [...nombres].sort();
  }

  /**
   * Previsualiza sin escribir: qué actividades saldrían y qué efecto tendría
   * consolidar. Es lo que alimenta la pantalla de confirmación.
   */
  async previsualizar(
    pgrId: string,
    desdoblarPorArea = false,
  ): Promise<VistaPreviaConsolidacion> {
    const pgr = await this.cargarPgr(pgrId);
    const { superintendencia, gestion } = pgr;

    const anio = Number(gestion);
    if (!Number.isInteger(anio)) {
      throw new BadRequestException(
        `El PGR ${pgr.codigoAutogenerado} tiene la gestión '${gestion}', ` +
          `que no es un año válido: no se puede saber qué matrices le tocan.`,
      );
    }

    const matrices = await this.matrices.aprobadasDeSuperintendencia(
      superintendencia,
      anio,
    );
    const { propuestas, advertencias } = this.proponerDesde(
      matrices,
      desdoblarPorArea,
    );

    const yaConsolidadas = this.areasConsolidadas(pgr);

    if (matrices.length === 0) {
      advertencias.push(
        `No hay matrices aprobadas de "${superintendencia}" para ${gestion}. ` +
          `Solo se consolidan matrices aprobadas.`,
      );
    }

    // Efecto de cada propuesta sobre el PGR actual.
    const porClave = new Map<string, Actividad>();
    for (const act of pgr.actividades ?? []) {
      if (act.origenMatriz?.clave) porClave.set(act.origenMatriz.clave, act);
    }

    const lista = [...propuestas.values()].map((p) => {
      const actual = porClave.get(p.clave);
      if (!actual) return p;

      const nivelPrevio = actual.origenMatriz?.nivelRiesgoMaximo ?? '';
      const sube =
        this.masGrave(nivelPrevio, p.nivelRiesgoMaximo) !== nivelPrevio;
      const nuevosRiesgos =
        p.riesgosCubiertos.length >
        (actual.origenMatriz?.riesgosCubiertos.length ?? 0);

      return {
        ...p,
        efecto: sube
          ? ('sube-nivel' as const)
          : nuevosRiesgos
            ? ('acumula' as const)
            : ('sin-cambios' as const),
      };
    });

    // Primero lo más grave, que es lo que hay que mirar.
    lista.sort(
      (a, b) =>
        ESCALA_NIVELES.indexOf(b.nivelRiesgoMaximo as never) -
        ESCALA_NIVELES.indexOf(a.nivelRiesgoMaximo as never),
    );

    return {
      superintendencia,
      gestion,
      pgrId: String(pgr._id),
      pgrCodigo: pgr.codigoAutogenerado,
      areasConMatriz: matrices.map((m) => ({
        areaCodigo: m.areaCodigo,
        areaNombre: m.areaNombre,
        matriz: m.codigo,
      })),
      areasYaConsolidadas: yaConsolidadas,
      propuestas: lista,
      advertencias,
    };
  }

  /**
   * Consolida de verdad.
   *
   * Es **incremental e idempotente**: se puede lanzar con las áreas que ya
   * aprobaron y repetirlo cuando aprueben las demás. Un verificador ya
   * presente no se duplica; se le acumulan los riesgos y se recalcula el nivel
   * máximo sobre el total.
   */
  async consolidar(
    pgrId: string,
    usuario: string,
    desdoblarPorArea = false,
  ): Promise<ResultadoConsolidacion> {
    const vista = await this.previsualizar(pgrId, desdoblarPorArea);

    const pgr = await this.cargarPgr(pgrId);
    if (pgr.estado === PgrEstado.APROBADO) {
      // Meter programación nueva en un PGR ya aprobado sería cambiarlo por la
      // puerta de atrás. Hay que reabrirlo explícitamente.
      throw new BadRequestException(
        `El PGR ${pgr.codigoAutogenerado} está aprobado. ` +
          `Reabrilo antes de consolidar áreas nuevas.`,
      );
    }
    if (vista.propuestas.length === 0) {
      throw new BadRequestException(
        'No hay actividades para consolidar. ' + vista.advertencias.join(' '),
      );
    }

    const ahora = new Date();
    let nuevas = 0;
    let actualizadas = 0;

    for (const propuesta of vista.propuestas) {
      const indice = pgr.actividades.findIndex(
        (a) => a.origenMatriz?.clave === propuesta.clave,
      );

      if (indice === -1) {
        pgr.actividades.push({
          descripcion: propuesta.descripcion,
          verificador: propuesta.verificador,
          // Las áreas que aportaron el riesgo. Ya se calculaban para la vista
          // previa y se descartaban al persistir; ahora quedan como el alcance
          // de la actividad. Se guarda tal cual —aunque sean todas— porque es
          // un hecho de la consolidación: estas áreas la pidieron.
          areas: propuesta.areas,
          // responsables / recursos / entregables los completa el planificador:
          // no salen de la matriz.
          responsables: [],
          recursos: [],
          entregables: [],
          programacion: [],
          estadoAprobacion: undefined as never,
          origenMatriz: {
            clave: propuesta.clave,
            riesgosCubiertos: propuesta.riesgosCubiertos,
            nivelRiesgoMaximo: propuesta.nivelRiesgoMaximo,
            generadoEn: ahora,
          },
        } as unknown as Actividad);
        nuevas++;
        continue;
      }

      // Ya existía: se acumulan los riesgos sin tocar lo que el planificador
      // haya escrito (responsables, programación, descripción reformulada).
      const actual = pgr.actividades[indice];
      // Las áreas sí se amplían: si una matriz nueva pide esta misma
      // actividad, su área pasa a estar dentro del alcance. Nunca se quitan
      // las que ya estaban — el planificador pudo haberlas agregado a mano.
      for (const area of propuesta.areas) {
        if (!actual.areas?.includes(area)) {
          actual.areas = [...(actual.areas ?? []), area];
        }
      }
      actual.origenMatriz = {
        clave: propuesta.clave,
        riesgosCubiertos: propuesta.riesgosCubiertos,
        nivelRiesgoMaximo: propuesta.nivelRiesgoMaximo,
        generadoEn: actual.origenMatriz?.generadoEn ?? ahora,
        actualizadoEn: ahora,
      };
      actualizadas++;
    }

    // Registrar qué áreas quedaron consolidadas.
    const areas = new Set(pgr.areas ?? []);
    for (const a of vista.areasConMatriz) areas.add(a.areaNombre);
    pgr.areas = [...areas];

    await pgr.save();

    // Se informan las áreas que realmente aportaron actividades, no `pgr.areas`
    // —ahí están además todas las que el maestro le asigna a la
    // superintendencia, tengan matriz o no.
    const consolidadas = this.areasConsolidadas(pgr);

    this.logger.log(
      `PGR ${pgr.codigoAutogenerado} consolidado por ${usuario}: ` +
        `${nuevas} nuevas, ${actualizadas} actualizadas, ` +
        `${vista.areasConMatriz.length} área(s)`,
    );

    return {
      pgrId: String(pgr._id),
      actividadesNuevas: nuevas,
      actividadesActualizadas: actualizadas,
      areasConsolidadas: consolidadas,
      advertencias: vista.advertencias,
    };
  }
}
