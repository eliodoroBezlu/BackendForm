import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';
import { TemplateHerraEquipos } from './schema/template-herra-equipo.schema';

/**
 * Comprueba que TemplateHerraEquiposService se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('TemplateHerraEquiposService', () => {
  let service: TemplateHerraEquiposService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateHerraEquiposService,
        { provide: getModelToken(TemplateHerraEquipos.name), useValue: {} },
      ],
    }).compile();

    service = module.get<TemplateHerraEquiposService>(
      TemplateHerraEquiposService,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(service).toBeDefined();
  });
});
