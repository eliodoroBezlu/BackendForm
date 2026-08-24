# Análisis del backend — buenas prácticas y plan de mejora

**Fecha:** 2026-08-18
**Alcance:** `BackendForm/BackendForm/src` — NestJS 11 + MongoDB/Mongoose
**Estado:** documento de análisis. Nada de esto está aplicado todavía.

---

## 0. Cómo se midió

Todas las cifras de este documento salen de conteos sobre el código real, no de
impresiones:

| Métrica | Valor |
|---|---|
| Archivos `.ts` | 356 |
| Líneas (sin specs) | 47.520 |
| Módulos en `src/modules/` | 29 |
| Specs (`*.spec.ts`) | 50 |
| Ocurrencias de `any` fuera de tests | 147 |
| Esquemas Mongoose | 31 |
| Índices declarados | 60 |
| DTOs de entrada | 78 |
| DTOs de salida | **0** |
| `startSession` / `withTransaction` | **0** |
| `find()` sin `limit` | 109 |
| `.lean()` | 16 |
| `console.*` | 56 |
| `new Logger()` | 58 |
| **Errores de ESLint (`yarn lint`)** | **1.662** |
| Avisos de ESLint | 139 |

---

## 1. Lo que ya está bien

Antes de la lista de problemas, conviene fijar lo que **no** hay que tocar,
porque es lo más caro de recuperar si se pierde.

### 1.1 Los límites entre módulos están limpios

Se buscaron imports de un service hacia otro módulo (`from '../../modules/...'`
dentro de archivos `*.service.ts`): **cero ocurrencias**. Los módulos se comunican
por el sistema de inyección de Nest, no por rutas relativas cruzadas. Esto es poco
frecuente en un monolito de este tamaño y es la base de que el proyecto pueda
crecer sin volverse un ovillo.

### 1.2 `strictNullChecks` ya está activo

En `tsconfig.json`. Es la mitad cara de `strict` y ya está pagada.

### 1.3 Modelo de datos con invariantes en la base

60 índices sobre 31 esquemas, incluidos índices únicos parciales que hacen
cumplir reglas de negocio a nivel de motor (por ejemplo
`un_prestamo_activo_por_equipo` en `prestamos-spcc`). Eso es más robusto que
validarlo solo en el service.

### 1.4 Auditoría global ya resuelta

`common/auditoria/` registra qué se hizo y quién lo hizo mediante un
`APP_INTERCEPTOR`, sin que cada módulo tenga que pedirlo.

### 1.5 Cuatro módulos ya tienen `domain/` — y son los que mejor están testeados

`matriz-riesgos`, `pgr`, `planes-accion` y `template-herra-equipos` separan
lógica pura en una carpeta `domain/`.

**No es casualidad que sean exactamente los módulos con tests de verdad.**
Este dato es el argumento central de la Fase 3 más abajo: el patrón que funciona
ya existe dentro del repositorio, no hay que inventarlo ni importarlo.

---

## 2. Sobre la estructura que planteas

> «dentro de modules el nombre del módulo la carpeta y que contenga el module,
> controller, service y los jest correspondientes»

**Eso ya está aplicado en los 29 módulos.** Ahí no hay trabajo pendiente.

El problema no es *dónde viven los archivos* sino **qué hay dentro del service**:

| Módulo | LOC | Observación |
|---|---|---|
| `inspection-herra-equipos` | 10.674 | 15 generadores de Excel casi duplicados |
| `matriz-riesgos` | 5.917 | 2.087 son un fixture de test |
| `instances` | 5.232 | |
| `pgr` | 3.210 | |
| `planes-accion` | 2.082 | |

Archivos individuales más grandes:

- `excel-generator/arnes.service.ts` — 1.194 líneas
- `matriz-riesgos.service.ts` — 756
- `equipment-tracking.service.ts` — 739
- `instances.service.ts` — 720
- `planes-accion.service.ts` — 681

---

## 3. Hallazgos por gravedad

### P0 — Riesgo activo

#### P0-1. `main.ts` escribe el body y las cookies de cada request en el log

`src/main.ts:24-28`

```ts
app.use((req, res, next) => {
  console.log('📨 Request to:', req.method, req.url);
  console.log('📦 Body:', req.body);
  console.log('🍪 Cookies:', req.cookies);
  next();
});
```

En `POST /auth/login` esto imprime **la contraseña en texto plano**. En todas las
demás rutas imprime el **access token y el refresh token** (van en cookies
HTTP-only, que protegen contra JavaScript del navegador pero no contra esto).

Cualquier persona con acceso a los logs —o cualquier agregador al que se envíen—
obtiene sesiones activas y credenciales.

**Es lo primero a corregir, con independencia del resto del plan.**

#### P0-2. La autenticación es opt-in, no por defecto — ✅ RESUELTO en Fase 1

> **Corrección respecto a la primera versión de este documento.** Al inventariar
> los controladores uno por uno resultó que **27 de 30 ya declaraban
> `JwtAuthGuard` a nivel de clase**. La exposición real era mucho menor de lo que
> sugería la redacción original: un solo controlador abierto
> (`ml-recomendations`) más dos rutas de `auth.controller`.
>
> El diagnóstico de fondo seguía siendo correcto —el default estaba invertido— y
> encontró algo peor de lo previsto: `POST /auth/register` era **anónimo** y el
> proxy **no reenvía la identidad del que llama** a IAM Core, solo la
> `X-Api-Key` del servicio. Es decir, IAM no podía saber quién pedía el alta.
> Ahora exige rol admin en BackendForm.

No existe ningún `APP_GUARD` registrado (se verificó: el único proveedor global
es el interceptor de auditoría). Cada controller decide si se protege a sí mismo.

Resultado medido: `modules/ml-recomendations/ml-recomendations.controller.ts`
tiene **0 guards** — está abierto.

El default correcto es el inverso: guard global de autenticación más un decorador
`@Public()` explícito donde se quiera abrir. Así **un módulo nuevo nace cerrado**
en vez de nacer abierto y depender de que alguien se acuerde.

#### P0-3. No hay limitación de tasa

`@nestjs/throttler` no está en las dependencias. `/auth/login` admite fuerza bruta
sin fricción alguna.

#### P0-4. No hay filtro de excepciones global

183 bloques `catch` repartidos por el código, cada uno decidiendo su propio
formato de error. Lo que no se atrapa sale como error crudo de Mongoose o de
Node, con detalles internos y con formas de respuesta inconsistentes para el
frontend.

---

### P1 — Tipado

#### P1-1. Los 147 `any` tienen una causa raíz, y no es descuido

```jsonc
// tsconfig.json
"noImplicitAny": false

// eslint.config.mjs
"@typescript-eslint/no-explicit-any": "off"
```

**Ni el compilador ni el linter los prohíben.** Perseguirlos uno a uno sin tocar
estos dos interruptores es trabajo que se deshace solo: la próxima sesión de
código vuelve a introducirlos sin que nada avise.

Concentración de la deuda:

| Archivo | `any` |
|---|---|
| `planes-accion/planes-accion.service.ts` | 19 |
| `instances/instances.service.ts` | 13 |
| `inspection-herra-equipos/excel-generator/arnes.service.ts` | 12 |
| `trabajadores/trabajadores.service.ts` | 9 |
| `inspection-herra-equipos/inspection-herra-equipos.service.ts` | 7 |
| `auth/auth.controller.ts` | 7 |

Estos 6 archivos concentran 67 de los 147 (46%).

#### P1-2. `yarn lint` falla con 1.662 errores, y por eso nadie lo mira

Este dato corrige una afirmación previa: el linter **no** está limpio. El comando
termina siempre en código de salida 1, así que dejó de ser una señal útil — no se
puede distinguir un error nuevo entre 1.662 viejos, ni ponerlo como puerta en CI.

Desglose por regla:

| Regla | Errores |
|---|---|
| `no-unsafe-member-access` | 929 |
| `no-unsafe-assignment` | 317 |
| `no-unsafe-argument` | 139 |
| `no-unsafe-call` | 108 |
| `require-await` | 97 |
| `no-unused-vars` | 84 |
| `no-unsafe-return` | 37 |
| `no-require-imports` | 27 |
| `restrict-template-expressions` | 23 |
| `no-base-to-string` | 22 |
| resto | 11 |

**Los primeros cuatro suman 1.493 errores (90%) y son todos la misma causa: la
familia `no-unsafe-*` se dispara al tocar un valor `any`.** Es decir, la deuda de
tipado de P1-1 vista desde el linter. No son 147 problemas sueltos: son 147 focos
que proyectan casi 1.500 señales.

Esto cambia el dimensionamiento de la Fase 2. El objetivo intermedio realista no
es «cero errores» sino **volver a hacer que `yarn lint` termine en verde**, aunque
sea bajando temporalmente las reglas `no-unsafe-*` a aviso, para recuperar el
linter como puerta de calidad y que la deuda deje de crecer sin que nadie se
entere.

`require-await` (97) y `no-unused-vars` (84) son harina de otro costal: no
dependen del tipado y se corrigen de forma mecánica y segura.

#### P1-3. Cero DTOs de salida

Búsqueda de `*response*.dto.ts`: **0 archivos**. Los controllers devuelven
documentos Mongoose directamente.

Consecuencias concretas:

- No hay contrato de API: el frontend depende de la forma interna del esquema.
- Swagger documenta tipos que no corresponden a lo que realmente se envía.
- Todo campo añadido al esquema se publica automáticamente, incluidos los que no
  deberían salir (`__v`, campos internos, datos de otros usuarios en documentos
  anidados).

---

### P2 — Tolerancia a fallas

#### P2-1. Cero transacciones

`startSession` / `withTransaction`: **0 ocurrencias en todo el backend**.

Sí existen escrituras que abarcan varias colecciones:

- `prestamos-spcc`: cabecera `solicitudes_prestamo` + N documentos
  `prestamos_spcc` + actualización de `equipos`.
- `pgr` y `planes-accion`: patrones equivalentes.

Hoy esto se sostiene con invariantes en índices —que está bien pensado y evita
los peores casos— pero un fallo a mitad de operación deja documentos huérfanos o
estados inconsistentes que hay que limpiar a mano.

> **Requisito previo — COMPROBADO (2026-08-19): no se cumple.**
>
> ```
> mongodb://localhost:27017 · MongoDB 8.2.7
> replSetGetStatus → NoReplicationEnabled · setName: (ninguno)
> ```
>
> Es un `mongod` **suelto**, sin replica set. Las transacciones **no funcionan**
> en esta topología, así que la Fase 4 está bloqueada tal cual.
>
> La salida no es un clúster: basta convertir el nodo actual en un **replica set
> de un solo miembro**, que es una configuración soportada y habilita las
> transacciones. Requiere arrancar `mongod` con `--replSet <nombre>` y ejecutar
> `rs.initiate()` una vez. Es una decisión de infraestructura —implica reiniciar
> el servicio— y por tanto del usuario, no de esta refactorización.

#### P2-2. `/health` se anuncia pero no existe

`main.ts` imprime al arrancar:

```
💚 Health check: http://localhost:3002/health
```

Pero el único endpoint con `health` está dentro de
`ml-recomendations.controller.ts:154`. No hay `@nestjs/terminus`, así que no hay
*readiness* real: un orquestador no puede saber si la app está lista para recibir
tráfico ni si perdió la conexión a Mongo.

#### P2-3. Sin `enableShutdownHooks()`

En cada despliegue se cortan las peticiones en vuelo. Una generación de Excel a
medias, una escritura multi-colección a medias.

#### P2-4. Llamadas salientes sin timeout ni reintento

- `HttpModule` está registrado con `timeout: 60000` — un minuto es demasiado
  tiempo bloqueando un worker.
- Las llamadas al servicio ML (`ml-recomendations.service.ts`) y al IAM
  (`auth/iam-proxy.service.ts`) usan `fetch` crudo, sin timeout, sin reintento y
  sin cortacircuitos.

Si el servicio ML se cuelga, el backend se cuelga con él.

#### P2-5. Consultas sin cota

109 `find()` sin `limit` y solo 16 usos de `.lean()`. Sin paginación el coste
crece linealmente con la base: hoy son 2.045 inspecciones, dentro de un año no.

---

### P3 — Consistencia, ruido y código muerto

#### P3-1. Nombres de carpeta inconsistentes

| Convención | Módulos |
|---|---|
| `schema/` (singular) | area, extintor, gerencia, superintendencia, tag, template-herra-equipos, trabajadores |
| `schemas/` (plural) | auth, clasificacion, config-formulario, equipment-tracking, equipos, inspecciones, inspecciones-emergencia, inspection-herra-equipos, instances, linternas, matriz-riesgos, pgr, planes-accion, prestamos-spcc, templates, ubicacion |
| `types/` | equipment-tracking, inspection-herra-equipos |
| `interfaces/` | ml-recomendations |
| `inrterfaces/` | **inspecciones-emergencia — error de tipeo** |

#### P3-2. Nueve clases `entities/` vacías

Restos de `nest generate` que nunca se llenaron:

```ts
// modules/area/entities/area.entity.ts
export class Area {}

// modules/pdf/entities/pdf.entity.ts
export class Pdf {}
```

Presentes en: `area`, `equipment-tracking`, `inspecciones`, `inspection-schedule`,
`ml-recomendations`, `pdf`, `planes-accion`, `qr-generator`, `superintendencia`.

Confunden porque conviven con `schemas/`, que es donde está el modelo real.
La regla 6 del `CLAUDE.md` dice explícitamente: código muerto se elimina.

#### P3-3. Scripts `.cjs` dentro de `src/`

Cinco archivos en `src/modules/*/scripts/`:

- `area/scripts/migrar-catalogo-iam.cjs`
- `config-formulario/scripts/sembrar-config-formularios.cjs`
- `equipos/scripts/migrar-jerarquia-organizacional.cjs`
- `pgr/scripts/migrar-actividades-plural.cjs`
- `template-herra-equipos/scripts/tipo-autoretractil-select.cjs`

No los compila TypeScript, no los cubre ningún test, no los revisa el linter, y
viajan mezclados con el código de producción. Su sitio es una carpeta `scripts/`
en la raíz del proyecto, fuera de `src/`.

#### P3-4. Los tests miden mucho menos de lo que aparentan

De los 50 specs, **29 tienen un único `it()`** cuyo cuerpo es
`expect(service).toBeDefined()`. Ejemplo real (`area.service.spec.ts`):

```ts
it('se instancia con sus dependencias resueltas', () => {
  expect(service).toBeDefined();
});
```

Eso comprueba que la inyección de dependencias sigue cuadrando — tiene algún
valor — pero **no comprueba ni una sola regla de negocio**.

Los tests reales están concentrados en:

| Spec | Tests |
|---|---|
| `matriz-riesgos-edicion.spec.ts` | 26 |
| `linternas.service.spec.ts` | 25 |
| `matriz-riesgos-estados.spec.ts` | 21 |
| `domain/nivel-residual.util.spec.ts` | 21 |
| `pgr-consolidacion.service.spec.ts` | 20 |
| `matriz-riesgos.service.spec.ts` | 19 |
| `matriz-riesgos-import.service.spec.ts` | 18 |
| `equipos/migracion.service.spec.ts` | 15 |
| resto (`pgr`, `firma`, `template-herra-equipos`…) | 2–14 |

**Conclusión:** «298 tests en verde» da una confianza mayor de la que
corresponde. La cobertura real vive en 4 módulos; los otros 25 están sin red.

#### P3-5. Observabilidad dividida

56 `console.*` compitiendo con 58 `new Logger()`. No hay identificador de
petición que permita hilar una traza de punta a punta, así que ante un fallo en
producción no se puede reconstruir qué pasó en una petición concreta.

---

## 4. Los pilares de calidad

La pregunta era por «escalable, funcional, tolerante a fallas y el cuarto».

La tríada clásica, de *Designing Data-Intensive Applications* (Kleppmann), es:

1. **Fiabilidad** (*reliability*) — sigue funcionando correctamente ante fallos.
   → P2 completo.
2. **Escalabilidad** (*scalability*) — el rendimiento se sostiene al crecer la
   carga. → P2-5.
3. **Mantenibilidad** (*maintainability*) — se puede seguir trabajando en él sin
   que cada cambio duela. → P1 y P3.

**El cuarto que probablemente buscabas es «mantenible».**

A esos tres conviene añadir dos que aquí pesan y no suelen nombrarse:

4. **Seguridad** — P0 completo.
5. **Observabilidad** — no se puede ser tolerante a fallas sin poder *ver* las
   fallas. → P3-5.

---

## 5. Plan propuesto

### Fase 0 — ✅ APLICADA (2026-08-18)

Eliminado el middleware de logging de `main.ts:21-28`.

Verificación: `yarn build` correcto; sin ocurrencias de `req.body` / `req.cookies`
en `main.ts`; lint del archivo **13 → 8 errores** (comparado contra copia del
original para confirmar que la mejora es atribuible al cambio).

Requiere reiniciar el proceso del backend para surtir efecto.

**Revisado y descartado en esta fase:** los `console.log` de
`auth.service.ts:176,177,205,221,227,276,297,363,547` registran usuario, ID de
sesión, IP y conteos — **no filtran tokens**. Son ruido de depuración y
corresponden a la Fase 5.

**Detectado de paso, pendiente:** `main.ts` fija a mano `X-Frame-Options`,
`X-Content-Type-Options` y `X-XSS-Protection`, pero **helmet ya los establece**.
El bloque es redundante y `X-XSS-Protection` está obsoleto (los navegadores
modernos lo ignoran; en su día tuvo vulnerabilidades propias). Eliminarlo quita 4
de los 8 errores de lint que quedan en el archivo. Va en la Fase 1.

### Fase 1 — ✅ APLICADA (2026-08-18)

Chasis transversal en `src/common/nucleo/`. Ningún módulo de negocio se modificó.

| Archivo | Qué aporta |
|---|---|
| `nucleo.module.ts` | Registra todo vía `APP_GUARD` / `APP_FILTER` / `APP_INTERCEPTOR` |
| `autenticacion.guard.ts` | Guard global: toda ruta nace cerrada |
| `publico.decorator.ts` | `@Publico()` para abrir explícitamente |
| `excepciones.filter.ts` | Forma única de error; traduce errores de Mongoose |
| `id-peticion.middleware.ts` | `x-request-id` por petición, respeta el entrante |
| `registro.interceptor.ts` | Registro de metadatos — nunca cuerpo ni cookies |
| `salud.controller.ts` | `/health` (liveness) y `/health/ready` (con Mongo) |
| `entorno.validacion.ts` | Aborta el arranque si falta `MONGODB_URI` |

También: `app.enableShutdownHooks()`, `trust proxy` y eliminación del bloque de
cabeceras redundante que duplicaba a helmet.

#### Verificación

17 comprobaciones contra una instancia real levantada en el puerto 3999 —
**todas en verde**—, más `yarn build`, `yarn lint` sobre `common/nucleo` (0
problemas) y la suite completa (50 suites / 298 tests).

Lo relevante que quedó demostrado:

- `/ml-recommendations/health` y `/train`, que estaban **abiertos**, ahora
  devuelven 401 sin token.
- `POST /auth/register` ya no es anónimo.
- `/health/ready` comprueba Mongo de verdad (`{"mongodb":{"status":"up"}}`).
- El error 404 sale con la forma unificada y **sin pila ni rutas internas**.
- El intento 11 de login en un minuto lo corta `ThrottlerGuard`; los 10
  primeros pasan.
- 40 peticiones seguidas a `/health` pasan todas: el límite general no ahoga el
  tráfico normal.

#### Trampa encontrada al verificar (merece quedar escrita)

`ThrottlerGuard` aplica **todos** los limitadores declarados en `forRoot()` a
**todas** las rutas. La primera versión declaraba dos —uno general de 600/min y
uno «de credenciales» de 10/min— con la intención de usar el estricto solo en el
login. El resultado fue que *cualquier* ruta se bloqueaba al undécimo acceso: la
prueba de 40 peticiones a `/health` solo dejó pasar 8.

La forma correcta es declarar **un solo limitador** y sobrescribirlo por ruta con
`@Throttle({ default: { limit, ttl } })`.

#### Hallazgos nuevos, detectados durante la verificación

1. **`AppController` no está registrado en `AppModule`.** La ruta `/` devuelve
   404 y siempre lo hizo. `app.controller.ts`, `app.service.ts` y
   `app.controller.spec.ts` son código muerto — y ese spec es uno de los 29 que
   «pasan» sin probar nada: comprueba un controlador que no está montado.
2. **IAM Core tiene su propio límite de tasa** y responde 429 al arrancar cuando
   se reinicia el backend varias veces seguidas. El sync de áreas y de
   trabajadores lo maneja bien (avisa y se salta), pero conviene saberlo: un 429
   en `/auth/login` puede venir de IAM y no del limitador propio. Se distinguen
   por el mensaje (`ThrottlerException: …` es el nuestro).

### Fase 2 — ✅ APLICADA (2026-08-19)

#### Resultado

| Medida | Antes | Después |
|---|---|---|
| **Errores de `yarn lint`** | **1.662** | **0** |
| Avisos de `yarn lint` | 139 | 1.678 |
| `noImplicitAny` | `false` | **`true`** |
| `strictBindCallApply` | `false` | **`true`** |
| `noFallthroughCasesInSwitch` | `false` | **`true`** |
| Errores de `tsc` | 0 | 0 |
| `no-unsafe-member-access` | 929 | 824 |
| `no-unsafe-assignment` | 317 | 259 |
| `no-unsafe-call` | 108 | 64 |
| `any` en el código | 147 | 144 |

**`yarn lint` vuelve a terminar en verde.** Es el objetivo real de la fase: sin
eso el linter no sirve de puerta y la deuda crece sin que nadie se entere.

El aumento de avisos es esperado y deseado: las reglas que antes eran error
ahora son aviso, y `no-explicit-any` pasó de **apagada** a aviso, lo que hizo
visibles 200 señales que antes no existían.

#### `noImplicitAny` costó mucho menos de lo previsto

La estimación inicial temía una avalancha. Fueron **52 errores**, y la mitad se
resolvió instalando tipos que faltaban.

Seis paquetes sin declaraciones de tipo hacían que TypeScript tratara módulos
enteros como `any`: `bcrypt`, `speakeasy`, `qrcode`, `cookie-parser`,
`passport-jwt` y `passport-local`. Instalar sus `@types` es una línea de
`package.json` y recupera el tipado de todo el módulo de autenticación —donde
más importa—.

#### Dos defectos reales que el `any` estaba tapando

**1. `qr-generator.service.ts` — la firma mentía.**

```ts
private getDefaultOptions(options?: QROptions): any  // ← antes
```

Con `any`, TypeScript resolvía `QRCode.toDataURL(texto, opciones)` contra su
**sobrecarga de callback**, cuyo retorno es `void`. El código declaraba devolver
`Promise<string>` y compilaba igual. Al tipar el retorno aparecieron los tres
errores de golpe. De paso: la opción `height` que se emitía **no existe** en la
librería (el QR es cuadrado, se dimensiona con `width`) y se ignoraba en
silencio.

**2. `auth.service.ts` — QR de 2FA con «undefined» dentro.**

```ts
const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
```

`speakeasy` declara `otpauth_url` como **opcional**. Sin tipos, nadie lo
comprobaba: si el secreto llegaba sin URL, se generaba un QR con la cadena
literal `"undefined"`, la app de 2FA lo escaneaba y quedaba emparejada con
basura **sin ningún error visible**. Ahora falla explícitamente.

#### Hallazgos de código muerto

1. **`grua-cabina.service.ts` (~línea 255)** consulta `config.hasSubsections`,
   pero **ninguna entrada del mapa lo define**: esa rama nunca se cumple. Se
   declaró el campo como opcional para no alterar el comportamiento, pero la
   lógica de «saltar secciones contenedoras» no funciona en este generador.
2. **La firma del supervisor no se escribe en 3 generadores de Excel.** En
   `amoladora`, `equipo-soldar` y `esmeril`, el bloque
   `if (inspection.supervisorSignature) { … }` tiene **todo su cuerpo
   comentado**. Lo único vivo era `const sup = …`, sin usar. El bloque queda
   marcado con una nota; implementarlo es decisión de negocio, no de esta fase.
3. **9 imports muertos de `nest-keycloak-connect`** (`Resource`), residuo de la
   etapa anterior a IAM Core. Eliminados.
4. **`meses: Record<string, any>`** en el DTO de emergencias era la raíz de 4
   errores. Ahora es `Record<string, InspeccionMensualDto>`. Se tipó **sin**
   activar `@ValidateNested`: eso cambiaría qué payloads se aceptan, y es una
   decisión aparte.

#### Utilidad nueva: `src/common/tipos/registro.util.ts`

`Object.entries` declara las claves como `string`, así que usar el resultado
para indexar el objeto de datos producía un `any` implícito. Es el patrón que
generaba 36 de los 52 errores.

- `entradasDe(objeto)` — `Object.entries` conservando el tipo de las claves.
- `clavesDe(objeto)` — igual para `Object.keys`.
- `buscarEn(objeto, clave)` — para mapas heterogéneos con clave dinámica;
  devuelve `| undefined` porque la clave puede no existir.

#### Reglas degradadas a aviso — y por qué no es una amnistía

`no-unsafe-*`, `no-explicit-any`, `require-await`, `no-require-imports`,
`restrict-template-expressions` y `no-base-to-string` pasan a **aviso**.

La familia `no-unsafe-*` son **consecuencias** de los `any` que quedan: 144 focos
proyectan ~1.170 señales. Bajan solas conforme se elimina cada `any` —ya se vio
en esta fase: 105 señales menos de `no-unsafe-member-access` sin tocar esa regla—.
Cuando la cuenta llegue a cero, vuelven a ser error.

`no-unused-vars` **sigue siendo error**, ahora con `argsIgnorePattern: '^_'`: un
parámetro que empieza por guion bajo declara explícitamente que no se usa.

#### Verificación

`tsc --noEmit` sin errores · `yarn lint` en verde · `yarn build` correcto ·
50 suites / 298 tests · las 17 comprobaciones del chasis de la Fase 1 siguen en
verde (sin regresiones).

#### Nota de proceso

El arreglo masivo de variables sin usar se automatizó desde el informe JSON de
ESLint. El script prefijó con `_` nueve imports que debía **eliminar**, y dejó
`import { _Resource }` — un símbolo inexistente. Lo detectó `tsc` de inmediato.
Conviene recordarlo: **un cambio automatizado sobre 58 puntos necesita el
compilador como red**, no solo el linter.

### Fase 2 — plan original (referencia)

1. **Recuperar `yarn lint` en verde** bajando temporalmente `no-unsafe-*` a aviso.
   Sin esto el linter no sirve como puerta y la deuda sigue creciendo invisible.
2. Corregir lo mecánico y seguro: `require-await` (97) y `no-unused-vars` (84).
3. Activar `noImplicitAny` y `no-explicit-any` **como advertencia**, para tener la
   cifra visible sin romper el build.
4. Bajar la deuda módulo por módulo, empezando por los 6 archivos que concentran
   el 46% de los `any`. Cada `any` eliminado apaga varias señales `no-unsafe-*`.
5. Introducir DTOs de salida en los endpoints más expuestos.
6. Cuando la cifra llegue a cero, subir las reglas de aviso a error.

### Fase 3 — ✅ APLICADA a `planes-accion` (2026-08-19)

#### Resultado

| Medida | Antes | Después |
|---|---|---|
| `any` en `planes-accion.service.ts` | **19** | **0** |
| Líneas del servicio | 681 | 624 |
| Archivos en `domain/` | 2 | 4 |
| **Tests del módulo** | **2** (humo) | **66** |
| Tests del backend | 298 | **362** |
| Suites | 50 | 54 |

#### Los 19 `any` no eran deuda de tipado: eran ruido

Antes de extraer nada, resultó que **la mayoría de los `any` no hacían falta**:

```ts
plan.tareas.filter((t) => (t as any).activo !== false)   // ← antes
t._id && (t as any)._id.toString() === tareaId           // ← antes
```

Tanto `activo` como `_id` **ya estaban declarados** en
`schemas/plan-accion.schema.ts`. Los casts eran restos de una época en que no lo
estaban, y nadie los quitó porque nada obligaba a hacerlo — `no-explicit-any`
estaba apagada. Se eliminaron todos y el compilador no protestó ni una vez.

Los cuatro restantes sí eran tipado ausente y se resolvieron con tipos reales:
`FilterQuery<PlanDeAccion>` para la consulta, `EstadisticasDePlanes` para el
retorno de `getStats()`, y un genérico para `sanitizeTareas`.

#### Qué se movió a `domain/`

Dos archivos nuevos, ambos TypeScript puro —sin Nest, sin Mongoose, sin I/O—:

**`domain/metadatos-plan.ts`**
- `calcularMetadatos()` — deriva contadores y estado del plan desde sus tareas.
- `calcularDiasRetraso()` — días de calendario de retraso.
- `soloTareasActivas()` — el filtro de baja lógica, antes repetido en 4 sitios.

**`domain/visibilidad-plan.ts`**
- `puedeVerPlanesSinAprobar()` — quién ve planes pendientes de aprobación.
- `planEsVisible()` — la misma regla expresada sobre un plan concreto.

Esta última es **una barrera de seguridad**, y estaba aplicada por separado en
`findAll` y en `findOne`. Cuando una comprobación de permisos vive duplicada,
tarde o temprano una de las copias se queda atrás.

#### Lo que de verdad faltaba: pruebas

`domain/` ya existía en este módulo desde una sesión anterior, con
`generar-plan.logic.ts` (258 líneas) y `tarea-update.validation.ts` (162), pero
**sin una sola prueba**. Extraer la lógica y no probarla deja el trabajo a
medias: la ventaja de sacarla del servicio es precisamente poder ejercitarla con
objetos literales, sin levantar Nest ni Mongo.

Se escribieron **64 pruebas** sobre los cuatro archivos de dominio, que ahora
documentan reglas que antes solo existían en la cabeza de quien las escribió:

- Un plan **sin tareas está `abierto`**, no `cerrado`.
- El plan solo cierra cuando cierran **todas** sus tareas.
- Cerrar a las 23:00 del día acordado son **0 días de retraso**, no 1.
- Adelantarse **no resta**: nunca hay retraso negativo.
- Una tarea **sin el campo `activo`** cuenta como activa (las creadas antes de
  que el campo existiera desaparecerían del plan si se exigiera `=== true`).
- El puntaje **0 es válido**, no un vacío — es justo el hallazgo más grave.
- Los datos que faltan para pasar a «en-progreso» **pueden llegar en la misma
  actualización**; si no, sería imposible completar y avanzar de una vez.
- Sin roles, **se restringe**.

#### Una mejora de comportamiento (pequeña y deliberada)

`calcularDiasRetraso` ahora devuelve `0` ante una fecha inválida. Antes producía
`NaN`, que se guardaba en el documento sin que nada avisara.

#### Verificación

`tsc --noEmit` sin errores · `yarn lint` en verde (0 errores) · `yarn build`
correcto · **54 suites / 362 tests**.

### Fase 3 (segunda parte) — ✅ `inspection-herra-equipos` (2026-08-19)

Aquí el problema no era la lógica de negocio sino **la duplicación**: 16
generadores de Excel que arrastran copias literales del mismo código.

#### Lo que se midió

| Medida | Antes | Después |
|---|---|---|
| Copias de `getCellCoordinates` | **15 idénticas** | 1 |
| Copias de `insertarImagen` | 15 (13 idénticas + 2 variantes) | 1 |
| LOC de `excel-generator/` | 8.933 | 8.474 |
| Tests del módulo | 2 (humo) | **15** |
| Tests del backend | 362 | **375** |

**459 líneas menos**, todas duplicadas.

#### `getCellCoordinates`, quince veces byte a byte

Traduce «B12» en `{ row: 12, col: 2 }`. Estaba copiada **literalmente** en los 15
generadores que la usan: mismos nombres, mismos comentarios, mismo todo.
Cualquier corrección había que aplicarla quince veces, y basta olvidar una para
que un formato quede distinto del resto.

Ahora vive en `excel-generator/comun/celdas.util.ts` como función pura, con
pruebas. Una de ellas documenta una limitación heredada que conviene conocer:
**solo reconoce mayúsculas**; una referencia como `b12` devuelve `col: 0`. Se
conserva el comportamiento —todas las referencias del módulo están en
mayúsculas— pero ahora es una decisión visible y no una sorpresa esperando.

#### `insertarImagen` y sus tres variantes

Trece generadores tenían el mismo cuerpo; arnés añadía un parámetro
`heightRatio` y vehículos una versión para rangos. Se unificó en
`comun/imagen-excel.util.ts`, cubriendo los tres casos con opciones.

**El try/catch se dejó en cada generador, a propósito.** No todos quieren lo
mismo: la mayoría propaga el fallo, pero el de arnés lo registra y sigue para no
tumbar el reporte entero por una firma. Meter el manejo de errores dentro de la
utilidad habría borrado esa diferencia sin que nadie lo notara.

Las pruebas se ejercitan contra un libro de ExcelJS **real** —no un doble—,
comprobando dónde queda anclada la imagen, porque eso es exactamente lo que
antes hacían las catorce copias y es lo que no se puede romper.

#### Hallazgo: ese try/catch casi nunca se dispara

Al probar con datos ilegibles, la inserción **no falla**. `resizeImageBuffer`
absorbe el error a propósito y devuelve el buffer original antes que romper el
export. Es decir, el `try/catch` que los 14 generadores tienen alrededor solo
cubre fallos de ExcelJS, nunca una imagen corrupta: esa ya viene absorbida de
antes. Queda documentado en una prueba.

#### Lo que NO se tocó

Los 16 generadores siguen siendo 16 archivos grandes con su propio mapeo de
celdas. Eso **no es duplicación**: cada plantilla de Excel tiene una disposición
distinta y un intento de unificarlas produciría una abstracción con dieciséis
casos particulares, peor que el problema. Lo que se extrajo es lo que era
idéntico de verdad.

#### Verificación

`tsc --noEmit` sin errores · `yarn lint` en verde · `yarn build` correcto ·
**56 suites / 375 tests**.

### Fase 3 — plan original (referencia)

Replicar la estructura de `matriz-riesgos` (carpeta `domain/` con lógica pura y
tests unitarios reales) en los módulos que más duelen: `planes-accion` primero,
`inspection-herra-equipos` después.

**Lo que NO se propone:** Clean Architecture completa con puertos y adaptadores.

Razón: Mongoose ya cumple el papel de repositorio, y añadir una capa de
interfaces por encima sería ceremonia sin beneficio en un monolito modular con un
único motor de base de datos. Lo que sí paga —y está demostrado dentro de este
mismo repositorio— es **extraer el dominio puro y testearlo**.

### Fase 4 — Resiliencia de datos

- Transacciones donde hay escritura multi-colección.
  **Bloqueante:** confirmar antes que Mongo corre en replica set.
- Paginación en los endpoints de listado.
- `.lean()` en las lecturas de solo consulta.
- Timeouts y reintentos acotados en las llamadas al ML y al IAM.

### Fase 5 — ✅ APLICADA EN SU MAYOR PARTE (2026-08-19)

| Tarea | Estado |
|---|---|
| Borrar las `entities/` vacías | ✅ 9 archivos + 8 carpetas |
| Sacar los `.cjs` de `src/` | ✅ 5 scripts a `scripts/migraciones/` |
| Unificar nombres de carpetas | ✅ `schema/`→`schemas/`, typo corregido |
| Unificar `console.*` bajo `Logger` | ✅ 56 → 1 (justificada) |
| Eliminar el `AppController` muerto | ✅ 3 archivos |
| **Sustituir los specs de humo** | ⬜ **Pendiente** — ver abajo |

#### Código muerto eliminado

**Diez clases vacías** del tipo `export class Area {}`, restos de
`nest generate` que nunca se llenaron. Se comprobó una por una que **nadie las
importaba** antes de borrarlas. Al vaciarse, cayeron 8 carpetas `entities/`.

Se conservó `inspection-schedule/entities/` — esa sí tiene 46 líneas y dos
módulos la importan.

**El `AppController` que no estaba montado.** El hallazgo de la Fase 1: la ruta
`/` devolvía 404 porque `AppModule` nunca declaró el controlador. Se borraron
`app.controller.ts`, `app.service.ts` y su spec — que era uno de los que
«pasaban» probando un controlador inexistente.

#### Los scripts de migración salen de `src/`

Los cinco `.cjs` viven ahora en `scripts/migraciones/`, con un `README.md` que
explica qué hace cada uno y cómo ejecutarlos.

⚠️ **Detalle que habría roto los cinco:** todos resolvían la raíz del proyecto
con `path.resolve(__dirname, '../../../..')`, contando desde
`src/modules/X/scripts/`. Desde su nueva ubicación eso apuntaba dos niveles por
encima del proyecto, y habrían leído el `.env` de un sitio inexistente. Se
corrigió a `'../..'` y se verificó que resuelve a la raíz correcta.

#### Nombres de carpeta unificados

| Convención | Antes | Ahora |
|---|---|---|
| `schemas/` | 16 módulos | **23** |
| `schema/` (singular) | 7 módulos | 0 |
| `types/` | 2 | **4** |
| `interfaces/` | 1 | 0 |
| `inrterfaces/` (typo) | 1 | 0 |

52 imports actualizados en 40 archivos. Se usó `git mv` para conservar el
historial.

#### Registro unificado

De **56 `console.*` a 1**. Los que quedaban se repartían así:

- **Ruido de depuración** (`[TOKENS]`, `[REFRESH]`, `[INSPECTOR]`) → pasaron a
  `logger.debug()`, que **no se imprime en el nivel por defecto**. Unifica el
  registro y de paso quita ruido de producción.
- **Eventos reales** (siembra de configuraciones, Excel generado, limpieza de
  sesiones) → `logger.log()`.
- **Errores** → `logger.error()` / `logger.warn()`.
- **Líneas decorativas** `━━━━━━━` → eliminadas.

Se añadió `Logger` a las 8 clases que lo necesitaban y no lo tenían. En
`current-user.decorator.ts` el logger es de módulo, porque un decorador de
parámetro no es una clase.

**La única `console.error` que queda** está en el `catch` del arranque de
`main.ts`, y se documentó por qué: si el arranque falla, la app de Nest no llegó
a existir y con ella tampoco su `Logger`.

#### Specs de humo: `auth` hecho (2026-08-19)

**2 specs de humo → 33 pruebas de comportamiento.** Total del backend:
374 → **405**.

`auth.service.spec.ts` (18 pruebas) fija las reglas que más caro se pagan:

- El registro **nunca guarda la contraseña en claro** — y la prueba no se
  conforma con «no es igual al original»: comprueba con `bcrypt.compare` que el
  hash es verificable.
- La respuesta del registro **no incluye la contraseña**.
- Un usuario **desactivado no entra ni con la contraseña correcta**.
- Con 2FA activo, el login **no entrega tokens de sesión**, solo el temporal.
- El token temporal se firma con `JWT_TEMP_SECRET`, **distinto** al de acceso:
  si compartieran secreto, el temporal serviría para saltarse el segundo factor.
- La limpieza de sesiones conserva sus **tres** condiciones de borrado; si
  alguien quita una, la colección crece sin límite.

`auth.controller.spec.ts` (15 pruebas) fija **la superficie de seguridad**. Como
el guard es global, abrir una ruta es ahora un acto explícito, y el spec lee esos
metadatos con `Reflector`:

- `login`, `verify2FA`, `refresh` y `logout` **son** anónimas.
- `me` y los tres endpoints de 2FA **no lo son**.
- `register` no es anónima **y exige rol admin**.
- El login reenvía a IAM **solo** usuario y contraseña, no el cuerpo entero
  —si no, el cliente podría colar campos que IAM interprete—.
- El login de inspector valida su clave **antes** de gastar una llamada a IAM.

Si alguien abre o cierra un endpoint sin querer, ahora falla una prueba en vez
de descubrirse en producción.

#### Specs de humo: `equipment-tracking` hecho (2026-08-19)

**2 specs de humo → 31 pruebas.** Total del backend: 405 → **434**.

`template-config.service.spec.ts` (13) — es una tabla de consulta pura, así que
se prueba sin `TestingModule`. Fija el contrato de la tabla:

- Un **código de plantilla desconocido no revienta**: cae en pre-uso simple. Es
  la decisión de diseño que permite añadir plantillas sin configurarlas.
- El enlace pre-uso ↔ frecuente es **recíproco**. Si alguien edita un lado y
  olvida el otro, el equipo queda dando vueltas entre dos formularios que no se
  reconocen.
- **Todas** las entradas declaran `equipmentFieldName` — no es cosmético: es el
  campo del que se lee el código para el seguimiento.

`equipment-tracking.service.spec.ts` (12) cubre `checkEquipmentStatus`, que es
la puerta de entrada de toda inspección — decide si el usuario sigue con el
formulario que pidió o hay que mandarlo a otro:

- **La regla del negocio:** agotados los 6 pre-usos, se obliga a la inspección
  frecuente. Y al revés: pedir la frecuente antes de tiempo devuelve al pre-uso.
- Un equipo **sin historial** se manda al pre-uso, no se bloquea.
- La consulta busca el seguimiento **del pre-uso**, no el del frecuente — el
  contador vive ahí; mirar el otro daría siempre vacío y el equipo quedaría
  atrapado en un bucle de redirección.
- Un contador pasado de vuelta **no produce «restantes» negativos**.
- Un pre-uso simple **ni siquiera consulta la base**.
- **Invariante sobre 7 combinaciones:** ninguna deja al usuario sin formulario
  que abrir. Un `openForm` vacío es una pantalla en blanco sin explicación.

`equipment-tracking.controller.spec.ts` (6) fija el mapeo de parámetros. No es
trivial: `equipmentId` y `templateCode` son ambos `string`, así que
intercambiarlos **compila** y haría que `check-status` respondiera con datos de
otro equipo.

#### Specs de humo: `instances` hecho (2026-08-19)

**1 spec de humo → 14 pruebas.** Total del backend: 434 → **447**.

`instances.service.spec.ts` cubre el **cálculo del puntaje**, que es de donde
salen los porcentajes de cumplimiento de todo el sistema: los informes, el panel
y la decisión de qué observaciones generan plan de acción.

- Una sección que no existe en la plantilla se rechaza, **diciendo cuál**.
- Una respuesta no numérica vale **0, no `NaN`** — un `NaN` se propagaría a
  todos los totales sin que nada avise.
- Sin puntos aplicables el porcentaje es **0**, no una división por cero.
- Los totales se acumulan entre secciones y se redondean a dos decimales.

##### ✅ CORREGIDO: marcar «N/A» ya no penaliza

El cálculo igualaba `applicablePoints` a `maxPoints` **sin descontar los N/A**,
así que una pregunta marcada «no aplica» penalizaba exactamente igual que un
cero. Confirmado con el usuario como defecto y corregido:

```ts
const puntosPorPregunta = maxPoints / nº de preguntas de la plantilla;
const applicablePoints  = Math.max(0, maxPoints - naCount * puntosPorPregunta);
```

El valor unitario **se deriva de la plantilla** en vez de fijarlo a 3, para que
siga siendo correcto si alguna usa otra escala.

**El peso del defecto, medido sobre los datos reales:**

| | |
|---|---|
| Respuestas marcadas «N/A» | **2.409 de 6.048 — el 40 %** |
| Instancias con al menos un N/A | **67 de 67 — todas** |

##### El dato que cambió el diagnóstico

Al simular el impacto sobre el histórico, el control de la simulación **no
cuadró**, y revisarlo destapó algo mejor: **los datos guardados ya venían
calculados con la regla nueva**. Un ejemplo real:

```
maxPoints: 15 · naCount: 2 · applicablePoints: 9      ← 15 − 2×3
```

Reparto sobre las 589 secciones almacenadas:

| Regla con la que se guardó | Secciones |
|---|---|
| Descontando los N/A (la corregida) | **390 (66 %)** |
| Igualando a `maxPoints` (la que había en el código) | 199 (34 %) |

Es decir: **la corrección no introduce un criterio nuevo, restaura el que
generó dos tercios del histórico.** En algún momento el cálculo cambió y la base
quedó con las dos convenciones mezcladas. Eso también explica por qué el
promedio de cumplimiento no era comparable entre inspecciones.

##### ⚠️ Hallazgo aparte: 32 instancias no resuelven su plantilla

Mientras se comprobaba lo anterior apareció un problema independiente:

```
instancias que resuelven sus secciones : 35
instancias que NO las resuelven        : 32
```

Los `sectionId` guardados apuntan a identificadores que ya no existen: las
plantillas se recrearon (ids de octubre) y las instancias siguen apuntando a los
anteriores (ids de agosto).

**Consecuencia práctica:** un `update()` sobre cualquiera de esas 32 lanzaría
`BadRequestException: Sección … no encontrada en el template`. No están rotas
para leer —el documento guarda sus propios totales— pero **no se pueden editar**.

No se ha tocado nada: arreglarlo implica decidir si se remapean los ids o si esas
inspecciones se dan por cerradas. Es una decisión de negocio.

#### Specs de humo: `inspecciones-emergencia` hecho (2026-08-19)

**1 spec de humo → 5 pruebas** sobre el controlador (el del servicio ya tenía 7
de verdad). Total del backend: 447 → **454**.

Lo que fija: el controlador desarma el cuerpo de la petición y reparte sus
campos entre los argumentos del servicio. `tag`, `periodo` y `area` son **todos
cadenas**, así que cambiarlos de orden compila y el formulario se busca con los
datos equivocados. También que `puedeModificar` llega intacto al frontend —es lo
que bloquea el formulario de una inspección ya cerrada— y que ninguna ruta queda
abierta.

##### Más código muerto: el módulo `pdf`

Al escribir el spec, `src/modules/pdf/pdf.service.ts` resultó estar **entero
comentado** — 2.214 bytes sin una sola línea viva ni un `export`. Nadie lo
importaba; el `ExcelToPdfService` real vive en
`inspection-herra-equipos/pdf/`. Módulo eliminado.

#### Specs de humo: `trabajadores` hecho (2026-08-19)

**2 specs de humo → 30 pruebas.** Total del backend: 454 → **482**.

`trabajadores.service.spec.ts` (18) fija sobre todo **la frontera con IAM Core**:
este módulo ya no es dueño de sus datos, solo espeja el roster. `create()` y
`update()` están cerrados a propósito, y las pruebas comprueban que además
**ni siquiera tocan la base** y que el mensaje dice a qué herramienta ir — un
«no se puede» a secas manda al usuario a abrir un ticket.

`trabajadores.controller.spec.ts` (12) fija dos cosas que se rompen en silencio:

- **El orden de las rutas.** `@Get(':id')` captura cualquier cadena, así que
  `completos`, `buscar`, `nombres/all` y `by-username/:username` tienen que
  declararse antes. El código lo avisa con comentarios en mayúsculas, pero **un
  comentario no falla cuando se incumple**: la prueba lee los metadatos de ruta
  en orden de declaración y comprueba que nada literal queda por debajo de
  `:id`.
- **Que toda ruta declara sus roles**, sin excepción.

##### ✅ Corregido: el buscador reventaba con un paréntesis

`buscarTrabajadores` metía el texto del usuario **crudo** en un `$regex`, así
que la búsqueda se interpretaba como expresión regular. Comprobado contra la
base real (194 trabajadores):

| Búsqueda | Resultado antes |
|---|---|
| `perez` | 2 resultados ✔ |
| `.*` | 10 resultados — **devolvía todo** |
| `(` | **error `Location51091`** → 500 al usuario |
| `a{1000000}` | **error** |

Cualquiera que escribiera un paréntesis en el buscador recibía un error del
servidor. Corregido con `escaparRegex()`, nueva utilidad en
`common/utils/escapar-regex.util.ts`: la búsqueda pasa a ser literal, que es lo
que espera quien teclea un apellido.

> **Pendiente relacionado:** la misma función de escape ya existía copiada en
> `clasificacion.service.ts` y `ubicacion.service.ts`. Conviene que esos dos
> pasen a usar la utilidad común, pero **sus búsquedas ya escapaban**, así que
> no tienen el defecto — es limpieza, no corrección.

#### ✅ Specs de humo: NINGUNO (2026-08-19)

**Los 50 specs de humo originales han desaparecido.** Ninguno de los 57
archivos de prueba se limita ya a `expect(service).toBeDefined()`.

| | Al empezar | Ahora |
|---|---|---|
| Archivos de prueba | 50 | **57** |
| De ellos, solo humo | **29** | **0** |
| Tests | 298 | **636** |

##### Una prueba transversal, no solo una por módulo

`common/nucleo/superficie-http.spec.ts` comprueba invariantes de **todos** los
controladores a la vez, descubriéndolos al recorrer las carpetas —así que un
módulo añadido mañana entra solo, sin lista que mantener—:

- **Ninguna ruta es pública** salvo las siete declaradas con su motivo. Si
  alguien abre un endpoint, falla; si fue a propósito, se añade a la lista y
  queda escrito por qué.
- **Y al revés:** las siete anónimas siguen siéndolo. Cerrar el login por
  accidente deja fuera a todo el mundo.
- **Ninguna ruta literal queda ensombrecida** por una `:id` declarada antes.

##### Esa última prueba encontró un endpoint muerto

```
GET /instances/compliance-report  →  inalcanzable
```

Estaba declarado **después** de `@Get(':id')`, que captura cualquier cadena de
un segmento: la petición se interpretaba como un identificador de instancia.
El informe de cumplimiento llevaba tiempo sin poder consultarse. Movido arriba
y cubierto por la prueba.

##### Defectos corregidos al escribir estas pruebas

| Módulo | Defecto | Estado |
|---|---|---|
| `trabajadores`, `area`, `superintendencia`, `templates`, `inspecciones`, `extintor` | Texto del usuario **sin escapar** dentro de `$regex`: un «(» devolvía error de Mongo (500) y «.*» devolvía todo | ✅ `escaparRegex()` |
| `extintor` | Cada `catch` re-envolvía las excepciones de Nest en un `Error` pelado: un 404 llegaba como **500** | ✅ 19 guardas |
| `tag` | Campo obligatorio ausente lanzaba `Error` → 500 en vez de 400 | ✅ |
| `qr-generator` | El límite de longitud era el del nivel «L» (2953) pero el servicio usa «M» (2331): textos intermedios pasaban la validación y reventaban dentro de la librería | ✅ límite por nivel |
| `instances` | `compliance-report` inalcanzable | ✅ |

##### Lo que fijan las pruebas nuevas, por si sirve de índice

- **`auth`** — la contraseña nunca se guarda en claro (verificado con
  `bcrypt.compare`); un usuario desactivado no entra ni con la clave correcta;
  el token temporal de 2FA usa un secreto distinto al de acceso.
- **`equipment-tracking`** — agotados los 6 pre-usos se obliga a la inspección
  frecuente; ninguna combinación deja al usuario sin formulario que abrir.
- **`instances`** — el cálculo del puntaje, incluido que un «N/A» ya no penaliza.
- **`template-herra-equipos`** — quién ve qué plantillas: la misma regla en el
  listado, la consulta puntual y los reportes.
- **`inspection-herra-equipos`** — aprobar dispara el seguimiento de frecuencia;
  rechazar no; y un fallo del seguimiento **no** tumba la aprobación.
- **`planes-accion`** — la baja lógica **guarda antes de filtrar**: invertir ese
  orden borraría físicamente las tareas dadas de baja.
- **`ml-recomendations`** — con el servicio de ML caído se responde 503, no 500,
  y sin filtrar la URL interna.
- **`trabajadores`** — la frontera con IAM Core: crear y editar están cerrados y
  ni siquiera tocan la base.
- **`extintor`** — el código de estado correcto para cada fallo.

#### Verificación

`tsc --noEmit` sin errores · `yarn lint` en verde · `yarn build` correcto ·
55 suites / 374 tests · **las 17 comprobaciones del chasis contra una instancia
real siguen en verde**.

Esa última importa especialmente en esta fase: renombrar carpetas y borrar
archivos son cambios que el compilador aprueba pero que pueden romper el
registro de modelos de Mongoose en tiempo de ejecución. Levantar la aplicación
de verdad es lo único que lo descarta.

### Fase 5 — plan original (referencia)

- Unificar `schema/` → `schemas/`, `interfaces/` → `types/`, corregir
  `inrterfaces/`.
- Borrar las 9 `entities/` vacías.
- Mover los 5 `.cjs` fuera de `src/`.
- Sustituir los 29 specs de humo por tests de comportamiento real.
- Unificar `console.*` bajo el `Logger` de Nest.

---

## 6. Dependencias entre fases

- **Fase 0** es independiente y se puede hacer ya.
- **Fase 1** no depende de nada y desbloquea el resto.
- **Fases 1 y 2 se tocan**: el filtro de excepciones global y los DTOs de salida
  definen juntos el contrato de la API. Puede convenir hacerlas en una sola
  pasada.
- **Fase 4** está bloqueada por la confirmación de la topología de Mongo.
- **Fase 5** puede hacerse en cualquier momento; es la de menor riesgo.

---

## 7. Riesgos de ejecución

| Riesgo | Mitigación |
|---|---|
| El guard global rompe endpoints que hoy funcionan abiertos | Inventariar rutas sin guard antes de activarlo y marcarlas `@Public()` explícitamente en el mismo commit |
| Activar `noImplicitAny` destapa cientos de errores de golpe | Entra como *warning*, no como error; el build sigue verde mientras se baja la deuda |
| Las transacciones fallan si no hay replica set | Verificar la topología **antes** de escribir código |
| Renombrar carpetas rompe imports en masa | Un módulo por commit, con `yarn build` entre cada uno |
| Los tests de humo ocultan regresiones durante el refactor | Escribir los tests de comportamiento **antes** de tocar el módulo, no después |
