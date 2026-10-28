#!/bin/bash
# Todas las pruebas (las mismas que corre GitHub en cada cambio).
# Uso: bash pruebas/correr.sh            (la interfaz necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
#      La app de Windows/Linux se prueba abierta de verdad si hay Xvfb y Electron (cd escritorio && npm ci && node node_modules/electron/install.js).
#      bash pruebas/correr.sh sintaxis   (solo la sintaxis)
set -eo pipefail
cd "$(dirname "$0")/.."
echo "Sintaxis"
for f in ui/app.js ui/proyectos.js ui/motor/*.js docs/pagina.js; do node --check "$f"; done
for f in pruebas/*.mjs herramientas/*.mjs escritorio/src/*.js escritorio/pruebas/*.mjs; do node --check "$f"; done
python3 -m py_compile bin/*.py pruebas/*.py herramientas/*.py ejemplos/*.py
python3 -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('ui/idiomas/*.json') + glob.glob('plantillas/*/*.json') + glob.glob('ejemplos/catalogo-ejemplo/plantillas/*/*.json') + ['ui/demo.json', 'pruebas/casos.json', 'pruebas/puente.json']]"
for f in herramientas/*.sh pruebas/*.sh escritorio/herramientas/*.sh build.sh instalar.sh; do bash -n "$f"; done
python3 -c "import json, plistlib; json.load(open('escritorio/package.json')); plistlib.load(open('app/Info.plist', 'rb'))"
[ "$1" = "sintaxis" ] && exit 0
echo "Privacidad"; bash herramientas/revisar_privacidad.sh --generico
if [ -s .terminos-privados ]; then bash herramientas/revisar_privacidad.sh --todo; fi
echo "Contrato"; python3 pruebas/contrato.py
echo "Motor"; node pruebas/motor.mjs | tail -2
echo "Python"; python3 pruebas/test_python.py 2>&1 | tail -3
echo "Interfaz"; node pruebas/interfaz.mjs
echo "Escritorio (Windows y Linux)"; node escritorio/pruebas/vigilante.mjs; node escritorio/pruebas/catalogo.mjs
if command -v xvfb-run >/dev/null && [ -x escritorio/node_modules/electron/dist/electron ]; then
  PW="${PLAYWRIGHT:-}"; NODE_PATH="${PW:+$(dirname "$PW")}${NODE_PATH:+:$NODE_PATH}" xvfb-run -a node escritorio/pruebas/arranque.mjs | tail -1
else
  echo "  (sin Xvfb o sin Electron: la app abierta de verdad se prueba en GitHub, job «escritorio»)"
fi
