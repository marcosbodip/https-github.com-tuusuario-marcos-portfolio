# Guia de trabajo para Codex

Este archivo contiene las reglas duraderas del portfolio de Marcos Bodi. Debe leerse antes de modificar, probar o publicar la web desde cualquier ordenador.

## Objetivo del proyecto

- Portfolio estatico de un artista 3D especializado en CGI, VFX y visualizacion de producto.
- La prioridad es que el trabajo visual sea protagonista, con una interfaz limpia, editorial y discreta.
- La web debe seguir funcionando con rapidez en escritorio y movil, especialmente con conexiones moviles.
- No anadir secciones, botones, textos comerciales ni cambiar la composicion salvo que Marcos lo solicite expresamente.

## Fuentes de verdad

- GitHub es la fuente compartida entre ordenadores.
- Cada ordenador debe usar una copia local independiente del repositorio.
- No usar Dropbox como carpeta Git activa. Puede utilizarse para masters, renders originales y backups.
- `data/projects.js` es la fuente de verdad del contenido de proyectos.
- `assets/projects/<slug>/` contiene los medios publicados de cada proyecto.
- `projects/*.html` y `sitemap.xml` son salidas generadas desde los datos.
- Consultar `WORKFLOW.md` para el flujo entre equipos y `DEPLOYMENT.md` para la publicacion.

## Ramas y publicacion

- `main` representa exactamente la web publica.
- `design-experiments` se usa para pruebas antes de afectar a produccion.
- Antes de trabajar, comprobar la rama y ejecutar `git status`. No sobrescribir cambios locales desconocidos.
- Antes de comenzar desde otro ordenador, traer la ultima version de GitHub.
- Probar primero los cambios visuales o de comportamiento en `design-experiments`.
- Pasar a `main` solo los cambios aprobados por Marcos.
- No publicar experimentos ni hacer push a `main` sin una peticion explicita.
- Tras publicar, mantener el contenido de `design-experiments` y `main` alineado cuando no haya un experimento activo.
- Vercel despliega automaticamente la rama `main` despues del push.

## Arranque local

La web local se sirve con `server.mjs` y se abre en `http://127.0.0.1:3000/`.

Usar una de estas opciones segun el equipo:

```bash
npm start
```

En el Mac de Marcos, si `npm` no esta disponible en la terminal:

```bash
/Users/marcosbodipuchalt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

El comando debe ejecutarse desde la raiz del repositorio. No asumir que la ruta privada del runtime del Mac existe en el ordenador de la oficina.

## Identidad visual que debe preservarse

- Fondo negro, tipografia y composicion actuales.
- Acento rojo luminoso en puntos, ondas, hovers y efectos relacionados.
- Cursor personalizado con cruz, circulo de contorno y esfera de color con inercia.
- No reactivar el auto-scroll del index al acercar el puntero al borde inferior.
- No cambiar el index cuando el encargo se limite a paginas de proyecto.
- Evitar animaciones bruscas, recortes rectos y transiciones sin fade.
- Mantener el comportamiento responsive y comprobar siempre escritorio y movil.

## Estructura de un proyecto

Al crear o editar un proyecto:

1. Actualizar el objeto correspondiente en `data/projects.js`.
2. Guardar los medios en `assets/projects/<slug>/`.
3. Definir una portada especifica para el index en `media.cover`.
4. Definir la pieza principal en `media.main` y el resto en `media.secondary`.
5. Mantener el bloque inicial con titulo y texto descriptivo a la izquierda, y `Project Info` a la derecha.
6. Mantener `Concept` y `Team` plegados mediante sus controles de mas/menos.
7. Mantener carrusel, fullscreen, navegacion con flechas del teclado y retorno estable al carrusel.
8. Regenerar paginas SEO y sitemap cuando cambien los datos de proyectos:

```bash
npm run generate:seo
```

No escribir manualmente una pagina de proyecto si puede generarse desde la plantilla existente.

## Copy y metadatos

- Mantener el tono breve, profesional y descriptivo de los proyectos existentes.
- Usar `VFX` en lugar de `Post-production` o `Post Production`.
- `Tools` contiene solamente software realmente utilizado. Opciones habituales: `C4D`, `Blender`, `Nuke` y `DaVinci Resolve`.
- No copiar automaticamente la categoria, el rol o el titulo superior dentro de `Tools`.
- Conservar nombres propios, clientes y creditos exactamente como los facilite Marcos.
- No inventar equipo, herramientas, clientes, responsabilidades ni resultados.
- Si falta un dato esencial para publicar, senalarlo antes de completar el proyecto.

## Imagenes y videos

- Conservar los masters originales fuera del arbol publico cuando sea posible.
- Publicar versiones optimizadas para escritorio y movil.
- Convencion habitual de video:
  - `name_optimized.mp4`: version de escritorio.
  - `name_optimized_mobile.mp4`: version movil.
  - `name_optimized_poster.jpg`: poster.
- Convencion habitual de imagen responsive:
  - `name_responsive-640.webp`.
  - `name_responsive-1080.webp`.
- Las portadas animadas visibles del index deben reproducirse automaticamente, en silencio y en loop.
- No limitar el autoplay de forma que las tarjetas pequenas queden congeladas frente a tarjetas grandes.
- Evitar precargar videos fuera de la zona visible, especialmente en movil.
- Comprobar el encuadre de cada portada por separado; usar `objectPosition` cuando haga falta.
- No sustituir un medio por otro ni cambiar su aspect ratio sin revisar visualmente el resultado.

## Audio

- Los videos arrancan silenciados para permitir autoplay.
- Mostrar el control de sonido solo si la pieza principal debe tener audio.
- Usar `mainAudioEnabled: true` cuando el audio de la pieza principal forme parte del proyecto.
- Usar `mobileAudio: true` solamente si el archivo `_mobile.mp4` contiene realmente una pista de audio.
- Comprobar sonido tanto en carrusel como en fullscreen, en escritorio y movil.
- No forzar el archivo pesado de escritorio en movil si existe un derivado movil con audio.

## Verificacion minima

Antes de dar un cambio por terminado:

- Ejecutar `git diff --check`.
- Ejecutar `node --check` sobre cada archivo JavaScript modificado.
- Abrir la web local y revisar el resultado visual.
- Comprobar el index en escritorio y movil.
- Comprobar las paginas de proyecto afectadas.
- Revisar autoplay, posters, audio, carrusel, fullscreen y navegacion por teclado cuando corresponda.
- Confirmar que no aparecen outlines, saltos de layout, medios superpuestos ni controles duplicados.
- Si se publica, verificar que la web publica sirve los archivos y datos nuevos.

## Criterio de cambios

- Preferir correcciones pequenas y localizadas frente a refactors amplios.
- Preservar comportamientos que ya funcionan y no mover elementos fuera del alcance solicitado.
- No borrar ni revertir cambios locales que no hayan sido creados durante la tarea actual.
- Explicar a Marcos con lenguaje sencillo que se ha cambiado, donde se ha probado y si ya esta en local o en produccion.
