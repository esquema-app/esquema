"""Lo común de los scripts de Esquema. Solo biblioteca estándar (igual en Mac, Windows y Linux).

Contrato con las apps: cada script recibe sus datos en argumentos simples o en un archivo JSON de entrada (nunca texto de la
persona como argumento) y deja su respuesta en el JSON de salida que va como último argumento.
"""
import fnmatch
import json
import os
import re
import sys
import tempfile

VERSION = "0.1.0"
EXTENSIONES = (".md", ".mmd")
MAXIMO_ARCHIVO = 2 * 1024 * 1024
RECURSOS = os.environ.get("ESQUEMA_RECURSOS") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Carpetas que nunca se recorren (pesadas o de herramientas) y nombres que nunca se mandan a la IA ni se muestran como estructura.
SIEMPRE_FUERA = {".git", "node_modules", ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".tox", "dist", "build",
                 ".next", ".nuxt", "target", ".gradle", ".idea", ".terraform", ".aws", ".ssh", ".gnupg", ".cache", "Pods", "DerivedData", ".build"}
SECRETOS = [".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "*.keystore", "*.jks", "id_rsa*", "id_dsa*", "id_ecdsa*", "id_ed25519*",
            "*.ppk", ".npmrc", ".pypirc", ".netrc", ".git-credentials", "credentials*", "*secret*", "*secreto*", "*.kdbx", "*.tfstate", "*.tfstate.*",
            "*.tfvars", "service-account*.json", "*token*", ".htpasswd", "*.sqlite", "*.db", "*.mobileprovision", "*.cer", "*.crt", "*.der"]
NO_SON_SECRETOS = {".env.example", ".env.sample", ".env.template"}


def carpeta_app():
    """Dónde guarda Esquema su configuración (nunca dentro de la carpeta de la persona)."""
    if os.environ.get("ESQUEMA_DATOS"):
        return os.environ["ESQUEMA_DATOS"]
    casa = os.path.expanduser("~")
    if sys.platform == "darwin":
        return os.path.join(casa, "Library", "Application Support", "Esquema")
    if os.name == "nt":
        return os.path.join(os.environ.get("APPDATA") or casa, "Esquema")
    return os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.join(casa, ".config"), "esquema")


def carpeta_privada(ruta):
    os.makedirs(ruta, exist_ok=True)
    try:
        os.chmod(ruta, 0o700)
    except OSError:
        pass
    return ruta


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir_atomico(ruta, texto, modo=None):
    """Escribe de una vez: un archivo temporal en la misma carpeta y después lo reemplaza (nunca queda a medias)."""
    carpeta = os.path.dirname(os.path.abspath(ruta))
    os.makedirs(carpeta, exist_ok=True)
    anterior = None
    try:
        anterior = os.stat(ruta).st_mode & 0o777
    except OSError:
        pass
    fd, tmp = tempfile.mkstemp(prefix=".esquema-", dir=carpeta)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(texto)
        os.chmod(tmp, modo if modo is not None else anterior if anterior is not None else 0o644)
        os.replace(tmp, ruta)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def escribir_json(ruta, datos):
    escribir_atomico(ruta, json.dumps(datos, ensure_ascii=False, indent=2) + "\n", 0o600)


def config():
    return leer_json(os.path.join(carpeta_app(), "config.json"), {}) or {}


CLAVES_CONFIG = {"idioma_ui": str, "ia": str, "bienvenida": bool, "tema": str, "carpeta": str}


def guardar_config(cambios):
    """Solo claves conocidas y del tipo correcto: lo que manda la interfaz se valida."""
    c = config()
    for k, v in (cambios or {}).items():
        if k in CLAVES_CONFIG and isinstance(v, CLAVES_CONFIG[k]):
            c[k] = v
    carpeta_privada(carpeta_app())
    escribir_json(os.path.join(carpeta_app(), "config.json"), c)
    return c


def ruta_en(carpeta, relativa, extensiones=EXTENSIONES):
    """La ruta absoluta de un archivo de la carpeta de la persona, o ValueError con un mensaje listo para mostrar.
    Solo rutas relativas, sin «..», con extensión .md/.mmd y que (siguiendo enlaces) queden dentro de la carpeta."""
    if not isinstance(relativa, str) or not relativa or len(relativa) > 400 or "\x00" in relativa:
        raise ValueError("Ese nombre de archivo no sirve.")
    if os.path.isabs(relativa) or relativa.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", relativa):
        raise ValueError("Ese nombre de archivo no sirve.")
    partes = re.split(r"[\\/]", relativa)
    if any(p in ("", ".", "..") for p in partes):
        raise ValueError("Ese nombre de archivo no sirve.")
    if extensiones and not relativa.lower().endswith(extensiones):
        raise ValueError("Esquema solo abre y guarda archivos .md y .mmd.")
    base = os.path.realpath(carpeta)
    ruta = os.path.realpath(os.path.join(base, *partes))
    if os.path.commonpath([base, ruta]) != base:
        raise ValueError("Ese archivo está fuera de la carpeta.")
    return ruta


# ───────────── .gitignore ─────────────
def _patron_a_regex(p):
    r, i = "", 0
    while i < len(p):
        c = p[i]
        if p.startswith("**/", i):
            r += "(?:.*/)?"; i += 3; continue
        if p.startswith("/**", i) and i + 3 == len(p):
            r += "/.*"; i += 3; continue
        if p.startswith("**", i):
            r += ".*"; i += 2; continue
        if c == "*":
            r += "[^/]*"
        elif c == "?":
            r += "[^/]"
        elif c == "[":
            j = p.find("]", i + 1)
            if j < 0:
                r += re.escape(c)
            else:
                clase = p[i + 1:j].replace("\\", "\\\\")
                if clase.startswith("!"):
                    clase = "^" + clase[1:]
                r += "[" + clase + "]"
                i = j
        elif c == "\\" and i + 1 < len(p):
            r += re.escape(p[i + 1]); i += 1
        else:
            r += re.escape(c)
        i += 1
    return r


class Ignorados:
    """Reglas de .gitignore (las de la raíz y las de cada subcarpeta): la última que calza gana; «!» vuelve a incluir."""

    def __init__(self):
        self.reglas = []  # (base, regex, negada, solo_carpeta)

    def cargar(self, base, ruta_gitignore):
        try:
            with open(ruta_gitignore, encoding="utf-8", errors="replace") as f:
                lineas = f.read().splitlines()
        except OSError:
            return
        for linea in lineas:
            l = linea.rstrip()
            if l.endswith("\\ "):
                l = l[:-2] + " "
            if not l.strip() or l.startswith("#"):
                continue
            negada = l.startswith("!")
            if negada:
                l = l[1:]
            if l.startswith("\\"):
                l = l[1:]
            solo = l.endswith("/")
            l = l.rstrip("/")
            if not l:
                continue
            anclada = "/" in l
            l = l.lstrip("/")
            rx = _patron_a_regex(l)
            rx = ("^" + rx + "$") if anclada else ("(?:^|/)" + rx + "$")
            self.reglas.append((base, re.compile(rx), negada, solo))

    def ignorado(self, relativa, es_carpeta):
        r = False
        for base, rx, negada, solo in self.reglas:
            if base and not (relativa == base or relativa.startswith(base + "/")):
                continue
            sub = relativa[len(base) + 1:] if base else relativa
            if solo and not es_carpeta:
                continue
            if rx.search(sub):
                r = not negada
        return r


def es_secreto(nombre):
    n = nombre.lower()
    if n in NO_SON_SECRETOS:
        return False
    return any(fnmatch.fnmatchcase(n, p) for p in SECRETOS)


def recorrer(carpeta, maximo=5000, profundidad=8, sin_secretos=True):
    """Rutas relativas (con «/») de los archivos de la carpeta, respetando .gitignore y sin secretos.
    Devuelve (rutas, omitidos): omitidos cuenta lo que quedó fuera por ser secreto o por pasar el máximo. La lista para la barra
    lateral (sin_secretos=False) sí muestra un documento propio llamado «secretos.md»; lo que va a la IA, nunca."""
    base = os.path.realpath(carpeta)
    ign = Ignorados()
    ign.cargar("", os.path.join(base, ".gitignore"))
    ign.cargar("", os.path.join(base, ".git", "info", "exclude"))
    rutas, omitidos = [], 0
    pila = [("", 0)]
    while pila:
        rel, nivel = pila.pop()
        absoluta = os.path.join(base, *rel.split("/")) if rel else base
        if rel and os.path.isfile(os.path.join(absoluta, ".gitignore")):
            ign.cargar(rel, os.path.join(absoluta, ".gitignore"))
        try:
            entradas = sorted(os.scandir(absoluta), key=lambda e: e.name.lower())
        except OSError:
            continue
        carpetas = []
        for e in entradas:
            r = f"{rel}/{e.name}" if rel else e.name
            try:
                es_dir = e.is_dir(follow_symlinks=False)
                if e.is_symlink():
                    continue  # nunca seguir enlaces: podrían salir de la carpeta
            except OSError:
                continue
            if es_dir:
                if e.name in SIEMPRE_FUERA or ign.ignorado(r, True):
                    continue
                if nivel + 1 < profundidad:
                    carpetas.append((r, nivel + 1))
                continue
            if ign.ignorado(r, False):
                continue
            if sin_secretos and es_secreto(e.name):
                omitidos += 1
                continue
            if len(rutas) >= maximo:
                omitidos += 1
                continue
            rutas.append(r)
        pila.extend(reversed(carpetas))
    return rutas, omitidos


def responder(salida, datos):
    escribir_atomico(salida, json.dumps(datos, ensure_ascii=False) + "\n", 0o600)
