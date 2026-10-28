"""Formato y validación de una plantilla de Esquema y del índice del catálogo. Solo datos: nunca se ejecuta nada de una plantilla.

Este archivo es el MISMO en esquema (bin/) y en esquema-catalogo (herramientas/): si cambia aquí, cambia allá (las pruebas de los
dos repos lo revisan), y la misma regla de una plantilla vive en ui/app.js (validarPlantilla). Casos compartidos en
pruebas/casos.json (sección «plantillas»).

{
  "formato": 1,
  "id": "aplicacion-web",                 # minúsculas, números y guiones (≤ 60)
  "categoria": "arquitectura",            # una de CATEGORIAS
  "tipo": "diagrama" | "documento",       # .mmd o .md
  "nombre": {"es": "…", "en": "…"},       # ≤ 80 caracteres; «es» obligatorio
  "descripcion": {"es": "…", "en": "…"},  # ≤ 200
  "archivo": {"es": "arquitectura.mmd"},  # nombre sugerido (letras, números, _ y -; .mmd para diagramas, .md para documentos)
  "contenido": {"es": "flowchart LR…"},   # ≤ 20.000 caracteres
  "autor": "…", "etiquetas": ["…"]        # opcionales
}
"""
import glob
import hashlib
import json
import os
import re

FORMATO = 1
CATEGORIAS = ("arquitectura", "secuencia", "flujo-de-usuario", "proceso", "documentacion")
CAMPOS = {"formato", "id", "categoria", "tipo", "nombre", "descripcion", "archivo", "contenido", "autor", "etiquetas"}
MAX_BYTES = 100 * 1024        # una plantilla (el archivo .json)
MAX_INDICE = 1024 * 1024      # el índice del catálogo
MAX_EN_INDICE = 1000          # plantillas en el índice
# Dónde vive cada plantilla del catálogo (relativo a su raíz): plantillas/<categoria>/<id>.json
RUTA = re.compile(r"plantillas/([a-z-]+)/([a-z0-9]+(?:-[a-z0-9]+)*)\.json")


def _textos(o, maximo):
    return (isinstance(o, dict) and isinstance(o.get("es"), str)
            and all(isinstance(k, str) and re.fullmatch(r"[a-z]{2}(-[A-Z]{2})?", k) and isinstance(v, str) and len(v) <= maximo for k, v in o.items()))


def validar(p):
    """Lista de problemas (vacía si la plantilla sirve)."""
    if not isinstance(p, dict):
        return ["no es un objeto"]
    e = [f"campo desconocido: {k}" for k in p if k not in CAMPOS]
    if p.get("formato") != FORMATO or isinstance(p.get("formato"), bool):
        e.append("formato")
    if not isinstance(p.get("id"), str) or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", p["id"]) or len(p["id"]) > 60:
        e.append("id")
    if p.get("categoria") not in CATEGORIAS:
        e.append("categoria")
    if p.get("tipo") not in ("diagrama", "documento"):
        e.append("tipo")
    if not _textos(p.get("nombre"), 80):
        e.append("nombre")
    if not _textos(p.get("descripcion"), 200):
        e.append("descripcion")
    ext = ".mmd" if p.get("tipo") == "diagrama" else ".md"
    if not _textos(p.get("archivo"), 80) or not all(re.fullmatch(r"[\w-]+\.(md|mmd)", v, re.A) and v.endswith(ext) for v in p["archivo"].values()):
        e.append("archivo")
    if not _textos(p.get("contenido"), 20000):
        e.append("contenido")
    if "autor" in p and (not isinstance(p["autor"], str) or len(p["autor"]) > 60):
        e.append("autor")
    if "etiquetas" in p and (not isinstance(p["etiquetas"], list) or len(p["etiquetas"]) > 10 or not all(isinstance(x, str) and len(x) <= 30 for x in p["etiquetas"])):
        e.append("etiquetas")
    return e


# ───────────── Índice del catálogo (index.json en la raíz de esquema-catalogo) ─────────────
# {"formato": 1, "plantillas": [{…la plantilla entera…, "ruta": "plantillas/<categoria>/<id>.json", "sha256", "tamano"}]}
# Lo arma indice() (herramientas/generar_indice.py en el catálogo, bin/plantillas.py indice en la app) y lo revisa validar_indice()
# en la app antes de mostrar nada. La app baja cada plantilla por su «ruta», compara tamaño y huella, y la vuelve a validar.

def indice(raiz):
    """Valida <raiz>/plantillas/<categoria>/<id>.json y devuelve (índice, problemas). Solo entra lo que pasa todas las reglas."""
    lista, problemas, vistos = [], [], {}
    base = os.path.join(raiz, "plantillas")
    for nombre in sorted(os.listdir(base)) if os.path.isdir(base) else []:
        if not os.path.isdir(os.path.join(base, nombre)):
            if not nombre.endswith(".md"):
                problemas.append(f"plantillas/{nombre}: aquí solo van carpetas de categorías")
            continue
        if nombre not in CATEGORIAS:
            problemas.append(f"plantillas/{nombre}/: categoría desconocida (" + ", ".join(CATEGORIAS) + ")")
    for ruta in sorted(glob.glob(os.path.join(base, "*", "*"))):
        rel = os.path.relpath(ruta, raiz).replace(os.sep, "/")
        m = RUTA.fullmatch(rel)
        if not m or os.path.islink(ruta) or not os.path.isfile(ruta):
            problemas.append(f"{rel}: solo archivos plantillas/<categoria>/<id>.json (minúsculas, números y guiones)")
            continue
        if m.group(1) not in CATEGORIAS:
            continue
        with open(ruta, "rb") as f:
            crudo = f.read(MAX_BYTES + 1)
        if len(crudo) > MAX_BYTES:
            problemas.append(f"{rel}: pesa más de {MAX_BYTES // 1024} KB")
            continue
        try:
            p = json.loads(crudo.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as e:
            problemas.append(f"{rel}: no es JSON válido en UTF-8 ({e})")
            continue
        e = validar(p)
        if not e and p["id"] != m.group(2):
            e = ["el archivo tiene que llamarse como su id"]
        if not e and p["categoria"] != m.group(1):
            e = [f"está en la carpeta {m.group(1)} y su categoria es «{p['categoria']}»"]
        if not e and p["id"] in vistos:
            e = [f"el id «{p['id']}» ya está en {vistos[p['id']]}"]
        if e:
            problemas.append(f"{rel}: " + ", ".join(e))
            continue
        vistos[p["id"]] = rel
        lista.append({**p, "ruta": rel, "sha256": hashlib.sha256(crudo).hexdigest(), "tamano": len(crudo)})
    if len(lista) > MAX_EN_INDICE:
        problemas.append(f"el índice no puede tener más de {MAX_EN_INDICE} plantillas")
    return {"formato": FORMATO, "plantillas": lista[:MAX_EN_INDICE]}, problemas


def validar_indice(d):
    """Del índice que bajó la app, solo las entradas válidas ({…plantilla, ruta, sha256, tamano}); lo demás se descarta."""
    lista = d.get("plantillas") if isinstance(d, dict) and d.get("formato") == FORMATO else None
    r, vistos = [], set()
    for x in lista if isinstance(lista, list) else []:
        if not isinstance(x, dict):
            continue
        p = {k: v for k, v in x.items() if k in CAMPOS}
        m = RUTA.fullmatch(x.get("ruta", "")) if isinstance(x.get("ruta"), str) else None
        tamano = x.get("tamano")
        if (validar(p) or not m or m.group(1) != p["categoria"] or m.group(2) != p["id"] or p["id"] in vistos
                or not isinstance(x.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", x["sha256"])
                or not isinstance(tamano, int) or isinstance(tamano, bool) or not 0 < tamano <= MAX_BYTES):
            continue
        vistos.add(p["id"])
        r.append({**p, "ruta": x["ruta"], "sha256": x["sha256"], "tamano": tamano})
    return r[:MAX_EN_INDICE]
