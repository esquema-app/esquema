#!/usr/bin/env python3
"""Ejemplo de cómo construir encima del formato abierto de Esquema: lista los diagramas de una carpeta, sueltos (.mmd) y dentro de
documentos (bloques ```mermaid de los .md), con su tipo y cuántas líneas tienen. Solo biblioteca estándar.

Uso: python3 ejemplos/listar_diagramas.py <carpeta>
"""
import os
import re
import sys

TIPOS = {"flowchart": "flujo", "graph": "flujo", "sequenceDiagram": "secuencia"}


def tipo(texto):
    for linea in texto.splitlines():
        l = linea.strip()
        if l and not l.startswith("%%") and l != "---":
            palabra = l.split()[0]
            return TIPOS.get(palabra, palabra)
    return "vacío"


def diagramas(carpeta):
    for raiz, dirs, archivos in os.walk(carpeta):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]
        for a in sorted(archivos):
            ruta = os.path.join(raiz, a)
            rel = os.path.relpath(ruta, carpeta)
            if a.endswith(".mmd"):
                texto = open(ruta, encoding="utf-8").read()
                yield rel, tipo(texto), texto.count("\n") + 1
            elif a.endswith(".md"):
                texto = open(ruta, encoding="utf-8").read()
                for k, m in enumerate(re.finditer(r"^```mermaid[^\n]*\n(.*?)^```", texto, re.S | re.M), 1):
                    yield f"{rel} (diagrama {k})", tipo(m.group(1)), m.group(1).count("\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    for nombre, t, lineas in diagramas(sys.argv[1]):
        print(f"{t:10} {lineas:4} líneas  {nombre}")
