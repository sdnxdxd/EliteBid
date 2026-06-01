# Informe Segunda Entrega - Elite Bid Auctions

## Datos generales

- Materia: Desarrollo de Aplicaciones I
- Trabajo: TPO 1C2026 - Sistema de subastas
- Equipo: 17
- Aplicacion: Elite Bid Auctions
- Fecha: 26/05/2026
- Stack actual: Expo + React Native + backend Node/Express + MySQL

## Objetivo de la segunda entrega

La segunda entrega pide backend y frontend funcionando aproximadamente al 50%, con al menos un circuito completo integrado de punta a punta y una descripcion clara del manejo de errores.

Para esta instancia se priorizo una version navegable y funcional de la aplicacion mobile, conectada a una API Node/Express con persistencia MySQL. Esto permite demostrar los circuitos principales con datos guardados en tablas reales.

## Alcance implementado

### Frontend mobile

Se implemento la navegacion principal de Elite Bid con barra inferior fija y tabs:

- Inicio
- Subastas
- Favoritos
- Compras
- Perfil

Pantallas implementadas o completadas:

- Login y recupero de clave
- Registro de usuario con datos personales, documento y domicilio
- Home con resumen del usuario y subastas abiertas/proximas
- Listado de subastas con filtros por estado
- Detalle de subasta
- Sala de subasta en vivo
- Favoritos
- Compras/pujas ganadoras
- Perfil
- Medios de pago
- Penalidades

La interfaz respeta la identidad visual de la primera entrega: paleta violeta, iconografia, cards oscuras, CTAs lilas y barra inferior similar al prototipo de Stitch/Figma.

### Backend API / capa de servicios

Se implemento un backend Express dentro de `server/`:

- `server/index.js`: endpoints REST para login, registro, subastas, pujas, favoritos, compras, perfil, medios de pago y penalidades.
- `server/db.js`: conexion a MySQL con pool.
- `server/schema.sql`: tablas principales del dominio.
- `server/initDatabase.js`: creacion de base, tablas y seed inicial.

Tablas principales cubiertas:

- `personas`
- `clientes`
- `usuarios`
- `sesiones`
- `medios_pago`
- `subastas`
- `catalogos`
- `items_catalogo`
- `asistentes`
- `pujos`
- `favoritos`
- `penalidades`

La app Expo consume la API mediante `src/backend/apiClient.js`; ya no se usa SQLite ni `localStorage` como base de datos.

## Circuito completo integrado

El circuito principal integrado es:

1. El usuario inicia sesion.
2. La app carga la sesion y muestra Home.
3. El usuario entra al listado de subastas.
4. Abre el detalle de una subasta.
5. Ingresa a la sala en vivo.
6. Realiza una puja.
7. La puja se registra, actualiza el monto actual y aparece en el feed.
8. El perfil refleja las estadisticas de participacion, pujas ganadoras e invertido.

Usuario de prueba:

- Email: `alejandro@elitebid.com`
- Clave: `Elite1234`
- Categoria: `platino`
- Medio de pago verificado: si

## Reglas de negocio implementadas

### Acceso a sala

Para ingresar a una sala se valida:

- La subasta debe estar abierta.
- La categoria del usuario debe ser igual o superior a la categoria requerida por la subasta.
- El usuario debe tener al menos un medio de pago verificado.

### Pujas

Se implementa modalidad ascendente:

- La puja debe superar la oferta actual.
- Puja minima: oferta actual + 1% del precio base.
- Puja maxima: oferta actual + 20% del precio base.
- Las categorias `oro` y `platino` pueden superar el rango maximo.
- Al registrar una puja, se marca como ganadora y se actualiza la puja actual del item.
- El feed muestra alias anonimos de postores.

### Perfil

Se bloqueo la modificacion de:

- Nombre
- Apellido
- Documento

Solo quedan editables:

- Correo
- Domicilio legal
- Foto de perfil

Las estadisticas del perfil se calculan desde datos reales:

- Subastas asistidas
- Pujas ganadoras
- Total invertido

### Favoritos

Se implemento alta y baja de favoritos desde:

- Home
- Listado de subastas
- Detalle de subasta
- Pantalla Favoritos

Cada accion muestra un popup/toast de confirmacion.

### Penalidades

Se implemento:

- Listado de penalidades.
- Pago de penalidad.
- Marcado como solucionada.
- Actualizacion del estado a `pagada`.
- Popup de confirmacion.

## Manejo de errores

La aplicacion maneja errores con mensajes visibles para el usuario en los flujos principales.

### Login y sesion

- Campos vacios: mensaje solicitando correo y clave.
- Credenciales incorrectas: mensaje de error.
- Usuario no habilitado: mensaje de cuenta no disponible.

### Registro

- Campos obligatorios validados antes de crear el usuario.
- Email invalido.
- Password debil: minimo 8 caracteres, un numero y un simbolo.
- Email duplicado.
- Fotos de documento obligatorias.

### Perfil

- Email invalido.
- Domicilio vacio.
- Intento de modificar nombre, apellido o documento: se rechaza desde el servicio.
- Falta de permiso para seleccionar foto: mensaje visible.

### Medios de pago

- Tipo obligatorio.
- Monto de garantia mayor a cero.
- Tarjeta: numero, titular, vencimiento y CVV obligatorios.
- Cuenta: banco, tipo de cuenta, CBU/CVU y alias obligatorios.
- Cheque: banco, numero, fecha e imagen obligatorios.

### Subastas y pujas

- Subasta no abierta.
- Categoria insuficiente.
- Falta de medio de pago verificado.
- Monto invalido.
- Monto menor o igual que la puja actual.
- Monto fuera del rango permitido.

### Penalidades

- Penalidad inexistente.
- Penalidad ya solucionada.
- Estado actualizado con feedback visual.

## Validaciones realizadas

Se valido el build web con:

```bash
npx expo export --platform web
```

Resultado: compilacion correcta.

Tambien se realizaron pruebas visuales previas sobre el servidor local Expo para:

- Login.
- Home.
- Subastas.
- Favoritos: agregar y quitar.
- Detalle de subasta.
- Sala en vivo.
- Perfil con campos bloqueados.

## Limitaciones actuales

Para la segunda entrega la aplicacion demuestra los circuitos principales, pero quedan puntos pendientes para una version final:

- El backend Express es JavaScript y corre localmente; todavia no esta deployado.
- No hay JWT real firmado; la sesion se maneja localmente.
- No hay WebSocket real; el feed se actualiza con datos locales.
- No hay bloqueo transaccional real para pujas concurrentes.
- No hay integracion con pasarela de pagos real.
- No hay APK generado documentado en el repo.
- No hay tests automatizados unitarios/e2e.
- La moneda se normalizo a ARS para simplificar la entrega local.

## Pendiente recomendado para la siguiente etapa

1. Crear backend Node.js + Express + TypeScript.
2. Migrar SQLite local a PostgreSQL con Prisma o TypeORM.
3. Implementar JWT Bearer real.
4. Exponer endpoints REST segun la API definida en la primera entrega.
5. Implementar Socket.IO para pujas en vivo.
6. Agregar bloqueo de pujas en proceso para evitar race conditions.
7. Generar build Expo/APK para prueba en dispositivo.
8. Agregar tests del circuito critico: login, ingreso a sala y puja.

## Conclusiones

La segunda entrega queda cubierta como prototipo funcional integrado. La app permite recorrer los circuitos de usuario mas importantes: autenticacion, home, subastas, sala en vivo, pujas, favoritos, medios de pago, perfil y penalidades.

El punto mas importante a aclarar en la presentacion es que la logica backend esta implementada como capa local de servicios y base SQLite/adaptador web, por lo que el siguiente salto tecnico es separar esa logica en un backend REST deployado.
