#!/usr/bin/env python3
"""La IA del usuario (Claude Code, Codex o Gemini), con su propia cuenta. Solo biblioteca estándar.

Esquema nunca llama a una IA con una cuenta propia: arma el comando del CLI que la persona ya tiene instalado y le pasa el texto.
La IA corre en una carpeta temporal vacía, sin herramientas ni servidores MCP: solo ve lo que le mandamos y solo responde texto.

Uso: ia.py probar <ia> <salida.json>   → {ia, ok, error?}
"""
import os
import shutil
import subprocess
import sys
import tempfile

import comun

HOME = os.path.expanduser("~")


def _preparar_path():
    """La app no hereda el PATH de la terminal: agrega donde suelen quedar los CLI de IA (Mac, Linux y Windows)."""
    extra = [os.path.join(HOME, ".local", "bin"), os.path.join(HOME, ".claude", "local"), os.path.join(HOME, ".npm-global", "bin"),
             os.path.join(HOME, ".volta", "bin"), os.path.join(HOME, ".bun", "bin"), os.path.join(HOME, ".codex", "bin"),
             "/opt/homebrew/bin", "/usr/local/bin"]
    nvm = os.path.join(HOME, ".nvm", "versions", "node")
    if os.path.isdir(nvm):
        extra += [os.path.join(nvm, v, "bin") for v in sorted(os.listdir(nvm), reverse=True)]
    if os.name == "nt":
        extra += [os.path.join(os.environ.get("APPDATA", ""), "npm"), os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "claude")]
    os.environ["PATH"] = os.pathsep.join([os.environ.get("PATH", "")] + [d for d in extra if os.path.isdir(d)])


_preparar_path()

#: id → (comandos posibles, nombre visible). Gemini: Antigravity CLI (`agy`) o el Gemini CLI.
IAS = {"claude": (("claude",), "Claude"), "codex": (("codex",), "ChatGPT (Codex)"), "gemini": (("agy", "gemini"), "Gemini")}


def lista():
    return [{"id": k, "nombre": v[1], "instalada": any(shutil.which(c) for c in v[0])} for k, v in IAS.items()]


def elegida():
    ia = comun.config().get("ia")
    return ia if ia in IAS else "claude"


def nombre(ia=None):
    return IAS[ia or elegida()][1]


def _entorno():
    """La IA no recibe las variables de Esquema (rutas, recursos): solo lo necesario para correr."""
    return {k: v for k, v in os.environ.items() if not k.startswith("ESQUEMA_")}


#: Claude Code carga la memoria de la persona (CLAUDE.md, memoria automática, plugins) aunque corra sin herramientas, y con eso
#: rellenaba los diagramas con otros proyectos suyos. Esto lo apaga y mantiene su sesión (no exige una llave de API como --bare).
SIN_MEMORIA_CLAUDE = {"CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1", "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}
_ayuda = {}


def _soporta(comando, opcion):
    """Si el CLI conoce una opción (las versiones viejas fallan con opciones desconocidas). Se pregunta una vez por comando."""
    if comando not in _ayuda:
        try:
            r = subprocess.run([comando, "--help"], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", timeout=20)
            _ayuda[comando] = (r.stdout or "") + (r.stderr or "")
        except (OSError, subprocess.SubprocessError):
            _ayuda[comando] = ""
    return opcion in _ayuda[comando]


def ejecutar_ia(prompt, timeout=600, ia=None):
    ia = ia or elegida()
    comando = next((r for r in map(shutil.which, IAS[ia][0]) if r), IAS[ia][0][0])
    with tempfile.TemporaryDirectory(prefix="esquema-ia-") as tmp:
        if ia == "codex":
            salida = os.path.join(tmp, "respuesta.txt")
            cmd = [comando, "exec", "--skip-git-repo-check", "-s", "read-only", "-C", tmp, "-o", salida, "-"]
            r = subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp, env=_entorno())
            texto = open(salida, encoding="utf-8").read() if os.path.exists(salida) else ""
            return subprocess.CompletedProcess(cmd, r.returncode, texto, r.stderr)
        es_agy = os.path.basename(comando).lower().split(".")[0] in ("agy", "antigravity")
        if ia == "gemini" and es_agy:
            if len(prompt) < 20000:
                pedido = prompt
            else:
                with open(os.path.join(tmp, "instrucciones.md"), "w", encoding="utf-8") as f:
                    f.write(prompt)
                pedido = ("Lee el archivo instrucciones.md de esta carpeta y haz exactamente lo que pide. "
                          "Entrega solo el resultado pedido, sin comentarios. No modifiques ni crees archivos.")
            cmd = [comando, "--output-format", "text", "--sandbox", "--add-dir", tmp, "-p", pedido]
            return subprocess.run(cmd, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp, env=_entorno())
        if ia == "gemini":
            cmd = [comando, "-p", "Responde a las instrucciones de arriba. Entrega solo el resultado pedido.", "-o", "text"]
        else:
            # Sin herramientas ni servidores MCP: la IA solo responde texto, no puede leer ni cambiar nada. Y sin la memoria de la
            # persona: solo ve lo que Esquema le manda (lo que muestra «Ver lo que se envía»).
            cmd = [comando, "-p", "--output-format", "text", "--disallowedTools", "*", "--strict-mcp-config"]
            if _soporta(comando, "--safe-mode"):
                cmd.append("--safe-mode")
            return subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp, env={**_entorno(), **SIN_MEMORIA_CLAUDE})
        return subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp, env=_entorno())


def preguntar(prompt, timeout=600, ia=None):
    """Devuelve (texto, error). El error es un mensaje para la persona, con el nombre de su IA."""
    try:
        r = ejecutar_ia(prompt, timeout, ia)
    except FileNotFoundError:
        return "", f"No encontré {nombre(ia)} en este computador. Revisa en Ajustes → Tu IA."
    except subprocess.TimeoutExpired:
        return "", f"{nombre(ia)} se demoró demasiado en responder. Inténtalo de nuevo."
    if r.returncode != 0 or not (r.stdout or "").strip():
        detalle = (r.stderr or "").strip().splitlines()[-1:] or [""]
        return "", f"{nombre(ia)} no respondió. {detalle[0]}".strip()
    return r.stdout, ""


def probar(ia):
    if ia not in IAS:
        return {"ia": ia, "ok": False, "error": "No conozco esa IA."}
    texto, error = preguntar("Responde solo con la palabra: listo", timeout=120, ia=ia)
    if error:
        return {"ia": ia, "ok": False, "error": error}
    return {"ia": ia, "ok": True}


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "probar":
        comun.responder(sys.argv[3], probar(sys.argv[2]))
        sys.exit(0)
    print(__doc__)
    sys.exit(2)
