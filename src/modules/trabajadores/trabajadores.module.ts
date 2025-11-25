import { Module } from '@nestjs/common';
import { TrabajadoresService } from './trabajadores.service';
import { TrabajadoresController } from './trabajadores.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Trabajador, TrabajadorSchema } from './schema/trabajador.schema';
import { KeycloakModule } from './keycloak.module';

@Module({
  imports:[
    MongooseModule.forFeature([{name: Trabajador.name, schema:TrabajadorSchema}]),
  KeycloakModule
  ],
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService],
})
export class TrabajadoresModule {}
