/**
 * Los archivos del reporte (fotos y gráfico) **no** van a `uploads/`: esa
 * carpeta se sirve como estático público, sin sesión, y el reporte es solo
 * de Confiabilidad. Se guardan aparte y se entregan por un endpoint con el
 * rol.
 */

/** Nombre que el servidor le pone a cada archivo: un UUID y su formato. */
export const FORMA_ARCHIVO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

export enum UsoDeImagen {
  FOTO = 'foto',
  GRAFICO = 'grafico',
}

/**
 * Lado mayor en píxeles. El gráfico ocupa 21,9 cm de ancho: a 300 ppp son
 * ~2600 px. Una foto ocupa a lo sumo la mitad del ancho; 1600 px sobran.
 * Nunca se agranda una imagen chica (la FLIR E95 saca 464 × 348).
 */
export const LADO_MAXIMO: Record<UsoDeImagen, number> = {
  [UsoDeImagen.FOTO]: 1600,
  [UsoDeImagen.GRAFICO]: 2600,
};

export const MIME_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

/** 15 MB: una captura de PI en PNG sin comprimir puede pasar los 10. */
export const TAMANO_MAXIMO_IMAGEN = 15 * 1024 * 1024;
