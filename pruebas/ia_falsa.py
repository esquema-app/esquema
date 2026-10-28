#!/usr/bin/env python3
"""IA falsa para las pruebas: se instala como `claude` en un PATH temporal. Nunca se llama a una IA de verdad.
Responde según lo que le piden (lee el prompt por la entrada estándar) y deja en IA_FALSA_REGISTRO lo que recibió y con qué
argumentos, para que las pruebas revisen que corre sin herramientas ni MCP."""
import json
import os
import sys

prompt = sys.stdin.read()
registro = os.environ.get("IA_FALSA_REGISTRO")
if registro:
    with open(registro, "a", encoding="utf-8") as f:
        f.write(json.dumps({"args": sys.argv[1:], "prompt": prompt, "cwd": os.getcwd(), "entorno": sorted(k for k in os.environ if k.startswith("ESQUEMA_"))}) + "\n")
modo = os.environ.get("IA_FALSA_MODO", "")
if modo == "falla":
    print("se cayó", file=sys.stderr)
    sys.exit(1)
if "===ARCHIVO" in prompt:
    # Proyectos (bin/proyecto.py): bloques con documentos, elementos, archivos pedidos y una nota. Trae a propósito cosas que
    # no deben pasar: una ruta fuera de la carpeta, el glosario (lo arma Esquema), un elemento inválido y configuración en un diagrama.
    if modo == "basura":
        print("No sé qué hacer.")
    elif modo == "pide":
        print("===PIDE===\nsrc/grabar.py\n../fuera.txt\n===FIN===\n===NOTA===\nNecesito ver cómo se graba.\n===FIN===")
    else:
        print('Aquí va:\n===ARCHIVO ruta="README.md" titulo="Visión general" tipo="vision"===\n# Minutero\n\nToca [Grabar](elementos.md#el-boton-grabar).\n===FIN===\n'
              '===ARCHIVO ruta="flujos/grabar.md" titulo="Grabar una reunión" tipo="flujo"===\n# Grabar\n\n```mermaid\n%%{init: {}}%%\nflowchart TD\n    G[Grabar] --> S[Guardar]\n    click G "https://x.cl"\n%% esquema: {"refs":{"G":"boton-grabar"}}\n```\n===FIN===\n'
              '===ARCHIVO ruta="../fuera.md" titulo="x" tipo="otro"===\n# x\n===FIN===\n'
              '===ARCHIVO ruta="elementos.md" titulo="x" tipo="glosario"===\n# x\n===FIN===\n'
              '===ELEMENTOS===\n[{"id": "boton-grabar", "tipo": "boton", "nombre": "Grabar", "codigo": ["src/grabar.py", "../afuera"]}, {"id": "Malo Id", "tipo": "boton", "nombre": "x"}]\n===FIN===\n'
              '===NOTA===\nListo.\n===FIN===')
elif "Responde solo con la palabra" in prompt:
    print("listo")
elif "README.md" in prompt:
    if modo == "basura":
        print("No sé.")
    else:
        print("```markdown\n# Proyecto\n\nHace algo útil.\n\n```mermaid\n%%{init: {\"theme\": \"dark\"}}%%\nflowchart LR\n    A[App] --> B[(Datos)]\n    click A \"https://x.cl\"\n```\n\n## Licencia\n\nAGPL-3.0\n```")
elif "Dibuja" in prompt:
    if modo == "basura":
        print("No puedo dibujar eso.")
    else:
        print("Claro, aquí va:\n```mermaid\nflowchart TD\n    A[Inicio] --> B{¿Listo?}\n    B -->|Sí| C([Fin])\n```")
else:
    print("?")
