import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Area } from './schemas/area.schema';
import { Model } from 'mongoose';
import { Superintendencia } from '../superintendencia/schemas/superintendencia.schema';
import {
  mismoNombreOrganizacion,
  normalizarNombre,
} from '../../common/utils/nombres-organizacion.util';
import { escaparRegex } from '../../common/utils/escapar-regex.util';

interface IamAreaCatalogEntry {
  codigo: string;
  nombre: string;
  /** Nombre denormalizado. Solo para mostrar: **no** se empareja por acá. */
  superintendencia: string;
  /** Clave estable de la superintendencia en el IAM. */
  superintendenciaId?: string;
  superintendenciaNombre?: string;
}

@Injectable()
export class AreaService implements OnModuleInit {
  private readonly logger = new Logger(AreaService.name);

  constructor(
    @InjectModel(Area.name)
    private readonly areaModel: Model<Area>,
    @InjectModel(Superintendencia.name)
    private readonly superintendenciaModel: Model<Superintendencia>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Sincronización best-effort al arrancar — si el IAM Core no está
    // disponible, no debe impedir que BackendForm levante.
    try {
      const resultado = await this.syncAreasFromIam();
      if (resultado.error) {
        this.logger.warn(
          `Sync de áreas con IAM omitido al arrancar: ${resultado.error}`,
        );
      } else {
        this.logger.log(
          `Áreas sincronizadas desde IAM al arrancar: ${resultado.creadas} creadas, ${resultado.actualizadas} actualizadas`,
        );
        // Solo se avisa: dar de baja un área es una decisión de negocio (puede
        // tener inspecciones en curso), así que se hace a mano desde el panel.
        for (const baja of resultado.candidatasBaja) {
          this.logger.warn(
            `Área "${baja.nombre}" (código ${baja.codigo}) ya no está activa en el IAM ` +
              `y sigue activa acá. Revisar si corresponde darla de baja.`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Sync de áreas con IAM omitido al arrancar: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }

  /**
   * Empareja una superintendencia del IAM con la local, **sin crear duplicados**.
   *
   * Orden de búsqueda:
   *   1. `idIam` — la clave estable. Es la única que no se rompe si alguien
   *      renombra la superintendencia en cualquiera de los dos lados.
   *   2. Nombre idéntico ignorando tildes y mayúsculas.
   *   3. Crear, **avisando** si se parece a alguna que ya existe.
   *
   * Deliberadamente **no** se adopta por parecido. Emparejar «Plta.» con
   * «Planta» requiere criterio humano y equivocarse fusiona dos áreas
   * distintas: un nombre corto como «Superintendencia de Mantenimiento» se
   * reduce a un solo token significativo y termina pareciéndose a todas. Ese
   * emparejamiento se hace una sola vez, revisado, con el script
   * `scripts/migrar-catalogo-iam.cjs`, que deja el `idIam` estampado. De ahí
   * en adelante el sync solo sigue la clave.
   *
   * El `nombre` local nunca se pisa: es el que referencian por texto los PGR,
   * las matrices y el roster ya cargados. El del IAM va a `nombreIam`.
   */
  private async resolverSuperintendencia(
    iamArea: IamAreaCatalogEntry,
    locales: Superintendencia[],
  ): Promise<Superintendencia> {
    const idIam = iamArea.superintendenciaId;
    const nombreIam =
      iamArea.superintendenciaNombre ?? iamArea.superintendencia;

    if (idIam) {
      const porId = locales.find(
        (s) => (s as { idIam?: string }).idIam === idIam,
      );
      if (porId) return porId;
    }

    const adoptable = locales.find(
      (s) =>
        !(s as { idIam?: string }).idIam &&
        normalizarNombre(s.nombre) === normalizarNombre(nombreIam),
    );
    if (adoptable) {
      await this.superintendenciaModel.updateOne(
        { _id: adoptable._id },
        { $set: { idIam, nombreIam } },
      );
      (adoptable as { idIam?: string }).idIam = idIam;
      this.logger.log(
        `Superintendencia "${adoptable.nombre}" emparejada con el IAM (${idIam})`,
      );
      return adoptable;
    }

    // Se crea, pero si hay una parecida se avisa: casi siempre significa que
    // falta correr la migración y que esto va a quedar duplicado.
    const parecida = locales.find((s) =>
      mismoNombreOrganizacion(s.nombre, nombreIam),
    );
    if (parecida) {
      this.logger.warn(
        `Se creará "${nombreIam}" y ya existe "${parecida.nombre}". ` +
          `Si son la misma, corré scripts/migrar-catalogo-iam.cjs para fusionarlas.`,
      );
    }

    const creada = await new this.superintendenciaModel({
      nombre: nombreIam,
      nombreIam,
      idIam,
      activo: true,
      creadoPor: 'iam-sync',
    }).save();
    locales.push(creada);
    this.logger.log(`Superintendencia creada desde el IAM: "${nombreIam}"`);
    return creada;
  }

  /**
   * Trae el catálogo maestro de Áreas/Superintendencias desde el IAM Core
   * (fuente de verdad) y lo espeja en Mongo.
   *
   * Empareja por **clave**: el área por `codigo`, la superintendencia por
   * `idIam`. Emparejar por nombre era lo que duplicaba el catálogo: el IAM
   * escribe «Generación» y «Mec. Plta. Chancado…» donde BackendForm tenía
   * «Generacion» y «Mec. Planta Chancado…», y cada arranque creaba un registro
   * nuevo y repuntaba las áreas hacia él.
   *
   * Nunca toca `activo`, `creadoPor` ni `actualizadoPor` — son propios de
   * BackendForm — ni pisa `nombre`. Las áreas que el IAM deja de mandar se
   * reportan como candidatas a baja, pero no se desactivan solas: pueden tener
   * inspecciones en curso.
   */
  async syncAreasFromIam(): Promise<{
    creadas: number;
    actualizadas: number;
    candidatasBaja: { codigo: string; nombre: string }[];
    error?: string;
  }> {
    const base = (
      this.configService.get<string>('IAM_CORE_URL') || 'http://localhost:4000'
    ).replace(/\/+$/, '');

    let areas: IamAreaCatalogEntry[];
    try {
      const response = await fetch(`${base}/api/rbac/catalog/areas`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`IAM respondió con estado ${response.status}`);
      }
      const data = (await response.json()) as { areas?: IamAreaCatalogEntry[] };
      areas = data.areas ?? [];
    } catch (error) {
      return {
        creadas: 0,
        actualizadas: 0,
        candidatasBaja: [],
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }

    // Se cargan una vez y se comparan en memoria. Antes cada área hacía dos
    // consultas con un `RegExp` construido a partir del nombre que mandaba el
    // IAM, sin escapar: los `.` de «Mec. Plta.» actuaban como comodín y un
    // nombre con paréntesis habría roto la consulta.
    const superintendencias = await this.superintendenciaModel.find().exec();
    const areasLocales = await this.areaModel.find().exec();

    let creadas = 0;
    let actualizadas = 0;

    for (const iamArea of areas) {
      const superintendencia = await this.resolverSuperintendencia(
        iamArea,
        superintendencias,
      );

      // Por código; si todavía no lo tiene, se adopta la que ya existía con el
      // mismo nombre —ignorando tildes y mayúsculas— y se le estampa el código.
      let area = areasLocales.find((a) => a.codigo === iamArea.codigo);
      if (!area) {
        area = areasLocales.find(
          (a) =>
            !a.codigo &&
            normalizarNombre(a.nombre) === normalizarNombre(iamArea.nombre),
        );
        if (area) {
          this.logger.log(
            `Área "${area.nombre}" emparejada con el código ${iamArea.codigo} del IAM`,
          );
        }
      }

      if (area) {
        area.codigo = iamArea.codigo;
        // `nombre` no se pisa a propósito: es el que usan los datos ya
        // cargados. La diferencia queda registrada en `nombreIam`.
        area.nombreIam =
          iamArea.nombre === area.nombre ? undefined : iamArea.nombre;
        area.superintendencia = superintendencia._id as Superintendencia;
        await area.save();
        actualizadas++;
      } else {
        const nueva = await new this.areaModel({
          codigo: iamArea.codigo,
          nombre: iamArea.nombre,
          superintendencia: superintendencia._id,
          activo: true,
          creadoPor: 'iam-sync',
        }).save();
        areasLocales.push(nueva);
        creadas++;
      }
    }

    const codigosIam = new Set(areas.map((a) => a.codigo));
    const candidatasBaja = areasLocales
      .filter((a) => a.codigo && a.activo && !codigosIam.has(a.codigo))
      .map((a) => ({ codigo: a.codigo as string, nombre: a.nombre }));

    return { creadas, actualizadas, candidatasBaja };
  }

  async create(createAreaDto: CreateAreaDto, usuario: string) {
    // Buscar la superintendencia por ID
    const superintendencia = await this.superintendenciaModel.findById(
      createAreaDto.superintendencia,
    );

    if (!superintendencia) {
      throw new NotFoundException(
        `Superintendencia con ID "${createAreaDto.superintendencia}" no encontrada`,
      );
    }

    // Verificar que la superintendencia esté activa
    if (!superintendencia.activo) {
      throw new BadRequestException(
        'No se puede crear un área en una superintendencia inactiva',
      );
    }

    // Verificar si ya existe un área con ese nombre en la misma superintendencia
    const existe = await this.areaModel.findOne({
      // Nombre exacto sin distinguir mayusculas. Se escapa porque un nombre
      // con parentesis romperia la expresion.
      nombre: {
        $regex: new RegExp(`^${escaparRegex(createAreaDto.nombre)}$`, 'i'),
      },
      superintendencia: superintendencia._id,
    });

    if (existe) {
      throw new BadRequestException(
        `Ya existe un área con el nombre "${createAreaDto.nombre}" en esta superintendencia`,
      );
    }

    const area = new this.areaModel({
      nombre: createAreaDto.nombre,
      superintendencia: superintendencia._id,
      creadoPor: usuario,
      activo: createAreaDto.activo ?? true,
    });

    return await area.save();
  }

  async buscarArea(query: string): Promise<string[]> {
    // Si query no es válido, retornar las primeras 20 áreas activas
    if (typeof query !== 'string' || query.trim() === '') {
      const areas = await this.areaModel.find({ activo: true }).exec();
      return areas.map((area) => area.nombre);
    }

    // Búsqueda con regex
    const areas = await this.areaModel
      .find({
        // Escapado: sin esto un «(» escrito en el autocompletado
        // devuelve un error de Mongo (ver escapar-regex.util).
        nombre: { $regex: escaparRegex(query.trim()), $options: 'i' },
        activo: true,
      })
      .limit(20)
      .exec();

    return areas.map((area) => area.nombre);
  }

  async findAll() {
    return await this.areaModel
      .find()
      .populate('superintendencia')
      .sort({ nombre: 1 })
      .exec();
  }

  async findOne(id: string) {
    const area = await this.areaModel
      .findById(id)
      .populate('superintendencia')
      .exec();

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    return area;
  }

  async update(id: string, updateAreaDto: UpdateAreaDto, usuario: string) {
    const area = await this.areaModel.findById(id);

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    // Si se actualiza la superintendencia, verificar que exista y esté activa
    if (updateAreaDto.superintendencia) {
      const superintendencia = await this.superintendenciaModel.findById(
        updateAreaDto.superintendencia,
      );

      if (!superintendencia) {
        throw new NotFoundException(
          `Superintendencia con ID "${updateAreaDto.superintendencia}" no encontrada`,
        );
      }

      if (!superintendencia.activo) {
        throw new BadRequestException(
          'No se puede asignar un área a una superintendencia inactiva',
        );
      }
    }

    // Si se actualiza el nombre, verificar duplicados
    if (updateAreaDto.nombre) {
      const superintendenciaId =
        updateAreaDto.superintendencia || area.superintendencia;

      const existe = await this.areaModel.findOne({
        nombre: { $regex: new RegExp(`^${updateAreaDto.nombre}$`, 'i') },
        superintendencia: superintendenciaId,
        _id: { $ne: id },
      });

      if (existe) {
        throw new BadRequestException(
          `Ya existe otra área con el nombre "${updateAreaDto.nombre}" en esta superintendencia`,
        );
      }
    }

    const areaActualizada = await this.areaModel
      .findByIdAndUpdate(
        id,
        {
          ...updateAreaDto,
          actualizadoPor: usuario,
        },
        { new: true },
      )
      .populate('superintendencia');

    return areaActualizada;
  }

  async desactivar(id: string, usuario: string) {
    const area = await this.areaModel.findById(id);

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    if (!area.activo) {
      return {
        exito: false,
        mensaje: 'El área ya está desactivada',
      };
    }

    area.activo = false;
    area.actualizadoPor = usuario;
    await area.save();

    return {
      exito: true,
      mensaje: 'Área desactivada correctamente',
    };
  }

  async activar(id: string, usuario: string) {
    const area = await this.areaModel.findById(id).populate('superintendencia');

    if (!area) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    // Verificar que la superintendencia esté activa
    const superintendencia = area.superintendencia as any;
    if (!superintendencia.activo) {
      throw new BadRequestException(
        'No se puede activar un área cuya superintendencia está inactiva',
      );
    }

    area.activo = true;
    area.actualizadoPor = usuario;
    await area.save();

    return area;
  }

  async remove(id: string) {
    // Importante: Verificar si hay extintores asociados antes de eliminar
    const result = await this.areaModel.findByIdAndDelete(id);

    if (!result) {
      throw new NotFoundException(`Área con ID "${id}" no encontrada`);
    }

    return {
      success: true,
      message: 'Área eliminada correctamente',
    };
  }
}
