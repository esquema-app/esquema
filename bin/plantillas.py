#!/usr/bin/env python3
"""Plantillas: las incluidas en la app (plantillas/<categoria>/<id>.json) y las descargadas del catálogo de la comunidad
(<carpeta de Esquema>/plantillas/<id>.json, ganan sobre las incluidas con el mismo id). Formato en plantilla_formato.py.

Uso:
  plantillas.py listar <salida.json>                 → {ok, plantillas: [...]}
  plantillas.py validar <archivo.json>…              → muestra los problemas (para el catálogo y las pruebas); sale con 1 si hay alguno
  plantillas.py indice <carpeta> <salida.json>       → índice del catálogo {formato, plantillas: [{id, categoria, tipo, nombre,
                                                       descripcion, ruta, sha256, tamano}]}
"""
import glob
import hashlib
import json
import os
import sys

import comun
import plantilla_formato


def incluidas():
    r = []
    for ruta in sorted(glob.glob(os.path.join(comun.RECURSOS, "plantillas", "*", "*.json"))):
        p = comun.leer_json(ruta)
        if p is not None and not plantilla_formato.validar(p):
            r.append(p)
    return r


def descargadas():
    r = []
    for ruta in sorted(glob.glob(os.path.join(comun.carpeta_app(), "plantillas", "*.json"))):
        try:
            if os.path.getsize(ruta) > 100_000:
                continue
        except OSError:
            continue
        p = comun.leer_json(ruta)
        if p is not None and not plantilla_formato.validar(p):
            r.append(p)
    return r


def listar():
    todas = {p["id"]: p for p in incluidas()}
    todas.update({p["id"]: p for p in descargadas()})
    return list(todas.values())


def indice(carpeta):
    lista = []
    for ruta in sorted(glob.glob(os.path.join(carpeta, "*", "*.json"))):
        with open(ruta, "rb") as f:
            datos = f.read()
        p = json.loads(datos)
        if plantilla_formato.validar(p):
            continue
        lista.append({"id": p["id"], "categoria": p["categoria"], "tipo": p["tipo"], "nombre": p["nombre"], "descripcion": p["descripcion"],
                      "ruta": os.path.relpath(ruta, carpeta).replace(os.sep, "/"), "sha256": hashlib.sha256(datos).hexdigest(), "tamano": len(datos)})
    return {"formato": plantilla_formato.FORMATO, "plantillas": lista}


def main(args):
    if args[:1] == ["listar"] and len(args) == 2:
        comun.responder(args[1], {"ok": True, "plantillas": listar()})
        return 0
    if args[:1] == ["indice"] and len(args) == 3:
        comun.responder(args[2], indice(args[1]))
        return 0
    if args[:1] == ["validar"] and len(args) > 1:
        malos = 0
        for ruta in args[1:]:
            try:
                with open(ruta, encoding="utf-8") as f:
                    p = json.load(f)
            except (OSError, ValueError) as err:
                print(f"✗ {ruta}: no es JSON ({err})"); malos += 1; continue
            e = plantilla_formato.validar(p)
            if not e and os.path.basename(ruta) != p["id"] + ".json":
                e = ["el archivo tiene que llamarse como su id"]
            if not e and os.path.basename(os.path.dirname(ruta)) != p["categoria"]:
                e = ["la carpeta tiene que ser su categoría"]
            print(("✗ " if e else "✓ ") + ruta + (": " + ", ".join(e) if e else ""))
            malos += bool(e)
        return 1 if malos else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
