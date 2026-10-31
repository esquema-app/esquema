#!/usr/bin/env python3
"""Tipos de proyecto: lo que Esquema sabe hacer con cada clase de proyecto (Software, Libro… y los que vengan).

Cada tipo es un archivo de datos en tipos/<id>.json (se valida como una plantilla: solo datos, nada que se ejecute). Dice cómo se
llama, su ícono, de dónde sale (una carpeta de código o un texto), qué elementos usa, cómo se ordena su documentación en el lateral y
en el panel (secciones), qué revisa «Lo que falta», qué acciones y trabajos ofrece, qué se crea con «Nuevo» dentro del proyecto y qué
acepta «Agregar». Cada id de esas listas tiene que ser uno que la interfaz y bin/ conocen (las listas de abajo): un tipo nuevo se arma
combinándolos, y si necesita algo nuevo, se agrega aquí, en la interfaz (ui/proyectos.js) y, si es un trabajo, en bin/.
La misma regla está en ui/motor/proyecto.js (M.validarTipo) con los casos «tipos» de pruebas/casos.json.

Uso: tipos.py validar <archivo.json>…   → los problemas de cada uno (sale con 1 si hay alguno)
"""
import glob
import os
import re
import sys

import comun

ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FUENTES = ("carpeta", "texto")
ICONOS = ("codigo", "libro", "proyecto", "doc", "diagrama", "persona", "elemento", "chispa", "carpeta", "historia", "datos", "archivo",
          "flecha", "listo", "imagen", "tarjetas")
TIPOS_ELEMENTO = ("pantalla", "boton", "accion", "servicio", "modulo", "dato", "actor", "personaje", "concepto", "lugar", "otro")
TIPOS_DOCUMENTO = ("vision", "arquitectura", "flujo", "glosario", "otro", "historia", "libro", "capitulo", "documento", "fuente", "estudio", "revision")
#: Lo que la interfaz sabe mostrar y hacer. Un tipo solo puede nombrar estos.
SECCIONES_ESPECIALES = ("elementos", "versiones")
FALTA = ("vision", "arquitectura", "segun-codigo", "flujos", "elementos", "elementos-usados", "al-dia",
         "capitulos", "resumenes", "libro-readme", "estudio", "incongruencias")
ACCIONES = ("documentar", "completar", "flujo", "diagrama", "historia", "agregar", "readme", "wiki", "estudiar", "incongruencias", "incorporar")
NUEVO = ("diagrama", "documento", "historia", "agregar", "incorporar")
AGREGAR = ("historia", "documento", "libro", "incorporar")
DEFECTO = "software"


def _texto(o, maximo):
    return (isinstance(o, dict) and isinstance(o.get("es"), str) and o["es"].strip() != ""
            and all(re.fullmatch(r"[a-z]{2}(-[A-Z]{2})?", k) and isinstance(v, str) and len(v) <= maximo for k, v in o.items()))


def _lista(v, permitidos, minimo=0):
    return isinstance(v, list) and minimo <= len(v) <= 20 and len(set(v)) == len(v) and all(x in permitidos for x in v)


def validar(t):
    """Errores de un tipo (lista vacía = válido)."""
    if not isinstance(t, dict):
        return ["no es un objeto"]
    claves = ("formato", "id", "icono", "nombre", "descripcion", "fuente", "elementos", "secciones", "falta", "acciones", "nuevo", "agregar")
    e = [f"campo desconocido: {k}" for k in t if k not in claves]
    if t.get("formato") != 1:
        e.append("formato")
    if not isinstance(t.get("id"), str) or len(t["id"]) > 40 or not ID.fullmatch(t["id"]):
        e.append("id")
    if t.get("icono") not in ICONOS:
        e.append("icono")
    if not _texto(t.get("nombre"), 40):
        e.append("nombre")
    if not _texto(t.get("descripcion"), 200):
        e.append("descripcion")
    if t.get("fuente") not in FUENTES:
        e.append("fuente")
    if not _lista(t.get("elementos"), TIPOS_ELEMENTO, 1):
        e.append("elementos")
    s = t.get("secciones")
    if not isinstance(s, list) or not 1 <= len(s) <= 16:
        e.append("secciones")
    else:
        vistos = set()
        for x in s:
            if not isinstance(x, dict) or not isinstance(x.get("id"), str) or not ID.fullmatch(x["id"]) or x["id"] in vistos:
                e.append("seccion")
                continue
            vistos.add(x["id"])
            if set(x) - {"id", "nombre", "icono", "carpetas", "tipos"} or not _texto(x.get("nombre"), 40):
                e.append("seccion " + x["id"])
            elif x["id"] in SECCIONES_ESPECIALES:
                if "carpetas" in x or "tipos" in x:
                    e.append("seccion " + x["id"])
            elif (x.get("icono") not in ICONOS
                  or ("carpetas" in x and not (isinstance(x["carpetas"], list) and len(x["carpetas"]) <= 10
                                               and all(isinstance(c, str) and (c == "" or ID.fullmatch(c)) for c in x["carpetas"])))
                  or ("tipos" in x and not _lista(x["tipos"], TIPOS_DOCUMENTO))):
                e.append("seccion " + x["id"])
    for k, permitidos in (("falta", FALTA), ("acciones", ACCIONES), ("nuevo", NUEVO), ("agregar", AGREGAR)):
        if not _lista(t.get(k), permitidos):
            e.append(k)
    return e


def incluidos():
    r = []
    for ruta in sorted(glob.glob(os.path.join(comun.RECURSOS, "tipos", "*.json"))):
        t = comun.leer_json(ruta)
        if t is not None and not validar(t) and os.path.basename(ruta) == t["id"] + ".json":
            r.append(t)
    # Software primero (el de siempre), después por nombre.
    return sorted(r, key=lambda t: (t["id"] != DEFECTO, t["nombre"]["es"]))


def ids():
    return [t["id"] for t in incluidos()]


def tipo(i):
    return next((t for t in incluidos() if t["id"] == i), None) or next((t for t in incluidos() if t["id"] == DEFECTO), None)


def main(args):
    if len(args) >= 2 and args[0] == "validar":
        malos = 0
        for ruta in args[1:]:
            errores = validar(comun.leer_json(ruta))
            if errores:
                malos += 1
                print(f"✗ {ruta}: " + "; ".join(errores))
            else:
                print(f"✓ {ruta}")
        return 1 if malos else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
