import { BadRequestException } from '@nestjs/common';
import { PrestamosSpccService } from './prestamos-spcc.service';
import { CrearSolicitudDto } from './dto/prestamos.dto';

/**
 * Las reglas del plazo y de lo pedido son lógica pura: no tocan Mongo ni las
 * firmas. Por eso el servicio se construye con dependencias nulas — instanciar
 * el módulo entero para comprobar una comparación de fechas solo añadiría
 * formas de que la prueba falle por motivos ajenos a lo que mide.
 */
const servicio = () =>
  new PrestamosSpccService(
    null as never,
    null as never,
    null as never,
    null as never,
  );

/** `YYYY-MM-DD` de hoy en la zona local, que es lo que manda un `<input date>`. */
const enDias = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const validarPlazo = (dto: Partial<CrearSolicitudDto>) =>
  (
    servicio() as unknown as {
      validarPlazo: (d: Partial<CrearSolicitudDto>) => {
        inicio: Date;
        devolucion: Date;
      };
    }
  ).validarPlazo(dto);

const validarSolicitado = (
  lineas: { tipoEquipo: string; cantidad: number }[],
) =>
  (
    servicio() as unknown as {
      validarSolicitado: (
        l: { tipoEquipo: string; cantidad: number }[],
      ) => { tipoEquipo: string; cantidad: number }[];
    }
  ).validarSolicitado(lineas);

describe('PrestamosSpccService · plazo del préstamo', () => {
  it('acepta un préstamo que empieza hoy', () => {
    // La regresión que motivó esta prueba: `new Date('2026-08-21')` es
    // medianoche **UTC**, que en UTC−4 cae a las 20:00 del día anterior. Al
    // compararla con un «hoy» local, el día de hoy quedaba en el pasado y no
    // se podía pedir nada para el mismo día.
    const { inicio } = validarPlazo({
      fechaInicioPrevista: enDias(0),
      fechaDevolucionPrevista: enDias(7),
    });

    const hoy = new Date();
    expect(inicio.getFullYear()).toBe(hoy.getFullYear());
    expect(inicio.getMonth()).toBe(hoy.getMonth());
    expect(inicio.getDate()).toBe(hoy.getDate());
    // Medianoche local, no las 20:00 del día anterior.
    expect(inicio.getHours()).toBe(0);
  });

  it('rechaza un inicio en el pasado', () => {
    expect(() =>
      validarPlazo({
        fechaInicioPrevista: enDias(-1),
        fechaDevolucionPrevista: enDias(7),
      }),
    ).toThrow(BadRequestException);
  });

  it('rechaza que la devolución sea anterior al inicio', () => {
    expect(() =>
      validarPlazo({
        fechaInicioPrevista: enDias(5),
        fechaDevolucionPrevista: enDias(2),
      }),
    ).toThrow(BadRequestException);
  });

  it('acepta un préstamo de un solo día', () => {
    const mismo = enDias(3);
    const { inicio, devolucion } = validarPlazo({
      fechaInicioPrevista: mismo,
      fechaDevolucionPrevista: mismo,
    });
    expect(devolucion.getTime()).toBe(inicio.getTime());
  });

  it('sin fecha de inicio toma hoy', () => {
    // Es lo que hacían las solicitudes anteriores a este campo.
    const { inicio } = validarPlazo({ fechaDevolucionPrevista: enDias(7) });
    expect(inicio.getDate()).toBe(new Date().getDate());
  });
});

describe('PrestamosSpccService · lo que se pide', () => {
  it('agrupa las cantidades repetidas de un mismo tipo', () => {
    // El formulario no debería mandarlo dos veces, pero si lo hace, lo que
    // quiso decir son tres arneses, no un error.
    expect(
      validarSolicitado([
        { tipoEquipo: 'Arnes', cantidad: 2 },
        { tipoEquipo: 'Arnes', cantidad: 1 },
      ]),
    ).toEqual([{ tipoEquipo: 'Arnes', cantidad: 3 }]);
  });

  it('conserva los tipos distintos', () => {
    expect(
      validarSolicitado([
        { tipoEquipo: 'Arnes', cantidad: 2 },
        { tipoEquipo: 'ConectorTT', cantidad: 1 },
      ]),
    ).toEqual([
      { tipoEquipo: 'Arnes', cantidad: 2 },
      { tipoEquipo: 'ConectorTT', cantidad: 1 },
    ]);
  });

  it('rechaza un tipo que no es SPCC prestable', () => {
    expect(() =>
      validarSolicitado([{ tipoEquipo: 'Taladro', cantidad: 1 }]),
    ).toThrow(BadRequestException);
  });

  it('rechaza una solicitud sin nada pedido', () => {
    expect(() => validarSolicitado([])).toThrow(BadRequestException);
  });

  it('rechaza una solicitud cuyas cantidades son todas cero', () => {
    // Es el estado inicial del formulario: si se envía sin tocar nada, la
    // lista llega llena de ceros y no de vacío.
    expect(() =>
      validarSolicitado([{ tipoEquipo: 'Arnes', cantidad: 0 }]),
    ).toThrow(BadRequestException);
  });
});
