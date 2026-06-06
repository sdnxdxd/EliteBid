# Auditoria de flujos EliteBid

## Comandos usados

```bash
npm run db:init
npm run qa:seed
npm run qa:flow
npx expo export --platform web
```

## Datos de prueba persistentes

Los datos quedan documentados en `docs/qa/DATOS_PRUEBA.md`.

Para regenerarlos:

```bash
npm run qa:seed
```

El seed borra y recrea solo usuarios `demo.elitebid.*@elitebid.test`.

## Flujos principales

| Flujo | Variantes cubiertas | Estado |
| --- | --- | --- |
| Registro | DNI con frente/dorso, pasaporte con una sola foto, documento duplicado, mail duplicado, campos vacios, email invalido, URIs inseguras | OK |
| Invitado pendiente | Ve solo futuras, no ve precios, no favoritos, no pagos, no pujas | OK |
| Codigo OTP | Vigente, incorrecto, corto, vencido, reenvio por email, reenvio por documento | OK |
| Verificacion | Crea clave definitiva, valida letra/numero/simbolo, sin espacios, confirmacion coincidente, activa cuenta | OK |
| Login | Cliente activo, invitado con OTP, email normalizado, clave anterior tras reset, credenciales invalidas | OK |
| Recuperar clave | Cuenta inexistente, clave debil, confirmacion distinta, reset valido invalida sesiones | OK |
| Catalogo | Publico sin precios, cliente con precios, invitado sin subastas activas | OK |
| Detalle subasta | Cliente ve precio/reglas, invitado bloqueado en activa | OK |
| Sala en vivo | Sin sesion bloqueado, cliente sin pago bloqueado, cliente con pago entra | OK |
| Puja | Monto menor rechazado, sesion ajena bloqueada, puja valida actualiza subasta, lider no puede ofertar otra vez | OK |
| Versus de pujas | Usuario A puja, usuario B supera, A recibe notificacion, ve el precio actualizado y vuelve a superar | OK |
| Compra | Puja ganadora aparece pendiente y puede registrarse como pagada | OK |
| Favoritos | Invitado bloqueado, cliente puede alternar favorito | OK |
| Pagos | Tarjeta valida, tarjeta demasiado larga rechazada, CVV invalido, cheque con fecha futura rechazado, cheque valido verificado | OK |
| Perfil | Sin sesion bloqueado, sesion ajena bloqueada, documento/nombre inmutables | OK |
| Categoria | Comun, plata por metricas, progreso desde Perfil | OK |
| Penalidades | Penalidad activa visible, accion resoluble, frena ascensos | OK |
| Ventas/lotes | Sin fotos rechazado, lote valido queda pendiente/en inspeccion | OK |
| Notificaciones | Cuenta pendiente, pago faltante, penalidad, lote, subasta futura | OK |

## Posibles mejoras pendientes

- Separar claramente `Compras` y `Mis ventas`: hoy comparten pantalla y puede confundir en demo.
- Agregar un estado visual para "mail no enviado todavia" en Login/Reenviar cuando SMTP falla.
- Mostrar boton directo desde Login hacia `Reenviar codigo de invitado` solo despues de error de codigo vencido, para reducir ruido.
- Agregar filtros por categoria en subastas si quieren demostrar mejor comun/especial/plata/oro/platino.
- Agregar una pantalla/admin minima para aprobar cheques y solicitudes de lote, porque hoy el estado se simula desde datos.
- Persistir notificaciones leidas en tabla propia si necesitan auditoria real; ahora se calculan dinamicamente.
- Agregar WebSocket o polling mas frecuente en sala si quieren que parezca una subasta en vivo real.
- Probar en dispositivo fisico Android/iOS con la misma WiFi y firewall habilitado.

## Resultado QA 06/06/2026

Se ejecuto `npm run qa:flow` completo con 32 chequeos OK:

- Registro con DNI y pasaporte.
- Invitado pendiente, OTP vencido y reenvio sin sesion.
- Login, recuperacion de clave e invalidacion de sesiones viejas.
- Seguridad por sesion: perfil, pagos, sala y pujas cruzadas bloqueadas.
- Pagos: tarjeta valida, CVV invalido, tarjeta con numeros de mas, cheque futuro y cheque valido verificado.
- Lotes: solicitud invalida sin fotos y solicitud valida en inspeccion.
- Subasta en vivo: entrada, puja baja rechazada, puja valida, bloqueo de ofertar mientras sos lider.
- Versus: otro usuario supera la oferta, llega notificacion de sobrepuja, el precio se actualiza y el primer usuario puede volver a pujar.
- Compra: la puja ganadora queda pendiente y luego se registra como pagada.

Tambien se ejecuto `npx expo export --platform web` sin errores de compilacion.

## Resultado QA Auth 06/06/2026

Se agrego una matriz dedicada de login/registro/verificacion con 45 casos OK. El `npm run qa:flow` completo quedo en 77 chequeos OK:

- Registro invalido: sin email, email mal formado, sin nombre, nombre con numeros, sin apellido, apellido con simbolos, sin documento, DNI corto, DNI largo, sin frente, sin dorso, URI `javascript:`, pasaporte corto, tipo desconocido tratado como DNI.
- Registro valido: normalizacion de email, nombre, apellido y DNI; pasaporte con una sola foto; rechazo de email duplicado y documento duplicado.
- Login invitado: email inexistente, codigo incorrecto, OTP vigente con email en mayusculas/espacios, OTP vencido.
- Verificacion: email invalido, codigo corto, codigo incorrecto, clave corta, sin numero, sin letra, sin simbolo, con espacios, confirmacion distinta, verificacion valida y doble verificacion rechazada.
- Login cliente: clave incorrecta rechazada, email normalizado aceptado, login activo correcto.
- Reenvio: email vigente, documento vigente, cuenta inexistente y cuenta ya activa.
- Reset: cuenta inexistente, confirmacion distinta, invalidacion de clave anterior y login con clave nueva.

Bug encontrado y corregido: el reenvio de codigo por documento buscaba contra `clientes.identificador`; ahora busca contra `personas.documento`, que es el dato ingresado por el usuario.

## Prueba mobile esperada

Desde celular en misma WiFi:

1. Backend: `npm run api`.
2. Expo: `npm start`.
3. Abrir con Expo Go.
4. Login con `demo.elitebid.cliente.conpago@elitebid.test` / `Demo!2203`.
5. Entrar a Subastas, abrir una comun activa, entrar a sala y probar una puja valida.

Si no conecta desde celular:

- Probar `http://IP_DE_LA_PC:3001/api/health` desde el navegador del celular.
- Permitir Node.js en Windows Firewall.
- Confirmar que el celular y la PC esten en la misma red WiFi.

## Resultado de simulacion mobile en esta auditoria

Se valido:

- Build web mobile-ready con `npx expo export --platform web`.
- API local contra MySQL con `npm run qa:flow`.
- Resolucion de API preparada para celular en `src/backend/apiClient.js`: si Expo Go corre en un dispositivo fisico y la URL configurada es local, toma la IP LAN desde la URL de Expo.

Limitacion de esta corrida:

- El Browser plugin local fallo por sandbox de Windows antes de abrir la pestaña con viewport 390 x 844.
- No habia Playwright/Puppeteer instalado en el repo para hacer captura visual alternativa sin descargar dependencias.

Conclusion: los flujos equivalentes por API pasan, el build web compila y la configuracion soporta celular en la misma WiFi. Falta prueba visual final en un dispositivo fisico real o con un browser automation disponible.
