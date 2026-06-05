# EliteBid - resumen de cambios y defensa de segunda entrega

## 1. Cambios hechos desde que se bajaron los cambios del compañero

### Base y backend

- Se actualizo `main` con los cambios remotos del equipo.
- Se preservo la configuracion local en `.env` y se dejo backup local ignorado por Git.
- Se mantuvo MySQL como base real del backend.
- Se reforzo el catalogo publico:
  - Sin sesion: solo subastas futuras y sin precios.
  - Invitado pendiente: solo subastas futuras y sin precios.
  - Cliente verificado: ve catalogo y precios.
- Se agrego timeout controlado al envio de mail de verificacion:
  - Si SMTP tarda, la cuenta se crea igual como pendiente.
  - El usuario puede usar reenvio de codigo.
- Se agregaron subastas/lotes para todas las categorias:
  - `comun`
  - `especial`
  - `plata`
  - `oro`
  - `platino`
- Se corrigio la regla de pujas:
  - El minimo es puja actual + 1% del precio base.
  - El maximo es puja actual + 20% del precio base.
  - La excepcion aplica cuando la subasta es `oro` o `platino`, como indica el enunciado.
- Se implemento calculo de ascenso de categorias:
  - `comun`: cuenta verificada y admitida.
  - `especial`: 2 pujas y sin penalidades activas.
  - `plata`: 5 pujas, 1 subasta ganada y sin penalidades activas.
  - `oro`: 10 pujas, 2 subastas ganadas, $1.000.000 invertido y sin penalidades activas.
  - `platino`: 20 pujas, 5 subastas ganadas, $5.000.000 invertido y sin penalidades activas.
- Los medios de pago no suben categoria. Solo habilitan a participar/pujar.
- La categoria no baja automaticamente: las penalidades frenan ascensos y pueden bloquear participacion, pero no degradan la categoria historica.

### Registro, login y verificacion

- El registro quedo ordenado como:
  - Mail.
  - Nombre.
  - Apellido.
  - DNI o Pasaporte.
  - Fotos del documento.
- DNI exige frente y dorso.
- Pasaporte exige una sola foto.
- DNI acepta solo numeros.
- Pasaporte acepta letras/numeros en mayuscula.
- El invitado pendiente puede volver a entrar usando mail + codigo OTP.
- El OTP vence a los 15 minutos.
- Si el OTP vence y el invitado cerro sesion, puede pedir otro desde Login con `Reenviar codigo de invitado`.
- El OTP se guarda hasheado, no en texto plano.
- La contrasena definitiva se guarda hasheada con `scrypt`.
- Se unificaron reglas de contrasena en verificacion y recuperacion:
  - 8 a 72 caracteres.
  - Al menos una letra.
  - Al menos un numero.
  - Al menos un simbolo.
  - Sin espacios.

### Frontend y UX

- Se agrego una pantalla clara de verificacion de cuenta.
- Se agrego fallback de verificacion en Perfil.
- Se cambio visualmente el campo de mail en registro.
- Se agrego una campana de notificaciones arriba a la derecha.
- Se agrego una pantalla de notificaciones accionables.
- Las notificaciones pueden llevar a verificar cuenta, agregar pago, resolver penalidades, revisar subastas o revisar ventas.
- Se agrego en Perfil una insignia de categoria tocable.
- Al tocar la categoria se abre un modal con:
  - Categoria actual.
  - Proxima categoria.
  - Pujas requeridas.
  - Subastas ganadas requeridas.
  - Plata invertida requerida.
  - Penalidades activas.
- Se corrigio la UI de pujas para usar la categoria de la subasta en la excepcion oro/platino.

### Documentacion

- Se amplio `GUIA_SEGUNDA_ENTREGA.md` con:
  - Trazabilidad contra el enunciado.
  - Reglas de categorias y acceso.
  - Endpoints principales.
  - QA ejecutado.
  - Pendientes para tercera entrega.
- Se agregaron consultas SQL para revisar tablas en Workbench.

## 2. Flujo recomendado para mostrar en demo

1. Ejecutar:

```bash
npm run db:init
npm run api
npm run web -- --port 3002
```

2. Login con usuario demo:

```text
alejandro@elitebid.com / Elite1234
```

3. Mostrar Home:

- Subastas abiertas.
- Subastas futuras.
- Categoria del usuario.
- Metricas.

4. Ir a Perfil:

- Mostrar datos bloqueados por identidad.
- Tocar la categoria.
- Mostrar modal de progreso de categoria.

5. Mostrar subasta:

- Cliente ve precios.
- Explicar que puede ver categorias superiores, pero no participar si su categoria no alcanza.

6. Mostrar registro:

- Mail.
- Nombre.
- Apellido.
- DNI o Pasaporte.
- DNI pide frente/dorso.
- Pasaporte pide una foto.

7. Explicar invitado:

- Entra como `invitado`.
- Estado `pendiente`.
- Puede ver futuras sin precios.
- No puede pagar, editar perfil, favorito, sala ni pujar.
- Verifica con OTP por mail.

## 3. Que esta completo para segunda entrega

- Backend real con Node.js + Express.
- Frontend Expo/React Native conectado por API.
- MySQL real con tablas y seed.
- Registro de usuario integrado.
- Login integrado.
- Verificacion por mail/codigo OTP.
- Passwords hasheadas.
- Invitado con permisos limitados.
- Cliente verificado con flujo de pagos.
- Catalogo y detalle de subastas.
- Restriccion por categoria.
- Restriccion por medio de pago verificado para pujar.
- Validaciones de puja.
- Favoritos.
- Compras y penalidades como flujo parcial.
- Solicitud de venta de lotes con 6 fotos.
- Perfil con categoria y progreso.
- Notificaciones accionables.
- Documentacion de endpoints, SQL y QA.

## 4. Que esta parcial pero defendible

- Pujas: se registran correctamente, pero no hay tiempo real real con WebSocket/SSE.
- Compras: existe registro de compra/settle, pero el cierre automatico de subasta queda para tercera.
- Penalidades: existen y se pueden resolver, pero falta generar penalidad automaticamente por incumplimiento de pago.
- Streaming: se informa como servicio externo, no forma parte de la app segun el enunciado.
- Seguro/envio/factura: hay estructura parcial, queda para tercera.

## 5. Que queda para tercera entrega

- Deploy online del backend.
- App disponible para probar en dispositivo.
- Tiempo real real para pujas.
- Cierre automatico de subasta y ganador final.
- Compra automatica por la empresa si nadie puja.
- Control de garantia disponible contra compras acumuladas.
- Soporte completo para subastas en USD.
- Factura, envio y seguro con flujo completo.

## 6. QA ejecutado

Casos testeados:

- Login correcto.
- Login con mail vacio.
- Login con clave incorrecta.
- Registro con DNI completo.
- Registro con DNI sin dorso.
- Registro con pasaporte y una foto.
- Email duplicado.
- Documento duplicado.
- Invitado ve futuras sin precios.
- Invitado bloqueado para pagos y perfil.
- OTP correcto.
- OTP incorrecto.
- OTP vencido.
- Contrasena debil rechazada.
- Verificacion correcta.
- OTP usado ya no sirve.
- Reset de contrasena.
- Tarjeta invalida rechazada.
- Tarjeta valida guardada.
- Cliente comun ve oro con precio.
- Cliente comun no entra a subasta oro.
- Cliente comun entra a subasta comun con pago.
- Puja igual a actual rechazada.

Resultado: OK.

## 7. Frase corta para defender

EliteBid ya tiene un circuito completo integrado para segunda entrega: el usuario se registra como invitado, verifica su cuenta por codigo, pasa a cliente, agrega un medio de pago, ve subastas con precios, respeta restricciones por categoria y puede participar en subastas habilitadas. El backend centraliza reglas de negocio, validaciones y persistencia en MySQL.
