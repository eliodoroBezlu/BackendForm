import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateFormularioInspeccionDto } from './dto/create-inspecciones-emergencia.dto';
import { UpdateInspeccionesEmergenciaDto } from './dto/update-inspecciones-emergencia.dto';
import { FormularioInspeccionEmergencia } from './schemas/inspeccion-emergencia.schema';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ExtintorService } from '../extintor/extintor.service';
import { Area } from '../area/schema/area.schema';

interface FiltrosInspeccion {
  area?: string;
  superintendencia?: string;
  mesActual?: string;
  documentCode?: string;
}
@Injectable()
export class InspeccionesEmergenciaService {

  constructor(
    @InjectModel(FormularioInspeccionEmergencia.name) 
    private inspeccionEmergenciaModel: Model<FormularioInspeccionEmergencia>,
    private  extintorService: ExtintorService,
    @InjectModel(Area.name)
    private areaModel: Model<Area>,
  ) {}

  async autoCompletarFormulariosVencidos(): Promise<void> {
    const fechaActual = new Date();
    const añoActual = fechaActual.getFullYear();
    const mesIndex = fechaActual.getMonth(); // 0 = Enero, 1 = Febrero, ..., 5 = Junio, 6 = Julio, ..., 11 = Diciembre

    // 1. Completar todos los de años anteriores
    await this.inspeccionEmergenciaModel.updateMany(
      { año: { $lt: añoActual }, estado: 'activo' },
      { $set: { estado: 'completado' } }
    ).exec();

    // 2. Si estamos en el segundo semestre (Julio-Diciembre), completar los del primer semestre (ENERO-JUNIO) del año actual
    if (mesIndex >= 6) {
      await this.inspeccionEmergenciaModel.updateMany(
        { año: añoActual, periodo: 'ENERO-JUNIO', estado: 'activo' },
        { $set: { estado: 'completado' } }
      ).exec();
    }
  }

  private async validarEstadoActivo(tag: string): Promise<void> {
    const formulario = await this.inspeccionEmergenciaModel.findOne({ tag, estado: 'activo'  });
    
    if (!formulario) {
      throw new NotFoundException(`No se encontró formulario activo con TAG: ${tag}`);
    }
    
    if (formulario.estado !== 'activo') {
      throw new ForbiddenException(
        `No se puede modificar el formulario con TAG: ${tag}. Estado actual: ${formulario.estado}. Solo se pueden modificar formularios en estado 'activo'.`
      );
    }
  }
  
async create(createInspeccionesEmergenciaDto: CreateFormularioInspeccionDto) {
  if (!createInspeccionesEmergenciaDto.tag) {
    throw new BadRequestException('El tag es requerido para crear un formulario');
  }

  // Autocompletar vencidos
  await this.autoCompletarFormulariosVencidos();

  // Buscar si ya existe para tag, periodo y año (evita duplicidad)
  const formularioExistente = await this.inspeccionEmergenciaModel.findOne({
    tag: createInspeccionesEmergenciaDto.tag,
    periodo: createInspeccionesEmergenciaDto.periodo,
    año: createInspeccionesEmergenciaDto.año
  });

  if (formularioExistente) {
    return formularioExistente;
  }

  // Crear la inspección
  const createInspeccionEmergencia = new this.inspeccionEmergenciaModel(createInspeccionesEmergenciaDto);
  const savedInspection = await createInspeccionEmergencia.save();
  
  // Actualizar los extintores que fueron inspeccionados
  const mesActual = createInspeccionesEmergenciaDto.mesActual;
  const extintoresInspeccionados = createInspeccionesEmergenciaDto.meses[mesActual]?.inspeccionesExtintor || [];
  
  if (extintoresInspeccionados.length > 0) {
    const codigosExtintores = extintoresInspeccionados.map(extintor => extintor.codigo);
    
    await this.extintorService.verificarYCrearExtintores(
      extintoresInspeccionados.map(extintor => ({
        codigo: extintor.codigo,
        ubicacion: extintor.ubicacion || 'No especificada'
      })),
      createInspeccionesEmergenciaDto.tag,
      createInspeccionesEmergenciaDto.area,
    );
    
    await this.extintorService.marcarExtintoresComoInspeccionados(codigosExtintores);
  }
  
  return savedInspection;
}


async verificarTag(tag: string, periodo: string, año: number, area: string) {
  // Autocompletar vencidos
  await this.autoCompletarFormulariosVencidos();

  // Buscar el formulario por tag, periodo y año (sin limitar a estado: 'activo')
  const formularioExistente = await this.inspeccionEmergenciaModel.findOne({
    tag,
    periodo,
    año
  });

  // Buscar extintores por área
  const extintores = await this.extintorService.findByTag(tag);
  
  // Buscar información del área incluyendo la superintendencia
  const areaInfo = await this.areaModel.findOne({ nombre: area })
    .populate('superintendencia')
    .exec();
  
  const superintendencia = areaInfo?.superintendencia?.nombre || "";

  if (formularioExistente) {
    const esActivo = formularioExistente.estado === 'activo';
    return {
      existe: true,
      formulario: formularioExistente,
      extintores,
      superintendencia,
      esActivo,
      estado: formularioExistente.estado,
      puedeModificar: esActivo
    };
  } else {
    return {
      existe: false,
      extintores,
      superintendencia,
      esActivo: true,
      estado: null,
      puedeModificar: true
    };
  }
} 

 async actualizarMesPorTag(
  tag: string,
  mes: string,
  datosMes: any,
  area: string
) {
  // Autocompletar vencidos
  await this.autoCompletarFormulariosVencidos();

  // Validar que el formulario esté en estado activo antes de proceder
  await this.validarEstadoActivo(tag);

  // Verificar que el mes sea válido
  const mesesValidos = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
  ];

  if (!mesesValidos.includes(mes)) {
    throw new Error(`Mes no válido: ${mes}`);
  }

  // Actualizar los extintores que fueron inspeccionados
  if (datosMes.inspeccionesExtintor && datosMes.inspeccionesExtintor.length > 0) {
    await this.extintorService.verificarYCrearExtintores(
      datosMes.inspeccionesExtintor.map(extintor => ({
        codigo: extintor.codigo,
        ubicacion: extintor.ubicacion || 'No especificada'
      })),
      tag,
      area
    );
    
    const codigosExtintores = datosMes.inspeccionesExtintor.map(extintor => extintor.codigo);
    await this.extintorService.marcarExtintoresComoInspeccionados(codigosExtintores);
  }

  // Crear el objeto de actualización
  const updateQuery = {
    $set: {
      [`meses.${mes}`]: datosMes,
      mesActual: mes,
      fechaUltimaModificacion: new Date()
    },
  };

  const resultado = await this.inspeccionEmergenciaModel.updateOne(
    { tag: tag,
      estado: 'activo'
     },
    updateQuery,
  );

  if (resultado.matchedCount === 0) {
    throw new Error(`No se encontró un formulario activo con el tag: ${tag}`);
  }

  return { success: true, message: "Mes actualizado correctamente" };
}

async findAll(filtros?: FiltrosInspeccion) {
    // Construir el objeto de consulta basado en los filtros
    const query: any = {};
    
    if (filtros) {
      if (filtros.area && typeof filtros.area === 'string') {
        query.area = { $regex: filtros.area, $options: 'i' };
      }
      
      if (filtros.superintendencia && typeof filtros.superintendencia === 'string') {
        query.superintendencia = { $regex: filtros.superintendencia, $options: 'i' };
      }
      
      if (filtros.mesActual && typeof filtros.mesActual === 'string') {
      query[`meses.${filtros.mesActual}`] = { $exists: true };
    }
      
      if (filtros.documentCode && typeof filtros.documentCode === 'string') {
        query.documentCode = { $regex: filtros.documentCode, $options: 'i' };
      }
    }
    
    return this.inspeccionEmergenciaModel
      .find(query)
      .sort({ fechaUltimaModificacion: -1 }) // Ordenar por fecha de última modificación descendente
      .exec();
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

  // En el archivo inspecciones-emergencia.service.ts
 async actualizarExtintoresPorTag(tag: string, extintores: any[], area: string) {
  // Autocompletar vencidos
  await this.autoCompletarFormulariosVencidos();

  // Validar que el formulario esté en estado activo antes de proceder
  await this.validarEstadoActivo(tag);

  // Verificar extintores
  if (!extintores || extintores.length === 0) {
    throw new BadRequestException('No se proporcionaron extintores para actualizar');
  }
  console.log(extintores);

  // Extraer códigos de extintores para marcarlos como inspeccionados
  const codigosExtintores = extintores.map(extintor => extintor.codigo);
  await this.extintorService.marcarExtintoresComoInspeccionados(codigosExtintores);

  // Buscar el formulario por tag
  const formularioExistente = await this.inspeccionEmergenciaModel.findOne({ tag, estado: 'activo' });
  
  if (!formularioExistente) {
    throw new NotFoundException(`No se encontró formulario activo con TAG: ${tag}`);
  }

  // Obtener el mes actual
  const mesActual = formularioExistente.mesActual;
  
  // Crear el objeto de actualización para añadir los extintores (no sobrescribir)
  const updateQuery = {
    $push: {
      [`meses.${mesActual}.inspeccionesExtintor`]: {
        $each: extintores  // Añade cada elemento del array
      }
    },
    $set: {
      fechaUltimaModificacion: new Date() // Actualiza la fecha de última modificación
    }
  };

  // Actualizar el documento
  const resultado = await this.inspeccionEmergenciaModel.updateOne(
    { tag: tag, 
      estado: 'activo'
     },
    updateQuery,
  );

  if (resultado.matchedCount === 0) {
    throw new NotFoundException(`No se encontró un formulario activo con el tag: ${tag}`);
  }

  return { 
    success: true, 
    message: "Extintores añadidos correctamente",
    añadidos: extintores.length
  };
}

async verificarInspecciones(area: string, mesActual: string) {
  // Validar que el mes sea válido
  const mesesValidos = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  if (!mesesValidos.includes(mesActual)) {
    throw new BadRequestException(`Mes no válido: ${mesActual}`);
  }

  // Construir y ejecutar la consulta
  const inspecciones = await this.inspeccionEmergenciaModel.find({
    area: { $regex: new RegExp(area, 'i') },
    mesActual: mesActual
  })
  .select('tag') // Solo necesitamos el campo tag
  .lean()
  .exec();

  // Transformar los resultados al formato requerido
  return inspecciones.map(inspeccion => ({
    tag: inspeccion.tag,
    inspeccionado: true
  }));
}
  
}
