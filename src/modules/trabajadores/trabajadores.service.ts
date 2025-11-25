import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trabajador } from './schema/trabajador.schema';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { CreateTrabajadorWithUserDto } from './dto/create-trabajador-with-user.dto';
import { KeycloakAdminService } from './keycloack-admin-service.service';
import { DisableUserDto, UpdateUserPasswordDto, UpdateUserRolesDto } from './dto/user-management.dto';

@Injectable()
export class TrabajadoresService {
  constructor(
    @InjectModel(Trabajador.name) private trabajadorModel: Model<Trabajador>,
    private keycloakAdminService: KeycloakAdminService,
  ) {}

  // ==================== CRUD BÁSICO ====================

  // Crear trabajador básico (sin usuario)
  async create(createTrabajadorDto: CreateTrabajadorDto): Promise<Trabajador> {
    const createdTrabajador = new this.trabajadorModel(createTrabajadorDto);
    return createdTrabajador.save();
  }

  // Obtener todos los trabajadores
  async findAll(): Promise<Trabajador[]> {
    return this.trabajadorModel.find().exec();
  }

  // Obtener un trabajador por ID
  async findOne(id: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel.findById(id).exec();
    
    if (!trabajador) {
      throw new NotFoundException(`Trabajador con ID ${id} no encontrado`);
    }
    
    return trabajador;
  }

  // Actualizar trabajador
  async update(id: string, updateTrabajadorDto: any): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel
      .findByIdAndUpdate(id, updateTrabajadorDto, { 
        new: true,
        runValidators: true 
      })
      .exec();
    
    if (!trabajador) {
      throw new NotFoundException(`Trabajador con ID ${id} no encontrado`);
    }
    
    return trabajador;
  }

  // Eliminar trabajador
  async remove(id: string): Promise<Trabajador> {
    const trabajador = await this.trabajadorModel.findByIdAndDelete(id).exec();
    
    if (!trabajador) {
      throw new NotFoundException(`Trabajador con ID ${id} no encontrado`);
    }
    
    return trabajador;
  }

  // ==================== BÚSQUEDA Y AUTOCOMPLETE ====================

  // Obtener solo los nombres/identificadores de trabajadores (para autocomplete)
  async findAllNames(): Promise<string[]> {
    try {
      const trabajadores = await this.trabajadorModel
        .find()
        .select('nomina')
        .exec();
      
      console.log('Trabajadores encontrados:', trabajadores.length);
      console.log('Datos:', trabajadores);
      
      return trabajadores.map(t => t.nomina);
    } catch (error) {
      console.error('Error en findAllNames:', error);
      return [];
    }
  }

  // Buscar trabajadores por nómina o CI (devuelve objetos completos)
  async buscarTrabajadores(query: string): Promise<Trabajador[]> {
    if (typeof query !== 'string' || query.trim() === '') {
      return this.trabajadorModel.find().limit(10).exec();
    }
    
    return this.trabajadorModel
      .find({ 
        $or: [
          { nomina: { $regex: query, $options: 'i' } },
          { ci: { $regex: query, $options: 'i' } },
        ]
      })
      .limit(10)
      .exec();
  }

  // Buscar trabajadores y devolver solo los nombres (para autocomplete)
  async buscarTrabajadoresNames(query: string): Promise<string[]> {
    if (typeof query !== 'string' || query.trim() === '') {
      const trabajadores = await this.trabajadorModel
        .find()
        .select('nomina')
        .limit(20)
        .exec();
      return trabajadores.map(t => t.nomina);
    }
    
    const trabajadores = await this.trabajadorModel
      .find({ 
        $or: [
          { nomina: { $regex: query, $options: 'i' } },
          { ci: { $regex: query, $options: 'i' } },
        ]
      })
      .select('nomina')
      .limit(20)
      .exec();

    return trabajadores.map(t => t.nomina);
  }

  // Obtener trabajadores con datos completos (nomina, CI, puesto)
  async findAllCompletos(): Promise<Array<{ nomina: string; ci: string; puesto: string }>> {
    try {
      const trabajadores = await this.trabajadorModel
        .find()
        .select('nomina ci puesto') // Solo estos 3 campos
        .sort({ nomina: 1 }) // Ordenar alfabéticamente
        .lean() // Mejor performance
        .exec();
      
      console.log('Trabajadores completos encontrados:', trabajadores.length);
      
      return trabajadores.map(t => ({
        nomina: t.nomina || '',
        ci: t.ci || '',
        puesto: t.puesto || ''
      }));
    } catch (error) {
      console.error('Error en findAllCompletos:', error);
      return [];
    }
  }

  // ==================== GESTIÓN DE USUARIOS KEYCLOAK ====================

  // Crear trabajador con usuario de Keycloak
  async createWithUser(
    createDto: CreateTrabajadorWithUserDto,
    requestingUser: any
  ) {
    // Verificar permisos del usuario solicitante
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    
    if (!isAdmin) {
      throw new ForbiddenException('Solo los administradores pueden crear usuarios en el sistema');
    }

    let trabajador: Trabajador | null = null;
    let keycloakUserId: string | null = null;

    try {
      // 1. Crear trabajador primero
      const trabajadorData: CreateTrabajadorDto = {
        ci: createDto.ci,
        nomina: createDto.nomina,
        puesto: createDto.puesto,
        fecha_ingreso: createDto.fecha_ingreso,
        superintendencia: createDto.superintendencia,
      };

      trabajador = await this.create(trabajadorData);

      let username = createDto.username;

      // 2. Crear usuario en Keycloak si se solicita
      if (createDto.crear_usuario_keycloak) {
        // Generar username si no se proporciona
        if (!username) {
          username = this.generateUsernameFromNomina(createDto.nomina);
        }

        // Separar nombre y apellido de la nómina
        const [firstName, ...lastNameParts] = createDto.nomina.split(' ');
        const lastName = lastNameParts.join(' ') || firstName;

        keycloakUserId = await this.keycloakAdminService.createUser({
          username: username,
          email: createDto.email,
          firstName: firstName,
          lastName: lastName,
          roles: createDto.roles || ['user'],
        });
      }

      // 3. Actualizar trabajador con información de usuario
      const trabajadorActualizado = await this.trabajadorModel.findByIdAndUpdate(
        trabajador._id,
        {
          keycloak_user_id: keycloakUserId,
          username: username,
          tiene_acceso_sistema: !!keycloakUserId,
          creado_por_usuario: requestingUser.preferred_username,
        },
        { new: true }
      );

      return {
        success: true,
        trabajador: trabajadorActualizado,
        message: keycloakUserId 
          ? 'Trabajador y usuario creados exitosamente' 
          : 'Trabajador creado exitosamente (sin usuario del sistema)',
        usuario_creado: !!keycloakUserId,
      };

    } catch (error) {
      // Si algo falla y ya se creó el trabajador, eliminarlo
      if (trabajador) {
        await this.trabajadorModel.findByIdAndDelete(trabajador._id);
      }

      throw new Error(`Error en la creación: ${error.message}`);
    }
  }

  // Crear usuario para trabajador existente
  async createUserForExistingWorker(
    trabajadorId: string,
    createUserDto: {
      username: string;
      email?: string;
      password: string;
      temporary_password?: boolean;
      roles?: string[];
    },
    requestingUser: any
  ) {
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo los administradores pueden crear usuarios en el sistema');
    }

    try {
      const trabajador = await this.trabajadorModel.findById(trabajadorId).exec();
      if (!trabajador) {
        throw new NotFoundException(`Trabajador con ID ${trabajadorId} no encontrado`);
      }

      if (trabajador.keycloak_user_id && trabajador.tiene_acceso_sistema && !trabajador.user_unlinked) {
        throw new ConflictException('Este trabajador ya tiene un usuario activo del sistema');
      }

      const existingWorkerWithUsername = await this.trabajadorModel.findOne({
        username: createUserDto.username
      });
      if (existingWorkerWithUsername) {
        throw new ConflictException(`El username '${createUserDto.username}' ya está en uso`);
      }

      if (trabajador.user_unlinked) {
        await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
          $unset: {
            keycloak_user_id: 1,
            user_unlinked: 1,
            user_unlinked_reason: 1,
            user_unlinked_by: 1,
            user_unlinked_at: 1,
          }
        });
      }

      const [firstName, ...lastNameParts] = trabajador.nomina.split(' ');
      const lastName = lastNameParts.join(' ') || firstName;

      const email = createUserDto.email || `${createUserDto.username}@temp.local`;

      const keycloakUserId = await this.keycloakAdminService.createUserWithPassword({
        username: createUserDto.username,
        email: email,
        firstName: firstName,
        lastName: lastName,
        password: createUserDto.password,
        temporary: createUserDto.temporary_password ?? true,
        enabled: true,
        roles: createUserDto.roles || ['user'],
      });

      const trabajadorActualizado = await this.trabajadorModel.findByIdAndUpdate(
        trabajadorId,
        {
          keycloak_user_id: keycloakUserId,
          username: createUserDto.username,
          tiene_acceso_sistema: true,
          updatedBy: requestingUser.preferred_username,
        },
        { new: true, runValidators: true }
      );

      await this.logUserAction(
        trabajadorId,
        'user_created',
        { 
          username: createUserDto.username,
          temporary_password: createUserDto.temporary_password,
          roles: createUserDto.roles 
        },
        requestingUser.preferred_username
      );

      return {
        success: true,
        message: 'Usuario creado y asociado exitosamente',
        trabajador: trabajadorActualizado,
        usuario_info: {
          username: createUserDto.username,
          email: createUserDto.email || 'Email temporal generado',
          keycloak_user_id: keycloakUserId,
          roles: createUserDto.roles || ['user'],
          temporary_password: createUserDto.temporary_password ?? true
        }
      };

    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ConflictException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error(`Error creando usuario: ${error.message}`);
    }
  }

  // ==================== GESTIÓN DE USUARIOS ====================

  // Actualizar contraseña de usuario
  async updateWorkerUserPassword(
    trabajadorId: string,
    updateDto: UpdateUserPasswordDto,
    requestingUser: any
  ) {
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden actualizar contraseñas');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador || !trabajador.keycloak_user_id) {
      throw new NotFoundException('Trabajador no encontrado o sin usuario asociado');
    }

    try {
      await this.keycloakAdminService.updateUserPassword(
        trabajador.keycloak_user_id,
        updateDto.new_password,
        updateDto.temporary
      );

      await this.logUserAction(
        trabajadorId,
        'password_updated',
        { temporary: updateDto.temporary },
        requestingUser.preferred_username
      );

      return {
        success: true,
        message: 'Contraseña actualizada correctamente',
        temporary_password: updateDto.temporary,
      };
    } catch (error) {
      throw new Error(`Error actualizando contraseña: ${error.message}`);
    }
  }

  // Actualizar roles de usuario
  async updateWorkerUserRoles(
    trabajadorId: string,
    updateDto: UpdateUserRolesDto,
    requestingUser: any
  ) {
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden actualizar roles');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador || !trabajador.keycloak_user_id) {
      throw new NotFoundException('Trabajador no encontrado o sin usuario asociado');
    }

    try {
      await this.keycloakAdminService.updateUserRoles(
        trabajador.keycloak_user_id,
        updateDto.roles
      );

      await this.logUserAction(
        trabajadorId,
        'roles_updated',
        { new_roles: updateDto.roles },
        requestingUser.preferred_username
      );

      return {
        success: true,
        message: 'Roles actualizados correctamente',
        roles: updateDto.roles,
      };
    } catch (error) {
      throw new Error(`Error actualizando roles: ${error.message}`);
    }
  }

  // Desactivar usuario
  async disableWorkerUser(
    trabajadorId: string,
    disableDto: DisableUserDto,
    requestingUser: any
  ) {
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden desactivar usuarios');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador || !trabajador.keycloak_user_id) {
      throw new NotFoundException('Trabajador no encontrado o sin usuario asociado');
    }

    try {
      await this.keycloakAdminService.disableUser(trabajador.keycloak_user_id);

      await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
        user_disabled: true,
        user_disabled_reason: disableDto.reason,
        user_disabled_by: requestingUser.preferred_username,
        user_disabled_at: new Date(),
      });

      await this.logUserAction(
        trabajadorId,
        'user_disabled',
        { reason: disableDto.reason },
        requestingUser.preferred_username
      );

      return {
        success: true,
        message: 'Usuario desactivado correctamente',
        reason: disableDto.reason,
      };
    } catch (error) {
      throw new Error(`Error desactivando usuario: ${error.message}`);
    }
  }

  // Activar usuario
  async enableWorkerUser(trabajadorId: string, requestingUser: any) {
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden activar usuarios');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador || !trabajador.keycloak_user_id) {
      throw new NotFoundException('Trabajador no encontrado o sin usuario asociado');
    }

    try {
      await this.keycloakAdminService.enableUser(trabajador.keycloak_user_id);

      await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
        user_disabled: false,
        $unset: {
          user_disabled_reason: 1,
          user_disabled_by: 1,
          user_disabled_at: 1,
        },
        user_enabled_by: requestingUser.preferred_username,
        user_enabled_at: new Date(),
      });

      await this.logUserAction(
        trabajadorId,
        'user_enabled',
        {},
        requestingUser.preferred_username
      );

      return {
        success: true,
        message: 'Usuario activado correctamente',
      };
    } catch (error) {
      throw new Error(`Error activando usuario: ${error.message}`);
    }
  }

  // Desvincular usuario (dar de baja)
  async unlinkWorkerUser(
    trabajadorId: string,
    reason: string,
    requestingUser: any
  ) {
    const isAdmin = requestingUser.resource_access?.['next-app-client']?.roles?.includes('admin');
    if (!isAdmin) {
      throw new ForbiddenException('Solo administradores pueden desvincular usuarios');
    }

    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador || !trabajador.keycloak_user_id) {
      throw new NotFoundException('Trabajador no encontrado o sin usuario asociado');
    }

    try {
      await this.keycloakAdminService.disableUser(trabajador.keycloak_user_id);

      await this.trabajadorModel.findByIdAndUpdate(trabajadorId, {
        tiene_acceso_sistema: false,
        user_unlinked: true,
        user_unlinked_reason: reason,
        user_unlinked_by: requestingUser.preferred_username,
        user_unlinked_at: new Date(),
      });

      await this.logUserAction(
        trabajadorId,
        'user_unlinked',
        { reason },
        requestingUser.preferred_username
      );

      return {
        success: true,
        message: 'Usuario desvinculado correctamente',
        reason,
        note: 'El usuario se mantiene en Keycloak pero desactivado',
      };
    } catch (error) {
      throw new Error(`Error desvinculando usuario: ${error.message}`);
    }
  }

  // Obtener información completa del usuario
  async getWorkerUserInfo(trabajadorId: string) {
    const trabajador = await this.trabajadorModel.findById(trabajadorId);
    if (!trabajador || !trabajador.keycloak_user_id) {
      throw new NotFoundException('Trabajador no encontrado o sin usuario asociado');
    }

    try {
      const keycloakUserInfo = await this.keycloakAdminService.getUserById(
        trabajador.keycloak_user_id
      );

      return {
        trabajador_info: {
          id: trabajador._id,
          ci: trabajador.ci,
          nomina: trabajador.nomina,
          tiene_acceso_sistema: trabajador.tiene_acceso_sistema,
        },
        keycloak_info: {
          id: keycloakUserInfo.id,
          username: keycloakUserInfo.username,
          email: keycloakUserInfo.email,
          enabled: keycloakUserInfo.enabled,
          emailVerified: keycloakUserInfo.emailVerified,
          createdTimestamp: keycloakUserInfo.createdTimestamp,
        },
        status: {
          user_disabled: trabajador.user_disabled || false,
          user_unlinked: trabajador.user_unlinked || false,
        }
      };
    } catch (error) {
      throw new Error(`Error obteniendo información del usuario: ${error.message}`);
    }
  }

  // ==================== MÉTODOS AUXILIARES ====================

  // Asociar trabajador existente con usuario existente de Keycloak
  async linkExistingUser(trabajadorId: string, keycloakUserId: string, username: string) {
    return this.trabajadorModel.findByIdAndUpdate(
      trabajadorId,
      {
        keycloak_user_id: keycloakUserId,
        username: username,
        tiene_acceso_sistema: true,
      },
      { new: true }
    );
  }

  // Buscar trabajador por ID de Keycloak
  async findByKeycloakId(keycloakUserId: string): Promise<Trabajador | null> {
    return this.trabajadorModel.findOne({ keycloak_user_id: keycloakUserId });
  }

  // Generar username a partir de la nómina
  private generateUsernameFromNomina(nomina: string): string {
    return nomina
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/\s+/g, '.') // Espacios por puntos
      .replace(/[^a-z0-9.]/g, ''); // Solo letras, números y puntos
  }

  // Log de acciones de usuario
  async logUserAction(
    trabajadorId: string,
    action: string,
    details: any,
    performedBy: string
  ) {
    // Aquí puedes implementar logging en una colección separada
    console.log(`User action logged: ${action} for worker ${trabajadorId} by ${performedBy}`, details);
  }
}