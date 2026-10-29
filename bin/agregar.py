"""«Agregar» al proyecto, crear un proyecto Libro, responder preguntas, seguir trabajos y borrar documentos (órdenes de bin/proyecto.py).

  detectar   lo que la persona pegó o eligió (texto y archivos en base64) → se lee (contenido.extraer), se adivina qué es
             (contenido.detectar) y queda guardado aparte, en <carpeta de Esquema>/entradas/<token>/, hasta que la persona confirme
             el tipo → {token, tipo, razones, titulo, …}. Nada se escribe todavía en el proyecto.
  agregar    {token, tipo: historia | documento | libro} → el original a fuentes/ y el trabajo de ese tipo (historias.py, libros.py).
  crear      {token, titulo} → un proyecto Libro nuevo en ~/Esquema/<titulo>/ (sin carpeta de código), con el libro importado.
  responder  {id, respuestas} → las respuestas a las preguntas de un trabajo que espera; el trabajo sigue.
  continuar  {id, reintentar?, descartar?} → «Seguir donde quedó», «Reintentar» uno que falló o descartar las preguntas.
  borrar     {ruta} → un documento de la documentación (nunca del código): sale de esquema.json, los enlaces a él quedan como texto,
             se guarda una versión y una copia para «Deshacer» (recuperar).
  recuperar  {id} → vuelve lo borrado (y sus enlaces) y guarda otra versión.
"""
import base64
import datetime
import json
import os
import re
import shutil
import time

import comun
import contenido as C
import documentar as D
import historias as H
import inventario as inv
import libros as LB
import proyecto as P
import trabajos

MAX_ARCHIVOS = 10
MAX_TOTAL = 40 * 1024 * 1024
MAX_PEGADO = 3_000_000
TIEMPO_ENTRADA = 2 * 24 * 3600


# ───────────── detectar: leer y adivinar, sin tocar el proyecto ─────────────
def _entradas():
    return os.path.join(comun.carpeta_app(), "entradas")


def _limpiar_entradas():
    try:
        for n in os.listdir(_entradas()):
            r = os.path.join(_entradas(), n)
            if os.path.isdir(r) and time.time() - os.path.getmtime(r) > TIEMPO_ENTRADA:
                shutil.rmtree(r, ignore_errors=True)
    except OSError:
        pass


def _nombre_seguro(n):
    n = os.path.basename(str(n or "").replace("\\", "/"))[:120]
    n = re.sub(r"[^\w.\- ]", "", n).strip(". ") or "archivo"
    return n


def detectar(e):
    archivos = e.get("archivos") if isinstance(e.get("archivos"), list) else []
    pegado = str(e.get("texto") or "")[:MAX_PEGADO]
    if len(archivos) > MAX_ARCHIVOS:
        raise ValueError(f"Agrega hasta {MAX_ARCHIVOS} archivos a la vez.")
    _limpiar_entradas()
    token = os.urandom(8).hex()
    carpeta = os.path.join(_entradas(), token)
    comun.carpeta_privada(_entradas())
    os.makedirs(carpeta)
    textos, originales, avisos, total, titulo, formato = [], [], [], 0, "", ""
    for k, a in enumerate(archivos):
        if not isinstance(a, dict):
            continue
        nombre = _nombre_seguro(a.get("nombre"))
        try:
            datos = base64.b64decode(str(a.get("datos") or ""), validate=False)
        except ValueError:
            avisos.append({"nombre": nombre, "error": "No pude leer ese archivo."})
            continue
        total += len(datos)
        if total > MAX_TOTAL:
            avisos.append({"nombre": nombre, "error": "Son demasiados datos de una vez (más de 40 MB)."})
            break
        try:
            x = C.extraer(nombre, datos)
        except C.NoSePuede as ex:
            avisos.append({"nombre": nombre, "error": str(ex)})
            continue
        ruta = os.path.join(carpeta, f"original-{k}")
        with open(ruta, "wb") as f:
            f.write(datos)
        originales.append({"nombre": nombre, "ext": x["formato"], "ruta": ruta})
        textos.append((nombre, x["texto"]))
        titulo = titulo or x["titulo"]
        formato = formato or x["formato"]
    if pegado.strip():
        textos.insert(0, ("", pegado.replace("\r\n", "\n").strip() + "\n"))
    if not textos:
        shutil.rmtree(carpeta, ignore_errors=True)
        if avisos:
            return {"ok": False, "avisos": avisos, "error": avisos[0]["error"]}
        return {"ok": False, "error": "Pega un texto o elige un archivo."}
    texto = textos[0][1] if len(textos) == 1 else "\n\n".join(f"# {n}\n\n{t}" if n else t for n, t in textos)
    texto = texto[:C.MAX_TEXTO]
    det = C.detectar(texto, textos[0][0] if textos[0][0] else "", formato)
    titulo = titulo or det["titulo"] or (os.path.splitext(textos[0][0])[0] if textos[0][0] else "")
    caps = len(C.partir_capitulos(texto)) if det["tipo"] == "libro" or len(texto) > 20_000 else 0
    meta = {"titulo": titulo[:120], "detectado": det, "originales": originales, "formato": formato or "md", "pegado": bool(pegado.strip())}
    comun.escribir_atomico(os.path.join(carpeta, "texto.md"), texto)
    comun.escribir_json(os.path.join(carpeta, "meta.json"), meta)
    return {"ok": True, "token": token, "tipo": det["tipo"], "subtipo": det["subtipo"], "razones": det["razones"], "titulo": meta["titulo"],
            "caracteres": len(texto), "palabras": len(texto.split()), "capitulos": caps, "avisos": avisos, "enlace": C.enlace_ticket(texto),
            "solo_enlace": C.solo_enlace(texto), "archivos": [o["nombre"] for o in originales],
            # Un libro grande dentro de un proyecto de software queda como referencia: mejor como proyecto Libro aparte.
            "sugerir_libro": det["tipo"] == "libro" and (len(texto) > 60_000 or caps >= 5)}


def _entrada(token):
    if not isinstance(token, str) or not re.fullmatch(r"[0-9a-f]{16}", token):
        raise ValueError("Vuelve a agregarlo: no encontré lo que elegiste.")
    carpeta = os.path.join(_entradas(), token)
    meta = comun.leer_json(os.path.join(carpeta, "meta.json"), None)
    if not isinstance(meta, dict) or not os.path.isfile(os.path.join(carpeta, "texto.md")):
        raise ValueError("Vuelve a agregarlo: no encontré lo que elegiste.")
    with open(os.path.join(carpeta, "texto.md"), encoding="utf-8") as f:
        meta["texto"] = f.read()
    meta["carpeta"] = carpeta
    return meta


def _titulo(e, entrada):
    t = re.sub(r"\s+", " ", str(e.get("titulo") or "")).strip()[:100]
    return t or entrada["titulo"] or "Sin título"


# ───────────── agregar: al proyecto abierto ─────────────
def agregar(e):
    L = P.lugares(e)
    x, _ = P.leer_esquema(L["dir_docs"])
    if not L["vinculado"] and x is None:
        raise ValueError("Primero prepara la carpeta de documentación de este proyecto.")
    entrada = _entrada(e.get("token"))
    tipo = e.get("tipo") if e.get("tipo") in ("historia", "documento", "libro") else entrada["detectado"]["tipo"]
    titulo = _titulo(e, entrada)
    if tipo == "historia" and C.solo_enlace(entrada["texto"]):
        raise ValueError("Esquema no abre enlaces (nada sale de tu computador). Pega también el texto del ticket.")
    os.makedirs(L["dir_docs"], exist_ok=True)
    fuentes = LB.guardar_fuentes(L["dir_docs"], entrada, f"{C.id_historia(entrada['texto'], _hu_existentes(L))} {titulo}" if tipo == "historia" else titulo)
    shutil.rmtree(entrada["carpeta"], ignore_errors=True)
    if tipo == "historia":
        t = H.nuevo(e, entrada["texto"], titulo, C.enlace_ticket(entrada["texto"]), fuentes)
        H.correr(e, t)
    else:
        sub = "libro" if tipo == "libro" else entrada["detectado"].get("subtipo", "")
        t = LB.nuevo_documento(e, entrada, titulo, sub, fuentes)
        LB.correr_documento(e, t)
    return {"ok": True, "trabajo": t.vista()}


def _hu_existentes(L):
    c = os.path.join(L["dir_docs"], H.CARPETA)
    return os.listdir(c) if os.path.isdir(c) else []


# ───────────── crear: un proyecto Libro nuevo ─────────────
def _entrada_carpeta(e):
    """Los textos de la carpeta abierta como un solo libro (una carpeta de escritos: capítulos en .md, un PDF, un EPUB…), en orden.
    Los archivos se leen donde están; al proyecto Libro va su texto (fuentes/<nombre>.md)."""
    base = P.base_de(e)
    rutas, _ = comun.recorrer(base, maximo=400)
    partes, total = [], 0
    for r in sorted(rutas, key=lambda x: (x.count("/"), x.lower())):
        if C.extension(r) not in C.LEE or os.path.basename(r).lower() in ("license.md", "changelog.md", "contributing.md", "code_of_conduct.md"):
            continue
        ruta = os.path.join(base, *r.split("/"))
        try:
            if os.path.getsize(ruta) > C.MAX_ARCHIVO:
                continue
            with open(ruta, "rb") as f:
                x = C.extraer(r, f.read())
        except (OSError, C.NoSePuede):
            continue
        texto = x["texto"] if x["texto"].lstrip().startswith("#") else f"# {os.path.splitext(os.path.basename(r))[0]}\n\n{x['texto']}"
        partes.append(texto)
        total += len(texto)
        if total > C.MAX_TEXTO:
            break
    if not partes:
        raise ValueError("No encontré textos que pueda leer en esta carpeta (.md, .txt, PDF, Word, EPUB…).")
    return {"texto": "\n\n".join(partes)[:C.MAX_TEXTO], "titulo": os.path.basename(base), "originales": [], "carpeta": None}


def crear(e):
    entrada = _entrada_carpeta(e) if e.get("desde_carpeta") else _entrada(e.get("token"))
    titulo = _titulo(e, entrada)
    idioma = "en" if e.get("idioma") == "en" else "es"
    if len(entrada["texto"]) < 200:
        raise ValueError("Ese texto es muy corto para un libro. Agrégalo a un proyecto como documento.")
    destino = LB.crear_proyecto(titulo, idioma)
    t = LB.nuevo_libro(destino, entrada, titulo, idioma)
    if entrada.get("carpeta"):
        shutil.rmtree(entrada["carpeta"], ignore_errors=True)
    indice = next(i for i, p in enumerate(P.recientes()) if os.path.realpath(p["ruta"]) == destino)
    return {"ok": True, "indice": indice, "ubicacion": P.ubicacion(destino), "recientes": P.para_interfaz(P.recientes()), "trabajo": t.vista()}


# ───────────── responder y continuar ─────────────
def _trabajo_de(e):
    base = P.base_de(e)
    t = trabajos.Trabajo.cargar(e.get("id"))
    if t.x.get("proyecto") != base:
        raise ValueError("Ese trabajo es de otro proyecto.")
    return t


CORRER = {"historia": H.correr, "historia_cierre": H.correr_cierre, "libro": LB.correr_libro, "estudio": LB.correr_estudio,
          "incongruencias": LB.correr_incongruencias, "documento": LB.correr_documento}


def responder(e):
    t = _trabajo_de(e)
    if t.x.get("estado") != "esperando":
        return {"ok": False, "error": "Esas preguntas ya se respondieron.", "trabajo": t.vista()}
    if t.x["tipo"] == "historia":
        H.seguir(e, t, e.get("respuestas"))
    elif t.x["tipo"] == "libro":
        LB.seguir_libro(e, t, e.get("respuestas"))
    else:
        raise ValueError("Ese trabajo no tiene preguntas.")
    return {"ok": True, "trabajo": t.vista()}


def continuar(e):
    t = _trabajo_de(e)
    if t.x["tipo"] == "documentar":
        import documentar
        return documentar.documentar({**e, "seguir": None, "reintentar": t.id, "ruta": e.get("reintentar")} if e.get("reintentar") else {**e, "seguir": t.id})
    if e.get("descartar"):
        if t.x.get("estado") == "esperando":
            t.x.setdefault("publico", {})["descartado"] = True
            t.x["publico"].pop("preguntas", None)
            t.x["estado"] = "listo"
            t.guardar()
        return {"ok": True, "trabajo": t.vista()}
    if trabajos.estado_real(t.x) == "corriendo":
        return {"ok": False, "error": "Ese trabajo sigue corriendo: espera a que termine.", "trabajo": t.vista()}
    if t.x["tipo"] not in CORRER:
        raise ValueError("No sé seguir ese trabajo.")
    if e.get("reintentar"):
        i = t.item(e["reintentar"])
        if not i:
            raise ValueError("No encontré ese documento en el trabajo.")
        t.poner_item(i["ruta"], estado="cola")
    t.seguir()
    CORRER[t.x["tipo"]](e, t)
    return {"ok": True, "trabajo": t.vista()}


# ───────────── borrar y recuperar ─────────────
MAX_BORRADOS = 50
RE_ENLACE_MD = re.compile(r"(!?)\[([^\]\n]*)\]\(([^)\s#]+)(#[^)\s]*)?\)")


def _carpeta_borrados(base):
    return os.path.join(inv.carpeta_proyecto(inv.id_proyecto(base)), "borrados")


def _normal(partes):
    r = []
    for p in partes:
        if p == "..":
            if r:
                r.pop()
        elif p and p != ".":
            r.append(p)
    return "/".join(r)


def sin_enlaces_a(texto, desde, objetivo):
    """El texto de `desde` con los enlaces a `objetivo` (rutas de la documentación) convertidos en texto normal."""
    carpeta = desde.split("/")[:-1]
    trozos = re.split(r"(```[\s\S]*?```)", texto)

    def cambiar(m):
        if m.group(1) or re.match(r"^[a-z]+:", m.group(3)):
            return m.group(0)
        return m.group(2) if _normal(carpeta + m.group(3).split("/")) == objetivo else m.group(0)
    return "".join(x if x.startswith("```") else RE_ENLACE_MD.sub(cambiar, x) for x in trozos)


def borrar(e):
    base = P.base_de(e)
    L = P.lugares(e)
    rel = e.get("ruta")
    if rel in (P.ESQUEMA, P.GLOSARIO):
        raise ValueError("Ese archivo lo arma Esquema: no se borra.")
    if not (P.doc_valido(rel) or P.fuente_valida(rel)):
        raise ValueError("Ese documento no se puede borrar.")
    raiz = os.path.realpath(L["dir_docs"])
    ruta = os.path.realpath(os.path.join(raiz, *rel.split("/")))
    if os.path.commonpath([raiz, ruta]) != raiz or os.path.islink(os.path.join(raiz, *rel.split("/"))) or not os.path.isfile(ruta):
        raise ValueError("No encontré ese documento.")
    if os.path.getsize(ruta) > C.MAX_ARCHIVO:
        raise ValueError("Ese archivo es muy grande para borrarlo desde Esquema.")
    with open(ruta, "rb") as f:
        datos = f.read()
    x, _ = P.leer_esquema(raiz)
    doc = next((d for d in (x or {}).get("documentos", []) if d["ruta"] == rel), None)
    # Los enlaces a lo borrado, en los demás documentos, quedan como texto.
    cambios = {}
    if rel.endswith((".md", ".mmd")):
        for otro, texto in P.archivos_docs(raiz).items():
            if otro == rel or not otro.endswith(".md") or otro == P.GLOSARIO:
                continue
            nuevo = sin_enlaces_a(texto, otro, rel)
            if nuevo != texto:
                cambios[otro] = [texto, nuevo]
    registro = {"formato": 1, "fecha": datetime.datetime.now().isoformat(timespec="seconds"), "ruta": rel, "doc": doc,
                "datos": base64.b64encode(datos).decode(), "cambios": cambios}
    ident = datetime.datetime.now().strftime("%Y%m%dT%H%M%S") + "-" + os.urandom(3).hex()
    carpeta = _carpeta_borrados(base)
    comun.carpeta_privada(carpeta)
    comun.escribir_json(os.path.join(carpeta, ident + ".json"), registro)
    for n in sorted(os.listdir(carpeta), reverse=True)[MAX_BORRADOS:]:
        try:
            os.unlink(os.path.join(carpeta, n))
        except OSError:
            pass
    for otro, (_, nuevo) in cambios.items():
        comun.escribir_atomico(os.path.join(raiz, *otro.split("/")), nuevo)
    os.unlink(ruta)
    if x is not None and doc:
        D.registrar(raiz, None, quitar=[rel], idioma="en" if e.get("idioma") == "en" else "es")
    # Una HU que esperaba respuestas ya no las necesita.
    for t in trabajos.esperando(base):
        if (t.x.get("publico") or {}).get("ruta") == rel:
            t.x["publico"]["descartado"] = True
            t.x["publico"].pop("preguntas", None)
            t.x["estado"] = "listo"
            t.guardar(emitir_estado=False)
    titulo = (doc or {}).get("titulo") or rel
    v = P.version({"carpeta": e["carpeta"], "docs": e.get("docs"), "mensaje": f"Borré «{titulo}»" if e.get("idioma") != "en" else f"Deleted «{titulo}»"})
    return {"ok": True, "id": ident, "ruta": rel, "titulo": titulo, "cambiados": sorted(cambios), "version": v.get("id")}


def recuperar(e):
    base = P.base_de(e)
    L = P.lugares(e)
    ident = e.get("id")
    if not isinstance(ident, str) or not re.fullmatch(r"\d{8}T\d{6}-[0-9a-f]{6}", ident):
        raise ValueError("No encontré eso para recuperarlo.")
    r = comun.leer_json(os.path.join(_carpeta_borrados(base), ident + ".json"), None)
    if not isinstance(r, dict) or not (P.doc_valido(r.get("ruta")) or P.fuente_valida(r.get("ruta"))):
        raise ValueError("No encontré eso para recuperarlo.")
    raiz = os.path.realpath(L["dir_docs"])
    ruta = os.path.realpath(os.path.join(raiz, *r["ruta"].split("/")))
    if os.path.commonpath([raiz, ruta]) != raiz:
        raise ValueError("No encontré eso para recuperarlo.")
    if os.path.exists(ruta):
        raise ValueError("Ya hay un documento con ese nombre: no lo piso.")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "wb") as f:
        f.write(base64.b64decode(r["datos"]))
    cambiados = []
    for otro, (antes, despues) in (r.get("cambios") or {}).items():
        if not P.doc_valido(otro):
            continue
        p = os.path.join(raiz, *otro.split("/"))
        actual = open(p, encoding="utf-8", newline="").read() if os.path.isfile(p) else None
        if actual == despues:  # si la persona lo cambió después, se respeta
            comun.escribir_atomico(p, antes)
            cambiados.append(otro)
    doc = r.get("doc")
    if isinstance(doc, dict) and P.leer_esquema(raiz)[0] is not None:
        D.registrar(raiz, None, [doc], idioma="en" if e.get("idioma") == "en" else "es")
    try:
        os.unlink(os.path.join(_carpeta_borrados(base), ident + ".json"))
    except OSError:
        pass
    titulo = (doc or {}).get("titulo") or r["ruta"]
    v = P.version({"carpeta": e["carpeta"], "docs": e.get("docs"), "mensaje": f"Recuperé «{titulo}»" if e.get("idioma") != "en" else f"Restored «{titulo}»"})
    return {"ok": True, "ruta": r["ruta"], "cambiados": cambiados, "version": v.get("id")}


# ───────────── Órdenes ─────────────
ORDENES = {"detectar": detectar, "agregar": agregar, "crear": crear, "responder": responder, "continuar": continuar, "borrar": borrar,
           "recuperar": recuperar, "historia_estado": H.historia_estado, "historia_cierre": H.historia_cierre,
           "estudiar": LB.estudiar, "incongruencias": LB.incongruencias}
