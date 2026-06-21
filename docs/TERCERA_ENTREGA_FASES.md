# Tercera entrega - fases de cierre

Este checklist se arma contra el enunciado `TPO_DAI_1C2026` y la estructura base `EstructuraActual.sql`.

## Fase 0 - Compatibilidad con la base del profesor

Objetivo: que la app funcione sobre MySQL sin perder las entidades del modelo base.

Tablas base del profesor:

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
- `itemsCatalogo`
- `asistentes`
- `pujos`
- `registroDeSubasta`

Estado actual:

- Cubierto: `paises`, `personas`, `empleados`, `seguros`, `clientes`, `duenios`, `subastadores`, `subastas`, `productos`, `catalogos`, `asistentes`, `pujos`.
- Cubierto con nombre MySQL/app: `itemsCatalogo` -> `items_catalogo`, `registroDeSubasta` -> `registro_de_subasta`.
- Agregado para compatibilidad: `sectores`, `fotos`.
- Tablas extra necesarias para la app: `usuarios`, `sesiones`, `documentos_identidad`, `medios_pago`, `favoritos`, `penalidades`, `penalidad_falta_fondos`, `solicitudes_lotes`, `fotos_lote`, `productos_solicitud_lote`, `fotos_producto_solicitud_lote`.

Pendiente a decidir antes de tocar codigo:

- Si el profesor exige nombres exactos de tabla, conviene agregar vistas/aliases `itemsCatalogo` y `registroDeSubasta`.
- Si alcanza con equivalencia funcional, se mantiene snake_case porque hoy lo usa todo el backend.

## Fase 1 - Registro, login e identidad

Debe cubrir:

- Entrar como invitado sin registrarse.
- Registro con email, nombre, apellido, DNI/pasaporte, fotos de documento, domicilio.
- DNI exige frente y dorso; pasaporte exige frente.
- Usuario queda como invitado/pendiente hasta validar email y aceptacion.
- Email de codigo para verificar correo.
- Recuperacion de contrasena por email + codigo + nueva contrasena + confirmacion.
- Login por email o documento.
- Password hasheada y validaciones de fuerza.

Pruebas clave:

- Registro DNI valido.
- Registro pasaporte valido.
- Documento duplicado.
- Email duplicado.
- Codigo vencido.
- Reenvio de codigo.
- Login pendiente.
- Login activo.
- Recuperacion con codigo incorrecto/vencido.

## Fase 2 - Medios de pago y categoria

Debe cubrir:

- Alta de tarjeta, cuenta bancaria y cheque certificado.
- Validacion de tarjeta, vencimiento, cheque y cuenta.
- Medio verificado como requisito para pujar.
- Categoria del cliente: comun, especial, plata, oro, platino.
- Progreso visible de categoria en perfil.
- Garantias en ARS o USD, porque el enunciado contempla subastas en pesos o dolares.

Pruebas clave:

- Usuario sin medio de pago puede ver pero no pujar.
- Tarjeta con numero invalido no se guarda.
- Cheque verificado habilita puja.
- Garantia insuficiente genera restriccion/multa.
- Moneda invalida se rechaza.
- Cuenta en USD se guarda y se muestra correctamente.

Estado:

- Cubierto en API, UI y QA automatizado.

## Fase 3 - Catalogos, subastas y productos

Debe cubrir:

- Catalogos publicos.
- Invitado ve futuras subastas sin precios.
- Usuario registrado ve precio base.
- Subasta con fecha, hora, categoria, rematador, ubicacion y catalogo.
- Catalogo con lista de productos/lotes.
- Producto con descripcion, precio base, duenio y fotos.
- Cada producto semilla queda con 6 fotos en la tabla base `fotos`.
- El catalogo se muestra tambien en subastas abiertas, no solo programadas.

Pruebas clave:

- Invitado no ve precio base ni puja actual.
- Registrado ve precios.
- Categoria menor puede ver una subasta superior pero no participar.
- Catalogo muestra varios productos.
- Catalogo publico devuelve productos sin precios.
- Catalogo registrado devuelve productos con precios y fotos.

Estado:

- Cubierto en API, UI, MySQL y QA automatizado.

## Fase 4 - Subasta en vivo y pujas

Debe cubrir:

- Conexion a una sola subasta a la vez.
- Actualizacion de puja actual para todos los usuarios.
- Validacion minima: mayor oferta + 1% del precio base.
- Validacion maxima: mayor oferta + 20% del precio base.
- La restriccion maxima no aplica a oro/platino.
- Bloqueo de nueva puja hasta confirmacion.
- Notificacion cuando otro usuario supera la oferta.
- Versus entre dos usuarios sobre el mismo lote.

Pruebas clave:

- Dos usuarios pujando el mismo lote.
- Puja menor al minimo rechazada.
- Puja mayor al maximo rechazada en comun/especial/plata.
- Puja mayor al maximo aceptada en oro/platino.
- Salir a ver otras subastas sin perder notificacion.

Versus de demo:

1. Usuario A entra a una subasta comun abierta con medio de pago verificado.
2. A oferta un monto valido. Queda liderando, se actualiza `puja_actual`, se reinicia el contador y la app bloquea otra oferta de A mientras siga primero.
3. A puede salir o mirar otras subastas/lotes, pero si intenta ofertar mientras sigue primero el backend rechaza con el mensaje de que ya va primero.
4. Usuario B entra al mismo lote y oferta un monto mayor valido.
5. La puja de A pasa a `ganador = no`, la de B queda `ganador = si`, el precio actual cambia para todos.
6. A recibe una notificacion accionable `Te superaron en una subasta` que apunta a `auction:{id}`.
7. A vuelve al lote, ve el nuevo precio y puede contraofertar.
8. Si el contador vence, gana el ultimo postor y se registra la compra.

Estado:

- Cubierto en API, UI y QA automatizado.

## Fase 5 - Cierre, compra, pago y penalidad

Debe cubrir:

- Ultimo postor gana cuando cierra el item.
- Registro de venta en `registro_de_subasta`.
- Producto marcado como subastado.
- Medio de pago asociado a la compra.
- Mensaje/notificacion con importe, comision y entrega.
- Si faltan fondos, multa 10% y bloqueo hasta regularizar.
- Plazo de 72 horas para presentar fondos.

Pruebas clave:

- Cierre con ganador.
- Cierre sin pujas: compra la empresa por precio base.
- Pago exitoso.
- Falta de fondos.
- Pago de multa y desbloqueo.
- Bloqueo de participacion mientras hay penalidad activa.
- Presentacion de fondos dentro de 72 horas.

Flujo falta de fondos:

1. El usuario gana una puja y se registra una compra pendiente.
2. Al confirmar pago, si el medio no cubre puja + comision + envio, se crea `penalidades` con multa del 10% de la oferta.
3. La compra queda en `registro_de_subasta.estado_pago = 'multa'`.
4. La cuenta queda restringida y no puede entrar a otra subasta.
5. Si intenta presentar fondos con un medio insuficiente, se rechaza.
6. Debe pagar la multa y presentar un medio verificado que cubra el total requerido.
7. Cuando ambas condiciones se cumplen, la penalidad queda `pagada` y la compra pasa a `pagada`.

Estado:

- Cubierto en API, UI y QA automatizado.

## Fase 6 - Carga de productos por usuario

Debe cubrir:

- Solicitud para subastar un bien propio.
- Lote unico o coleccion con varios productos.
- Al menos 6 fotos.
- Declaracion de titularidad.
- Origen licito.
- Cuenta declarada para cobrar antes de la subasta.
- Estado de inspeccion, a confirmar, rechazado o en subasta.
- Ver deposito, poliza y aseguradora.

Pruebas clave:

- Solicitud incompleta rechazada.
- Solicitud con menos de 6 fotos rechazada.
- Coleccion con varios productos.
- Aceptacion con fecha, lugar, precio base y comision.
- Rechazo con motivo.

Flujo cubierto:

1. Usuario verificado carga un lote unico o una coleccion con varios productos.
2. Cada producto exige al menos 6 fotos y como maximo 10.
3. Se exige declarar titularidad, origen licito, aceptar devolucion con cargo y cuenta de cobro.
4. La empresa puede marcar la solicitud en inspeccion.
5. La empresa puede aceptar la revision indicando deposito, poliza, aseguradora, fecha/hora/lugar de subasta, precio base y comision.
6. La solicitud queda `a_confirmar` para que el usuario acepte o rechace las condiciones.
7. Si acepta, se generan `subastas`, `catalogos`, `productos`, `items_catalogo`, `fotos`, `seguros` y `duenios`.
8. El bien aparece en `mis-bienes` como `en_subasta`, con seguro, ubicacion y referencia a la subasta generada.
9. Si la empresa o el usuario rechaza antes de publicar, queda el motivo visible.

Estado:

- Cubierto en API, UI y QA automatizado.
- QA 21/06/2026: validado que aceptar condiciones genera una subasta programada con catalogo y fotos, sin duplicar al volver a consultar.

## Fase 7 - Backend online y endpoints probables

Debe cubrir:

- API online en Render.
- MySQL online.
- Variables de entorno correctas.
- Endpoints documentados y testeables.
- Manejo de errores con codigos HTTP coherentes.

Pruebas clave:

- `GET /api/health`.
- `GET /api/auctions/home`.
- Registro completo.
- Verificacion de email.
- Login.
- Alta de medio de pago.
- Pujar.
- Recuperar contrasena.

URL online:

- API: `https://elitebid.onrender.com/api`

Pruebas online realizadas:

- `GET /api/health`: responde `ok: true` y `emailProviderConfigured: true`.
- `GET /api/auctions/home`: responde catalogo publico con precios reservados en `null`.
- `GET /api/subastas`: responde catalogo publico con precios reservados en `null`.
- `GET /api/auctions/7`: responde detalle publico con catalogo, productos y `photoUrls`, sin revelar precios.
- `POST /api/auth/login` sin body: responde error JSON controlado.
- `GET /api/solicitudes-venta` sin token: responde error JSON controlado.
- `GET /api/notificaciones` sin token: responde error JSON controlado.

Estado:

- Backend online funcionando en Render.
- MySQL online conectado.
- Deploy toma `render.yaml`.
- Queda pendiente hacer una ronda autenticada online con usuario real/demo si se quiere probar escritura completa en la base remota desde Postman.

## Fase 8 - Frontend en dispositivo y trazabilidad

Debe cubrir:

- Expo Go o build instalable para probar en celular.
- Front apuntando a API online.
- Pantallas coherentes con wireframes/primera entrega.
- Estados de error visibles: internet, campos obligatorios, permisos de camara/galeria, email.

Pruebas clave:

- Celular en red externa usando API online.
- Registro con camara.
- Login.
- Catalogo.
- Subasta.
- Notificaciones.

Configuracion recomendada para entrega:

- API online: `https://elitebid.onrender.com/api`.
- Front Expo apuntando a Render con:

```env
EXPO_PUBLIC_API_URL=https://elitebid.onrender.com/api
EXPO_PUBLIC_WEB_API_URL=https://elitebid.onrender.com/api
EXPO_PUBLIC_MOBILE_API_URL=https://elitebid.onrender.com/api
APP_PUBLIC_URL=https://elitebid.onrender.com
```

Comandos de presentacion:

```bash
npm install
copy .env.example .env
npm run start -- --clear
```

Para Expo Go:

- Escanear el QR desde el celular.
- Si la WiFi bloquea conexiones locales de Expo, usar `npm run start -- --tunnel --clear`.
- No hace falta correr `npm run api` si la app apunta a Render.

Trazabilidad de pantallas:

- Login: acceso por email/documento, recuperar contrasena con codigo por email y entrada como invitado.
- Registro: email, nombre, apellido, DNI/pasaporte, fotos segun tipo de documento, ingreso como invitado y verificacion por codigo.
- Home/subastas: catalogo visible sin precios para invitados; precios y pujas solo para usuarios habilitados.
- Detalle de subasta: subasta con catalogo/lista de productos, fotos, categoria requerida y estado.
- Sala en vivo: puja contra otro usuario, actualizacion de importe, bloqueo de lider y notificacion cuando otro supera la oferta.
- Perfil: categoria actual, progreso a categorias superiores, datos personales, medios de pago y estado de verificacion.
- Medios de pago: tarjeta, transferencia y cheque; cheque validado como metodo despues de cargar los datos/foto.
- Notificaciones: acciones para volver a subasta, verificar cuenta y revisar eventos relevantes.

Estado:

- `.env.example` queda preparado para API online.
- Permisos iOS actualizados para camara y galeria.
- Bundle web validado con `npm exec -- expo export --platform web`.
- QA integral validado con `npm run qa:flow`.
- Queda pendiente solamente la prueba manual final en un celular real con Expo Go.
