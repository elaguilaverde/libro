# Libro — PWA de gestión de negocio

App local-first: todos los datos viven en el dispositivo de quien la usa
(SQLite corriendo en el navegador vía sql.js/WebAssembly, guardado en
IndexedDB). Publicar el código en GitHub Pages **no sube ningún dato** —
solo aloja los archivos HTML/CSS/JS.

## Paso obligatorio antes de publicar

Faltan dos archivos que no se pueden generar sin conexión a internet.
Descargalos una sola vez y ponelos en la carpeta `vendor/` con estos
nombres exactos:

- https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js
- https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm

Sin esto, la app igual funciona (cae automáticamente al CDN), pero
**no va a andar sin internet la primera vez** en cada dispositivo nuevo.

## Publicar en GitHub Pages

1. Creá un repositorio nuevo y subí todo el contenido de esta carpeta
   (`index.html` en la raíz del repo, no dentro de una subcarpeta).
2. `Settings → Pages → Deploy from a branch → main / (root)`.
3. GitHub te da un link `https://tu-usuario.github.io/tu-repo/` — ese es
   el que le pasás a tu hermano.
4. La primera vez que él lo abra necesita internet (para bajar la app y
   que el Service Worker la guarde en caché). Después, funciona offline.
5. En iPhone: Safari → botón compartir → "Agregar a pantalla de inicio".
   Así el sistema operativo trata la app como una app real y no le borra
   los datos por inactividad.

## Estructura

```
index.html          — arma la página y enlaza todo
manifest.json        — metadata para "instalar" la PWA
service-worker.js     — cachea la app para que funcione offline
css/estilos.css       — todo el diseño
js/
  db.js               — SQLite + IndexedDB + migraciones (el único que toca datos)
  ui.js               — tabs, formato de moneda, modal de edición genérico
  dashboard.js         — resumen (solo lee)
  inventario.js         — productos y stock
  movimientos.js         — ventas/gastos (depende de inventario.js para el stock)
  cuentas.js              — cuentas por cobrar/pagar
  archivo.js               — guardar/abrir/compartir el .sqlite
  main.js                   — arranca todo y gestiona el Service Worker
vendor/                     — sql-wasm.js y sql-wasm.wasm (agregar manualmente)
icons/                      — íconos de la PWA
```

## Actualizar el código más adelante

1. Editá los archivos que necesites.
2. Cambiá el valor de `CACHE_VERSION` en `service-worker.js` (ej: `libro-v1` → `libro-v2`).
   Esto es lo único que le indica al navegador que hay una versión nueva.
3. Subí los cambios al repositorio (commit + push).
4. La próxima vez que alguien abra la app con internet, el navegador nota la
   versión nueva, la descarga en segundo plano, y le aparece un aviso de
   "Actualizar ahora" — nada se rompe ni se pisa mientras tanto.
