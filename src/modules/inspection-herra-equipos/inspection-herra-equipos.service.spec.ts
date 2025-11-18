import { Test, TestingModule } from '@nestjs/testing';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';

describe('InspectionHerraEquiposService', () => {
  let service: InspectionsHerraEquiposService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InspectionsHerraEquiposService],
    }).compile();

    service = module.get<InspectionsHerraEquiposService>(InspectionsHerraEquiposService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
