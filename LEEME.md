# Michis 🐾 — nuestra agenda

Agenda, chat y notitas para los dos. Cómo subirla a Vercel:

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
- Mandar **memes, fotos y GIFs** con el botón 📎 (o pegándolos con Ctrl+V en la compu). Las fotos se reducen solas; los GIF se mandan tal cual (máximo 2.8 MB).
- Tocar **😊** para abrir el panel con pestañas, como en WhatsApp:
  - **Emoji:** por categorías, con los que más usas en *Recientes*.
  - **GIF:** buscador de GIFs, *Recientes* y *Nuestros GIFs* (toca ☆ en un GIF para guardarlo).
  - **Stickers:** buscador de stickers, *Recientes* y *Nuestros stickers*. Con **+ Crear sticker** haces uno con cualquier foto (original, cuadrado o en círculo, con texto tipo meme). También puedes tocar una foto del chat → **✂️ Hacer sticker**.
  - Los GIFs y stickers guardados son **de los dos**: lo que guarda uno le aparece al otro. **Editar** sirve para quitarlos.
  - Al tocar un GIF o sticker que te mandaron puedes **☆ Guardarlo** o **Enviarlo otra vez**.
- Compartir una **actividad de la agenda** con el botón 📅, o desde cualquier actividad con **💬 Enviar al chat**. Al tocar la tarjeta en el chat, se abre esa actividad en la agenda.
- Borrar sus propios mensajes con **Borrar** debajo del mensaje.

La pestaña muestra cuántos mensajes nuevos hay sin leer.

**Como WhatsApp:**
- **Fotos de perfil:** en **Ajustes → Nombres y fotos** toca el círculo de cada quien para ponerle foto (o toca la foto arriba en el chat). Las ven los dos.
- Arriba del chat se ve la foto y el nombre de la otra persona, y cuándo escribió por última vez.
- **Responder un mensaje:** desliza el mensaje a la derecha con el dedo (o toca **Responder** debajo). Puedes contestar con texto, GIF, sticker o foto. Al tocar la cita te lleva al mensaje original.
- **Fondo del chat:** toca el ícono de la paleta arriba a la derecha y elige uno o pon una foto tuya. El fondo es de cada teléfono.

**Más cosas del chat:**
- **Estados rápidos** (ícono del rayo): "🚗 Saliendo del trabajo", "⏱️ Llego en 20 min", "💕 Te extraño"… o uno propio. Le llega un aviso al otro y se ve arriba del chat por 3 horas.
- **Reacciones:** mantén presionado un mensaje (o clic derecho en la compu) para reaccionar ❤️😂😮… responder, copiar o borrar.
- **Visto:** ✓ = enviado · ✓✓ azul = ya lo leyó.
- **Notas de voz:** sin texto escrito, el botón redondo es un micrófono. Tócalo para grabar (hasta 5 min), ➤ para enviar o el bote para cancelar.

**Pasar sus stickers de WhatsApp:**

En 😊 → **Stickers** → **⬇ Importar** pueden elegir varios a la vez. Se guardan tal cual (los animados siguen animados y con fondo transparente) y le aparecen a los dos.

- **Android:** en *Importar* busca la carpeta
  `Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Stickers` (los archivos son `.webp` con nombres raros) y selecciona los que quieras.
  Si el selector no deja entrar a esa carpeta, ábrela con la app *Archivos* del teléfono, cópialos a *Descargas* y elígelos desde ahí.
- **iPhone:** WhatsApp no deja sacar los stickers en el iPhone. Usa WhatsApp Web en la compu: clic derecho en el sticker → *Guardar imagen como…*
  (o *Copiar imagen* y luego **Ctrl+V** en la app con la pestaña Stickers abierta). Una vez importados en la compu, aparecen en el iPhone también.

**Para activar el buscador de GIFs y stickers (gratis):**
1. Entra a [developers.giphy.com](https://developers.giphy.com/dashboard/), crea una cuenta y luego **Create an App → API** (elige la opción gratis).
2. Copia la **API Key**.
3. En Vercel → **Settings → Environment Variables** agrega `GIPHY_API_KEY` con esa llave y haz **Redeploy**.

Sin la llave todo lo demás funciona (stickers propios, GIFs guardados, pegar links de GIPHY); solo no aparece el buscador.

## 4. Instalarla en el teléfono

Al abrirla en el celular aparece arriba **📲 Instala la app en tu teléfono → Instalar**
(también está en **Ajustes → App en el teléfono**).

- **Android (Chrome):** toca **Instalar** y acepta. Si no aparece la ventana, menú **⋮ → Instalar app**.
- **iPhone (Safari):** botón **Compartir ⬆️ → Agregar a pantalla de inicio → Agregar**.

Queda con su ícono de corazón, se abre a pantalla completa como cualquier app y funciona aunque no haya internet
(los cambios se envían al volver la conexión). Manteniendo presionado el ícono hay atajos a **Chat** y **Semana**.

## 5. Avisos (notificaciones) estilo WhatsApp

Abre la app instalada y toca **🔔 Activar** en el aviso de arriba (o **Ajustes → Avisos**) y acepta el permiso.

- Los mensajes del chat llegan con el nombre de quien escribe; si llegan varios seguidos se juntan en un solo aviso ("Ella (3 mensajes)"), suenan y vibran.
- El aviso tiene los botones **Responder** (abre el chat) y **Marcar como leído**.
- El ícono de la app muestra el numerito de mensajes sin leer (en los teléfonos que lo permiten) y se borra al abrir el chat.
- Los avisos de actividades se quedan en pantalla hasta que los veas, con el botón **Ver en la agenda**.

Hay que activarlos una vez en cada teléfono. Llega un aviso **10 minutos antes de cada actividad** (las tuyas y las de los dos; no las del otro) y cuando te escriben en el chat.
Las actividades marcadas como hechas no avisan.

- **iPhone:** primero agrega la app a la pantalla de inicio (Safari → Compartir → *Agregar a pantalla de inicio*), ábrela desde ese ícono y ahí activa los avisos. Es una regla de Apple.
- **Android / compu:** funciona directo en Chrome, Edge o Firefox.

**Para que los avisos de actividades lleguen aunque la app esté cerrada** hace falta que algo "despierte" a la app cada minuto (el plan gratis de Vercel no lo permite). Usa un cron gratis:

1. Entra a [cron-job.org](https://cron-job.org) y crea una cuenta gratis.
2. **Create cronjob** → URL: `https://TU-APP.vercel.app/api/notify` → horario: **cada minuto** → guarda.

Sin este paso los avisos de actividades solo salen mientras la app está abierta (los del chat sí llegan siempre).
Las llaves de los avisos se generan solas la primera vez; no hay que configurarlas.

## 6. Para coordinarse mejor

En **Semana**:
- **💌 Proponer plan:** el otro responde *Sí*, *No puedo* u *Otra hora* desde el chat o desde la Semana. Si dice que sí, se agrega solo a la agenda de los dos.
- **🕐 Libres juntos:** muestra los huecos donde ninguno tiene nada (el tiempo personal aparece aparte, punteado). Toca uno para proponer un plan. El horario a considerar se ajusta ahí mismo.
- **Choques:** al crear o editar una actividad, avisa si se cruza con otra de esa persona.
- **Ánimo del día:** cada quien elige cómo se siente (y una nota opcional). El del otro también se ve junto a su nombre en el chat.
- **Cuenta regresiva** de las próximas fechas importantes, **Resumen** de la semana (también llega como aviso los domingos a las 5 PM) y **Balance de quehaceres** con botón para intercambiarlos.

En **Michis** 🐱:
- Cada gato tiene **perfil**: foto (toca su carita), nombre, pelaje (smoking, vaca, negro, gris atigrado con blanco y cafecito, naranja, calicó…), sexo, fecha de nacimiento (calcula la **edad** sola) y notas. Sin foto se dibuja una carita con los colores de su pelaje.
- En el perfil llevan su historial: **peso** (con gráfica y si subió o bajó), **vacunas**, **desparasitaciones** y **visitas al veterinario**. Si anotan "próxima dosis/cita", se crea el recordatorio con aviso a las 9 AM.
- Registren comida, agua, arenero… con un toque (se ve quién y hace cuánto). Al marcar ✓ Hecho una vacuna, desparasitación o visita, queda en el historial del michi.

En **Notitas → 💡 Ideas para citas:** guarden ideas por tipo y costo, y cuando no sepan qué hacer usen la ruleta **🎲 ¿Qué hacemos hoy?**. Desde cualquier idea pueden proponer el plan.

## Consejos

- En el celular, ábrela en el navegador y usa **Agregar a pantalla de inicio** para tenerla como app.
- Si los dos editan al mismo tiempo, cada actividad, fecha y notita se guarda por separado, así que no se borran los cambios del otro.
- En **Ajustes** pueden poner sus nombres, descargar un respaldo y volver a cargar el horario base. El respaldo incluye la agenda y las notitas, no el chat.
