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
  lecturas: { horas: 2044, instrumento: 'EPOCH-XT' },
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
        'TMEF (hrs)': 2900,
        'Frecuencia (días)': 28,
        'Servicio / proceso': 'Transfiere pulpa',
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
        tmef_hrs: 2900,
        modelo: 'WARMAN ASH 550 MMC',
      });
      expect(antecedentes.componentes).toHaveLength(4);
      expect(antecedentes.componentes[0].horas_trabajo).toBe(2044);
      expect(antecedentes.ultima_intervencion?.fecha).toEqual(dia(2026, 6, 28));
      expect(antecedentes.horas_restantes).toBe(856);
      expect(antecedentes.informe_anterior).toBeUndefined();
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
        message: expect.arrayContaining(['Falta: el alcance']) as string[],
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

    it('con COTEM137 emitido: próximo monitoreo a 28 días y fecha tentativa por TMEF', async () => {
      await emitido();
      const [bomba] = await modulo.get(BombasService).listar(HOY);
      expect(bomba.situacion).toMatchObject({
        ultimo_reporte: { codigo_interno: 'COTEM-0001', resultado: 'NORMAL' },
        proximo_monitoreo: dia(2026, 11, 3),
        dias_para_monitoreo: 19,
        dias_para_intervencion: 26,
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

  it.each([MonitoreoEquiposController, ReportesMonitoreoController])(
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
