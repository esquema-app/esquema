#!/usr/bin/env python3
"""Arma ui/demo.json (la vista previa en el navegador) desde ejemplos/proyecto-ejemplo, plantillas/ y ejemplos/catalogo-ejemplo (una
copia de las plantillas del catálogo de la comunidad, para «Comunidad» en «Nuevo»). Todo ficticio.

Uso: python3 herramientas/generar_demo.py            (escribe ui/demo.json)
     python3 herramientas/generar_demo.py --revisar  (sale con 1 si ui/demo.json no está al día; lo usan las pruebas)
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "bin"))
import carpeta  # noqa: E402
import comun  # noqa: E402
import plantilla_formato  # noqa: E402
import plantillas  # noqa: E402
import proyecto  # noqa: E402

EJEMPLO = os.path.join(RAIZ, "ejemplos", "proyecto-ejemplo")
CATALOGO = os.path.join(RAIZ, "ejemplos", "catalogo-ejemplo")
IA_SIMULADA = os.path.join(RAIZ, "ejemplos", "ia-simulada")
# La carpeta de ejemplo vive dentro del repo de Esquema: su «git» es inventado (nunca la historia real de este repo).
GIT_FICTICIO = {"hay": True, "rama": "main", "ramas": ["main", "correos-en-cola"], "tags": ["v1.2.0", "v1.1.0"], "total": 48, "commits": [
    {"fecha": "2026-10-20", "mensaje": "La API responde sin esperar al correo"}, {"fecha": "2026-10-14", "mensaje": "Cola para los avisos de pago"},
    {"fecha": "2026-10-02", "mensaje": "Pantalla de pago más clara en el celular"}, {"fecha": "2026-09-18", "mensaje": "Autorización con Banco Ejemplo"}]}


def leer_texto(*partes):
    with open(os.path.join(*partes), encoding="utf-8") as f:
        return f.read()


def demo_proyecto():
    """Lo que la vista previa del navegador necesita para «Documentar un proyecto» con la carpeta de ejemplo (todo ficticio)."""
    proyecto.info_git = lambda base, commits=15: GIT_FICTICIO
    encontrado = proyecto.leer({"carpeta": EJEMPLO, "docs": "docs/esquema"})["encontrado"]
    rutas, _ = comun.recorrer(EJEMPLO, maximo=400)
    codigo = {r: leer_texto(EJEMPLO, *r.split("/")) for r in rutas if r.startswith("src/")}
    ia = {}
    for idioma in ("es", "en"):
        base = os.path.join(IA_SIMULADA, idioma)
        datos = json.loads(leer_texto(base, "ia.json"))
        inicial = [{"ruta": r, "titulo": t, "tipo": tipo, "texto": leer_texto(base, *r.split("/"))} for r, (t, tipo) in datos["titulos"].items()]
        ia[idioma] = {"inicial": inicial, "elementos": datos["elementos"], "nota": datos["nota"], "pide": datos["pide"], "notaPide": datos["notaPide"],
                      "flujo": {**datos["flujo"], "texto": leer_texto(base, "flujo.md")}}
    return {"encontrado": encontrado, "archivos": rutas, "codigo": codigo, "ia": ia}


def demo():
    lista = carpeta.listar(EJEMPLO)["archivos"]
    archivos = []
    for a in lista:
        with open(os.path.join(EJEMPLO, *a["ruta"].split("/")), encoding="utf-8") as f:
            archivos.append({"ruta": a["ruta"], "texto": f.read()})
    est = carpeta.estructura(EJEMPLO)
    return {
        "config": {"ia": "claude"},
        "ias": [{"id": "claude", "nombre": "Claude", "instalada": True}, {"id": "codex", "nombre": "ChatGPT (Codex)", "instalada": True},
                {"id": "gemini", "nombre": "Gemini", "instalada": False}],
        "version": comun.VERSION,
        "carpeta": {"nombre": "proyecto-ejemplo", "ruta": "~/Proyectos/proyecto-ejemplo"},
        "archivos": archivos,
        "plantillas": sorted(plantillas.incluidas(), key=lambda p: (p["categoria"], p["id"])),
        "catalogo": plantilla_formato.indice(CATALOGO)[0]["plantillas"],
        "estructura": {"archivos": est["archivos"], "omitidos": est["omitidos"], "manifiestos": est["manifiestos"]},
        "proyecto": demo_proyecto(),
    }


def main():
    texto = json.dumps(demo(), ensure_ascii=False, indent=1) + "\n"
    ruta = os.path.join(RAIZ, "ui", "demo.json")
    if "--revisar" in sys.argv:
        actual = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else ""
        if actual != texto:
            print("✗ ui/demo.json no está al día: corre python3 herramientas/generar_demo.py")
            return 1
        print("✓ ui/demo.json al día")
        return 0
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)
    print("✓ ui/demo.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
