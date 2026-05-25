import { Test, TestingModule } from '@nestjs/testing';
import { PgrController } from './pgr.controller';
import { PgrService } from './pgr.service';
import { CreatePgrDto } from './dto/create-pgr.dto';
import { UpdatePgrDto } from './dto/update-pgr.dto';
import { AprobarPgrDto } from './dto/aprobar-pgr.dto';
import { SeguimientoPgrDto } from './dto/seguimiento-pgr.dto';
import { ActividadEstado, PgrEstado } from './schemas/pgr.schema';

describe('PgrController', () => {
  let controller: PgrController;
  let service: PgrService;

  const mockPgrService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    aprobar: jest.fn(),
    addSeguimiento: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PgrController],
      providers: [
        {
          provide: PgrService,
          useValue: mockPgrService,
        },
      ],
    }).compile();

    controller = module.get<PgrController>(PgrController);
    service = module.get<PgrService>(PgrService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new PGR', async () => {
      const createPgrDto: CreatePgrDto = {
        empresa: 'Empresa Test',
        gerencia: 'Gerencia Test',
        superintendencia: 'Sup Test',
        vicepresidencia: 'VP Test',
        gestion: '2026',
      };
      const result = { _id: '1', ...createPgrDto, codigoAutogenerado: 'PLAN-2026-0001' };
      
      mockPgrService.create.mockResolvedValue(result);

      expect(await controller.create(createPgrDto)).toEqual(result);
      expect(service.create).toHaveBeenCalledWith(createPgrDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of PGRs', async () => {
      const result = [{ _id: '1', empresa: 'Test' }];
      mockPgrService.findAll.mockResolvedValue(result);

      expect(await controller.findAll()).toEqual(result);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single PGR', async () => {
      const result = { _id: '1', empresa: 'Test' };
      mockPgrService.findOne.mockResolvedValue(result);

      expect(await controller.findOne('1')).toEqual(result);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });
  });

  describe('update', () => {
    it('should update a PGR', async () => {
      const updateDto: UpdatePgrDto = { empresa: 'Updated Empresa' };
      const result = { _id: '1', empresa: 'Updated Empresa' };
      
      mockPgrService.update.mockResolvedValue(result);

      expect(await controller.update('1', updateDto)).toEqual(result);
      expect(service.update).toHaveBeenCalledWith('1', updateDto);
    });
  });

  describe('aprobar', () => {
    it('should approve/reject actvities in a PGR', async () => {
      const aprobarDto: AprobarPgrDto = {
        aprobadoPor: 'Admin',
        actividadesAprobacion: [{
            _id: 'a1',
            estadoAprobacion: ActividadEstado.APROBADO
        }]
      };
      const result = { _id: '1', estado: PgrEstado.APROBADO };
      
      mockPgrService.aprobar.mockResolvedValue(result);

      expect(await controller.aprobar('1', aprobarDto)).toEqual(result);
      expect(service.aprobar).toHaveBeenCalledWith('1', aprobarDto);
    });
  });

  describe('addSeguimiento', () => {
    it('should add seguimiento to an activity', async () => {
      const seguimientoDto: SeguimientoPgrDto = {
        semaforoTiempo: 'En el Mes',
      };
      const result = { _id: '1', actividades: [{ _id: 'a1', semaforoTiempo: 'En el Mes' }] };
      
      mockPgrService.addSeguimiento.mockResolvedValue(result);

      expect(await controller.addSeguimiento('1', 'a1', seguimientoDto)).toEqual(result);
      expect(service.addSeguimiento).toHaveBeenCalledWith('1', 'a1', seguimientoDto);
    });
  });

  describe('remove', () => {
    it('should remove a PGR', async () => {
      const result = { _id: '1' };
      mockPgrService.remove.mockResolvedValue(result);

      expect(await controller.remove('1')).toEqual(result);
      expect(service.remove).toHaveBeenCalledWith('1');
    });
  });
});
