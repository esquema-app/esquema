#!/bin/bash
# Arma lo que la app de Windows/Linux lleva adentro, para que la persona no instale nada:
#   vendor/<linux|win>/python   Python portátil (python-build-standalone, verificado por SHA-256). Esquema solo usa la biblioteca estándar.
# Uso: bash herramientas/preparar.sh linux|windows      Necesita: curl y tar. Corre en Linux o macOS.
set -euo pipefail
cd "$(dirname "$0")/.."

SO="${1:?uso: preparar.sh linux|windows}"
case "$SO" in linux) OS=linux ;; windows | win) OS=win ;; *) echo "sistema desconocido: $SO"; exit 1 ;; esac
DESTINO="vendor/$OS"
CACHE="${ESQUEMA_CACHE:-$HOME/.cache/esquema-escritorio}"
mkdir -p "$CACHE" "$DESTINO"

# La misma versión y huellas que Graba y Minuta (y que la app de Mac, en herramientas/empaquetar.sh).
PY_TAG=20261003; PY_VER=3.13.16
GH=https://github.com
if [ "$OS" = linux ]; then
  PY_ARCH=x86_64-unknown-linux-gnu; PY_SHA=4595c5589fff7bf0cb158d9a88a797e0d791fa33830770fcb7bf3f4b104feeae
else
  PY_ARCH=x86_64-pc-windows-msvc; PY_SHA=ec43f1a85c29f147d7ae2d13218c52c70b24a983a82ab22d6c607c0593060e10
fi

huella() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
bajar() { # url sha destino
  if [ -f "$3" ] && [ "$(huella "$3")" = "$2" ]; then return; fi
  echo "→ $(basename "$3")"
  curl -fL --proto '=https' --retry 3 -o "$3.tmp" "$1"
  [ "$(huella "$3.tmp")" = "$2" ] || { echo "✗ Huella distinta: $1 (no se usa)"; rm -f "$3.tmp"; exit 1; }
  mv "$3.tmp" "$3"
}

PY_ARCHIVO="cpython-$PY_VER+$PY_TAG-$PY_ARCH-install_only_stripped.tar.gz"
bajar "$GH/astral-sh/python-build-standalone/releases/download/$PY_TAG/${PY_ARCHIVO//+/%2B}" "$PY_SHA" "$CACHE/$PY_ARCHIVO"
rm -rf "$DESTINO/python" "$DESTINO/python.tmp"; mkdir -p "$DESTINO/python.tmp"
tar -xzf "$CACHE/$PY_ARCHIVO" -C "$DESTINO/python.tmp"
mv "$DESTINO/python.tmp/python" "$DESTINO/python"; rmdir "$DESTINO/python.tmp"
# Más liviano: sin pruebas, tkinter, idle, pip ni encabezados.
for d in lib/python3.13/test lib/python3.13/idlelib lib/python3.13/tkinter lib/python3.13/turtledemo lib/python3.13/ensurepip lib/python3.13/site-packages \
         lib/tcl9.0 lib/tk9.0 Lib/test Lib/idlelib Lib/tkinter Lib/turtledemo Lib/ensurepip Lib/site-packages Lib/venv include share tcl libs; do rm -rf "$DESTINO/python/$d"; done
find "$DESTINO/python" \( -name "*.pdb" -o -name "__pycache__" -o -name "libtcl*" -o -name "libtk*" -o -name "_tkinter*" \) -prune -exec rm -rf {} +
rm -f "$DESTINO/python/bin/"{idle3*,pip*,pydoc3*,python3*-config} 2>/dev/null || true
echo "Listo: $DESTINO ($(du -sh "$DESTINO" | cut -f1))"
