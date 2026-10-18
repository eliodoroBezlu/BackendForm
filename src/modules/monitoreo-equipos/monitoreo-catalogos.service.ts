import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  INCLUIR_DADOS_DE_BAJA,
  marcarDadoDeBaja,
  marcarRestaurado,
} from '../../common/baja-logica/baja-logica.plugin';
import { ConfigFormularioService } from '../config-formulario/config-formulario.service';
import { CAMPOS_FICHA_BOMBA, TIPO_EQUIPO_BOMBA } from './domain/bomba';
import {
  CATALOGOS_INICIALES,
  normalizarValor,
  TipoCatalogoMonitoreo,
} from './domain/catalogos-iniciales';
import {
  ActualizarCatalogoMonitoreoDto,
  CrearCatalogoMonitoreoDto,
} from './dto/catalogo-monitoreo.dto';
import { CatalogoMonitoreo } from './schemas/catalogo-monitoreo.schema';

export interface ResultadoSiembra {
  /** Catálogos que estaban vacíos y se llenaron con sus valores iniciales. */
  sembrados: TipoCatalogoMonitoreo[];
  /** Si se creó la ficha «Bomba» en `config_formularios`. */
  fichaBombaCreada: boolean;
}

/**
 * Las listas del reporte de monitoreo: las administra Confiabilidad.
 *
 * Nada se borra: dar de baja un valor lo saca de los selectores, pero los
 * reportes que ya lo usaron lo siguen mostrando.
 */
@Injectable()
export class MonitoreoCatalogosService {
  constructor(
    @InjectModel(CatalogoMonitoreo.name)
    private readonly catalogoModel: Model<CatalogoMonitoreo>,
    private readonly configFormularios: ConfigFormularioService,
  ) {}

  listar(
    tipo?: TipoCatalogoMonitoreo,
    incluirDadosDeBaja = false,
  ): Promise<CatalogoMonitoreo[]> {
    return this.catalogoModel
      .find(tipo ? { tipo } : {})
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: incluirDadosDeBaja })
      .sort({ tipo: 1, orden: 1, valor: 1 })
      .exec();
  }

  /**
   * Da de alta un valor. Si ya existía **dado de baja**, lo restaura en vez
   * de rechazarlo: para quien lo escribe es el mismo valor, y el índice
   * único no dejaría crear otro.
   */
  async crear(dto: CrearCatalogoMonitoreoDto): Promise<CatalogoMonitoreo> {
    const valor = dto.valor.trim();
    const valor_normalizado = normalizarValor(valor);
    const existente = await this.catalogoModel
      .findOne({ tipo: dto.tipo, valor_normalizado })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .exec();

    if (existente && existente.activo !== false) {
      throw new ConflictException(
        `«${existente.valor}» ya está en la lista; no se puede repetir escrito de otra forma`,
      );
    }
    if (existente) {
      existente.set({
        ...marcarRestaurado(),
        valor,
        codigo: dto.codigo,
        color: dto.color,
      });
      return existente.save();
    }

    return this.catalogoModel.create({
      tipo: dto.tipo,
      valor,
      valor_normalizado,
      codigo: dto.codigo,
      color: dto.color,
      orden: await this.siguienteOrden(dto.tipo),
    });
  }

  async actualizar(
    id: string,
    dto: ActualizarCatalogoMonitoreoDto,
  ): Promise<CatalogoMonitoreo> {
    const entrada = await this.buscar(id);

    if (dto.valor !== undefined) {
      const valor = dto.valor.trim();
      const valor_normalizado = normalizarValor(valor);
      if (valor_normalizado !== entrada.valor_normalizado) {
        const choca = await this.catalogoModel
          .exists({ tipo: entrada.tipo, valor_normalizado })
          .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true });
        if (choca) {
          throw new ConflictException(`«${valor}» ya está en la lista`);
        }
      }
      entrada.set({ valor, valor_normalizado });
    }
    if (dto.codigo !== undefined) entrada.set('codigo', dto.codigo);
    if (dto.color !== undefined) entrada.set('color', dto.color);
    if (dto.orden !== undefined) entrada.set('orden', dto.orden);
    return entrada.save();
  }

  async darDeBaja(id: string, usuario: string): Promise<CatalogoMonitoreo> {
    const entrada = await this.buscar(id);
    entrada.set(marcarDadoDeBaja(usuario));
    return entrada.save();
  }

  async restaurar(id: string): Promise<CatalogoMonitoreo> {
    const entrada = await this.buscar(id, true);
    entrada.set(marcarRestaurado());
    return entrada.save();
  }

  /**
   * Llena con sus valores iniciales **solo los catálogos que nunca tuvieron
   * nada** (contando lo dado de baja). Uno que Confiabilidad ya editó no se
   * toca: si renombró «Warman», sembrar de nuevo no debe volver a crearlo.
   *
   * También crea la ficha «Bomba» en `config_formularios`, para que el
   * panel de inventario muestre y edite sus especificaciones.
   */
  async sembrar(): Promise<ResultadoSiembra> {
    const sembrados: TipoCatalogoMonitoreo[] = [];
    for (const tipo of Object.values(TipoCatalogoMonitoreo)) {
      const hay = await this.catalogoModel
        .exists({ tipo })
        .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true });
      if (hay) continue;

      await this.catalogoModel.insertMany(
        CATALOGOS_INICIALES[tipo].map((e, orden) => ({
          tipo,
          valor: e.valor,
          valor_normalizado: normalizarValor(e.valor),
          codigo: e.codigo,
          color: e.color,
          orden,
        })),
      );
      sembrados.push(tipo);
    }

    return { sembrados, fichaBombaCreada: await this.crearFichaBomba() };
  }

  /**
   * Agrega a un catálogo los valores que todavía no tiene. Lo usa la planilla
   * de carga con su hoja «Listas».
   *
   * Un valor que existe **dado de baja** no se restaura: alguien lo sacó de
   * la lista a propósito, y una planilla vieja no debe deshacerlo. Se informa.
   */
  async agregarFaltantes(
    tipo: TipoCatalogoMonitoreo,
    valores: string[],
  ): Promise<{ agregados: string[]; dadosDeBaja: string[] }> {
    const existentes = await this.catalogoModel
      .find({ tipo })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .exec();
    const porClave = new Map(existentes.map((e) => [e.valor_normalizado, e]));

    const agregados: string[] = [];
    const dadosDeBaja: string[] = [];
    let orden = await this.siguienteOrden(tipo);
    for (const crudo of valores) {
      const valor = crudo.trim();
      const clave = normalizarValor(valor);
      if (!clave) continue;
      const ya = porClave.get(clave);
      if (ya) {
        if (ya.activo === false) dadosDeBaja.push(ya.valor);
        continue;
      }
      const nuevo = await this.catalogoModel.create({
        tipo,
        valor,
        valor_normalizado: clave,
        orden: orden++,
      });
      porClave.set(clave, nuevo);
      agregados.push(valor);
    }
    return { agregados, dadosDeBaja };
  }

  private async crearFichaBomba(): Promise<boolean> {
    try {
      await this.configFormularios.create({
        tipo_equipo: TIPO_EQUIPO_BOMBA,
        campos: CAMPOS_FICHA_BOMBA,
      });
      return true;
    } catch (error) {
      // Ya existe, activa o dada de baja: en los dos casos no se pisa.
      if (
        error instanceof ConflictException ||
        (error as { code?: number }).code === 11000
      ) {
        return false;
      }
      throw error;
    }
  }

  private async siguienteOrden(tipo: TipoCatalogoMonitoreo): Promise<number> {
    const ultimo = await this.catalogoModel
      .findOne({ tipo })
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: true })
      .sort({ orden: -1 })
      .exec();
    return ultimo ? ultimo.orden + 1 : 0;
  }

  private async buscar(
    id: string,
    incluirDadosDeBaja = false,
  ): Promise<CatalogoMonitoreo> {
    const entrada = await this.catalogoModel
      .findById(id)
      .setOptions({ [INCLUIR_DADOS_DE_BAJA]: incluirDadosDeBaja })
      .exec();
    if (!entrada) {
      throw new NotFoundException('El valor no está en la lista');
    }
    return entrada;
  }
}
