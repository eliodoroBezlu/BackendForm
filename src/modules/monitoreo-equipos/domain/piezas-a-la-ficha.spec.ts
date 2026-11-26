import { cambiosEnLaFicha, PiezaVigente } from './piezas-a-la-ficha';

const dia = (a: number, m: number, d: number) =>
  new Date(Date.UTC(a, m - 1, d));

const voluta: PiezaVigente = {
  id: 'v1',
  pieza: 'Voluta',
  fecha_instalacion: dia(2026, 4, 14),
  proveedor: 'Weir Vulco',
  material: 'Alto cromo',
};

describe('piezas del reporte a la ficha de la bomba', () => {
  it('una pieza que la bomba no tenía se crea', () => {
    expect(
      cambiosEnLaFicha(
        [
          {
            pieza: 'Impulsor',
            proveedor: 'ALTONA',
            fecha_instalacion: dia(2026, 4, 14),
          },
        ],
        [voluta],
      ),
    ).toEqual([
      {
        accion: 'crear',
        pieza: 'Impulsor',
        datos: { proveedor: 'ALTONA', fecha_instalacion: dia(2026, 4, 14) },
      },
    ]);
  });

  it('la misma pieza: solo se actualiza lo que cambió', () => {
    expect(
      cambiosEnLaFicha(
        [
          {
            pieza: 'Voluta',
            fecha_instalacion: dia(2026, 4, 14),
            proveedor: 'Weir Vulco',
            condicion_inicial: 'Nuevo',
          },
        ],
        [voluta],
      ),
    ).toEqual([
      {
        accion: 'actualizar',
        pieza: 'Voluta',
        id: 'v1',
        datos: { condicion_inicial: 'Nuevo' },
      },
    ]);
  });

  it('nada distinto, nada que hacer; lo vacío en el reporte no borra la ficha', () => {
    expect(
      cambiosEnLaFicha(
        [
          { pieza: 'Voluta', proveedor: 'Weir Vulco', material: '' },
          { pieza: 'Impulsor' },
        ],
        [voluta],
      ),
    ).toEqual([]);
  });

  it('otra fecha de instalación es otra pieza: se retira la anterior', () => {
    expect(
      cambiosEnLaFicha(
        [
          {
            pieza: 'Voluta',
            fecha_instalacion: dia(2026, 11, 2),
            proveedor: 'ALTONA',
          },
        ],
        [voluta],
      ),
    ).toEqual([
      {
        accion: 'reemplazar',
        pieza: 'Voluta',
        id: 'v1',
        // Material no se escribió: queda el que mostraba el reporte (el de la ficha).
        datos: {
          proveedor: 'ALTONA',
          material: 'Alto cromo',
          fecha_instalacion: dia(2026, 11, 2),
        },
      },
    ]);
  });

  it('una fecha anterior a la de la pieza montada no retrocede la ficha', () => {
    expect(
      cambiosEnLaFicha(
        [
          {
            pieza: 'Voluta',
            fecha_instalacion: dia(2025, 1, 1),
            proveedor: 'Otro',
          },
        ],
        [voluta],
      ),
    ).toEqual([]);
  });

  it('la ficha sin fecha toma la que trae el reporte', () => {
    expect(
      cambiosEnLaFicha(
        [{ pieza: 'Voluta', fecha_instalacion: dia(2026, 4, 14) }],
        [{ ...voluta, fecha_instalacion: undefined }],
      ),
    ).toEqual([
      {
        accion: 'actualizar',
        pieza: 'Voluta',
        id: 'v1',
        datos: { fecha_instalacion: dia(2026, 4, 14) },
      },
    ]);
  });
});
