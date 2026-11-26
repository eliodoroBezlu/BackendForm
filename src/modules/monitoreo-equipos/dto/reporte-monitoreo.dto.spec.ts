import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearReporteMonitoreoDto } from './reporte-monitoreo.dto';

const errores = async (datos: Record<string, unknown>) => {
  const dto = plainToInstance(CrearReporteMonitoreoDto, {
    tag: '230PP013',
    fecha: '2026-11-18',
    ...datos,
  });
  const fallas = await validate(dto);
  const mensajes = (f: (typeof fallas)[number]): string[] => [
    ...Object.values(f.constraints ?? {}),
    ...(f.children ?? []).flatMap(mensajes),
  ];
  return fallas.flatMap(mensajes);
};

describe('lo que acepta la API del reporte (retroalimentación 2026-11-18)', () => {
  it('el N° de OT lleva solo números; vacío lo borra', async () => {
    expect(await errores({ ot: '952013' })).toEqual([]);
    expect(await errores({ ot: '' })).toEqual([]);
    expect(await errores({ ot: 'OT-952013' })).toEqual([
      'El N° de OT lleva solo números',
    ]);
  });

  it('el informe anterior es un enlace', async () => {
    expect(
      await errores({
        informe_anterior_url: 'https://empresa.sharepoint.com/x.pdf',
      }),
    ).toEqual([]);
    expect(await errores({ informe_anterior_url: '' })).toEqual([]);
    expect(await errores({ informe_anterior_url: 'COTEM-0136' })).toEqual([
      'El informe anterior tiene que ser un enlace (https://…)',
    ]);
  });

  it('las piezas son las cuatro del formato, con horas no negativas', async () => {
    expect(
      await errores({
        piezas: [{ pieza: 'Voluta', horas_trabajo: 2601, proveedor: 'WEIR' }],
      }),
    ).toEqual([]);
    expect(
      await errores({
        piezas: [{ pieza: 'Rodete' }, { pieza: 'Voluta', horas_trabajo: -1 }],
      }),
    ).toHaveLength(2);
  });

  it('las horas del día son un número', async () => {
    expect(await errores({ lecturas: { horas: '836 hrs' } })).not.toEqual([]);
    expect(
      await errores({ lecturas: { horas: 836, emisividad: 0.95 } }),
    ).toEqual([]);
  });
});
