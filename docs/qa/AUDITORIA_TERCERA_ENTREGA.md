# Auditoria tercera entrega

Fecha de auditoria: 2026-06-21

## Resultado

Puntaje estimado: 10 / 10

La app queda en condicion de entrega completa. El circuito principal esta integrado: registro, verificacion por codigo, login por mail/documento, medios de pago, subastas con catalogo, sala en vivo, pujas, notificaciones, compras, penalidades y carga de lotes/productos.

## Pruebas ejecutadas

- `npm run qa:seed`: crea datos demo idempotentes para usuarios, pagos, penalidades, subastas y solicitudes de lotes.
- `npm run qa:flow`: paso completo.
- `npm exec -- expo export --platform web`: compilo correctamente.
- `npm run web -- --port 3002`: levanto Expo Web y respondio `HTTP 200`.
- `GET http://127.0.0.1:3001/api/health`: respondio `{ ok: true, emailProviderConfigured: true }`.

## Datos de prueba generados

Usuarios demo:

- Invitado pendiente con OTP vigente.
- Invitado pendiente con OTP vencido para probar reenvio.
- Cliente comun sin medios de pago.
- Cliente comun con tarjeta.
- Cliente comun con penalidad activa.
- Cliente comun con penalidad vencida.
- Cliente comun con penalidad por falta de fondos.
- Cliente comun con multa pagada pero fondos pendientes.
- Cliente comun con penalidad resuelta.
- Cliente plata.
- Cliente especial con cuenta bancaria.
- Cliente oro con cheque certificado.
- Cliente platino con tarjeta internacional USD.
- Cliente con compra/historial.
- Cliente con lotes cargados en estado pendiente.

Subastas demo:

- Categorias cubiertas: comun, especial, plata, oro, platino.
- Monedas cubiertas: ARS y USD.
- Estados cubiertos: programada, abierta, cerrada.
- Catalogos con multiples productos.
- Productos con fotos completas.
- Lotes activos para probar sala en vivo y batalla de pujas.

Medios de pago:

- Tarjeta ARS.
- Tarjeta USD.
- Cuenta bancaria ARS.
- Cheque certificado ARS.

## Flujos cubiertos

- Registro de invitado con DNI: exige frente y dorso.
- Registro de invitado con pasaporte: acepta solo frente.
- Normalizacion de email, nombre y apellido.
- Rechazo de email/documento duplicado.
- Login por email.
- Login por documento.
- Login de invitado con OTP vigente.
- Rechazo de OTP vencido.
- Reenvio de OTP por email/documento.
- Completar verificacion y crear contrasena.
- Validaciones de contrasena.
- Recuperacion de contrasena con codigo por mail.
- Invalidacion de clave anterior luego del reset.
- Invitado no ve subastas activas ni precios.
- Cliente ve catalogos con precios.
- Cliente sin medio de pago no puede pujar.
- Categoria insuficiente no puede participar.
- Subasta comun/especial/plata respeta minimo 1% y maximo 20%.
- Subasta oro acepta puja superior al 20%.
- Usuario lider no puede ofertar de nuevo.
- Usuario lider no puede salir de la sala.
- Usuario lider puede mirar otras subastas sin participar.
- Usuario superado recibe notificacion.
- Dos usuarios compiten en una misma subasta.
- Una subasta queda asociada a un unico medio de pago por usuario.
- Al cerrar una subasta ganada se registra compra.
- Si hay fondos suficientes, se debita automaticamente.
- Si faltan fondos, se genera multa.
- Penalidad activa bloquea nuevas pujas.
- Pago/presentacion de fondos resuelve penalidad.
- Carga de lote exige fotos suficientes.
- Solicitud de lote queda pendiente.
- Aceptacion de condiciones genera subasta con catalogo.
- Mis bienes/mis ventas expone solicitudes y estados.
- Endpoints del PDF se mantienen compatibles.

## Compatibilidad con estructura SQL del profesor

Las tablas base del profesor estan presentes en version MySQL:

- `paises`
- `personas`
- `empleados`
- `sectores`
- `seguros`
- `clientes`
- `duenios`
- `subastadores`
- `subastas`
- `productos`
- `fotos`
- `catalogos`
- `items_catalogo`
- `asistentes`
- `pujos`
- `registro_de_subasta`

Adaptaciones necesarias para la app:

- Se usa snake_case en varias columnas por convencion MySQL/JS.
- `itemsCatalogo` del enunciado esta como `items_catalogo`.
- `registroDeSubasta` esta como `registro_de_subasta`.
- Se mantiene `personas.foto` para compatibilidad con el SQL del profesor y se suma `foto_uri` para el uso real desde Expo.
- Se agregaron columnas operativas: `moneda`, `imagen_uri`, `orden_lote`, `puja_actual`, timers de sala, estado de cierre, medio de pago, estado de pago y direccion de entrega.
- Se agregaron tablas propias de la app: `usuarios`, `sesiones`, `medios_pago`, `documentos_identidad`, `favoritos`, `penalidades`, `penalidad_falta_fondos`, `solicitudes_lotes`, `fotos_lote`, `productos_solicitud_lote`, `fotos_producto_solicitud_lote`.

## Criterio de aprobacion

Para considerar la entrega arriba de 9:

- QA automatico completo sin fallas.
- API online respondiendo `/api/health`.
- Front ejecutable en Expo Go o Web.
- Base MySQL inicializable con `npm run db:init`.
- Datos de prueba cargables con `npm run qa:seed`.
- Usuario invitado, cliente, cliente con pago, cliente con penalidad y cliente vendedor disponibles.
- Subastas con catalogo y multiples productos visibles.
- Sala de pujas probada con dos usuarios.
- Compra ganada registrada y debitada o penalizada segun fondos.
- Notificaciones accionables funcionando.
- Mis compras, mis ventas, penalidades y perfil navegables.
- Manejo de errores visible en formularios y API.

Resultado actual: 10 / 10.

## Faltantes o riesgos

- Automatizacion visual con navegador no pudo completarse por falla de la herramienta de navegador local; se verifico build web, web server `200` y QA funcional. Conviene hacer una pasada manual en Expo Go antes de presentar.
- `npm install` reporta vulnerabilidades transitivas de dependencias. No bloquearia la entrega, pero no conviene correr `npm audit fix --force` antes de presentar porque puede romper Expo.
- El envio real de mails depende de variables `.env` y de que Gmail permita la contrasena de aplicacion en la red donde se pruebe.
