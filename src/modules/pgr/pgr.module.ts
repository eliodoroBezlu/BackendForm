import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PgrService } from './pgr.service';
import { PgrImportService } from './pgr-import.service';
import { PgrExcelService } from './pgr-excel.service';
import { PgrController } from './pgr.controller';
import { Pgr, PgrSchema } from './schemas/pgr.schema';
import { Area, AreaSchema } from '../area/schemas/area.schema';
import {
  Superintendencia,
  SuperintendenciaSchema,
} from '../superintendencia/schemas/superintendencia.schema';
import { MatrizRiesgosModule } from '../matriz-riesgos/matriz-riesgos.module';
import { PgrConsolidacionService } from './pgr-consolidacion.service';
import { PgrCatalogoService } from './pgr-catalogo.service';
import { PgrCatalogoController } from './pgr-catalogo.controller';
import {
  EntregableSugerido,
  EntregableSugeridoSchema,
  GrupoResponsable,
  GrupoResponsableSchema,
  UnidadRecurso,
  UnidadRecursoSchema,
} from './schemas/pgr-catalogo.schema';
import {
  Trabajador,
  TrabajadorSchema,
} from '../trabajadores/schemas/trabajador.schema';

/**
 * La dependencia va `pgr → matriz-riesgos`, en un solo sentido: el PGR es el
 * dueño de su agregado y solo este módulo lo escribe; de la matriz únicamente
 * lee las aprobadas para consolidarlas.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pgr.name, schema: PgrSchema },
      { name: Area.name, schema: AreaSchema },
      { name: Superintendencia.name, schema: SuperintendenciaSchema },
      { name: UnidadRecurso.name, schema: UnidadRecursoSchema },
      { name: EntregableSugerido.name, schema: EntregableSugeridoSchema },
      { name: GrupoResponsable.name, schema: GrupoResponsableSchema },
      { name: Trabajador.name, schema: TrabajadorSchema },
    ]),
    MatrizRiesgosModule,
  ],
  controllers: [PgrController, PgrCatalogoController],
  providers: [
    PgrService,
    PgrImportService,
    PgrExcelService,
    PgrConsolidacionService,
    PgrCatalogoService,
  ],
  exports: [PgrService, PgrConsolidacionService],
})
export class PgrModule {}
