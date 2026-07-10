import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController }  from './auth.controller';
import { JwtStrategy }     from './strategies/jwt.strategy';
import { IamProxyService } from './iam-proxy.service';
import { RbacCacheService } from './rbac-cache.service';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
  ],
  controllers: [AuthController],
  providers:   [JwtStrategy, IamProxyService, RbacCacheService],
  exports:     [IamProxyService],
})
export class AuthModule {}
