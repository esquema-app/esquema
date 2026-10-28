#!/usr/bin/env python3
"""Plantillas: las incluidas en la app (plantillas/<categoria>/<id>.json) y las descargadas del catálogo de la comunidad
(<carpeta de Esquema>/plantillas/<id>.json, ganan sobre las incluidas con el mismo id). Formato en plantilla_formato.py.

Uso:
  plantillas.py listar <salida.json>                 → {ok, plantillas: [...]}
  plantillas.py validar <archivo.json>…              → muestra los problemas (para el catálogo y las pruebas); sale con 1 si hay alguno
  plantillas.py indice <raiz> <salida.json>          → índice del catálogo de <raiz>/plantillas/ (plantilla_formato.indice):
                                                       {formato, plantillas: [{…plantilla, ruta, sha256, tamano}]}
  plantillas.py catalogo <index.json> <salida.json>  → el índice que bajó la app, validado: {ok, plantillas} (solo lo que sirve)
  plantillas.py instalar <entrada.json> <salida.json> → {archivo, id, sha256}: una plantilla que bajó la app; se revisa su huella y su
                                                       formato otra vez y queda en <carpeta de Esquema>/plantillas/<id>.json → {ok, plantilla}
La app (Catalogo.swift, escritorio/src/catalogo.js) baja todo solo desde raw.githubusercontent.com/esquema-app/esquema-catalogo/main/,
sin redirecciones, con tamaño máximo y comparando la huella del índice; aquí se valida.
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
            if os.path.getsize(ruta) > plantilla_formato.MAX_BYTES:
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


def catalogo(ruta):
    """El índice que bajó la app (archivo temporal): solo las entradas válidas."""
    if os.path.getsize(ruta) > plantilla_formato.MAX_INDICE:
        raise ValueError("No pude leer el catálogo.")
    d = comun.leer_json(ruta)
    if not isinstance(d, dict) or d.get("formato") != plantilla_formato.FORMATO:
        raise ValueError("No pude leer el catálogo.")
    return {"ok": True, "plantillas": plantilla_formato.validar_indice(d)}


def instalar(d):
    """Una plantilla que bajó la app: huella, id y formato otra vez, y se guarda en la carpeta de Esquema (nunca en la de la persona)."""
    if not isinstance(d, dict) or not all(isinstance(d.get(k), str) for k in ("archivo", "id", "sha256")):
        raise ValueError("Esa plantilla no es válida.")
    with open(d["archivo"], "rb") as f:
        crudo = f.read(plantilla_formato.MAX_BYTES + 1)
    if len(crudo) > plantilla_formato.MAX_BYTES or hashlib.sha256(crudo).hexdigest() != d["sha256"]:
        raise ValueError("La plantilla llegó dañada. Intenta de nuevo.")
    try:
        p = json.loads(crudo.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ValueError("Esa plantilla no es válida.") from None
    if plantilla_formato.validar(p) or p["id"] != d["id"]:
        raise ValueError("Esa plantilla no es válida.")
    comun.carpeta_privada(comun.carpeta_app())
    carpeta = comun.carpeta_privada(os.path.join(comun.carpeta_app(), "plantillas"))
    comun.escribir_json(os.path.join(carpeta, p["id"] + ".json"), p)
    return {"ok": True, "plantilla": p}


def main(args):
    if args[:1] == ["listar"] and len(args) == 2:
        comun.responder(args[1], {"ok": True, "plantillas": listar()})
        return 0
    if args[:1] == ["indice"] and len(args) == 3:
        datos, problemas = plantilla_formato.indice(args[1])
        for p in problemas:
            print("✗ " + p)
        comun.responder(args[2], datos)
        return 1 if problemas else 0
    if args[:1] in (["catalogo"], ["instalar"]) and len(args) == 3:
        try:
            r = catalogo(args[1]) if args[0] == "catalogo" else instalar(comun.leer_json(args[1]))
        except (OSError, ValueError) as e:
            r = {"ok": False, "error": str(e)}
        comun.responder(args[2], r)
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
