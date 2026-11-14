# Nuestra agenda — cómo subirla a Vercel

La carpeta tiene tres archivos:

- `index.html` — la app (semana, mes con marcadores, notitas y ajustes).
- `api/state.js` — guarda los datos en la nube para que los dos vean lo mismo.
- `LEEME.md` — esta guía.

## 1. Subirla

**Opción fácil (sin terminal):**
1. Sube esta carpeta a un repositorio nuevo de GitHub.
2. En vercel.com → **Add New → Project**, elige el repositorio y presiona **Deploy**.
   No hay que configurar nada: no usa framework ni comando de build.

**Opción con terminal:** dentro de la carpeta, corre `npx vercel` y luego `npx vercel --prod`.

Con eso la app ya funciona, pero cada teléfono guarda sus propios datos
("Solo en este teléfono"). Para compartirla entre los dos, sigue el paso 2.

## 2. Compartirla entre los dos (gratis)

1. En tu proyecto de Vercel, ve a **Storage** → **Create Database** y elige **Upstash for Redis** (el plan gratis alcanza de sobra).
2. Conéctala al proyecto. Vercel agrega solas las variables de conexión
   (`KV_REST_API_URL` y `KV_REST_API_TOKEN`, o `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; la app acepta cualquiera de las dos).
3. **Recomendado:** en **Settings → Environment Variables** agrega `APP_PIN` con un número que solo ustedes sepan. Así nadie más puede ver o cambiar su agenda aunque tenga el link.
4. Ve a **Deployments** y haz **Redeploy** para que tome las variables.
5. Abre la app en los dos teléfonos. Si pusieron PIN, escríbanlo en **Ajustes → Sincronización**.
   El indicador de arriba debe decir **Sincronizado**.

## Consejos

- En el celular, ábrela en el navegador y usa **Agregar a pantalla de inicio** para tenerla como app.
- Si los dos editan al mismo tiempo, cada actividad, fecha y notita se guarda por separado, así que no se borran los cambios del otro.
- En **Ajustes** pueden poner sus nombres, descargar un respaldo y volver a cargar el horario base.
