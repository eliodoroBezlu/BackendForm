import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { isValidObjectId, Model } from "mongoose"
import { Inspeccion } from "./schemas/inspeccion.schema"
import type { CreateInspeccionDto } from "./dto/create-inspeccion.dto"
import type { UpdateInspeccionDto } from "./dto/update-inspeccion.dto"

@Injectable()
export class InspeccionesService {
  constructor(
    @InjectModel(Inspeccion.name) private inspeccionModel: Model<Inspeccion>,
  ) {}

  async create(createInspeccionDto: CreateInspeccionDto): Promise<Inspeccion> {
    const createdInspeccion = new this.inspeccionModel(createInspeccionDto)
    return createdInspeccion.save()
  }

  async findAll() {
    return this.inspeccionModel
      .find()
      .sort({ createdAt: -1 }) // Ordenar por fecha de creación descendente
      .exec()
  }

  async findAllWithFilters(filters: {
    startDate?: Date
    endDate?: Date
    superintendencia?: string
    operativo?: "SI" | "NO"
    numInspeccion?: string
  }) {
    const query: any = {}

    if (filters.startDate && filters.endDate) {
      query.createdAt = {
        $gte: filters.startDate,
        $lte: filters.endDate,
      }
    }

    if (filters.superintendencia) {
      query["informacionGeneral.superintendencia"] = {
        $regex: filters.superintendencia,
        $options: "i",
      }
    }

    if (filters.operativo) {
      query.operativo = filters.operativo
    }

    if (filters.numInspeccion) {
      query["informacionGeneral.numInspeccion"] = {
        $regex: filters.numInspeccion,
        $options: "i",
      }
    }

    return this.inspeccionModel.find(query).sort({ createdAt: -1 }).exec()
  }

  


  async findOne(id: string): Promise<Inspeccion> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`ID inválido: ${id}`)
    }
    const inspeccion = await this.inspeccionModel.findById(id).exec()
    if (!inspeccion) {
      throw new NotFoundException(`Inspección con ID ${id} no encontrada`)
    }
    return inspeccion
  }

  async update(id: string, updateInspeccionDto: UpdateInspeccionDto): Promise<Inspeccion> {
    const updatedInspeccion = await this.inspeccionModel
      .findByIdAndUpdate(id, updateInspeccionDto, { new: true })
      .exec()
    if (!updatedInspeccion) {
      throw new NotFoundException(`Inspección con ID "${id}" no encontrada`)
    }
    return updatedInspeccion
  }

  async remove(id: string): Promise<Inspeccion> {
    const deletedInspeccion = await this.inspeccionModel.findByIdAndDelete(id).exec()
    if (!deletedInspeccion) {
      throw new NotFoundException(`Inspección con ID "${id}" no encontrada`)
    }
    return deletedInspeccion
  }

  
}

