import { normalizarValor, TipoCatalogoMonitoreo } from './catalogos-iniciales';

export interface EntradaActiva {
  tipo: TipoCatalogoMonitoreo;
  valor: string;
}

const NOMBRE_DE_LISTA: Record<TipoCatalogoMonitoreo, string> = {
  [TipoCatalogoMonitoreo.TECNICA]: 'técnicas',
  [TipoCatalogoMonitoreo.GRUPO_TRABAJO]: 'grupos de trabajo',
  [TipoCatalogoMonitoreo.PRIORIDAD_JDE]: 'prioridades JDE',
  [TipoCatalogoMonitoreo.SEVERIDAD]: 'resultados',
  [TipoCatalogoMonitoreo.FABRICANTE]: 'fabricantes',
  [TipoCatalogoMonitoreo.PROVEEDOR]: 'proveedores',
  [TipoCatalogoMonitoreo.CONDICION_INICIAL]: 'condiciones',
  [TipoCatalogoMonitoreo.TIPO_INTERVENCION]: 'tipos de intervención',
  [TipoCatalogoMonitoreo.INSTRUMENTO]: 'instrumentos',
  [TipoCatalogoMonitoreo.PUNTO_REFERENCIA]: 'puntos de referencia',
};

/**
 * Lleva cada valor de lista del reporte a **cómo está escrito en el
 * catálogo**: «termografia mecanica» se guarda «TERMOGRAFIA MECANICA». Es lo
 * que evita volver al desorden de los antecedentes escritos a mano.
 *
 * Un valor que no está en la lista se rechaza, salvo que sea el que el
 * reporte **ya tenía**: si después se dio de baja de la lista, guardar el
 * borrador no debe fallar por algo que el usuario no tocó.
 */
export class ValoresDeCatalogo {
  private readonly porTipo = new Map<
    TipoCatalogoMonitoreo,
    Map<string, string>
  >();
  readonly errores: string[] = [];

  constructor(activos: EntradaActiva[]) {
    for (const { tipo, valor } of activos) {
      if (!this.porTipo.has(tipo)) this.porTipo.set(tipo, new Map());
      this.porTipo.get(tipo)?.set(normalizarValor(valor), valor);
    }
  }

  valor(
    tipo: TipoCatalogoMonitoreo,
    escrito: string | undefined,
    anteriores: (string | undefined)[] = [],
  ): string | undefined {
    if (escrito === undefined) return undefined;
    const limpio = escrito.trim();
    // Vacío es «sin valor»: así se borra un campo de un borrador.
    if (limpio === '') return '';

    const canonico = this.porTipo.get(tipo)?.get(normalizarValor(limpio));
    if (canonico) return canonico;
    if (anteriores.includes(limpio)) return limpio;

    this.errores.push(
      `«${limpio}» no está en la lista de ${NOMBRE_DE_LISTA[tipo]}`,
    );
    return limpio;
  }
}
