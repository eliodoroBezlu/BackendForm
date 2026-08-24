# Convertir el Mongo actual en un replica set de un solo miembro

Necesario para desbloquear las transacciones de la **Fase 4** (ver
`ANALISIS_BACKEND.md`). Un replica set de un miembro es una configuración
soportada y suficiente: **no hace falta montar un clúster**.

---

## Lo que hay hoy (comprobado el 2026-08-19)

```
Contenedor : mongodb  (imagen mongo:latest)
Compose    : D:\tesisSanCristobal\proyects\docker\mongo\docker-compose.yml
Puerto     : 27017 -> 27017
Datos      : volumen nombrado  mongo_mongodb_data -> /data/db
Arranque   : mongod (sin --replSet)
Auth       : SÍ (MONGO_INITDB_ROOT_USERNAME / PASSWORD)
Estado     : standalone — replSetGetStatus responde NoReplicationEnabled
```

**Los datos viven en un volumen nombrado**, así que recrear el contenedor
**no los borra**. Es la razón por la que este cambio es razonablemente seguro.

---

## Dos aclaraciones antes de empezar

### MongoDB Compass NO puede hacer este cambio

Compass es un cliente gráfico: se conecta a un servidor ya arrancado. **No
puede cambiar con qué parámetros arranca `mongod`**, que es justo lo que hay que
hacer aquí. No hay ninguna opción en su interfaz para esto.

Lo único que Compass sí puede hacer es el **paso 4** (`rs.initiate()`), desde su
consola integrada (`_MONGOSH` abajo del todo) — pero solo *después* de que el
contenedor arranque con `--replSet`. Si se intenta antes, responde
`NotYetInitialized` o directamente falla la conexión.

### No hay ningún `mongod.cfg` que editar

Ese archivo existe cuando MongoDB se instala como servicio de Windows. Aquí
corre en Docker, así que la configuración va en el `command` del contenedor.

---

## Procedimiento

### 1. Copia de seguridad — no opcional

```bash
docker exec mongodb mongodump --username admin --password password --authenticationDatabase admin --archive=/tmp/respaldo.archive
```

```bash
docker cp mongodb:/tmp/respaldo.archive "D:/tesisSanCristobal/respaldo-mongo.archive"
```

Comprueba que el archivo existe y **pesa más de unos pocos KB** antes de seguir.

### 2. Generar el keyfile

El keyfile es el secreto compartido con el que los miembros del conjunto se
autentican entre sí. Con un solo miembro sigue siendo obligatorio.

Desde esta carpeta (`scripts/replica-set/`):

```bash
node generar-keyfile.cjs
```

Crea el archivo `keyfile` (1024 bytes aleatorios en base64) junto a este README.

> **No lo subas al repositorio.** Es una credencial. Añádelo a `.gitignore`.

### 3. Levantar el contenedor con la sobrecarga

Detiene y recrea el contenedor `mongodb`. **El volumen de datos se conserva.**

```bash
docker compose -f "D:/tesisSanCristobal/proyects/docker/mongo/docker-compose.yml" -f "D:/tesisSanCristobal/forms/BackendForm/BackendForm/scripts/replica-set/docker-compose.replicaset.yml" up -d
```

Comprueba que arrancó bien:

```bash
docker logs mongodb --tail 30
```

Si ves `security.keyFile is required` o un error de permisos, el keyfile no se
copió correctamente — revisa el paso 2.

### 4. Iniciar el conjunto (una sola vez)

```bash
docker exec mongodb mongosh --username admin --password password --authenticationDatabase admin --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
```

**El `host` explícito importa.** `rs.initiate()` a secas registra el nombre
interno del contenedor (`mongodb`), que la aplicación —que corre en Windows, no
en la red de Docker— **no sabe resolver**. Es el error más común de este
procedimiento y deja la app sin conectar.

### 5. Verificar

```bash
node scripts/replica-set/verificar.cjs
```

Comprueba tres cosas: que el conjunto está activo, que la aplicación sigue
conectando con su URI actual, y que **una transacción real funciona**.

---

## Si algo sale mal: volver atrás

```bash
docker compose -f "D:/tesisSanCristobal/proyects/docker/mongo/docker-compose.yml" up -d --force-recreate
```

Levanta de nuevo el contenedor sin la sobrecarga, es decir, en standalone. Los
datos siguen en su volumen.

> Ojo: una vez ejecutado `rs.initiate()`, el volumen guarda metadatos del
> conjunto. Volver a standalone funciona, pero si más adelante se reactiva
> `--replSet` el conjunto ya estará iniciado y `rs.initiate()` responderá
> `AlreadyInitialized` — que es correcto, no un error.

---

## ¿Hay que cambiar la cadena de conexión?

**Probablemente no.** La URI actual apunta a `localhost:27017` y el driver
detecta el conjunto por su cuenta.

Si tras el cambio aparecieran errores de descubrimiento de topología, añadir a
la URI del `.env`:

```
?authSource=admin&directConnection=true
```

El script de verificación del paso 5 lo comprueba y te lo dice.
