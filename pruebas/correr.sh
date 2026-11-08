#!/bin/bash
# Todas las pruebas (las mismas que corre GitHub en cada cambio).
# Uso: bash pruebas/correr.sh            (la interfaz necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
#      La app nativa (Rust, pieza «host-tauri») se compila y prueba si hay cargo, y se abre de verdad si además hay Xvfb (Linux).
#      bash pruebas/correr.sh sintaxis   (solo la sintaxis)
set -eo pipefail
cd "$(dirname "$0")/.."
echo "Sintaxis"
for f in ui/app.js ui/proyectos.js ui/i18n.js ui/host.js ui/tema.js ui/componentes.js ui/bienvenida.js ui/motor/*.js docs/pagina.js; do node --check "$f"; done
for f in pruebas/*.mjs herramientas/*.mjs; do node --check "$f"; done
python3 -m py_compile bin/*.py pruebas/*.py herramientas/*.py ejemplos/*.py
python3 -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('ui/idiomas/*.json') + glob.glob('plantillas/*/*.json') + glob.glob('ejemplos/catalogo-ejemplo/plantillas/*/*.json') + ['ui/demo.json', 'pruebas/casos.json', 'pruebas/puente.json']]"
for f in herramientas/*.sh pruebas/*.sh escritorio/herramientas/*.sh escritorio/pruebas/*.sh build.sh instalar.sh; do bash -n "$f"; done
python3 -c "import json, plistlib; json.load(open('escritorio/tauri.conf.json')); plistlib.load(open('escritorio/Info.plist', 'rb'))"
[ "$1" = "sintaxis" ] && exit 0
echo "Privacidad"; bash herramientas/revisar_privacidad.sh --generico
if [ -s .terminos-privados ]; then bash herramientas/revisar_privacidad.sh --todo; fi
echo "Contrato"; python3 pruebas/contrato.py
echo "Motor"; node pruebas/motor.mjs | tail -2
echo "Python"; python3 pruebas/test_python.py 2>&1 | tail -3
echo "Interfaz"; node pruebas/interfaz.mjs
if command -v cargo >/dev/null && [ "${SIN_RUST:-0}" != "1" ]; then
  echo "App nativa (Rust, Mac, Windows y Linux)"; (cd escritorio && cargo test --quiet 2>&1 | grep -E "test result|error" | tail -3)
  if command -v xvfb-run >/dev/null && command -v dbus-run-session >/dev/null; then bash escritorio/pruebas/arranque.sh; fi
else
  echo "  (sin cargo: la app nativa se compila y se abre en GitHub, job «app»)"
fi
