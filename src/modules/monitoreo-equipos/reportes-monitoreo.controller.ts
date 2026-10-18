import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TIPO_EQUIPO_BOMBA } from './domain/bomba';
import { TAMANO_MAXIMO_IMAGEN, UsoDeImagen } from './domain/archivos';
import {
  ActualizarReporteMonitoreoDto,
  CrearReporteMonitoreoDto,
  DevolverReporteDto,
  FijarCorrelativoDto,
  FiltrosReportesDto,
  PlantillaMonitoreoDto,
} from './dto/reporte-monitoreo.dto';
import { ReportesMonitoreoService } from './reportes-monitoreo.service';
import { AntecedentesMonitoreoService } from './antecedentes-monitoreo.service';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { CorrelativosMonitoreoService } from './correlativos-monitoreo.service';
import { PlantillasMonitoreoService } from './plantillas-monitoreo.service';
import { ReportePdfService } from './reporte-pdf.service';

/**
 * Los reportes de monitoreo y lo que necesitan: imágenes, correlativos y la
 * plantilla. Mismo rol exclusivo que el resto del módulo.
 */
@Controller('monitoreo-equipos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MONITOREO_CONFIABILIDAD)
export class ReportesMonitoreoController {
  constructor(
    private readonly reportes: ReportesMonitoreoService,
    private readonly antecedentes: AntecedentesMonitoreoService,
    private readonly archivos: ArchivosMonitoreoService,
    private readonly correlativos: CorrelativosMonitoreoService,
    private readonly plantillas: PlantillasMonitoreoService,
    private readonly pdf: ReportePdfService,
  ) {}

  // ── Reportes ────────────────────────────────────────────────────────────

  @Get('reportes')
  listar(@Query() filtros: FiltrosReportesDto) {
    return this.reportes.listar(filtros);
  }

  /** Los antecedentes de una bomba para un reporte nuevo, sin guardar nada. */
  @Get('reportes/prellenado/:tag')
  prellenado(
    @Param('tag') tag: string,
    @Query('fecha') fecha?: string,
    @Query('horas') horas?: string,
  ) {
    const dia = fecha ? new Date(fecha) : new Date();
    const n = horas === undefined || horas === '' ? undefined : Number(horas);
    if (Number.isNaN(dia.getTime()) || (n !== undefined && Number.isNaN(n))) {
      throw new BadRequestException('Fecha u horas inválidas');
    }
    return this.antecedentes.armar(tag, dia, n);
  }

  /**
   * El PDF del formato 2.03.P01.R09. Se puede bajar en cualquier estado: sin
   * emitir lleva la marca BORRADOR o EN REVISIÓN en cada página.
   */
  @Get('reportes/:id/pdf')
  async descargarPdf(@Param('id') id: string, @Res() res: Response) {
    const { pdf, nombre } = await this.pdf.generar(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  }

  @Get('reportes/:id')
  obtener(@Param('id') id: string) {
    return this.reportes.obtener(id);
  }

  @Post('reportes')
  crear(
    @Body() dto: CrearReporteMonitoreoDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.reportes.crear(dto, usuario);
  }

  /**
   * Guarda el borrador. Lo que no se envía no se toca; `''` vacía un campo.
   * `lecturas`, `fotos`, `tareas` y `recomendaciones` se reemplazan enteros.
   */
  @Patch('reportes/:id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarReporteMonitoreoDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.reportes.actualizar(id, dto, usuario);
  }

  @Delete('reportes/:id')
  darDeBaja(@Param('id') id: string, @CurrentUser('username') usuario: string) {
    return this.reportes.darDeBaja(id, usuario);
  }

  @Post('reportes/:id/enviar')
  enviar(@Param('id') id: string, @CurrentUser('username') usuario: string) {
    return this.reportes.enviar(id, usuario);
  }

  @Post('reportes/:id/devolver')
  devolver(
    @Param('id') id: string,
    @Body() dto: DevolverReporteDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.reportes.devolver(id, dto.motivo, usuario);
  }

  @Post('reportes/:id/emitir')
  emitir(@Param('id') id: string, @CurrentUser('username') usuario: string) {
    return this.reportes.emitir(id, usuario);
  }

  // ── Imágenes ────────────────────────────────────────────────────────────

  @Post('archivos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: TAMANO_MAXIMO_IMAGEN } }),
  )
  subir(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('uso', new ParseEnumPipe(UsoDeImagen, { optional: true }))
    uso?: UsoDeImagen,
  ) {
    if (!file) throw new BadRequestException('Falta la imagen (campo «file»)');
    return this.archivos.guardar(
      file.buffer,
      file.mimetype,
      uso ?? UsoDeImagen.FOTO,
    );
  }

  @Get('archivos/:archivo')
  async descargar(@Param('archivo') archivo: string, @Res() res: Response) {
    const ruta = await this.archivos.ruta(archivo);
    // Privado: un proxy intermedio no debe guardar una copia.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(ruta);
  }

  // ── Correlativos y plantilla ────────────────────────────────────────────

  @Get('correlativos')
  listarCorrelativos() {
    return this.correlativos.listar();
  }

  /** Para continuar la numeración que se llevaba en el Excel. Solo sube. */
  @Put('correlativos')
  fijarCorrelativo(@Body() dto: FijarCorrelativoDto) {
    return this.correlativos.fijar(dto.tecnica_codigo, dto.anio, dto.ultimo);
  }

  @Get('plantillas/bomba')
  plantilla() {
    return this.plantillas.obtener(TIPO_EQUIPO_BOMBA);
  }

  @Put('plantillas/bomba')
  guardarPlantilla(@Body() dto: PlantillaMonitoreoDto) {
    return this.plantillas.guardar(TIPO_EQUIPO_BOMBA, dto.fotos_por_fila);
  }
}
