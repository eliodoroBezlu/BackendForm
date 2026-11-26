import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import {
  normalizarValor,
  TipoCatalogoMonitoreo,
} from './domain/catalogos-iniciales';
import { erroresDeEstructura, normalizarEstructura } from './domain/espesores';
import { ValoresDeCatalogo } from './domain/valores-de-catalogo';
import { PlantillaMedicionDto } from './dto/plantilla-medicion.dto';
import { PlantillaMedicion } from './schemas/plantilla-medicion.schema';

/** Código de Mongo para un índice único violado. */
const CLAVE_DUPLICADA = 11000;

/**
 * Las grillas de medición por tag y técnica. Las arma Confiabilidad en la
 * configuración; un reporte nuevo de ese tag con esa técnica nace con la suya.
 */
@Injectable()
export class PlantillasMedicionService {
  constructor(
    @InjectModel(PlantillaMedicion.name)
    private readonly modelo: Model<PlantillaMedicion>,
    private readonly catalogos: MonitoreoCatalogosService,
    private readonly archivos: ArchivosMonitoreoService,
  ) {}

  listar(): Promise<PlantillaMedicion[]> {
    return this.modelo.find().sort({ tag: 1, tecnica: 1 }).exec();
  }

  /** La plantilla del tag con esa técnica, o `null` si se reporta sin grilla. */
  aplicable(tag: string, tecnica?: string): Promise<PlantillaMedicion | null> {
    if (!tecnica?.trim()) return Promise.resolve(null);
    return this.modelo
      .findOne({
        tag: tag.trim().toUpperCase(),
        tecnica_normalizada: normalizarValor(tecnica),
      })
      .exec();
  }

  /**
   * Sin técnica elegida todavía: la plantilla del tag si tiene una sola (el
   * reporte nace con esa técnica); con varias, hay que elegir.
   */
  async unicaDelTag(tag: string): Promise<PlantillaMedicion | null> {
    const suyas = await this.modelo
      .find({ tag: tag.trim().toUpperCase() })
      .limit(2)
      .exec();
    return suyas.length === 1 ? suyas[0] : null;
  }

  /** ¿El tag tiene alguna plantilla? Así se reporta aunque no sea una bomba. */
  async tieneAlguna(tag: string): Promise<boolean> {
    return !!(await this.modelo.exists({ tag: tag.trim().toUpperCase() }));
  }

  async crear(
    dto: PlantillaMedicionDto,
    usuario: string,
  ): Promise<PlantillaMedicion> {
    const datos = await this.validada(dto);
    try {
      return await this.modelo.create({ ...datos, actualizadoPor: usuario });
    } catch (error) {
      throw this.traducir(error, datos.tag, datos.tecnica);
    }
  }

  async actualizar(
    id: string,
    dto: PlantillaMedicionDto,
    usuario: string,
  ): Promise<PlantillaMedicion> {
    const datos = await this.validada(dto);
    try {
      const guardada = await this.modelo
        .findByIdAndUpdate(
          id,
          { $set: { ...datos, actualizadoPor: usuario } },
          { new: true, runValidators: true },
        )
        .exec();
      if (!guardada) throw new NotFoundException('Plantilla no encontrada');
      return guardada;
    } catch (error) {
      throw this.traducir(error, datos.tag, datos.tecnica);
    }
  }

  /** Los reportes ya creados conservan su copia: borrarla no los toca. */
  async eliminar(id: string): Promise<{ eliminada: true }> {
    const r = await this.modelo.deleteOne({ _id: id }).exec();
    if (r.deletedCount === 0) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    return { eliminada: true };
  }

  private async validada(dto: PlantillaMedicionDto) {
    const v = new ValoresDeCatalogo(
      await this.catalogos.listar(TipoCatalogoMonitoreo.TECNICA),
    );
    const tecnica = v.valor(TipoCatalogoMonitoreo.TECNICA, dto.tecnica) ?? '';
    const estructura = {
      titulo: dto.titulo,
      piezas: dto.piezas.map((p) => ({
        ...p,
        zonas: p.zonas.map((z) => ({ ...z, nombre: z.nombre ?? '' })),
      })),
    };
    const diagramas = (dto.diagramas ?? []).map((d) => ({
      archivo: d.archivo,
      descripcion: d.descripcion?.trim() ?? '',
      ...(d.ancho && { ancho: d.ancho }),
      ...(d.alto && { alto: d.alto }),
    }));
    const faltan = await this.archivos.faltantes(
      diagramas.map((d) => d.archivo),
    );
    const errores = [
      ...v.errores,
      ...erroresDeEstructura(estructura),
      ...faltan.map(
        (a) => `El diagrama ${a} no está entre los archivos subidos`,
      ),
    ];
    if (errores.length > 0) throw new BadRequestException({ message: errores });

    const limpia = normalizarEstructura(estructura);
    return {
      tag: dto.tag.trim().toUpperCase(),
      tecnica,
      tecnica_normalizada: normalizarValor(tecnica),
      titulo: limpia.titulo,
      piezas: limpia.piezas,
      diagramas,
    };
  }

  private traducir(error: unknown, tag: string, tecnica: string): unknown {
    if ((error as { code?: number })?.code === CLAVE_DUPLICADA) {
      return new ConflictException(
        `Ya hay una plantilla de medición para ${tag} con ${tecnica}`,
      );
    }
    return error;
  }
}
