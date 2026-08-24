import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'es_publico';

/**
 * Marca una ruta como accesible sin autenticación.
 *
 * Existe porque el guard de autenticación es **global**: todo endpoint nace
 * cerrado y hay que abrirlo explícitamente. Es el sentido inverso al anterior
 * —donde cada controlador decidía si protegerse— y evita que un módulo nuevo
 * quede expuesto porque alguien olvidó poner `@UseGuards`.
 *
 * Úsalo solo en rutas que de verdad deban ser anónimas (login, refresh,
 * health) o que validen credenciales por su cuenta.
 */
export const Publico = () => SetMetadata(ES_PUBLICO, true);
