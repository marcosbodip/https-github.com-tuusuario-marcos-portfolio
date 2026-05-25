# Marcos Portfolio

Portfolio personal estatico en HTML, CSS y JavaScript.

## Estructura

- `index.html`: home con el grid de proyectos.
- `project.html`: plantilla generica/fallback que renderiza cualquier proyecto con `?project=project-slug`.
- `projects/`: paginas HTML generadas para SEO/social previews de cada proyecto publico.
- `robots.txt` y `sitemap.xml`: archivos de descubrimiento para buscadores.
- `about.html`: pagina About.
- `data/projects.js`: datos de todos los proyectos.
- `assets/projects/`: media de cada proyecto, organizada por slug.
- `css/style.css`: estilos globales.
- `js/`: scripts de render, interacciones y utilidades.

El contenido de proyectos vive en `data/projects.js`. Las paginas de `projects/` y `sitemap.xml` se regeneran automaticamente desde esos datos.

## URLs de proyecto

Cada proyecto usa el campo `slug` de `data/projects.js`:

```text
/projects/meta-heart.html
/projects/nissan-micra.html
/projects/brunch-festival-25.html
```

La home genera automaticamente las tarjetas con `js/render-index.js`, y la pagina de detalle se genera con `js/render-project.js`. El formato antiguo `project.html?project=slug` sigue funcionando como fallback. Las paginas generadas incluyen Open Graph, Twitter Card, JSON-LD y texto visible para crawlers.

## Assets

Los assets se organizan asi:

```text
assets/
  projects/
    project-slug/
      cover.ext
      main.ext
      secondary-01.ext
      secondary-02.ext
```

Antes de publicar conviene revisar el peso de los videos grandes. La web funciona con los archivos actuales, pero algunos videos superan los 100 MB y pueden hacer lenta la carga en movil.

## Admin

El admin puede usarse en local o en produccion si la web se sirve con `server.mjs`.

Para arrancarlo:

```powershell
$env:ADMIN_CODE="tu-codigo-privado"; npm start
```

Despues abre:

```text
http://localhost:3000/admin.html
```

Si `ADMIN_CODE` no esta definido, el admin queda desactivado. El servidor no incluye ningun codigo de acceso por defecto.

Para publicar en Vercel/Netlify manteniendo el admin, revisa `DEPLOYMENT.md`.

## Publicacion

Hay dos caminos:

1. Recomendado: web estatica en Vercel/Netlify + admin local que hace commit/push a GitHub.
2. Alternativo: desplegar `server.mjs` en un hosting Node con disco persistente.

Para una publicacion estatica, el hosting debe servir:

```text
assets/
css/
data/projects.js
js/ excepto js/admin.js
about.html
index.html
project.html
projects/
package.json solo si el hosting lo necesita
```

No hace falta servir estos archivos publicamente:

```text
server.mjs
server.log
server-error.log
.checkpoints/
data/projects.backup.js
```

`admin.html` y `js/admin.js` pueden quedarse en el repo para uso local. Si el hosting los publica tambien, las acciones de guardado no funcionaran contra Vercel/Netlify directamente; el flujo real de publicacion pasa por el admin local y Git.

## Checklist previa

- Revisar la web en desktop y movil.
- Comprimir videos grandes y sustituir `.mov` por `.mp4` cuando sea posible.
- Anadir favicon.
- Revisar las metas sociales `og:title`, `og:description`, `og:image` y `twitter:card`.
- Revisar que todos los proyectos abren con `/projects/slug.html`.
- Confirmar que no se publica ningun archivo de admin o desarrollo.
