import { Test, TestingModule } from '@nestjs/testing';
import { InspectionsHerraEquiposController } from './inspection-herra-equipos.controller';
import { InspectionsHerraEquiposService } from './inspection-herra-equipos.service';

describe('InspectionHerraEquiposController', () => {
  let controller: InspectionsHerraEquiposController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InspectionsHerraEquiposController],
      providers: [InspectionsHerraEquiposService],
    }).compile();

    controller = module.get<InspectionsHerraEquiposController>(InspectionsHerraEquiposController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
