import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConfigBienvenida,
  CLAVE_BIENVENIDA,
} from './schemas/config-bienvenida.schema';
import { BIENVENIDA_POR_DEFECTO } from './constantes';
import { ActualizarConfigBienvenidaDto } from './dto/actualizar-config-bienvenida.dto';

@Injectable()
export class ConfigBienvenidaService {
  constructor(
    @InjectModel(ConfigBienvenida.name)
    private readonly modelo: Model<ConfigBienvenida>,
  ) {}

  /**
   * La configuración vigente, **siempre**.
   *
   * Nunca lanza ni devuelve vacío: si no hay documento, responde los valores
   * por defecto del código. Una instalación recién montada tiene que funcionar
   * sin que nadie entre a configurarla, y el frontend no debería necesitar un
   * caso especial para «todavía no existe».
   */
  async obtener(): Promise<Record<string, unknown>> {
    const doc = await this.modelo
      .findOne({ clave: CLAVE_BIENVENIDA })
      .lean()
      .exec();

    if (!doc) return { ...BIENVENIDA_POR_DEFECTO };

    // El mensaje caducado se descarta aquí y no en el navegador: si la
    // vigencia dependiera del reloj del dispositivo, un teléfono con la fecha
    // mal puesta seguiría mostrando el aviso de la parada del mes pasado.
    const { vigenteDesde, vigenteHasta, ...resto } = doc;
    const dentroDePlazo = this.dentroDePlazo(vigenteDesde, vigenteHasta);

    return {
      ...resto,
      vigenteDesde,
      vigenteHasta,
      mensaje: dentroDePlazo ? doc.mensaje : BIENVENIDA_POR_DEFECTO.mensaje,
      submensaje: dentroDePlazo
        ? doc.submensaje
        : BIENVENIDA_POR_DEFECTO.submensaje,
    };
  }

  /** Lo que ve quien configura: el documento crudo, sin caducar nada. */
  async obtenerCrudo(): Promise<Record<string, unknown>> {
    const doc = await this.modelo
      .findOne({ clave: CLAVE_BIENVENIDA })
      .lean()
      .exec();
    return doc ?? { ...BIENVENIDA_POR_DEFECTO };
  }

  async actualizar(
    dto: ActualizarConfigBienvenidaDto,
    usuario: string,
  ): Promise<Record<string, unknown>> {
    this.validarCoherencia(dto);

    // `upsert`: la primera vez no hay documento que actualizar, y obligar a
    // crearlo aparte solo añadiría un paso que se puede olvidar.
    const { $set, $setOnInsert } = this.construirActualizacion(dto, usuario);

    await this.modelo
      .findOneAndUpdate(
        { clave: CLAVE_BIENVENIDA },
        $setOnInsert ? { $set, $setOnInsert } : { $set },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return this.obtenerCrudo();
  }

  /**
   * Reparte los campos entre `$set` y `$setOnInsert` **sin solaparlos**.
   *
   * Mongo rechaza que un mismo campo aparezca en los dos operadores:
   * «Updating the path 'mensaje' would create a conflict at 'mensaje'». Y el
   * formulario manda siempre el objeto completo, así que `mensaje` venía en
   * `$set` y la guarda de `$setOnInsert` chocaba en cada guardado.
   *
   * `$setOnInsert` sigue haciendo falta: los campos obligatorios del esquema
   * tienen que existir aunque el documento se cree con un `PATCH` parcial. Lo
   * que cambia es que solo se rellenan los que **no** vengan en el DTO.
   */
  private construirActualizacion(
    dto: ActualizarConfigBienvenidaDto,
    usuario: string,
  ): {
    $set: Record<string, unknown>;
    $setOnInsert?: Record<string, unknown>;
  } {
    const $set: Record<string, unknown> = {
      ...dto,
      clave: CLAVE_BIENVENIDA,
      actualizadoPor: usuario,
    };

    const $setOnInsert: Record<string, unknown> = {};
    for (const campo of ['mensaje', 'animacion'] as const) {
      if ($set[campo] === undefined) {
        $setOnInsert[campo] = BIENVENIDA_POR_DEFECTO[campo];
      }
    }

    return Object.keys($setOnInsert).length > 0
      ? { $set, $setOnInsert }
      : { $set };
  }

  /**
   * Reglas que el DTO no puede expresar por sí solo, porque miran dos campos
   * a la vez.
   */
  private validarCoherencia(dto: ActualizarConfigBienvenidaDto): void {
    if (
      dto.duracionMinimaMs !== undefined &&
      dto.duracionMaximaMs !== undefined &&
      dto.duracionMinimaMs >= dto.duracionMaximaMs
    ) {
      throw new BadRequestException(
        'El tiempo mínimo en pantalla debe ser menor que el máximo.',
      );
    }

    if (dto.vigenteDesde && dto.vigenteHasta) {
      if (new Date(dto.vigenteHasta) < new Date(dto.vigenteDesde)) {
        throw new BadRequestException(
          'La vigencia no puede terminar antes de empezar.',
        );
      }
    }

    // Dos entradas para la misma área dejarían el resultado a merced del orden
    // del array, que es justo el tipo de dato que después «a veces» falla.
    const areas = (dto.porArea ?? []).map((a) => a.area.trim().toLowerCase());
    if (new Set(areas).size !== areas.length) {
      throw new BadRequestException(
        'Hay dos configuraciones para la misma área.',
      );
    }
  }

  private dentroDePlazo(desde?: Date, hasta?: Date): boolean {
    const ahora = Date.now();
    if (desde && ahora < new Date(desde).getTime()) return false;
    if (hasta) {
      // El «hasta» se entiende inclusivo: hasta el final de ese día.
      const fin = new Date(hasta);
      fin.setHours(23, 59, 59, 999);
      if (ahora > fin.getTime()) return false;
    }
    return true;
  }
}
