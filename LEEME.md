# Nuestra agenda — cómo subirla a Vercel

Archivos principales:

- `index.html` — la app (semana, mes con marcadores, chat, notitas y ajustes).
- `api/state.js` — guarda la agenda en la nube para que los dos vean lo mismo.
- `api/chat.js` — el chat (mensajes, memes, GIFs, links y actividades compartidas).
- `api/push.js` y `api/notify.js` — los avisos 10 minutos antes de cada actividad y de mensajes nuevos.
- `sw.js`, `manifest.json` e íconos — para instalarla en el teléfono y recibir avisos.
- `package.json` — Vercel instala solo la librería de avisos (`web-push`).

## 1. Subirla

**Opción fácil (sin terminal):**
1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com → **Add New → Project**, elige el repositorio y presiona **Deploy**.
   No hay que configurar nada: no usa framework ni comando de build.

**Opción con terminal:** dentro de la carpeta, corre `npx vercel` y luego `npx vercel --prod`.

Con eso la agenda ya funciona, pero cada teléfono guarda sus propios datos
("Solo en este teléfono") y el chat no está disponible. Para compartirla entre los dos, sigue el paso 2.

## 2. Compartirla entre los dos (gratis)

1. En tu proyecto de Vercel, ve a **Storage** → **Create Database** y elige **Upstash for Redis** (el plan gratis alcanza de sobra).
2. Conéctala al proyecto. Vercel agrega solas las variables de conexión
   (`KV_REST_API_URL` y `KV_REST_API_TOKEN`, o `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; la app acepta cualquiera de las dos).
3. **Recomendado:** en **Settings → Environment Variables** agrega `APP_PIN` con un número que solo ustedes sepan. Así nadie más puede ver o cambiar su agenda ni leer su chat aunque tenga el link.
4. Ve a **Deployments** y haz **Redeploy** para que tome las variables.
5. Abre la app en los dos teléfonos. Si pusieron PIN, escríbanlo en **Ajustes → Sincronización**.
   El indicador de arriba debe decir **Sincronizado**.

## 3. Chat

En la pestaña **Chat** pueden:

- Escribir mensajes y pegar links. Los de **YouTube** (también Shorts), **TikTok**, **Instagram**, **Spotify** y **GIPHY** se ven dentro del chat.
- Mandar **memes, fotos y GIFs** con el botón 🖼️ (o pegándolos con Ctrl+V en la compu). Las fotos se reducen solas; los GIF se mandan tal cual (máximo 2.8 MB).
- Compartir una **actividad de la agenda** con el botón 📅, o desde cualquier actividad con **💬 Enviar al chat**. Al tocar la tarjeta en el chat, se abre esa actividad en la agenda.
- Borrar sus propios mensajes con **Borrar** debajo del mensaje.

La pestaña muestra cuántos mensajes nuevos hay sin leer.

## 4. Avisos (notificaciones)

En cada teléfono: **Ajustes → Avisos → Activar avisos en este teléfono** y acepta el permiso.
Llega un aviso **10 minutos antes de cada actividad** (las tuyas y las de los dos; no las del otro) y cuando te escriben en el chat.
Las actividades marcadas como hechas no avisan.

- **iPhone:** primero agrega la app a la pantalla de inicio (Safari → Compartir → *Agregar a pantalla de inicio*), ábrela desde ese ícono y ahí activa los avisos. Es una regla de Apple.
- **Android / compu:** funciona directo en Chrome, Edge o Firefox.

**Para que los avisos de actividades lleguen aunque la app esté cerrada** hace falta que algo "despierte" a la app cada minuto (el plan gratis de Vercel no lo permite). Usa un cron gratis:

1. Entra a [cron-job.org](https://cron-job.org) y crea una cuenta gratis.
2. **Create cronjob** → URL: `https://TU-APP.vercel.app/api/notify` → horario: **cada minuto** → guarda.

Sin este paso los avisos de actividades solo salen mientras la app está abierta (los del chat sí llegan siempre).
Las llaves de los avisos se generan solas la primera vez; no hay que configurarlas.

## Consejos

- En el celular, ábrela en el navegador y usa **Agregar a pantalla de inicio** para tenerla como app.
- Si los dos editan al mismo tiempo, cada actividad, fecha y notita se guarda por separado, así que no se borran los cambios del otro.
- En **Ajustes** pueden poner sus nombres, descargar un respaldo y volver a cargar el horario base. El respaldo incluye la agenda y las notitas, no el chat.
