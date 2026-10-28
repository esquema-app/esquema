#!/usr/bin/env python3
"""Todo lo que la interfaz necesita al abrir (respuesta `estado` del puente), salvo la carpeta (carpeta.py listar).

Uso: estado.py <salida.json>   → {config, ias, version, plantillas}
     estado.py config <entrada.json> <salida.json>   → guarda los cambios de config (solo claves conocidas) → {ok, config}
"""
import sys

import comun
import ia
import plantillas


def estado():
    return {"config": comun.config(), "ias": ia.lista(), "version": comun.VERSION, "plantillas": plantillas.listar()}


def main(args):
    if len(args) == 1:
        comun.responder(args[0], estado())
        return 0
    if len(args) == 3 and args[0] == "config":
        comun.responder(args[2], {"ok": True, "config": comun.guardar_config(comun.leer_json(args[1], {}) or {})})
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
