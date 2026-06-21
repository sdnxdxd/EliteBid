# Entorno local con Docker, ngrok y Expo

Este flujo levanta EliteBid completo para probar desde Expo Go usando una URL publica de ngrok.

## Requisitos

- Docker Desktop instalado y abierto.
- Ngrok instalado y autenticado.
- Node.js y npm instalados.
- Dependencias del proyecto instaladas con `npm install`.
- Archivo `.env` creado en la raiz del proyecto.

No hace falta instalar `jq`: el script de Windows usa `ConvertFrom-Json` y el script Bash usa Node para leer el JSON de ngrok.

## Windows PowerShell

Desde la raiz del proyecto:

```powershell
npm run dev:tunnel:win
```

Alternativa directa:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-tunnel.ps1
```

El script hace esto:

1. Ejecuta `docker compose up -d mysql`.
2. Ejecuta `npm run db:init`.
3. Inicia `ngrok http 3001` en segundo plano.
4. Lee `http://127.0.0.1:4040/api/tunnels`.
5. Toma la URL `https://...ngrok...`.
6. Actualiza `.env`:

```env
EXPO_PUBLIC_MOBILE_API_URL=https://URL-DE-NGROK/api
```

7. Abre una ventana PowerShell con `npm run api`.
8. Abre otra ventana PowerShell con `npm run start -- --tunnel --clear`.

Para cerrar ngrok, el script imprime el comando:

```powershell
Stop-Process -Id ID_DEL_PROCESO
```

## Linux/Mac

Desde la raiz del proyecto:

```bash
chmod +x scripts/dev-tunnel.sh
npm run dev:tunnel:unix
```

Alternativa directa:

```bash
./scripts/dev-tunnel.sh
```

Para cerrar ngrok, el script imprime:

```bash
kill PID_DEL_PROCESO
```

## Variables opcionales

PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-tunnel.ps1 -ApiPort 3001 -NgrokApiPort 4040 -EnvFile ".env" -ComposeService "mysql"
```

Bash:

```bash
API_PORT=3001 NGROK_API_PORT=4040 ENV_FILE=.env COMPOSE_SERVICE=mysql ./scripts/dev-tunnel.sh
```

## Problemas comunes

- Si ngrok no devuelve URL, revisar que `ngrok http 3001` funcione manualmente.
- Si Expo abre pero el celular no conecta, revisar que `EXPO_PUBLIC_MOBILE_API_URL` haya quedado con `/api` al final.
- Si Docker falla, abrir Docker Desktop y volver a ejecutar.
- Si Gmail/ngrok/Expo fallan en red de facultad, probar con hotspot del celular.
