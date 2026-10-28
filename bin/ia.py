#!/usr/bin/env python3
"""La IA del usuario (Claude Code, Codex o Gemini), con su propia cuenta. Solo biblioteca estándar.

Esquema nunca llama a una IA con una cuenta propia: arma el comando del CLI que la persona ya tiene instalado y le pasa el texto.
La IA corre en una carpeta temporal vacía, sin herramientas ni servidores MCP: solo ve lo que le mandamos y solo responde texto.

Uso: ia.py probar <ia> <salida.json>   → {ia, ok, error?}
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time

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


def _soporta(comando, opcion, sub=()):
    """Si el CLI conoce una opción (las versiones viejas fallan con opciones desconocidas). Se pregunta una vez por comando."""
    clave = (comando, *sub)
    if clave not in _ayuda:
        try:
            r = subprocess.run([comando, *sub, "--help"], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", timeout=20)
            _ayuda[clave] = (r.stdout or "") + (r.stderr or "")
        except (OSError, subprocess.SubprocessError):
            _ayuda[clave] = ""
    return opcion in _ayuda[clave]


def puede_leer(ia=None):
    """Si la IA elegida sabe leer una carpeta con permisos de solo lectura (revisión a fondo)."""
    ia = ia or elegida()
    if ia != "gemini":
        return True
    comando = next((r for r in map(shutil.which, IAS[ia][0]) if r), "")
    return os.path.basename(comando).lower().split(".")[0] in ("agy", "antigravity")


def _sin_secretos(no_leer):
    """Reglas de Claude Code para no abrir secretos en una revisión a fondo."""
    reglas = []
    for patron in no_leer:
        p = patron.rstrip("/") + ("/**" if patron.endswith("/") else "")
        reglas += [f"Read(**/{p})", f"Read(./{p})"]
    return reglas


#: Lo que la IA nunca puede usar en una revisión a fondo (solo leer). Solo herramientas que Claude Code conoce: una regla que no
#: calza con ninguna se avisa en cada corrida.
PROHIBIDAS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task"]


def _comando(prompt, ia, leer, no_leer, tmp, vivo=False):
    """Cómo correr la IA: {cmd, entrada, cwd, env, salida, formato}. `vivo`: que cuente lo que va haciendo (stream-json en Claude,
    --json en Codex), si el CLI lo sabe. `formato`: "texto", "claude-json" o "codex-json"."""
    comando = next((r for r in map(shutil.which, IAS[ia][0]) if r), IAS[ia][0][0])
    if ia == "codex":
        salida = os.path.join(tmp, "respuesta.txt")
        json_ = vivo and _soporta(comando, "--json", ("exec",))
        cmd = [comando, "exec", "--skip-git-repo-check", "-s", "read-only", "-C", leer or tmp, "-o", salida, *(["--json"] if json_ else []), "-"]
        return {"cmd": cmd, "entrada": prompt, "cwd": leer or tmp, "env": _entorno(), "salida": salida, "formato": "codex-json" if json_ else "texto"}
    es_agy = os.path.basename(comando).lower().split(".")[0] in ("agy", "antigravity")
    if ia == "gemini" and es_agy:
        if len(prompt) < 20000:
            pedido = prompt
        else:
            with open(os.path.join(tmp, "instrucciones.md"), "w", encoding="utf-8") as f:
                f.write(prompt)
            pedido = ("Lee el archivo instrucciones.md de esta carpeta y haz exactamente lo que pide. "
                      "Entrega solo el resultado pedido, sin comentarios. No modifiques ni crees archivos.")
        cmd = [comando, "--output-format", "text", "--sandbox", "--add-dir", tmp, *(["--add-dir", leer] if leer else []), "-p", pedido]
        return {"cmd": cmd, "entrada": None, "cwd": leer or tmp, "env": _entorno(), "salida": None, "formato": "texto"}
    if ia == "gemini":
        cmd = [comando, "-p", "Responde a las instrucciones de arriba. Entrega solo el resultado pedido.", "-o", "text"]
        return {"cmd": cmd, "entrada": prompt, "cwd": tmp, "env": _entorno(), "salida": None, "formato": "texto"}
    # Sin herramientas ni servidores MCP: la IA solo responde texto, no puede leer ni cambiar nada. Y sin la memoria de la
    # persona: solo ve lo que Esquema le manda (lo que muestra «Ver lo que se envía»).
    flujo = vivo and _soporta(comando, "stream-json")
    cmd = [comando, "-p", "--output-format", *(["stream-json", "--verbose"] if flujo else ["text"]), "--strict-mcp-config"]
    if leer:
        # Revisión a fondo: solo leer (Read, Glob, Grep) dentro de la carpeta del código; nada que escriba, ejecute o salga a
        # internet, y nunca los secretos.
        cmd += ["--add-dir", leer, "--allowedTools", "Read,Glob,Grep", "--disallowedTools", ",".join(PROHIBIDAS + _sin_secretos(no_leer))]
    else:
        cmd += ["--disallowedTools", "*"]
    if _soporta(comando, "--safe-mode"):
        cmd.append("--safe-mode")
    return {"cmd": cmd, "entrada": prompt, "cwd": leer or tmp, "env": {**_entorno(), **SIN_MEMORIA_CLAUDE}, "salida": None,
            "formato": "claude-json" if flujo else "texto"}


def ejecutar_ia(prompt, timeout=600, ia=None, leer=None, no_leer=()):
    """Corre la IA con el prompt. Con `leer` (una carpeta), la IA puede LEER esa carpeta (revisión a fondo): solo leer, nunca
    escribir ni ejecutar, y nunca lo de `no_leer`. Sin `leer`, corre en una carpeta temporal vacía y sin herramientas."""
    ia = ia or elegida()
    if leer and not (os.path.isdir(leer) and puede_leer(ia)):
        leer = None
    with tempfile.TemporaryDirectory(prefix="esquema-ia-") as tmp:
        c = _comando(prompt, ia, leer, no_leer, tmp)
        r = subprocess.run(c["cmd"], input=c["entrada"], stdin=subprocess.DEVNULL if c["entrada"] is None else None, text=True,
                           encoding="utf-8", capture_output=True, timeout=timeout, cwd=c["cwd"], env=c["env"])
        if c["salida"]:
            texto = open(c["salida"], encoding="utf-8").read() if os.path.exists(c["salida"]) else ""
            return subprocess.CompletedProcess(c["cmd"], r.returncode, texto, r.stderr)
        return r


def preguntar(prompt, timeout=600, ia=None, leer=None, no_leer=()):
    """Devuelve (texto, error). El error es un mensaje para la persona, con el nombre de su IA."""
    try:
        r = ejecutar_ia(prompt, timeout, ia, leer=leer, no_leer=no_leer)
    except FileNotFoundError:
        return "", f"No encontré {nombre(ia)} en este computador. Revisa en Ajustes → Tu IA."
    except subprocess.TimeoutExpired:
        return "", f"{nombre(ia)} se demoró demasiado en responder. Inténtalo de nuevo."
    if r.returncode != 0 or not (r.stdout or "").strip():
        detalle = (r.stderr or "").strip().splitlines()[-1:] or [""]
        return "", f"{nombre(ia)} no respondió. {detalle[0]}".strip()
    return r.stdout, ""


def _evento_claude(linea, al_evento):
    """Una línea de `claude -p --output-format stream-json --verbose`: lo que lee (Read/Glob/Grep) va a `al_evento`; la línea final
    {"type": "result"} trae la respuesta. Devuelve (texto, es_error) si es la final; si no, None."""
    try:
        x = json.loads(linea)
    except ValueError:
        return None
    if not isinstance(x, dict):
        return None
    if x.get("type") == "result":
        return str(x.get("result") or ""), bool(x.get("is_error"))
    if x.get("type") == "assistant" and isinstance(x.get("message"), dict):
        for c in x["message"].get("content") or []:
            if isinstance(c, dict) and c.get("type") == "tool_use" and isinstance(c.get("input"), dict):
                h, e = str(c.get("name") or ""), c["input"]
                if h == "Read" and isinstance(e.get("file_path"), str):
                    al_evento({"t": "lee", "ruta": e["file_path"]})
                elif h in ("Glob", "Grep") and isinstance(e.get("pattern"), str):
                    al_evento({"t": "busca", "patron": e["pattern"][:200], **({"ruta": e["path"]} if isinstance(e.get("path"), str) else {})})
    return None


#: Comandos de lectura que Codex corre (en su sandbox de solo lectura): de ahí se deduce qué archivo mira.
_LEE_CODEX = ("cat", "sed", "head", "tail", "nl", "less", "bat", "wc")
_BUSCA_CODEX = ("rg", "grep", "find", "ls", "fd", "git")


def _evento_codex(linea, al_evento):
    """Una línea de `codex exec --json` (JSONL). Los formatos cambian entre versiones: se busca un comando en lo que venga y, si es
    de lectura, el último argumento que parece una ruta. La respuesta viene en el archivo de -o."""
    try:
        x = json.loads(linea)
    except ValueError:
        return
    if not isinstance(x, dict):
        return
    item = x.get("item") if isinstance(x.get("item"), dict) else x.get("msg") if isinstance(x.get("msg"), dict) else x
    if str(x.get("type") or item.get("type") or "") in ("item.completed", "exec_command_end"):
        return
    cmd = item.get("command")
    if isinstance(cmd, list):
        partes = [str(p) for p in cmd]
    elif isinstance(cmd, str):
        partes = cmd.split()
    else:
        return
    # «bash -lc 'cat src/a.py'» → lo de adentro
    if len(partes) >= 3 and os.path.basename(partes[0]) in ("bash", "sh", "zsh") and partes[1] in ("-lc", "-c"):
        partes = " ".join(partes[2:]).strip("'\"").split()
    if not partes:
        return
    prog = os.path.basename(partes[0])
    rutas = [x.strip("'\"") for x in partes[1:] if not x.startswith("-") and ("/" in x or "." in x)]
    if prog in _LEE_CODEX and rutas:
        al_evento({"t": "lee", "ruta": rutas[-1]})
    elif prog in _BUSCA_CODEX:
        al_evento({"t": "busca", "patron": " ".join(partes[1:])[:200]})


def preguntar_vivo(prompt, timeout=600, ia=None, leer=None, no_leer=(), al_evento=None, detener=None):
    """Como `preguntar`, pero cuenta lo que la IA va haciendo: `al_evento({"t": "lee" | "busca", …})` por cada archivo que lee o
    búsqueda que hace (Claude con stream-json; Codex con --json; Gemini, nada). `detener()`: si devuelve True, se corta la IA.
    Devuelve (texto, error); error es "detenido" si se detuvo."""
    ia = ia or elegida()
    al_evento = al_evento or (lambda e: None)
    if leer and not (os.path.isdir(leer) and puede_leer(ia)):
        leer = None
    with tempfile.TemporaryDirectory(prefix="esquema-ia-") as tmp:
        try:
            c = _comando(prompt, ia, leer, no_leer, tmp, vivo=True)
            p = subprocess.Popen(c["cmd"], stdin=subprocess.PIPE if c["entrada"] is not None else subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, cwd=c["cwd"], env=c["env"])
        except FileNotFoundError:
            return "", f"No encontré {nombre(ia)} en este computador. Revisa en Ajustes → Tu IA."
        except OSError as ex:
            return "", f"{nombre(ia)} no pudo empezar: {ex}"
        err = []
        lineas = []
        final = [None]

        def escribir_entrada():
            try:
                if c["entrada"] is not None:
                    p.stdin.write(c["entrada"].encode("utf-8"))
                    p.stdin.close()
            except OSError:
                pass

        def leer_salida():
            for crudo in iter(p.stdout.readline, b""):
                linea = crudo.decode("utf-8", "replace")
                if c["formato"] == "claude-json":
                    r = _evento_claude(linea, al_evento)
                    if r is not None:
                        final[0] = r
                else:
                    if c["formato"] == "codex-json":
                        _evento_codex(linea, al_evento)
                    if len(lineas) < 200_000:
                        lineas.append(linea)

        def leer_error():
            for crudo in iter(p.stderr.readline, b""):
                if len(err) < 400:
                    err.append(crudo.decode("utf-8", "replace"))

        hilos = [threading.Thread(target=f, daemon=True) for f in (escribir_entrada, leer_salida, leer_error)]
        for h in hilos:
            h.start()
        limite = time.monotonic() + timeout
        motivo = None
        while p.poll() is None:
            if detener and detener():
                motivo = "detenido"
            elif time.monotonic() > limite:
                motivo = "tiempo"
            if motivo:
                p.terminate()
                try:
                    p.wait(5)
                except subprocess.TimeoutExpired:
                    p.kill()
                break
            time.sleep(0.25)
        p.wait()
        for h in hilos[1:]:
            h.join(5)
        if motivo == "detenido":
            return "", "detenido"
        if motivo == "tiempo":
            return "", f"{nombre(ia)} se demoró más de {round(timeout / 60)} minutos y la detuve."
        if c["formato"] == "claude-json":
            texto, es_error = final[0] if final[0] else ("", True)
            if es_error and not texto:
                texto = ""
        elif c["salida"]:
            texto, es_error = (open(c["salida"], encoding="utf-8").read() if os.path.exists(c["salida"]) else ""), False
        else:
            texto, es_error = "".join(lineas), False
        if p.returncode != 0 or es_error or not texto.strip():
            # La última línea de error que diga algo (el aviso de reglas de permisos no explica nada).
            utiles = [l.strip() for l in err if l.strip() and "Permission deny rule" not in l]
            detalle = (texto.strip()[:300] if es_error and texto.strip() else "") or (utiles[-1][:300] if utiles else "")
            return "", f"{nombre(ia)} no respondió. {detalle}".strip()
        return texto, ""


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
