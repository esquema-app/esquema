#!/bin/bash
# Todas las pruebas (las mismas que corre GitHub en cada cambio).
# Uso: bash pruebas/correr.sh            (la interfaz necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
#      bash pruebas/correr.sh sintaxis   (solo la sintaxis)
set -eo pipefail
cd "$(dirname "$0")/.."
echo "Sintaxis"
for f in ui/app.js ui/motor/*.js; do node --check "$f"; done
for f in pruebas/*.mjs herramientas/*.mjs; do node --check "$f"; done
python3 -m py_compile bin/*.py pruebas/*.py herramientas/*.py ejemplos/*.py
python3 -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('ui/idiomas/*.json') + glob.glob('plantillas/*/*.json') + ['ui/demo.json', 'pruebas/casos.json', 'pruebas/puente.json']]"
for f in herramientas/*.sh pruebas/*.sh; do bash -n "$f"; done
[ "$1" = "sintaxis" ] && exit 0
echo "Privacidad"; bash herramientas/revisar_privacidad.sh --generico
if [ -s .terminos-privados ]; then bash herramientas/revisar_privacidad.sh --todo; fi
echo "Contrato"; python3 pruebas/contrato.py
echo "Motor"; node pruebas/motor.mjs | tail -2
echo "Python"; python3 pruebas/test_python.py 2>&1 | tail -3
echo "Interfaz"; node pruebas/interfaz.mjs
