# Datos de prueba EliteBid

Generados con `npm run qa:seed`.

| Caso | Email | Clave / codigo | Estado esperado |
| --- | --- | --- | --- |
| Cuenta invitada con codigo vigente. Usar OTP 123456. | `demo.elitebid.invitado.pendiente@elitebid.test` | `OTP 123456` | invitado / pendiente / comun |
| Cuenta invitada con codigo vencido. Debe pedir reenvio. | `demo.elitebid.invitado.vencido@elitebid.test` | `OTP vencido 111111; usar reenvio` | invitado / pendiente / comun |
| Cliente verificado, sin medios de pago. | `demo.elitebid.cliente.sinpago@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente verificado con tarjeta habilitada para entrar a salas comun. | `demo.elitebid.cliente.conpago@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con pago y penalidad general activa. | `demo.elitebid.cliente.penalidad@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con penalidad vencida y cuenta restringida. | `demo.elitebid.cliente.penalidad.vencida@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con penalidad por falta de fondos: multa y fondos pendientes. | `demo.elitebid.cliente.penalidad.fondos@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con multa abonada pero fondos pendientes. | `demo.elitebid.cliente.penalidad.multa@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con penalidad por falta de fondos ya resuelta. | `demo.elitebid.cliente.penalidad.pagada@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con metricas para categoria plata. | `demo.elitebid.cliente.plata@elitebid.test` | `Demo!2203` | cliente / activo / plata |
| Cliente categoria especial con cuenta bancaria verificada. | `demo.elitebid.cliente.especial@elitebid.test` | `Demo!2203` | cliente / activo / especial |
| Cliente categoria oro con cheque certificado verificado. | `demo.elitebid.cliente.oro@elitebid.test` | `Demo!2203` | cliente / activo / oro |
| Cliente categoria platino con medio de pago internacional USD. | `demo.elitebid.cliente.platino@elitebid.test` | `Demo!2203` | cliente / activo / platino |
| Cliente con puja ganadora pendiente de registrar compra. | `demo.elitebid.cliente.compra@elitebid.test` | `Demo!2203` | cliente / activo / comun |
| Cliente con solicitudes de lotes pendientes y productos con imagenes distintas. | `demo.elitebid.cliente.lote@elitebid.test` | `Demo!2203` | cliente / activo / comun |

Notas:

- Los mails usan dominio `.test`; no salen a cuentas reales.
- El seed es idempotente: borra y vuelve a crear solo usuarios `demo.elitebid.*@elitebid.test`.
- Para probar desde Login: usar los emails de la tabla y la clave/codigo correspondiente.
- Hay usuarios demo para penalidad general activa, vencida, falta de fondos pendiente, multa abonada con fondos pendientes y penalidad pagada.
- El cliente con penalidad activa/vencida debe mostrar notificacion y panel de penalidades.
- El cliente con lote debe mostrar ventas en estado pendiente en `Mis ventas`.
