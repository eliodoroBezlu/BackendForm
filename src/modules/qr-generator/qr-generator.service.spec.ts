import { BadRequestException } from '@nestjs/common';
import { QrGeneratorService } from './qr-generator.service';

/**
 * No necesita `TestingModule`: el servicio no inyecta nada. Se ejercita
 * generando códigos de verdad y comprobando lo que sale.
 */
describe('QrGeneratorService', () => {
  const servicio = new QrGeneratorService();

  describe('validacion del texto', () => {
    it('un texto vacio se rechaza', async () => {
      await expect(servicio.generateQRDataURL('')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('solo espacios tambien se rechaza', async () => {
      await expect(servicio.generateQRDataURL('   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('un texto mas largo de lo que cabe se rechaza', async () => {
      // El maximo depende del nivel de correccion: con «M» (el de por
      // defecto) caben 2331 caracteres, no los 2953 del nivel «L».
      await expect(
        servicio.generateQRDataURL('a'.repeat(2332)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el mensaje dice cuantos caracteres caben y cuantos llegaron', async () => {
      // «Es demasiado largo» a secas no dice cuanto recortar.
      await expect(
        servicio.generateQRDataURL('a'.repeat(2500)),
      ).rejects.toThrow(/2500.*2331/);
    });

    it('justo en el limite del nivel por defecto si se acepta', async () => {
      await expect(
        servicio.generateQRDataURL('a'.repeat(2331)),
      ).resolves.toContain('data:image');
    }, 20_000);

    it('con menos correccion de errores cabe mas texto', async () => {
      // 2500 no cabe con «M» pero si con «L».
      await expect(
        servicio.generateQRDataURL('a'.repeat(2500), {
          errorCorrectionLevel: 'L',
        }),
      ).resolves.toContain('data:image');
    }, 20_000);

    it('con mas correccion de errores cabe menos', async () => {
      // 2000 cabe con «M» pero no con «H».
      await expect(
        servicio.generateQRDataURL('a'.repeat(2000), {
          errorCorrectionLevel: 'H',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('generateQRDataURL', () => {
    it('devuelve una data URL de imagen, no undefined', async () => {
      // Regresion: cuando `getDefaultOptions` devolvia `any`, TypeScript
      // resolvia la sobrecarga de callback y esto era `undefined` en runtime.
      const url = await servicio.generateQRDataURL('TAG-001');

      expect(typeof url).toBe('string');
      expect(url.startsWith('data:image/')).toBe(true);
      expect(url.length).toBeGreaterThan(100);
    });

    it('el mismo texto produce siempre el mismo codigo', async () => {
      const uno = await servicio.generateQRDataURL('TAG-001');
      const dos = await servicio.generateQRDataURL('TAG-001');

      expect(uno).toBe(dos);
    }, 20_000);

    it('textos distintos producen codigos distintos', async () => {
      const uno = await servicio.generateQRDataURL('TAG-001');
      const dos = await servicio.generateQRDataURL('TAG-002');

      expect(uno).not.toBe(dos);
    }, 20_000);
  });

  describe('generateQRBuffer', () => {
    it('devuelve un Buffer con contenido PNG', async () => {
      const buffer = await servicio.generateQRBuffer('TAG-001');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      // Firma de un PNG.
      expect(buffer.subarray(1, 4).toString()).toBe('PNG');
    });
  });

  describe('generateQRSVG', () => {
    it('devuelve SVG, no una imagen rasterizada', async () => {
      const svg = await servicio.generateQRSVG('TAG-001');

      expect(svg).toContain('<svg');
      expect(svg).not.toContain('data:image');
    });
  });

  describe('opciones', () => {
    // Genera dos PNG de verdad; con la suite completa en paralelo puede
    // pasar del limite por defecto de 5 s, de ahi el timeout explicito.
    it('un ancho mayor produce una imagen mas grande', async () => {
      const pequeno = await servicio.generateQRBuffer('TAG-001', {
        width: 128,
      });
      const grande = await servicio.generateQRBuffer('TAG-001', {
        width: 512,
      });

      expect(grande.length).toBeGreaterThan(pequeno.length);
    }, 20_000);

    it('sin opciones usa los valores por defecto sin fallar', async () => {
      await expect(servicio.generateQRDataURL('TAG-001')).resolves.toContain(
        'data:image',
      );
    });
  });
});
