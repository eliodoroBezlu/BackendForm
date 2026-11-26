import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sharpNs from 'sharp';
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Equipo } from '../equipos/schemas/equipo.schema';
import { ConfigFormularioService } from '../config-formulario/config-formulario.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';
import { ModeloEnMemoria } from './__pruebas__/modelo-en-memoria';
import { AntecedentesMonitoreoService } from './antecedentes-monitoreo.service';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { BombasService } from './bombas.service';
import { CorrelativosMonitoreoService } from './correlativos-monitoreo.service';
import { UsoDeImagen } from './domain/archivos';
import { EstadoReporte } from './domain/reporte';
import { CrearReporteMonitoreoDto } from './dto/reporte-monitoreo.dto';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import { MonitoreoEquiposController } from './monitoreo-equipos.controller';
import { PlantillasMonitoreoService } from './plantillas-monitoreo.service';
import { PlantillasMedicionService } from './plantillas-medicion.service';
import { PlantillasMedicionController } from './plantillas-medicion.controller';
import { PlantillaMedicion } from './schemas/plantilla-medicion.schema';
import { ESTRUCTURA_250SA225 } from './__pruebas__/medicion-250sa225';
import { valoresVacios } from './domain/espesores';
import { ReportesMonitoreoController } from './reportes-monitoreo.controller';
import { ReportesMonitoreoService } from './reportes-monitoreo.service';
import { CatalogoMonitoreo } from './schemas/catalogo-monitoreo.schema';
import { ComponenteEquipo } from './schemas/componente-equipo.schema';
import { CorrelativoMonitoreo } from './schemas/correlativo-monitoreo.schema';
import { IntervencionEquipo } from './schemas/intervencion-equipo.schema';
import { PlantillaMonitoreo } from './schemas/plantilla-monitoreo.schema';
import { ReporteMonitoreo } from './schemas/reporte-monitoreo.schema';
import { Trabajador } from '../trabajadores/schemas/trabajador.schema';
import { ReportePdfService } from './reporte-pdf.service';
import * as generador from './pdf/reporte-pdf';

const sharp = sharpNs as unknown as typeof sharpNs.default;
const dia = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d));

const ANALISTA = 'santos.ventura';
const REVISOR = 'wilmers.cruz';

/** COTEM137, tal como se llenó el 06-oct-26. */
const COTEM137: CrearReporteMonitoreoDto = {
  tag: '230PP013',
  fecha: '2026-10-06',
  tecnica: 'termografia mecanica', // como lo escribiría cualquiera
  ot: '952013',
  alcance:
    'Realizar seguimiento elementos de desgaste nuevos de la bomba 230PP013.',
  lecturas: { horas: 2044, instrumento: 'EPOCH-XT', emisividad: 0.95 },
  analisis:
    'Disco succión: según termografía no se observa anomalía, temp. máx. 20,7 °C.',
  recomendaciones: [
    'Realizar nueva medición por ultrasonido y termografía según plan',
  ],
  tecnica_apoyo: 'TERMOGRAFIA MECANICA',
  resultado: 'normal',
  tareas: [
    {
      descripcion: 'Nueva medición',
      grupo_trabajo: 'WG-Monitoreo Mecanico',
      ot: 'Según plan',
      prioridad: 'Normal',
      comunicado_con: 'Wilmers Cruz',
      semana: 'Según plan',
    },
  ],
};

describe('ReportesMonitoreoService', () => {
  let modulo: TestingModule;
  let reportes: ReportesMonitoreoService;
  let correlativos: CorrelativosMonitoreoService;
  let catalogos: MonitoreoCatalogosService;
  let archivos: ArchivosMonitoreoService;
  let modelos: Record<string, ModeloEnMemoria>;
  let carpeta: string;

  beforeEach(async () => {
    modelos = {
      equipo: new ModeloEnMemoria(),
      componente: new ModeloEnMemoria(),
      intervencion: new ModeloEnMemoria(),
      catalogo: new ModeloEnMemoria(),
      reporte: new ModeloEnMemoria([['codigo_interno']]),
      correlativo: new ModeloEnMemoria([['tecnica_codigo', 'anio']]),
      plantilla: new ModeloEnMemoria(),
      plantillaMedicion: new ModeloEnMemoria([['tag', 'tecnica_normalizada']]),
      trabajador: new ModeloEnMemoria(),
    };
    modulo = await Test.createTestingModule({
      providers: [
        ReportesMonitoreoService,
        AntecedentesMonitoreoService,
        ArchivosMonitoreoService,
        BombasService,
        CorrelativosMonitoreoService,
        MonitoreoCatalogosService,
        PlantillasMonitoreoService,
        PlantillasMedicionService,
        ReportePdfService,
        {
          provide: getModelToken(Trabajador.name),
          useValue: modelos.trabajador,
        },
        { provide: getModelToken(Equipo.name), useValue: modelos.equipo },
        {
          provide: getModelToken(ComponenteEquipo.name),
          useValue: modelos.componente,
        },
        {
          provide: getModelToken(IntervencionEquipo.name),
          useValue: modelos.intervencion,
        },
        {
          provide: getModelToken(CatalogoMonitoreo.name),
          useValue: modelos.catalogo,
        },
        {
          provide: getModelToken(ReporteMonitoreo.name),
          useValue: modelos.reporte,
        },
        {
          provide: getModelToken(CorrelativoMonitoreo.name),
          useValue: modelos.correlativo,
        },
        {
          provide: getModelToken(PlantillaMonitoreo.name),
          useValue: modelos.plantilla,
        },
        {
          provide: getModelToken(PlantillaMedicion.name),
          useValue: modelos.plantillaMedicion,
        },
        {
          provide: ConfigFormularioService,
          useValue: { create: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    reportes = modulo.get(ReportesMonitoreoService);
    correlativos = modulo.get(CorrelativosMonitoreoService);
    catalogos = modulo.get(MonitoreoCatalogosService);
    archivos = modulo.get(ArchivosMonitoreoService);
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'monitoreo-'));
    archivos.carpeta = carpeta;

    await catalogos.sembrar();
    const bomba = await modelos.equipo.create({
      codigo: '230PP013',
      tipo_equipo: 'Bomba',
      marca: 'Warman',
      modelo: 'WARMAN ASH 550 MMC',
      especificaciones: {
        'Frecuencia (días)': 28,
        Alcance: 'Realizar monitoreo a los elementos de desgaste de la bomba.',
      },
    });
    for (const pieza of [
      'Voluta',
      'Impulsor',
      'Disco prensa',
      'Disco succión',
    ]) {
      await modelos.componente.create({
        equipo_id: bomba._id,
        tag: '230PP013',
        pieza,
        vigente: true,
        fecha_instalacion: dia(2026, 6, 28),
      });
    }
    await modelos.intervencion.create({
      equipo_id: bomba._id,
      tag: '230PP013',
      fecha: dia(2026, 6, 28),
      tipo: 'Cambio de piezas',
      piezas: ['Voluta'],
    });
  });

  afterEach(() => fs.rmSync(carpeta, { recursive: true, force: true }));

  const emitido = async (dto = COTEM137) => {
    const r = await reportes.crear(dto, ANALISTA);
    await reportes.enviar(String(r._id), ANALISTA);
    return reportes.emitir(String(r._id), REVISOR);
  };

  describe('el recorrido de COTEM137', () => {
    it('se crea, se envía y se emite con su código', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      expect(r).toMatchObject({
        estado: EstadoReporte.BORRADOR,
        fotos_por_fila: 3,
      });

      const enviado = await reportes.enviar(String(r._id), ANALISTA);
      expect(enviado.estado).toBe(EstadoReporte.PENDIENTE_REVISION);

      const final = await reportes.emitir(String(r._id), REVISOR);
      expect(final).toMatchObject({
        estado: EstadoReporte.EMITIDO,
        codigo_interno: 'COTEM-0001',
        revisadoPor: REVISOR,
        elaboradoPor: ANALISTA,
      });
      expect(final.historial.map((h) => h.accion)).toEqual([
        'creado',
        'enviado',
        'emitido',
      ]);
    });

    it('los valores de lista quedan escritos como en el catálogo', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      expect(r).toMatchObject({
        tecnica: 'TERMOGRAFIA MECANICA',
        resultado: 'NORMAL',
      });
    });

    it('los antecedentes salen de la ficha, las piezas y la última intervención', async () => {
      const { antecedentes } = await reportes.crear(COTEM137, ANALISTA);
      expect(antecedentes.ficha).toMatchObject({
        alcance: 'Realizar monitoreo a los elementos de desgaste de la bomba.',
        modelo: 'WARMAN ASH 550 MMC',
      });
      expect(antecedentes.componentes).toHaveLength(4);
      expect(antecedentes.componentes[0].horas_trabajo).toBe(2044);
      expect(antecedentes.ultima_intervencion?.fecha).toEqual(dia(2026, 6, 28));
      expect(antecedentes).not.toHaveProperty('horas_restantes');
      expect(antecedentes.informe_anterior).toBeUndefined();
    });

    it('las piezas que completa el analista se guardan y mandan en los antecedentes', async () => {
      const r = await reportes.crear(
        {
          ...COTEM137,
          piezas: [
            { pieza: 'Voluta', proveedor: 'weir vulco', horas_trabajo: 2601 },
            { pieza: 'Impulsor', material: 'Alto cromo' },
          ],
        },
        ANALISTA,
      );
      expect(r.piezas).toEqual([
        { pieza: 'Voluta', proveedor: 'Weir Vulco', horas_trabajo: 2601 },
        { pieza: 'Impulsor', material: 'Alto cromo' },
      ]);
      const [voluta, impulsor] = r.antecedentes.componentes;
      expect(voluta).toMatchObject({
        proveedor: 'Weir Vulco',
        horas_trabajo: 2601,
      });
      expect(impulsor).toMatchObject({
        material: 'Alto cromo',
        horas_trabajo: 2044,
      });
    });

    it('guarda el enlace al informe anterior y acepta anexos', async () => {
      const r = await reportes.crear(
        {
          ...COTEM137,
          informe_anterior_url: ' https://sharepoint/cotem136.pdf ',
        },
        ANALISTA,
      );
      expect(r.informe_anterior_url).toBe('https://sharepoint/cotem136.pdf');
      // El modelo en memoria no aplica los valores por defecto del esquema.
      expect(r.anexos ?? []).toEqual([]);
    });

    it('el reporte siguiente de la bomba nombra al anterior emitido', async () => {
      const primero = await emitido();
      const segundo = await reportes.crear(
        { ...COTEM137, fecha: '2026-11-03' },
        ANALISTA,
      );
      expect(segundo.antecedentes.informe_anterior).toMatchObject({
        id: String(primero._id),
        codigo_interno: 'COTEM-0001',
      });
    });
  });

  describe('correlativo', () => {
    it('sigue la numeración del Excel una vez fijada', async () => {
      await correlativos.fijar('COTEM', 2026, 137);
      expect((await emitido()).codigo_interno).toBe('COTEM-0138');
    });

    it('se reinicia con el año', async () => {
      await correlativos.fijar('COTEM', 2026, 137);
      expect(
        (await emitido({ ...COTEM137, fecha: '2027-01-17' })).codigo_interno,
      ).toBe('COTEM-0001');
    });

    it('no se puede bajar: repetiría códigos ya emitidos', async () => {
      await correlativos.fijar('COTEM', 2026, 137);
      await expect(correlativos.fijar('COTEM', 2026, 100)).rejects.toThrow(
        ConflictException,
      );
    });

    it('una técnica sin código no se puede emitir', async () => {
      const r = await reportes.crear(
        { ...COTEM137, tecnica: 'INSPECCIÓN VISUAL GRAL.' },
        ANALISTA,
      );
      await reportes.enviar(String(r._id), ANALISTA);
      await expect(reportes.emitir(String(r._id), REVISOR)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('las piezas del reporte pasan a la ficha al emitir', () => {
    const vigente = (pieza: string) =>
      modelos.componente.docs.find((c) => c.pieza === pieza && c.vigente);

    it('al emitir, lo que completó el analista queda en la ficha de la bomba', async () => {
      await emitido({
        ...COTEM137,
        piezas: [
          { pieza: 'Voluta', proveedor: 'ALTONA', condicion_inicial: 'Nuevo' },
          { pieza: 'Impulsor' },
        ],
      });
      expect(vigente('Voluta')).toMatchObject({
        proveedor: 'ALTONA',
        condicion_inicial: 'Nuevo',
      });
      // Lo vacío no borra nada.
      expect(vigente('Impulsor')?.proveedor).toBeUndefined();
    });

    it('otra fecha de instalación retira la pieza anterior y monta una nueva', async () => {
      await emitido({
        ...COTEM137,
        piezas: [
          {
            pieza: 'Voluta',
            fecha_instalacion: '2026-09-30',
            proveedor: 'ALTONA',
          },
        ],
      });
      const volutas = modelos.componente.docs.filter(
        (c) => c.pieza === 'Voluta',
      );
      expect(volutas).toHaveLength(2);
      expect(volutas.find((c) => !c.vigente)).toMatchObject({
        retirado_en: dia(2026, 9, 30),
      });
      expect(vigente('Voluta')).toMatchObject({
        fecha_instalacion: dia(2026, 9, 30),
        proveedor: 'ALTONA',
        registradoPor: `COTEM-0001 · ${ANALISTA}`,
      });
    });

    it('un borrador o un reporte en revisión no tocan la ficha', async () => {
      const r = await reportes.crear(
        { ...COTEM137, piezas: [{ pieza: 'Voluta', proveedor: 'ALTONA' }] },
        ANALISTA,
      );
      await reportes.enviar(String(r._id), ANALISTA);
      expect(vigente('Voluta')?.proveedor).toBeUndefined();
    });

    it('emitir tarde un reporte de fecha anterior no pisa lo de uno más nuevo', async () => {
      await emitido({
        ...COTEM137,
        fecha: '2026-11-03',
        piezas: [{ pieza: 'Voluta', proveedor: 'ALTONA' }],
      });
      await emitido({
        ...COTEM137,
        piezas: [{ pieza: 'Voluta', proveedor: 'Weir Vulco' }],
      });
      expect(vigente('Voluta')?.proveedor).toBe('ALTONA');
    });
  });

  describe('reglas', () => {
    it('no se envía incompleto, y dice qué falta', async () => {
      const r = await reportes.crear(
        { tag: '230PP013', fecha: '2026-10-06' },
        ANALISTA,
      );
      const error = await reportes
        .enviar(String(r._id), ANALISTA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: expect.arrayContaining([
          'Falta: el alcance',
          'Falta: la emisividad',
        ]) as string[],
      });
    });

    it('rechaza un valor que no está en la lista', async () => {
      await expect(
        reportes.crear({ ...COTEM137, resultado: 'Más o menos' }, ANALISTA),
      ).rejects.toThrow(BadRequestException);
    });

    it('un valor que el borrador ya tenía se acepta aunque se haya dado de baja', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      const epoch = (await catalogos.listar()).find(
        (e) => e.valor === 'EPOCH-XT',
      );
      await catalogos.darDeBaja(String(epoch?._id), 'admin');

      await expect(
        reportes.actualizar(
          String(r._id),
          { lecturas: { horas: 2050, instrumento: 'EPOCH-XT' } },
          ANALISTA,
        ),
      ).resolves.toMatchObject({ lecturas: { instrumento: 'EPOCH-XT' } });
      // Un borrador nuevo ya no puede elegirlo.
      await expect(reportes.crear(COTEM137, ANALISTA)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('solo quien lo elaboró modifica el borrador', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      await expect(
        reportes.actualizar(String(r._id), { alcance: 'otro' }, REVISOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('nadie revisa su propio reporte', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      await reportes.enviar(String(r._id), ANALISTA);
      await expect(reportes.emitir(String(r._id), ANALISTA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('enviado ya no se edita; devuelto vuelve a borrador con el motivo', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      await reportes.enviar(String(r._id), ANALISTA);
      await expect(
        reportes.actualizar(String(r._id), { alcance: 'otro' }, ANALISTA),
      ).rejects.toThrow(ConflictException);

      const devuelto = await reportes.devolver(
        String(r._id),
        'Falta la foto de referencia',
        REVISOR,
      );
      expect(devuelto.estado).toBe(EstadoReporte.BORRADOR);
      expect(devuelto.historial.at(-1)).toMatchObject({
        accion: 'devuelto',
        motivo: 'Falta la foto de referencia',
      });
      await expect(
        reportes.actualizar(String(r._id), { alcance: 'otro' }, ANALISTA),
      ).resolves.toMatchObject({ alcance: 'otro' });
    });

    it('los antecedentes se congelan al enviar', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      await reportes.enviar(String(r._id), ANALISTA);
      modelos.componente.docs[0].proveedor = 'Cambiado después';

      const leido = await reportes.obtener(String(r._id));
      expect(leido.antecedentes.componentes[0].proveedor).toBeUndefined();
    });

    it('un PATCH sin un campo no lo borra', async () => {
      const r = await reportes.crear(COTEM137, ANALISTA);
      const despues = await reportes.actualizar(
        String(r._id),
        { ot: '952014' },
        ANALISTA,
      );
      expect(despues).toMatchObject({
        tecnica: 'TERMOGRAFIA MECANICA',
        ot: '952014',
      });
    });
  });

  describe('situación e historial de las bombas', () => {
    const HOY = dia(2026, 10, 15);

    it('sin reportes emitidos la bomba queda sin datos', async () => {
      await reportes.crear(COTEM137, ANALISTA); // un borrador no cuenta
      const [bomba] = await modulo.get(BombasService).listar(HOY);
      expect(bomba.situacion.alerta).toBe('sin_datos');
    });

    it('con COTEM137 emitido: próximo monitoreo a 28 días', async () => {
      await emitido();
      const [bomba] = await modulo.get(BombasService).listar(HOY);
      expect(bomba.situacion).toMatchObject({
        ultimo_reporte: { codigo_interno: 'COTEM-0001', resultado: 'NORMAL' },
        proximo_monitoreo: dia(2026, 11, 3),
        dias_para_monitoreo: 19,
        alerta: 'al_dia',
      });
    });

    it('la ficha trae todos los reportes de la bomba, de cualquier estado', async () => {
      await emitido();
      await reportes.crear({ ...COTEM137, fecha: '2026-11-03' }, ANALISTA);
      const ficha = await modulo.get(BombasService).ficha('230pp013', HOY);
      expect(ficha.reportes.map((r) => r.estado)).toEqual([
        EstadoReporte.BORRADOR,
        EstadoReporte.EMITIDO,
      ]);
      // La situación se toma del último emitido, no del borrador.
      expect(ficha.situacion.ultimo_reporte?.codigo_interno).toBe('COTEM-0001');
    });
  });

  describe('PDF', () => {
    it('lleva los nombres del padrón, el color del resultado y las fotos del disco', async () => {
      const pdfs = modulo.get(ReportePdfService);
      await modelos.trabajador.create({
        username: ANALISTA,
        nomina: 'Santos Ventura',
      });
      await modelos.trabajador.create({
        username: REVISOR,
        nomina: 'Wilmers Cruz',
        activo: false, // ya no está: el reporte sigue llevando su nombre
      });
      const foto = await archivos.guardar(
        await sharp({
          create: { width: 348, height: 464, channels: 3, background: '#c00' },
        })
          .jpeg()
          .toBuffer(),
        'image/jpeg',
        UsoDeImagen.FOTO,
      );
      const r = await emitido({
        ...COTEM137,
        fotos: [{ ...foto, descripcion: 'Disco succión' }],
      });
      const espia = jest.spyOn(generador, 'generarPdfReporte');

      const { pdf, nombre } = await pdfs.generar(String(r._id));

      expect(nombre).toBe('COTEM001 230PP013 06OCT26.pdf');
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const datos = espia.mock.calls[0][0];
      expect(datos).toMatchObject({
        elaboradoPor: 'Santos Ventura',
        revisadoPor: 'Wilmers Cruz',
        colorResultado: '#92D050',
      });
      expect(datos.fotos[0]).toMatchObject({
        descripcion: 'Disco succión',
        ancho: 348,
        alto: 464,
      });
      expect(datos.fotos[0].contenido?.length).toBeGreaterThan(0);
      espia.mockRestore();
    });

    it('sin vínculo en el padrón queda el usuario', async () => {
      const pdfs = modulo.get(ReportePdfService);
      const r = await reportes.crear(COTEM137, ANALISTA);
      const espia = jest.spyOn(generador, 'generarPdfReporte');
      const { nombre } = await pdfs.generar(String(r._id));
      expect(espia.mock.calls[0][0].elaboradoPor).toBe(ANALISTA);
      expect(nombre).toBe('BORRADOR 230PP013 06OCT26.pdf');
      espia.mockRestore();
    });
  });

  describe('imágenes', () => {
    const imagen = (ancho: number, alto: number, formato: 'jpeg' | 'png') =>
      sharp({
        create: { width: ancho, height: alto, channels: 3, background: '#c00' },
      })
        [formato]()
        .toBuffer();

    it('reduce una foto grande sin recortarla y la guarda fuera de uploads', async () => {
      const g = await archivos.guardar(
        await imagen(4000, 3000, 'jpeg'),
        'image/jpeg',
        UsoDeImagen.FOTO,
      );
      expect(g).toMatchObject({ ancho: 1600, alto: 1200 });
      expect(g.archivo).toMatch(/\.jpg$/);
      expect(fs.existsSync(path.join(carpeta, g.archivo))).toBe(true);
    });

    it('no agranda una termografía chica y deja el PNG en PNG', async () => {
      const g = await archivos.guardar(
        await imagen(464, 348, 'png'),
        'image/png',
        UsoDeImagen.GRAFICO,
      );
      expect(g).toMatchObject({ ancho: 464, alto: 348 });
      expect(g.archivo).toMatch(/\.png$/);
    });

    it('un reporte no puede apuntar a una imagen que no se subió', async () => {
      await expect(
        reportes.crear(
          {
            ...COTEM137,
            fotos: [{ archivo: '00000000-0000-4000-8000-000000000000.jpg' }],
          },
          ANALISTA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('el gráfico se pone y se quita con null', async () => {
      const g = await archivos.guardar(
        await imagen(2600, 850, 'png'),
        'image/png',
        UsoDeImagen.GRAFICO,
      );
      const r = await reportes.crear(
        { ...COTEM137, grafico: { archivo: g.archivo } },
        ANALISTA,
      );
      expect(r.grafico).toMatchObject({ archivo: g.archivo });
      const sin = await reportes.actualizar(
        String(r._id),
        { grafico: null },
        ANALISTA,
      );
      expect(sin.grafico).toBeNull();
    });

    it('un nombre con ruta no llega al disco', async () => {
      await expect(archivos.ruta('../.env')).rejects.toThrow(NotFoundException);
    });

    it('un archivo que no es imagen se rechaza', async () => {
      await expect(
        archivos.guardar(Buffer.from('hola'), 'image/jpeg', UsoDeImagen.FOTO),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('medición de espesores (ultrasonido de 250SA225)', () => {
    /** COULT-0482: el muestreador no es una bomba ni está en el inventario. */
    const COULT482: CrearReporteMonitoreoDto = {
      tag: '250sa225',
      fecha: '2026-11-12',
      tecnica: 'ultrasonido activo',
      alcance: '10S Identificación áreas con desgaste',
      antecedentes_texto:
        'En parada de planta septiembre 2026 se cambió la válvula dardo LV250033.',
      lecturas: {
        instrumento: 'EPOCH-XT',
        velocidad_ms: 5920,
        frecuencia_mhz: 7.5,
      },
      analisis: 'Pieza 3 con espesor de 5,39 mm de 6,5 mm nominal.',
      resultado: 'NORMAL',
    };

    const conPlantilla = async () => {
      const plantillas = modulo.get(PlantillasMedicionService);
      const diagrama = await archivos.guardar(
        await sharp({
          create: { width: 320, height: 300, channels: 3, background: '#36c' },
        })
          .png()
          .toBuffer(),
        'image/png',
        UsoDeImagen.FOTO,
      );
      return plantillas.crear(
        {
          tag: '250sa225',
          tecnica: 'Ultrasonido activo',
          titulo: ESTRUCTURA_250SA225.titulo,
          piezas: ESTRUCTURA_250SA225.piezas,
          diagramas: [{ ...diagrama, descripcion: 'Muestreador, piezas 1–6' }],
        },
        ANALISTA,
      );
    };

    /** Todo en 6 mm salvo un valor bajo en la pieza 3, Lado Sur. */
    const medidos = () => {
      const v = valoresVacios(ESTRUCTURA_250SA225).map((zonas) =>
        zonas.map((filas) => filas.map((fila) => fila.map(() => 6))),
      );
      v[6][1][2][0] = 5.39;
      return v;
    };

    it('la plantilla guarda el tag en mayúsculas y la técnica como en su lista', async () => {
      const p = await conPlantilla();
      expect(p).toMatchObject({
        tag: '250SA225',
        tecnica: 'ULTRASONIDO ACTIVO',
        tecnica_normalizada: 'ULTRASONIDO ACTIVO',
      });
      expect(p.piezas).toHaveLength(ESTRUCTURA_250SA225.piezas.length);
    });

    it('no hay dos plantillas para el mismo tag y técnica, ni técnicas fuera de la lista', async () => {
      await conPlantilla();
      await expect(conPlantilla()).rejects.toThrow(ConflictException);
      await expect(
        modulo.get(PlantillasMedicionService).crear(
          {
            tag: 'X1',
            tecnica: 'RAYOS X',
            titulo: 'T',
            piezas: [{ nombre: '1', zonas: [{ anillos: 1, puntos: 1 }] }],
          },
          ANALISTA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('el reporte nace con la grilla y los diagramas, sin ser una bomba', async () => {
      await conPlantilla();
      const r = await reportes.crear(COULT482, ANALISTA);
      expect(r).toMatchObject({
        tag: '250SA225',
        tecnica: 'ULTRASONIDO ACTIVO',
        tipo_equipo: 'Sin inventario',
        antecedentes_texto: COULT482.antecedentes_texto,
        lecturas: { velocidad_ms: 5920, frecuencia_mhz: 7.5 },
      });
      expect(r.equipo_id).toBeUndefined();
      expect(r.piezas).toBeUndefined();
      expect(r.medicion?.estructura.piezas).toHaveLength(10);
      expect(r.medicion?.diagramas[0].descripcion).toBe(
        'Muestreador, piezas 1–6',
      );
      expect(r.medicion?.valores).toEqual(valoresVacios(ESTRUCTURA_250SA225));
      expect(r.antecedentes.ficha).toEqual({});
    });

    it('sin plantilla, un tag que no es bomba no se reporta', async () => {
      await expect(reportes.crear(COULT482, ANALISTA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('para enviar pide las mediciones, no la emisividad', async () => {
      await conPlantilla();
      const r = await reportes.crear(COULT482, ANALISTA);
      const error = await reportes
        .enviar(String(r._id), ANALISTA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: ['Falta: las mediciones de espesores'],
      });
    });

    it('valores con otra forma se rechazan; los buenos se guardan', async () => {
      await conPlantilla();
      const r = await reportes.crear(COULT482, ANALISTA);
      await expect(
        reportes.actualizar(
          String(r._id),
          { medicion_valores: [[[[6]]]] },
          ANALISTA,
        ),
      ).rejects.toThrow(BadRequestException);
      const ok = await reportes.actualizar(
        String(r._id),
        { medicion_valores: medidos() },
        ANALISTA,
      );
      expect(ok.medicion?.valores[6][1][2][0]).toBe(5.39);
    });

    it('un reporte de bomba sin plantilla no acepta mediciones', async () => {
      await expect(
        reportes.crear({ ...COTEM137, medicion_valores: [] }, ANALISTA),
      ).rejects.toThrow(BadRequestException);
    });

    it('el reporte siguiente trae los mínimos de la medición anterior', async () => {
      await conPlantilla();
      const primero = await emitido({
        ...COULT482,
        medicion_valores: medidos(),
      });
      expect(primero.codigo_interno).toBe('COULT-0001');

      const siguiente = await reportes.crear(
        { ...COULT482, fecha: '2026-12-10' },
        ANALISTA,
      );
      const anterior = siguiente.antecedentes.medicion_anterior;
      expect(anterior).toMatchObject({ codigo_interno: 'COULT-0001' });
      expect(anterior?.minimos).toContainEqual({
        pieza: '3',
        zona: 'Lado Sur',
        minimo: 5.39,
      });
    });

    it('el PDF lleva la medición y sus diagramas', async () => {
      await conPlantilla();
      const r = await reportes.crear(
        { ...COULT482, medicion_valores: medidos() },
        ANALISTA,
      );
      const espia = jest.spyOn(generador, 'generarPdfReporte');
      const { pdf } = await modulo
        .get(ReportePdfService)
        .generar(String(r._id));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const datos = espia.mock.calls[0][0];
      expect(datos.reporte.medicion?.estructura.titulo).toBe(
        ESTRUCTURA_250SA225.titulo,
      );
      expect(datos.diagramas?.[0].contenido?.length).toBeGreaterThan(0);
      espia.mockRestore();
    });
  });
});

describe('acceso al módulo', () => {
  const guard = new RolesGuard(new Reflector());
  const contexto = (clase: object, metodo: string, roles: string[]) =>
    ({
      getClass: () => clase,
      getHandler: () =>
        (clase as { prototype: Record<string, unknown> }).prototype[metodo],
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as unknown as ExecutionContext;

  const rutas = (clase: { prototype: object }) =>
    Object.getOwnPropertyNames(clase.prototype).filter(
      (m) => m !== 'constructor',
    );

  it.each([
    MonitoreoEquiposController,
    ReportesMonitoreoController,
    PlantillasMedicionController,
  ])(
    'en %p, ni admin ni super_admin entran sin el rol; con él, sí',
    (clase) => {
      for (const metodo of rutas(clase)) {
        expect(
          guard.canActivate(
            contexto(clase, metodo, [Role.ADMIN, Role.SUPER_ADMIN]),
          ),
        ).toBe(false);
        expect(
          guard.canActivate(
            contexto(clase, metodo, [Role.MONITOREO_CONFIABILIDAD]),
          ),
        ).toBe(true);
      }
    },
  );
});
