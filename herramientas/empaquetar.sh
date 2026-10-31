#!/bin/bash
# Arma dist/Esquema.app (autosuficiente) y dist/Esquema-macOS.zip + .sha256, sin instalar nada. Solo en un Mac (Apple Silicon).
# Lo usan build.sh (en tu Mac) y la acción de GitHub que publica cada versión (publicar.yml).
# Dentro van: la app, Python portátil y el código (bin/, ui/, plantillas/, tipos/) en Contents/Resources/esquema. Los documentos de la
# persona quedan en su carpeta y la configuración en ~/Library/Application Support/Esquema.
# Todo lo que se descarga tiene su huella SHA-256 fija aquí: si no coincide, no se usa y el armado se detiene.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
[ "$(uname -s)" = Darwin ] || { echo "✗ La app de Mac se arma en un Mac." >&2; exit 1; }
[ "$(uname -m)" = arm64 ] || { echo "✗ Por ahora Esquema para Mac es solo para Apple Silicon (arm64)." >&2; exit 1; }
cd "$RAIZ/app"
swift build -c release 2>&1 | tee "${ESQUEMA_PROGRESO:-/dev/null}" | tail -20
REL=.build/release
CACHE=.build/descargas
mkdir -p "$CACHE"

huella() { shasum -a 256 "$1" | cut -d' ' -f1; }
bajar() { # url huella destino
  if [ -f "$3" ] && [ "$(huella "$3")" = "$2" ]; then return; fi
  echo "→ $(basename "$3")"
  curl -fsSL --proto '=https' --retry 3 "$1" -o "$3.tmp"
  [ "$(huella "$3.tmp")" = "$2" ] || { rm -f "$3.tmp"; echo "✗ $(basename "$3") no coincide con su huella: no se usa." >&2; exit 1; }
  mv "$3.tmp" "$3"
}

# Python portátil (python-build-standalone): la misma versión y huella que Corta, Alcancía, Graba y Minuta. La persona no instala nada.
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.13.16%2B20261003-aarch64-apple-darwin-install_only_stripped.tar.gz"
PY_SHA="9e01f63bbb08576cd9c8bc2d0564d098cb30c8453a0cd4bcf6aef458f6d2a147"
bajar "$PY_URL" "$PY_SHA" "$CACHE/python-3.13.16.tar.gz"

DIST="$RAIZ/dist"; APP="$DIST/Esquema.app"
rm -rf "$DIST"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/esquema"
cp "$REL/Esquema" "$APP/Contents/MacOS/"
chmod +x "$APP/Contents/MacOS/Esquema"
cp Info.plist "$APP/Contents/Info.plist"
[ -f Esquema.icns ] && cp Esquema.icns "$APP/Contents/Resources/Esquema.icns"
tar -xzf "$CACHE/python-3.13.16.tar.gz" -C "$APP/Contents/Resources"   # → Resources/python/bin/python3
# Más liviano: Esquema solo usa la biblioteca estándar (sin pruebas, tkinter, idle ni pip).
for d in lib/python3.13/test lib/python3.13/idlelib lib/python3.13/tkinter lib/python3.13/turtledemo lib/python3.13/ensurepip lib/tcl9.0 lib/tk9.0 include share; do
  rm -rf "$APP/Contents/Resources/python/$d"
done
for d in bin ui plantillas tipos; do ditto "$RAIZ/$d" "$APP/Contents/Resources/esquema/$d"; done
# app.json: la descripción de la app que leen las piezas (bin/nucleo.py la busca junto a bin/).
cp "$RAIZ/app.json" "$APP/Contents/Resources/esquema/app.json"
# La app usa la carpeta de la persona, nunca la demo.
rm -f "$APP/Contents/Resources/esquema/ui/demo.json"
find "$APP/Contents/Resources/esquema" -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
chmod +x "$APP/Contents/Resources/esquema/bin/"*.py
cat > "$APP/Contents/Resources/LICENCIAS-TERCEROS.txt" <<'TXT'
Esquema se distribuye con la licencia AGPL-3.0 (https://github.com/esquema-app/esquema). Dentro de la app va, como programa aparte:

- Python 3.13 de python-build-standalone (https://github.com/astral-sh/python-build-standalone), licencia PSF y las de sus partes.
TXT

# Firma ad hoc, de adentro hacia afuera, con requisito por identificador (macOS reconoce la app entre versiones: el permiso para
# la carpeta elegida no se vuelve a pedir después de cada actualización).
find "$APP/Contents/Resources/python" -type f \( -name "*.so" -o -name "*.dylib" -o -perm -u+x \) -exec codesign --force --sign - {} \; 2>/dev/null || true
codesign --force --sign - --requirements '=designated => identifier "app.esquema.mac"' "$APP"

cd "$DIST"
ditto -c -k --keepParent Esquema.app Esquema-macOS.zip
shasum -a 256 Esquema-macOS.zip > Esquema-macOS.zip.sha256
echo "Listo: $DIST/Esquema-macOS.zip ($(du -h Esquema-macOS.zip | cut -f1))"
