import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Pgr,
  PgrDocument,
  PgrEstado,
  ActividadEstado,
} from './schemas/pgr.schema';
import { CreatePgrDto } from './dto/create-pgr.dto';
import { UpdatePgrDto } from './dto/update-pgr.dto';
import { AprobarPgrDto } from './dto/aprobar-pgr.dto';
import { SeguimientoPgrDto } from './dto/seguimiento-pgr.dto';
import { Area } from '../area/schema/area.schema';
import { Superintendencia } from '../superintendencia/schema/superintendencia.schema';

@Injectable()
export class PgrService {
  constructor(
    @InjectModel(Pgr.name) private pgrModel: Model<PgrDocument>,
    @InjectModel(Area.name) private areaModel: Model<Area>,
    @InjectModel(Superintendencia.name)
    private superintendenciaModel: Model<Superintendencia>,
  ) {}

  private async generateNextCode(gestion: string): Promise<string> {
    const lastPgr = await this.pgrModel
      .findOne({ codigoAutogenerado: new RegExp(`^PLAN-${gestion}-`) })
      .sort({ codigoAutogenerado: -1 })
      .exec();

    let nextNumber = 1;
    if (lastPgr) {
      const parts = lastPgr.codigoAutogenerado.split('-');
      if (parts.length === 3) {
        nextNumber = parseInt(parts[2], 10) + 1;
      }
    }

    return `PLAN-${gestion}-${nextNumber.toString().padStart(4, '0')}`;
  }

  async create(createPgrDto: CreatePgrDto): Promise<Pgr> {
    const codigoAutogenerado = await this.generateNextCode(
      createPgrDto.gestion || new Date().getFullYear().toString(),
    );

    const areasResueltas = await this.resolverAreas(
      createPgrDto.areas || [],
      createPgrDto.superintendencia,
    );

    const nuevoPgr = new this.pgrModel({
      ...createPgrDto,
      areas: areasResueltas,
      codigoAutogenerado,
      estado: createPgrDto.estado || PgrEstado.BORRADOR,
    });
    return nuevoPgr.save();
  }

  async findAll(): Promise<Pgr[]> {
    return this.pgrModel.find().exec();
  }

  async findOne(id: string): Promise<Pgr> {
    const pgr = await this.pgrModel.findById(id).exec();
    if (!pgr) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }
    return pgr;
  }

  async update(id: string, updatePgrDto: UpdatePgrDto): Promise<Pgr> {
    const payload: Partial<typeof updatePgrDto> = { ...updatePgrDto };

    if ('areas' in updatePgrDto || 'superintendencia' in updatePgrDto) {
      const existing = await this.findOne(id);
      const superintendencia =
        (updatePgrDto as UpdatePgrDto & { superintendencia?: string })
          .superintendencia ?? existing.superintendencia;
      const areasIn =
        (updatePgrDto as UpdatePgrDto & { areas?: string[] }).areas ??
        existing.areas ??
        [];
      payload['areas'] = await this.resolverAreas(areasIn, superintendencia);
    }

    const pgr = await this.pgrModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!pgr) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }
    return pgr;
  }

  /** Si el array de áreas viene vacío, busca todas las áreas activas de la superintendencia */
  private async resolverAreas(
    areas: string[],
    superintendenciaNombre: string,
  ): Promise<string[]> {
    if (areas && areas.length > 0) {
      return areas;
    }

    const nombreEscapado = superintendenciaNombre.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

    const sup = await this.superintendenciaModel
      .findOne({ nombre: { $regex: new RegExp(`^${nombreEscapado}$`, 'i') } })
      .exec();

    if (!sup) {
      console.warn(`⚠️ [PGR] Superintendencia no encontrada: "${superintendenciaNombre}". Se guardará con áreas vacías.`);
      return [];
    }

    const areasEncontradas = await this.areaModel
      .find({ superintendencia: sup._id, activo: true })
      .exec();

    return areasEncontradas.map((a) => a.nombre);
  }

  async aprobar(id: string, aprobarPgrDto: AprobarPgrDto): Promise<Pgr> {
    const pgr = await this.findOne(id);

    let isRechazado = false;

    // Actualizar estados de actividad individual
    pgr.actividades = pgr.actividades.map((actividad: any) => {
      const match = aprobarPgrDto.actividadesAprobacion.find(
        (a) => a._id === actividad._id.toString(),
      );
      if (match) {
        actividad.estadoAprobacion = match.estadoAprobacion;
        actividad.motivoRechazo = match.motivoRechazo;
        if (match.estadoAprobacion === ActividadEstado.RECHAZADO) {
          isRechazado = true;
        }
      }
      return actividad;
    });

    // Actualizar estado general
    if (isRechazado) {
      pgr.estado = PgrEstado.CORREGIR;
    } else {
      pgr.estado = PgrEstado.APROBADO;
    }

    pgr.aprobadoPor = aprobarPgrDto.aprobadoPor;
    pgr.fechaAprobacion = new Date();

    const updatedPgr = await this.pgrModel
      .findByIdAndUpdate(
        id,
        {
          actividades: pgr.actividades,
          estado: pgr.estado,
          aprobadoPor: pgr.aprobadoPor,
          fechaAprobacion: pgr.fechaAprobacion,
        },
        { new: true },
      )
      .exec();

    if (!updatedPgr) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }

    return updatedPgr;
  }

  async addSeguimiento(
    pgrId: string,
    actividadId: string,
    seguimientoDto: SeguimientoPgrDto,
  ): Promise<Pgr> {
    const pgr = await this.findOne(pgrId);

    // Find and update activity
    const activityIndex = pgr.actividades.findIndex(
      (a: any) => a._id.toString() === actividadId,
    );
    if (activityIndex === -1) {
      throw new NotFoundException(
        `Actividad con ID "${actividadId}" no encontrada`,
      );
    }

    pgr.actividades[activityIndex].fechaEjecucion =
      seguimientoDto.fechaEjecucion
        ? new Date(seguimientoDto.fechaEjecucion)
        : pgr.actividades[activityIndex].fechaEjecucion;

    if (seguimientoDto.observaciones !== undefined) {
      pgr.actividades[activityIndex].observaciones =
        seguimientoDto.observaciones;
    }
    if (seguimientoDto.semaforoTiempo !== undefined) {
      pgr.actividades[activityIndex].semaforoTiempo =
        seguimientoDto.semaforoTiempo;
    }
    if (seguimientoDto.evidencias) {
      // Append or replace? Let's treat it as replace/set for simplicity
      pgr.actividades[activityIndex].evidencias = seguimientoDto.evidencias;
    }

    const updatedPgr = await this.pgrModel
      .findByIdAndUpdate(pgrId, { actividades: pgr.actividades }, { new: true })
      .exec();

    if (!updatedPgr) {
      throw new NotFoundException(`PGR con ID "${pgrId}" no encontrado`);
    }

    return updatedPgr;
  }

  async remove(id: string): Promise<Pgr> {
    const deleted = await this.pgrModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`PGR con ID "${id}" no encontrado`);
    }
    return deleted;
  }
}
