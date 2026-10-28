#!/usr/bin/env python3
"""Pruebas de los scripts de Python (bin/). HOME y la carpeta de Esquema son temporales y la IA es falsa (pruebas/ia_falsa.py):
nunca se tocan datos reales ni se llama a una IA de verdad."""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(RAIZ, "bin")
TMP = tempfile.mkdtemp(prefix="esquema-pruebas-")
os.environ["HOME"] = os.path.join(TMP, "casa")
os.environ["ESQUEMA_DATOS"] = os.path.join(TMP, "datos")
os.makedirs(os.environ["HOME"])
# La IA falsa, como `claude`, primera en el PATH.
FALSAS = os.path.join(TMP, "bin")
os.makedirs(FALSAS)
shutil.copy(os.path.join(RAIZ, "pruebas", "ia_falsa.py"), os.path.join(FALSAS, "claude"))
os.chmod(os.path.join(FALSAS, "claude"), 0o755)
os.environ["PATH"] = FALSAS + os.pathsep + os.environ["PATH"]
REGISTRO = os.path.join(TMP, "ia.jsonl")
os.environ["IA_FALSA_REGISTRO"] = REGISTRO
sys.path.insert(0, BIN)

import asistente  # noqa: E402
import carpeta  # noqa: E402
import comun  # noqa: E402
import ia  # noqa: E402
import plantilla_formato  # noqa: E402
import plantillas  # noqa: E402

CASOS = json.load(open(os.path.join(RAIZ, "pruebas", "casos.json"), encoding="utf-8"))


def correr(script, *args):
    """Corre un script como lo hace la app: el último argumento es el JSON de salida."""
    salida = os.path.join(TMP, "salida.json")
    r = subprocess.run([sys.executable, os.path.join(BIN, script), *args, salida], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr + r.stdout
    with open(salida, encoding="utf-8") as f:
        return json.load(f)


def entrada(datos):
    ruta = os.path.join(TMP, "entrada.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    return ruta


def proyecto():
    """Una carpeta de proyecto ficticia con .gitignore, secretos y carpetas pesadas."""
    p = tempfile.mkdtemp(dir=TMP)
    archivos = {
        "README.md": "# Hola\n", "docs/arquitectura.mmd": "flowchart TD\n    A --> B\n", "docs/notas.txt": "x",
        ".gitignore": "build/\n*.log\n/secreto-local.md\ndocs/borrador*\n!docs/borrador-publico.md\n", "app.log": "x", "build/salida.md": "x",
        "docs/borrador-1.md": "x", "docs/borrador-publico.md": "x", "secreto-local.md": "x", "sub/secreto-local.md": "x",
        ".env": "CLAVE=1", ".env.example": "CLAVE=", "llave.pem": "x", "config/credentials.json": "{}", "node_modules/a/README.md": "x",
        "src/main.py": "print()", "src/.gitignore": "generado.py\n", "src/generado.py": "x", "package.json": json.dumps({"name": "ejemplo", "description": "Una app de Ana Pérez", "scripts": {"test": "x", "build": "y"}, "dependencies": {"left-pad": "1"}, "private": True, "token": "NO"}),
    }
    for r, t in archivos.items():
        ruta = os.path.join(p, *r.split("/"))
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(t)
    return p


class Carpeta(unittest.TestCase):
    def test_listar_respeta_gitignore_y_solo_md_mmd(self):
        p = proyecto()
        r = correr("carpeta.py", "listar", p)
        rutas = [a["ruta"] for a in r["archivos"]]
        self.assertTrue(r["ok"])
        self.assertEqual(sorted(rutas), sorted(["README.md", "docs/arquitectura.mmd", "docs/borrador-publico.md", "sub/secreto-local.md"]))

    def test_estructura_sin_secretos_ni_ignorados(self):
        p = proyecto()
        r = correr("carpeta.py", "estructura", p)
        a = set(r["archivos"])
        for fuera in [".env", "llave.pem", "config/credentials.json", "app.log", "build/salida.md", "docs/borrador-1.md", "secreto-local.md", "node_modules/a/README.md", "src/generado.py"]:
            self.assertNotIn(fuera, a)
        for dentro in [".env.example", "src/main.py", "docs/notas.txt", "package.json", ".gitignore"]:
            self.assertIn(dentro, a)
        self.assertGreaterEqual(r["omitidos"], 3)
        self.assertEqual(r["manifiestos"]["package.json"]["name"], "ejemplo")
        self.assertNotIn("token", json.dumps(r["manifiestos"]))

    def test_no_sigue_enlaces(self):
        p = proyecto()
        afuera = tempfile.mkdtemp(dir=TMP)
        with open(os.path.join(afuera, "privado.md"), "w") as f:
            f.write("x")
        os.symlink(afuera, os.path.join(p, "enlace"))
        os.symlink(os.path.join(afuera, "privado.md"), os.path.join(p, "atajo.md"))
        rutas = [a["ruta"] for a in correr("carpeta.py", "listar", p)["archivos"]]
        self.assertFalse(any(r.startswith("enlace") or r == "atajo.md" for r in rutas))
        r = correr("carpeta.py", "leer", entrada({"carpeta": p, "ruta": "atajo.md"}))
        self.assertFalse(r["ok"])

    def test_leer_y_guardar(self):
        p = proyecto()
        r = correr("carpeta.py", "guardar", entrada({"carpeta": p, "ruta": "docs/nuevo/diagrama.mmd", "texto": "flowchart LR\n    A --> B\n", "nuevo": True}))
        self.assertTrue(r["ok"], r)
        self.assertEqual(correr("carpeta.py", "leer", entrada({"carpeta": p, "ruta": "docs/nuevo/diagrama.mmd"}))["texto"], "flowchart LR\n    A --> B\n")
        r = correr("carpeta.py", "guardar", entrada({"carpeta": p, "ruta": "docs/nuevo/diagrama.mmd", "texto": "x", "nuevo": True}))
        self.assertFalse(r["ok"])
        self.assertIn("Ya hay", r["error"])
        # Mantiene los permisos del archivo
        ruta = os.path.join(p, "README.md")
        os.chmod(ruta, 0o640)
        self.assertTrue(correr("carpeta.py", "guardar", entrada({"carpeta": p, "ruta": "README.md", "texto": "# Otro\n"}))["ok"])
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o640)
        self.assertFalse([n for n in os.listdir(p) if n.startswith(".esquema-")])

    def test_rutas_peligrosas(self):
        p = proyecto()
        for mala in ["../fuera.md", "/etc/passwd.md", "docs/../../x.md", "a\\..\\..\\x.md", "C:/x.md", "x.html", "", "docs//x.md", "./x.md", "x.md\x00.txt"]:
            r = correr("carpeta.py", "guardar", entrada({"carpeta": p, "ruta": mala, "texto": "x"}))
            self.assertFalse(r["ok"], mala)
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(p), "fuera.md")))
        r = correr("carpeta.py", "guardar", entrada({"carpeta": p, "ruta": "x.md", "texto": "x" * (comun.MAXIMO_ARCHIVO + 1)}))
        self.assertFalse(r["ok"])

    def test_gitignore(self):
        i = comun.Ignorados()
        ruta = os.path.join(TMP, "gi")
        with open(ruta, "w") as f:
            f.write("*.log\n/raiz.txt\ndoc/**/tmp\n**/cache/\n!importante.log\n\\#raro\n")
        i.cargar("", ruta)
        self.assertTrue(i.ignorado("a/b.log", False))
        self.assertFalse(i.ignorado("importante.log", False))
        self.assertTrue(i.ignorado("raiz.txt", False))
        self.assertFalse(i.ignorado("sub/raiz.txt", False))
        self.assertTrue(i.ignorado("doc/a/b/tmp", False))
        self.assertTrue(i.ignorado("x/cache", True))
        self.assertFalse(i.ignorado("x/cache", False))
        self.assertTrue(i.ignorado("#raro", False))


class Config(unittest.TestCase):
    def test_solo_claves_conocidas(self):
        r = correr("estado.py", "config", entrada({"idioma_ui": "en", "ia": "codex", "bienvenida": True, "malicioso": "x", "tema": 3}))
        self.assertEqual(r["config"], {"idioma_ui": "en", "ia": "codex", "bienvenida": True})
        ruta = os.path.join(os.environ["ESQUEMA_DATOS"], "config.json")
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
        e = correr("estado.py")
        self.assertEqual(e["config"]["idioma_ui"], "en")
        self.assertEqual(e["version"], comun.VERSION)
        self.assertEqual(len(e["plantillas"]), len(plantillas.incluidas()))
        self.assertTrue(any(x["id"] == "claude" and x["instalada"] for x in e["ias"]))
        correr("estado.py", "config", entrada({"ia": "claude"}))


class IA(unittest.TestCase):
    def setUp(self):
        open(REGISTRO, "w").close()
        os.environ.pop("IA_FALSA_MODO", None)

    def ultimo(self):
        with open(REGISTRO, encoding="utf-8") as f:
            return json.loads(f.read().strip().splitlines()[-1])

    def test_probar_sin_herramientas(self):
        r = correr("ia.py", "probar", "claude")
        self.assertEqual(r, {"ia": "claude", "ok": True})
        u = self.ultimo()
        self.assertIn("--disallowedTools", u["args"])
        self.assertEqual(u["args"][u["args"].index("--disallowedTools") + 1], "*")
        self.assertIn("--strict-mcp-config", u["args"])
        self.assertEqual(u["entorno"], [], "la IA no recibe variables ESQUEMA_*")
        self.assertTrue(os.path.basename(u["cwd"]).startswith("esquema-ia-"))

    def test_probar_falla_con_mensaje(self):
        os.environ["IA_FALSA_MODO"] = "falla"
        r = correr("ia.py", "probar", "claude")
        self.assertFalse(r["ok"])
        self.assertIn("Claude no respondió", r["error"])
        self.assertFalse(correr("ia.py", "probar", "otra")["ok"])

    def test_readme_solo_nombres(self):
        p = proyecto()
        r = correr("asistente.py", "readme", entrada({"carpeta": p, "descripcion": "Una app de pagos", "estructura": True, "idioma": "es"}))
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["texto"].startswith("# Proyecto"))
        self.assertNotIn("%%{init", r["texto"])
        self.assertNotIn("click", r["texto"])
        self.assertIn("```mermaid\nflowchart LR", r["texto"])
        prompt = self.ultimo()["prompt"]
        self.assertIn("docs/arquitectura.mmd", prompt)
        self.assertIn("Una app de pagos", prompt)
        for nunca in [".env\n", "llave.pem", "credentials", "CLAVE=1", "print()", "secreto-local", "token"]:
            self.assertNotIn(nunca, prompt)

    def test_readme_sin_estructura_y_con_cambios(self):
        r = correr("asistente.py", "readme", entrada({"carpeta": proyecto(), "descripcion": "x", "estructura": False, "anterior": "# Antes", "pedido": "más corto"}))
        self.assertTrue(r["ok"])
        prompt = self.ultimo()["prompt"]
        self.assertNotIn("<archivos>", prompt)
        self.assertIn("# Antes", prompt)
        self.assertIn("más corto", prompt)
        self.assertFalse(correr("asistente.py", "readme", entrada({"descripcion": "  "}))["ok"])
        os.environ["IA_FALSA_MODO"] = "basura"
        self.assertFalse(correr("asistente.py", "readme", entrada({"descripcion": "x"}))["ok"])

    def test_dibujar(self):
        r = correr("asistente.py", "dibujar", entrada({"pedido": "un flujo", "tipo": "flujo", "actual": "flowchart TD\n    X --> Y\n", "idioma": "en"}))
        self.assertEqual(r, {"ok": True, "texto": "flowchart TD\n    A[Inicio] --> B{¿Listo?}\n    B -->|Sí| C([Fin])\n"})
        prompt = self.ultimo()["prompt"]
        self.assertIn("X --> Y", prompt)
        self.assertIn("English", prompt)
        os.environ["IA_FALSA_MODO"] = "basura"
        r = correr("asistente.py", "dibujar", entrada({"pedido": "algo"}))
        self.assertFalse(r["ok"])
        self.assertIn("No apliqué nada", r["error"])

    def test_limpiar_diagrama(self):
        for c in CASOS["limpiar_diagrama"]:
            self.assertEqual(asistente.limpiar_diagrama(c["respuesta"]), c["esperado"], c["respuesta"])


class Plantillas(unittest.TestCase):
    def test_casos_compartidos(self):
        for c in CASOS["plantillas"]:
            self.assertEqual(not plantilla_formato.validar(c["plantilla"]), c["valida"], c["plantilla"])

    def test_incluidas_validas(self):
        todas = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(RAIZ, "plantillas")) for f in fs if f.endswith(".json")]
        self.assertGreaterEqual(len(todas), 10)
        r = subprocess.run([sys.executable, os.path.join(BIN, "plantillas.py"), "validar", *todas], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(len(plantillas.incluidas()), len(todas))
        cats = {p["categoria"] for p in plantillas.incluidas()}
        self.assertEqual(cats, set(plantilla_formato.CATEGORIAS))

    def test_descargadas_ganan_y_se_validan(self):
        d = os.path.join(os.environ["ESQUEMA_DATOS"], "plantillas")
        os.makedirs(d, exist_ok=True)
        buena = dict(CASOS["plantillas"][0]["plantilla"], id="registro", nombre={"es": "Mía"})
        json.dump(buena, open(os.path.join(d, "registro.json"), "w"))
        json.dump(dict(buena, id="mala", script="x"), open(os.path.join(d, "mala.json"), "w"))
        l = {p["id"]: p for p in plantillas.listar()}
        self.assertEqual(l["registro"]["nombre"]["es"], "Mía")
        self.assertNotIn("mala", l)
        shutil.rmtree(d)

    def test_indice(self):
        r = correr("plantillas.py", "indice", RAIZ)
        self.assertEqual(r["formato"], 1)
        self.assertEqual(len(r["plantillas"]), len(plantillas.incluidas()))
        self.assertTrue(all(len(p["sha256"]) == 64 and plantilla_formato.RUTA.fullmatch(p["ruta"]) for p in r["plantillas"]))
        # Lo que arma indice() es exactamente lo que acepta validar_indice() (la app no descarta nada bueno).
        self.assertEqual(plantilla_formato.validar_indice(r), r["plantillas"])

    def test_indice_rechaza(self):
        raiz = tempfile.mkdtemp(dir=TMP)
        buena = dict(CASOS["plantillas"][0]["plantilla"])
        os.makedirs(os.path.join(raiz, "plantillas", buena["categoria"]))
        os.makedirs(os.path.join(raiz, "plantillas", "inventada"))
        escribir = lambda rel, d: json.dump(d, open(os.path.join(raiz, "plantillas", *rel.split("/")), "w"))
        escribir(f"{buena['categoria']}/{buena['id']}.json", buena)
        escribir(f"{buena['categoria']}/otro-nombre.json", buena)                       # no se llama como su id
        escribir(f"{buena['categoria']}/con-script.json", dict(buena, id="con-script", script="x"))
        open(os.path.join(raiz, "plantillas", buena["categoria"], "nota.txt"), "w").write("x")
        datos, problemas = plantilla_formato.indice(raiz)
        self.assertEqual([p["id"] for p in datos["plantillas"]], [buena["id"]])
        self.assertEqual(len(problemas), 4, problemas)

    def test_validar_indice_descarta(self):
        datos, _ = plantilla_formato.indice(RAIZ)
        bien = datos["plantillas"][0]
        malos = [dict(bien, ruta="https://otro.com/x.json"), dict(bien, ruta="plantillas/../../x.json"), dict(bien, sha256="abc"),
                 dict(bien, tamano=10 ** 9), dict(bien, tamano=True), dict(bien, categoria="secuencia" if bien["categoria"] != "secuencia" else "proceso"),
                 dict(bien, contenido={"es": "<script>" * 5000}), "texto", dict(bien, ruta=bien["ruta"].replace(".json", "-x.json"))]
        self.assertEqual(plantilla_formato.validar_indice({"formato": 1, "plantillas": malos}), [])
        self.assertEqual(plantilla_formato.validar_indice({"formato": 2, "plantillas": [bien]}), [])
        self.assertEqual(len(plantilla_formato.validar_indice({"formato": 1, "plantillas": [bien, bien]})), 1)  # id repetido
        r = correr("plantillas.py", "catalogo", entrada({"formato": 1, "plantillas": [bien] + malos}))
        self.assertEqual([p["id"] for p in r["plantillas"]], [bien["id"]])
        self.assertFalse(correr("plantillas.py", "catalogo", entrada([1, 2]))["ok"])

    def test_instalar(self):
        import hashlib
        pl = dict(CASOS["plantillas"][0]["plantilla"], id="desde-catalogo")
        crudo = json.dumps(pl).encode()
        archivo = os.path.join(TMP, "bajada.json")
        open(archivo, "wb").write(crudo)
        huella = hashlib.sha256(crudo).hexdigest()
        r = correr("plantillas.py", "instalar", entrada({"archivo": archivo, "id": "desde-catalogo", "sha256": huella}))
        self.assertTrue(r["ok"], r)
        guardada = os.path.join(os.environ["ESQUEMA_DATOS"], "plantillas", "desde-catalogo.json")
        self.assertEqual(stat.S_IMODE(os.stat(guardada).st_mode), 0o600)
        self.assertIn("desde-catalogo", {p["id"] for p in plantillas.listar()})
        self.assertIn("dañada", correr("plantillas.py", "instalar", entrada({"archivo": archivo, "id": "desde-catalogo", "sha256": "0" * 64}))["error"])
        self.assertFalse(correr("plantillas.py", "instalar", entrada({"archivo": archivo, "id": "otro-id", "sha256": huella}))["ok"])
        malo = json.dumps(dict(pl, html="<b>")).encode()
        open(archivo, "wb").write(malo)
        self.assertFalse(correr("plantillas.py", "instalar", entrada({"archivo": archivo, "id": "desde-catalogo", "sha256": hashlib.sha256(malo).hexdigest()}))["ok"])
        os.remove(guardada)

    def test_mismo_formato_que_el_catalogo(self):
        """bin/plantilla_formato.py es el MISMO archivo que herramientas/plantilla_formato.py de esquema-catalogo (si está al lado)."""
        otro = os.path.join(os.path.dirname(RAIZ), "esquema-catalogo", "herramientas", "plantilla_formato.py")
        if not os.path.exists(otro):
            self.skipTest("esquema-catalogo no está al lado de este repo")
        self.assertEqual(open(otro, "rb").read(), open(os.path.join(BIN, "plantilla_formato.py"), "rb").read(),
                         "copia bin/plantilla_formato.py a esquema-catalogo/herramientas/ (o al revés)")


class Repo(unittest.TestCase):
    def test_demo_al_dia(self):
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "generar_demo.py"), "--revisar"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_licencia_agpl_completa(self):
        t = open(os.path.join(RAIZ, "LICENSE"), encoding="utf-8").read()
        self.assertIn("GNU AFFERO GENERAL PUBLIC LICENSE", t)
        self.assertIn("Version 3, 19 November 2007", t)
        self.assertIn("END OF TERMS AND CONDITIONS", t)
        self.assertGreater(len(t), 30000)

    def test_solo_biblioteca_estandar(self):
        permitidos = set(sys.stdlib_module_names) | {"comun", "carpeta", "ia", "asistente", "plantillas", "plantilla_formato", "estado"}
        for f in os.listdir(BIN):
            if not f.endswith(".py"):
                continue
            for linea in open(os.path.join(BIN, f), encoding="utf-8"):
                l = linea.strip()
                if l.startswith(("import ", "from ")) and not l.startswith("from __future__"):
                    mod = l.split()[1].split(".")[0]
                    self.assertIn(mod, permitidos, f"{f}: {l}")


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
