#!/usr/bin/env python3
"""IA falsa para las pruebas: se instala como `claude` en un PATH temporal. Nunca se llama a una IA de verdad.
Responde según lo que le piden (lee el prompt por la entrada estándar) y deja en IA_FALSA_REGISTRO lo que recibió y con qué
argumentos, para que las pruebas revisen que corre sin herramientas ni MCP."""
import json
import os
import sys
import time

if sys.argv[1:] == ["--help"]:
    print("Usage: claude [options]\n  --safe-mode   Start with all customizations disabled\n  --output-format <format>  text, json or stream-json")
    sys.exit(0)
prompt = sys.stdin.read()
registro = os.environ.get("IA_FALSA_REGISTRO")
if registro:
    with open(registro, "a", encoding="utf-8") as f:
        f.write(json.dumps({"args": sys.argv[1:], "prompt": prompt, "cwd": os.getcwd(), "entorno": sorted(k for k in os.environ if k.startswith("ESQUEMA_")),
                            "sin_memoria": sorted(k for k in os.environ if k.startswith("CLAUDE_CODE_DISABLE_"))}) + "\n")
modo = os.environ.get("IA_FALSA_MODO", "")
if modo == "falla":
    print("se cayó", file=sys.stderr)
    sys.exit(1)
flujo = "stream-json" in sys.argv
# Documentar por etapas (bin/documentar.py): primero un plan en JSON, después cada documento por separado.
if "arma un PLAN" in prompt:
    lento = float(os.environ.get("IA_FALSA_LENTO") or 0)
    if flujo:
        # Lo que cuenta Claude Code con --output-format stream-json --verbose: lo que va leyendo y, al final, la respuesta.
        print(json.dumps({"type": "system", "subtype": "init", "tools": ["Read", "Glob", "Grep"]}), flush=True)
        print(json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Glob", "input": {"pattern": "**/*.py"}}]}}), flush=True)
        for r in ("README.md", "src/grabar.py", "../afuera.txt"):
            print(json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "Leo."}, {"type": "tool_use", "name": "Read", "input": {"file_path": os.path.join(os.getcwd(), r)}}]}}), flush=True)
            if lento:
                time.sleep(lento)
        print("esto no es json", flush=True)
    if modo == "plan-basura":
        plan = "No sé armar un plan."
    else:
        plan = "Este es el plan:\n```json\n" + json.dumps({"tipo": "app", "resumen": "Notas de reuniones.", "componentes": [],
            "elementos": [{"id": "boton-grabar", "tipo": "boton", "nombre": "Grabar", "codigo": ["src/grabar.py", "../afuera"]}, {"id": "Malo Id", "tipo": "boton", "nombre": "x"}],
            "documentos": [{"ruta": "flujos/Grabar Reunion.md", "titulo": "Grabar una reunión", "tipo": "flujo", "que": "Cómo se graba.", "archivos": ["src/grabar.py", ".env", "../x"]},
                           {"ruta": "vision.md", "titulo": "Visión general", "tipo": "vision", "que": "Qué es.", "archivos": ["README.md"]},
                           {"ruta": "../fuera.md", "titulo": "x", "tipo": "otro"},
                           {"ruta": "arquitectura.md", "titulo": "Arquitectura", "tipo": "arquitectura", "que": "Partes.", "archivos": []}]}, ensure_ascii=False) + "\n```"
    if flujo:
        print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": plan}), flush=True)
    else:
        print(plan)
    sys.exit(0)
if "SOLO el documento «" in prompt:
    ruta = prompt.split("SOLO el documento «", 1)[1].split("»", 1)[0]
    titulo = prompt.split("titulado «", 1)[1].split("»", 1)[0]
    if ruta == os.environ.get("IA_FALSA_FALLA_DOC"):
        print("se cayó escribiendo " + ruta, file=sys.stderr)
        sys.exit(1)
    if os.environ.get("IA_FALSA_LENTO"):
        time.sleep(float(os.environ["IA_FALSA_LENTO"]))
    nivel = "../" * ruta.count("/")
    texto = (f"Aquí va:\n# Otro título\n\nToca [Grabar]({nivel}elementos.md#el-boton-grabar) y [Fantasma]({nivel}elementos.md#el-no-existe).\n\n"
             "```mermaid\n%%{init: {}}%%\nflowchart TD\n    G[Grabar] --> F[Fantasma]\n%% esquema: {\"refs\":{\"F\":\"no-existe\",\"G\":\"boton-grabar\"}}\n```\n")
    if flujo:
        print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": texto}), flush=True)
    else:
        print(texto)
    sys.exit(0)
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
