# Guia para correr EliteBid y explicar la segunda entrega

## 1. Requisitos en otra PC

Instalar:

- Node.js 20.19 o superior.
- MySQL Server 8.x.
- MySQL Workbench, opcional pero recomendado.
- Git.

Clonar el proyecto:

```bash
git clone https://github.com/Samtu79/EliteBid.git
cd EliteBid
git checkout informe-segunda-entrega
```

Instalar dependencias:

```bash
npm install
```

## 2. Configurar variables de entorno

Crear un archivo `.env` en la raiz del proyecto, copiando `.env.example`.

Ejemplo para MySQL local:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_clave_mysql
DB_NAME=elitebid
API_PORT=3001
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001/api
APP_PUBLIC_URL=http://127.0.0.1:3001
```

Si se quiere probar el mail real con Gmail:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_TIMEOUT_MS=15000
MAIL_USER=tu_mail@gmail.com
MAIL_PASSWORD=tu_app_password_de_google
MAIL_FROM=EliteBid <tu_mail@gmail.com>
MAIL_VERIFICATION_SUBJECT=Tu codigo de verificacion EliteBid
```

Importante: `MAIL_PASSWORD` no es la clave normal de Gmail. Es una contrasena de aplicacion generada desde Google con verificacion en dos pasos activada.

## 3. Crear la base MySQL

Con MySQL prendido, correr:

```bash
npm run db:init
```

Ese comando:

- Crea la base `elitebid`.
- Crea las tablas.
- Aplica migraciones necesarias.
- Carga datos iniciales de demo.

Si falla la conexion, revisar en `.env`:

- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`

## 4. Levantar backend y frontend

Abrir dos terminales en la carpeta del proyecto.

Terminal 1:

```bash
npm run api
```

Backend:

```text
http://127.0.0.1:3001/api
```

Terminal 2:

```bash
npm run web -- --port 3002
```

Abrir:

```text
http://localhost:3002
```

## 5. Usuario de prueba

```text
Email: alejandro@elitebid.com
Clave: Elite1234
```

Este usuario ya esta verificado y tiene permisos completos.

## 6. Flujo principal para mostrar

### Registro como invitado

1. Entrar a registro.
2. Completar:
   - Mail.
   - Nombre.
   - Apellido.
   - DNI o Pasaporte.
   - Fotos del documento.
3. Confirmar.
4. La cuenta se crea como:
   - `rol = invitado`
   - `estado = pendiente`
   - `email_verificado = no`
5. El usuario entra a la app como invitado.
6. Se manda un codigo de un solo uso por mail.
7. La app muestra una pantalla dedicada `Verifica tu cuenta`, donde puede ingresar el codigo y crear la contrasena definitiva.
8. Si no quiere verificar en ese momento, puede tocar `Continuar como invitado`.

Mientras es invitado:

- Solo ve subastas futuras.
- No ve precios.
- No puede entrar a sala.
- No puede pujar.
- No puede guardar favoritos.
- No puede agregar medios de pago.
- No puede modificar perfil.

Documentacion requerida:

- Si selecciona `DNI`, se pide foto del frente y dorso.
- Si selecciona `Pasaporte`, se pide una sola foto de la pagina principal.
- Si el invitado cierra sesion antes de confirmar la cuenta, puede volver a iniciar sesion usando su mail y el codigo de un solo uso como clave.

### Verificacion por codigo

1. Despues del registro, usar la pantalla `Verifica tu cuenta`.
2. Ingresar el codigo recibido por mail.
3. Crear una contrasena definitiva.
4. La contrasena debe tener:
   - 8 a 72 caracteres.
   - Una letra.
   - Un numero.
   - Un simbolo.
   - Sin espacios.
5. Confirmar.
6. Si el codigo es correcto y no vencio:
   - `rol` pasa a `cliente`.
   - `estado` pasa a `activo`.
   - `email_verificado` pasa a `si`.
   - Se borra el codigo de verificacion.

Si el usuario saltea esa pantalla, puede hacer lo mismo despues desde `Perfil`, en el panel `Cuenta pendiente`.

El codigo vence a los 15 minutos. Si vence, el usuario puede tocar `Reenviar codigo`.

Si el usuario cierra sesion antes de confirmar, puede volver al sistema desde Login:

```text
Correo: mail usado en el registro
Clave o codigo: codigo de un solo uso recibido por mail
```

Luego vuelve a la pantalla de verificacion para crear la contrasena definitiva.

### Agregar medio de pago

Una vez verificado, el usuario puede agregar cualquiera de estos medios:

- Tarjeta.
- Cuenta bancaria.
- Cheque.

La app valida y sanitiza los datos antes de guardarlos.

### Subastas

Con usuario verificado:

1. Ver subastas activas y futuras.
2. Entrar a detalle.
3. Ver precios.
4. Entrar a sala en vivo.
5. Pujar.
6. Guardar favoritos.
7. Ver compras y penalidades.

## 7. Como ver datos en MySQL Workbench

Conectar a:

```text
Host: 127.0.0.1
Port: el DB_PORT del .env
User: root
Password: la clave configurada
Database: elitebid
```

Consultas utiles:

```sql
USE elitebid;
SHOW TABLES;
```

Usuarios:

```sql
SELECT id, email, cliente_id, rol, estado, email_verificado, verification_code_expires_at
FROM usuarios
ORDER BY id DESC;
```

Personas:

```sql
SELECT identificador, tipo_documento, documento, nombre, direccion
FROM personas
ORDER BY identificador DESC;
```

Medios de pago:

```sql
SELECT identificador, cliente, tipo, detalle, monto_garantia, verificado
FROM medios_pago
ORDER BY identificador DESC;
```

Subastas:

```sql
SELECT identificador, titulo, fecha, hora, estado, categoria
FROM subastas;
```

Pujas:

```sql
SELECT *
FROM pujos
ORDER BY identificador DESC;
```

### Chequeo completo del backend en SQL

Usar estos comandos como checklist para comprobar que el backend guarda datos reales en MySQL.

Ver todas las tablas:

```sql
USE elitebid;
SHOW TABLES;
```

Tablas de usuarios, personas y sesiones:

```sql
SELECT * FROM paises;
SELECT * FROM personas ORDER BY identificador DESC;
SELECT * FROM documentos_identidad ORDER BY identificador DESC;
SELECT * FROM clientes ORDER BY identificador DESC;
SELECT * FROM usuarios ORDER BY id DESC;
SELECT * FROM sesiones ORDER BY creado_en DESC;
```

Tablas de subastas:

```sql
SELECT * FROM subastas ORDER BY identificador;
SELECT * FROM productos ORDER BY identificador;
SELECT * FROM catalogos ORDER BY identificador;
SELECT * FROM items_catalogo ORDER BY identificador;
SELECT * FROM asistentes ORDER BY identificador DESC;
SELECT * FROM pujos ORDER BY identificador DESC;
SELECT * FROM favoritos ORDER BY creado_en DESC;
SELECT * FROM registro_de_subasta ORDER BY identificador DESC;
```

Pagos y penalidades:

```sql
SELECT * FROM medios_pago ORDER BY identificador DESC;
SELECT * FROM penalidades ORDER BY identificador DESC;
```

Estado de usuarios y verificacion:

```sql
SELECT
  id,
  email,
  cliente_id,
  rol,
  estado,
  email_verificado,
  verification_code_expires_at,
  creado_en
FROM usuarios
ORDER BY id DESC;
```

Usuario + persona + cliente:

```sql
SELECT
  u.id,
  u.email,
  u.rol,
  u.estado,
  u.email_verificado,
  p.tipo_documento,
  p.documento,
  p.nombre,
  p.direccion,
  c.categoria,
  c.admitido
FROM usuarios u
JOIN personas p ON p.identificador = u.cliente_id
JOIN clientes c ON c.identificador = u.cliente_id
ORDER BY u.id DESC;
```

Medios de pago con usuario:

```sql
SELECT
  u.email,
  mp.identificador,
  mp.tipo,
  mp.detalle,
  mp.monto_garantia,
  mp.verificado
FROM medios_pago mp
JOIN usuarios u ON u.cliente_id = mp.cliente
ORDER BY mp.identificador DESC;
```

Pujas con usuario y subasta:

```sql
SELECT
  u.email,
  s.titulo,
  p.importe,
  p.ganador,
  p.creado_en
FROM pujos p
JOIN asistentes a ON a.identificador = p.asistente
JOIN usuarios u ON u.cliente_id = a.cliente
JOIN items_catalogo i ON i.identificador = p.item
JOIN catalogos c ON c.identificador = i.catalogo
JOIN subastas s ON s.identificador = c.subasta
ORDER BY p.identificador DESC;
```

Nota para la presentacion: no mostrar `usuarios.password` ni `verification_code_hash` como datos sensibles. Solo explicar que se guardan hasheados.

## 8. Explicacion general para la segunda entrega

EliteBid es una app de subastas. La segunda entrega ya no funciona solo con datos locales: ahora tiene un backend real en Node.js + Express conectado a MySQL.

La app Expo/React Native consume la API del backend mediante servicios HTTP. El backend centraliza:

- Registro.
- Login.
- Sesiones.
- Verificacion de cuenta.
- Validaciones.
- Sanitizacion.
- Subastas.
- Pujas.
- Favoritos.
- Compras.
- Medios de pago.
- Penalidades.

## 9. Backend

Carpeta:

```text
server/
```

Archivos principales:

- `server/index.js`: API REST.
- `server/db.js`: conexion y pool MySQL.
- `server/schema.sql`: tablas.
- `server/initDatabase.js`: creacion de base, migraciones y seed.
- `server/passwordHash.js`: hash seguro de contrasenas con `scrypt`.
- `server/emailService.js`: envio de codigos por mail con SMTP/Nodemailer o Resend.

## 10. Frontend

Pantallas:

```text
src/screens/
```

Servicios HTTP:

```text
src/backend/
```

El frontend ya no usa SQLite. Llama al backend usando:

```text
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001/api
```

## 11. Seguridad y validaciones

Se implemento:

- Hash de contrasenas con `scrypt`.
- Codigo de un solo uso hasheado.
- Expiracion del codigo en 15 minutos.
- Normalizacion de mails a minusculas.
- Nombres en formato titulo.
- DNI solo numerico.
- Pasaporte alfanumerico en mayusculas.
- Sanitizacion de URLs de imagen.
- Validacion de tarjetas, CBU/CVU, alias, cheques y montos.
- Restricciones por rol invitado.

## 12. Que defender oralmente

Puntos fuertes para explicar:

- Separacion frontend/backend.
- Persistencia real con MySQL.
- Registro progresivo: primero invitado, despues cliente verificado.
- Seguridad: no se guardan claves en texto plano.
- El codigo de verificacion tampoco se guarda plano, se guarda hasheado.
- Invitado tiene permisos limitados.
- Usuario verificado puede continuar el flujo de medios de pago y subastas.
- Las reglas de negocio estan en backend, no solo en frontend.
- MySQL Workbench permite comprobar que los datos se guardan en tablas reales.

## 13. Problemas comunes

### No conecta MySQL

Revisar:

```env
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
```

### El mail no llega

Revisar:

- Que `MAIL_USER` sea correcto.
- Que `MAIL_PASSWORD` sea app password.
- Que `SMTP_PORT=465`.
- Que `SMTP_SECURE=true`.
- Carpeta spam.

### Error al correr `npm run web`

Asegurarse de estar parado en la carpeta correcta:

```bash
cd C:\Users\sadan\Documents\Da1\EliteBid
```

No correrlo desde `Da1` porque ahi no esta `package.json`.

## 14. Comandos rapidos

```bash
npm install
npm run db:init
npm run api
npm run web -- --port 3002
```

Validacion:

```bash
node --check server/index.js
node --check server/emailService.js
npx expo export --platform web
```
