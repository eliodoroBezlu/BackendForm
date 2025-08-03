import { Injectable, NotFoundException, ConflictException } from "@nestjs/common"
import type { Model } from "mongoose"
import { Template, TemplateDocument } from "./schemas/template.schema"
import type { CreateTemplateDto } from "./dto/create-template.dto"
import type { UpdateTemplateDto } from "./dto/update-template.dto"
import { InjectModel } from "@nestjs/mongoose"

@Injectable()
export class TemplatesService {

  constructor(
    @InjectModel(Template.name)
    private readonly templateModel: Model<TemplateDocument>
  ){}

  async create(createTemplateDto: CreateTemplateDto): Promise<Template> {
    try {
      const createdTemplate = new this.templateModel(createTemplateDto)
      return await createdTemplate.save()
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException("Ya existe un template con este código")
      }
      throw error
    }
  }

  async findAll(filters?: {
    type?: string
    isActive?: boolean
    search?: string
  }): Promise<Template[]> {
    const query: any = {}

    if (filters?.type) {
      query.type = filters.type
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: "i" } },
        { code: { $regex: filters.search, $options: "i" } },
      ]
    }

    return this.templateModel.find(query).sort({ createdAt: -1 }).exec()
  }

  async findOne(id: string): Promise<Template> {
    const template = await this.templateModel.findById(id).exec()
    if (!template) {
      throw new NotFoundException("Template no encontrado")
    }
    return template
  }

  async findByCode(code: string): Promise<Template> {
    const template = await this.templateModel.findOne({ code }).exec()
    if (!template) {
      throw new NotFoundException("Template no encontrado")
    }
    return template
  }

  async update(id: string, updateTemplateDto: UpdateTemplateDto): Promise<Template> {
    try {
      const updatedTemplate = await this.templateModel.findByIdAndUpdate(id, updateTemplateDto, { new: true }).exec()

      if (!updatedTemplate) {
        throw new NotFoundException("Template no encontrado")
      }

      return updatedTemplate
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException("Ya existe un template con este código")
      }
      throw error
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.templateModel.findByIdAndDelete(id).exec()
    if (!result) {
      throw new NotFoundException("Template no encontrado")
    }
  }

  async desactivate(id: string): Promise<Template> {
    const template = await this.templateModel.findByIdAndUpdate(id, { isActive: false }, { new: true }).exec()

    if (!template) {
      throw new NotFoundException("Template no encontrado")
    }

    return template
  }

  async getStats(): Promise<{
    total: number
    active: number
    inactive: number
    byType: { interna: number; externa: number }
  }> {
    const [total, active, byType] = await Promise.all([
      this.templateModel.countDocuments().exec(),
      this.templateModel.countDocuments({ isActive: true }).exec(),
      this.templateModel.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]).exec(),
    ])

    const typeStats = byType.reduce(
      (acc, item) => {
        acc[item._id] = item.count
        return acc
      },
      { interna: 0, externa: 0 },
    )

    return {
      total,
      active,
      inactive: total - active,
      byType: typeStats,
    }
  }
}
