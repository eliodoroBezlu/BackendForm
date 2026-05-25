import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { User } from './schemas/user.schema';
import { Role } from './enums/role.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { Setup2FADto } from './dto/setup-2fa.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { InspectorLoginDto } from './dto/inspector-login.dto';
import { getPermissionsForRoles } from './enums/role-permissions';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async login(
    @CurrentUser() user: User,
    @Body() loginDto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;

    const result = await this.authService.login(user, userAgent, ip);

    // Type guard con early return
    if ('requires2FA' in result && result.requires2FA) {
      // TypeScript sabe que aquí result es Login2FARequired
      return {
        requires2FA: result.requires2FA,
        tempToken: result.tempToken,
        message: result.message,
      };
    }

    // Después del if, TypeScript infiere que result es LoginSuccess
    // Pero necesitamos ayudarlo explícitamente
    const loginSuccess = result as Extract<typeof result, { accessToken: string }>;
    
    this.setTokenCookies(res, loginSuccess.accessToken, loginSuccess.refreshToken);
    return { user: loginSuccess.user };
  }

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verify2FA(
    @Body() verify2FADto: Verify2FADto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;

    const result = await this.authService.verify2FA(
      verify2FADto.tempToken,
      verify2FADto.code,
      userAgent,
      ip,
    );

    // verify2FA siempre retorna LoginSuccess
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

@Post('refresh')
@HttpCode(HttpStatus.OK)
async refresh(
  @Req() req: any,
  @Res({ passthrough: true }) res: Response,
) {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    throw new UnauthorizedException('No refresh token');
  }

  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress;

  const result = await this.authService.refreshTokens(
    refreshToken,
    userAgent,
    ip,
  );

  // Establecer cookies HTTP
  this.setTokenCookies(res, result.accessToken, result.refreshToken);
  
  return { user: result.user };
}
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: User,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await this.authService.logout(user._id.toString(), refreshToken);
    }

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return { message: 'Logout exitoso' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: User) {
    const rolePermissions = getPermissionsForRoles(user.roles || []);
    const directPermissions = user.permissions || [];
    const allPermissions = Array.from(new Set([...rolePermissions, ...directPermissions]));

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      permissions: allPermissions,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setup2FA(@CurrentUser() user: User) {
    return this.authService.setup2FA(user._id.toString());
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enable2FA(
    @CurrentUser() user: User,
    @Body() setup2FADto: Setup2FADto,
  ) {
    return this.authService.enable2FA(user._id.toString(), setup2FADto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2FA(
    @CurrentUser() user: User,
    @Body() setup2FADto: Setup2FADto,
  ) {
    return this.authService.disable2FA(user._id.toString(), setup2FADto.code);
  }
  @Post('inspector')
  @HttpCode(HttpStatus.OK)
  async inspectorLogin(
    @Body() inspectorDto: InspectorLoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 [CONTROLLER] Login de inspector iniciado');

    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;

    const result = await this.authService.loginInspector(
      inspectorDto.inspectorKey,
      inspectorDto.deviceId,
      userAgent,
      ip,
    );

    // Establecer cookies
    this.setTokenCookies(res, result.accessToken, result.refreshToken);

    console.log('✅ [CONTROLLER] Cookies establecidas para inspector');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return { user: result.user };
  }

  // Endpoint protegido por roles
  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async getAllUsers() {
    return { message: 'Lista de usuarios (solo admins)' };
  }

  // Helper privado
  // En setTokenCookies
private setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  console.log('🍪 [BACKEND] Estableciendo cookies...', {
    isProduction,
    accessTokenPreview: accessToken.slice(0, 20),
  });

  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  console.log('✅ [BACKEND] Cookies configuradas en response');
  
  // 🔍 Verificar que están en los headers
  const headers = res.getHeaders();
  console.log('📋 [BACKEND] Set-Cookie headers:', headers['set-cookie']);
}
}