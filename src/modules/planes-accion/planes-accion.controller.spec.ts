import { Test, TestingModule } from '@nestjs/testing';
import { PlanesAccionController } from './planes-accion.controller';
import { PlanesAccionService } from './planes-accion.service';

describe('PlanesAccionController', () => {
  let controller: PlanesAccionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanesAccionController],
      providers: [PlanesAccionService],
    }).compile();

    controller = module.get<PlanesAccionController>(PlanesAccionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
