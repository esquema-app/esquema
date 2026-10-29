"""Publicar la documentación en la wiki de GitHub del proyecto (órdenes `wiki_preparar` y `wiki_publicar` de bin/proyecto.py).

La wiki de GitHub es otro repositorio git: <repo>.wiki.git. Esquema la clona en su carpeta (<carpeta de Esquema>/wikis/<id>/, nunca en
la de la persona), arma las páginas desde la documentación y, cuando la persona lo pide, hace commit y push con SU git y SUS
credenciales (Esquema no guarda claves ni tokens).

Cómo se transforma: README.md → Home.md; cada documento → una página con nombre plano y claro (su título: «Pagar una cuenta» →
Pagar-una-cuenta.md); los enlaces entre documentos apuntan a la página (sin .md); los enlaces a elementos van a su título en la página
«Elementos»; el encabezado YAML de una historia de usuario queda como una línea legible; los diagramas Mermaid van tal cual (GitHub los
dibuja); _Sidebar.md con el orden del proyecto. Los originales (fuentes/) no se publican.

Lo que nunca hace: borrar o pisar una página escrita a mano en la wiki. Cada página que publica Esquema lleva al final la marca
MARCA (un comentario HTML que no se ve); una página sin la marca es de la persona: se deja tal cual y se avisa. Una página con la
marca cuyo documento ya no existe se quita.
"""
import os
import re
import shutil
import unicodedata

import comun
import documentar as D
import historias as H
import inventario as inv
import proyecto as P

MARCA = "<!-- esquema: página publicada por Esquema. Se cambia al publicar de nuevo: edita el documento en Esquema. -->"
TIEMPO = 120
NOMBRES_CARPETA = {"es": {"componentes": "Componentes", "flujos": "Flujos", "diagramas": "Diagramas", "historias": "Historias de usuario",
                          "documentos": "Documentos", "capitulos": "Capítulos", "estudio": "Para estudiar", "secciones": "Secciones"},
                   "en": {"componentes": "Components", "flujos": "Flows", "diagramas": "Diagrams", "historias": "User stories",
                          "documentos": "Documents", "capitulos": "Chapters", "estudio": "Study material", "secciones": "Sections"}}
NO_EXISTE = ("La wiki de este repositorio todavía no existe. Créala desde GitHub: abre el repositorio, pestaña «Wiki» → «Create the first "
             "page» y guarda. Después vuelve aquí y publica.")


def derivar(origen):
    """La URL de la wiki desde la del repositorio: …/repo(.git) → …/repo.wiki.git (https, ssh o una carpeta local)."""
    u = (origen or "").strip().rstrip("/")
    if not u:
        return None
    if u.endswith(".git"):
        u = u[:-4]
    return u + ".git" if u.endswith(".wiki") else u + ".wiki.git"


def url_de(e, L):
    """La URL de la wiki: la que eligió la persona (proyectos.json) o la que sale del «origin» del repositorio del código."""
    base = P.base_de(e)
    guardada = next((p.get("wiki") for p in P.recientes() if os.path.realpath(p["ruta"]) == base and p.get("wiki")), None)
    if guardada:
        return derivar(guardada)
    if L["codigo"] and P.es_repo(L["codigo"]):
        c, s, _ = P.git(L["codigo"], "remote", "get-url", "origin")
        if c == 0 and s.strip():
            return derivar(s.strip())
    return None


def _carpeta(e):
    return os.path.join(comun.carpeta_app(), "wikis", inv.id_proyecto(P.base_de(e)))


def _rama(dirw):
    c, s, _ = P.git(dirw, "symbolic-ref", "--short", "HEAD")
    return s.strip() if c == 0 and s.strip() else "master"


def _al_dia(e, url):
    """Clona la wiki (o la pone al día). Devuelve (carpeta, error)."""
    dirw = _carpeta(e)
    if os.path.isdir(os.path.join(dirw, ".git")):
        c, s, _ = P.git(dirw, "remote", "get-url", "origin")
        if c != 0 or s.strip() != url:
            shutil.rmtree(dirw, ignore_errors=True)
    if not os.path.isdir(os.path.join(dirw, ".git")):
        comun.carpeta_privada(os.path.dirname(dirw))
        c, _, err = P.git(os.path.dirname(dirw), "clone", "--quiet", "--", url, dirw, timeout=TIEMPO)
        if c != 0:
            return None, _error_git(err)
        return dirw, None
    c, _, err = P.git(dirw, "fetch", "--quiet", "origin", timeout=TIEMPO)
    if c != 0:
        return None, _error_git(err)
    c, _, _ = P.git(dirw, "rev-parse", "--verify", "--quiet", "@{u}")
    if c == 0:
        # La copia es de Esquema: queda igual a la de GitHub (nada de la persona se pierde: lo suyo está en GitHub).
        P.git(dirw, "reset", "--hard", "--quiet", "@{u}")
    return dirw, None


def _error_git(err):
    t = (err or "").strip()
    if re.search(r"not found|does not appear to be a git repository|repository .* does not exist|no such file|no existe", t, re.I):
        return NO_EXISTE
    ultima = (t.splitlines() or [""])[-1][:200]
    return f"No pude conectarme con la wiki ({ultima}). Revisa que puedas usar ese repositorio con git desde tu terminal."


def _titulo_pagina(t):
    t = unicodedata.normalize("NFC", re.sub(r"\s+", " ", str(t or "")).strip())
    t = re.sub(r"[\\/:*?\"<>|#%\[\]{}^~`·]", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" .-")
    return t.replace(" ", "-")[:90] or "Pagina"


def _ancla(texto):
    """El ancla que GitHub da a un título: minúsculas, sin signos, espacios → guiones."""
    t = re.sub(r"[^\w\- ]", "", texto.strip().lower(), flags=re.U)
    return t.replace(" ", "-")


def paginas(e, L, idioma="es"):
    """{nombre de página: texto} y el orden para _Sidebar.md, desde la documentación."""
    x, _ = P.leer_esquema(L["dir_docs"])
    archivos = {r: t for r, t in P.archivos_docs(L["dir_docs"]).items() if r.endswith(".md") and not r.startswith("fuentes/")}
    titulos = {d["ruta"]: d["titulo"] for d in (x or {}).get("documentos", [])}
    nombres, usados = {}, set()
    orden = sorted(archivos, key=lambda r: D.orden_doc({"ruta": r, "tipo": next((d["tipo"] for d in (x or {}).get("documentos", []) if d["ruta"] == r), "otro")}))
    for r in orden:
        if r == "README.md":
            n = "Home"
        elif r == P.GLOSARIO:
            n = "Elements" if idioma == "en" else "Elementos"
        else:
            titulo = titulos.get(r) or re.sub(r"^#\s+", "", next((l for l in archivos[r].split("\n") if l.startswith("# ")), "")) or os.path.splitext(r.split("/")[-1])[0].replace("-", " ").capitalize()
            n = _titulo_pagina(titulo)
        base, k = n, 2
        while n.lower() in usados or n.lower() in ("_sidebar", "_footer"):
            n = f"{base}-{k}"
            k += 1
        usados.add(n.lower())
        nombres[r] = n
    anclas = {el["id"]: _ancla(el["nombre"]) for el in (x or {}).get("elementos", [])}
    salida = {}
    for r in orden:
        salida[nombres[r]] = _transformar(r, archivos[r], nombres, anclas, idioma) + "\n" + MARCA + "\n"
    salida["_Sidebar"] = _sidebar(orden, nombres, titulos, idioma, (x or {}).get("nombre", "")) + "\n" + MARCA + "\n"
    return salida, nombres


_RE_ENLACE = re.compile(r"(!?)\[([^\]\n]*)\]\(([^)\s]+)\)")


def _transformar(ruta, texto, nombres, anclas, idioma):
    meta, cuerpo = H.leer_encabezado(texto) if texto.startswith("---\n") else ({}, texto)
    if meta and texto.startswith("---\n"):
        nombres_estado = {"es": {"por-entender": "Por entender", "lista": "Lista para desarrollar", "en-desarrollo": "En desarrollo", "terminada": "Terminada"},
                          "en": {"por-entender": "To understand", "lista": "Ready to build", "en-desarrollo": "In progress", "terminada": "Done"}}[idioma if idioma == "en" else "es"]
        et = {"es": ("Estado", "Creada", "Actualizada", "Rama", "Ticket"), "en": ("Status", "Created", "Updated", "Branch", "Ticket")}[idioma if idioma == "en" else "es"]
        partes = [f"**{et[0]}:** {nombres_estado.get(meta.get('estado'), meta.get('estado', ''))}"]
        for k, n in (("creada", et[1]), ("actualizada", et[2]), ("rama", et[3]), ("enlace", et[4])):
            if meta.get(k):
                partes.append(f"**{n}:** {meta[k]}")
        lineas = cuerpo.lstrip("\n").split("\n")
        if lineas and lineas[0].startswith("# "):
            cuerpo = lineas[0] + "\n\n> " + " · ".join(partes) + "\n" + "\n".join(lineas[1:])
        else:
            cuerpo = "> " + " · ".join(partes) + "\n\n" + cuerpo
    carpeta = ruta.split("/")[:-1]
    trozos = re.split(r"(```[\s\S]*?```)", cuerpo)

    def enlace(m):
        destino = m.group(3)
        if m.group(1) or re.match(r"^[a-z]+:", destino, re.I) or destino.startswith("#"):
            return m.group(0)
        camino, _, ancla = destino.partition("#")
        r = _normal(carpeta + camino.split("/"))
        if r == P.GLOSARIO and ancla.startswith("el-") and ancla[3:] in anclas:
            return f"[{m.group(2)}]({nombres.get(r, 'Elementos')}#{anclas[ancla[3:]]})"
        if r in nombres:
            return f"[{m.group(2)}]({nombres[r]}{'#' + ancla if ancla else ''})"
        return m.group(0)
    return "".join(t if t.startswith("```") else _RE_ENLACE.sub(enlace, t) for t in trozos).rstrip() + "\n"


def _normal(partes):
    r = []
    for p in partes:
        if p == "..":
            if r:
                r.pop()
        elif p and p != ".":
            r.append(p)
    return "/".join(r)


def _sidebar(orden, nombres, titulos, idioma, proyecto):
    en = idioma == "en"
    r = [f"**{proyecto or 'Wiki'}**", "", "- [Home](Home)" if not en else "- [Home](Home)"]
    carpeta_actual = None
    for ruta in orden:
        if ruta == "README.md":
            continue
        carpeta = ruta.split("/")[0] if "/" in ruta else ""
        if carpeta != carpeta_actual:
            carpeta_actual = carpeta
            if carpeta:
                r += ["", f"**{NOMBRES_CARPETA['en' if en else 'es'].get(carpeta, carpeta.capitalize())}**", ""]
        r.append(f"- [{titulos.get(ruta) or nombres[ruta].replace('-', ' ')}]({nombres[ruta]})")
    return "\n".join(r) + "\n"


def _estados(dirw, salida):
    """{página: nuevo | igual | cambia | mano} y [páginas de Esquema que sobran]."""
    estados = {}
    for n, texto in salida.items():
        ruta = os.path.join(dirw, n + ".md")
        if not os.path.isfile(ruta):
            estados[n] = "nuevo"
            continue
        with open(ruta, encoding="utf-8", errors="replace", newline="") as f:
            actual = f.read()
        estados[n] = "igual" if actual == texto else "cambia" if MARCA in actual else "mano"
    sobran = []
    for f in sorted(os.listdir(dirw)) if os.path.isdir(dirw) else []:
        if f.endswith(".md") and f[:-3] not in salida:
            with open(os.path.join(dirw, f), encoding="utf-8", errors="replace") as a:
                if MARCA in a.read():
                    sobran.append(f[:-3])
    return estados, sobran


def preparar(e):
    """{url?}: clona o pone al día la wiki y dice qué páginas son nuevas, cambian, son iguales o están escritas a mano."""
    L = P.lugares(e)
    if e.get("url"):
        if not P._url_wiki_valida(e["url"]):
            raise ValueError("Esa dirección no sirve. Usa la del repositorio, por ejemplo https://github.com/ana/mi-app.")
        x, _ = P.leer_esquema(L["dir_docs"])
        P.recordar(P.base_de(e), (x or {}).get("nombre") or os.path.basename(P.base_de(e)), L["docs"], wiki=e["url"].strip())
    url = url_de(e, L)
    if not url:
        return {"ok": False, "falta_url": True, "error": "No sé cuál es el repositorio de GitHub de este proyecto. Escribe su dirección."}
    if not P.git_disponible():
        return {"ok": False, "error": "Para publicar en la wiki hace falta git en este computador."}
    dirw, error = _al_dia(e, url)
    if error:
        return {"ok": False, "error": error, "no_existe": error == NO_EXISTE, "url": url}
    salida, nombres = paginas(e, L, "en" if e.get("idioma") == "en" else "es")
    estados, sobran = _estados(dirw, salida)
    origen = {v: k for k, v in nombres.items()}
    lista = [{"pagina": n, "ruta": origen.get(n, ""), "estado": estados[n]} for n in salida]
    return {"ok": True, "url": url, "paginas": lista + [{"pagina": n, "ruta": "", "estado": "sobra"} for n in sobran],
            "web": _web(url)}


def _web(url):
    m = re.match(r"(?:https://|git@)([\w.-]+)[/:]([\w.-]+)/([\w.-]+?)(?:\.wiki)?(?:\.git)?$", url)
    return f"https://{m.group(1)}/{m.group(2)}/{m.group(3)}/wiki" if m else ""


def publicar(e):
    """{paginas?: [nombres]}: escribe las páginas elegidas (nunca las escritas a mano), quita las de Esquema que sobran, commit y push."""
    L = P.lugares(e)
    url = url_de(e, L)
    if not url:
        raise ValueError("No sé cuál es el repositorio de GitHub de este proyecto.")
    dirw, error = _al_dia(e, url)
    if error:
        return {"ok": False, "error": error, "no_existe": error == NO_EXISTE}
    salida, _ = paginas(e, L, "en" if e.get("idioma") == "en" else "es")
    estados, sobran = _estados(dirw, salida)
    elegidas = set(e["paginas"]) if isinstance(e.get("paginas"), list) else None
    escritas, quitadas, a_mano = [], [], [n for n, s in estados.items() if s == "mano"]
    for n, texto in salida.items():
        if estados[n] in ("nuevo", "cambia") and (elegidas is None or n in elegidas):
            comun.escribir_atomico(os.path.join(dirw, n + ".md"), texto)
            escritas.append(n)
    for n in sobran:
        if elegidas is None or n in elegidas:
            os.unlink(os.path.join(dirw, n + ".md"))
            quitadas.append(n)
    if not escritas and not quitadas:
        return {"ok": True, "sin_cambios": True, "a_mano": a_mano, "web": _web(url)}
    P.git(dirw, "add", "-A")
    quien = []
    c1, nombre, _ = P.git(dirw, "config", "user.name")
    c2, correo, _ = P.git(dirw, "config", "user.email")
    if c1 != 0 or c2 != 0 or not nombre.strip() or not correo.strip():
        quien = ["-c", "user.name=Esquema", "-c", "user.email=esquema@users.noreply.github.com"]
    en = e.get("idioma") == "en"
    c, _, err = P.git(dirw, *quien, "commit", "--no-verify", "--quiet", "-m", "Published the documentation from Esquema" if en else "Publiqué la documentación desde Esquema")
    if c != 0:
        return {"ok": False, "error": "No pude preparar la wiki: " + (err.strip().splitlines() or [""])[-1][:200]}
    c, _, err = P.git(dirw, "push", "--quiet", "origin", f"HEAD:refs/heads/{_rama(dirw)}", timeout=TIEMPO)
    if c != 0:
        P.git(dirw, "reset", "--quiet", "--hard", "HEAD~1")  # la próxima vez se arma de nuevo desde GitHub
        return {"ok": False, "error": _error_git(err) if "not found" in err.lower() else
                "No pude subir a la wiki: " + ((err.strip().splitlines() or [""])[-1][:200]) + ". Revisa que puedas hacer push a ese repositorio con git desde tu terminal."}
    return {"ok": True, "escritas": escritas, "quitadas": quitadas, "a_mano": a_mano, "web": _web(url)}
