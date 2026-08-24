import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { Firma, MetodoFirma } from './firma.schema';
import { AccionFirma, AuditoriaFirma } from './auditoria-firma.schema';

/** Quién y desde dónde firma. Lo arma el controller a partir del request. */
export interface ContextoFirma {
  usuario: string;
  ip?: string;
  userAgent?: string;
}

/** Dónde vive la firma, para la bitácora. */
export interface UbicacionFirma {
  coleccion: string;
  documentoId: string;
  campo: string;
}

export interface ResultadoVerificacion {
  integra: boolean;
  hashGuardado: string;
  hashRecalculado: string;
}

/** Tamaño máximo del data URL. Coincide con el límite de body del servidor. */
const MAXIMO_BYTES_IMAGEN = 10 * 1024 * 1024;

const PREFIJO_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,/;

@Injectable()
export class FirmaService {
  private readonly logger = new Logger(FirmaService.name);

  constructor(
    @InjectModel(AuditoriaFirma.name)
    private readonly auditoriaModel: Model<AuditoriaFirma>,
  ) {}

  /**
   * Convierte la imagen que llegó del formulario en una firma sellada.
   *
   * El hash y la fecha se calculan **aquí**, en el servidor: si los mandara el
   * cliente no probarían nada, porque el cliente es justamente lo que no se
   * confía.
   */
  sellar(imagen: string, metodo: MetodoFirma, contexto: ContextoFirma): Firma {
    if (!PREFIJO_DATA_URL.test(imagen)) {
      throw new BadRequestException(
        'La firma debe ser una imagen en formato data URL (PNG, JPEG o WebP).',
      );
    }

    const bytes = this.bytesDeDataUrl(imagen);
    if (bytes.length > MAXIMO_BYTES_IMAGEN) {
      throw new BadRequestException(
        `La firma pesa ${(bytes.length / 1024 / 1024).toFixed(1)} MB y el máximo son 10 MB.`,
      );
    }
    if (bytes.length === 0) {
      throw new BadRequestException('La firma está vacía.');
    }

    return {
      imagen,
      hash: this.hashDeImagen(imagen),
      metodo,
      firmadoPor: contexto.usuario,
      firmadoEn: new Date(),
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    } as Firma;
  }

  /** SHA-256 de los bytes decodificados, en hexadecimal. */
  hashDeImagen(imagen: string): string {
    return createHash('sha256')
      .update(this.bytesDeDataUrl(imagen))
      .digest('hex');
  }

  /**
   * ¿La imagen guardada sigue siendo la que se selló?
   *
   * Recalcula el hash sobre la imagen almacenada y lo compara con el que quedó
   * registrado. Cualquier cambio, hasta de un píxel, da `integra: false`.
   */
  verificar(firma: Firma): ResultadoVerificacion {
    const hashRecalculado = this.hashDeImagen(firma.imagen);
    return {
      integra: hashRecalculado === firma.hash,
      hashGuardado: firma.hash,
      hashRecalculado,
    };
  }

  /**
   * Anota la firma en la bitácora encadenada.
   *
   * `hashAnterior` es el `hashAsiento` del último asiento existente, así que
   * modificar uno viejo invalida a todos los posteriores.
   *
   * Nota conocida: bajo escritura concurrente dos asientos podrían tomar el
   * mismo `hashAnterior`. Al volumen de este sistema —firmas puntuales hechas
   * por personas— no ocurre en la práctica, y aun así la bifurcación quedaría
   * visible al recorrer la cadena, que es lo que importa.
   */
  async registrarAsiento(
    firma: Firma,
    ubicacion: UbicacionFirma,
    accion: AccionFirma = AccionFirma.FIRMADA,
  ): Promise<AuditoriaFirma> {
    const ultimo = await this.auditoriaModel
      .findOne({})
      .sort({ _id: -1 })
      .lean<{ hashAsiento: string }>()
      .exec();

    const hashAnterior = ultimo?.hashAsiento ?? '';

    const asiento = {
      ...ubicacion,
      hashFirma: firma.hash,
      metodo: firma.metodo,
      accion,
      firmadoPor: firma.firmadoPor,
      firmadoEn: firma.firmadoEn,
      ip: firma.ip,
      userAgent: firma.userAgent,
      hashAnterior,
    };

    return this.auditoriaModel.create({
      ...asiento,
      hashAsiento: this.hashDeAsiento(asiento),
    });
  }

  /**
   * ¿Esta misma imagen ya se usó como firma en otro lado?
   *
   * Es el riesgo que abre el permitir subir una imagen: reutilizar el mismo
   * archivo, o usar el de otra persona. No se bloquea automáticamente —hay
   * casos legítimos, como refirmar el mismo documento— pero queda a la vista de
   * quien audita.
   */
  async buscarReutilizacion(
    hash: string,
    excluirDocumentoId?: string,
  ): Promise<AuditoriaFirma[]> {
    return this.auditoriaModel
      .find({
        hashFirma: hash,
        ...(excluirDocumentoId
          ? { documentoId: { $ne: excluirDocumentoId } }
          : {}),
      })
      .exec();
  }

  /**
   * Recorre la bitácora comprobando que cada asiento encadena con el anterior.
   * Devuelve los asientos donde se rompe la cadena.
   */
  async verificarCadena(): Promise<{ intacta: boolean; rupturas: string[] }> {
    const asientos = await this.auditoriaModel
      .find({})
      .sort({ _id: 1 })
      .lean<AuditoriaFirma[]>()
      .exec();

    const rupturas: string[] = [];
    let esperado = '';

    for (const a of asientos) {
      const recalculado = this.hashDeAsiento({
        coleccion: a.coleccion,
        documentoId: a.documentoId,
        campo: a.campo,
        hashFirma: a.hashFirma,
        metodo: a.metodo,
        accion: a.accion,
        firmadoPor: a.firmadoPor,
        firmadoEn: a.firmadoEn,
        ip: a.ip,
        userAgent: a.userAgent,
        hashAnterior: a.hashAnterior,
      });

      if (a.hashAnterior !== esperado || recalculado !== a.hashAsiento) {
        rupturas.push(String(a._id));
      }
      esperado = a.hashAsiento;
    }

    if (rupturas.length) {
      this.logger.error(
        `Bitácora de firmas alterada: ${rupturas.length} asiento(s) no encadenan.`,
      );
    }
    return { intacta: rupturas.length === 0, rupturas };
  }

  // ── Interno ─────────────────────────────────────────────────────────────

  private bytesDeDataUrl(imagen: string): Buffer {
    return Buffer.from(imagen.replace(PREFIJO_DATA_URL, ''), 'base64');
  }

  /**
   * Serialización canónica del asiento: campos en orden fijo, para que el hash
   * sea reproducible. Depender del orden de `JSON.stringify` sobre un objeto
   * cualquiera haría que la verificación fallara por un cambio de forma.
   */
  private hashDeAsiento(a: {
    coleccion: string;
    documentoId: string;
    campo: string;
    hashFirma: string;
    metodo: string;
    accion: string;
    firmadoPor: string;
    firmadoEn: Date;
    ip?: string;
    userAgent?: string;
    hashAnterior: string;
  }): string {
    const canonico = [
      a.coleccion,
      a.documentoId,
      a.campo,
      a.hashFirma,
      a.metodo,
      a.accion,
      a.firmadoPor,
      new Date(a.firmadoEn).toISOString(),
      a.ip ?? '',
      a.userAgent ?? '',
      a.hashAnterior,
    ].join('|');

    return createHash('sha256').update(canonico, 'utf8').digest('hex');
  }
}
