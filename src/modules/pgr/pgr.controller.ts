import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  BadRequestException,
  ConflictException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { PgrService } from './pgr.service';
import { PgrImportService } from './pgr-import.service';
import { PgrExcelService } from './pgr-excel.service';
import { PgrConsolidacionService } from './pgr-consolidacion.service';
import { ConsolidarPgrDto } from './dto/consolidar-pgr.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreatePgrDto } from './dto/create-pgr.dto';
import { UpdatePgrDto } from './dto/update-pgr.dto';
import { AprobarPgrDto } from './dto/aprobar-pgr.dto';
import { SeguimientoPgrDto } from './dto/seguimiento-pgr.dto';
import { SeguimientoBatchDto } from './dto/seguimiento-batch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pgr')
export class PgrController {
  constructor(
    private readonly pgrService: PgrService,
    private readonly pgrImportService: PgrImportService,
    private readonly pgrExcelService: PgrExcelService,
    private readonly consolidacion: PgrConsolidacionService,
  ) {}

  @Post()
  create(@Body() createPgrDto: CreatePgrDto) {
    return this.pgrService.create(createPgrDto);
  }

  /**
   * Previsualiza qué actividades saldrían de las matrices aprobadas de la
   * superintendencia de este PGR. No escribe nada.
   *
   * Cada propuesta viene con su `efecto` (nueva / acumula / sube-nivel) para
   * que quien consolida entienda qué va a cambiar en un PGR que quizá ya
   * estaba programado.
   *
   * El PGR se indica por id —y no por superintendencia y gestión— porque esa
   * pareja no identifica un único documento.
   */
  @Get(':id/consolidacion/previsualizar')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  previsualizarConsolidacion(
    @Param('id') id: string,
    @Query('desdoblarPorArea') desdoblar?: string,
  ) {
    return this.consolidacion.previsualizar(id, desdoblar === 'true');
  }

  /**
   * Consolida las matrices aprobadas en este PGR.
   * Es incremental: se puede repetir a medida que las áreas van aprobando.
   */
  @Post(':id/consolidacion')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  consolidar(
    @Param('id') id: string,
    @Body() dto: ConsolidarPgrDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.consolidacion.consolidar(
      id,
      usuario ?? 'desconocido',
      dto.desdoblarPorArea ?? false,
    );
  }

  /**
   * Importa un PGR desde la planilla oficial (1.02.P06.F29).
   *
   * Devuelve siempre un resumen (leídas / importadas / omitidas) en vez de un
   * OK mudo: un import que pierde filas en silencio es el peor resultado
   * posible con este formulario.
   *
   * Idempotencia: si ya existe un PGR con el mismo `codigoExterno`, se
   * rechaza con 409 salvo que se pase `?sobrescribir=true`.
   */
  @Post('import')
  @Roles(Role.ADMIN, Role.SUPERINTENDENTE)
  @UseInterceptors(FileInterceptor('file'))
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @Query('sobrescribir') sobrescribir?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

    const resumen = await this.pgrImportService.parsear(file.buffer);

    const existente = resumen.pgr.codigoExterno
      ? await this.pgrService.findByCodigoExterno(resumen.pgr.codigoExterno)
      : null;

    if (existente && sobrescribir !== 'true') {
      throw new ConflictException({
        message:
          `Ya existe un PGR importado desde el mismo documento ` +
          `(${resumen.pgr.codigoExterno}). Reenviá con ?sobrescribir=true para reemplazarlo.`,
        pgrExistenteId: existente._id,
        codigoAutogenerado: existente.codigoAutogenerado,
      });
    }

    const guardado = existente
      ? await this.pgrService.update(String(existente._id), resumen.pgr)
      : await this.pgrService.create(resumen.pgr);

    return {
      ...resumen,
      pgr: guardado,
      reemplazado: Boolean(existente),
    };
  }

  @Get()
  findAll() {
    return this.pgrService.findAll();
  }

  /**
   * Descarga el PGR en el formato de la planilla oficial (1.02.P06.F29).
   * Los indicadores se recalculan al generar: no se copian de ningún origen.
   */
  @Get(':id/excel')
  async downloadExcel(@Param('id') id: string, @Res() res: Response) {
    const pgr = await this.pgrService.findOne(id);
    const buffer = await this.pgrExcelService.generar(pgr);

    const limpiar = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-');
    const nombre = `PGR ${limpiar(pgr.superintendencia)} ${pgr.gestion}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String((buffer as Buffer).length),
    });
    res.end(Buffer.from(buffer as ArrayBuffer));
  }

  /**
   * Devuelve el PGR con sus indicadores de eficacia y eficiencia ya
   * calculados (periodo y total gestión, más los de cada actividad).
   * Se calculan al vuelo: no están persistidos.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pgrService.findOneConIndicadores(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updatePgrDto: UpdatePgrDto) {
    return this.pgrService.update(id, updatePgrDto);
  }

  @Patch(':id/aprobar')
  @Roles(Role.SUPERINTENDENTE, Role.ADMIN)
  aprobar(@Param('id') id: string, @Body() aprobarPgrDto: AprobarPgrDto) {
    return this.pgrService.aprobar(id, aprobarPgrDto);
  }

  @Patch(':id/seguimiento/tarea/:tareaId')
  addSeguimiento(
    @Param('id') id: string,
    @Param('tareaId') tareaId: string,
    @Body() seguimientoDto: SeguimientoPgrDto,
  ) {
    return this.pgrService.addSeguimiento(id, tareaId, seguimientoDto);
  }

  @Patch(':id/seguimiento/batch')
  addSeguimientoBatch(
    @Param('id') id: string,
    @Body() batchDto: SeguimientoBatchDto,
  ) {
    return this.pgrService.addSeguimientoBatch(id, batchDto.seguimientos);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.pgrService.remove(id);
  }
}
