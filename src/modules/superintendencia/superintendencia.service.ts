import { Injectable } from '@nestjs/common';
import { CreateSuperintendenciaDto } from './dto/create-superintendencia.dto';
import { UpdateSuperintendenciaDto } from './dto/update-superintendencia.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Superintendencia } from './schema/superintendencia.schema';
import { Model } from 'mongoose';

@Injectable()
export class SuperintendenciaService {

  constructor(
    @InjectModel(Superintendencia.name)
    private readonly superintendenciaModel: Model<Superintendencia>,
  ) {}
  async create(createSuperintendenciaDto: CreateSuperintendenciaDto) {
    const superintendencia = new this.superintendenciaModel(createSuperintendenciaDto);
    return await superintendencia.save();
  }

  async findAll() {
    return await this.superintendenciaModel.find().exec();
  }

  findOne(id: number) {
    return `This action returns a #${id} superintendencia`;
  }

  update(id: number, updateSuperintendenciaDto: UpdateSuperintendenciaDto) {
    return `This action updates a #${id} superintendencia`;
  }

  remove(id: number) {
    return `This action removes a #${id} superintendencia`;
  }
}
