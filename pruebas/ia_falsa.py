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


def responder(texto):
    if flujo:
        print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": texto}), flush=True)
    else:
        print(texto)
    sys.exit(0)


def entre(texto, a, b):
    return texto.split(a, 1)[1].split(b, 1)[0] if a in texto else ""


# Historias de usuario (bin/historias.py): ronda 1 pregunta 3 cosas, ronda 2 una, ronda 3 nada.
if "ENTENDER una historia de usuario" in prompt:
    ronda = int(entre(prompt, "Ronda: ", ".") or 1)
    if flujo and "--add-dir" in sys.argv:
        print(json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", "input": {"file_path": os.path.join(os.getcwd(), "src/grabar.py")}}]}}), flush=True)
    preguntas = [{"pregunta": "¿Cuántas cuotas como máximo?", "porque": "Cambia los criterios de aceptación.", "opciones": ["3", "6", "12"]},
                 {"pregunta": "¿Se cobra interés?", "porque": "Afecta el total que ve el cliente."},
                 {"pregunta": "¿Qué pasa si falla el pago de una cuota?", "porque": "Es un caso borde.", "opciones": ["Se reintenta", "Se avisa"]}][:3 if ronda == 1 else 1 if ronda == 2 else 0]
    decidido = entre(prompt, "<decisiones>\n", "\n</decisiones>")
    tipo = "libro" if modo == "tipo-libro" else "historia"
    responder(f"===TIPO===\n{tipo}\n===FIN===\n===TITULO===\nPagar en cuotas\n===FIN===\n===DOCUMENTO===\n# Algo\n## Resumen\nEl cliente quiere pagar en cuotas. Ronda {ronda}.\n"
              f"{('Decidido: ' + decidido.replace(chr(10), ' ')) if decidido else ''}\n## Qué partes del proyecto toca\n[Grabar](../elementos.md#el-boton-grabar) y [Fantasma](../elementos.md#el-no-existe).\n"
              "## Cómo debería funcionar\n```mermaid\nsequenceDiagram\n    participant C as Cliente\n    participant A as API\n    C->>A: Pagar en cuotas\n```\n"
              "## Preguntas abiertas\nEsto lo quita Esquema.\n===FIN===\n===PREGUNTAS===\n" + json.dumps(preguntas, ensure_ascii=False) + "\n===FIN===")
if "se terminó de desarrollar" in prompt:
    responder("===COMO_QUEDO===\nSe agregó el pago en cuotas en `src/grabar.py`.\n\n- ✅ Dado un cliente, cuando paga en cuotas, entonces ve el total.\n===FIN===\n"
              '===ARCHIVO ruta="arquitectura.md" titulo="Arquitectura" tipo="arquitectura"===\n# Arquitectura\n\nAhora con cuotas.\n===FIN===\n'
              '===ARCHIVO ruta="historias/hu-42-x.md" titulo="x" tipo="otro"===\n# no\n===FIN===\n'
              "===NOTA===\nPuse al día la arquitectura.\n===FIN===")
if "La persona agregó a su proyecto" in prompt:
    responder("===TIPO===\ndocumento\n===FIN===\n===DOCUMENTO===\n# X\n## Resumen\nUn documento de prueba bastante claro.\n## Diagrama\n```mermaid\nflowchart TD\n    A[Inicio] --> B[Fin]\n```\n===FIN===")
if "Resume, en" in prompt and "<capitulo>" in prompt:
    n = entre(prompt, "el capítulo ", " ")
    responder(f"===DOCUMENTO===\n## Resumen\nEl capítulo {n} cuenta algo sobre [Marta](../elementos.md#el-marta) y el faro.\n## Citas\n«Texto del capítulo»\n===FIN===\n"
              '===ELEMENTOS===\n[{"id": "marta", "tipo": "personaje", "nombre": "Marta", "descripcion": "La guardiana."}, {"id": "Malo", "tipo": "x", "nombre": ""}]\n===FIN===')
if "Estos son los resúmenes de todos los capítulos" in prompt:
    responder("===README===\n## De qué trata\nDe un faro y de Marta.\n## Ideas principales\n- Cuidar la luz.\n===FIN===\n"
              '===MAPA===\n```mermaid\nflowchart LR\n    M[Marta] --> F[Faro]\n%% esquema: {"refs":{"M":"marta"}}\n```\nMarta cuida el faro.\n===FIN===\n===LINEA===\nNO APLICA\n===FIN===')
if "Arma, en" in prompt and "material para estudiar" in prompt:
    responder("===DOCUMENTO===\n## Esquema\n- Idea\n## Preguntas de repaso\n**P:** ¿Quién cuida el faro?\n\n**R:** Marta.\n## Tarjetas\n| Frente | Reverso |\n|---|---|\n| Faro | Luz |\n===FIN===")
if "hechos verificables" in prompt:
    cap = entre(prompt, "<capitulo>\n", "\n</capitulo>")
    cita = " ".join(cap.split()[:5])
    n = entre(prompt, "el capítulo ", " ")
    responder("===HECHOS===\n" + json.dumps([{"tipo": "fecha", "hecho": f"Marta tiene {30 + int(n)} años", "cita": cita, "seccion": ""}], ensure_ascii=False) + "\n===FIN===")
if "Busca, en" in prompt and "incongruencias" in prompt:
    hechos = [json.loads(l) for l in entre(prompt, "<hechos>\n", "\n</hechos>").split("\n") if l.strip()]
    citas = [{"capitulo": h["capitulo"], "seccion": "", "cita": h["cita"]} for h in hechos[:2]] + [{"capitulo": 1, "cita": "esto no está en el libro"}, {"capitulo": 99, "cita": "x"}]
    responder("===HALLAZGOS===\n" + json.dumps([{"tipo": "fecha", "descripcion": "La edad de Marta no calza entre capítulos.", "gravedad": "alta", "citas": citas},
                                                 {"tipo": "raro", "descripcion": "Sin citas", "citas": []}], ensure_ascii=False) + "\n===FIN===")
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
