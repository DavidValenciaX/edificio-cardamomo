# Edificio Cardamomo

Aplicación de reservas para apartaestudios con Firebase Auth, Firestore, sincronización iCal y notificaciones simuladas al host.

## Configuración Local

1. Instala dependencias:
   `npm install`
2. Crea `.env.local` a partir de `.env.example` y pega la configuración de tu proyecto Firebase.
3. En Firebase Authentication habilita:
   - Anonymous
   - Email/Password
   - Google
4. En desarrollo local, descarga una credencial de servicio y configura `GOOGLE_APPLICATION_CREDENTIALS`.
5. Ejecuta:
   `npm run dev`

La app ya no usa `firebase-applet-config.json` como respaldo. Toda la configuración de Firebase se toma desde variables de entorno.

## Firestore y Storage

Despliega `firestore.rules` y `storage.rules` en tu proyecto Firebase. Las reglas permiten reservas de usuarios anónimos temporales y exigen datos básicos del huésped: nombre, celular e identificación. El logo del hotel se sube desde el panel admin a Firebase Storage y su URL queda guardada en `settings/global`.

Cuando un invitado temporal se registra con correo/contraseña o Google, la app consolida sus reservas en el usuario definitivo.

## Despliegue automatizado

Se agregaron tres workflows de GitHub Actions:

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
- `CORS_ALLOWED_ORIGINS` (opcional, lista separada por comas con los orígenes del frontend)

#### Variables de build para Vite

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_API_BASE_URL`

Los workflows reutilizan algunos secretos compartidos para no duplicarlos en GitHub:

- `VITE_FIREBASE_PROJECT_ID` se toma desde `FIREBASE_PROJECT_ID`
- `VITE_FIRESTORE_DATABASE_ID` se toma desde `FIRESTORE_DATABASE_ID`
- `VITE_ADMIN_EMAIL` se toma desde `ADMIN_EMAIL`

`VITE_API_BASE_URL` debe apuntar a la URL publica de Cloud Run, por ejemplo:
`https://tu-servicio-abcdef-uc.a.run.app`

### Notas de arquitectura

- El frontend ya no depende de que `/api` viva en el mismo dominio. Si `VITE_API_BASE_URL` esta definida, las llamadas al backend salen hacia Cloud Run.
- El backend responde preflight CORS para rutas `/api/*`. Si defines `CORS_ALLOWED_ORIGINS`, solo esos orígenes quedan permitidos; si se deja vacía, la API responde con `Access-Control-Allow-Origin: *`.
- En Cloud Run el servidor ahora usa `process.env.PORT`.
- La sincronización iCal por `setInterval` queda desactivada por defecto en producción. En Cloud Run conviene invocar `POST /api/sync-ical` desde Cloud Scheduler.
