import { Test, TestingModule } from '@nestjs/testing';
import { TemplateHerraEquiposController } from './template-herra-equipos.controller';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';

describe('TemplateHerraEquiposController', () => {
  let controller: TemplateHerraEquiposController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateHerraEquiposController],
      providers: [TemplateHerraEquiposService],
    }).compile();

    controller = module.get<TemplateHerraEquiposController>(TemplateHerraEquiposController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
