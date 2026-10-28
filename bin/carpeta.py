#!/usr/bin/env python3
"""La carpeta de la persona: listar documentos y diagramas, leer, guardar y armar la estructura para el README.

Uso (el último argumento siempre es el JSON de salida):
  carpeta.py listar <carpeta> <salida.json>          → {ok, carpeta: {nombre, ruta}, archivos: [{ruta, tamano}]}
  carpeta.py leer <entrada.json> <salida.json>       entrada {carpeta, ruta}           → {ok, ruta, texto}
  carpeta.py guardar <entrada.json> <salida.json>    entrada {carpeta, ruta, texto, nuevo?} → {ok, ruta}
  carpeta.py estructura <carpeta> <salida.json>      → {ok, archivos: [rutas], omitidos, manifiestos}

Nunca borra ni mueve nada. Solo abre y escribe .md y .mmd dentro de la carpeta elegida (comun.ruta_en).
"""
import json
import os
import sys

import comun

try:
    import tomllib
except ImportError:  # Python < 3.11
    tomllib = None


def listar(carpeta):
    if not os.path.isdir(carpeta):
        return {"ok": False, "error": "No encontré esa carpeta."}
    rutas, _ = comun.recorrer(carpeta, maximo=20000, sin_secretos=False)
    archivos = []
    for r in rutas:
        if not r.lower().endswith(comun.EXTENSIONES):
            continue
        try:
            tam = os.path.getsize(os.path.join(carpeta, *r.split("/")))
        except OSError:
            continue
        if tam <= comun.MAXIMO_ARCHIVO:
            archivos.append({"ruta": r, "tamano": tam})
        if len(archivos) >= 2000:
            break
    base = os.path.realpath(carpeta)
    return {"ok": True, "carpeta": {"nombre": os.path.basename(base) or base, "ruta": base}, "archivos": archivos}


def leer(entrada):
    try:
        ruta = comun.ruta_en(entrada.get("carpeta", ""), entrada.get("ruta"))
    except ValueError as e:
        return {"ok": False, "ruta": entrada.get("ruta"), "error": str(e)}
    try:
        if os.path.getsize(ruta) > comun.MAXIMO_ARCHIVO:
            return {"ok": False, "ruta": entrada["ruta"], "error": "El archivo es demasiado grande (más de 2 MB)."}
        with open(ruta, encoding="utf-8", errors="replace", newline="") as f:
            texto = f.read()
    except OSError:
        return {"ok": False, "ruta": entrada["ruta"], "error": "No pude abrir el archivo."}
    return {"ok": True, "ruta": entrada["ruta"], "texto": texto}


def guardar(entrada):
    rel = entrada.get("ruta")
    texto = entrada.get("texto")
    if not isinstance(texto, str) or len(texto.encode("utf-8")) > comun.MAXIMO_ARCHIVO:
        return {"ok": False, "ruta": rel, "error": "No pude guardar: el texto no es válido o es demasiado grande."}
    try:
        ruta = comun.ruta_en(entrada.get("carpeta", ""), rel)
    except ValueError as e:
        return {"ok": False, "ruta": rel, "error": str(e)}
    if entrada.get("nuevo") and os.path.exists(ruta):
        return {"ok": False, "ruta": rel, "error": "Ya hay un archivo con ese nombre."}
    try:
        comun.escribir_atomico(ruta, texto)
    except OSError:
        return {"ok": False, "ruta": rel, "error": "No pude guardar el archivo."}
    return {"ok": True, "ruta": rel}


def manifiestos(carpeta, rutas):
    """De los archivos de proyecto conocidos, solo campos que describen (nombre, descripción, scripts, dependencias)."""
    r = {}
    def abrir(nombre):
        with open(os.path.join(carpeta, nombre), "rb") as f:
            return f.read(200_000)
    if "package.json" in rutas:
        try:
            d = json.loads(abrir("package.json"))
            r["package.json"] = {k: v for k, v in {
                "name": d.get("name") if isinstance(d.get("name"), str) else None,
                "description": d.get("description") if isinstance(d.get("description"), str) else None,
                "scripts": sorted(d["scripts"].keys())[:30] if isinstance(d.get("scripts"), dict) else None,
                "dependencias": sorted(list((d.get("dependencies") or {}).keys()) + list((d.get("devDependencies") or {}).keys()))[:60],
            }.items() if v}
        except (OSError, ValueError, AttributeError):
            pass
    if "pyproject.toml" in rutas and tomllib:
        try:
            p = tomllib.loads(abrir("pyproject.toml").decode("utf-8", "replace")).get("project", {})
            r["pyproject.toml"] = {k: p[k] for k in ("name", "description", "requires-python") if isinstance(p.get(k), str)}
            if isinstance(p.get("dependencies"), list):
                r["pyproject.toml"]["dependencias"] = [str(x)[:60] for x in p["dependencies"][:60]]
        except (OSError, ValueError):
            pass
    if "Cargo.toml" in rutas and tomllib:
        try:
            p = tomllib.loads(abrir("Cargo.toml").decode("utf-8", "replace")).get("package", {})
            r["Cargo.toml"] = {k: p[k] for k in ("name", "description") if isinstance(p.get(k), str)}
        except (OSError, ValueError):
            pass
    if "go.mod" in rutas:
        try:
            primera = abrir("go.mod").decode("utf-8", "replace").splitlines()[0]
            if primera.startswith("module "):
                r["go.mod"] = {"module": primera[7:].strip()[:120]}
        except (OSError, IndexError):
            pass
    return r


def estructura(carpeta):
    if not os.path.isdir(carpeta):
        return {"ok": False, "error": "No encontré esa carpeta."}
    rutas, omitidos = comun.recorrer(carpeta, maximo=400, profundidad=5)
    return {"ok": True, "archivos": rutas, "omitidos": omitidos, "manifiestos": manifiestos(carpeta, set(rutas))}


def main(args):
    if len(args) != 3 or args[0] not in ("listar", "leer", "guardar", "estructura"):
        print(__doc__)
        return 2
    orden, dato, salida = args
    if orden == "listar":
        r = listar(dato)
    elif orden == "estructura":
        r = estructura(dato)
    else:
        entrada = comun.leer_json(dato, {}) or {}
        r = leer(entrada) if orden == "leer" else guardar(entrada)
    comun.responder(salida, r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
