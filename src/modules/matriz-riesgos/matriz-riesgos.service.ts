import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MatrizRiesgosImportService } from './matriz-riesgos-import.service';
import {
  ActividadRiesgo,
  EstadoMatriz,
  MatrizRiesgo,
  MatrizRiesgoDocument,
} from './schemas/matriz-riesgo.schema';
import { Area } from '../area/schemas/area.schema';
import {
  ImportarMatrizDto,
  ListarMatricesDto,
  ResumenImportacionGuardada,
} from './dto/importar-matriz.dto';
import { ResultadoAnalisis } from './dto/resultado-importacion';
import {
  mismoNombreOrganizacion,
  normalizarNombre,
} from '../../common/utils/nombres-organizacion.util';

/** Área del maestro con su superintendencia ya poblada. */
interface AreaConSuperintendencia {
  codigo?: string;
  nombre: string;
  superintendencia?: { nombre?: string } | null;
}

/** Área ya resuelta contra el maestro. */
interface AreaResuelta {
  codigo: string;
  nombre: string;
  superintendencia: string;
  /** El Excel declaraba otra superintendencia que la del maestro. */
  advertencia?: string;
}

@Injectable()
export class MatrizRiesgosService {
  private readonly logger = new Logger(MatrizRiesgosService.name);

  constructor(
    @InjectModel(MatrizRiesgo.name)
    private readonly matrizModel: Model<MatrizRiesgoDocument>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<Area>,
    private readonly importService: MatrizRiesgosImportService,
  ) {}

  private normalizar(s: string): string {
    return normalizarNombre(s);
  }

  /**
   * Áreas del maestro compatibles con el nombre que trae el archivo.
   *
   * Los nombres **no coinciden literalmente**: el Excel dice "Mantenimiento
   * Chancado" y el maestro "Chancado". Por eso se acepta también la
   * coincidencia parcial (uno contenido en el otro).
   *
   * El maestro además arrastra duplicados con y sin tilde —"Generacion" y
   * "Generación", "Recursos Hidricos" y "Recursos Hídricos"— donde solo uno
   * tiene código JDE. Como la normalización quita tildes, ambos colapsan al
   * mismo valor; en ese caso se prefiere el que **sí** tiene código, que es el
   * emparejado por la sincronización con IAM.
   */
  private buscarCandidatas(
    areas: AreaConSuperintendencia[],
    nombreAreaExcel: string,
  ): AreaConSuperintendencia[] {
    const buscado = this.normalizar(nombreAreaExcel);

    const exactas = areas.filter((a) => this.normalizar(a.nombre) === buscado);
    const parciales = areas.filter((a) => {
      const n = this.normalizar(a.nombre);
      return n !== buscado && (buscado.includes(n) || n.includes(buscado));
    });

    const encontradas = exactas.length ? exactas : parciales;
    const conCodigo = encontradas.filter((a) => a.codigo);
    return conCodigo.length ? conCodigo : encontradas;
  }

  /**
   * Traduce las filas planas del Excel a actividades con sus riesgos.
   *
   * El archivo repite el encabezado (área, tarea, condición, categoría) en cada
   * riesgo porque las columnas A–O están combinadas **por riesgo**: no existe
   * un bloque de actividad. Acá se reconstruye agrupando por esa tupla, y
   * **respetando el orden de aparición** para que la matriz guardada se lea
   * igual que la planilla.
   *
   * `numero` de riesgo se conserva tal cual viene: es correlativo global de la
   * matriz y el PGR lo referencia.
   */
  private agruparEnActividades(
    riesgos: ResultadoAnalisis['riesgos'],
  ): ActividadRiesgo[] {
    const actividades: ActividadRiesgo[] = [];
    const indicePorClave = new Map<string, number>();

    for (const r of riesgos) {
      const clave = [
        r.areaProcesoAlcance,
        r.actividadTarea,
        r.condicion,
        r.categoria,
      ]
        .map((v) => normalizarNombre(v ?? ''))
        .join('||');

      let indice = indicePorClave.get(clave);
      if (indice === undefined) {
        indice = actividades.length;
        indicePorClave.set(clave, indice);
        actividades.push({
          numero: indice + 1,
          areaProcesoAlcance: r.areaProcesoAlcance,
          actividadTarea: r.actividadTarea,
          condicion: r.condicion,
          categoria: r.categoria,
          riesgos: [],
        });
      }

      actividades[indice].riesgos.push({
        numero: r.numero,
        familiaPeligro: r.familiaPeligro,
        descripcionPeligro: r.descripcionPeligro,
        familiaRiesgo: r.familiaRiesgo,
        descripcionRiesgo: r.descripcionRiesgo,
        exposicion: r.exposicion,
        posibilidad: r.posibilidad,
        severidad: r.severidad,
        // Derivados: siempre los que calculó el motor, nunca los del archivo.
        probabilidad: r.probabilidad ?? undefined,
        resultado: r.resultado ?? undefined,
        nivelInicial: r.nivelInicial ?? undefined,
        nivelActual: r.nivelActual ?? undefined,
        controles: r.controles.map((c) => ({
          familiaControl: c.familiaControl,
          medida: c.medida,
          familiaVerificador: c.familiaVerificador,
          verificador: c.verificador,
          calidadControl: c.calidadControl,
          jerarquiaControl: c.jerarquiaControl,
          eficacia: c.eficacia ?? undefined,
        })),
      });
    }

    return actividades;
  }

  /**
   * Resuelve el área contra el maestro y **toma de ahí la superintendencia**.
   *
   * La superintendencia del Excel se escribe a mano y viene con formatos
   * distintos ("SUPERINTENDENCIA DE MANTENIMIENTO - MEC. PLTA. CHANC."), así
   * que exigir igualdad textual con el maestro rechazaría archivos válidos.
   * El maestro es la fuente de verdad de la jerarquía: se usa su valor y, si
   * difiere del declarado, se avisa —porque de esa superintendencia depende a
   * qué PGR se consolidará después.
   */
  private async resolverArea(
    nombreAreaExcel: string | undefined,
    superintendenciaExcel: string | undefined,
    areaCodigoForzado?: string,
  ): Promise<AreaResuelta> {
    // El `populate` cambia la forma del documento (superintendencia pasa de
    // ObjectId a objeto), así que se tipa explícitamente el resultado.
    const areas = (await this.areaModel
      .find({ activo: true })
      .populate('superintendencia', 'nombre')
      .lean()
      .exec()) as unknown as AreaConSuperintendencia[];

    const nombreDeSuper = (a: AreaConSuperintendencia): string =>
      a.superintendencia?.nombre ?? '';

    let area = areaCodigoForzado
      ? areas.find((a) => a.codigo === areaCodigoForzado)
      : undefined;

    if (!area && areaCodigoForzado) {
      throw new BadRequestException(
        `No existe un área activa con código '${areaCodigoForzado}'.`,
      );
    }

    if (!area) {
      if (!nombreAreaExcel) {
        throw new BadRequestException(
          'El archivo no declara Área/Departamento y no se indicó ninguna.',
        );
      }

      const candidatas = this.buscarCandidatas(areas, nombreAreaExcel);

      if (candidatas.length === 0) {
        // No se crean áreas al vuelo: el maestro llega sincronizado desde IAM
        // y un alta silenciosa aquí lo desalinearía.
        throw new BadRequestException(
          `El área "${nombreAreaExcel}" no existe en el maestro. ` +
            `Indicá el código del área o sincronizá el maestro antes de importar.`,
        );
      }
      if (candidatas.length > 1) {
        // Elegir una al azar mandaría la matriz al PGR de otra
        // superintendencia. Mejor pedir que se desambigüe.
        throw new BadRequestException(
          `"${nombreAreaExcel}" coincide con varias áreas del maestro ` +
            `(${candidatas.map((c) => `${c.nombre}${c.codigo ? ` [${c.codigo}]` : ''}`).join(', ')}). ` +
            `Indicá cuál con el código de área.`,
        );
      }
      area = candidatas[0];
    }

    const superMaestro = nombreDeSuper(area);
    let advertencia: string | undefined;
    if (
      superintendenciaExcel &&
      superMaestro &&
      !mismoNombreOrganizacion(superintendenciaExcel, superMaestro)
    ) {
      advertencia =
        `El archivo declara la superintendencia "${superintendenciaExcel}" pero ` +
        `en el maestro el área "${area.nombre}" pertenece a "${superMaestro}". ` +
        `Se usa la del maestro: de ella depende a qué PGR se consolidará.`;
    }

    if (!area.codigo) {
      // El código es parte del identificador legible de la matriz
      // (`MR-3320-2026-v1`) y de su clave única. Las áreas anteriores a la
      // sincronización con IAM no lo tienen hasta que el sync las empareja
      // por nombre; caer al ObjectId daría un código inservible.
      throw new BadRequestException(
        `El área "${area.nombre}" no tiene código asignado. ` +
          `Sincronizá las áreas con IAM antes de importar.`,
      );
    }

    return {
      codigo: area.codigo,
      nombre: area.nombre,
      superintendencia: superMaestro,
      advertencia,
    };
  }

  /**
   * Analiza sin escribir: alimenta la pantalla de previsualización.
   *
   * Enriquece el análisis con las áreas candidatas del maestro. Con los datos
   * reales el emparejamiento automático no siempre es inequívoco, así que la
   * pantalla debe ofrecer un selector en lugar de dar por buena una
   * coincidencia.
   */
  async analizarArchivo(
    buffer: Buffer,
    nombreArchivo: string,
  ): Promise<ResultadoAnalisis> {
    const analisis = await this.importService.analizar(buffer, nombreArchivo);

    if (!analisis.cabecera.area) return analisis;

    const areas = (await this.areaModel
      .find({ activo: true })
      .populate('superintendencia', 'nombre')
      .lean()
      .exec()) as unknown as AreaConSuperintendencia[];

    const buscado = this.normalizar(analisis.cabecera.area);
    analisis.areasCandidatas = this.buscarCandidatas(
      areas,
      analisis.cabecera.area,
    ).map((a) => ({
      codigo: a.codigo,
      nombre: a.nombre,
      superintendencia: a.superintendencia?.nombre ?? '',
      coincidencia:
        this.normalizar(a.nombre) === buscado
          ? ('exacta' as const)
          : ('parcial' as const),
    }));

    if (analisis.areasCandidatas.length !== 1) {
      analisis.advertencias.push(
        analisis.areasCandidatas.length === 0
          ? `No se encontró en el maestro un área que coincida con "${analisis.cabecera.area}". Hay que elegirla manualmente.`
          : `"${analisis.cabecera.area}" coincide con ${analisis.areasCandidatas.length} áreas del maestro: hay que elegir cuál.`,
      );
    }

    return analisis;
  }

  /**
   * Confirma la importación: **vuelve a leer y recalcular el archivo** y
   * persiste la matriz en estado BORRADOR.
   */
  async importar(
    buffer: Buffer,
    nombreArchivo: string,
    dto: ImportarMatrizDto,
    usuario: string,
  ): Promise<ResumenImportacionGuardada> {
    const analisis = await this.importService.analizar(buffer, nombreArchivo);

    if (analisis.errores.length) {
      throw new BadRequestException(analisis.errores.join(' '));
    }
    if (analisis.resumen.totalDiscrepancias > 0) {
      // Guardar con discrepancias significaría que el motor y el documento no
      // dicen lo mismo: hay que resolverlo antes, no dejarlo enterrado.
      throw new BadRequestException(
        `El archivo tiene ${analisis.resumen.totalDiscrepancias} discrepancia(s) ` +
          `entre los valores calculados y los del Excel. Revisá la previsualización.`,
      );
    }

    const area = await this.resolverArea(
      analisis.cabecera.area,
      analisis.cabecera.superintendencia,
      dto.areaCodigo,
    );

    const anio = dto.anio ?? analisis.cabecera.anio;
    if (!anio) {
      throw new BadRequestException(
        'No se pudo determinar el año de la matriz; indicalo explícitamente.',
      );
    }

    // ── Versionado ──────────────────────────────────────────────────────────
    const previas = await this.matrizModel
      .find({ areaCodigo: area.codigo, anio, activo: true })
      .sort({ version: -1 })
      .exec();

    if (previas.length > 0 && !dto.nuevaVersion) {
      throw new ConflictException(
        `Ya existe una matriz para el área ${area.nombre} y el año ${anio} ` +
          `(v${previas[0].version}, ${previas[0].estado}). ` +
          `Usá "nueva versión" si querés revisarla.`,
      );
    }

    const version = previas.length ? previas[0].version + 1 : 1;

    const actividades = this.agruparEnActividades(analisis.riesgos);
    const totalRiesgos = actividades.reduce((n, a) => n + a.riesgos.length, 0);

    const advertencias = [
      ...analisis.advertencias,
      ...analisis.riesgos.flatMap((r) =>
        r.advertencias.map((a) => `Riesgo ${r.numero}: ${a}`),
      ),
    ];
    if (area.advertencia) advertencias.unshift(area.advertencia);

    const creada = await this.matrizModel.create({
      codigo: `MR-${area.codigo}-${anio}-v${version}`,
      areaCodigo: area.codigo,
      areaNombre: area.nombre,
      superintendencia: area.superintendencia,
      gerencia: analisis.cabecera.gerencia,
      anio,
      version,
      matrizAnteriorId: previas[0]?._id,
      estado: EstadoMatriz.BORRADOR,
      elaboradoPor: analisis.cabecera.elaboradoPor,
      revisadoAprobadoPor: analisis.cabecera.revisadoAprobadoPor,
      fechaElaboracion: this.importService.parsearFecha(
        analisis.cabecera.fechaElaboracion,
      ),
      actividades,
      archivoOrigen: nombreArchivo,
      historial: [
        {
          usuario,
          fecha: new Date(),
          estadoAnterior: '—',
          estadoNuevo: EstadoMatriz.BORRADOR,
          observaciones:
            `Importada de "${nombreArchivo}" (${totalRiesgos} riesgos ` +
            `en ${actividades.length} actividades)`,
        },
      ],
    });

    this.logger.log(
      `Matriz ${creada.codigo} importada por ${usuario}: ` +
        `${totalRiesgos} riesgos en ${actividades.length} actividades, ` +
        `${analisis.resumen.requierenPgr} requieren PGR`,
    );

    return {
      matrizId: String(creada._id),
      codigo: creada.codigo,
      version,
      riesgosImportados: totalRiesgos,
      controlesImportados: analisis.resumen.totalControles,
      requierenPgr: analisis.resumen.requierenPgr,
      advertencias,
    };
  }

  async findAll(filtros: ListarMatricesDto): Promise<MatrizRiesgo[]> {
    const query: Record<string, unknown> = { activo: true };
    if (filtros.areaCodigo) query.areaCodigo = filtros.areaCodigo;
    if (filtros.superintendencia)
      query.superintendencia = filtros.superintendencia;
    if (filtros.anio) query.anio = filtros.anio;
    if (filtros.estado) query.estado = filtros.estado;

    // Sin los riesgos: un listado no necesita arrastrar cientos de subdocumentos.
    return this.matrizModel
      .find(query)
      .select('-riesgos')
      .sort({ anio: -1, areaNombre: 1, version: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string): Promise<MatrizRiesgo> {
    const matriz = await this.matrizModel.findById(id).lean().exec();
    if (!matriz || !matriz.activo) {
      throw new NotFoundException(`No se encontró la matriz '${id}'.`);
    }
    return matriz;
  }

  /**
   * Matrices aprobadas de una superintendencia para una gestión: es la
   * consulta que alimentará la consolidación al PGR.
   */
  async aprobadasDeSuperintendencia(
    superintendencia: string,
    anio: number,
  ): Promise<MatrizRiesgo[]> {
    // El filtro por superintendencia se hace en memoria y no en la consulta:
    // el mismo nombre está escrito de formas distintas en la matriz y en el
    // PGR ("Mec. Plta. Chancado…" / "Mec. Planta Chancado…"), así que un
    // `find({ superintendencia })` literal devolvería vacío. Las matrices de un
    // año son pocas, de modo que traerlas y comparar sale barato.
    const delAnio = await this.matrizModel
      .find({ anio, estado: EstadoMatriz.APROBADA, activo: true })
      .lean()
      .exec();

    return delAnio.filter((m) =>
      mismoNombreOrganizacion(m.superintendencia, superintendencia),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Flujo de estados
  // ──────────────────────────────────────────────────────────────────────────

  private async cargarParaEditar(id: string): Promise<MatrizRiesgoDocument> {
    const matriz = await this.matrizModel.findById(id).exec();
    if (!matriz || !matriz.activo) {
      throw new NotFoundException(`No se encontró la matriz '${id}'.`);
    }
    return matriz;
  }

  private registrarCambio(
    matriz: MatrizRiesgoDocument,
    nuevo: EstadoMatriz,
    usuario: string,
    observaciones?: string,
  ): void {
    matriz.historial.push({
      usuario,
      fecha: new Date(),
      estadoAnterior: matriz.estado,
      estadoNuevo: nuevo,
      observaciones,
    });
    matriz.estado = nuevo;
  }

  /** Quién creó la matriz, según la primera entrada del historial. */
  private elaborador(matriz: MatrizRiesgoDocument): string | undefined {
    return matriz.historial[0]?.usuario;
  }

  /**
   * Problemas que impiden aprobar. Se devuelven todos juntos para que quien
   * revisa no los descubra de a uno.
   */
  /**
   * Nombre normalizado y sin plurales, para comparar actividades.
   *
   * Se recorta la `S` final de cada palabra larga en vez de usar una regex con
   * ``: alcanza para el caso real —"Trabajo" contra "Trabajos"— y es más
   * fácil de leer que un patrón. Palabras de 3 letras o menos se dejan como
   * están para no convertir "GAS" en "GA".
   */
  private sinPlural(texto: string): string {
    return normalizarNombre(texto)
      .split(' ')
      .map((palabra) =>
        palabra.length > 3 && palabra.endsWith('S')
          ? palabra.slice(0, -1)
          : palabra,
      )
      .join(' ');
  }

  private impedimentosParaAprobar(matriz: MatrizRiesgoDocument): string[] {
    const motivos: string[] = [];
    const todos = matriz.actividades.flatMap((a) => a.riesgos);

    if (todos.length === 0) {
      motivos.push('La matriz no tiene ningún riesgo.');
    }

    const vacias = matriz.actividades.filter((a) => a.riesgos.length === 0);
    if (vacias.length) {
      motivos.push(
        `${vacias.length} actividad(es) sin ningún riesgo: ` +
          vacias
            .slice(0, 3)
            .map((a) => `"${a.actividadTarea}"`)
            .join(', ') +
          '.',
      );
    }

    // Actividades que son la misma escrita distinto —el caso real fue
    // "Trabajo en Taller" contra "Trabajos en Taller"—. Se detecta comparando
    // sin tildes, mayúsculas ni plurales, y se bloquea la aprobación: dejarlas
    // pasar parte la actividad en dos en el PGR y en todo reporte posterior.
    const porNombre = new Map<string, string[]>();
    for (const a of matriz.actividades) {
      const clave =
        normalizarNombre(a.areaProcesoAlcance) +
        '||' +
        this.sinPlural(a.actividadTarea);
      const lista = porNombre.get(clave) ?? [];
      lista.push(a.actividadTarea);
      porNombre.set(clave, lista);
    }
    for (const nombres of porNombre.values()) {
      const distintos = [...new Set(nombres)];
      if (distintos.length > 1) {
        motivos.push(
          `Hay actividades que parecen la misma escrita distinto: ` +
            distintos.map((n) => `"${n}"`).join(' vs ') +
            `. Unificalas antes de aprobar.`,
        );
      }
    }

    const sinEvaluar = todos.filter((r) => !r.nivelActual);
    if (sinEvaluar.length) {
      motivos.push(
        `${sinEvaluar.length} riesgo(s) sin evaluar: ${sinEvaluar
          .slice(0, 5)
          .map((r) => `N°${r.numero}`)
          .join(', ')}.`,
      );
    }

    // Un riesgo inaceptable sin ningún control declarado no está gestionado:
    // aprobarlo sería dejar constancia formal de que nadie hace nada.
    const inaceptablesSinControl = todos.filter(
      (r) => r.nivelActual === 'INACEPTABLE' && r.controles.length === 0,
    );
    if (inaceptablesSinControl.length) {
      motivos.push(
        `${inaceptablesSinControl.length} riesgo(s) INACEPTABLE sin ningún control: ` +
          inaceptablesSinControl.map((r) => `N°${r.numero}`).join(', ') +
          '.',
      );
    }

    const sinVerificador = todos.filter((r) =>
      r.controles.some((c) => !c.verificador),
    );
    if (sinVerificador.length) {
      motivos.push(
        `${sinVerificador.length} riesgo(s) tienen controles sin verificador: ` +
          `no serían medibles desde el PGR.`,
      );
    }

    return motivos;
  }

  /** BORRADOR → EN_REVISION. */
  async enviarARevision(
    id: string,
    usuario: string,
    observaciones?: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarParaEditar(id);

    if (matriz.estado !== EstadoMatriz.BORRADOR) {
      throw new ConflictException(
        `Solo se puede enviar a revisión una matriz en borrador (esta está en ${matriz.estado}).`,
      );
    }
    if (matriz.actividades.flatMap((a) => a.riesgos).length === 0) {
      throw new BadRequestException(
        'No se puede enviar a revisión una matriz sin riesgos.',
      );
    }

    this.registrarCambio(
      matriz,
      EstadoMatriz.EN_REVISION,
      usuario,
      observaciones,
    );
    await matriz.save();
    this.logger.log(`${matriz.codigo} enviada a revisión por ${usuario}`);
    return matriz.toObject<MatrizRiesgo>();
  }

  /**
   * EN_REVISION → APROBADA.
   *
   * Aprobar es lo que habilita la consolidación al PGR, así que aquí viven las
   * reglas duras: separación elaborador/aprobador y validación del contenido.
   * Al aprobar, la versión anterior de la misma área y año pasa a SUPERADA —
   * solo puede haber una matriz vigente.
   */
  async aprobar(
    id: string,
    usuario: string,
    esAdmin: boolean,
    observaciones?: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarParaEditar(id);

    if (matriz.estado === EstadoMatriz.APROBADA) {
      throw new ConflictException('La matriz ya está aprobada.');
    }
    if (matriz.estado !== EstadoMatriz.EN_REVISION) {
      throw new ConflictException(
        `Solo se puede aprobar una matriz en revisión (esta está en ${matriz.estado}).`,
      );
    }

    // El propio formulario separa "Elaborado por" de "Revisado y Aprobado
    // por": quien la armó no puede darse el visto bueno a sí mismo.
    const elaborador = this.elaborador(matriz);
    if (!esAdmin && elaborador && elaborador === usuario) {
      throw new BadRequestException(
        'No podés aprobar una matriz que vos mismo elaboraste. ' +
          'Tiene que revisarla otra persona.',
      );
    }

    const impedimentos = this.impedimentosParaAprobar(matriz);
    if (impedimentos.length) {
      throw new BadRequestException(impedimentos.join(' '));
    }

    // Solo una matriz vigente por área y año.
    const superadas = await this.matrizModel.updateMany(
      {
        _id: { $ne: matriz._id },
        areaCodigo: matriz.areaCodigo,
        anio: matriz.anio,
        estado: EstadoMatriz.APROBADA,
        activo: true,
      },
      { $set: { estado: EstadoMatriz.SUPERADA } },
    );

    this.registrarCambio(matriz, EstadoMatriz.APROBADA, usuario, observaciones);
    matriz.revisadoAprobadoPor = usuario;
    matriz.fechaAprobacion = new Date();
    await matriz.save();

    this.logger.log(
      `${matriz.codigo} aprobada por ${usuario}` +
        (superadas.modifiedCount
          ? ` (${superadas.modifiedCount} versión(es) anterior(es) marcadas como SUPERADA)`
          : ''),
    );
    return matriz.toObject<MatrizRiesgo>();
  }

  /** EN_REVISION → BORRADOR, para que se corrija. */
  async devolverACorregir(
    id: string,
    usuario: string,
    motivo?: string,
  ): Promise<MatrizRiesgo> {
    const matriz = await this.cargarParaEditar(id);

    if (matriz.estado !== EstadoMatriz.EN_REVISION) {
      throw new ConflictException(
        `Solo se puede devolver una matriz en revisión (esta está en ${matriz.estado}).`,
      );
    }

    this.registrarCambio(matriz, EstadoMatriz.BORRADOR, usuario, motivo);
    await matriz.save();
    this.logger.log(`${matriz.codigo} devuelta a borrador por ${usuario}`);
    return matriz.toObject<MatrizRiesgo>();
  }

  /**
   * Qué se puede hacer con la matriz ahora mismo. Lo calcula el servidor para
   * que la UI no reimplemente las reglas —y no se desincronice con ellas—.
   */
  async accionesDisponibles(
    id: string,
    usuario: string,
    esAdmin: boolean,
    puedeAprobar: boolean,
  ): Promise<{
    puedeEnviarARevision: boolean;
    puedeAprobar: boolean;
    puedeDevolver: boolean;
    impedimentosParaAprobar: string[];
  }> {
    const matriz = await this.cargarParaEditar(id);
    const elaborador = this.elaborador(matriz);
    const esElElaborador = !!elaborador && elaborador === usuario;

    const impedimentos = this.impedimentosParaAprobar(matriz);
    if (!esAdmin && esElElaborador) {
      impedimentos.push(
        'No podés aprobar una matriz que vos mismo elaboraste.',
      );
    }

    return {
      puedeEnviarARevision:
        matriz.estado === EstadoMatriz.BORRADOR &&
        matriz.actividades.flatMap((a) => a.riesgos).length > 0,
      puedeAprobar:
        matriz.estado === EstadoMatriz.EN_REVISION &&
        puedeAprobar &&
        impedimentos.length === 0,
      puedeDevolver: matriz.estado === EstadoMatriz.EN_REVISION && puedeAprobar,
      impedimentosParaAprobar: impedimentos,
    };
  }
}
