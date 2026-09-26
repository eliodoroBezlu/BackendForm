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
    ci: string;
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
  ci: string;
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
  onModuleInit(): void {
    this.logger.log(
      'Sync con IAM no se ejecuta al arrancar. Usar POST /trabajadores/sync.',
    );
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
   * emparejando por `ci`. Preserva siempre los campos propios de BackendForm
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
        const existente = await this.trabajadorModel.findOne({ ci: t.ci });

        if (existente) {
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
            ci: t.ci,
            nomina: t.nomina,
            puesto: t.puesto,
            fecha_ingreso: t.fechaIngreso
              ? new Date(t.fechaIngreso)
              : new Date(),
            superintendencia: t.superintendencia,
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
          `No se pudo sincronizar el trabajador ci=${t.ci}: ${error instanceof Error ? error.message : 'error desconocido'}`,
        );
        fallos.push(t.ci);
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
   * en el Trabajador que coincide por `ci` (clave estable en ambos lados),
   * o lo crea si no existe localmente. Nunca toca los campos propios de
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
        const existente = await this.trabajadorModel.findOne({ ci: t.ci });

        if (existente) {
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
            ci: t.ci,
            nomina: t.nomina,
            puesto: t.puesto,
            fecha_ingreso: new Date(),
            superintendencia: t.superintendencia,
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
          `No se pudo sincronizar el rol '${role}' para ci=${t.ci}: ${error instanceof Error ? error.message : 'error desconocido'}`,
        );
        fallos.push(t.ci);
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
