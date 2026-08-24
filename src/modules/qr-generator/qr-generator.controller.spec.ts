import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { QrGeneratorController } from './qr-generator.controller';
import { QrGeneratorService } from './qr-generator.service';

/**
 * Los parámetros llegan por la URL, así que **todos son cadenas**. Lo que se
 * fija aquí es la conversión a número y las cabeceras de la respuesta: son lo
 * que decide si el navegador muestra el QR o se lo descarga.
 */
describe('QrGeneratorController', () => {
  let controller: QrGeneratorController;
  let servicio: Record<string, jest.Mock>;

  const respuesta = () => {
    const res = {
      set: jest.fn(),
      send: jest.fn(),
      type: jest.fn(),
    };
    return res as unknown as Response & typeof res;
  };

  beforeEach(async () => {
    servicio = {
      generateQRDataURL: jest.fn().mockResolvedValue('data:image/png;base64,x'),
      generateQRBuffer: jest.fn().mockResolvedValue(Buffer.from('png')),
      generateQRSVG: jest.fn().mockResolvedValue('<svg></svg>'),
      generateQRComplete: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QrGeneratorController],
      providers: [{ provide: QrGeneratorService, useValue: servicio }],
    }).compile();

    controller = module.get<QrGeneratorController>(QrGeneratorController);
  });

  describe('conversion de los parametros de la URL', () => {
    it('el ancho llega como texto y se convierte a numero', async () => {
      await controller.getQRImage('TAG-001', respuesta(), '512');

      const [, opciones] = servicio.generateQRBuffer.mock.calls[0] as [
        string,
        { width: number },
      ];
      expect(opciones.width).toBe(512);
      expect(typeof opciones.width).toBe('number');
    });

    it('un parametro ausente queda undefined, no NaN', async () => {
      // `parseInt(undefined)` da NaN, y un NaN llegaria hasta la libreria.
      await controller.getQRImage('TAG-001', respuesta());

      const [, opciones] = servicio.generateQRBuffer.mock.calls[0] as [
        string,
        { width?: number; margin?: number },
      ];
      expect(opciones.width).toBeUndefined();
      expect(opciones.margin).toBeUndefined();
    });
  });

  describe('cabeceras de la respuesta', () => {
    it('por defecto el QR se muestra en el navegador', async () => {
      const res = respuesta();

      await controller.getQRImage('TAG-001', res);

      const cabeceras = res.set.mock.calls[0][0] as Record<string, string>;
      expect(cabeceras['Content-Disposition']).toContain('inline');
      expect(cabeceras['Content-Type']).toBe('image/png');
    });

    it('con download=true se descarga como archivo', async () => {
      const res = respuesta();

      await controller.getQRImage(
        'TAG-001',
        res,
        undefined,
        undefined,
        undefined,
        'true',
      );

      const cabeceras = res.set.mock.calls[0][0] as Record<string, string>;
      expect(cabeceras['Content-Disposition']).toContain('attachment');
    });

    it('cualquier otro valor de download NO fuerza la descarga', async () => {
      // Solo la cadena «true» cuenta; «1» o «yes» no.
      const res = respuesta();

      await controller.getQRImage(
        'TAG-001',
        res,
        undefined,
        undefined,
        undefined,
        '1',
      );

      const cabeceras = res.set.mock.calls[0][0] as Record<string, string>;
      expect(cabeceras['Content-Disposition']).toContain('inline');
    });

    it('declara el tamaño real del contenido', async () => {
      const res = respuesta();

      await controller.getQRImage('TAG-001', res);

      const cabeceras = res.set.mock.calls[0][0] as Record<string, string>;
      expect(cabeceras['Content-Length']).toBe('3'); // Buffer 'png'
    });
  });
});
