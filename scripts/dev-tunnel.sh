#!/usr/bin/env bash
set -euo pipefail

API_PORT="${API_PORT:-3001}"
NGROK_API_PORT="${NGROK_API_PORT:-4040}"
ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-mysql}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "No se encontro '$1'. Instalalo y volve a ejecutar este script." >&2
    exit 1
  fi
}

wait_http() {
  local url="$1"
  local timeout_seconds="${2:-30}"
  local end=$((SECONDS + timeout_seconds))

  while [ "$SECONDS" -lt "$end" ]; do
    if curl -fsS "$url" >/tmp/elitebid-ngrok-tunnels.json 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "Timeout esperando $url" >&2
  exit 1
}

set_env_value() {
  local key="$1"
  local value="$2"

  touch "$ENV_FILE"

  if grep -q "^${key}=" "$ENV_FILE"; then
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    printf "\n%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

run_with_retry() {
  local label="$1"
  shift
  local retries="${RETRIES:-30}"
  local delay_seconds="${RETRY_DELAY_SECONDS:-2}"
  local attempt=1

  until "$@"; do
    if [ "$attempt" -ge "$retries" ]; then
      echo "$label fallo despues de $retries intentos." >&2
      return 1
    fi
    echo "$label no esta listo todavia. Reintento $attempt/$retries..."
    attempt=$((attempt + 1))
    sleep "$delay_seconds"
  done
}

require_command docker
require_command ngrok
require_command npm
require_command node
require_command curl

echo "Levantando MySQL con Docker Compose..."
docker compose up -d "$COMPOSE_SERVICE"

echo "Inicializando base de datos..."
run_with_retry "MySQL/db:init" npm run db:init

echo "Iniciando ngrok en puerto $API_PORT..."
ngrok http "$API_PORT" --log=stdout >/tmp/elitebid-ngrok.log 2>&1 &
NGROK_PID="$!"

wait_http "http://127.0.0.1:${NGROK_API_PORT}/api/tunnels" 45
PUBLIC_URL="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/elitebid-ngrok-tunnels.json','utf8')); const tunnel=(data.tunnels||[]).find(t => String(t.public_url||'').startsWith('https://')); if(!tunnel){ process.exit(1); } process.stdout.write(tunnel.public_url);")"
API_URL="${PUBLIC_URL}/api"

echo "URL publica API: $API_URL"
set_env_value "EXPO_PUBLIC_MOBILE_API_URL" "$API_URL"
echo "Actualizado $ENV_FILE -> EXPO_PUBLIC_MOBILE_API_URL=$API_URL"

echo "Abriendo API en una terminal nueva..."
if command -v osascript >/dev/null 2>&1; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR' && npm run api\""
elif command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- bash -lc "cd '$ROOT_DIR' && npm run api; exec bash"
elif command -v xterm >/dev/null 2>&1; then
  xterm -e "cd '$ROOT_DIR' && npm run api; bash" &
else
  npm run api &
fi

sleep 3

echo "Abriendo Expo en una terminal nueva..."
if command -v osascript >/dev/null 2>&1; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR' && npm run start -- --tunnel --clear\""
elif command -v gnome-terminal >/dev/null 2>&1; then
  gnome-terminal -- bash -lc "cd '$ROOT_DIR' && npm run start -- --tunnel --clear; exec bash"
elif command -v xterm >/dev/null 2>&1; then
  xterm -e "cd '$ROOT_DIR' && npm run start -- --tunnel --clear; bash" &
else
  npm run start -- --tunnel --clear &
fi

echo ""
echo "Entorno levantado."
echo "Ngrok queda corriendo con PID $NGROK_PID. Para cerrarlo: kill $NGROK_PID"
echo "Expo usara: $API_URL"
