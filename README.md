# Edificio Cardamomo

Aplicación de reservas para apartamentos en Neiva, Huila, con Firebase Auth, Firestore, disponibilidad por ocupación, sincronización iCal y notificaciones simuladas al host.

## Configuración Local

Requisitos: Node.js 22, npm y un proyecto Firebase configurado.

1. Instala dependencias:
   `npm install`
2. Copia `.env.example` a `.env` para que tanto Vite como `dotenv/config` del servidor puedan leer las variables. Usa `.env.local` si quieres separar la configuración exclusiva del frontend, pero las variables del servidor deben quedar en `.env` o en el entorno del proceso.
3. En Firebase Authentication habilita:
   - Anonymous
   - Email/Password
   - Google
4. En desarrollo local, configura `FIREBASE_PROJECT_ID` y Application Default Credentials mediante `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un JSON fuera del repositorio, o ejecuta `gcloud auth application-default login`.
5. Ejecuta:
   `npm run dev`

La app ya no usa `firebase-applet-config.json` como respaldo. Toda la configuración de Firebase se toma desde variables de entorno.

## Modo pausa del frontend

Si necesitas pausar temporalmente el sitio sin tocar backend, Firestore ni reglas, activa estas variables al momento del build:

- `VITE_PROJECT_PAUSED=true`
- `VITE_PROJECT_PAUSE_MESSAGE="Proyecto en pausa."`

Con `VITE_PROJECT_PAUSED=true`, la aplicación renderiza una pantalla completa de pausa y deja de cargar la experiencia principal del sitio.

## Scripts

- `npm run dev`: inicia Express con Vite en middleware; usa `PORT` o el puerto `3000`.
- `npm run lint`: ejecuta `tsc --noEmit`.
- `npm run test`: ejecuta las suites de iCal y disponibilidad con `node:test` y `tsx`.
- `npm run build:hosting`: compila el frontend en `dist`.
- `npm run build:backend`: empaqueta `server.ts` en `dist/server.cjs`.
- `npm run build`: ejecuta ambos builds.
- `npm run gcp-build`: hook de Cloud Build que ejecuta `npm run build:backend`.
- `npm run start`: inicia el backend empaquetado en producción.
- `npm run clean`: elimina artefactos locales (`dist` y `server.js`); está definido con sintaxis Unix.

Antes de entregar cambios, ejecuta como mínimo `npm run lint` y `npm run build`. El build completo necesita las variables `VITE_FIREBASE_*` del cliente.

## Firestore y Storage

Despliega `firestore.rules` y `storage.rules` en tu proyecto Firebase. Las reglas permiten reservas de usuarios anónimos temporales y exigen datos básicos del huésped: nombre, celular e identificación. El logo y el banner principal se suben desde el panel admin a Firebase Storage y sus URLs quedan guardadas en `settings/global`.

Las URLs iCal externas de Airbnb y Booking ya no viven en `rooms`. Ahora se guardan en `roomIntegrations/{roomId}`, una colección privada visible solo para administradores y usada por el backend al sincronizar disponibilidad. En `rooms`, `manualBlockedDates` conserva los bloqueos creados desde el panel, `externalBlockedDates` conserva la última proyección importada y `blockedDates` es la unión pública de bloqueos manuales, fechas externas y reservas confirmadas que consulta el huésped.

Cuando un invitado temporal se registra con correo/contraseña o Google, la app consolida sus reservas en el usuario definitivo.

## Despliegue automatizado

El despliegue se automatiza con tres workflows de GitHub Actions, ejecutables manualmente o al hacer push a `main` cuando cambian sus rutas configuradas:

- `deploy-hosting.yml`: construye el frontend y despliega Firebase Hosting.
- `deploy-backend-cloud-run.yml`: despliega `server.ts` a Cloud Run usando `gcloud run deploy --source`.
- `deploy-firestore-rules.yml`: despliega `firestore.rules` y `storage.rules`.

### Secretos de GitHub requeridos

#### Autenticación con Google Cloud

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

#### Firebase Hosting / Firestore

- `FIREBASE_PROJECT_ID`

#### Cloud Run

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT` (recomendado)
- `FIRESTORE_DATABASE_ID`
- `ADMIN_EMAIL`
- `ENABLE_ICAL_SYNC_TIMER` (usar `"false"` en Cloud Run)
- `CLOUD_SCHEDULER_OIDC_AUDIENCE` (URL exacta de `POST /api/sync-ical`)
- `CLOUD_SCHEDULER_OIDC_EMAIL` (service account usada por Cloud Scheduler para el token OIDC)
- `CORS_ALLOWED_ORIGINS` (opcional, lista separada por comas con los orígenes del frontend)

#### Variables de build para Vite

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIRESTORE_DATABASE_ID`
- `VITE_ADMIN_EMAIL`
- `VITE_API_BASE_URL`
- `VITE_PROJECT_PAUSED`
- `VITE_PROJECT_PAUSE_MESSAGE`

`VITE_API_BASE_URL` debe apuntar a la URL pública de Cloud Run, por ejemplo:
`https://tu-servicio-abcdef-uc.a.run.app`

### Notas de arquitectura

- El frontend ya no depende de que `/api` viva en el mismo dominio. Si `VITE_API_BASE_URL` está definida, las llamadas al backend salen hacia Cloud Run.
- El backend responde preflight CORS para rutas `/api/*`. Si defines `CORS_ALLOWED_ORIGINS`, solo esos orígenes quedan permitidos; si se deja vacía, la API responde con `Access-Control-Allow-Origin: *`.
- En Cloud Run el servidor ahora usa `process.env.PORT`.
- La sincronización iCal por `setInterval` queda desactivada por defecto en producción. En Cloud Run conviene invocar `POST /api/sync-ical` desde Cloud Scheduler.
- Si un feed iCal configurado responde con error o contenido inválido, ese apartamento conserva su última proyección válida de `blockedDates` y la sincronización responde con estado parcial para permitir reintentos.
- Los bloqueos locales no dependen de Airbnb o Booking: sobreviven a una sincronización iCal y se combinan con reservas confirmadas y fechas externas.
- `POST /api/sync-ical` acepta tres formas de acceso:
  - Bearer token Firebase de un administrador para el disparo manual desde la UI.
  - Bearer token OIDC de Cloud Scheduler validado con `CLOUD_SCHEDULER_OIDC_AUDIENCE` y `CLOUD_SCHEDULER_OIDC_EMAIL`.
  - Llamada loopback local sin bearer; no debe exponerse como mecanismo de autenticación remoto.
- La respuesta de sincronización incluye `syncRunId`, resumen de ejecución, resultados por apartamento, advertencias y `sourceDiagnostics` con estado, duración, respuesta HTTP y conteo de eventos por feed. Conserva el `syncRunId` al revisar logs.
- El endpoint `GET /api/rooms/:roomId/ical.ics` exporta la proyección completa de fechas bloqueadas del apartamento, incluyendo reservas directas y fechas importadas desde Airbnb/Booking, para pegarla en ambas plataformas. La ruta anterior `/ical` se conserva como alias de compatibilidad.
- Después de cancelar una reserva, el frontend llama a `POST /api/rooms/:roomId/rebuild-availability` con el token del huésped; el backend verifica que la reserva le pertenezca y reconstruye `blockedDates` sin exponer las reservas de otros huéspedes.

## API principal

- `POST /api/consolidate-temporary-user`: consolida un huésped anónimo al registrarse y migra sus reservas.
- `GET /api/rooms/:roomId/ical.ics`: publica el calendario completo de fechas bloqueadas; `/api/rooms/:roomId/ical` es alias legacy.
- `POST /api/rooms/:roomId/rebuild-availability`: reconstruye disponibilidad después de cancelar una reserva propia.
- `POST /api/sync-ical`: sincroniza Airbnb/Booking y devuelve diagnósticos de la ejecución.
- `POST /api/notify-booking`: registra logs de email, WhatsApp y SMS simulados según `settings/global`; no envía mensajes mediante proveedores externos.
