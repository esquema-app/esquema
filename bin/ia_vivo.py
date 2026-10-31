"""Lo propio de Esquema sobre la pieza «ia»: correr la IA de la persona contando lo que va haciendo. Solo biblioteca estándar.

Los trabajos largos (documentar por etapas, historias, libros, «Agregar información») necesitan dos cosas que la pieza no trae:
ver en vivo qué archivo lee la IA (Claude con `--output-format stream-json`, Codex con `--json`; Gemini no lo cuenta) y poder
detenerla. Todo lo demás es de la pieza y se usa tal cual: qué comando, el entorno sin las variables de la app, `_soporta`, lo
prohibido, los secretos, la memoria apagada y la carpeta temporal (la IA nunca corre dentro del código: su CLI cargaría la
configuración y los hooks de ese repo). Si la pieza llega a traer esto, este módulo se va y los trabajos usan la pieza.

Errores con la misma forma que la pieza: None o {"codigo", "plantilla", "valores"} (la plantilla es la frase en español, clave
de traducción). `frase(error)` la da en español. El código «detenido» no es una falla: la persona apretó «Detener».
"""
import json
import os
import subprocess
import tempfile
import threading
import time

import ia
import nucleo

#: Los errores propios de este módulo; los demás son los de la pieza (`ia.ERRORES`).
ERRORES = {**ia.ERRORES, "detenido": "Detuviste a {ia}."}

_ayuda_exec = {}  # (ruta, mtime, tamaño) → texto de `codex exec --help`


def _error(codigo, ia_, detalle=""):
    return {"codigo": codigo, "plantilla": ERRORES[codigo], "valores": {"ia": ia.nombre(ia_), "detalle": detalle, "app": nucleo.app()["nombre"]}}


def detenido(error):
    """Si el error es que la persona detuvo el trabajo (no es una falla)."""
    return isinstance(error, dict) and error.get("codigo") == "detenido"


def frase(error):
    """El error en español (para guardarlo en un trabajo o en un registro); la interfaz lo traduce con plantilla y valores."""
    if not error:
        return ""
    texto = error.get("plantilla") or ERRORES.get(error.get("codigo"), "")
    for k, v in (error.get("valores") or {}).items():
        texto = texto.replace("{" + k + "}", str(v))
    return texto.strip()


def _codex_json(cmd0):
    """Si `codex exec` conoce --json (versiones viejas no): se pregunta una vez por versión del comando."""
    try:
        st = os.stat(cmd0)
        clave = (cmd0, st.st_mtime_ns, st.st_size)
    except OSError:
        clave = (cmd0, 0, 0)
    if clave not in _ayuda_exec:
        try:
            r = subprocess.run([cmd0, "exec", "--help"], stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=20, env=ia._entorno())
            _ayuda_exec[clave] = (r.stdout or "") + (r.stderr or "")
        except (OSError, subprocess.SubprocessError):
            _ayuda_exec[clave] = ""
    return "--json" in _ayuda_exec[clave].split()


def _comando(prompt, ia_, leer, no_leer, tmp):
    """Cómo correr la IA: {cmd, entrada, env, salida, formato}, con las mismas protecciones que `ia.ejecutar`. `formato`: "texto",
    "claude-json" o "codex-json" (si el CLI sabe contar lo que hace)."""
    cmd0 = ia.comando(ia_)
    if not cmd0:
        raise FileNotFoundError(ia.IAS[ia_][0][0])
    entorno = ia._entorno()
    if leer:
        prompt = f"La carpeta que puedes leer (solo leer) está en: {leer}\n\n" + prompt
    if ia_ == "codex":
        salida = os.path.join(tmp, "respuesta.txt")
        json_ = _codex_json(cmd0)
        cmd = [cmd0, "exec", "--skip-git-repo-check", "-s", "read-only", "-C", tmp, "-o", salida, *(["--json"] if json_ else []), "-"]
        return {"cmd": cmd, "entrada": prompt, "env": entorno, "salida": salida, "formato": "codex-json" if json_ else "texto"}
    if ia_ == "gemini" and ia._es_agy(cmd0):
        # Antigravity no lee la entrada estándar: el pedido va SIEMPRE en un archivo; en -p solo va una frase fija.
        with open(os.path.join(tmp, "instrucciones.md"), "w", encoding="utf-8") as f:
            f.write(prompt)
        cmd = [cmd0, "--output-format", "text", "--sandbox", "--add-dir", tmp, *(["--add-dir", leer] if leer else []), "-p", ia.INSTRUCCION_ARCHIVO]
        return {"cmd": cmd, "entrada": None, "env": entorno, "salida": None, "formato": "texto"}
    if ia_ == "gemini":
        cmd = [cmd0, "-p", "Responde a las instrucciones de arriba. Entrega solo el resultado pedido.", "-o", "text"]
        return {"cmd": cmd, "entrada": prompt, "env": entorno, "salida": None, "formato": "texto"}
    # Claude Code: igual que la pieza (sin MCP, sin memoria, sin herramientas o solo leer), más stream-json si lo conoce.
    for obligatoria in ("--strict-mcp-config", "--disallowedTools"):
        if not ia._soporta(cmd0, obligatoria) and ia._conoce_ayuda(cmd0):
            raise ia.VersionVieja(obligatoria)
    flujo = ia._soporta(cmd0, "stream-json")
    cmd = [cmd0, "-p", "--output-format", *(["stream-json", "--verbose"] if flujo else ["text"]), "--strict-mcp-config"]
    if leer:
        cmd += ["--add-dir", leer, "--allowedTools", "Read,Glob,Grep", "--disallowedTools", ",".join(ia.PROHIBIDO + ia._sin_secretos(no_leer))]
        if ia._soporta(cmd0, "--tools"):
            cmd += ["--tools", "Read,Glob,Grep"]
    else:
        cmd += ["--disallowedTools", "*"]
        if ia._soporta(cmd0, "--tools"):
            cmd += ["--tools", ""]
    if ia._soporta(cmd0, "--safe-mode"):
        cmd.append("--safe-mode")
    if ia._soporta(cmd0, "--setting-sources"):
        cmd += ["--setting-sources", "user"]
    return {"cmd": cmd, "entrada": prompt, "env": {**entorno, **ia.SIN_MEMORIA_CLAUDE}, "salida": None, "formato": "claude-json" if flujo else "texto"}


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


def preguntar_vivo(prompt, timeout=600, ia_=None, leer=None, no_leer=(), al_evento=None, detener=None):
    """Como `ia.preguntar`, pero cuenta lo que la IA va haciendo: `al_evento({"t": "lee" | "busca", …})` por cada archivo que lee o
    búsqueda que hace. `detener()`: si devuelve True, se corta la IA. Devuelve (texto, error) con error None o
    {codigo, plantilla, valores}; codigo "detenido" si se detuvo."""
    ia_ = ia_ or ia.elegida()
    al_evento = al_evento or (lambda e: None)
    if leer and not (os.path.isdir(leer) and ia.puede_leer(ia_)):
        leer = None
    with tempfile.TemporaryDirectory(prefix=f"{nucleo.app()['id']}-ia-") as tmp:
        try:
            c = _comando(prompt, ia_, leer, no_leer, tmp)
            p = subprocess.Popen(c["cmd"], stdin=subprocess.PIPE if c["entrada"] is not None else subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, cwd=tmp, env=c["env"])
        except FileNotFoundError:
            return "", _error("no_instalada", ia_)
        except ia.VersionVieja:
            return "", _error("actualizar", ia_)
        except OSError as ex:
            return "", _error("sin_respuesta", ia_, str(ex)[:300])
        err, lineas, final = [], [], [None]

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
                motivo = "demora"
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
        if motivo:
            return "", _error(motivo, ia_)
        if c["formato"] == "claude-json":
            texto, es_error = final[0] if final[0] else ("", True)
        elif c["salida"]:
            texto, es_error = (open(c["salida"], encoding="utf-8").read() if os.path.exists(c["salida"]) else ""), False
        else:
            texto, es_error = "".join(lineas), False
        if p.returncode != 0 or es_error or not texto.strip():
            # La última línea de error que diga algo (el aviso de reglas de permisos no explica nada).
            utiles = [l.strip() for l in err if l.strip() and "Permission deny rule" not in l]
            detalle = (texto.strip()[:300] if es_error and texto.strip() else "") or (utiles[-1][:300] if utiles else "")
            return "", _error("sin_respuesta" if detalle else "sin_respuesta_corta", ia_, detalle)
        return texto, None
