import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trabajador } from './schemas/trabajador.schema';
import { User } from '../auth/schemas/user.schema';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { CreateTrabajadorWithUserDto } from './dto/create-trabajador-with-user.dto';
import { CreateUserForWorkerDto } from './dto/create-user-for-worker.dto';
import {
  UpdateUserPasswordDto,
  UpdateUserRolesDto,
  DisableUserDto,
} from './dto/user-management.dto';
import { escaparRegex } from '../../common/utils/escapar-regex.util';
import { marcarDadoDeBaja } from '../../common/baja-logica/baja-logica.plugin';

interface IamServiceUser {
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  globalRoles: string[];
  serviceRoles: string[];
  trabajador: {
    /** Id de la ficha en el IAM: clave del espejo. */
    id: string;
    // Puede venir null: el IAM admite personal sin CI (ej. contratistas de Sync)
    ci: string | null;
    nomina: string;
    puesto: string;
    area: string | null;
    areaCodigo: string | null;
    superintendencia: string;
    activo: boolean;
    tieneAccesoSistema: boolean;
  } | null;
}

interface IamTrabajadorEntry {
  /** Id de la ficha en el IAM: clave del espejo. */
  id: string;
  // Puede venir null: el IAM admite personal sin CI (ej. contratistas de Sync)
  ci: string | null;
  nomina: string;
  puesto: string;
  superintendencia: string;
  area: string | null;
  areaCodigo: string | null;
  jde: string | null;
  disciplina: string | null;
  esContratista: boolean;
  celular: string | null;
  residencia: string | null;
  noBloque: string | null;
  noHabitacion: string | null;
  fechaIngreso: string | null;
  tieneAccesoSistema: boolean;
  activo: boolean;
  username: string | null;
}

@Injectable()
export class TrabajadoresService implements OnModuleInit {
  private readonly logger = new Logger(TrabajadoresService.name);

  constructor(
    @InjectModel(Trabajador.name) private trabajadorModel: Model<Trabajador>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * El arranque **no** sincroniza contra el IAM.
   *
   * Traía el roster completo y los roles en cada arranque —en Railway, cada
   * despliegue y cada reinicio—. Además de escribir sin que nadie lo pidiera,
   * dejaba el arranque colgando de que el IAM respondiera: era best-effort,
   * pero igualmente esperaba a que fallase.
   *
   * La sincronización sigue disponible, ahora cuando alguien la decide:
   *
   *     POST /trabajadores/sync?role=supervisor      (solo admin)
   *
   * Ese endpoint hace las dos cosas que hacía el arranque: el roster y los
   * roles del servicio.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log(
      'Sync con IAM no se ejecuta al arrancar. Usar POST /trabajadores/sync.',
    );
    await this.migrarIndiceCi();
  }

  /**
   * El índice viejo `ci_1` era único para TODOS los documentos: dos fichas sin
   * CI chocaban (ambas valen null). Se reemplaza por los índices parciales del
   * esquema. Idempotente y local (no toca el IAM).
   */
  private async migrarIndiceCi(): Promise<void> {
    try {
      const coleccion = this.trabajadorModel.collection;
      const indices = await coleccion.indexes();
      if (indices.some((i) => i.name === 'ci_1')) {
        await coleccion.dropIndex('ci_1');
        this.logger.log('Índice ci_1 reemplazado por ci_unico_si_existe');
      }
      await this.trabajadorModel.createIndexes();
    } catch (error) {
      this.logger.warn(
        `No se pudieron migrar los índices de trabajadores: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }

  /**
   * El espejo local de una ficha del IAM: por su id y, si aún no lo tiene
   * (documentos anteriores), por CI. Incluye los dados de baja: la ficha pudo
   * desactivarse y volver a activarse en el IAM.
   */
  private async buscarEspejo(t: { id: string; ci: string | null }) {
    const porId = await this.trabajadorModel
      .findOne({ iam_trabajador_id: t.id })
      .setOptions({ incluirDadosDeBaja: true });
    if (porId || !t.ci) return porId;
    return this.trabajadorModel
      .findOne({
        ci: t.ci,
        $or: [
          { iam_trabajador_id: { $exists: false } },
          { iam_trabajador_id: null },
        ],
      })
      .setOptions({ incluirDadosDeBaja: true });
  }

  /**
   * Copia el CI del IAM al espejo, salvo que otro documento ya lo use (dato a
   * corregir en el IAM). Un CI vacío en el IAM no borra el local.
   */
  private async ciParaEspejo(
    t: { id: string; ci: string | null },
    actual?: string,
  ): Promise<string | undefined> {
    if (!t.ci || t.ci === actual) return actual;
    const otro = await this.trabajadorModel
      .exists({ ci: t.ci, iam_trabajador_id: { $ne: t.id } })
      .setOptions({ incluirDadosDeBaja: true });
    if (otro) {
      this.logger.warn(
        `El CI ${t.ci} de la ficha ${t.id} ya lo tiene otro trabajador en forms: no se copia`,
      );
      return actual;
    }
    return t.ci;
  }

  // ==================== CRUD BÁSICO ====================
  // ── Creación y edición del perfil delegadas al IAM Core ──────────────
  // El roster local (nomina, puesto, área, superintendencia, etc.) es un
  // espejo de solo lectura, refrescado por `syncTrabajadoresFromIam`.
  // Crear o editar trabajadores se hace en el IAM Portal.

  async create(_createDto: CreateTrabajadorDto): Promise<Trabajador> {
    throw new BadRequestException(
      'La creación de trabajadores está centralizada en IAM Core. ' +
        'Accede al IAM Portal (Admin → Trabajadores) para crear trabajadores; ' +
        'BackendForm los refleja automáticamente por sincronización.',
    );
  }

  async findAll(): Promise<Trabajador[]> {
    return this.trabajadorModel
      .find()
      .populate('userId', 'username email roles')
      .exec();
  }

  async findOne(id: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel
      .findById(id)
      .populate('userId', 'username email roles isTwoFactorEnabled')
      .exec();

    if (!trabajador) {
      throw new NotFoundException(`Trabajador ${id} no encontrado`);
    }

    return trabajador;
  }

  async update(_id: string, _updateDto: any): Promise<Trabajador> {
    throw new BadRequestException(
      'La edición del perfil de trabajadores está centralizada en IAM Core. ' +
        'Accede al IAM Portal (Admin → Trabajadores) para editar; ' +
        'BackendForm los refleja automáticamente por sincronización.',
    );
  }

  async remove(id: string, usuario: string): Promise<Trabajador> {
    // Una persona que deja la empresa no deja de figurar en las
    // inspecciones que firmo ni en las entregas que recibio.
    const trabajador = await this.trabajadorModel
      .findByIdAndUpdate(id, marcarDadoDeBaja(usuario), { new: true })
      .exec();

    if (!trabajador) {
      throw new NotFoundException(`Trabajador ${id} no encontrado`);
    }

    // ⚠️ Si el trabajador tenía un usuario MongoDB legacy, desactivarlo
    if (trabajador.userId) {
      await this.userModel
        .findByIdAndUpdate(trabajador.userId, {
          isActive: false,
        })
        .catch(() => {
          /* ignorar si userId ya no existe en MongoDB */
        });
    }

    return trabajador;
  }

  // ==================== BÚSQUEDA ====================

  async findAllNames(): Promise<string[]> {
    const trabajadores = await this.trabajadorModel
      .find()
      .select('nomina')
      .exec();
    return trabajadores.map((t) => t.nomina);
  }

  async buscarTrabajadores(query: string): Promise<Trabajador[]> {
    if (!query?.trim()) {
      return this.trabajadorModel.find().limit(10).exec();
    }

    // El texto se escapa antes de entrar al $regex: sin eso se interpreta como
    // patron y un simple «(» hace que Mongo devuelva un error.
    const termino = escaparRegex(query.trim());

    return this.trabajadorModel
      .find({
        $or: [
          { nomina: { $regex: termino, $options: 'i' } },
          { ci: { $regex: termino, $options: 'i' } },
        ],
      })
      .limit(10)
      .exec();
  }

  async buscarTrabajadoresNames(query: string): Promise<string[]> {
    const trabajadores = await this.buscarTrabajadores(query);
    return trabajadores.map((t) => t.nomina);
  }

  async findAllCompletos() {
    const trabajadores = await this.trabajadorModel
      .find()
      .select('nomina ci puesto')
      .sort({ nomina: 1 })
      .lean()
      .exec();

    return trabajadores.map((t) => ({
      nomina: t.nomina || '',
      ci: t.ci || '',
      puesto: t.puesto || '',
    }));
  }

  async findByUsername(username: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel.findOne({ username }).exec();

    if (!trabajador) {
      throw new NotFoundException(
        `Trabajador con username "${username}" no encontrado`,
      );
    }

    return trabajador;
  }

  // ==================== SINCRONIZACIÓN CON IAM CORE ====================

  /**
   * Trae del IAM Core (fuente de verdad) el roster COMPLETO de trabajadores
   * activos — tengan o no usuario/acceso al sistema — y lo espeja en Mongo,
   * emparejando por el id de la ficha del IAM (y, para documentos anteriores,
   * por `ci`). Preserva siempre los campos propios de BackendForm
   * (`creado_por_usuario`, `user_disabled*`, `user_unlinked*`, `userId` del
   * sistema legacy de auth local, `roles_iam` — ese lo mantiene aparte
   * `syncRolFromIam`).
   */
  async syncTrabajadoresFromIam(): Promise<{
    actualizados: number;
    creados: number;
    error?: string;
  }> {
    const base = (
      this.configService.get<string>('IAM_CORE_URL') || 'http://localhost:4000'
    ).replace(/\/+$/, '');
    const apiKey = this.configService.get<string>('IAM_CORE_API_KEY') || '';

    let trabajadoresIam: IamTrabajadorEntry[];
    try {
      const response = await fetch(
        `${base}/api/rbac/trabajadores?activo=true`,
        {
          headers: { 'X-Api-Key': apiKey },
          cache: 'no-store',
        },
      );
      if (!response.ok) {
        throw new Error(`IAM respondió con estado ${response.status}`);
      }
      const data = (await response.json()) as {
        trabajadores?: IamTrabajadorEntry[];
      };
      trabajadoresIam = data.trabajadores ?? [];
    } catch (error) {
      return {
        actualizados: 0,
        creados: 0,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }

    let actualizados = 0;
    let creados = 0;
    const fallos: string[] = [];

    for (const t of trabajadoresIam) {
      try {
        const existente = await this.buscarEspejo(t);

        if (existente) {
          existente.iam_trabajador_id = t.id;
          existente.ci = await this.ciParaEspejo(t, existente.ci);
          existente.nomina = t.nomina || existente.nomina;
          existente.puesto = t.puesto || existente.puesto;
          existente.superintendencia =
            t.superintendencia || existente.superintendencia;
          existente.area = t.area || existente.area || 'Sin área';
          existente.jde = t.jde || existente.jde;
          existente.no_bloque = t.noBloque || existente.no_bloque;
          existente.no_habitacion = t.noHabitacion || existente.no_habitacion;
          existente.residencia = t.residencia || existente.residencia;
          existente.celular = t.celular || existente.celular;
          if (t.fechaIngreso)
            existente.fecha_ingreso = new Date(t.fechaIngreso);
          if (t.username) existente.username = t.username;
          existente.tiene_acceso_sistema = t.tieneAccesoSistema;
          existente.activo = t.activo;
          await existente.save();
          actualizados++;
        } else {
          await new this.trabajadorModel({
            iam_trabajador_id: t.id,
            ci: await this.ciParaEspejo(t),
            nomina: t.nomina,
            puesto: t.puesto,
            fecha_ingreso: t.fechaIngreso
              ? new Date(t.fechaIngreso)
              : new Date(),
            superintendencia: t.superintendencia || 'Sin superintendencia',
            area: t.area || 'Sin área',
            jde: t.jde || undefined,
            no_bloque: t.noBloque || undefined,
            no_habitacion: t.noHabitacion || undefined,
            residencia: t.residencia || undefined,
            celular: t.celular || undefined,
            username: t.username || undefined,
            tiene_acceso_sistema: t.tieneAccesoSistema,
            activo: t.activo,
          }).save();
          creados++;
        }
      } catch (error) {
        // Un registro con datos incompletos/legado no debe abortar el resto
        // de la sincronización.
        this.logger.warn(
          `No se pudo sincronizar el trabajador ${t.nomina} (${t.id}): ${error instanceof Error ? error.message : 'error desconocido'}`,
        );
        fallos.push(t.nomina);
      }
    }

    if (fallos.length > 0) {
      this.logger.warn(
        `Sync de roster: ${fallos.length} trabajador(es) con error, omitidos: ${fallos.join(', ')}`,
      );
    }

    return { actualizados, creados };
  }

  /**
   * Trae del IAM Core (fuente de verdad) los usuarios que tienen `role` en
   * el servicio "forms" y refresca el roster local: actualiza `roles_iam`
   * en el Trabajador que coincide por el id de su ficha del IAM (o, en
   * documentos anteriores, por `ci`), o lo crea si no existe localmente. Nunca toca los campos propios de
   * BackendForm (`creado_por_usuario`, `user_disabled*`, `user_unlinked*`,
   * `userId` del sistema legacy de auth local).
   */
  async syncRolFromIam(
    role: string,
  ): Promise<{ actualizados: number; creados: number; error?: string }> {
    const base = (
      this.configService.get<string>('IAM_CORE_URL') || 'http://localhost:4000'
    ).replace(/\/+$/, '');
    const apiKey = this.configService.get<string>('IAM_CORE_API_KEY') || '';

    let usuarios: IamServiceUser[];
    try {
      const response = await fetch(
        `${base}/api/rbac/services/forms/users?role=${encodeURIComponent(role)}`,
        { headers: { 'X-Api-Key': apiKey }, cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error(`IAM respondió con estado ${response.status}`);
      }
      const data = (await response.json()) as { users?: IamServiceUser[] };
      usuarios = data.users ?? [];
    } catch (error) {
      return {
        actualizados: 0,
        creados: 0,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }

    let actualizados = 0;
    let creados = 0;
    const fallos: string[] = [];

    for (const iamUser of usuarios) {
      if (!iamUser.trabajador) continue; // sin ficha de Trabajador en IAM, nada que espejar

      const t = iamUser.trabajador;
      try {
        const existente = await this.buscarEspejo(t);

        if (existente) {
          existente.iam_trabajador_id = t.id;
          existente.ci = await this.ciParaEspejo(t, existente.ci);
          existente.nomina = t.nomina || existente.nomina;
          existente.puesto = t.puesto || existente.puesto;
          existente.superintendencia =
            t.superintendencia || existente.superintendencia;
          existente.area = t.area || existente.area || 'Sin área';
          existente.username = iamUser.username;
          existente.tiene_acceso_sistema = t.tieneAccesoSistema;
          existente.activo = t.activo;
          existente.roles_iam = Array.from(
            new Set([...(existente.roles_iam || []), role]),
          );
          await existente.save();
          actualizados++;
        } else {
          await new this.trabajadorModel({
            iam_trabajador_id: t.id,
            ci: await this.ciParaEspejo(t),
            nomina: t.nomina,
            puesto: t.puesto,
            fecha_ingreso: new Date(),
            superintendencia: t.superintendencia || 'Sin superintendencia',
            area: t.area || 'Sin área',
            username: iamUser.username,
            tiene_acceso_sistema: t.tieneAccesoSistema,
            activo: t.activo,
            roles_iam: [role],
          }).save();
          creados++;
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo sincronizar el rol '${role}' para ${t.nomina} (${t.id}): ${error instanceof Error ? error.message : 'error desconocido'}`,
        );
        fallos.push(t.nomina);
      }
    }

    if (fallos.length > 0) {
      this.logger.warn(
        `Sync de rol '${role}': ${fallos.length} trabajador(es) con error, omitidos: ${fallos.join(', ')}`,
      );
    }

    return { actualizados, creados };
  }

  // ==================== CREAR TRABAJADOR CON USUARIO ====================
  // ── Gestión de usuarios delegada a IAM Core ──────────────────────────
  // Los usuarios se crean y administran desde el IAM Portal.
  // Accede a: http://localhost:3005 → Admin → Trabajadores

  async createWithUser(
    _createDto: CreateTrabajadorWithUserDto,
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'La creación de usuarios está centralizada en IAM Core. ' +
        'Accede al IAM Portal (Admin → Trabajadores) para crear y vincular usuarios.',
    );
  }

  // ==================== CREAR USUARIO PARA TRABAJADOR EXISTENTE ====================

  async createUserForExistingWorker(
    _trabajadorId: string,
    _createUserDto: CreateUserForWorkerDto,
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'La creación de usuarios está centralizada en IAM Core. ' +
        'Accede al IAM Portal (Admin → Trabajadores) para vincular usuarios a trabajadores.',
    );
  }

  // ==================== GESTIÓN DE USUARIOS ====================

  async updateWorkerUserPassword(
    _trabajadorId: string,
    _updateDto: UpdateUserPasswordDto,
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'Gestión de contraseñas centralizada en IAM Portal (Admin → Usuarios → Reset password).',
    );
  }

  async updateWorkerUserRoles(
    _trabajadorId: string,
    _updateDto: UpdateUserRolesDto,
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'Gestión de roles centralizada en IAM Portal (Admin → Usuarios).',
    );
  }

  async updateWorkerUserPermissions(
    _trabajadorId: string,
    _updateDto: { permissions: string[] },
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'Gestión de permisos centralizada en IAM Portal (Admin → Usuarios).',
    );
  }

  async disableWorkerUser(
    _trabajadorId: string,
    _disableDto: DisableUserDto,
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'Desactivación de usuarios centralizada en IAM Portal (Admin → Usuarios → Desactivar).',
    );
  }

  async enableWorkerUser(_trabajadorId: string, _requestingUser: any) {
    throw new BadRequestException(
      'Activación de usuarios centralizada en IAM Portal (Admin → Usuarios → Activar).',
    );
  }

  async unlinkWorkerUser(
    _trabajadorId: string,
    _reason: string,
    _requestingUser: any,
  ) {
    throw new BadRequestException(
      'Desvinculación de usuarios centralizada en IAM Portal (Admin → Trabajadores → Desvincular).',
    );
  }

  async getWorkerUserInfo(trabajadorId: string) {
    const trabajador = await this.trabajadorModel
      .findById(trabajadorId)
      .populate(
        'userId',
        'username email roles isTwoFactorEnabled isActive createdAt permissions',
      )
      .exec();

    if (!trabajador?.userId) {
      throw new NotFoundException('Trabajador sin usuario asociado');
    }

    const user = trabajador.userId as unknown as User;

    return {
      trabajador_info: {
        id: trabajador._id,
        ci: trabajador.ci,
        nomina: trabajador.nomina,
        tiene_acceso_sistema: trabajador.tiene_acceso_sistema,
      },
      user_info: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions || [],
        enabled: user.isActive,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        createdAt: user.createdAt,
      },
      status: {
        user_disabled: trabajador.user_disabled || false,
        user_unlinked: trabajador.user_unlinked || false,
      },
    };
  }
}
