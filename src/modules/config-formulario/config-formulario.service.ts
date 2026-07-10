import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateConfigFormularioDto } from './dto/create-config-formulario.dto';
import { ConfigFormulario, ConfigFormularioDocument } from './schemas/config-formulario.schema';

@Injectable()
export class ConfigFormularioService implements OnModuleInit {
  constructor(
    @InjectModel(ConfigFormulario.name)
    private readonly configModel: Model<ConfigFormularioDocument>,
  ) {}

  // Auto-seed basic config schemas for Escalera, Amoladora, Esmeril on start
  async onModuleInit() {
    try {
      const count = await this.configModel.countDocuments().exec();
      if (count === 0) {
        console.log('Seeding initial dynamic form configurations...');
        
        await this.createOrUpdateDirect({
          tipo_equipo: 'Escalera',
          campos: [
            { name: 'tipo_escalera', label: 'Tipo de Escalera', type: 'select', required: true, options: ['Tijera', 'Extensión', 'Recta', 'Plataforma'] },
            { name: 'longitud', label: 'Longitud (pies/metros)', type: 'text', required: true },
            { name: 'carga_maxima', label: 'Carga Máxima (kg/lbs)', type: 'text', required: true }
          ]
        });

        await this.createOrUpdateDirect({
          tipo_equipo: 'Amoladora',
          campos: [
            { name: 'amperaje', label: 'Amperaje (A)', type: 'text', required: true },
            { name: 'diametro_disco', label: 'Diámetro de Disco (pulgadas)', type: 'text', required: true },
            { name: 'potencia', label: 'Potencia (W/HP)', type: 'text', required: true },
            { name: 'voltaje', label: 'Voltaje (V)', type: 'text', required: true },
            { name: 'rpms', label: 'RPMs', type: 'text', required: true }
          ]
        });

        await this.createOrUpdateDirect({
          tipo_equipo: 'Esmeril de banco',
          campos: [
            { name: 'voltaje', label: 'Voltaje (V)', type: 'text', required: true },
            { name: 'amperaje', label: 'Amperaje (A)', type: 'text', required: true },
            { name: 'rpms', label: 'RPMs', type: 'text', required: true },
            { name: 'diametro_discos', label: 'Diámetro de Discos', type: 'text', required: true }
          ]
        });

        console.log('Dynamic form configurations seeded successfully.');
      }
    } catch (e) {
      console.error('Error seeding configurations:', e);
    }
  }

  private async createOrUpdateDirect(dto: CreateConfigFormularioDto) {
    await this.configModel.findOneAndUpdate(
      { tipo_equipo: dto.tipo_equipo },
      dto,
      { upsert: true, new: true }
    ).exec();
  }

  async create(createDto: CreateConfigFormularioDto): Promise<ConfigFormulario> {
    const exists = await this.configModel.findOne({ tipo_equipo: createDto.tipo_equipo }).exec();
    if (exists) {
      throw new ConflictException(`La configuración para '${createDto.tipo_equipo}' ya existe`);
    }

    const created = new this.configModel(createDto);
    return await created.save();
  }

  async findAll(): Promise<ConfigFormulario[]> {
    return this.configModel.find().sort({ tipo_equipo: 1 }).exec();
  }

  async findOne(tipoEquipo: string): Promise<ConfigFormulario> {
    const config = await this.configModel.findOne({ tipo_equipo: tipoEquipo }).exec();
    if (!config) {
      throw new NotFoundException(`Configuración para el tipo de equipo '${tipoEquipo}' no encontrada`);
    }
    return config;
  }

  async update(tipoEquipo: string, updateDto: CreateConfigFormularioDto): Promise<ConfigFormulario> {
    const config = await this.configModel.findOneAndUpdate(
      { tipo_equipo: tipoEquipo },
      updateDto,
      { new: true }
    ).exec();

    if (!config) {
      throw new NotFoundException(`Configuración para el tipo de equipo '${tipoEquipo}' no encontrada`);
    }
    return config;
  }

  async remove(tipoEquipo: string): Promise<void> {
    const result = await this.configModel.findOneAndDelete({ tipo_equipo: tipoEquipo }).exec();
    if (!result) {
      throw new NotFoundException(`Configuración para el tipo de equipo '${tipoEquipo}' no encontrada`);
    }
  }
}
