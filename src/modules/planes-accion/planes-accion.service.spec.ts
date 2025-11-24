import { Test, TestingModule } from '@nestjs/testing';
import { PlanesAccionService } from './planes-accion.service';

describe('PlanesAccionService', () => {
  let service: PlanesAccionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlanesAccionService],
    }).compile();

    service = module.get<PlanesAccionService>(PlanesAccionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
