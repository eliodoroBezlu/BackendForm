import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MatrizRiesgo,
  MatrizRiesgoSchema,
} from './schemas/matriz-riesgo.schema';
import {
  CatalogoRiesgo,
  CatalogoRiesgoSchema,
} from './schemas/catalogo-riesgo.schema';
import { Area, AreaSchema } from '../area/schemas/area.schema';
import {
  Superintendencia,
  SuperintendenciaSchema,
} from '../superintendencia/schemas/superintendencia.schema';
import { MatrizRiesgosImportService } from './matriz-riesgos-import.service';
import { MatrizRiesgosService } from './matriz-riesgos.service';
import { MatrizRiesgosEdicionService } from './matriz-riesgos-edicion.service';
import { MatrizRiesgosController } from './matriz-riesgos.controller';

/**
 * Matriz de Identificación y Evaluación de Riesgos (1.02.P06.F01).
 *
 * El motor de la metodología vive en `domain/`, en funciones puras verificadas
 * contra el documento real. Los catálogos se siembran con
 * `scripts/seed-catalogos-matriz.cjs`.
 *
 * `Area` y `Superintendencia` se registran aquí —mismo patrón que `pgr` y
 * `equipos`— porque `AreaModule` no exporta su servicio y la validación del
 * área al importar necesita consultarlas.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MatrizRiesgo.name, schema: MatrizRiesgoSchema },
      { name: CatalogoRiesgo.name, schema: CatalogoRiesgoSchema },
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
    ]),
  ],
  controllers: [MatrizRiesgosController],
  providers: [
    MatrizRiesgosImportService,
    MatrizRiesgosService,
    MatrizRiesgosEdicionService,
  ],
  exports: [MatrizRiesgosImportService, MatrizRiesgosService, MongooseModule],
})
export class MatrizRiesgosModule {}
