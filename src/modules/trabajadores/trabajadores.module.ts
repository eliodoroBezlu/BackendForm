import { Module } from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { TrabajadoresController } from './trabajadores.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Trabajador, TrabajadorSchema } from './schemas/trabajador.schema';
import {
  SincronizacionIam,
  SincronizacionIamSchema,
} from './schemas/sincronizacion-iam.schema';
import { SincronizacionIamService } from './sincronizacion-iam.service';
import { KeycloakModule } from './keycloak.module';
import { User, UserSchema } from '../auth/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Trabajador.name, schema: TrabajadorSchema },
      { name: User.name, schema: UserSchema },
      { name: SincronizacionIam.name, schema: SincronizacionIamSchema },
    ]),
    KeycloakModule,
  ],
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService, SincronizacionIamService],
})
export class TrabajadoresModule {}
