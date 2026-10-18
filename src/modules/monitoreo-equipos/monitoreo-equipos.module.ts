import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Equipo, EquipoSchema } from '../equipos/schemas/equipo.schema';
import { EquiposModule } from '../equipos/equipos.module';
import { UbicacionModule } from '../ubicacion/ubicacion.module';
import { ClasificacionModule } from '../clasificacion/clasificacion.module';
import { ConfigFormularioModule } from '../config-formulario/config-formulario.module';
import {
  CatalogoMonitoreo,
  CatalogoMonitoreoSchema,
} from './schemas/catalogo-monitoreo.schema';
import {
  ComponenteEquipo,
  ComponenteEquipoSchema,
} from './schemas/componente-equipo.schema';
import {
  IntervencionEquipo,
  IntervencionEquipoSchema,
} from './schemas/intervencion-equipo.schema';
import {
  ReporteMonitoreo,
  ReporteMonitoreoSchema,
} from './schemas/reporte-monitoreo.schema';
import {
  CorrelativoMonitoreo,
  CorrelativoMonitoreoSchema,
} from './schemas/correlativo-monitoreo.schema';
import {
  PlantillaMonitoreo,
  PlantillaMonitoreoSchema,
} from './schemas/plantilla-monitoreo.schema';
import {
  Trabajador,
  TrabajadorSchema,
} from '../trabajadores/schemas/trabajador.schema';
import { MonitoreoCatalogosService } from './monitoreo-catalogos.service';
import { ReportePdfService } from './reporte-pdf.service';
import { BombasService } from './bombas.service';
import { ImportadorPlanillaService } from './importacion/importador-planilla.service';
import { AntecedentesMonitoreoService } from './antecedentes-monitoreo.service';
import { ArchivosMonitoreoService } from './archivos-monitoreo.service';
import { CorrelativosMonitoreoService } from './correlativos-monitoreo.service';
import { PlantillasMonitoreoService } from './plantillas-monitoreo.service';
import { ReportesMonitoreoService } from './reportes-monitoreo.service';
import { MonitoreoEquiposController } from './monitoreo-equipos.controller';
import { ReportesMonitoreoController } from './reportes-monitoreo.controller';

/**
 * Monitoreo de equipos de Confiabilidad (formato 2.03.P01.R09): la ficha de
 * las bombas, sus piezas, sus intervenciones, las listas del reporte y los
 * reportes. Las bombas son equipos del inventario (`tipo_equipo: Bomba`), no
 * una colección aparte.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Equipo.name, schema: EquipoSchema },
      { name: CatalogoMonitoreo.name, schema: CatalogoMonitoreoSchema },
      { name: ComponenteEquipo.name, schema: ComponenteEquipoSchema },
      { name: IntervencionEquipo.name, schema: IntervencionEquipoSchema },
      { name: ReporteMonitoreo.name, schema: ReporteMonitoreoSchema },
      { name: CorrelativoMonitoreo.name, schema: CorrelativoMonitoreoSchema },
      { name: PlantillaMonitoreo.name, schema: PlantillaMonitoreoSchema },
      // El PDF lleva el nombre de quien elaboró y revisó, no su usuario.
      { name: Trabajador.name, schema: TrabajadorSchema },
    ]),
    // Por `ResolucionOrganizacionalService`: el área Confiabilidad se busca
    // con las mismas reglas que el importador del inventario.
    EquiposModule,
    UbicacionModule,
    ClasificacionModule,
    ConfigFormularioModule,
  ],
  controllers: [MonitoreoEquiposController, ReportesMonitoreoController],
  providers: [
    MonitoreoCatalogosService,
    BombasService,
    ImportadorPlanillaService,
    AntecedentesMonitoreoService,
    ArchivosMonitoreoService,
    CorrelativosMonitoreoService,
    PlantillasMonitoreoService,
    ReportesMonitoreoService,
    ReportePdfService,
  ],
})
export class MonitoreoEquiposModule {}
