"""Formato y validación de una plantilla de Esquema. Solo datos: nunca se ejecuta nada de una plantilla.

Este archivo es el MISMO en esquema (bin/) y en esquema-catalogo (herramientas/): si cambia aquí, cambia allá (las pruebas de los
dos repos lo revisan), y la misma regla de una plantilla vive en ui/app.js (validarPlantilla). Casos compartidos en
pruebas/casos.json (sección «plantillas»). Es el `validador` de la pieza «catálogo» (bin/catalogo.py, app.json → catalogo): el
índice del catálogo, la descarga, la huella y lo instalado son de la pieza; aquí solo `validar`, `FORMATO`, `CATEGORIAS` y `CAMPOS`.
El índice del catálogo se arma con `catalogo.py generar plantillas <raíz> <salida>`.

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
import re

FORMATO = 1
CATEGORIAS = ("arquitectura", "secuencia", "flujo-de-usuario", "proceso", "documentacion")
CAMPOS = {"formato", "id", "categoria", "tipo", "nombre", "descripcion", "archivo", "contenido", "autor", "etiquetas"}


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

