# Scripts de migración

Scripts de un solo uso que corrigen o siembran datos en Mongo. **No forman parte
de la aplicación**: no los compila TypeScript, no los ejecuta Nest y no se
despliegan.

Vivían dentro de `src/modules/*/scripts/`, mezclados con el código de
producción. Se movieron aquí porque desde `src/` no los revisaba el linter, no
los cubría ningún test y viajaban con el build sin necesidad.

## Cómo se ejecutan

Desde la raíz del backend (`BackendForm/BackendForm`):

```bash
node scripts/migraciones/<nombre>.cjs
```

Todos resuelven la raíz del proyecto con `path.resolve(__dirname, '../..')` para
leer el `.env`. Si mueves esta carpeta, hay que ajustar esa ruta.

## Antes de ejecutar cualquiera

Estos scripts **escriben en la base de datos real**. Lee la cabecera del archivo
—todos explican qué hacen— y haz una copia de seguridad antes.

| Script | Qué hace |
|---|---|
| `area-migrar-catalogo-iam.cjs` | Migra el catálogo de áreas hacia IAM Core |
| `config-formulario-sembrar-config-formularios.cjs` | Siembra las configuraciones de formulario |
| `equipos-migrar-jerarquia-organizacional.cjs` | Resuelve la jerarquía área/superintendencia/gerencia de los equipos |
| `pgr-migrar-actividades-plural.cjs` | Renombra el campo de actividades del PGR a su forma plural |
| `template-herra-equipos-tipo-autoretractil-select.cjs` | Convierte el campo «tipo» del autorretráctil en un selector |
