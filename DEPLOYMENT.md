# Deployment

El flujo recomendado para publicar barato en Vercel o Netlify y seguir usando el admin es:

```text
Admin local en tu ordenador
  -> Save
  -> actualiza data/projects.js y assets/projects/
  -> hace commit + push a GitHub
  -> Vercel/Netlify redeploya la web publica
```

Asi evitamos subir videos grandes a traves de Functions, que suelen tener limites de payload y tiempo.

## 1. GitHub

El proyecto debe vivir en un repositorio GitHub conectado a Vercel o Netlify.

Cuando este configurado:

```powershell
git status
git remote -v
```

deberia mostrar un repo valido y un remote `origin`.

## 2. Vercel o Netlify

Configura el proyecto como web estatica:

- Build command: vacio
- Publish/output directory: raiz del repo

No hace falta ejecutar `server.mjs` en produccion. La web publica usa:

- `index.html`
- `about.html`
- `project.html`
- `data/projects.js`
- `assets/`
- `css/`
- `js/`

## 3. Admin local con autopublicacion

Arranca el admin local asi:

```powershell
$env:ADMIN_CODE="tu-codigo-privado"
$env:AUTO_GIT_PUSH="true"
npm start
```

Despues abre:

```text
http://localhost:3000/admin.html
```

Al pulsar `Save site`, el servidor local:

1. guarda `data/projects.js`;
2. limpia assets no usados;
3. hace `git add data/projects.js assets/projects`;
4. hace commit;
5. hace `git push`.

Vercel/Netlify detectara el push y publicara la nueva version.

Si el push falla, el admin mostrara un aviso. Los cambios quedan guardados localmente, pero no se publican hasta arreglar Git y hacer push.

## 4. Dominio de Cargo

Cuando la web este desplegada en Vercel/Netlify:

1. Anade tu dominio en el panel del hosting.
2. El hosting te dara registros DNS.
3. En Cargo o en el panel donde este gestionado el dominio, cambia DNS:
   - normalmente `CNAME` para `www`;
   - registros `A`/`AAAA` o `ALIAS` para el dominio raiz.
4. Activa HTTPS desde el hosting.

## 5. Nota sobre admin publico

No recomendamos publicar el admin como una Function que sube archivos a GitHub, porque los videos pueden pesar decenas de MB y Vercel/Netlify Functions no son ideales para ese trafico.

El admin local + GitHub push es mas simple, mas barato y mas estable para este portfolio.
