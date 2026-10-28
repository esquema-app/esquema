#!/bin/bash
# Compila Esquema y la instala en ~/Applications/Esquema.app (para desarrollo en este Mac).
# El checkout va en ~/Developer/esquema (o donde quieras); la app se actualiza después con git pull desde Ajustes.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH
RAIZ="$(cd "$(dirname "$0")" && pwd)"
# Cerrar la app mientras la IA escribe un README o un diagrama lo cortaría (lo que escribes se guarda solo al cerrar).
if pgrep -f "bin/asistente.py" >/dev/null && [ "${FORZAR:-0}" != "1" ]; then
  echo "✗ Esquema está esperando una respuesta de tu IA. Espera a que termine (o usa FORZAR=1)." >&2; exit 3
fi
bash "$RAIZ/herramientas/empaquetar.sh"
APP="$HOME/Applications/Esquema.app"
mkdir -p "$HOME/Applications"
osascript -e 'tell application id "app.esquema.mac" to quit' 2>/dev/null || true
sleep 2
rm -rf "$APP"
ditto "$RAIZ/dist/Esquema.app" "$APP"
# La app sabe que viene de este checkout (fuera de la app, para no romper su firma): se actualiza con git pull.
DATOS="$HOME/Library/Application Support/Esquema"
mkdir -p "$DATOS" && chmod 700 "$DATOS" && echo "$RAIZ" > "$DATOS/desarrollo"
echo "Instalada en $APP ($(du -sh "$APP" | cut -f1))"
open "$APP"
