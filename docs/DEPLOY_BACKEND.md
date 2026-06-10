# Fase 2 - Backend online

Objetivo: dejar la API de EliteBid accesible en una URL publica para probar endpoints desde Postman, navegador o la app movil.

## Requisitos del hosting

- Node.js 20.19 o superior.
- MySQL accesible desde internet o desde el mismo proveedor.
- Variables de entorno configurables.
- Puerto dinamico mediante `PORT`.
- Healthcheck HTTP apuntando a `/api/health`.

## Recomendacion elegida

- API: Render.
- Base de datos: Railway MySQL.

Esta combinacion deja una URL publica para el backend y una base MySQL remota para que la app y Postman prueben endpoints fuera de la PC local.

## Paso 1 - Railway MySQL

1. Entrar a Railway y crear un proyecto nuevo.
2. Agregar un servicio MySQL.
3. Abrir la solapa de variables/conexion del servicio MySQL.
4. Copiar estos datos:

```text
MYSQLHOST
MYSQLPORT
MYSQLUSER
MYSQLPASSWORD
MYSQLDATABASE
```

En Render se cargan asi:

```env
DB_HOST=MYSQLHOST
DB_PORT=MYSQLPORT
DB_USER=MYSQLUSER
DB_PASSWORD=MYSQLPASSWORD
DB_NAME=MYSQLDATABASE
DB_CREATE_DATABASE=false
DB_AUTO_INIT=true
DB_SSL=false
```

Si Railway informa que requiere SSL, cambiar:

```env
DB_SSL=true
```

## Paso 2 - Render API

1. Subir estos cambios a GitHub.
2. Entrar a Render.
3. Crear un nuevo Web Service desde el repo `Samtu79/EliteBid`.
4. Render puede detectar `render.yaml`. Si se configura manual:

```text
Build Command: npm install
Start Command: npm run api
Health Check Path: /api/health
```

5. Agregar variables de entorno:

```env
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_CREATE_DATABASE=false
DB_AUTO_INIT=true
DB_SSL=false
APP_PUBLIC_URL=https://URL_DE_RENDER
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_TIMEOUT_MS=15000
MAIL_USER=sdnxdxd@gmail.com
MAIL_PASSWORD=CONTRASENA_DE_APLICACION
MAIL_FROM=EliteBid <sdnxdxd@gmail.com>
MAIL_VERIFICATION_SUBJECT=Tu codigo de verificacion EliteBid
MAIL_ACCOUNT_STATUS_SUBJECT=Validacion de cuenta EliteBid
MAIL_PASSWORD_RESET_SUBJECT=Tu codigo para recuperar la clave EliteBid
```

Render setea `PORT` automaticamente. No hace falta cargar `API_PORT`.

## Paso 3 - Probar API online

Cuando Render termine el deploy, abrir:

```text
https://URL_DE_RENDER/api/health
```

Respuesta esperada:

```json
{ "ok": true }
```

Despues probar:

```text
https://URL_DE_RENDER/api/auctions/home
```

Debe responder con subastas futuras publicas y precios en `null`.

## Comandos

Build:

```bash
npm install
```

Start:

```bash
npm run api
```

Healthcheck:

```text
/api/health
```

## Variables de entorno del backend

```env
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=elitebid
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true
DB_CREATE_DATABASE=false
DB_AUTO_INIT=true
PORT=
APP_PUBLIC_URL=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_TIMEOUT_MS=15000
MAIL_USER=
MAIL_PASSWORD=
MAIL_FROM=EliteBid <mail@dominio.com>
MAIL_VERIFICATION_SUBJECT=Tu codigo de verificacion EliteBid
MAIL_ACCOUNT_STATUS_SUBJECT=Validacion de cuenta EliteBid
MAIL_PASSWORD_RESET_SUBJECT=Tu codigo para recuperar la clave EliteBid
RESEND_API_KEY=
RESEND_FROM=
```

## Verificacion despues del deploy

1. Abrir:

```text
https://URL_PUBLICA/api/health
```

2. Debe responder:

```json
{ "ok": true }
```

3. Probar login demo o registro desde Postman/app.

4. Cambiar el frontend para que apunte a:

```env
EXPO_PUBLIC_API_URL=https://URL_PUBLICA/api
EXPO_PUBLIC_MOBILE_API_URL=https://URL_PUBLICA/api
APP_PUBLIC_URL=https://URL_PUBLICA
```
