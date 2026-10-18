import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Model } from 'mongoose';
import { INCLUIR_DADOS_DE_BAJA } from '../../common/baja-logica/baja-logica.plugin';
import { Trabajador } from '../trabajadores/schemas/trabajador.schema';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import { ReportesMonitoreoService } from './reportes-monitoreo.service';
import {
  normalizarValor,
  TipoCatalogoMonitoreo,
} from './domain/catalogos-iniciales';
import { EstadoReporte } from './domain/reporte';
import { ReporteMonitoreo } from './schemas/reporte-monitoreo.schema';
import { diaCorto, generarPdfReporte, ImagenParaPdf } from './pdf/reporte-pdf';

/** Logo de la empresa; sin él el PDF se genera igual. */
const RUTA_LOGO = join(process.cwd(), 'src', 'templates', 'msc-logo.png');

/**
 * Reúne lo que el PDF necesita —nombres, color del resultado, imágenes— y lo
 * genera. La forma del PDF vive en `pdf/reporte-pdf.ts`.
 */
@Injectable()
export class ReportePdfService {
  constructor(
    private readonly reportes: ReportesMonitoreoService,
    private readonly archivos: ArchivosMonitoreoService,
    private readonly catalogos: MonitoreoCatalogosService,
    @InjectModel(Trabajador.name)
    private readonly trabajadorModel: Model<Trabajador>,
  ) {}

  async generar(id: string): Promise<{ pdf: Buffer; nombre: string }> {
    const r = await this.reportes.obtener(id);
    const [nombres, colorResultado, fotos, grafico, logo] = await Promise.all([
      this.nombres([r.elaboradoPor, r.revisadoPor]),
      this.colorDe(r.resultado),
      Promise.all((r.fotos ?? []).map((f) => this.imagen(f))),
      r.grafico ? this.imagen(r.grafico) : Promise.resolve(undefined),
      fs.readFile(RUTA_LOGO).catch(() => undefined),
    ]);

    const pdf = await generarPdfReporte({
      reporte: {
        ...r.toObject<ReporteMonitoreo>(),
        recomendaciones: r.recomendaciones ?? [],
        tareas: r.tareas ?? [],
      },
      fotos,
      grafico,
      elaboradoPor: nombres.get(r.elaboradoPor) ?? r.elaboradoPor,
      revisadoPor: r.revisadoPor
        ? (nombres.get(r.revisadoPor) ?? r.revisadoPor)
        : undefined,
      colorResultado,
      logo,
    });
    return { pdf, nombre: nombreDeArchivo(r) };
  }

  /**
   * El nombre de cada persona según el padrón; si no está vinculada, su
   * usuario. Incluye a los dados de baja: un reporte viejo sigue firmado por
   * quien lo hizo aunque ya no esté.
   */
  private async nombres(
    usuarios: (string | undefined)[],
  ): Promise<Map<string, string>> {
    const lista = usuarios.filter((u): u is string => !!u);
    if (lista.length === 0) return new Map();
    const encontrados = await this.trabajadorModel
      .find({ username: { $in: lista } })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .select('username nomina')
      .lean<{ username?: string; nomina: string }[]>()
      .exec();
    return new Map(
      encontrados
        .filter((t) => t.username)
        .map((t) => [t.username as string, t.nomina]),
    );
  }

  private async colorDe(resultado?: string): Promise<string | undefined> {
    if (!resultado) return undefined;
    const severidades = await this.catalogos.listar(
      TipoCatalogoMonitoreo.SEVERIDAD,
      true,
    );
    return severidades.find(
      (s) => s.valor_normalizado === normalizarValor(resultado),
    )?.color;
  }

  /** Una imagen que ya no está en disco no impide el PDF: se marca en su lugar. */
  private async imagen(f: {
    archivo: string;
    descripcion?: string;
    referencia?: boolean;
    ancho?: number;
    alto?: number;
  }): Promise<ImagenParaPdf> {
    const contenido = await this.archivos
      .ruta(f.archivo)
      .then((ruta) => fs.readFile(ruta))
      .catch(() => undefined);
    return {
      contenido,
      descripcion: f.descripcion ?? '',
      referencia: !!f.referencia,
      ancho: f.ancho,
      alto: f.alto,
    };
  }
}

/**
 * Como nombra Confiabilidad sus archivos: `COTEM137 230PP013 06OCT26.pdf`.
 * Un reporte sin emitir no tiene código, y el nombre lo dice.
 */
export function nombreDeArchivo(r: {
  estado: EstadoReporte;
  codigo_interno?: string;
  correlativo?: number;
  tag: string;
  fecha: Date;
}): string {
  const dia = diaCorto(r.fecha).replace(/-/g, '').toUpperCase();
  const codigo =
    r.estado === EstadoReporte.EMITIDO && r.codigo_interno
      ? `${r.codigo_interno.split('-')[0]}${String(r.correlativo ?? '').padStart(3, '0')}`
      : 'BORRADOR';
  return `${codigo} ${r.tag} ${dia}.pdf`;
}
