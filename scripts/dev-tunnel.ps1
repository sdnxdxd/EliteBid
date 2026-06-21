param(
  [int]$ApiPort = 3001,
  [int]$NgrokApiPort = 4040,
  [string]$EnvFile = ".env",
  [string]$ComposeService = "mysql"
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "No se encontro '$Name'. Instalalo y volve a ejecutar este script."
  }
}

function Resolve-NgrokPath {
  $command = Get-Command ngrok -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $wingetPath = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
  if (Test-Path $wingetPath) {
    return $wingetPath
  }

  throw "No se encontro 'ngrok'. Instalalo con: winget install --id Ngrok.Ngrok -e"
}

function Wait-Http {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-RestMethod -Uri $Url -TimeoutSec 3
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "Timeout esperando $Url"
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  if (-not (Test-Path $Path)) {
    New-Item -Path $Path -ItemType File | Out-Null
  }

  $lines = Get-Content $Path -ErrorAction SilentlyContinue
  $escapedKey = [regex]::Escape($Key)
  $replacement = "$Key=$Value"
  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match "^$escapedKey=") {
      $found = $true
      $replacement
    } else {
      $line
    }
  }

  if (-not $found) {
    $updated += $replacement
  }

  Set-Content -Path $Path -Value $updated -Encoding UTF8
}

function Invoke-WithRetry {
  param(
    [scriptblock]$Command,
    [string]$Label,
    [int]$Retries = 30,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $Retries; $attempt += 1) {
    try {
      & $Command
      if ($LASTEXITCODE -ne 0) {
        throw "$Label fallo con codigo $LASTEXITCODE"
      }
      return
    } catch {
      if ($attempt -eq $Retries) {
        throw
      }
      Write-Host "$Label no esta listo todavia. Reintento $attempt/$Retries..."
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

function Get-NgrokPublicUrl {
  param([int]$Port)

  $tunnels = Wait-Http -Url "http://127.0.0.1:$Port/api/tunnels" -TimeoutSeconds 45
  $httpsTunnel = $tunnels.tunnels |
    Where-Object { $_.public_url -like "https://*" } |
    Select-Object -First 1

  if (-not $httpsTunnel) {
    throw "Ngrok esta activo, pero no devolvio un tunnel HTTPS."
  }

  return $httpsTunnel.public_url
}

Push-Location (Resolve-Path "$PSScriptRoot\..")

try {
  Require-Command docker
  Require-Command npm
  $ngrokPath = Resolve-NgrokPath

  Write-Host "Levantando MySQL con Docker Compose..."
  docker compose up -d $ComposeService

  Write-Host "Inicializando base de datos..."
  Invoke-WithRetry -Label "MySQL/db:init" -Command { npm run db:init }

  Write-Host "Iniciando ngrok en puerto $ApiPort..."
  $ngrokProcess = Start-Process -FilePath $ngrokPath `
    -ArgumentList @("http", $ApiPort.ToString(), "--log=stdout") `
    -WindowStyle Hidden `
    -PassThru

  $publicUrl = Get-NgrokPublicUrl -Port $NgrokApiPort
  $apiUrl = "$publicUrl/api"
  Write-Host "URL publica API: $apiUrl"

  Set-EnvValue -Path $EnvFile -Key "EXPO_PUBLIC_MOBILE_API_URL" -Value $apiUrl
  Write-Host "Actualizado $EnvFile -> EXPO_PUBLIC_MOBILE_API_URL=$apiUrl"

  Write-Host "Abriendo API en una nueva ventana..."
  Start-Process powershell `
    -ArgumentList @("-NoExit", "-Command", "cd '$PWD'; npm run api") `
    -WindowStyle Normal

  Start-Sleep -Seconds 3

  Write-Host "Abriendo Expo en una nueva ventana..."
  Start-Process powershell `
    -ArgumentList @("-NoExit", "-Command", "cd '$PWD'; npm run start -- --tunnel --clear") `
    -WindowStyle Normal

  Write-Host ""
  Write-Host "Entorno levantado."
  Write-Host "Ngrok queda corriendo en segundo plano. Para cerrarlo: Stop-Process -Id $($ngrokProcess.Id)"
  Write-Host "Expo usara: $apiUrl"
} finally {
  Pop-Location
}
