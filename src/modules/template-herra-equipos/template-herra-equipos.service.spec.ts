import { Test, TestingModule } from '@nestjs/testing';
import { TemplateHerraEquiposService } from './template-herra-equipos.service';

describe('TemplateHerraEquiposService', () => {
  let service: TemplateHerraEquiposService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateHerraEquiposService],
    }).compile();

    service = module.get<TemplateHerraEquiposService>(TemplateHerraEquiposService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
