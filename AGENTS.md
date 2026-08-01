# AGENTS.md — Edificio Cardamomo

## Propósito del proyecto

Edificio Cardamomo es una aplicación web de reservas para apartaestudios en Neiva, Huila. Permite consultar apartamentos, seleccionar fechas, crear reservas como huésped anónimo o usuario registrado, administrar inventario y disponibilidad, cargar imágenes de marca y sincronizar bloqueos desde calendarios iCal de Airbnb y Booking.com.

## Stack y arquitectura

- Frontend: React 19 + TypeScript + Vite 6.
- Estilos: Tailwind CSS 4 mediante `@tailwindcss/vite`; tokens visuales y fuentes en `src/index.css`.
- Backend: Express en `server.ts`.
  - En desarrollo, Express monta Vite como middleware.
  - En producción, sirve `dist` y aplica fallback SPA a `index.html`.
- Persistencia y autenticación: Firebase Auth, Cloud Firestore y Firebase Storage.
- Backend Firebase: Firebase Admin SDK con Application Default Credentials.
- Integraciones: Google Auth Library para validar OIDC de Cloud Scheduler; `fetch` y un parser iCal propio para calendarios externos.
- Despliegue: Firebase Hosting para el frontend, Cloud Run para el backend y GitHub Actions para despliegues y reglas.
- No hay suite de tests automatizados ni script de `test` configurado actualmente.

## Estructura importante

| Ruta | Responsabilidad |
| --- | --- |
| `src/App.tsx` | Estado global de autenticación, habitaciones, configuración visual y selección de vista huésped/admin. |
| `src/components/LandingPage.tsx` | Página pública, apartamentos, servicios, ubicación y CTA de reserva. |
| `src/components/GuestDashboard.tsx` | Calendario, validación de contacto, creación/cancelación de reservas y reservas del usuario. |
| `src/components/AdminPanel.tsx` | CRUD de apartamentos, imágenes, bloqueos manuales, configuración global y URLs iCal. |
| `src/components/LoginModal.tsx` | Login/registro con correo y Google; vinculación de sesiones anónimas y consolidación de reservas. |
| `src/components/Navbar.tsx` | Navegación, sesión, logout y cambio de vista del administrador. |
| `src/lib/firebase.ts` | Inicialización del cliente Firebase, Firestore, Auth, Storage y manejo estructurado de errores. |
| `src/lib/firebaseConfig.ts` | Lectura estricta de variables `VITE_FIREBASE_*`. |
| `src/lib/api.ts` | Construcción de URLs del backend usando `VITE_API_BASE_URL`. |
| `src/types.ts` | Modelos `UserProfile`, `Room`, `RoomIntegration`, `Booking` y `Settings`. |
| `server.ts` | API Express, Firebase Admin, consolidación de usuarios, feeds/sincronización iCal y notificaciones simuladas. |
| `firestore.rules` | Reglas y validación de documentos de Firestore. Mantiene denegación por defecto. |
| `storage.rules` | Lectura pública y escritura de administración para `branding/**` y `rooms/**`. |
| `.github/workflows/` | Workflows independientes para Hosting, Cloud Run y reglas Firebase. |

## Modelo de datos y reglas de negocio

Las colecciones principales son:

- `users/{uid}`: perfil de Auth, rol (`guest` o `admin`), datos de contacto y si la sesión es temporal.
- `rooms/{roomId}`: nombre, descripción, capacidad, precio por noche, imágenes y `blockedDates` en formato `YYYY-MM-DD`.
- `roomIntegrations/{roomId}`: URLs iCal privadas para Airbnb y Booking.com. No deben volver a guardarse en `rooms` salvo para compatibilidad/migración legacy.
- `bookings/{bookingId}`: reserva, usuario, contacto del huésped, fechas, estado y total. Los estados son `confirmed` y `cancelled`.
- `settings/global`: logo, banner hero y configuración de notificaciones.

Consideraciones que deben conservarse:

1. El acceso anónimo permite reservar. Al registrarse con correo o Google, `LoginModal` consolida el perfil temporal y migra sus reservas mediante `POST /api/consolidate-temporary-user`.
2. El administrador se identifica por `ADMIN_EMAIL`; las reglas de Firestore también validan correo verificado, colección `admins` o rol admin en el perfil. No conviertas el rol en un dato controlable por el cliente.
3. Las reservas requieren nombre completo, celular e identificación. Las reglas de Firestore validan longitud, tipos, fechas como strings de 10 caracteres y `createdAt == request.time`.
4. Al reservar, el frontend escribe la reserva y luego actualiza `rooms.blockedDates` en operaciones separadas. Este flujo no es una transacción; cualquier cambio relacionado con concurrencia o doble reserva debe evaluar primero migrarlo a una transacción o a una operación backend atómica.
5. Al cancelar, el huésped solo puede cambiar `status` de su propia reserva a `cancelled`; después se liberan las fechas del apartamento.
6. El checkout iCal es exclusivo: el rango bloqueado incluye check-in y excluye check-out. Mantén el formato `YYYY-MM-DD` al tocar cálculos de disponibilidad.
7. `POST /api/notify-booking` actualmente simula email, WhatsApp y SMS escribiendo logs; no debe describirse ni tratarse como integración real con proveedores externos.

## Desarrollo local

Requisitos prácticos: Node.js 22 (coincide con GitHub Actions), npm y un proyecto Firebase configurado.

1. Instala dependencias con `npm install` (usa `npm ci` en CI).
2. Crea las variables de entorno a partir de `.env.example`.
   - Vite necesita las variables `VITE_FIREBASE_*` obligatorias para inicializar el cliente.
   - El servidor necesita `FIREBASE_PROJECT_ID` y credenciales ADC. En local se recomienda `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un JSON de cuenta de servicio fuera del control de versiones, o `gcloud auth application-default login`.
   - Vite carga `.env.local`; `dotenv/config` del servidor carga `.env` por defecto. Si se usan archivos distintos, asegúrate de que las variables del servidor estén realmente en el entorno del proceso.
3. Habilita en Firebase Authentication los proveedores Anonymous, Email/Password y Google.
4. Despliega `firestore.rules` y `storage.rules` al proyecto correspondiente cuando cambies reglas o prepares un entorno nuevo.
5. Arranca frontend y backend juntos con `npm run dev`. El puerto es `PORT` o `3000` y el backend escucha en `0.0.0.0`.

## Scripts disponibles

- `npm run dev`: ejecuta `server.ts` con `tsx` y Vite en middleware.
- `npm run lint`: ejecuta `tsc --noEmit`; es la comprobación estática principal.
- `npm run build:hosting`: compila solo el frontend Vite en `dist`.
- `npm run build:backend`: empaqueta `server.ts` en `dist/server.cjs` con esbuild.
- `npm run build`: ejecuta ambos builds.
- `npm run start`: ejecuta `dist/server.cjs`; en producción debe tener `NODE_ENV=production`.
- `npm run clean`: elimina `dist` y `server.js` con `rm -rf`; es un script Unix y puede no funcionar directamente en PowerShell.

Antes de entregar cambios de código, ejecuta como mínimo:

```bash
npm run lint
npm run build
```

El build requiere las variables de Firebase del cliente; no reemplaces valores reales por secretos en el repositorio para hacerlo pasar. Si no existe configuración Firebase válida, reporta la limitación y ejecuta al menos `npm run lint`.

## API del backend

- `POST /api/consolidate-temporary-user`: valida tokens Firebase temporal y final, consolida el perfil y migra reservas anónimas.
- `GET /api/rooms/:roomId/ical`: publica las reservas confirmadas de un apartamento como calendario iCal.
- `POST /api/sync-ical`: combina reservas locales y calendarios externos, deduplica `blockedDates` y actualiza Firestore. Acepta token Firebase de admin, token OIDC autorizado de Cloud Scheduler o llamada loopback local.
- `POST /api/notify-booking`: registra notificaciones simuladas según `settings/global`.

El backend aplica CORS solo a rutas `/api/*`. Con `CORS_ALLOWED_ORIGINS` vacío permite `*`; si se configura, usa una lista separada por comas. En Cloud Run se recomienda desactivar `ENABLE_ICAL_SYNC_TIMER` y disparar `/api/sync-ical` con Cloud Scheduler.

## Despliegue

Los workflows se activan manualmente o al hacer push a `main` cuando cambian sus rutas relevantes:

- `deploy-hosting.yml`: build de Vite y despliegue de Firebase Hosting.
- `deploy-backend-cloud-run.yml`: despliegue de `server.ts` como source a Cloud Run.
- `deploy-firestore-rules.yml`: despliegue de reglas de Firestore y Storage.

Las variables de despliegue se inyectan como secretos de GitHub. Los nombres y su propósito están documentados en `README.md` y `.env.example`; no hardcodees IDs de proyecto, URLs iCal, tokens, credenciales ni destinos operativos.

## Convenciones para cambios

- Mantén TypeScript estricto en la práctica: actualiza las interfaces de `src/types.ts` cuando cambie el esquema y evita propagar `any` sin necesidad.
- Mantén los componentes como funciones con export default y conserva la separación de responsabilidades existente.
- Usa las clases utilitarias Tailwind y los tokens de color/fuentes definidos en `src/index.css`; evita introducir CSS global o colores arbitrarios si el token existente cubre el caso.
- Reutiliza `getApiUrl` para las llamadas al backend y `handleFirestoreError` cuando agregues operaciones Firestore que requieran diagnóstico estructurado.
- Si cambias una colección, un campo o una operación de escritura, revisa conjuntamente `src/types.ts`, el consumidor frontend, `firebase-blueprint.json`, `firestore.rules` y `storage.rules` cuando corresponda.
- Conserva la compatibilidad con datos legacy `airbnb_ical_url` y `booking_ical_url` si modificas la migración de integraciones iCal.
- No agregues dependencias ni cambies scripts sin actualizar `package-lock.json`.
- No hay formatter o linter adicional configurado; sigue el estilo del archivo que estés modificando y valida con TypeScript.

## Seguridad y datos sensibles

- Nunca incluyas el contenido de `.env`, `.env.local` o `service-account*.json` en commits, logs, respuestas o capturas. Aunque están ignorados por Git, verifica el estado antes de entregar.
- No expongas URLs privadas de iCal al frontend público ni relajes las reglas de `roomIntegrations`.
- No uses Firebase Admin SDK en código del cliente. El Admin SDK salta las reglas de Firestore y solo pertenece al backend.
- Revisa autenticación y autorización de cualquier endpoint nuevo; el servidor Express está desplegado con `--allow-unauthenticated` y debe proteger cada operación sensible.
- No aflojes la regla de denegación por defecto ni la validación de tipos/tamaños sin una justificación explícita.
- Después de cambiar reglas, prueba tanto el acceso público esperado (`rooms`, `settings/global`) como las operaciones autenticadas de huésped y administrador.

## Diagnóstico rápido

- Error de configuración Firebase al arrancar el cliente: falta una variable `VITE_FIREBASE_*` obligatoria.
- Error del servidor al iniciar: falta `FIREBASE_PROJECT_ID` o Application Default Credentials.
- Error de permisos Firestore: compara la operación con `firestore.rules`, especialmente `createdAt`, `request.auth.uid`, rol admin y la colección `roomIntegrations`.
- El frontend no llega al backend en producción: revisa `VITE_API_BASE_URL`, CORS y `CORS_ALLOWED_ORIGINS`.
- iCal no se actualiza: comprueba las URLs guardadas en `roomIntegrations`, el token requerido por `/api/sync-ical` y la configuración de Cloud Scheduler.
- Imágenes no suben: valida tipo/tamaño en `AdminPanel`, Firebase Storage y las reglas de `branding/**` o `rooms/**`.
