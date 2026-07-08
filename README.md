# Edificio Cardamomo

Aplicación de reservas para apartaestudios con Firebase Auth, Firestore, sincronización iCal y notificaciones simuladas al host.

## Configuración Local

1. Instala dependencias:
   `npm install`
2. Crea `.env.local` a partir de `.env.example` y pega la configuración de tu nuevo proyecto Firebase.
3. En Firebase Authentication habilita:
   - Anonymous
   - Email/Password
   - Google
4. En desarrollo local, descarga una credencial de servicio y configura `GOOGLE_APPLICATION_CREDENTIALS`.
5. Ejecuta:
   `npm run dev`

## Firestore

Despliega `firestore.rules` en tu proyecto Firebase. Las reglas permiten reservas de usuarios anónimos temporales y exigen datos básicos del huésped: nombre, celular e identificación.

Cuando un invitado temporal se registra con correo/contraseña o Google, la app consolida sus reservas en el usuario definitivo.
