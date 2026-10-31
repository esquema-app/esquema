"""El inventario del código de un proyecto, sin IA: todos sus archivos (con su clase), los lenguajes, las partes (componentes con
manifiesto) y qué tipo de proyecto es. Más lo que la IA leyó de él y cuándo (lecturas.json en la carpeta de Esquema).

Solo biblioteca estándar. Nada de esto toca la carpeta de la persona: se lee con comun.recorrer (respeta .gitignore, sin carpetas
pesadas ni enlaces) y lo que se recuerda va en <carpeta de Esquema>/proyectos/<id>/.
"""
import datetime
import hashlib
import json
import os
import re

import comun

MAX_ARCHIVOS = 20_000
EXT_CODIGO = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".swift", ".kt", ".kts", ".java", ".go", ".rs", ".rb", ".php", ".cs",
              ".c", ".h", ".cpp", ".hpp", ".cc", ".m", ".mm", ".dart", ".vue", ".svelte", ".css", ".scss", ".sass", ".less", ".html",
              ".htm", ".sh", ".bash", ".zsh", ".ps1", ".sql", ".lua", ".ex", ".exs", ".scala", ".r", ".jl", ".zig", ".erl", ".clj",
              ".fs", ".hs", ".ml", ".pl", ".groovy", ".gradle", ".astro", ".graphql", ".proto"}
EXT_CONFIG = {".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".plist", ".xml", ".properties", ".lock",
              ".editorconfig", ".npmrc", ".nvmrc", ".env", ".entitlements", ".xcconfig", ".pbxproj", ".csproj", ".sln"}
NOMBRES_CONFIG = {"dockerfile", "makefile", "procfile", "gemfile", "podfile", "brewfile", "justfile", "license", "licence", "copying",
                  "codeowners", "vagrantfile", "rakefile", "caddyfile"}
EXT_DOCUMENTO = {".md", ".mmd", ".markdown", ".txt", ".rst", ".adoc", ".org", ".tex", ".pdf", ".doc", ".docx", ".odt", ".rtf", ".pages", ".epub"}
EXT_IMAGEN = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".icns", ".bmp", ".tif", ".tiff", ".heic", ".psd", ".sketch", ".fig", ".ai"}
EXT_DATOS = {".csv", ".tsv", ".parquet", ".xlsx", ".xls", ".ods", ".db", ".sqlite", ".ndjson", ".jsonl", ".geojson"}
EXT_MULTIMEDIA = {".mp3", ".mp4", ".mov", ".wav", ".m4a", ".ogg", ".webm", ".avi", ".mkv", ".flac", ".aac"}
#: Clases de archivo (una letra en lo que va a la interfaz): código, configuración, documento, imagen, datos, multimedia, secreto, otro.
CLASES = {"codigo": "c", "config": "f", "documento": "d", "imagen": "i", "datos": "t", "multimedia": "m", "secreto": "s", "otro": "o"}
LENGUAJES = {".py": "Python", ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
             ".jsx": "JavaScript", ".swift": "Swift", ".kt": "Kotlin", ".kts": "Kotlin", ".java": "Java", ".go": "Go", ".rs": "Rust",
             ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".c": "C", ".h": "C", ".cpp": "C++", ".hpp": "C++", ".cc": "C++", ".m": "Objective-C",
             ".dart": "Dart", ".vue": "Vue", ".svelte": "Svelte", ".css": "CSS", ".scss": "CSS", ".html": "HTML", ".sh": "Shell",
             ".ps1": "PowerShell", ".sql": "SQL", ".lua": "Lua", ".ex": "Elixir", ".exs": "Elixir", ".scala": "Scala", ".r": "R",
             ".jl": "Julia", ".zig": "Zig", ".astro": "Astro"}
#: Carpetas que no son una «parte» del producto aunque tengan código.
NO_SON_PARTES = {"test", "tests", "pruebas", "spec", "specs", "__tests__", "docs", "doc", "documentacion", "ejemplos", "examples", "example",
                 "samples", "scripts", "herramientas", "tools", "vendor", "third_party", "fixtures", "assets", "public", "static", ".github"}
SITIOS = {"astro", "@11ty/eleventy", "gatsby", "vitepress", "@docusaurus/core", "hexo", "vuepress", "eleventy"}


def clase(ruta):
    """La clase de un archivo por su nombre: codigo, config, documento, imagen, datos, multimedia, secreto u otro."""
    nombre = ruta.rsplit("/", 1)[-1]
    n = nombre.lower()
    if comun.es_secreto(nombre):
        return "secreto"
    ext = os.path.splitext(n)[1]
    if n in NOMBRES_CONFIG or (n.startswith(".") and ext in ("", n)) or n.startswith(".env"):
        return "config"
    for c, exts in (("codigo", EXT_CODIGO), ("config", EXT_CONFIG), ("documento", EXT_DOCUMENTO), ("imagen", EXT_IMAGEN),
                    ("datos", EXT_DATOS), ("multimedia", EXT_MULTIMEDIA)):
        if ext in exts:
            return c
    return "otro"


def _leer(ruta, maximo=200_000):
    try:
        with open(ruta, "rb") as f:
            return f.read(maximo).decode("utf-8", "replace")
    except OSError:
        return ""


def _tipo_parte(base, carpeta, nombres):
    """Qué es una carpeta con manifiesto: {tipo, tecnologia}. `nombres`: los archivos que tiene directamente."""
    d = os.path.join(base, *carpeta.split("/")) if carpeta else base
    if "pubspec.yaml" in nombres:
        return "movil", "Flutter"
    if "package.json" in nombres:
        try:
            p = json.loads(_leer(os.path.join(d, "package.json")))
        except ValueError:
            p = {}
        deps = set((p.get("dependencies") or {}) if isinstance(p.get("dependencies"), dict) else {}) | set(
            (p.get("devDependencies") or {}) if isinstance(p.get("devDependencies"), dict) else {})
        if "react-native" in deps or "expo" in deps:
            return "movil", "React Native"
        if "electron" in deps:
            return "escritorio", "Electron"
        if "next" in deps:
            return "web", "Next.js"
        if deps & SITIOS:
            return "sitio", "Node"
        if deps & {"react", "vue", "svelte", "@angular/core", "vite", "solid-js"}:
            return "web", "JavaScript"
        if deps & {"express", "fastify", "@nestjs/core", "koa", "hono"}:
            return "servicio", "Node"
        if isinstance(p.get("bin"), (str, dict)):
            return "cli", "Node"
        if p.get("main") or p.get("exports"):
            return "biblioteca", "Node"
        return "app", "Node"
    if "Package.swift" in nombres or any(n.endswith(".xcodeproj") for n in nombres):
        return "app", "Swift"
    if "Cargo.toml" in nombres:
        t = _leer(os.path.join(d, "Cargo.toml"))
        es_lib = "[lib]" in t and not os.path.isfile(os.path.join(d, "src", "main.rs"))
        return ("biblioteca" if es_lib else "app"), "Rust"
    if "go.mod" in nombres:
        return "app", "Go"
    if nombres & {"build.gradle", "build.gradle.kts", "pom.xml"}:
        return ("movil" if os.path.isfile(os.path.join(d, "src", "main", "AndroidManifest.xml")) else "app"), "Java/Kotlin"
    if nombres & {"pyproject.toml", "setup.py", "requirements.txt", "setup.cfg"}:
        t = _leer(os.path.join(d, "pyproject.toml"))
        if re.search(r"(django|flask|fastapi|starlette)", t + _leer(os.path.join(d, "requirements.txt")), re.I):
            return "servicio", "Python"
        if "[project.scripts]" in t:
            return "cli", "Python"
        return ("biblioteca" if "[project]" in t else "app"), "Python"
    if nombres & {"composer.json"}:
        return "app", "PHP"
    if nombres & {"Gemfile"}:
        return "app", "Ruby"
    if any(n.endswith(".csproj") or n.endswith(".sln") for n in nombres):
        return "app", "C#"
    if nombres & {"mkdocs.yml", "hugo.toml", "_config.yml", "docusaurus.config.js", "astro.config.mjs"}:
        return "sitio", "Sitio"
    return None, None


MANIFIESTOS = {"package.json", "pubspec.yaml", "Package.swift", "Cargo.toml", "go.mod", "build.gradle", "build.gradle.kts", "pom.xml",
               "pyproject.toml", "setup.py", "requirements.txt", "composer.json", "Gemfile", "mkdocs.yml", "hugo.toml"}


def inventario(codigo, excluir=""):
    """Todo lo que Esquema sabe del código sin IA. `excluir`: la carpeta de la documentación dentro del repo (proyectos de antes)."""
    base = os.path.realpath(codigo)
    rutas, omitidos = comun.recorrer(base, maximo=MAX_ARCHIVOS, profundidad=12, sin_secretos=False)
    if excluir:
        rutas = [r for r in rutas if not r.startswith(excluir.rstrip("/") + "/")]
    archivos, cuenta, lenguajes, por_carpeta = [], {}, {}, {}
    for r in rutas:
        try:
            tam = os.path.getsize(os.path.join(base, *r.split("/")))
        except OSError:
            continue
        c = clase(r)
        cuenta[c] = cuenta.get(c, 0) + 1
        archivos.append([r, tam, CLASES[c]])
        ext = os.path.splitext(r)[1].lower()
        if ext in LENGUAJES:
            lenguajes[LENGUAJES[ext]] = lenguajes.get(LENGUAJES[ext], 0) + 1
        carpeta, _, nombre = r.rpartition("/")
        por_carpeta.setdefault(carpeta, set()).add(nombre)
    # Partes: la raíz y las carpetas (hasta 2 niveles) con un manifiesto; además, carpetas de primer nivel con bastante código.
    partes = []
    for carpeta in sorted(por_carpeta, key=lambda c: (c.count("/"), c)):
        if carpeta.count("/") > 1 or (carpeta and carpeta.split("/")[0].lower() in NO_SON_PARTES):
            continue
        nombres = set(por_carpeta[carpeta])
        try:  # los .xcodeproj son carpetas: no salen en la lista de archivos
            nombres |= {n for n in os.listdir(os.path.join(base, *carpeta.split("/")) if carpeta else base) if n.endswith(".xcodeproj")}
        except OSError:
            pass
        if not nombres & MANIFIESTOS and not any(n.endswith((".xcodeproj", ".csproj", ".sln")) for n in nombres):
            continue
        if any(carpeta.startswith(p["ruta"] + "/") for p in partes if p["ruta"]):
            continue  # dentro de una parte que ya está (p. ej. un paquete interno)
        tipo, tec = _tipo_parte(base, carpeta, nombres)
        if tipo:
            partes.append({"ruta": carpeta, "nombre": carpeta.split("/")[-1] if carpeta else os.path.basename(base), "tipo": tipo, "tecnologia": tec})
    con_manifiesto = {p["ruta"] for p in partes}
    for primera in sorted({r.split("/")[0] for r in rutas if "/" in r}):
        if primera in con_manifiesto or primera.lower() in NO_SON_PARTES or primera.startswith("."):
            continue
        en = [a for a in archivos if a[0].startswith(primera + "/") and a[2] == "c"]
        if len(en) >= 3 and len(partes) < 12:
            exts = {}
            for a in en:
                l = LENGUAJES.get(os.path.splitext(a[0])[1].lower())
                if l:
                    exts[l] = exts.get(l, 0) + 1
            tec = max(exts, key=exts.get) if exts else "Código"
            partes.append({"ruta": primera, "nombre": primera, "tipo": "modulo", "tecnologia": tec})
    partes = partes[:12]
    total = len(archivos) or 1
    perfil = {"tipo": tipo_proyecto(partes, cuenta, total, por_carpeta), "partes": len([p for p in partes if p["ruta"]]) or len(partes),
              "archivos": len(archivos), "lenguajes": sorted(([k, v] for k, v in lenguajes.items()), key=lambda x: -x[1])[:8],
              "componentes": partes, "clases": cuenta}
    return {"archivos": archivos, "omitidos": omitidos, "perfil": perfil}


def tipo_proyecto(partes, cuenta, total, por_carpeta):
    """app (app o servicio de software), biblioteca, sitio, monorepo, escritos (documentación o textos) o mezcla."""
    cod, docs = cuenta.get("codigo", 0), cuenta.get("documento", 0)
    if docs >= 0.6 * total and cod <= 0.1 * total:
        return "escritos"
    con_ruta = [p for p in partes if p["ruta"] and p["tipo"] != "modulo"]
    if len(con_ruta) >= 2 or (len([p for p in partes if p["ruta"]]) >= 3):
        return "monorepo"
    if cod and docs >= 0.3 * total and cod >= 0.2 * total and cod < 0.6 * total and not partes:
        return "mezcla"
    tipos = [p["tipo"] for p in partes]
    if tipos and tipos[0] == "sitio":
        return "sitio"
    if not partes and "index.html" in por_carpeta.get("", set()):
        return "sitio"
    if tipos and tipos[0] == "biblioteca":
        return "biblioteca"
    if not cod:
        return "escritos" if docs else "mezcla"
    return "app"


# ───────────── Lo que la IA leyó (en la carpeta de Esquema, nunca en la de la persona) ─────────────
def carpeta_proyecto(pid):
    return os.path.join(comun.carpeta_app(), "proyectos", pid)


def id_proyecto(base):
    """Un id estable para la carpeta abierta (la de la documentación o, en los de antes, la del repo)."""
    return hashlib.sha1(os.path.realpath(base).encode("utf-8")).hexdigest()[:16]


def _huella(ruta):
    h = hashlib.sha1()
    try:
        with open(ruta, "rb") as f:
            for bloque in iter(lambda: f.read(1 << 16), b""):
                h.update(bloque)
    except OSError:
        return ""
    return h.hexdigest()[:16]


def leer_lecturas(pid):
    d = comun.leer_json(os.path.join(carpeta_proyecto(pid), "lecturas.json"), {}) or {}
    return d.get("archivos", {}) if isinstance(d, dict) and isinstance(d.get("archivos"), dict) else {}


def registrar_lecturas(pid, codigo, rutas):
    """Anota que la IA leyó estos archivos (ruta relativa al código) ahora, con la huella de su contenido."""
    if not rutas:
        return
    lec = leer_lecturas(pid)
    ahora = datetime.datetime.now().isoformat(timespec="seconds")
    for r in rutas:
        ruta = os.path.join(codigo, *r.split("/"))
        try:
            st = os.stat(ruta)
        except OSError:
            continue
        lec[r] = {"f": ahora, "h": _huella(ruta), "m": int(st.st_mtime), "s": st.st_size}
    comun.carpeta_privada(carpeta_proyecto(pid))
    comun.escribir_json(os.path.join(carpeta_proyecto(pid), "lecturas.json"), {"formato": 1, "archivos": lec})


def estado_lecturas(pid, codigo):
    """{ruta: {f: cuándo la leyó, c: true si cambió desde entonces}}. Solo se vuelve a calcular la huella si cambió fecha o tamaño."""
    r = {}
    for ruta, x in leer_lecturas(pid).items():
        if not isinstance(x, dict) or not isinstance(x.get("f"), str):
            continue
        p = os.path.join(codigo, *ruta.split("/"))
        try:
            st = os.stat(p)
        except OSError:
            continue  # ya no está
        cambio = (int(st.st_mtime) != x.get("m") or st.st_size != x.get("s")) and _huella(p) != x.get("h")
        r[ruta] = {"f": x["f"][:19], **({"c": True} if cambio else {})}
    return r


def guardar_perfil(pid, perfil):
    comun.carpeta_privada(carpeta_proyecto(pid))
    comun.escribir_json(os.path.join(carpeta_proyecto(pid), "perfil.json"), perfil)


def leer_perfil(pid):
    p = comun.leer_json(os.path.join(carpeta_proyecto(pid), "perfil.json"), None)
    return p if isinstance(p, dict) else None
