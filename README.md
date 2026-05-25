# EliteBid

App Expo SDK 54 con React Native y backend local en SQLite para el primer circuito:
inicio de sesion, persistencia de sesion y home.

## Requisitos

- Node.js 20.19 o superior
- Expo Go compatible con SDK 54 o un emulador/dispositivo configurado

## Ejecutar

```bash
npm install
npm start
```

Credenciales de prueba:

```text
alejandro@elitebid.com
Elite1234
```

## Estructura

- `src/backend/database.js`: abre SQLite, crea tablas y carga datos iniciales.
- `src/backend/schema.sql`: version legible del esquema SQLite convertido desde el SQL original.
- `src/backend/authService.js`: login, creacion de sesion y cierre de sesion.
- `src/backend/auctionService.js`: consultas para el home.
- `src/screens/LoginScreen.js`: pantalla de acceso con estetica Nocturne Velvet.
- `src/screens/HomeScreen.js`: home con subastas abiertas, proximas subastas y estado de usuario.

## Notas

El SQL original estaba en dialecto SQL Server. Para correr en SQLite se adaptaron
`identity`, `go`, `varbinary(max)`, nombres con acentos, constraints y fechas.
La autenticacion actual usa clave en texto plano porque es un prototipo local de
entrega; al migrar a API REST conviene reemplazarlo por hash de password.
"# EliteBid" 
