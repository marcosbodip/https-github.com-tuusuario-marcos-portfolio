# Workflow entre ordenadores

Este proyecto puede trabajarse sin problema desde el Mac y desde el ordenador de la oficina, pero la referencia compartida debe ser GitHub, no Dropbox.

## Regla principal

- Cada ordenador usa su propia copia local del proyecto.
- GitHub es la version compartida y actual.
- `main` es la rama de publicacion.
- `design-experiments` o cualquier otra rama sirve para pruebas.
- Dropbox puede usarse como backup de materiales si quieres, pero no como carpeta viva del repo en los dos equipos a la vez.

## Rutina diaria

1. Abre el proyecto en el ordenador donde vayas a trabajar.
2. Trae lo ultimo de `main` antes de tocar nada.
3. Haz tus cambios.
4. Comprueba la web en local.
5. Sube los cambios a GitHub.
6. En el otro ordenador, antes de empezar, vuelve a traer lo ultimo.

## Lo que no conviene hacer

- No trabajar en los dos ordenadores a la vez sobre cambios que aun no se han subido.
- No usar Dropbox para sincronizar la carpeta `.git` entre equipos.
- No publicar pruebas desde `design-experiments` si la web publica sale de `main`.

## Flujo recomendado para este portfolio

### Si el cambio va a publico

1. Trabaja en `main` o fusiona tu rama en `main`.
2. Revisa la web en local en `http://localhost:3000/`.
3. Haz commit y push.
4. Vercel o Netlify redeploya la web publica.

### Si el cambio es experimental

1. Trabaja en `design-experiments`.
2. Comprueba todo en local.
3. Cuando te convenza, pasa solo lo necesario a `main`.
4. Publica desde `main`.

## Nota para Codex

Si un Codex local no puede hacer `git add`, `git commit` o `git push`, el problema no suele ser del proyecto sino del entorno de permisos de esa sesion. En ese caso:

1. Mantener el cambio en los archivos.
2. Confirmar que el cambio esta en la rama correcta.
3. Completar el commit y push desde una terminal normal del ordenador o desde otra sesion de Codex con permisos de Git.
