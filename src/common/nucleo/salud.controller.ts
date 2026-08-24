import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Publico } from './publico.decorator';

/**
 * Sondas de salud.
 *
 * `main.ts` anunciaba `/health` desde hace tiempo, pero la ruta no existía: el
 * único endpoint `health` vivía dentro de `ml-recomendations` y solo hablaba
 * del servicio de ML.
 *
 * Se separan las dos preguntas que un orquestador hace, porque tienen
 * consecuencias distintas:
 *
 * - **`/health`** (liveness): ¿el proceso responde? Si falla, hay que
 *   reiniciarlo. No consulta dependencias a propósito: una caída de Mongo no
 *   debe provocar un bucle de reinicios que no arregla nada.
 * - **`/health/ready`** (readiness): ¿puede atender tráfico? Si falla, hay que
 *   sacarlo del balanceador, no reiniciarlo.
 */
@ApiTags('salud')
@Controller('health')
export class SaludController {
  constructor(
    private readonly salud: HealthCheckService,
    private readonly mongo: MongooseHealthIndicator,
  ) {}

  @Get()
  @Publico()
  @ApiOperation({ summary: 'Liveness: el proceso está vivo' })
  vivo() {
    return { estado: 'ok', momento: new Date().toISOString() };
  }

  @Get('ready')
  @Publico()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness: puede atender tráfico (incluye Mongo)' })
  listo() {
    return this.salud.check([
      () => this.mongo.pingCheck('mongodb', { timeout: 3000 }),
    ]);
  }
}
