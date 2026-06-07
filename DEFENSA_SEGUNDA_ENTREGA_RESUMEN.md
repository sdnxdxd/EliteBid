# Defensa segunda entrega - EliteBid

## 1. Que es EliteBid

EliteBid es una app mobile de subastas premium. La idea principal es mostrar el flujo completo de un usuario que se registra, verifica su cuenta por mail, agrega un medio de pago, entra a subastas, puja, recibe notificaciones y registra compras ganadas.

La app cubre tres estados de usuario:

- Invitado pendiente: se registro, pero todavia no verifico el mail.
- Cliente activo: verifico el codigo, creo su clave y puede operar.
- Cliente con categoria: puede participar segun su categoria y sus metricas.

## 2. Stack general

Frontend:

- Expo SDK 54.
- React Native.
- React Native Web para correr la demo en navegador.
- Componentes propios en `src/screens`, `src/components` y `src/backend`.

Backend:

- Node.js.
- Express.
- API REST.
- MySQL con `mysql2`.
- Nodemailer para SMTP.
- Resend como alternativa de envio de mails.

Base de datos:

- MySQL 8.
- Esquema en `server/schema.sql`.
- Inicializacion y seed en `server/initDatabase.js`.
- Datos demo creados con `npm run db:init` y `npm run qa:seed`.

Seguridad:

- Passwords hasheadas con `scrypt`.
- Codigos OTP hasheados.
- Sesiones con token bearer.
- Validacion de ownership: un usuario no puede operar datos de otro.
- Sanitizacion de entradas: nombres, documentos, mails, fechas, tarjetas, CBU, cheques y montos.

## 3. Como se organiza el proyecto

```text
server/
  index.js          API REST principal
  schema.sql        estructura MySQL
  initDatabase.js   crea tablas, migra columnas y carga datos demo
  db.js             pool de MySQL
  emailService.js   envio de mails por SMTP o Resend
  passwordHash.js   hashing y verificacion de claves

src/
  backend/          clientes HTTP usados por la app
  screens/          pantallas mobile
  components/       componentes compartidos
  theme.js          colores y estilos base

scripts/
  qa-flow.js        suite automatizada de flujos
  seed-test-examples.js datos de prueba para demo
```

## 4. Flujo de registro y verificacion

1. El usuario ingresa:
   - Mail.
   - Nombre.
   - Apellido.
   - Tipo de documento: DNI o pasaporte.
   - Numero de documento.
   - Fotos del documento.

2. Si el documento es DNI:
   - Se exige frente y dorso.

3. Si el documento es pasaporte:
   - Se exige solo frente.

4. Al continuar:
   - Se crea una cuenta `invitado`.
   - Queda en estado `pendiente`.
   - Se genera un codigo de 6 digitos.
   - El codigo se guarda hasheado.
   - El codigo vence en 15 minutos.
   - Se envia por mail.

5. Mientras es invitado:
   - Puede ver subastas futuras.
   - No ve precios.
   - No puede pujar.
   - No puede modificar datos sensibles.
   - No puede agregar medios de pago.

6. Para activar:
   - Ingresa el codigo recibido.
   - Crea y confirma una contrasena.
   - Pasa a `cliente activo`.

## 5. Recuperacion de contrasena

Antes el reset cambiaba la clave solo con mail/DNI y nueva clave. Ahora es mas seguro:

1. El usuario ingresa su mail.
2. El backend genera un codigo de recuperacion.
3. El codigo se guarda hasheado y vence en 15 minutos.
4. Se manda el codigo por mail.
5. El usuario ingresa:
   - Codigo.
   - Nueva contrasena.
   - Confirmacion de nueva contrasena.
6. Si el codigo es correcto:
   - Se actualiza la clave hasheada.
   - Se invalidan sesiones anteriores.

Endpoint principal:

```text
POST /api/auth/request-password-reset
POST /api/auth/reset-password
```

## 6. Medios de pago

La app soporta tres medios:

- Tarjeta.
- Cuenta bancaria / CBU.
- Cheque.

Validaciones importantes:

- Tarjeta:
  - Solo numeros.
  - Largo valido.
  - Validacion Luhn.
  - CVV de 3 o 4 digitos.

- Cuenta:
  - CBU de 22 digitos.
  - Alias valido.
  - Banco y tipo de cuenta.

- Cheque:
  - Banco.
  - Numero de cheque.
  - Foto.
  - Fecha de emision valida.
  - No puede ser futura.

Los medios de pago habilitan a participar, pero no suben categoria por si solos.

## 7. Subastas y pujas

El cliente puede ver subastas de categorias superiores, pero no puede participar si su categoria no alcanza.

Reglas:

- Para entrar a sala:
  - Debe estar verificado.
  - Debe tener medio de pago verificado.
  - Debe tener categoria suficiente.

- Para pujar:
  - La puja debe superar la actual.
  - Minimo: puja actual + 1% del precio base.
  - Maximo: puja actual + 20% del precio base.
  - Excepcion: categorias `oro` y `platino` no tienen ese maximo.

- Si un usuario va ganando:
  - Puede salir de la sala a mirar otras subastas.
  - No puede ofertar de nuevo mientras siga liderando.
  - Si otro usuario lo supera, recibe notificacion y puede volver a pujar.

## 8. Categorias

Las categorias son:

- Comun.
- Especial.
- Plata.
- Oro.
- Platino.

El ascenso se calcula por metricas:

| Categoria | Requisitos |
| --- | --- |
| Comun | Cuenta activa y admitida |
| Especial | 2 pujas y sin penalidades activas |
| Plata | 5 pujas, 1 subasta ganada y sin penalidades activas |
| Oro | 10 pujas, 2 subastas ganadas, $1.000.000 invertido y sin penalidades activas |
| Platino | 20 pujas, 5 subastas ganadas, $5.000.000 invertido y sin penalidades activas |

Las penalidades frenan ascensos. No bajan automaticamente la categoria historica.

## 9. Notificaciones

La app tiene una campana arriba a la derecha y una pantalla de notificaciones accionables.

Tipos principales:

- Cuenta pendiente de verificar.
- Falta medio de pago.
- Penalidad activa.
- Subasta futura.
- Puja superada.
- Compra pendiente.
- Seguimiento de lote propio.

Cada notificacion puede navegar a la pantalla relacionada.

## 10. Ventas y lotes propios

El usuario puede solicitar que EliteBid subaste un bien propio.

Se guarda:

- Titulo.
- Tipo de bien.
- Cantidad.
- Valor estimado.
- Descripcion.
- Estado de conservacion.
- Origen licito.
- Datos de cobro.
- Declaracion de titularidad.
- Fotos.

Estados principales:

- Pendiente.
- En inspeccion.
- Aceptado.
- Rechazado.

Tambien se agregaron endpoints compatibles con el PDF para:

- Solicitudes de venta.
- Aceptar o rechazar condiciones.
- Mis bienes.
- Seguro.
- Ubicacion.

## 11. Endpoints y compatibilidad con el PDF

Se mantuvieron los endpoints que usa la app y se agregaron aliases para coincidir con el PDF.

Ejemplos:

```text
GET  /api/auth/estado
POST /api/auth/registro/fase1
POST /api/auth/registro/fase2
GET  /api/usuarios/me
GET  /api/usuarios/me/estadisticas
GET  /api/subastas
POST /api/subastas/{id}/ingresar
POST /api/subastas/{subastaId}/items/{itemId}/pujar
GET  /api/usuarios/me/compras
GET  /api/notificaciones
POST /api/solicitudes-venta
```

Los endpoints de admin se dejaron fuera para esta entrega.

Detalle completo:

```text
docs/API_ENDPOINTS_PDF.md
```

## 12. QA y pruebas

Se implemento una suite automatizada:

```bash
npm run qa:flow
```

Cubre:

- Registro con DNI y pasaporte.
- Campos invalidos.
- Emails/documentos duplicados.
- Invitado pendiente.
- OTP incorrecto, vencido y reenviado.
- Verificacion de cuenta.
- Login por email y documento.
- Recuperacion de clave por codigo.
- Sesiones ajenas bloqueadas.
- Pagos validos e invalidos.
- Cheques con fecha futura.
- Lotes propios.
- Endpoints del PDF.
- Sala de subastas.
- Versus entre dos usuarios.
- Notificacion por puja superada.
- Compra ganadora y pago.

Tambien se valida build web:

```bash
npx expo export --platform web
```

## 13. Demo sugerida para defender

1. Correr:

```bash
npm run db:init
npm run api
npm run web -- --port 3002
```

2. Mostrar login:

```text
alejandro@elitebid.com / Elite1234
```

3. Mostrar Home:

- Subastas abiertas.
- Subastas futuras.
- Categoria.
- Acceso a notificaciones.

4. Mostrar Perfil:

- Datos del usuario.
- Categoria actual.
- Progreso a siguiente categoria.
- Penalidades.

5. Mostrar registro:

- Mail, nombre, apellido, DNI/pasaporte.
- Explicar invitado pendiente.
- Explicar codigo por mail.

6. Mostrar recuperacion de clave:

- Mail.
- Codigo.
- Nueva clave y confirmacion.

7. Mostrar medios de pago:

- Tarjeta.
- Cuenta.
- Cheque.
- Validaciones.

8. Mostrar subasta:

- Detalle.
- Catalogo.
- Entrar a sala.
- Pujar.
- Explicar minimo/maximo.

9. Mostrar notificaciones:

- Puja superada.
- Pago pendiente.
- Acciones navegables.

10. Mostrar compras:

- Puja ganadora.
- Confirmar pago.
- Tracking basico.

## 14. Idea principal para explicar oralmente

EliteBid no es solo una pantalla estatica: tiene frontend mobile, backend REST, base MySQL, sesiones, validaciones, mails, datos persistidos y QA automatizado. La segunda entrega demuestra un flujo completo de negocio: registro seguro, verificacion, medios de pago, subastas, pujas, notificaciones, compras y ventas propias.

