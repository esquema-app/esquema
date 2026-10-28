"""Trabajos largos en segundo plano (documentar un proyecto, y lo que venga: historias de usuario, libros…). Solo biblioteca estándar.

Un trabajo corre por etapas y deja TODO en disco a medida que avanza, así nada se pierde si se cierra la ventana o la app:
- su estado en <carpeta de Esquema>/trabajos/<id>.json (nunca en la carpeta de la persona), escrito de una vez en cada cambio;
- sus eventos, línea por línea (JSONL), en el archivo que dice ESQUEMA_PROGRESO (lo pone la app y lo lee cada ~0,5 s para pasarlo a
  la interfaz como `proyectoProgreso`): {"t": "estado", "trabajo": <vista>} en cada cambio de estado y {"t": "lee" | "busca", …}
  por cada archivo que lee la IA;
- un «latido» cada pocos segundos: si el estado dice «corriendo» y el latido es viejo, el proceso murió (la app se cerró) y el trabajo
  queda «interrumpido», listo para «Seguir» (lo ya hecho no se repite);
- «Detener» deja el archivo trabajos/<id>.detener: el trabajo lo ve, corta la IA y queda «detenido».

Cómo se agrega un tipo de trabajo nuevo: ver AGENTS.md («Trabajos»). En corto: un módulo con ETAPAS y una función correr(t) que
avanza con t.etapa(...), t.items, t.guardar() y t.detenido(); se registra en TIPOS (proyecto.py) y la interfaz lo muestra con la
misma tarjeta (etapas + lista de ítems con su estado).
"""
import datetime
import json
import os
import re
import threading
import time

import comun

LATIDO = 5          # segundos entre latidos
MUERTO = 45         # sin latido por más que esto = el proceso ya no está
MAX_GUARDADOS = 40  # trabajos viejos que se conservan


def carpeta():
    return os.path.join(comun.carpeta_app(), "trabajos")


def ahora():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def id_valido(i):
    return isinstance(i, str) and re.fullmatch(r"\d{8}T\d{6}-[0-9a-f]{6}", i) is not None


_lock_progreso = threading.Lock()


def emitir(evento):
    """Una línea de progreso para la app (si la app la pidió con ESQUEMA_PROGRESO)."""
    ruta = os.environ.get("ESQUEMA_PROGRESO")
    if not ruta:
        return
    linea = json.dumps(evento, ensure_ascii=False) + "\n"
    with _lock_progreso:
        try:
            with open(ruta, "a", encoding="utf-8") as f:
                f.write(linea)
        except OSError:
            pass


class Trabajo:
    """Estado de un trabajo: {formato, id, tipo, proyecto (carpeta abierta, absoluta), estado, etapa, etapas, inicio, fin, latido,
    datos (lo propio del tipo), items (la lista visible: [{ruta, titulo, tipo, estado, error?}]), leidos, leyendo, error}."""

    def __init__(self, x):
        self.x = x
        self._lock = threading.RLock()
        self._latiendo = False

    # ── crear y cargar ──
    @classmethod
    def nuevo(cls, tipo, proyecto, etapas, datos):
        i = datetime.datetime.now().strftime("%Y%m%dT%H%M%S") + "-" + os.urandom(3).hex()
        t = cls({"formato": 1, "id": i, "tipo": tipo, "proyecto": proyecto, "estado": "corriendo", "etapa": etapas[0],
                 "etapas": list(etapas), "hechas": [], "inicio": ahora(), "latido": time.time(), "datos": datos, "items": [],
                 "leidos": 0, "leyendo": "", "error": ""})
        t.guardar()
        limpiar_viejos()
        return t

    @classmethod
    def cargar(cls, i):
        if not id_valido(i):
            raise ValueError("No encontré ese trabajo.")
        x = comun.leer_json(os.path.join(carpeta(), i + ".json"), None)
        if not isinstance(x, dict) or x.get("formato") != 1:
            raise ValueError("No encontré ese trabajo.")
        return cls(x)

    @property
    def id(self):
        return self.x["id"]

    def guardar(self, emitir_estado=True):
        with self._lock:
            comun.carpeta_privada(carpeta())
            comun.escribir_json(os.path.join(carpeta(), self.id + ".json"), self.x)
            if emitir_estado:
                emitir({"t": "estado", "trabajo": self.vista()})

    # ── avanzar ──
    def etapa(self, nombre):
        with self._lock:
            if self.x["etapa"] not in self.x["hechas"] and self.x["etapa"] != nombre:
                self.x["hechas"].append(self.x["etapa"])
            self.x["etapa"] = nombre
            self.guardar()

    def terminar(self, estado, error=""):
        with self._lock:
            if estado == "listo" and self.x["etapa"] not in self.x["hechas"]:
                self.x["hechas"].append(self.x["etapa"])
            # Lo que quedó a medias vuelve a la cola: «Seguir» lo retoma.
            for i in self.x["items"]:
                if i.get("estado") == "escribiendo":
                    i["estado"] = "cola"
            self.x.update({"estado": estado, "fin": ahora(), "error": str(error)[:600], "leyendo": ""})
            self.guardar()
        self._latiendo = False
        try:
            os.unlink(self.ruta_detener())
        except OSError:
            pass

    def item(self, ruta):
        return next((i for i in self.x["items"] if i["ruta"] == ruta), None)

    def poner_item(self, ruta, **campos):
        with self._lock:
            i = self.item(ruta)
            if i is None:
                i = {"ruta": ruta}
                self.x["items"].append(i)
            if "error" not in campos and campos.get("estado") in ("escribiendo", "listo", "cola"):
                i.pop("error", None)
            i.update(campos)
            self.guardar()

    def leyo(self, ruta):
        """La IA está leyendo `ruta` (relativa al código): cuenta, recuerda y avisa, sin guardar todo el estado cada vez."""
        with self._lock:
            vistos = self.x.setdefault("vistos", [])
            nuevo = ruta not in vistos
            if nuevo and len(vistos) < 5000:
                vistos.append(ruta)
            self.x["leidos"] = len(vistos)
            self.x["leyendo"] = ruta
        emitir({"t": "lee", "id": self.id, "ruta": ruta, "n": self.x["leidos"]})

    def busco(self, patron):
        emitir({"t": "busca", "id": self.id, "patron": patron[:200]})

    # ── detener y latido ──
    def ruta_detener(self):
        return os.path.join(carpeta(), self.id + ".detener")

    def detenido(self):
        return os.path.exists(self.ruta_detener())

    def latir(self):
        """Un hilo que actualiza el latido (y guarda lo leído) mientras el trabajo corre."""
        self._latiendo = True

        def latido():
            while self._latiendo:
                with self._lock:
                    self.x["latido"] = time.time()
                    self.guardar(emitir_estado=False)
                time.sleep(LATIDO)
        threading.Thread(target=latido, daemon=True).start()

    # ── lo que ve la interfaz (sin rutas absolutas) ──
    def vista(self):
        x = self.x
        return {"id": x["id"], "tipo": x["tipo"], "carpeta": x["proyecto"], "estado": estado_real(x), "etapa": x["etapa"], "etapas": x["etapas"], "hechas": x["hechas"],
                "inicio": x["inicio"], "fin": x.get("fin"), "items": [dict(i) for i in x["items"]], "leidos": x.get("leidos", 0),
                "leyendo": x.get("leyendo", ""), "error": x.get("error", ""), **{k: v for k, v in (x.get("publico") or {}).items()}}


def estado_real(x):
    """«corriendo» con un latido viejo es un trabajo interrumpido (se cerró la app o se cortó el proceso)."""
    if x.get("estado") == "corriendo" and time.time() - float(x.get("latido") or 0) > MUERTO:
        return "interrumpido"
    return x.get("estado")


def del_proyecto(proyecto, tipo=None):
    """El último trabajo de esta carpeta (el más nuevo primero), o None."""
    try:
        nombres = sorted((n for n in os.listdir(carpeta()) if n.endswith(".json") and id_valido(n[:-5])), reverse=True)
    except OSError:
        return None
    for n in nombres[:MAX_GUARDADOS]:
        x = comun.leer_json(os.path.join(carpeta(), n), None)
        if isinstance(x, dict) and x.get("proyecto") == proyecto and (tipo is None or x.get("tipo") == tipo):
            return Trabajo(x)
    return None


def limpiar_viejos():
    try:
        nombres = sorted((n for n in os.listdir(carpeta()) if n.endswith(".json") and id_valido(n[:-5])), reverse=True)
    except OSError:
        return
    for n in nombres[MAX_GUARDADOS:]:
        for ext in (".json", ".antes.json", ".detener"):
            try:
                os.unlink(os.path.join(carpeta(), n[:-5] + ext))
            except OSError:
                pass
