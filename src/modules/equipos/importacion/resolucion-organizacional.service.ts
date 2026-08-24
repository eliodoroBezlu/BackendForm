import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AmbitoEquipo } from '../schemas/equipo.schema';
import { normalizarNombre } from '../../../common/utils/nombres-organizacion.util';
import {
  CENTINELA_GERENCIA,
  CENTINELA_SUPERINTENDENCIA,
  nombreAreaMaestro,
} from './alias-areas';

/** A dónde pertenece un equipo del inventario, ya resuelto contra el maestro. */
export interface DestinoEquipo {
  ambito: AmbitoEquipo;
  area_id?: Types.ObjectId;
  superintendencia_id?: Types.ObjectId;
  gerencia_id?: Types.ObjectId;
  /** Texto original del inventario cuando no coincide con el nombre del área. */
  subarea?: string;
}

/** La fila no se puede colocar en la organización; el importador la omite. */
export class DestinoNoResuelto extends Error {}

interface DocConNombre {
  _id: Types.ObjectId;
  nombre: string;
  nombreIam?: string;
  idIam?: string;
  codigo?: string;
  activo?: boolean;
}

interface DocTrabajador {
  nomina: string;
  puesto: string;
  superintendencia: string;
  activo?: boolean;
}

/**
 * Traduce la columna `Area` del inventario a una posición en
 * **Gerencia → Superintendencia → Área**.
 *
 * Vive aparte del lector de Excel porque no tiene nada que ver con Excel: son
 * las reglas de la organización, y el importador ya era lo bastante largo.
 *
 * Carga los maestros una sola vez por corrida (`precargar`) — son ~30
 * documentos contra 1.400 filas, y consultarlos por fila multiplicaba los
 * viajes a Mongo sin ganar nada.
 */
@Injectable()
export class ResolucionOrganizacionalService {
  private readonly logger = new Logger(ResolucionOrganizacionalService.name);

  private areas: DocConNombre[] = [];
  private superintendencias: DocConNombre[] = [];
  private gerencias: DocConNombre[] = [];
  private trabajadores: DocTrabajador[] = [];

  constructor(
    @InjectModel('Area') private readonly areaModel: Model<DocConNombre>,
    @InjectModel('Superintendencia')
    private readonly superModel: Model<DocConNombre>,
    @InjectModel('Gerencia')
    private readonly gerenciaModel: Model<DocConNombre>,
    @InjectModel('Trabajador')
    private readonly trabajadorModel: Model<DocTrabajador>,
  ) {}

  async precargar(): Promise<void> {
    const [areas, supers, gerencias, trabajadores] = await Promise.all([
      this.areaModel.find({}).lean<DocConNombre[]>().exec(),
      this.superModel.find({}).lean<DocConNombre[]>().exec(),
      this.gerenciaModel.find({}).lean<DocConNombre[]>().exec(),
      this.trabajadorModel.find({}).lean<DocTrabajador[]>().exec(),
    ]);
    this.areas = areas;
    this.superintendencias = supers;
    this.gerencias = gerencias;
    this.trabajadores = trabajadores;

    this.logger.log(
      `Maestros cargados: ${areas.length} áreas, ${supers.length} superintendencias, ` +
        `${gerencias.length} gerencias, ${trabajadores.length} trabajadores`,
    );
  }

  /**
   * @param textoArea  valor crudo de la columna `Area` de la hoja
   * @param responsable valor de la columna `Responsable`, si la hoja la trae
   */
  resolver(textoArea: string, responsable?: string): DestinoEquipo {
    const clave = normalizarNombre(textoArea);

    if (clave === CENTINELA_GERENCIA) {
      return this.resolverGerencia(responsable);
    }
    if (clave === CENTINELA_SUPERINTENDENCIA) {
      return this.resolverSuperintendencia(responsable);
    }
    return this.resolverArea(textoArea);
  }

  // ── Área ────────────────────────────────────────────────────────────────

  private resolverArea(textoArea: string): DestinoEquipo {
    const buscado = normalizarNombre(nombreAreaMaestro(textoArea));
    const candidatas = this.areas.filter(
      (a) => normalizarNombre(a.nombre) === buscado,
    );

    if (candidatas.length === 0) {
      throw new DestinoNoResuelto(
        `Área "${textoArea}" no existe en el maestro (se buscó "${nombreAreaMaestro(textoArea)}"). ` +
          `Créela desde el panel o agregue su equivalencia a ALIAS_AREA.`,
      );
    }

    const elegida =
      candidatas.length === 1 ? candidatas[0] : this.desempatarArea(candidatas);

    // El inventario nombra «RECURSOS HIDRICOS Y VIAS FERREAS» donde el maestro
    // dice «Recursos Hidricos». Perder ese matiz era perder de qué mitad del
    // área es el equipo, así que se guarda como subárea.
    const subarea =
      normalizarNombre(textoArea) === normalizarNombre(elegida.nombre)
        ? undefined
        : textoArea.trim();

    return {
      ambito: AmbitoEquipo.AREA,
      area_id: elegida._id,
      subarea,
    };
  }

  /**
   * Dos áreas con el mismo nombre (hoy «Generación», códigos 3316 y 3368).
   * Gana la que el IAM reconoce: es la que tiene gente y la que usan las
   * inspecciones. Si ninguna destaca, no se elige por sorteo.
   */
  private desempatarArea(candidatas: DocConNombre[]): DocConNombre {
    const conIam = candidatas.filter((a) => a.idIam ?? a.nombreIam);
    if (conIam.length === 1) {
      this.logger.warn(
        `Área "${candidatas[0].nombre}" está duplicada en el maestro ` +
          `(${candidatas.map((a) => a.codigo ?? 's/código').join(', ')}); ` +
          `se usa la reconocida por el IAM (${conIam[0].codigo ?? 's/código'}).`,
      );
      return conIam[0];
    }
    throw new DestinoNoResuelto(
      `Área "${candidatas[0].nombre}" está duplicada en el maestro ` +
        `(${candidatas.map((a) => a.codigo ?? 's/código').join(', ')}) y ninguna ` +
        `se distingue. Resuelva el duplicado antes de importar.`,
    );
  }

  // ── Superintendencia ────────────────────────────────────────────────────

  private resolverSuperintendencia(responsable?: string): DestinoEquipo {
    const trabajador = this.buscarTrabajador(responsable);
    if (!trabajador) {
      throw new DestinoNoResuelto(
        `Fila de ámbito superintendencia con responsable "${responsable ?? '(vacío)'}" ` +
          `que no está en el roster: no hay de dónde sacar a qué superintendencia va.`,
      );
    }

    const sup = this.porNombreOIam(
      this.superintendencias,
      trabajador.superintendencia,
    );
    if (!sup) {
      throw new DestinoNoResuelto(
        `"${trabajador.nomina}" figura en la superintendencia ` +
          `"${trabajador.superintendencia}", que no existe en el maestro.`,
      );
    }

    return {
      ambito: AmbitoEquipo.SUPERINTENDENCIA,
      superintendencia_id: sup._id,
    };
  }

  // ── Gerencia ────────────────────────────────────────────────────────────

  private resolverGerencia(responsable?: string): DestinoEquipo {
    const trabajador = this.buscarTrabajador(responsable);

    // El roster guarda la gerencia en el mismo campo que la superintendencia
    // («Gerencia» a secas para el gerente de planta), así que sirve como pista
    // pero rara vez como nombre exacto.
    const porNombre = trabajador
      ? this.porNombreOIam(this.gerencias, trabajador.superintendencia)
      : undefined;
    if (porNombre) {
      return { ambito: AmbitoEquipo.GERENCIA, gerencia_id: porNombre._id };
    }

    const activas = this.gerencias.filter((g) => g.activo !== false);
    if (activas.length === 1) {
      return { ambito: AmbitoEquipo.GERENCIA, gerencia_id: activas[0]._id };
    }

    throw new DestinoNoResuelto(
      `Fila de ámbito gerencia con responsable "${responsable ?? '(vacío)'}": ` +
        `hay ${activas.length} gerencias activas y ninguna se deduce del roster.`,
    );
  }

  // ── Auxiliares ──────────────────────────────────────────────────────────

  /**
   * El inventario escribe «MIGUEL RUBIN DE CELIS» y el roster «Rubin de Celis
   * Candia Miguel Martin»: distinto orden, distintos nombres de pila incluidos.
   * Se exige que **todas** las palabras del inventario estén en la nómina, y
   * que el resultado sea uno solo — dos coincidencias es no saber cuál es.
   */
  private buscarTrabajador(responsable?: string): DocTrabajador | undefined {
    if (!responsable?.trim()) return undefined;

    const palabras = normalizarNombre(responsable)
      .split(/[^A-Z0-9]+/)
      .filter((p) => p.length > 2);
    if (palabras.length === 0) return undefined;

    const hallados = this.trabajadores.filter((t) => {
      const nomina = normalizarNombre(t.nomina ?? '');
      return palabras.every((p) => nomina.includes(p));
    });

    if (hallados.length > 1) {
      this.logger.warn(
        `"${responsable}" coincide con ${hallados.length} trabajadores; se descarta por ambiguo.`,
      );
      return undefined;
    }
    return hallados[0];
  }

  /**
   * El roster mezcla el nombre local y el del IAM en el mismo campo — a un
   * superintendente le figura «Mec. Plta. Chancado…» y a otro «Mec. Planta
   * Chancado…». Se aceptan los dos.
   */
  private porNombreOIam(
    docs: DocConNombre[],
    nombre?: string,
  ): DocConNombre | undefined {
    if (!nombre?.trim()) return undefined;
    const buscado = normalizarNombre(nombre);
    return docs.find(
      (d) =>
        normalizarNombre(d.nombre) === buscado ||
        (d.nombreIam ? normalizarNombre(d.nombreIam) === buscado : false),
    );
  }
}
