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
if "Responde solo con la palabra" in prompt:
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
