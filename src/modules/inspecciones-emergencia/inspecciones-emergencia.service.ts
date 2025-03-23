import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { FormularioInspeccionEmergencia } from './schemas/inspeccion-emergencia.schema';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ExtintorService } from '../extintor/extintor.service';
import { Area } from '../area/schema/area.schema';

@Injectable()
export class InspeccionesEmergenciaService {

  constructor(
    @InjectModel(FormularioInspeccionEmergencia.name) 
    private inspeccionEmergenciaModel: Model<FormularioInspeccionEmergencia>,
    private  extintorService: ExtintorService,
    @InjectModel(Area.name)
    private areaModel: Model<Area>,
  ) {}
  
  async create(createInspeccionesEmergenciaDto: CreateFormularioInspeccionDto) {
    const createInspeccionEmergencia = new this.inspeccionEmergenciaModel(createInspeccionesEmergenciaDto)
    return createInspeccionEmergencia.save()
  }

 // En InspeccionesEmergenciaService (backend)
async verificarTag(tag: string, periodo: string, año: number, area: string) {
  // Buscar el formulario por tag
  const formularioExistente = await this.inspeccionEmergenciaModel.findOne({
    tag,
    periodo,
    año,
  });

  // Buscar extintores por área
  const extintores = await this.extintorService.findByArea(area);
  
  // Buscar información del área incluyendo la superintendencia
  const areaInfo = await this.areaModel.findOne({ nombre: area })
    .populate('superintendencia')
    .exec();
  
  // Obtener el nombre de la superintendencia si existe
  const superintendencia = areaInfo?.superintendencia?.nombre || "";

  if (formularioExistente) {
    return {
      existe: true,
      formulario: formularioExistente,
      extintores,
      superintendencia, // Añadir el nombre de la superintendencia
    };
  } else {
    return {
      existe: false,
      extintores,
      superintendencia, // Añadir el nombre de la superintendencia
    };
  }
} 

  // Añadir o actualizar datos de un mes específico usando el tag
  async actualizarMesPorTag(
    tag: string,
    mes: string,
    datosMes: any,
  ) {
    // Verificar que el mes sea válido
    const mesesValidos = [
      "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
      "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
    ];
  
    if (!mesesValidos.includes(mes)) {
      throw new Error(`Mes no válido: ${mes}`);
    }
  
    // Crear el objeto de actualización
    const updateQuery = {
      $set: {
        [`meses.${mes}`]: datosMes, // Actualiza solo el mes específico
        mesActual: mes, // Actualiza el campo mesActual al mes que se está modificando
      },
    };
  
    // Buscar y actualizar el documento
    const resultado = await this.inspeccionEmergenciaModel.updateOne(
      { tag: tag }, // Busca por tag (asegúrate de que el campo en la base de datos sea "tag")
      updateQuery,
    );
  
    if (resultado.matchedCount === 0) {
      throw new Error(`No se encontró un formulario con el tag: ${tag}`);
    }
  
    return { success: true, message: "Mes actualizado correctamente" };
  }


  async findAll() {
    return this.inspeccionEmergenciaModel
      .find()
      .sort({ createdAt: -1 }) // Ordenar por fecha de creación descendente
      .exec()
  }

  async findOne(id: string): Promise<FormularioInspeccionEmergencia> {
      if (!isValidObjectId(id)) {
        throw new BadRequestException(`ID inválido: ${id}`)
      }
      const inspeccion = await this.inspeccionEmergenciaModel.findById(id).exec()
      if (!inspeccion) {
        throw new NotFoundException(`Inspección con ID ${id} no encontrada`)
      }
      return inspeccion
    }

  update(id: number, updateInspeccionesEmergenciaDto: UpdateInspeccionesEmergenciaDto) {
    return `This action updates a #${id} inspeccionesEmergencia`;
  }

  remove(id: number) {
    return `This action removes a #${id} inspeccionesEmergencia`;
  }
}
