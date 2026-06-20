# EliteBid

Demo Expo + React Native para la segunda entrega del TPO DAI 1C2026. La app muestra un circuito mobile funcional de subastas premium: login, subastas, sala en vivo, pujas, favoritos, compras, perfil, medios de pago y penalidades.

## Como correr la demo

Requisitos:

- Node.js 20.19 o superior
- Expo SDK 54
- MySQL 8.x o compatible, o Docker Desktop

Comandos:

```bash
npm install
copy .env.example .env
docker compose up -d mysql
npm run db:init
npm run api
npm run web
```

`npm run api` levanta el backend en `http://127.0.0.1:3001/api`. En otra terminal, Expo abre una URL local. Si se quiere fijar puerto:

```bash
npm run web -- --port 3002
```

Para usar Expo Go en un iPhone fisico, la API no puede apuntar a `127.0.0.1` porque eso seria el propio telefono. En `.env`, configurar la IP Wi-Fi de la PC:

```text
EXPO_PUBLIC_WEB_API_URL=http://127.0.0.1:3001/api
EXPO_PUBLIC_MOBILE_API_URL=http://TU_IP_LAN:3001/api
```

Despues reiniciar Expo para que vuelva a leer las variables:

```bash
npm run api
npm run start -- --clear
```

## Usuario de prueba

```text
Email: alejandro@elitebid.com
Clave: Elite1234
Categoria: platino
```

## Circuito sugerido para mostrar

1. Iniciar sesion con el usuario de prueba.
2. Entrar a `Subastas`.
3. Abrir `Patek Philippe Grand Complications`.
4. Ingresar a la sala en vivo.
5. Hacer una puja y verificar que cambia el monto/feed.
6. Marcar y desmarcar favoritos para ver el popup.
7. Entrar a `Compras`, confirmar pago y ver la compra pasar de `Puja ganadora` a `Compra pagada`.
8. Entrar a `Perfil` y revisar estadisticas, foto y datos bloqueados.
9. Entrar a `Penalidades`, pagar o marcar como solucionada.

## Registro como invitado

El registro inicial solicita nombre, apellido, documento, fotos, domicilio y email de verificacion. Al tocar `Continuar como invitado`, el backend crea una cuenta con `rol = invitado`, `email_verificado = no` y guarda un token de verificacion.

El backend envia el mail de verificacion con una cuenta SMTP de la empresa usando Nodemailer. Configurar en `.env`:

```text
APP_PUBLIC_URL=http://127.0.0.1:3001
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FAMILY=4
SMTP_TIMEOUT_MS=15000
MAIL_USER=sdnxdxd@gmail.com
MAIL_PASSWORD=clave_o_app_password
MAIL_FROM=EliteBid <sdnxdxd@gmail.com>
MAIL_VERIFICATION_SUBJECT=Tu codigo de verificacion EliteBid
MAIL_PASSWORD_RESET_SUBJECT=Tu codigo para recuperar la clave EliteBid
```

La casilla `verificacion@elitebid.com` debe existir en el proveedor elegido. Si es Gmail/Google Workspace, usar una app password, no la clave normal de la cuenta. Como alternativa se puede usar Resend:

```text
RESEND_API_KEY=tu_api_key_de_resend
RESEND_FROM=EliteBid <onboarding@resend.dev>
```

Si no hay SMTP ni `RESEND_API_KEY`, el registro no falla: el backend deja la cuenta pendiente y muestra el codigo en consola para pruebas locales. Para reenviar el mail se puede llamar:

En Render, las variables de correo se cargan en el servicio backend en **Environment**; el archivo `.env` de la PC no se publica. Configura `MAIL_USER` y `MAIL_PASSWORD` como secretos junto con los valores SMTP anteriores.

```bash
curl -X POST http://127.0.0.1:3001/api/auth/resend-verification -H "Content-Type: application/json" -d "{\"email\":\"usuario@mail.com\"}"
```

El codigo de 6 digitos verifica solamente el email. La validacion de cuenta se informa despues, en otro mail, como aceptada o rechazada por la empresa:

```bash
curl -X POST http://127.0.0.1:3001/api/cuentas/1/validacion -H "Content-Type: application/json" -H "x-admin-review-token: TU_TOKEN" -d "{\"resultado\":\"aceptada\"}"
curl -X POST http://127.0.0.1:3001/api/cuentas/1/validacion -H "Content-Type: application/json" -H "x-admin-review-token: TU_TOKEN" -d "{\"resultado\":\"rechazada\"}"
```

Si se define `ADMIN_REVIEW_TOKEN` en `.env`, ese token habilita la validacion administrativa por API.

Para recuperar clave, primero se solicita el codigo por mail y despues se confirma el cambio:

```bash
curl -X POST http://127.0.0.1:3001/api/auth/request-password-reset -H "Content-Type: application/json" -d "{\"email\":\"usuario@mail.com\"}"
curl -X POST http://127.0.0.1:3001/api/auth/reset-password -H "Content-Type: application/json" -d "{\"email\":\"usuario@mail.com\",\"code\":\"123456\",\"password\":\"Nueva!2203\",\"confirmPassword\":\"Nueva!2203\"}"
```

Mientras la cuenta este como invitada:

- Solo ve subastas futuras.
- No ve precios base ni pujas actuales.
- No puede entrar a salas, pujar, guardar favoritos, agregar medios de pago, comprar ni modificar datos de perfil.
- Puede cargar el codigo de un solo uso desde `Perfil`, crear una contrasena definitiva y pasar a `cliente`.
- El pais queda fijo en Argentina.

## Entregables

- Guia para correr y explicar la entrega: [`GUIA_SEGUNDA_ENTREGA.md`](./GUIA_SEGUNDA_ENTREGA.md)
- Resumen para defensa oral: [`DEFENSA_SEGUNDA_ENTREGA_RESUMEN.md`](./DEFENSA_SEGUNDA_ENTREGA_RESUMEN.md)
- Informe segunda entrega: [`INFORME_SEGUNDA_ENTREGA.md`](./INFORME_SEGUNDA_ENTREGA.md)
- Checklist QA con capturas: [`QA_CHECKLIST_SEGUNDA_ENTREGA.md`](./QA_CHECKLIST_SEGUNDA_ENTREGA.md)
- Rama de GitHub usada para compartir: `informe-segunda-entrega`

## Estado real del backend

Esta version usa un backend Node.js + Express conectado a MySQL mediante `mysql2`.

- `server/index.js`: API REST.
- `server/db.js`: pool de conexiones MySQL.
- `server/schema.sql`: definicion de tablas.
- `server/initDatabase.js`: crea la base, tablas y datos iniciales.

La app Expo ya no abre SQLite: consume la API configurada con `EXPO_PUBLIC_API_URL`.

## Estructura principal

- `server/*`: backend Express + MySQL.
- `src/backend/apiClient.js`: cliente HTTP para la app Expo.
- `src/backend/*Service.js`: wrappers de API usados por las pantallas.
- `src/components/BottomNav.js`: barra inferior fija.
- `src/components/AppToast.js`: popups/toasts reutilizables.
- `src/screens/*`: pantallas mobile de la demo.

## Como ver los datos guardados

Entrar a MySQL:

```bash
mysql -h 127.0.0.1 -P 3307 -u root -p
```

En la instalacion local de esta maquina el puerto configurado es `3307`. Si usas el `docker-compose.yml` del repo, el puerto es `3306` y la clave es `elitebid`.

Seleccionar la base:

```sql
USE elitebid;
SHOW TABLES;
```

Ver datos iniciales:

```sql
SELECT id, email, cliente_id FROM usuarios;
SELECT identificador, titulo, estado, categoria FROM subastas;
SELECT identificador, cliente, tipo, monto_garantia, verificado FROM medios_pago;
```

Las claves no se guardan en texto plano. En `usuarios.password` vas a ver valores con formato `scrypt$...`, generados con salt por usuario.

El backend tambien sanitiza y normaliza la entrada antes de guardar:

- Emails: minusculas, sin espacios.
- Nombres y apellidos: formato titulo, por ejemplo `santiago santiago` se guarda como `Santiago Santiago`.
- Documento, tarjeta, CBU/CVU, CVV y cheques: solo digitos.
- Domicilio, banco y titular: espacios colapsados y formato titulo.
- Montos: numero decimal con dos posiciones como maximo.
- Registro: el pais queda fijo en Argentina; no se muestran ni se guardan otros paises para usuarios nuevos.

Despues de usar la app:

```sql
SELECT * FROM sesiones ORDER BY creado_en DESC;
SELECT * FROM asistentes ORDER BY identificador DESC;
SELECT * FROM pujos ORDER BY identificador DESC;
SELECT * FROM favoritos ORDER BY creado_en DESC;
SELECT * FROM registro_de_subasta ORDER BY identificador DESC;
SELECT * FROM penalidades ORDER BY identificador DESC;
```

Tambien se puede usar MySQL Workbench o DBeaver conectando a `127.0.0.1:3307`, base `elitebid`.

## Penalidades por falta de fondos

Cuando un usuario confirma el pago de una puja ganada, el backend compara el total a pagar
`puja + comision + envio` contra la garantia del medio de pago usado en la puja. Si no alcanza:

- Se registra la compra con `estado_pago = 'multa'`.
- Se crea una penalidad `tipo = 'falta_fondos'` por el 10% del valor ofertado.
- La penalidad queda vinculada a la puja y al registro de compra.
- El vencimiento se calcula a 72 horas desde el intento fallido.
- El usuario no puede entrar ni pujar en otra subasta mientras tenga penalidades activas.
- Para resolverla debe pagar la multa y presentar fondos suficientes mediante un medio verificado.
- Si vence sin presentar fondos, la penalidad pasa a `vencida` y el usuario queda `bloqueado`.

Endpoints principales:

```http
POST /api/users/:clienteId/purchases/:bidId/settle
POST /api/users/:clienteId/penalties/:penaltyId/settle
POST /api/users/:clienteId/penalties/:penaltyId/funds
```

## Validacion rapida

```bash
npm run api
npx expo export --platform web
```

Ese comando verifica que el bundle web compile correctamente.
