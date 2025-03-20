import { Injectable } from '@nestjs/common';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { FormularioInspeccionEmergencia } from './schemas/inspeccion-emergencia.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class InspeccionesEmergenciaService {

  constructor(
    @InjectModel(FormularioInspeccionEmergencia.name) 
    private inspeccionEmergenciaModel: Model<FormularioInspeccionEmergencia>,
  ) {}
  
  async create(createInspeccionesEmergenciaDto: CreateFormularioInspeccionDto) {
    const createInspeccionEmergencia = new this.inspeccionEmergenciaModel(createInspeccionesEmergenciaDto)
    return createInspeccionEmergencia.save()
  }

  async verificarTag(tag: string, periodo: string, año: number, ) {
    const formularioExistente = await this.inspeccionEmergenciaModel.findOne({ tag, periodo, año });

    if (formularioExistente) {
      return { existe: true, formulario: formularioExistente,  };
    } else {
      return { existe: false, };
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


  findAll() {
    return `This action returns all inspeccionesEmergencia`;
  }

  findOne(id: number) {
    return `This action returns a #${id} inspeccionesEmergencia`;
  }

  update(id: number, updateInspeccionesEmergenciaDto: UpdateInspeccionesEmergenciaDto) {
    return `This action updates a #${id} inspeccionesEmergencia`;
  }

  remove(id: number) {
    return `This action removes a #${id} inspeccionesEmergencia`;
  }
}
