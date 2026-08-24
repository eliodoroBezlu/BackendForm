import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MatrizRiesgosService } from './matriz-riesgos.service';
import { MatrizRiesgosEdicionService } from './matriz-riesgos-edicion.service';
import { CrearMatrizDto } from './dto/crear-matriz.dto';
import { RiesgoDto } from './dto/riesgo.dto';
import { ActividadDto } from './dto/actividad.dto';
import { PrevisualizarRiesgoDto } from './dto/previsualizar-riesgo.dto';
import {
  ImportarMatrizDto,
  ListarMatricesDto,
} from './dto/importar-matriz.dto';
import {
  CambiarEstadoMatrizDto,
  DevolverMatrizDto,
} from './dto/cambiar-estado.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';

const EXTENSIONES = /\.xlsx?$/i;

/**
 * Los roles llegan del JWT como `string[]`, así que se comparan contra listas
 * de strings y no contra el enum: mezclarlos daría una comparación siempre
 * falsa sin que nada avise.
 *
 * Se evalúa sobre los roles reales y no sobre la jerarquía, para que un rol
 * restringido no herede el permiso sin querer.
 */
const ROLES_ADMIN: readonly string[] = [Role.ADMIN, Role.SUPER_ADMIN];
const ROLES_APROBACION: readonly string[] = [
  Role.SUPERINTENDENTE,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

/** El admin puede saltarse la separación elaborador/aprobador; el resto no. */
const esAdmin = (roles?: string[]): boolean =>
  !!roles?.some((r) => ROLES_ADMIN.includes(r));

const puedeAprobar = (roles?: string[]): boolean =>
  !!roles?.some((r) => ROLES_APROBACION.includes(r));

@ApiTags('matriz-riesgos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('matriz-riesgos')
export class MatrizRiesgosController {
  constructor(
    private readonly service: MatrizRiesgosService,
    private readonly edicion: MatrizRiesgosEdicionService,
  ) {}

  private validarArchivo(file?: Express.Multer.File): Express.Multer.File {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    if (!EXTENSIONES.test(file.originalname)) {
      throw new BadRequestException(
        `"${file.originalname}" no es un Excel (.xlsx / .xls).`,
      );
    }
    return file;
  }

  /**
   * Paso 1 de la importación: analiza sin escribir nada.
   *
   * Devuelve los riesgos recalculados y las discrepancias contra el archivo,
   * que es lo que la pantalla muestra antes de pedir confirmación. Importar a
   * ciegas convertiría el Excel en la verdad; así, cada importación verifica
   * de paso que el motor reproduce la metodología.
   */
  @Post('import/analizar')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Previsualiza un Excel de matriz sin guardarlo' })
  async analizar(@UploadedFile() file: Express.Multer.File) {
    const archivo = this.validarArchivo(file);
    return this.service.analizarArchivo(archivo.buffer, archivo.originalname);
  }

  /**
   * Paso 2: confirma y guarda.
   *
   * Vuelve a recibir el archivo a propósito: el servidor lo relee y recalcula.
   * Si aceptara los riesgos ya parseados del cliente, se podrían inyectar
   * niveles de riesgo arbitrarios.
   */
  @Post('import')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Importa la matriz y la crea en BORRADOR' })
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportarMatrizDto,
    @CurrentUser('username') usuario: string,
  ) {
    const archivo = this.validarArchivo(file);
    return this.service.importar(
      archivo.buffer,
      archivo.originalname,
      dto,
      usuario ?? 'desconocido',
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista matrices (sin los riesgos)' })
  async listar(@Query() filtros: ListarMatricesDto) {
    return this.service.findAll(filtros);
  }

  // ── Alta y edición sin Excel ──────────────────────────────────────────
  //
  // Se declaran antes de `@Get(':id')` para que rutas fijas como
  // `areas-disponibles` no queden capturadas como si fueran un id.

  @Get('areas-disponibles')
  @ApiOperation({ summary: 'Áreas del maestro que pueden tener matriz' })
  async areasDisponibles() {
    return this.edicion.areasDisponibles();
  }

  @Post('previsualizar-riesgo')
  @ApiOperation({
    summary: 'Evalúa un riesgo sin guardarlo (vista previa del formulario)',
  })
  previsualizarRiesgo(@Body() dto: PrevisualizarRiesgoDto) {
    return this.edicion.previsualizar(dto);
  }

  @Get('catalogos/:categoria')
  @ApiOperation({
    summary: 'Opciones del formulario para una categoría de riesgo',
  })
  async catalogos(@Param('categoria') categoria: string) {
    return this.edicion.opcionesDeCategoria(categoria);
  }

  @Post()
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Crea una matriz en blanco para un área' })
  async crear(
    @Body() dto: CrearMatrizDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.crear(dto, usuario ?? 'desconocido');
  }

  // Los riesgos cuelgan de una actividad, así que la ruta la refleja: la
  // actividad es la dueña del encabezado (área, tarea, condición, categoría).

  @Post(':id/actividades')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Agrega una actividad (sin riesgos todavía)' })
  async agregarActividad(
    @Param('id') id: string,
    @Body() dto: ActividadDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.agregarActividad(id, dto, usuario ?? 'desconocido');
  }

  @Put(':id/actividades/:nroAct')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Edita el encabezado de la actividad sin tocar sus riesgos',
  })
  async actualizarActividad(
    @Param('id') id: string,
    @Param('nroAct', ParseIntPipe) nroAct: number,
    @Body() dto: ActividadDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.actualizarActividad(
      id,
      nroAct,
      dto,
      usuario ?? 'desconocido',
    );
  }

  @Delete(':id/actividades/:nroAct')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Elimina la actividad con todos sus riesgos' })
  async eliminarActividad(
    @Param('id') id: string,
    @Param('nroAct', ParseIntPipe) nroAct: number,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.eliminarActividad(id, nroAct, usuario ?? 'desconocido');
  }

  @Post(':id/actividades/:nroAct/riesgos')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Agrega un riesgo con sus controles' })
  async agregarRiesgo(
    @Param('id') id: string,
    @Param('nroAct', ParseIntPipe) nroAct: number,
    @Body() dto: RiesgoDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.agregarRiesgo(
      id,
      nroAct,
      dto,
      usuario ?? 'desconocido',
    );
  }

  @Put(':id/actividades/:nroAct/riesgos/:numero')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Reemplaza un riesgo entero (riesgo + controles) y lo reevalúa',
  })
  async actualizarRiesgo(
    @Param('id') id: string,
    @Param('nroAct', ParseIntPipe) nroAct: number,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: RiesgoDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.actualizarRiesgo(
      id,
      nroAct,
      numero,
      dto,
      usuario ?? 'desconocido',
    );
  }

  @Delete(':id/actividades/:nroAct/riesgos/:numero')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Elimina un riesgo y renumera los siguientes' })
  async eliminarRiesgo(
    @Param('id') id: string,
    @Param('nroAct', ParseIntPipe) nroAct: number,
    @Param('numero', ParseIntPipe) numero: number,
    @CurrentUser('username') usuario: string,
  ) {
    return this.edicion.eliminarRiesgo(
      id,
      nroAct,
      numero,
      usuario ?? 'desconocido',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle completo de una matriz' })
  async detalle(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * Qué acciones habilita el estado actual y los roles de quien pregunta.
   *
   * Lo resuelve el servidor a propósito: si la UI decidiera por su cuenta qué
   * botones mostrar, tarde o temprano se desincronizaría de las reglas reales.
   */
  @Get(':id/acciones')
  @ApiOperation({ summary: 'Acciones disponibles sobre la matriz' })
  async acciones(
    @Param('id') id: string,
    @CurrentUser('username') usuario: string,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.accionesDisponibles(
      id,
      usuario,
      esAdmin(roles),
      puedeAprobar(roles),
    );
  }

  @Patch(':id/enviar-a-revision')
  @Roles(Role.SUPERVISOR, Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Pasa la matriz de BORRADOR a EN_REVISION' })
  async enviarARevision(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoMatrizDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.service.enviarARevision(id, usuario, dto.observaciones);
  }

  /**
   * Aprobar habilita la consolidación al PGR, así que queda reservado al
   * superintendente y al admin: el supervisor elabora, no se aprueba a sí mismo.
   */
  @Patch(':id/aprobar')
  @Roles(Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Aprueba la matriz y supera la versión anterior' })
  async aprobar(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoMatrizDto,
    @CurrentUser('username') usuario: string,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.aprobar(id, usuario, esAdmin(roles), dto.observaciones);
  }

  @Patch(':id/devolver')
  @Roles(Role.SUPERINTENDENTE, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Devuelve la matriz a BORRADOR para corregirla' })
  async devolver(
    @Param('id') id: string,
    @Body() dto: DevolverMatrizDto,
    @CurrentUser('username') usuario: string,
  ) {
    return this.service.devolverACorregir(id, usuario, dto.motivo);
  }
}
