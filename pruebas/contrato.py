#!/usr/bin/env python3
"""Contrato entre la interfaz (ui/app.js) y las apps, escrito en pruebas/puente.json.

Revisa: 1) cada host.enviar("x") de la interfaz está en puente.json y simulado en simular() (la vista previa del navegador);
2) cada acción de puente.json la usa la interfaz; 3) cada respuesta de puente.json existe en window.Esquema (host.responder); 4) los scripts que
nombra el contrato existen en bin/; 5) las acciones declaradas (acciones.json, al día con app.json → «acciones»: proyecto, dibujar,
crearReadme, estructura y las de las piezas) con sus scripts, sus respuestas y la carpeta siempre inyectada; 6) la app de Mac (pieza
«host-mac» + lo que registra app/Sources/Esquema) y la de Windows/Linux (pieza «host-escritorio» + lo que registra escritorio/src/main.js)
atienden cada acción (registrada, del host o declarada), mandan todas las respuestas (también archivoCambiado, archivos y menu) y solo
llaman funciones que la interfaz tiene; 7) la seguridad de las apps (puente solo para el marco principal, navegación solo dentro de
ui/, sandbox y contextIsolation, rutas con dentro(), la carpeta nunca desde la interfaz, actualizaciones solo desde los Releases con
huella, Electron fijado y sin scripts de instalación); 8) la CSP."""
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
# La pieza «componentes» manda las suyas (probarIA, buscarActualizacion, actualizar, config, abrirEnlace) con su propio enviar().
acciones |= set(re.findall(r'\benviar\("(\w+)"', leer("ui/componentes.js") or ""))
contrato = set(puente["acciones"])
problemas += [f'La interfaz manda "{a}" y no está en pruebas/puente.json' for a in sorted(acciones - contrato)]
problemas += [f'puente.json tiene "{a}" y la interfaz no lo usa' for a in sorted(contrato - acciones)]
simulado = ui.split("function simular(", 1)[1].split("\n  }\n", 1)[0]
casos_web = set(re.findall(r'case "(\w+)"', simulado))
problemas += [f'La vista previa (simular) no responde "{a}"' for a in sorted(acciones - casos_web)]
cuerpo = ui.split("host.responder({", 1)[1].split("\n  });", 1)[0]  # pieza «host-ui»: las respuestas quedan en window.Esquema
funciones_ui = set(re.findall(r"^\s{4}(?:async\s+)?(\w+)\(", cuerpo, re.M))
problemas += [f'window.Esquema no tiene la respuesta "{r}"' for r in sorted(set(puente["respuestas"]) - funciones_ui)]
for a, d in puente["acciones"].items():
    if d["responde"] and d["responde"] not in puente["respuestas"]:
        problemas.append(f'"{a}" responde "{d["responde"]}", que no está en respuestas')
    for s in re.findall(r"bin/(\w+\.py)", d["como"]):
        if not os.path.exists(os.path.join(RAIZ, "bin", s)):
            problemas.append(f'"{a}" usa bin/{s}, que no existe')
# Plantillas de la comunidad (pieza «catálogo»): de qué repo y con qué validador lo dice app.json; los dos hosts lo leen de ahí.
cat_app = json.loads(leer("app.json")).get("catalogo") or {}
if cat_app.get("repo") != "esquema-app/esquema-catalogo" or (cat_app.get("tipos") or {}).get("plantillas", {}).get("validador") != "plantilla_formato":
    problemas.append("app.json: «catalogo» con repo esquema-app/esquema-catalogo y el tipo plantillas validado por plantilla_formato")
# Las respuestas que cada app tiene que mandar: lo que responde cada acción + los avisos de la carpeta vigilada + el menú.
respuestas_app = {d["responde"] for d in puente["acciones"].values() if d["responde"]} | {"archivoCambiado", "archivos", "menu", "proyectoProgreso"}


def tiene(texto, *patrones):
    return all(re.search(p, texto, re.S) for p in patrones)


# ───────────── Las acciones declaradas (acciones.json, lo arma pieza.py; las corren los hosts de Pieza) ─────────────
# Las que solo corren un script van en app.json → «acciones» (las de las piezas, en su pieza.json) y los dos hosts las atienden sin
# código propio: validan los datos por su tipo, ponen lo de «inyectar» (nunca de la interfaz), corren el script con su límite y
# responden. Lo nativo de Esquema (carpeta, archivos, Papelera, exportar, catálogo, actualizaciones en Mac) queda registrado.
app_json = json.loads(leer("app.json"))
acciones_json = json.loads(leer("acciones.json") or "{}").get("acciones") or {}
declaradas = set(acciones_json)
for n, d in (app_json.get("acciones") or {}).items():
    if {k: v for k, v in d.items() if k != "scriptDeLaApp"} != {k: v for k, v in acciones_json.get(n, {}).items() if k != "pieza"}:
        problemas.append(f'acciones.json no está al día con app.json en «{n}»: python3 <pieza>/herramientas/pieza.py acciones .')
for n, d in acciones_json.items():
    if n not in acciones | contrato:
        continue  # de una pieza y Esquema no la usa (p. ej. catalogoQuitar): el host la carga igual, la interfaz no la pide
    if not os.path.exists(os.path.join(RAIZ, "bin", d.get("script", ""))):
        problemas.append(f'la acción declarada «{n}» usa bin/{d.get("script")}, que no existe')
    for f in (d.get("responde"), d.get("progreso")):
        if f and f not in funciones_ui:
            problemas.append(f'la acción declarada «{n}» responde «{f}» y window.Esquema no la tiene')
    if "carpeta" in (d.get("datos") or {}):
        problemas.append(f'«{n}»: la carpeta nunca viene de la interfaz (va en «inyectar»)')
respuestas_declaradas = {f for d in acciones_json.values() for f in (d.get("responde"), d.get("progreso")) if f}
# Proyectos: una sola acción declarada para todo bin/proyecto.py. Solo sus órdenes (las mismas de ORDENES), la carpeta siempre la
# actual (inyectada; sin carpeta, "" y proyecto.py responde «Elige una carpeta primero» salvo SIN_CARPETA), el progreso en vivo.
py = leer("bin/proyecto.py")
ordenes_py = set(re.findall(r'"(\w+)": \w+', re.search(r"ORDENES = \{([^}]+)\}", py).group(1)))
p = acciones_json.get("proyecto") or {}
if p.get("script") != "proyecto.py" or p.get("args") != ["$orden"] or set((p.get("datos") or {}).get("orden", {}).get("valores") or []) != ordenes_py \
        or p.get("inyectar") != {"carpeta": "carpetaActual"} or (p.get("datos") or {}).get("*") != "pasar" or p.get("progreso") != "proyectoProgreso" \
        or p.get("eco") != ["orden"] or p.get("responde") != "proyectoRespuesta":
    problemas.append("app.json: «proyecto» declarada con $orden (las ORDENES de bin/proyecto.py), carpeta inyectada (carpetaActual), progreso proyectoProgreso y eco orden")
if not tiene(py, r'not entrada\.get\("carpeta"\)', r"args\[0\] not in SIN_CARPETA", r"Elige una carpeta primero"):
    problemas.append("bin/proyecto.py: sin carpeta, solo SIN_CARPETA corre (lo demás responde «Elige una carpeta primero»)")
for n in ("crearReadme", "estructura", "abrirArchivo", "guardarArchivo"):
    if (acciones_json.get(n) or {}).get("inyectar", {}).get("carpeta") != "carpetaActual":
        problemas.append(f"app.json: «{n}» con la carpeta inyectada (carpetaActual)")
# Límite por orden: las largas (CON_PROGRESO que corren con la IA, y generar) son "trabajo": sin tope mientras laten (pieza
# «trabajos» 0.2: Trabajo.latir o mantener_vivo); las demás con segundos.
lim = p.get("limite") or {}
largas = set(re.search(r"CON_PROGRESO = \(([^)]+)\)", py).group(1).replace('"', "").replace(" ", "").split(",")) - {"crear"} | {"generar"}
if not isinstance(lim, dict) or lim.get("segun") != "orden" or {o for o, v in (lim.get("valores") or {}).items() if v == "trabajo"} != largas \
        or not isinstance(lim.get("otro"), int) or "trabajos.mantener_vivo()" not in py:
    problemas.append("app.json: «proyecto» con límite por orden: " + ", ".join(sorted(largas)) + " como \"trabajo\" (generar late con trabajos.mantener_vivo) y segundos para lo demás")
# Abrir y guardar: bin/carpeta.py con «vigilar» (el vigilante del host conoce lo que Esquema lee y escribe, así no lo avisa como un
# cambio de afuera), la ruta como rutaRelativa .md/.mmd y el guardado en la fila (de a uno y en orden; salir y actualizar lo esperan).
ruta_md = {"tipo": "rutaRelativa", "extensiones": [".md", ".mmd"], "requerido": True}
ab, gu = acciones_json.get("abrirArchivo") or {}, acciones_json.get("guardarArchivo") or {}
if ab.get("script") != "carpeta.py" or ab.get("args") != ["leer"] or ab.get("vigilar") != "lee" or (ab.get("datos") or {}).get("ruta") != ruta_md \
        or ab.get("eco") != ["ruta"] or ab.get("responde") != "archivoAbierto":
    problemas.append("app.json: «abrirArchivo» declarada con carpeta.py leer, vigilar lee, ruta .md/.mmd y eco ruta")
if gu.get("script") != "carpeta.py" or gu.get("args") != ["guardar"] or gu.get("vigilar") != "escribe" or gu.get("cola") != "escritura" \
        or (gu.get("datos") or {}).get("ruta") != ruta_md or gu.get("eco") != ["ruta"] or gu.get("responde") != "archivoGuardado":
    problemas.append("app.json: «guardarArchivo» declarada con carpeta.py guardar, vigilar escribe, en la fila, ruta .md/.mmd y eco ruta")
if not tiene(leer("bin/carpeta.py"), r"def _sin_carpeta", r"def leer\(entrada\):\s+if _sin_carpeta", r"def guardar\(entrada\):.*?if _sin_carpeta"):
    problemas.append("bin/carpeta.py: leer y guardar sin carpeta (\"\" de la app) responden «Elige una carpeta primero» (nunca la carpeta de trabajo)")
# config: la carpeta solo la escribe la app (el selector del sistema o un reciente), nunca la acción config de la interfaz.
if (app_json.get("config") or {}).get("carpeta") != {"tipo": "texto", "interfaz": False}:
    problemas.append('app.json: config.carpeta tiene que ser {"tipo": "texto", "interfaz": false} (la interfaz nunca la cambia)')


def internas(texto, patron):
    """Lo que calza con el patrón, sin contar los comentarios (los ejemplos de las piezas nombran acciones que no existen)."""
    sin_comentarios = re.sub(r"^\s*(//|///|\*).*$", "", texto or "", flags=re.M)
    return set(re.findall(patron, sin_comentarios))


# ───────────── Mac (pieza «host-mac» en app/Sources/PiezaHost + lo propio en app/Sources/Esquema) ─────────────
carpeta_swift = os.path.join(RAIZ, "app/Sources/Esquema")
if os.path.isdir(carpeta_swift):
    swift = "".join(leer(os.path.join("app/Sources/Esquema", n)) for n in sorted(os.listdir(carpeta_swift)) if n.endswith(".swift"))
    puente_mac = (leer("app/Sources/PiezaHost/Puente.swift") or "") + (leer("app/Sources/PiezaHost/Carpeta.swift") or "")
    host_mac = "".join(leer(f"app/Sources/PiezaHost/{n}.swift") or "" for n in ("Host", "Procesador", "Enchufe")) + puente_mac
    registradas_mac = internas(swift, r'registrar\("(\w+)"')
    atiende_mac = registradas_mac | internas(puente_mac, r'internas\["(\w+)"\]') | declaradas
    problemas += [f'Mac no atiende "{a}" (ni registrada, ni del host, ni declarada)' for a in sorted((acciones | contrato) - atiende_mac)]
    llamadas_mac = internas(swift, r'llamar\("(\w+)"') | internas(puente_mac, r'llamar\("(\w+)"')
    problemas += [f"Mac llama window.Esquema.{f} y la interfaz no la tiene" for f in sorted(llamadas_mac - funciones_ui)]
    problemas += [f'Mac nunca responde "{f}"' for f in sorted(respuestas_app - llamadas_mac - respuestas_declaradas)]
    # Seguridad (la trae la pieza): el puente solo para el marco principal con un archivo de ui/; la ventana solo dentro de ui/;
    # enlaces solo https; el panel de archivos solo para la interfaz propia. Esquema no arma otra ventana ni otro puente.
    if not tiene(puente_mac, r"frameInfo\.isMainFrame", r'securityOrigin\.protocol == "file"', r"hasPrefix\(prefijoUI\)", r"decidePolicyFor",
                 r'u\.scheme == "https"', r'runOpenPanelWith.*?marco\.isMainFrame, marco\.securityOrigin\.protocol == "file"'):
        problemas.append("Mac: el puente de la pieza «host-mac» tiene que atender solo al marco principal con un archivo de ui/ y no navegar fuera (Puente.swift)")
    if re.search(r"WKWebView\(|WKScriptMessageHandler|NSApplicationDelegate", swift):
        problemas.append("Mac: la ventana, el puente y el delegado los pone la pieza «host-mac» (Esquema no arma otros)")
    if not tiene(host_mac, r"hasPrefix\(prefijo\)", r'env\[prefijo \+ "PROGRESO"\]', r"matarArbol") or not tiene(swift, r"Host\.arrancar\(", r"Procesador\.lectorProgreso = ", r"LectorProgreso\(prefijo: Host\.id",
                                                                                                               r'inyectores\["carpetaActual"\]'):
        problemas.append("Mac: Host.arrancar con el lector de progreso (pieza «trabajos») y la carpeta inyectada; el Procesador del host sin ESQUEMA_* de afuera y con límite")
    # La carpeta con el marcador de siempre («carpeta.marcador», config.carpeta: CarpetaElegida() sin argumentos) y el vigilante del
    # host; la Papelera solo con rutas revisadas por Enchufe.dentro (.md/.mmd); los recientes de proyectos.json.
    if not tiene(swift, r'static let extensiones = \["\.md", "\.mmd"\]', r"p\.carpeta = CarpetaElegida\(\)", r"p\.vigilante = Vigilante\(extensiones: extensiones\)",
                 r"static func papelera.*?Enchufe\.dentro\(base, ruta, extensiones: extensiones\).*?p\.papelera\(u\)", r"proyectos\.json",
                 r"p\.actualizaciones = \.init\(") \
            or re.search(r'registrar\("(abrirArchivo|guardarArchivo|buscarActualizacion|actualizar)"\)', swift) \
            or not tiene(leer("app/Sources/PiezaHost/Carpeta.swift") or "", r'marcador: String = "carpeta\.marcador", clave: String\? = "carpeta"'):
        problemas.append("Mac: carpeta con el marcador de siempre (CarpetaElegida), vigilante y actualizaciones del host, Papelera con Enchufe.dentro (.md/.mmd), abrir y guardar declarados, recientes de proyectos.json")
    act = leer("app/Sources/PiezaActualizaciones/Actualizaciones.swift") or ""
    paquete = leer("app/Package.swift") or ""
    if not tiene(act, r"/releases/download/", r"esDescargaNuestra\(zip, repo: c\.repo\)", r"shasum -a 256", r"comillas\(", r"--proto-redir '=https'") \
            or not tiene(swift, r'Actualizaciones\.configurar\(\.init\(repo: "esquema-app/esquema", nombre: "Esquema"') \
            or not tiene(paquete, r'\.target\(name: "PiezaActualizaciones"', r'\.target\(name: "PiezaHost"', r'dependencies: \["PiezaHost", "PiezaActualizaciones"'):
        problemas.append("Mac: las actualizaciones solo desde los Releases de esquema-app/esquema, con huella y comillas() (pieza «actualizaciones», configurada en EsquemaApp.swift) y el target PiezaHost")
    cat = leer("app/Sources/PiezaCatalogo/Catalogo.swift") or ""
    if not tiene(cat, r'host = "raw\.githubusercontent\.com"', r"SinRedirecciones", r"willPerformHTTPRedirection",
                 r"SHA256\.hash", r"calculada == huella", r"datos\.count == tamano", r'"catalogo\.py", "indice"', r'"catalogo\.py", "instalar"') \
            or not tiene(swift, r'Catalogo\.configurar\(appJSON: Host\.recursos\.appendingPathComponent\("app\.json"\)', r'Catalogo\.listar\("plantillas"\)',
                         r'Catalogo\.descargar\("plantillas", ') \
            or os.path.exists(os.path.join(RAIZ, "app/Sources/Esquema/Catalogo.swift")):
        problemas.append("Mac: el catálogo solo desde raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con tamaño y huella del índice validado (pieza «catálogo», configurada en EsquemaApp.swift)")
    if re.search(r'"(claude|codex)"\s*,\s*\[', swift):
        problemas.append("Mac: la app no llama a la IA por su cuenta (la corre bin/ia.py)")
    if "acciones.json" not in (leer("herramientas/empaquetar.sh") or ""):
        problemas.append("Mac: herramientas/empaquetar.sh tiene que copiar acciones.json junto a app.json")

# ───────────── Windows y Linux (pieza «host-escritorio» en escritorio/src/host.js + lo propio en main.js) ─────────────
escritorio = leer("escritorio/src/main.js")
if escritorio:
    host_js = leer("escritorio/src/host.js") or ""
    registradas_e = internas(escritorio, r'A\.registrar\("(\w+)"')
    internas_e = internas(host_js, r'internas\.set\("(\w+)"')
    atiende_e = registradas_e | internas_e | declaradas
    problemas += [f'Windows/Linux no atiende "{a}" (ni registrada, ni del host, ni declarada)' for a in sorted((acciones | contrato) - atiende_e)]
    if "actualizaciones: crearActualizaciones(" not in escritorio:
        problemas.append("Windows/Linux: el host atiende buscarActualizacion/actualizar solo si recibe la pieza «actualizaciones»")
    llamadas_e = internas(escritorio, r'llamar\("(\w+)"') | internas(host_js, r'llamar\("(\w+)"') | internas(leer("escritorio/src/vigilante.js"), r'llamar\("(\w+)"')
    problemas += [f"Windows/Linux llama window.Esquema.{f} y la interfaz no la tiene" for f in sorted(llamadas_e - funciones_ui)]
    problemas += [f'Windows/Linux nunca responde "{f}"' for f in sorted(respuestas_app - llamadas_e - respuestas_declaradas)]
    if not tiene(host_js, r"contextIsolation: true", r"sandbox: true", r"nodeIntegration: false", r"webviewTag: false", r"ipcMain\.on\(id, alMensaje\)",
                 r"e\.sender === ventana\.webContents", r"if \(!principal && !otra\) return", r"e\.senderFrame !== e\.sender\.mainFrame", r"startsWith\(ORIGEN\)", r'"will-navigate"',
                 r"setWindowOpenHandler", r"setPermissionRequestHandler", r'u\.protocol === "https:"'):
        problemas.append("Windows/Linux: la pieza «host-escritorio» tiene que dar la ventana con sandbox y el puente solo para el marco principal propio (host.js)")
    if re.search(r"new BrowserWindow|ipcMain|webPreferences|preload:", escritorio):
        problemas.append("Windows/Linux: la ventana y el puente los pone la pieza «host-escritorio» (main.js no arma otros)")
    precarga = leer("escritorio/src/preload.js") or ""
    if not tiene(precarga, r"--pieza-host=", r"exposeInMainWorld\(`\$\{id\.toUpperCase\(\)\}_HOST`", r"exposeInMainWorld\(`\$\{id\}Escritorio`") or precarga.count("exposeInMainWorld") != 2:
        problemas.append("Windows/Linux: preload.js (pieza «host-escritorio») solo expone ESQUEMA_HOST y esquemaEscritorio.enviar")
    if not tiene(escritorio, r"crearHost\(\{", r"lectorProgreso,", r'inyectar: \{ carpetaActual: ', r'carpeta: \{ clave: "carpeta" \}',
                 r"vigilar: \{ extensiones: EXTENSIONES, alCambiar: ", r'const EXTENSIONES = \["\.md", "\.mmd"\]',
                 r"host\.dentro\(base, ruta, \{ extensiones: EXTENSIONES \}\)",
                 r'A\.registrar\("papelera".*?absoluta\(ruta, base\).*?host\.papelera\(abs\)', r'"proyectos\.json"') \
            or re.search(r'A\.registrar\("(abrirArchivo|guardarArchivo)"', escritorio) \
            or not tiene(leer("escritorio/src/vigilante.js") or "", r"dentro\(this\.base, relativa, \{ extensiones: this\.extensiones \}\)") \
            or not tiene(leer("escritorio/src/progreso.js") or "", r"function lectorProgreso", r"cada = 500"):
        problemas.append("Windows/Linux: crearHost con el lector de progreso, la carpeta (config.carpeta) y su vigilante; rutas con dentro() (.md/.mmd), Papelera solo con ellas, abrir y guardar declarados y recientes de proyectos.json")
    act = leer("escritorio/src/actualizaciones.js") or ""
    if not tiene(act, r"/releases/download/", r"esDescargaNuestra\(archivo, o\.repo\)", r"huella !== esperada", r"leerHuella") \
            or not tiene(escritorio, r'crearActualizaciones\(\{ app, net, repo: "esquema-app/esquema", nombre: "Esquema" \}\)'):
        problemas.append("Windows/Linux: las actualizaciones solo desde los Releases de esquema-app/esquema, con huella (pieza «actualizaciones», configurada en main.js)")
    cat = leer("escritorio/src/catalogo.js") or ""
    if not tiene(cat, r'HOST = "raw\.githubusercontent\.com"', r'redirect: "error"', r"huella !== e\.sha256",
                 r"datos\.length !== e\.tamano", r'"catalogo\.py", "indice"', r'"catalogo\.py", "instalar"') \
            or not tiene(escritorio, r'appJson: leerJSON\(path\.join\(host\.recursos, "app\.json"\)', r'Catalogo\.listar\("plantillas"\)',
                         r'Catalogo\.descargar\("plantillas", '):
        problemas.append("Windows/Linux: el catálogo solo desde raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con tamaño y huella (catalogo.js)")
    paquete = json.loads(leer("escritorio/package.json"))
    if not any(x.get("from") == "../acciones.json" and x.get("to") == "esquema/acciones.json" for x in paquete.get("build", {}).get("extraResources", [])):
        problemas.append("Windows/Linux: acciones.json va dentro de la app junto a app.json (extraResources de escritorio/package.json)")
    version = paquete.get("devDependencies", {}).get("electron", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version) or tuple(map(int, version.split("."))) < (44, 9, 1):
        problemas.append(f"Windows/Linux: Electron con versión exacta y 44.9.1 o más nueva (arreglo de certificados), no «{version}»")
    if any(not re.fullmatch(r"\d+\.\d+\.\d+", v) for v in paquete.get("devDependencies", {}).values()):
        problemas.append("Windows/Linux: las dependencias van con versión exacta")
    if "ignore-scripts=true" not in (leer("escritorio/.npmrc") or "") or not leer("escritorio/package-lock.json"):
        problemas.append("Windows/Linux: .npmrc con ignore-scripts=true y package-lock.json versionado")
    if paquete.get("version") != (re.search(r"<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>", leer("app/Info.plist") or "") or [None, None])[1]:
        problemas.append("La versión de escritorio/package.json y la de app/Info.plist tienen que ser iguales (publicar.yml)")
# ───────────── Mac, Windows y Linux (pieza «host-tauri» en escritorio/src/pieza/ + lo propio en escritorio/src/main.rs) ─────────────
tauri = leer("escritorio/src/main.rs")
if tauri:
    host_rs = leer("escritorio/src/pieza/host.rs") or ""
    interna = host_rs[host_rs.find("fn interna("):]
    interna = interna[:interna.find("\n    }\n")]
    registradas_t = internas(tauri, r'\.registrar\("(\w+)"')
    internas_t = set(re.findall(r'^\s*"(\w+)"(?:\s+if\s[^=]*)?\s*=>', interna, re.M))
    atiende_t = registradas_t | internas_t | declaradas
    problemas += [f'Mac/Windows/Linux no atiende "{a}" (ni registrada, ni del host, ni declarada)' for a in sorted((acciones | contrato) - atiende_t)]
    if 'actualizaciones::Actualizaciones::nuevas("esquema-app/esquema", "Esquema")' not in tauri:
        problemas.append("Mac/Windows/Linux: el host atiende buscarActualizacion/actualizar solo si recibe la pieza «actualizaciones» (main.rs)")
    llamadas_t = internas(tauri, r'llamar\("(\w+)"') | internas(host_rs, r'llamar\("(\w+)"')
    problemas += [f"Mac/Windows/Linux llama window.Esquema.{f} y la interfaz no la tiene" for f in sorted(llamadas_t - funciones_ui - {"soltados", "soltando"})]
    problemas += [f'Mac/Windows/Linux nunca responde "{f}"' for f in sorted(respuestas_app - llamadas_t - respuestas_declaradas)]
    if not tiene(host_rs, r"etiqueta == PRINCIPAL \|\| host\.otras", r'starts_with\(&format!\("\{\}ui/", host\.base\)\)', r"NewWindowResponse::Deny",
                 r"if u\.as_str\(\)\.starts_with\(&ui\)", r"window\.top !== window"):
        problemas.append("Mac/Windows/Linux: el puente de «host-tauri» solo para las ventanas propias con su página en ui/, sin navegar fuera ni abrir ventanas (host.rs)")
    conf = json.loads(leer("escritorio/tauri.conf.json") or "{}")
    if conf.get("identifier") != "app.esquema.mac":
        problemas.append("escritorio/tauri.conf.json: el identificador sigue siendo app.esquema.mac (el permiso de la carpeta y la firma lo siguen)")
    if (conf.get("app") or {}).get("withGlobalTauri"):
        problemas.append("escritorio/tauri.conf.json: la página no ve la API de Tauri (withGlobalTauri: false)")
    rec = (conf.get("bundle") or {}).get("resources") or {}
    for r in ("../app.json", "../acciones.json", "../bin/", "../ui/", "../plantillas/", "../tipos/"):
        if r not in rec:
            problemas.append(f"escritorio/tauri.conf.json: {r} va dentro de la app (bundle.resources)")
    if conf.get("version") != app_json.get("version"):
        problemas.append("La versión de escritorio/tauri.conf.json y la de app.json tienen que ser iguales (pieza.py generar .)")
    if re.search(r'"(claude|codex|gemini)"', tauri):
        problemas.append("Mac/Windows/Linux: la app no llama a ninguna IA por su cuenta (eso es de bin/ia.py)")
html = leer("ui/index.html")
csp = re.search(r'Content-Security-Policy" content="([^"]+)"', html)
if not csp or "script-src 'self'" not in csp.group(1) or "'unsafe-eval'" in csp.group(1) or "object-src 'none'" not in csp.group(1):
    problemas.append("ui/index.html: la CSP tiene que tener script-src 'self' (sin unsafe-eval) y object-src 'none'")
if re.search(r"<script>|\son\w+=", html) or re.search(r"\son(click|load|error|input)=", ui_todo):
    problemas.append("Nada de scripts ni manejadores en línea (la CSP los bloquea)")
if problemas:
    print("✗ Contrato roto:\n  - " + "\n  - ".join(problemas))
    sys.exit(1)
print(f"✓ Contrato: {len(acciones)} acciones y {len(funciones_ui)} funciones en orden en la interfaz" + (", Mac" if os.path.isdir(carpeta_swift) else "") + (", Windows y Linux" if escritorio else "") + (", Mac, Windows y Linux (host-tauri)" if tauri else ""))
