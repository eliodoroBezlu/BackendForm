import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Trabajador } from './schema/trabajador.schema';
import { User } from '../auth/schemas/user.schema'; // ← TU AUTH
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { CreateTrabajadorWithUserDto } from './dto/create-trabajador-with-user.dto';
import { CreateUserForWorkerDto } from './dto/create-user-for-worker.dto';
import { UpdateUserPasswordDto, UpdateUserRolesDto, DisableUserDto } from './dto/user-management.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TrabajadoresService {
  constructor(
    @InjectModel(Trabajador.name) private trabajadorModel: Model<Trabajador>,
    @InjectModel(User.name) private userModel: Model<User>, // ← TU AUTH
  ) {}

  // ==================== CRUD BÁSICO ====================

  async create(createDto: CreateTrabajadorDto): Promise<Trabajador> {
    const trabajador = new this.trabajadorModel(createDto);
    return trabajador.save();
  }

  async findAll(): Promise<Trabajador[]> {
    return this.trabajadorModel.find().populate('userId', 'username email roles').exec();
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
    
    // ⚠️ IMPORTANTE: Desactivar usuario asociado (no eliminarlo)
    if (trabajador.userId) {
      await this.userModel.findByIdAndUpdate(trabajador.userId, {
        isActive: false,
      });
    }
    
    return trabajador;
  }

  // ==================== BÚSQUEDA ====================

  async findAllNames(): Promise<string[]> {
    const trabajadores = await this.trabajadorModel.find().select('nomina').exec();
    return trabajadores.map(t => t.nomina);
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
    return trabajadores.map(t => t.nomina);
  }

  async findAllCompletos() {
    const trabajadores = await this.trabajadorModel
      .find()
      .select('nomina ci puesto')
      .sort({ nomina: 1 })
      .lean()
      .exec();
    
    return trabajadores.map(t => ({
      nomina: t.nomina || '',
      ci: t.ci || '',
      puesto: t.puesto || '',
    }));
  }

  // ==================== CREAR TRABAJADOR CON USUARIO ====================

  async createWithUser(
    createDto: CreateTrabajadorWithUserDto,
    requestingUser: any,
  ) {
    // Verificar permisos
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden crear usuarios');
    }

    let trabajador: Trabajador | null = null;
    let user: User | null = null;

    try {
      // 1. Verificar que username no exista
      const existingUser = await this.userModel.findOne({ username: createDto.username });
      if (existingUser) {
        throw new ConflictException(`El username '${createDto.username}' ya está en uso`);
      }

      // 2. Crear trabajador primero
      const trabajadorData: CreateTrabajadorDto = {
        ci: createDto.ci,
        nomina: createDto.nomina,
        puesto: createDto.puesto,
        fecha_ingreso: createDto.fecha_ingreso,
        superintendencia: createDto.superintendencia,
      };

      trabajador = await this.create(trabajadorData);

      // 3. Crear usuario en tu sistema de auth
      const hashedPassword = await bcrypt.hash(createDto.password, 10);

      user = await this.userModel.create({
        username: createDto.username,
        email: createDto.email || `${createDto.username}@temp.local`,
        password: hashedPassword,
        fullName: createDto.fullName || createDto.nomina,
        roles: createDto.roles || ['user'],
        isActive: true,
        isTwoFactorEnabled: false,
      });

      // 4. Vincular trabajador con usuario
      trabajador = await this.trabajadorModel.findByIdAndUpdate(
        trabajador._id,
        {
          userId: user._id,
          username: user.username,
          tiene_acceso_sistema: true,
          creado_por_usuario: requestingUser.username,
        },
        { new: true }
      );

      return {
        success: true,
        message: 'Trabajador y usuario creados exitosamente',
        trabajador,
        usuario: {
          username: user.username,
          email: user.email,
          roles: user.roles,
          temporary_password: createDto.temporary_password ?? true,
        },
      };

    } catch (error) {
      // Rollback si algo falla
      if (trabajador) {
        await this.trabajadorModel.findByIdAndDelete(trabajador._id);
      }
      if (user) {
        await this.userModel.findByIdAndDelete(user._id);
      }

      throw error;
    }
  }

  // ==================== CREAR USUARIO PARA TRABAJADOR EXISTENTE ====================

  async createUserForExistingWorker(
    trabajadorId: string,
    createUserDto: CreateUserForWorkerDto,
    requestingUser: any,
  ) {
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden crear usuarios');
    }

    try {
      const trabajador = await this.trabajadorModel.findById(trabajadorId);
      if (!trabajador) {
        throw new NotFoundException(`Trabajador ${trabajadorId} no encontrado`);
      }

      if (trabajador.userId && trabajador.tiene_acceso_sistema) {
        throw new ConflictException('Este trabajador ya tiene usuario activo');
      }

      // Verificar username único
      const existingUser = await this.userModel.findOne({ username: createUserDto.username });
      if (existingUser) {
        throw new ConflictException(`Username '${createUserDto.username}' ya está en uso`);
      }

      // Crear usuario
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

      const user = await this.userModel.create({
        username: createUserDto.username,
        email: createUserDto.email || `${createUserDto.username}@temp.local`,
        password: hashedPassword,
        fullName: createUserDto.fullName || trabajador.nomina,
        roles: createUserDto.roles || ['user'],
        isActive: true,
      });

      // Vincular
      const trabajadorActualizado = await this.trabajadorModel.findByIdAndUpdate(
        trabajadorId,
        {
          userId: user._id,
          username: user.username,
          tiene_acceso_sistema: true,
        },
        { new: true }
      );

      return {
        success: true,
        message: 'Usuario creado y vinculado exitosamente',
        trabajador: trabajadorActualizado,
        usuario: {
          username: user.username,
          email: user.email,
          roles: user.roles,
        },
      };

    } catch (error) {
      throw error;
    }
  }

  // ==================== GESTIÓN DE USUARIOS ====================

  async updateWorkerUserPassword(
    trabajadorId: string,
    updateDto: UpdateUserPasswordDto,
    requestingUser: any,
  ) {
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador?.userId) {
      throw new NotFoundException('Trabajador sin usuario asociado');
    }

    const hashedPassword = await bcrypt.hash(updateDto.new_password, 10);

    await this.userModel.findByIdAndUpdate(trabajador.userId, {
      password: hashedPassword,
    });

    return {
      success: true,
      message: 'Contraseña actualizada',
    };
  }

  async updateWorkerUserRoles(
    trabajadorId: string,
    updateDto: UpdateUserRolesDto,
    requestingUser: any,
  ) {
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador?.userId) {
      throw new NotFoundException('Trabajador sin usuario asociado');
    }

    await this.userModel.findByIdAndUpdate(trabajador.userId, {
      roles: updateDto.roles,
    });

    return {
      success: true,
      message: 'Roles actualizados',
      roles: updateDto.roles,
    };
  }

  async disableWorkerUser(
    trabajadorId: string,
    disableDto: DisableUserDto,
    requestingUser: any,
  ) {
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador?.userId) {
      throw new NotFoundException('Trabajador sin usuario asociado');
    }

    await this.userModel.findByIdAndUpdate(trabajador.userId, {
      isActive: false,
    });

    await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
      user_disabled: true,
      user_disabled_reason: disableDto.reason,
      user_disabled_by: requestingUser.username,
      user_disabled_at: new Date(),
    });

    return {
      success: true,
      message: 'Usuario desactivado',
    };
  }

  async enableWorkerUser(trabajadorId: string, requestingUser: any) {
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador?.userId) {
      throw new NotFoundException('Trabajador sin usuario asociado');
    }

    await this.userModel.findByIdAndUpdate(trabajador.userId, {
      isActive: true,
    });

    await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
      user_disabled: false,
      $unset: {
        user_disabled_reason: 1,
        user_disabled_by: 1,
        user_disabled_at: 1,
      },
    });

    return {
      success: true,
      message: 'Usuario activado',
    };
  }

  async unlinkWorkerUser(
    trabajadorId: string,
    reason: string,
    requestingUser: any,
  ) {
    const isAdmin = requestingUser?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador?.userId) {
      throw new NotFoundException('Trabajador sin usuario asociado');
    }

    // Desactivar usuario (no eliminar)
    await this.userModel.findByIdAndUpdate(trabajador.userId, {
      isActive: false,
    });

    // Desvincular
    await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
      userId: null,
      username: null,
      tiene_acceso_sistema: false,
      user_unlinked: true,
      user_unlinked_reason: reason,
      user_unlinked_by: requestingUser.username,
      user_unlinked_at: new Date(),
    });

    return {
      success: true,
      message: 'Usuario desvinculado',
    };
  }

  async getWorkerUserInfo(trabajadorId: string) {
    const trabajador = await this.trabajadorModel
      .findById(trabajadorId)
      .populate('userId', 'username email roles isTwoFactorEnabled isActive createdAt')
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