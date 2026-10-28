#!/usr/bin/env python3
"""Contrato entre la interfaz (ui/app.js) y las apps, escrito en pruebas/puente.json.

Revisa: 1) cada host.enviar("x") de la interfaz está en puente.json y simulado en simular() (la vista previa del navegador);
2) cada acción de puente.json la usa la interfaz; 3) cada respuesta de puente.json existe en window.Esquema; 4) los scripts que
nombra el contrato existen en bin/; 5) la app de Mac (Ventana.swift, un `case` por acción) y la de Windows/Linux (escritorio/src/main.js, objeto ACCIONES)
atienden todas las acciones, mandan todas las respuestas (también archivoCambiado, archivos y menu) y solo llaman funciones que la
interfaz tiene; 6) la seguridad de las apps (puente solo para el marco principal, navegación solo dentro de ui/, sandbox y
contextIsolation, actualizaciones solo desde los Releases con huella, Electron fijado y sin scripts de instalación); 7) la CSP."""
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leer(r):
    ruta = os.path.join(RAIZ, r)
    if not os.path.exists(ruta):
        return None
    with open(ruta, encoding="utf-8") as f:
        return f.read()


ui = leer("ui/app.js")
ui_todo = ui + leer("ui/proyectos.js")  # el módulo de proyectos también llama host.enviar
puente = json.loads(leer("pruebas/puente.json"))
problemas = []
acciones = set(re.findall(r'host\.enviar\("(\w+)"', ui_todo))
contrato = set(puente["acciones"])
problemas += [f'La interfaz manda "{a}" y no está en pruebas/puente.json' for a in sorted(acciones - contrato)]
problemas += [f'puente.json tiene "{a}" y la interfaz no lo usa' for a in sorted(contrato - acciones)]
simulado = ui.split("function simular(", 1)[1].split("\n  }\n", 1)[0]
casos_web = set(re.findall(r'case "(\w+)"', simulado))
problemas += [f'La vista previa (simular) no responde "{a}"' for a in sorted(acciones - casos_web)]
cuerpo = ui.split("window.Esquema = {", 1)[1].split("\n  };", 1)[0]
funciones_ui = set(re.findall(r"^\s{4}(?:async\s+)?(\w+)\(", cuerpo, re.M))
problemas += [f'window.Esquema no tiene la respuesta "{r}"' for r in sorted(set(puente["respuestas"]) - funciones_ui)]
for a, d in puente["acciones"].items():
    if d["responde"] and d["responde"] not in puente["respuestas"]:
        problemas.append(f'"{a}" responde "{d["responde"]}", que no está en respuestas')
    for s in re.findall(r"bin/(\w+\.py)", d["como"]):
        if not os.path.exists(os.path.join(RAIZ, "bin", s)):
            problemas.append(f'"{a}" usa bin/{s}, que no existe')
# Las respuestas que cada app tiene que mandar: lo que responde cada acción + los avisos de la carpeta vigilada + el menú.
respuestas_app = {d["responde"] for d in puente["acciones"].values() if d["responde"]} | {"archivoCambiado", "archivos", "menu"}


def tiene(texto, *patrones):
    return all(re.search(p, texto, re.S) for p in patrones)


mac = leer("app/Sources/Esquema/Ventana.swift")
if mac is not None:
    casos_mac = set(re.findall(r'"(\w+)"', " ".join(re.findall(r"case ([^:]+):", mac))))
    problemas += [f'Mac (Ventana.swift) no atiende "{a}"' for a in sorted((acciones | contrato) - casos_mac)]
    carpeta_swift = os.path.join(RAIZ, "app/Sources/Esquema")
    swift = "".join(leer(os.path.join("app/Sources/Esquema", n)) for n in sorted(os.listdir(carpeta_swift)) if n.endswith(".swift"))
    llamadas_mac = set(re.findall(r'llamar\("(\w+)"', swift))
    problemas += [f"Mac llama window.Esquema.{f} y la interfaz no la tiene" for f in sorted(llamadas_mac - funciones_ui)]
    problemas += [f'Mac nunca responde "{f}"' for f in sorted(respuestas_app - llamadas_mac)]
    # Seguridad: el puente solo para el marco principal con origen file; la ventana solo navega dentro de ui/; enlaces solo https.
    if not tiene(mac, r"frameInfo\.isMainFrame", r'securityOrigin\.protocol == "file"'):
        problemas.append("Mac: el puente tiene que atender solo al marco principal con origen file (Ventana.swift)")
    if not tiene(mac, r"decidePolicyFor", r"hasPrefix\(carpetaUI\)", r'scheme == "https"'):
        problemas.append("Mac: la ventana solo puede navegar dentro de ui/ y abrir https en el navegador (Ventana.swift)")
    act = leer("app/Sources/Esquema/Actualizaciones.swift") or ""
    if not tiene(act, r'repo = "esquema-app/esquema"', r"/releases/download/", r"esDescargaNuestra\(z\)", r"shasum -a 256", r"comillas\("):
        problemas.append("Mac: las actualizaciones solo desde los Releases de esquema-app/esquema, con huella y comillas() (Actualizaciones.swift)")
    cat = leer("app/Sources/Esquema/Catalogo.swift") or ""
    if not tiene(cat, r'base = "https://raw\.githubusercontent\.com/esquema-app/esquema-catalogo/main/"', r"SinRedirecciones", r"willPerformHTTPRedirection",
                 r"SHA256\.hash", r"calculada == huella", r"datos\.count == tamano", r'"plantillas\.py", \["catalogo"', r'"plantillas\.py", "instalar"'):
        problemas.append("Mac: el catálogo solo desde raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con tamaño y huella del índice validado (Catalogo.swift)")
    if re.search(r'"(claude|codex)"\s*,\s*\[', swift) and "--disallowedTools" not in swift:
        problemas.append("Mac: si la app llama a la IA, tiene que ser sin herramientas")
    if "carpeta" in re.search(r"static func guardar\(_ cambios.*?\n    \}", swift, re.S).group(0).split("default:")[0].split("switch k")[1]:
        problemas.append("Mac: la acción config no puede cambiar la carpeta (Servicios.swift)")
escritorio = leer("escritorio/src/main.js")
if escritorio:
    casos_e = set(re.findall(r"^\s{2}(?:async\s+)?(\w+)\s*\(", escritorio.split("const ACCIONES = {", 1)[1].split("\n};", 1)[0], re.M))
    problemas += [f'Windows/Linux (ACCIONES) no atiende "{a}"' for a in sorted((acciones | contrato) - casos_e)]
    llamadas_e = set(re.findall(r'llamar\("(\w+)"', escritorio)) | set(re.findall(r'avisar\("(\w+)"', leer("escritorio/src/vigilante.js") or ""))
    problemas += [f"Windows/Linux llama window.Esquema.{f} y la interfaz no la tiene" for f in sorted(llamadas_e - funciones_ui)]
    problemas += [f'Windows/Linux nunca responde "{f}"' for f in sorted(respuestas_app - llamadas_e)]
    if not tiene(escritorio, r"contextIsolation: true", r"sandbox: true", r"nodeIntegration: false", r"webviewTag: false"):
        problemas.append("Windows/Linux: la ventana necesita contextIsolation, sandbox, sin nodeIntegration ni webview (main.js)")
    if not tiene(escritorio, r'ipcMain\.on\("esquema"', r"e\.sender !== ventana\.webContents", r"e\.senderFrame !== e\.sender\.mainFrame", r"startsWith\(ORIGEN\)"):
        problemas.append("Windows/Linux: el puente solo atiende al marco principal de la ventana propia (main.js)")
    if not tiene(escritorio, r'"will-navigate"', r"setWindowOpenHandler", r"setPermissionRequestHandler", r'u\.protocol === "https:"'):
        problemas.append("Windows/Linux: la ventana no puede navegar fuera de ui/ ni abrir ventanas; enlaces solo https (main.js)")
    precarga = leer("escritorio/src/preload.js") or ""
    if set(re.findall(r'exposeInMainWorld\("(\w+)"', precarga)) != {"ESQUEMA_HOST", "esquemaEscritorio"}:
        problemas.append("Windows/Linux: preload.js solo expone ESQUEMA_HOST y esquemaEscritorio.enviar")
    act = leer("escritorio/src/actualizaciones.js") or ""
    if not tiene(act, r'REPO = "esquema-app/esquema"', r"/releases/download/", r"esDescargaNuestra\(url\(inst\.archivo\)\)", r"huella !== esperada"):
        problemas.append("Windows/Linux: las actualizaciones solo desde los Releases de esquema-app/esquema, con huella (actualizaciones.js)")
    cat = leer("escritorio/src/catalogo.js") or ""
    if not tiene(cat, r'BASE = "https://raw\.githubusercontent\.com/esquema-app/esquema-catalogo/main/"', r'redirect: "error"', r"huella !== e\.sha256",
                 r"datos\.length !== e\.tamano", r'"plantillas\.py", \["catalogo"', r'"plantillas\.py", "instalar"') or "crearCatalogo" not in escritorio:
        problemas.append("Windows/Linux: el catálogo solo desde raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con tamaño y huella (catalogo.js)")
    paquete = json.loads(leer("escritorio/package.json"))
    version = paquete.get("devDependencies", {}).get("electron", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version) or tuple(map(int, version.split("."))) < (44, 9, 1):
        problemas.append(f"Windows/Linux: Electron con versión exacta y 44.9.1 o más nueva (arreglo de certificados), no «{version}»")
    if any(not re.fullmatch(r"\d+\.\d+\.\d+", v) for v in paquete.get("devDependencies", {}).values()):
        problemas.append("Windows/Linux: las dependencias van con versión exacta")
    if "ignore-scripts=true" not in (leer("escritorio/.npmrc") or "") or not leer("escritorio/package-lock.json"):
        problemas.append("Windows/Linux: .npmrc con ignore-scripts=true y package-lock.json versionado")
    if paquete.get("version") != (re.search(r"<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>", leer("app/Info.plist") or "") or [None, None])[1]:
        problemas.append("La versión de escritorio/package.json y la de app/Info.plist tienen que ser iguales (publicar.yml)")
# Proyectos: las apps solo pasan a bin/proyecto.py las órdenes que el script conoce (la misma lista en los tres lados), y un
# reciente se abre por su posición en proyectos.json (la ruta nunca viene de la interfaz).
ordenes_py = set(re.findall(r'"(\w+)": \w+', re.search(r"ORDENES = \{([^}]+)\}", leer("bin/proyecto.py")).group(1)))
if mac is not None:
    om = re.search(r"ordenesProyecto: Set<String> = \[([^\]]+)\]", mac)
    if not om or set(re.findall(r'"(\w+)"', om.group(1))) != ordenes_py:
        problemas.append("Mac: Ventana.ordenesProyecto tiene que ser igual a ORDENES de bin/proyecto.py")
    if not tiene(mac, r'case "proyecto":.*?ordenesProyecto\.contains\(orden\)', r'proyectos\.json'):
        problemas.append("Mac: la acción proyecto revisa la orden y abrirProyecto lee la ruta de proyectos.json")
if escritorio:
    oe = re.search(r"ORDENES_PROYECTO = \[([^\]]+)\]", escritorio)
    if not oe or set(re.findall(r'"(\w+)"', oe.group(1))) != ordenes_py:
        problemas.append("Windows/Linux: ORDENES_PROYECTO tiene que ser igual a ORDENES de bin/proyecto.py")
    if not tiene(escritorio, r"ORDENES_PROYECTO\.includes\(d\.orden\)", r'"proyectos\.json"'):
        problemas.append("Windows/Linux: la acción proyecto revisa la orden y abrirProyecto lee la ruta de proyectos.json")
html = leer("ui/index.html")
csp = re.search(r'Content-Security-Policy" content="([^"]+)"', html)
if not csp or "script-src 'self'" not in csp.group(1) or "'unsafe-eval'" in csp.group(1) or "object-src 'none'" not in csp.group(1):
    problemas.append("ui/index.html: la CSP tiene que tener script-src 'self' (sin unsafe-eval) y object-src 'none'")
if re.search(r"<script>|\son\w+=", html) or re.search(r"\son(click|load|error|input)=", ui_todo):
    problemas.append("Nada de scripts ni manejadores en línea (la CSP los bloquea)")
if problemas:
    print("✗ Contrato roto:\n  - " + "\n  - ".join(problemas))
    sys.exit(1)
print(f"✓ Contrato: {len(acciones)} acciones y {len(funciones_ui)} funciones en orden en la interfaz" + (", Mac" if mac else "") + (", Windows y Linux" if escritorio else ""))
