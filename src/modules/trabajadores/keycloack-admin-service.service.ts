import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private tokenCache: { token: string; expires: number } | null = null;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  // Obtener token usando client_credentials (service account)
  private async getServiceAccountToken(): Promise<string> {
    // Verificar cache
    if (this.tokenCache && Date.now() < this.tokenCache.expires) {
      return this.tokenCache.token;
    }

    try {
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');
      const clientId = this.configService.get('KEYCLOAK_CLIENT_ID');
      const clientSecret = this.configService.get('KEYCLOAK_SECRET');

      this.logger.log('Obteniendo token de service account...');

      const response = await firstValueFrom(
        this.httpService.post(
          `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: 'client_credentials', // Flujo recomendado
            client_id: clientId,
            client_secret: clientSecret,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )
      );

      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 300;

      // Guardar en cache
      this.tokenCache = {
        token,
        expires: Date.now() + (expiresIn - 30) * 1000,
      };

      this.logger.log('Token de service account obtenido');
      return token;

    } catch (error) {
      this.logger.error('Error obteniendo token:', error.response?.data);
      this.tokenCache = null;
      throw new UnauthorizedException('No se pudo obtener token de service account');
    }
  }

  // Crear usuario en Keycloak
  async createUser(userData: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    enabled?: boolean;
    roles?: string[];
  }): Promise<string> {
    try {
      const token = await this.getServiceAccountToken();
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');

      // Verificar que no exista
      await this.checkUserExists(userData.username, userData.email, token);

       const temporaryPassword = this.generateTemporaryPassword();
      // Crear usuario
      const createResponse = await firstValueFrom(
      this.httpService.post(
        `${keycloakUrl}/admin/realms/${realm}/users`,
        {
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          enabled: userData.enabled ?? true,
          emailVerified: false,
          credentials: [{
            type: 'password',
            value: temporaryPassword, // Usar contraseña generada
            temporary: true,
          }],
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

      // Obtener ID del usuario
      const locationHeader = createResponse.headers.location;
      const userId = locationHeader.split('/').pop();

      // Asignar roles si se especifican
      if (userData.roles && userData.roles.length > 0) {
        await this.assignClientRolesToUser(userId, userData.roles, token);
      }

      this.logger.log(`Usuario creado: ${userData.username} (ID: ${userId})`);
      return userId;

    } catch (error) {
      this.logger.error('Error creando usuario:', error.response?.data);
      throw new Error(`Error creando usuario: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  // Verificar si usuario existe
  private async checkUserExists(username: string, email: string, token: string): Promise<void> {
    const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    const usernameCheck = await firstValueFrom(
      this.httpService.get(
        `${keycloakUrl}/admin/realms/${realm}/users?username=${username}&exact=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
    );

    if (usernameCheck.data.length > 0) {
      throw new Error(`Ya existe un usuario con username: ${username}`);
    }

    const emailCheck = await firstValueFrom(
      this.httpService.get(
        `${keycloakUrl}/admin/realms/${realm}/users?email=${email}&exact=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
    );

    if (emailCheck.data.length > 0) {
      throw new Error(`Ya existe un usuario con email: ${email}`);
    }
  }

  // Asignar roles del cliente
  private async assignClientRolesToUser(userId: string, roleNames: string[], token: string): Promise<void> {
    const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    const clientId = this.configService.get('KEYCLOAK_CLIENT_ID');

    // Obtener ID interno del cliente
    const clientResponse = await firstValueFrom(
      this.httpService.get(
        `${keycloakUrl}/admin/realms/${realm}/clients?clientId=${clientId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
    );

    const clientInternalId = clientResponse.data[0].id;

    // Obtener roles disponibles
    const rolesResponse = await firstValueFrom(
      this.httpService.get(
        `${keycloakUrl}/admin/realms/${realm}/clients/${clientInternalId}/roles`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
    );

    const rolesToAssign = rolesResponse.data.filter(role => 
      roleNames.includes(role.name)
    );

    if (rolesToAssign.length > 0) {
      await firstValueFrom(
        this.httpService.post(
          `${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/clients/${clientInternalId}`,
          rolesToAssign,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }
  }

  // Generar contraseña temporal
  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }


  async updateUserPassword(userId: string, newPassword: string, temporary: boolean = false): Promise<void> {
    try {
      const token = await this.getServiceAccountToken();
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');

      await firstValueFrom(
        this.httpService.put(
          `${keycloakUrl}/admin/realms/${realm}/users/${userId}/reset-password`,
          {
            type: 'password',
            value: newPassword,
            temporary: temporary,
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      this.logger.log(`Password updated for user ${userId}`);
    } catch (error) {
      this.logger.error('Error updating user password:', error.response?.data);
      throw new Error('Failed to update user password');
    }
  }

  // Desactivar usuario
  async disableUser(userId: string): Promise<void> {
    try {
      const token = await this.getServiceAccountToken();
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');

      await firstValueFrom(
        this.httpService.put(
          `${keycloakUrl}/admin/realms/${realm}/users/${userId}`,
          { enabled: false },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      this.logger.log(`User ${userId} disabled`);
    } catch (error) {
      this.logger.error('Error disabling user:', error.response?.data);
      throw new Error('Failed to disable user');
    }
  }

  // Activar usuario
  async enableUser(userId: string): Promise<void> {
    try {
      const token = await this.getServiceAccountToken();
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');

      await firstValueFrom(
        this.httpService.put(
          `${keycloakUrl}/admin/realms/${realm}/users/${userId}`,
          { enabled: true },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      this.logger.log(`User ${userId} enabled`);
    } catch (error) {
      this.logger.error('Error enabling user:', error.response?.data);
      throw new Error('Failed to enable user');
    }
  }

  // Actualizar roles de usuario
  async updateUserRoles(userId: string, newRoles: string[]): Promise<void> {
    try {
      const token = await this.getServiceAccountToken();
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');
      const clientId = this.configService.get('KEYCLOAK_CLIENT_ID');

      // Obtener ID interno del cliente
      const clientResponse = await firstValueFrom(
        this.httpService.get(
          `${keycloakUrl}/admin/realms/${realm}/clients?clientId=${clientId}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
      );

      const clientInternalId = clientResponse.data[0].id;

      // Obtener roles actuales del usuario
      const currentRolesResponse = await firstValueFrom(
        this.httpService.get(
          `${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/clients/${clientInternalId}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
      );

      // Remover roles actuales
      if (currentRolesResponse.data.length > 0) {
        await firstValueFrom(
          this.httpService.delete(
            `${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/clients/${clientInternalId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              data: currentRolesResponse.data,
            }
          )
        );
      }

      // Asignar nuevos roles
      if (newRoles.length > 0) {
        await this.assignClientRolesToUser(userId, newRoles, token);
      }

      this.logger.log(`Roles updated for user ${userId}: ${newRoles.join(', ')}`);
    } catch (error) {
      this.logger.error('Error updating user roles:', error.response?.data);
      throw new Error('Failed to update user roles');
    }
  }

  // Obtener información completa del usuario
  async getUserById(userId: string): Promise<any> {
    try {
      const token = await this.getServiceAccountToken();
      const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.configService.get('KEYCLOAK_REALM');

      const response = await firstValueFrom(
        this.httpService.get(
          `${keycloakUrl}/admin/realms/${realm}/users/${userId}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error getting user by ID:', error.response?.data);
      throw new Error('Failed to get user information');
    }
  }

  async createUserWithPassword(userData: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  temporary?: boolean;
  enabled?: boolean;
  roles?: string[];
}): Promise<string> {
  try {
    const token = await this.getServiceAccountToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_AUTH_SERVER_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    // Verificar que no exista
    await this.checkUserExists(userData.username, userData.email, token);

    // Crear usuario con contraseña específica
    const createResponse = await firstValueFrom(
      this.httpService.post(
        `${keycloakUrl}/admin/realms/${realm}/users`,
        {
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          enabled: userData.enabled ?? true,
          emailVerified: false,
          credentials: [{
            type: 'password',
            value: userData.password,
            temporary: userData.temporary ?? true,
          }],
          attributes: {
            'created_by': 'admin_user',
            'creation_date': new Date().toISOString(),
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const locationHeader = createResponse.headers.location;
    const userId = locationHeader.split('/').pop();

    if (userData.roles && userData.roles.length > 0) {
      await this.assignClientRolesToUser(userId, userData.roles, token);
    }

    this.logger.log(`Usuario creado con contraseña personalizada: ${userData.username} (ID: ${userId})`);
    return userId;

  } catch (error) {
    this.logger.error('Error creando usuario con contraseña:', error.response?.data);
    throw new Error(`Error creando usuario: ${error.response?.data?.errorMessage || error.message}`);
  }
}
}