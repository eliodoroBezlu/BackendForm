import { Test, TestingModule } from '@nestjs/testing';
import { TemplateHerraEquiposController } from './template-herra-equipos.controller';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';

/**
 * Comprueba que TemplateHerraEquiposController se instancia con todas sus dependencias
 * resueltas — es decir, que el constructor y los tokens de inyección
 * siguen coincidiendo.
 *
 * Este spec venía generado por `nest generate` sin proveer ninguna
 * dependencia, así que Nest no podía construir la clase y fallaba antes
 * de llegar a la aserción.
 */
describe('TemplateHerraEquiposController', () => {
  let controller: TemplateHerraEquiposController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateHerraEquiposController],
      providers: [{ provide: TemplateHerraEquiposService, useValue: {} }],
    }).compile();

    controller = module.get<TemplateHerraEquiposController>(
      TemplateHerraEquiposController,
    );
  });

  it('se instancia con sus dependencias resueltas', () => {
    expect(controller).toBeDefined();
  });
});
