import { Injectable } from '@nestjs/common';
import { CreateExtintorDto } from './dto/create-extintor.dto';
import { UpdateExtintorDto } from './dto/update-extintor.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Extintor } from './schema/extintor.schema';
import { Model } from 'mongoose';

@Injectable()
export class ExtintorService {
  constructor(
    @InjectModel(Extintor.name)
    private readonly extintorModel: Model<Extintor>,
  ) {}

  async create(createExtintorDto: CreateExtintorDto) {
    const extintor = new this.extintorModel(createExtintorDto);
    return await extintor.save();
  }

  

  async findAll() {
    return await this.extintorModel.find().exec();
  }

  async findByArea(area: string) {
    return await this.extintorModel.find({ Area: area }).exec();
  }

  update(id: number, updateExtintorDto: UpdateExtintorDto) {
    return `This action updates a #${id} extintor`;
  }

  remove(id: number) {
    return `This action removes a #${id} extintor`;
  }
}
