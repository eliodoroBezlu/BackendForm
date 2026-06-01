import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Trabajador } from './schema/trabajador.schema';
import { User } from '../auth/schemas/user.schema';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { CreateTrabajadorWithUserDto } from './dto/create-trabajador-with-user.dto';
import { CreateUserForWorkerDto } from './dto/create-user-for-worker.dto';
import {
  UpdateUserPasswordDto,
  UpdateUserRolesDto,
  DisableUserDto,
} from './dto/user-management.dto';

@Injectable()
export class TrabajadoresService {
  constructor(
    @InjectModel(Trabajador.name) private trabajadorModel: Model<Trabajador>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // ==================== CRUD BÁSICO ====================

  async create(createDto: CreateTrabajadorDto): Promise<Trabajador> {
    const trabajador = new this.trabajadorModel(createDto);
    return trabajador.save();
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

  async update(id: string, updateDto: any): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel
      .findByIdAndUpdate(id, updateDto, { new: true, runValidators: true })
      .exec();

    if (!trabajador) {
      throw new NotFoundException(`Trabajador ${id} no encontrado`);
    }

    return trabajador;
  }

  async remove(id: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel.findByIdAndDelete(id).exec();

    if (!trabajador) {
      throw new NotFoundException(`Trabajador ${id} no encontrado`);
    }

    // ⚠️ Si el trabajador tenía un usuario MongoDB legacy, desactivarlo
    if (trabajador.userId) {
      await this.userModel.findByIdAndUpdate(trabajador.userId, {
        isActive: false,
      }).catch(() => {/* ignorar si userId ya no existe en MongoDB */});
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

    return this.trabajadorModel
      .find({
        $or: [
          { nomina: { $regex: query, $options: 'i' } },
          { ci: { $regex: query, $options: 'i' } },
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
    const trabajador = await this.trabajadorModel
      .findOne({ username })
      .exec();

    if (!trabajador) {
      throw new NotFoundException(
        `Trabajador con username "${username}" no encontrado`,
      );
    }

    return trabajador;
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
