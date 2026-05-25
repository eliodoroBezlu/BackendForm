import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { User } from './schemas/user.schema';
import { Session } from './schemas/session.schema';
import { Role } from './enums/role.enum';
import { RegisterDto } from './dto/register.dto';
import { randomBytes } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getPermissionsForRoles } from './enums/role-permissions';

// Tipos de respuesta
interface LoginSuccess {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string | undefined;
    roles: Role[];
    permissions: string[];
    fullName: string | undefined;
  };
}

interface Login2FARequired {
  requires2FA: true;
  tempToken: string;
  message: string;
}

type LoginResponse = LoginSuccess | Login2FARequired;

@Injectable()
export class AuthService {
  
    private readonly logger = new Logger(AuthService.name)
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Session.name) private sessionModel: Model<Session>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { username, email, password, fullName, roles } = registerDto;

    const existingUser = await this.userModel.findOne({ username });
    if (existingUser) {
      throw new ConflictException('El username ya está en uso');
    }

    if (email) {
      const existingEmail = await this.userModel.findOne({ email });
      if (existingEmail) {
        throw new ConflictException('El email ya está en uso');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.userModel.create({
      username,
      email: email || null,
      password: hashedPassword,
      fullName: fullName || null,
      roles: roles || [Role.USER],
    });

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      roles: user.roles,
    };
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userModel.findOne({ username });
    
    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(user: User, userAgent: string, ip: string): Promise<LoginResponse> {
    if (user.isTwoFactorEnabled) {
      const tempToken = this.generateTempToken(user);
      return {
        requires2FA: true,
        tempToken,
        message: 'Ingrese el código 2FA',
      };
    }

    return this.generateTokens(user, userAgent, ip);
  }

  async verify2FA(
    tempToken: string,
    code: string,
    userAgent: string,
    ip: string,
  ): Promise<LoginSuccess> {
    let payload: any;
    
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('JWT_TEMP_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Token temporal inválido o expirado');
    }

    const user = await this.userModel.findById(payload.sub);
    if (!user || !user.isTwoFactorEnabled) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      const isBackupCode = await this.verifyBackupCode(user, code);
      if (!isBackupCode) {
        throw new UnauthorizedException('Código 2FA inválido');
      }
    }

    return this.generateTokens(user, userAgent, ip);
  }

  private async verifyBackupCode(user: User, code: string): Promise<boolean> {
    for (let i = 0; i < user.backupCodes.length; i++) {
      const isValid = await bcrypt.compare(code, user.backupCodes[i]);
      if (isValid) {
        user.backupCodes.splice(i, 1);
        await user.save();
        return true;
      }
    }
    return false;
  }

  private async generateTokens(
  user: User,
  userAgent: string,
  ip: string,
): Promise<LoginSuccess> {
  console.log('🔑 [TOKENS] Generando tokens para:', user.username);
   console.log('💾 [TOKENS] Creando sesión para:', user.username);
  
  const rolePermissions = getPermissionsForRoles(user.roles || []);
  const directPermissions = user.permissions || [];
  const allPermissions = Array.from(new Set([...rolePermissions, ...directPermissions]));

  const payload = {
    sub: user._id.toString(),
    username: user.username,
    roles: user.roles,
    permissions: allPermissions,
  };

  const accessToken = this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_SECRET'),
    expiresIn: '15m',
  });

  const refreshToken = this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    expiresIn: '7d',
  });

  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  
  // 🔍 Log ANTES de guardar
  console.log('💾 [TOKENS] Guardando sesión en MongoDB:', {
    userId: user._id.toString(),
    userAgent: userAgent.slice(0, 30),
    ip,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  try {
    const session = await this.sessionModel.create({
      userId: user._id,
      refreshTokenHash,
      userAgent,
      ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    
    console.log('✅ [TOKENS] Sesión guardada:', session._id.toString());

    // 🔍 Contar todas las sesiones para este usuario
    const total = await this.sessionModel.countDocuments({ userId: user._id });
    console.log('📊 [TOKENS] Total sesiones en DB:', total);

  } catch (dbError: any) {
    console.error('❌ [TOKENS] ERROR guardando sesión en MongoDB:', dbError.message);
    console.error('❌ [TOKENS] Detalles:', dbError);
    throw dbError; // Re-lanzar para que el login falle limpiamente
  }

  // 🔍 Verificar que se guardó
  const sessionCount = await this.sessionModel.countDocuments({ 
    userId: user._id,
    isRevoked: false 
  });
  console.log('📊 [TOKENS] Sesiones activas para este usuario:', sessionCount);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions: allPermissions,
      fullName: user.fullName,
    },
  };
}

  private generateTempToken(user: User): string {
    return this.jwtService.sign(
      { sub: user._id.toString() },
      {
        secret: this.configService.get<string>('JWT_TEMP_SECRET'),
        expiresIn: '5m',
      },
    );
  }

 async refreshTokens(
  refreshToken: string,
  userAgent: string,
  ip: string,
): Promise<LoginSuccess> {
  console.log('🔄 [REFRESH] Iniciando renovación...');

  // Validar JWT
  let payload: any;
  try {
    payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });
  } catch (error: any) {
    throw new UnauthorizedException('Refresh token inválido');
  }

  const userIdObj = new mongoose.Types.ObjectId(payload.sub);

  // Buscar sesión válida
  const sessions = await this.sessionModel.find({
    userId: userIdObj,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });

  console.log(`🔍 [REFRESH] Sesiones activas: ${sessions.length}`);

  let validSession: (typeof sessions)[0] | null = null;

  for (const session of sessions) {
    const isValid = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (isValid) {
      validSession = session;
      break;
    }
  }

  if (!validSession) {
    throw new UnauthorizedException('Sesión inválida o expirada');
  }

  const user = await this.userModel.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new UnauthorizedException('Usuario no autorizado');
  }

  // ✅ CALCULAR PERMISOS UNIDOS
  const rolePermissions = getPermissionsForRoles(user.roles || []);
  const directPermissions = user.permissions || [];
  const allPermissions = Array.from(new Set([...rolePermissions, ...directPermissions]));

  // ✅ GENERAR NUEVOS TOKENS
  const newPayload = {
    sub: user._id.toString(),
    username: user.username,
    roles: user.roles,
    permissions: allPermissions,
  };

  const accessToken = this.jwtService.sign(newPayload, {
    secret: this.configService.get<string>('JWT_SECRET'),
    expiresIn: '15m',
  });

  const newRefreshToken = this.jwtService.sign(newPayload, {
    secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    expiresIn: '7d',
  });

  // ✅ ACTUALIZAR LA MISMA SESIÓN (NO CREAR NUEVA)
  validSession.refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
  validSession.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  validSession.lastRefreshedAt = new Date(); // ← Registrar cuándo se renovó
  validSession.ip = ip; // ← Actualizar IP (puede haber cambiado)
  await validSession.save();

  console.log('✅ [REFRESH] Sesión renovada (mismo registro):', validSession._id);

  // 🔍 Contar sesiones activas (NO debería cambiar)
  const activeCount = await this.sessionModel.countDocuments({
    userId: user._id,
    isRevoked: false,
  });
  console.log('📊 [REFRESH] Sesiones activas:', activeCount);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions: allPermissions,
      fullName: user.fullName,
    },
  };
}

  async logout(userId: string, refreshToken: string): Promise<void> {
    const sessions = await this.sessionModel.find({
      userId,
      isRevoked: false,
    });

    for (const session of sessions) {
      const isValid = await bcrypt.compare(refreshToken, session.refreshTokenHash);
      if (isValid) {
        session.isRevoked = true;
        await session.save();
        break;
      }
    }
  }

  async setup2FA(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (user.isTwoFactorEnabled) {
      throw new ConflictException('2FA ya está habilitado');
    }

    const appName = this.configService.get<string>('APP_NAME') || 'MiApp';
    const secret = speakeasy.generateSecret({
      name: `${appName} (${user.username})`,
      length: 32,
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    };
  }

  async enable2FA(userId: string, code: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('Primero debe configurar 2FA');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException('Código inválido');
    }

    const backupCodes = Array.from({ length: 10 }, () =>
      randomBytes(4).toString('hex').toUpperCase(),
    );

    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    user.isTwoFactorEnabled = true;
    user.backupCodes = hashedBackupCodes;
    await user.save();

    return {
      message: '2FA habilitado exitosamente',
      backupCodes,
    };
  }

  async disable2FA(userId: string, code: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !user.isTwoFactorEnabled) {
      throw new BadRequestException('2FA no está habilitado');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!isValid) {
      throw new BadRequestException('Código inválido');
    }

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.backupCodes = [];
    await user.save();

    return { message: '2FA deshabilitado exitosamente' };
  }

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password -twoFactorSecret -backupCodes');
    
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    return user;
  }


  async loginInspector(
    inspectorKey: string,
    deviceId: string | undefined,
    userAgent: string,
    ip: string,
  ): Promise<LoginSuccess> {
    console.log('🔧 [INSPECTOR] Intento de login con API Key');

    // 1. Validar API Key
    const validInspectorKey = this.configService.get<string>('INSPECTOR_API_KEY');
    
    if (!validInspectorKey || inspectorKey !== validInspectorKey) {
      console.error('❌ [INSPECTOR] API Key inválida');
      throw new UnauthorizedException('API Key de inspector inválida');
    }

    console.log('✅ [INSPECTOR] API Key válida');

    // 2. Buscar o crear usuario especial "inspector"
    let inspectorUser = await this.userModel.findOne({ username: 'inspector_tecnico' });

    if (!inspectorUser) {
      console.log('🔧 [INSPECTOR] Creando usuario inspector por primera vez...');
      
      // Crear usuario inspector con contraseña aleatoria (nunca se usará)
      const randomPassword = require('crypto').randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      inspectorUser = await this.userModel.create({
        username: 'inspector_tecnico',
        email: 'inspector@sistema.local',
        password: hashedPassword,
        fullName: 'Inspector Técnico',
        roles: [Role.USER, Role.INSPECTOR], // ← Crear este rol
        isActive: true,
      });

      console.log('✅ [INSPECTOR] Usuario inspector creado');
    }

    if (!inspectorUser.isActive) {
      throw new ForbiddenException('Cuenta de inspector desactivada');
    }

    // 3. Generar tokens normalmente
    console.log('🔑 [INSPECTOR] Generando tokens para sesión...');
    
    const result = await this.generateTokens(
      inspectorUser,
      userAgent,
      ip,
    );

    console.log('✅ [INSPECTOR] Login exitoso para inspector');

    return result;
  }


  @Cron(process.env.CRON_SESSION_CLEANUP || '0 3 * * *')
  async scheduledSessionCleanup() {
    this.logger.log('🧹 Iniciando limpieza programada de sesiones');
    
    try {
      const deleted = await this.cleanupExpiredSessions();
      this.logger.log(`✅ Limpieza completada: ${deleted} sesiones eliminadas`);
    } catch (error) {
      this.logger.error('❌ Error en limpieza de sesiones:', error);
    }
  }


  async cleanupExpiredSessions(): Promise<number> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧹 [CRON] Iniciando limpieza de sesiones...');
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      // Contar antes de borrar
      const totalBefore = await this.sessionModel.countDocuments({});
      const activeBefore = await this.sessionModel.countDocuments({ isRevoked: false });

      console.log('📊 [CRON] Estado actual:', {
        total: totalBefore,
        activas: activeBefore,
        revocadas: totalBefore - activeBefore,
      });

      // Eliminar sesiones que cumplan cualquiera de estas condiciones
      const result = await this.sessionModel.deleteMany({
        $or: [
          // 1️⃣ Sesiones expiradas (refresh token venció)
          { expiresAt: { $lt: now } },
          
          // 2️⃣ Sesiones revocadas hace más de 7 días (ya no son útiles)
          { 
            isRevoked: true,
            updatedAt: { $lt: sevenDaysAgo }
          },
          
          // 3️⃣ Sesiones sin actividad por 30 días (abandonadas)
          {
            isRevoked: false,
            $or: [
              // Si tiene lastRefreshedAt, usar eso
              { lastRefreshedAt: { $lt: thirtyDaysAgo } },
              // Si no tiene lastRefreshedAt (sesiones viejas), usar createdAt
              { 
                lastRefreshedAt: null, 
                createdAt: { $lt: thirtyDaysAgo }
              }
            ]
          }
        ]
      });

      // Contar después de borrar
      const totalAfter = await this.sessionModel.countDocuments({});
      const activeAfter = await this.sessionModel.countDocuments({ isRevoked: false });

      console.log('✅ [CRON] Limpieza completada:', {
        eliminadas: result.deletedCount,
        totalAhora: totalAfter,
        activasAhora: activeAfter,
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return result.deletedCount;

    } catch (error) {
      console.error('❌ [CRON] Error en limpieza:', error);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      throw error;
    }
  }
}