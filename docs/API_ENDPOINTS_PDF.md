# Endpoints compatibles con el PDF

Fecha de revision: 06/06/2026.

Los endpoints del PDF se exponen con prefijo `/api`. Los endpoints `/admin/...` se ignoran para esta entrega por decision del equipo.

## Autenticacion

| PDF | Estado actual |
| --- | --- |
| `GET /auth/estado` | Implementado como alias de `/auth/session`. |
| `POST /auth/registro/fase1` | Implementado como alias compatible de `/auth/register/paso1`. |
| `POST /auth/registro/fase2` | Implementado como alias compatible de `/auth/register/paso2`. |
| `POST /auth/login` | Implementado. Acepta email o documento, mas clave/OTP. |
| `POST /auth/logout` | Implementado. |
| `POST /auth/request-password-reset` | Extra implementado: solicita codigo de recuperacion por mail. |
| `POST /auth/reset-password` | Extra implementado: confirma codigo de recuperacion y actualiza la clave. |

## Usuarios y Perfil

| PDF | Estado actual |
| --- | --- |
| `GET /usuarios/me` | Implementado. |
| `PUT /usuarios/me` | Implementado para datos editables. Nombre, apellido y documento siguen inmutables. |
| `GET /usuarios/me/estadisticas` | Implementado como alias de metricas de categoria. |
| `GET /usuarios/me/actividad-reciente` | Implementado con historial reciente de pujas. |

## Medios de Pago

| PDF | Estado actual |
| --- | --- |
| `GET /usuarios/me/medios-de-pago` | Implementado. |
| `POST /usuarios/me/medios-de-pago` | Implementado. Acepta `tarjeta`, `cuenta`, `cuenta_bancaria` y `cheque`. |
| `PATCH /usuarios/me/medios-de-pago/{id}` | Implementado para actualizar estado de verificacion. |
| `DELETE /usuarios/me/medios-de-pago/{id}` | Implementado. |

## Subastas, Catalogo y Pujas

| PDF | Estado actual |
| --- | --- |
| `GET /subastas` | Implementado. |
| `GET /subastas/{id}` | Implementado. |
| `GET /subastas/{id}/catalogo` | Implementado. |
| `GET /subastas/{subastaId}/catalogo/{itemId}` | Implementado. |
| `POST /subastas/{id}/ingresar` | Implementado como alias de ingreso a sala. |
| `POST /subastas/{id}/salir` | Implementado como salida compatible. |
| `POST /subastas/{subastaId}/items/{itemId}/pujar` | Implementado y probado en versus de dos usuarios. |
| `GET /subastas/{subastaId}/items/{itemId}/pujas` | Implementado con feed de pujas anonimizado. |
| `GET /usuarios/me/pujas` | Implementado con filtros `estado` y `subastaId`. |

## Compras

| PDF | Estado actual |
| --- | --- |
| `GET /usuarios/me/compras` | Implementado. |
| `GET /usuarios/me/compras/{id}` | Implementado. |
| `POST /usuarios/me/compras/{id}/confirmar-pago` | Implementado. |
| `GET /usuarios/me/compras/{id}/tracking` | Implementado con estado basico de envio. |

## Favoritos

| PDF | Estado actual |
| --- | --- |
| `GET /usuarios/me/favoritos` | Implementado. |
| `POST /usuarios/me/favoritos/{itemId}` | Implementado. |
| `DELETE /usuarios/me/favoritos/{itemId}` | Implementado. |

## Notificaciones

| PDF | Estado actual |
| --- | --- |
| `GET /notificaciones` | Implementado. |
| `PATCH /notificaciones/{id}/leer` | Implementado como compatibilidad. |
| `PATCH /notificaciones/leer-todas` | Implementado como compatibilidad. |
| `POST /notificaciones/{id}/accion` | Extra de la app actual para navegar desde la notificacion. |

## Solicitudes de Venta y Mis Bienes

| PDF | Estado actual |
| --- | --- |
| `POST /solicitudes-venta` | Implementado. |
| `GET /solicitudes-venta` | Implementado. |
| `GET /solicitudes-venta/{id}` | Implementado. |
| `POST /solicitudes-venta/{id}/aceptar-condiciones` | Implementado con estado interno `aceptado`. |
| `POST /solicitudes-venta/{id}/rechazar-condiciones` | Implementado con estado interno `rechazado`. |
| `POST /solicitudes-venta/{id}/inspeccion` | Extra implementado para simular revision de empresa y deposito. |
| `POST /solicitudes-venta/{id}/revision/aceptar` | Extra implementado para aceptacion de empresa con fecha, base, comision, seguro y deposito. |
| `POST /solicitudes-venta/{id}/revision/rechazar` | Extra implementado para rechazo de empresa con motivo visible. |
| `GET /mis-bienes` | Implementado. |
| `GET /mis-bienes/{productoId}/seguro` | Implementado con estado basico. |
| `GET /mis-bienes/{productoId}/ubicacion` | Implementado con ubicacion disponible o pendiente. |

## Penalidades

| PDF | Estado actual |
| --- | --- |
| `GET /usuarios/me/penalidades` | Implementado. |
| `GET /usuarios/me/estado-cuenta` | Implementado. |
| `POST /usuarios/me/penalidades/{id}/pagar` | Implementado como alias de resolver penalidad. |

## QA

Validado con:

```bash
npm run db:init
npm run qa:flow
```

La suite automatizada cubre login/registro, rutas compatibles con el PDF, pagos, venta de lotes, subastas, favoritos, pujas, compras y notificaciones.

## API online

URL publica actual:

```text
https://elitebid.onrender.com/api
```

Pruebas rapidas:

```text
GET https://elitebid.onrender.com/api/health
GET https://elitebid.onrender.com/api/auctions/home
GET https://elitebid.onrender.com/api/auctions/7
POST https://elitebid.onrender.com/api/auth/login
```

`/api/health` debe devolver `ok: true`. Los endpoints publicos de subastas deben ocultar precios cuando no hay sesion. Los endpoints protegidos deben devolver error JSON si no hay token.
