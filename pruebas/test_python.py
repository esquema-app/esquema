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
import time
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
import proyecto as proyecto_mod  # noqa: E402

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
        # Sin la memoria de la persona (CLAUDE.md, memoria automática, plugins): solo ve lo que Esquema le manda.
        self.assertIn("--safe-mode", u["args"])
        self.assertTrue({"CLAUDE_CODE_DISABLE_AUTO_MEMORY", "CLAUDE_CODE_DISABLE_CLAUDE_MDS"} <= set(u["sin_memoria"]))

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


def git_en(carpeta, *args):
    r = subprocess.run(["git", "-C", carpeta, "-c", "user.name=Pruebas", "-c", "user.email=pruebas@users.noreply.github.com", *args],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return r.stdout


def repo_de_prueba(con_git=True):
    """Un repositorio ficticio: README, código, un secreto, algo ignorado y un binario."""
    p = tempfile.mkdtemp(dir=TMP)
    archivos = {"README.md": "# Minutero\n\nNotas de reuniones de Ana Pérez. token = abcdef1234567890\n", "src/grabar.py": "def grabar():\n    pass\n",
                "src/ui/boton.js": "export const x = 1;\n", ".env": "CLAVE=secreta", ".gitignore": "privado/\n*.log\n", "privado/notas.md": "x",
                "app.log": "x", "AGENTS.md": "# Guía\n", "package.json": json.dumps({"name": "minutero", "description": "Notas"})}
    for r, t in archivos.items():
        ruta = os.path.join(p, *r.split("/"))
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(t)
    with open(os.path.join(p, "src", "icono.png"), "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n\x00\x00binario")
    if con_git:
        git_en(p, "init", "-q", "-b", "main")
        git_en(p, "add", "-A")
        git_en(p, "commit", "-qm", "Primera versión")
    return p


def orden(nombre, datos):
    return correr("proyecto.py", nombre, entrada(datos))


ESQUEMA_MIN = {"formato": 1, "nombre": "Minutero", "documentos": [{"ruta": "README.md", "titulo": "Visión", "tipo": "vision"}],
               "elementos": [{"id": "boton-grabar", "tipo": "boton", "nombre": "Grabar", "codigo": ["src/grabar.py"]}]}


class Proyecto(unittest.TestCase):
    def test_casos_compartidos_de_esquema(self):
        for c in CASOS["proyecto_esquema"]:
            self.assertEqual(not proyecto_mod.validar_esquema(c["esquema"]), c["valido"], json.dumps(c["esquema"])[:120])
        for c in CASOS["proyecto_elemento"]:
            self.assertEqual(not proyecto_mod.validar_elemento(c["elemento"]), c["valido"], json.dumps(c["elemento"])[:120])

    def test_documentacion_aparte_vinculada_al_codigo(self):
        """Cada proyecto tiene su documentación en ~/Esquema/<nombre>/ (con su propio git), vinculada al código; «pasar» lleva al
        repo solo lo que la persona elige, y «mover» trae la de antes (docs/esquema) sin borrar nada del repo."""
        codigo = tempfile.mkdtemp(prefix="codigo-")
        with open(os.path.join(codigo, "README.md"), "w", encoding="utf-8") as f:
            f.write("# Pagos\n\nUna app de pagos.\n")
        os.makedirs(os.path.join(codigo, "docs"))
        with open(os.path.join(codigo, "docs", "existe.md"), "w", encoding="utf-8") as f:
            f.write("# Mío\n")
        hay_git = proyecto_mod.git_disponible() is not None
        if hay_git:
            proyecto_mod.git(codigo, "init", "-q")
            proyecto_mod.git(codigo, "-c", "user.name=Ana", "-c", "user.email=ana@x.cl", "add", "-A")
            proyecto_mod.git(codigo, "-c", "user.name=Ana", "-c", "user.email=ana@x.cl", "commit", "-qm", "Primero")
        # Vincular: la documentación queda aparte, y abrir la carpeta del código lleva a ella.
        v = proyecto_mod.vincular({"carpeta": codigo})
        self.assertTrue(v["ok"] and v["ubicacion"].startswith("~/Esquema/codigo-"), v)
        docs = os.path.realpath(os.path.join(os.path.expanduser("~"), v["ubicacion"][2:]))
        self.assertEqual(proyecto_mod.vincular({"carpeta": codigo})["indice"], v["indice"], "vincular dos veces no crea otra carpeta")
        self.assertEqual(proyecto_mod.abrir({"carpeta": codigo})["vinculado_en"], v["indice"])
        a = proyecto_mod.abrir({"carpeta": docs})
        self.assertTrue(a["vinculado"] and a["vacio"] and a["docs"] == "")
        # Lo que va a la IA sale del código, no de la carpeta de documentación.
        _, _, ps, _ = proyecto_mod.piezas({"carpeta": docs, "tarea": "inicial"})
        self.assertIn("Una app de pagos.", "".join(x["texto"] for x in ps))
        self.assertIn("La documentación vive en su propia carpeta", proyecto_mod.prompt({}, "inicial", "", ps))
        # Guardar y versionar: su propio git (o copias), nunca el del código.
        x = {"formato": 1, "nombre": "Pagos", "documentos": [{"ruta": "README.md", "titulo": "Visión", "tipo": "vision"}], "elementos": []}
        with open(os.path.join(docs, "README.md"), "w", encoding="utf-8") as f:
            f.write("# Pagos\n\nVisión general.\n")
        with open(os.path.join(docs, "existe.md"), "w", encoding="utf-8") as f:
            f.write("# Nuevo\n")
        self.assertTrue(proyecto_mod.guardar({"carpeta": docs, "esquema": x})["ok"])
        r = proyecto_mod.version({"carpeta": docs, "mensaje": "Primera"})
        self.assertTrue(r["ok"], r)
        if hay_git:
            self.assertEqual(r["modo"], "git")
            self.assertTrue(proyecto_mod.es_repo(docs))
            _, s, _ = proyecto_mod.git(codigo, "log", "--format=%s")
            self.assertEqual(s.split(), ["Primero"], "el git del código no se toca")
        # Los .md del código se ven y se editan desde el proyecto, sin salir de la carpeta del código.
        c = proyecto_mod.codigo({"carpeta": docs})
        self.assertEqual([x["ruta"] for x in c["archivos"]], ["README.md", "docs/existe.md"])
        self.assertEqual(proyecto_mod.codigo_leer({"carpeta": docs, "ruta": "docs/existe.md"})["texto"], "# Mío\n")
        self.assertTrue(proyecto_mod.codigo_guardar({"carpeta": docs, "ruta": "docs/existe.md", "texto": "# Mío\n\nMás.\n"})["ok"])
        for malo in ("../fuera.md", "/etc/passwd", "src/pagos.py"):
            self.assertFalse(proyecto_mod.codigo_leer({"carpeta": docs, "ruta": malo})["ok"], malo)
            self.assertFalse(proyecto_mod.codigo_guardar({"carpeta": docs, "ruta": malo, "texto": "x"})["ok"], malo)
        with open(os.path.join(codigo, "docs", "existe.md"), "w", encoding="utf-8") as f:
            f.write("# Mío\n")
        with self.assertRaises(ValueError):
            proyecto_mod.codigo({"carpeta": codigo})  # sin vínculo (es la carpeta del código misma)
        vs = proyecto_mod.versiones({"carpeta": docs})
        self.assertEqual(vs["lista"][0]["mensaje"], "Primera")
        self.assertEqual(proyecto_mod.ver({"carpeta": docs, "id": vs["lista"][0]["id"]})["archivos"]["README.md"], "# Pagos\n\nVisión general.\n")
        # Pasar al proyecto: lo nuevo se escribe; lo que existe solo si se pide reemplazar; nada fuera del repo ni oculto.
        d = proyecto_mod.destinos({"carpeta": docs, "rutas": ["docs/README.md", "docs/existe.md", "../fuera.md", ".git/x.md", "docs/x.py"]})["estados"]
        self.assertFalse(d["docs/README.md"]["existe"])
        self.assertEqual(d["docs/existe.md"]["texto"], "# Mío\n")
        self.assertFalse(d["../fuera.md"]["valido"] or d[".git/x.md"]["valido"] or d["docs/x.py"]["valido"])
        p = proyecto_mod.pasar({"carpeta": docs, "archivos": [{"ruta": "README.md", "destino": "docs/README.md"},
                                                              {"ruta": "existe.md", "destino": "docs/existe.md"},
                                                              {"ruta": "README.md", "destino": "../fuera.md"}]})
        self.assertEqual([x["destino"] for x in p["escritos"]], ["docs/README.md"])
        self.assertEqual(sorted(x["motivo"] for x in p["saltados"]), ["destino", "existe"])
        with open(os.path.join(codigo, "docs", "existe.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "# Mío\n")
        proyecto_mod.pasar({"carpeta": docs, "archivos": [{"ruta": "existe.md", "destino": "docs/existe.md", "reemplazar": True}]})
        with open(os.path.join(codigo, "docs", "existe.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "# Nuevo\n")
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(codigo), "fuera.md")))
        # Mover la documentación de antes (docs/esquema dentro del repo): se copia y se vincula, y en el repo queda todo igual.
        viejo = tempfile.mkdtemp(prefix="viejo-")
        os.makedirs(os.path.join(viejo, "docs", "esquema"))
        with open(os.path.join(viejo, "docs", "esquema", "esquema.json"), "w", encoding="utf-8") as f:
            json.dump({"formato": 1, "nombre": "Viejo", "documentos": [], "elementos": []}, f)
        with open(os.path.join(viejo, "docs", "esquema", "README.md"), "w", encoding="utf-8") as f:
            f.write("# Viejo\n")
        m = proyecto_mod.mover({"carpeta": viejo})
        self.assertTrue(m["ok"] and m["desde"] == "docs/esquema", m)
        nuevo = os.path.realpath(os.path.join(os.path.expanduser("~"), m["ubicacion"][2:]))
        with open(os.path.join(nuevo, "README.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "# Viejo\n")
        self.assertTrue(os.path.isfile(os.path.join(viejo, "docs", "esquema", "README.md")), "no se borra nada del repo")
        self.assertTrue(proyecto_mod.abrir({"carpeta": nuevo})["existe"])
        # La carpeta de Esquema o la carpeta personal no se vinculan.
        with self.assertRaises(ValueError):
            proyecto_mod.vincular({"carpeta": nuevo})
        with self.assertRaises(ValueError):
            proyecto_mod.vincular({"carpeta": os.path.expanduser("~")})

    def test_el_tipo_pedido_llega_al_prompt(self):
        """«la secuencia de…» pide un diagrama de secuencia; «Crear diagrama» con el código deja un documento corto en diagramas/."""
        e = {"pedido": "la secuencia de pagar", "tipo": "secuencia", "idioma": "es"}
        texto = proyecto_mod.prompt(e, "flujo", "docs/esquema", [])
        self.assertIn("un diagrama de secuencia", texto)
        self.assertIn("flujos/<nombre>.md", texto)
        corto = proyecto_mod.prompt({**e, "forma": "diagrama", "tipo": "arquitectura"}, "flujo", "docs/esquema", [])
        self.assertIn("diagramas/<nombre>.md", corto)
        self.assertIn("un diagrama de arquitectura", corto)
        # La IA de la persona no rellena con su memoria (otros proyectos, notas): todos los prompts lo piden.
        for p in (texto, corto, asistente.prompt_dibujar(e), asistente.prompt_readme({"descripcion": "x"})):
            self.assertIn(asistente.SOLO_ESTO, p)
        # Sin tipo (o uno desconocido) la IA lo deduce del pedido, con la misma regla en Dibújame.
        for tipo in (None, "auto", "otro"):
            self.assertIn("«la secuencia de…»", proyecto_mod.prompt({**e, "tipo": tipo}, "flujo", "docs/esquema", []))
            self.assertIn("«la secuencia de…»", asistente.prompt_dibujar({"pedido": "x", "tipo": tipo}))

    def test_nombre_del_readme_y_manifiestos_en_subcarpetas(self):
        """Un README que abre con HTML centrado y «## Instalar»: el nombre es el <h1>, no el primer «##»."""
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "app")); os.makedirs(os.path.join(d, "escritorio"))
        with open(os.path.join(d, "README.md"), "w", encoding="utf-8") as f:
            f.write('<p align="center"><img src="logo.png"></p>\n<h1 align="center">Kalumi</h1>\n\n## Instalar\nhola\n')
        with open(os.path.join(d, "escritorio", "package.json"), "w", encoding="utf-8") as f:
            f.write('{"name": "kalumi-escritorio"}')
        with open(os.path.join(d, "app", "Package.swift"), "w", encoding="utf-8") as f:
            f.write('let p = Package(name: "Kalumi")')
        r = proyecto_mod.leer({"carpeta": d})["encontrado"]
        self.assertEqual(r["nombre"], "Kalumi")
        self.assertEqual(r["manifiestos"]["escritorio/package.json"].get("name"), "kalumi-escritorio")
        self.assertIn("app/Package.swift", r["manifiestos"])

    def test_leer_sin_secretos_ni_ignorados_y_con_git(self):
        p = repo_de_prueba()
        r = orden("leer", {"carpeta": p})
        self.assertTrue(r["ok"], r)
        f = r["encontrado"]
        self.assertEqual(f["nombre"], "Minutero")
        self.assertIn(["Python", 1], f["lenguajes"])
        self.assertIn("AGENTS.md", f["guias"])
        self.assertTrue(f["git"]["hay"])
        self.assertEqual(f["git"]["rama"], "main")
        self.assertEqual(f["git"]["commits"][0]["mensaje"], "Primera versión")
        self.assertNotIn("autor", json.dumps(f["git"]))
        self.assertGreaterEqual(f["omitidos"], 1)  # .env
        self.assertEqual(f["binarios"], 1)
        self.assertNotIn("abcdef1234567890", json.dumps(r))  # el resumen del README pasa por ocultar_secretos
        self.assertFalse(f["documentado"])

    def test_preparar_manda_solo_lo_permitido(self):
        p = repo_de_prueba()
        r = orden("preparar", {"carpeta": p, "tarea": "inicial", "archivos": ["src/grabar.py", ".env", "privado/notas.md", "app.log", "src/icono.png", "../fuera.txt", "/etc/hosts", "no-existe.py"]})
        self.assertTrue(r["ok"], r)
        texto = json.dumps(r, ensure_ascii=False)
        rutas = [x.get("ruta") for x in r["piezas"]]
        self.assertIn("src/grabar.py", rutas)
        self.assertIn("README.md", rutas)
        self.assertIn("AGENTS.md", rutas)
        motivos = {x["ruta"]: x["motivo"] for x in r["rechazados"]}
        self.assertEqual(motivos, {".env": "fuera", "privado/notas.md": "fuera", "app.log": "fuera", "src/icono.png": "binario", "../fuera.txt": "ruta", "/etc/hosts": "ruta", "no-existe.py": "fuera"})
        self.assertNotIn("CLAVE=secreta", texto)
        self.assertNotIn("abcdef1234567890", texto)
        lista = next(x for x in r["piezas"] if x["clave"] == "lista")["texto"].split("\n")
        self.assertNotIn(".env", lista)
        self.assertNotIn("privado/notas.md", lista)
        git = next(x for x in r["piezas"] if x["clave"] == "git")["texto"]
        self.assertIn("Primera versión", git)
        self.assertNotIn("Pruebas", git)  # sin autores
        self.assertEqual(r["bytes"], sum(x["bytes"] for x in r["piezas"]))

    def test_generar_con_la_ia_sin_herramientas_y_validado(self):
        p = repo_de_prueba()
        if os.path.exists(REGISTRO):
            os.unlink(REGISTRO)
        r = orden("generar", {"carpeta": p, "tarea": "inicial", "idioma": "es"})
        self.assertTrue(r["ok"], r)
        self.assertEqual([x["ruta"] for x in r["propuestas"]], ["README.md", "flujos/grabar.md"])  # nada fuera de docs, nada de elementos.md
        grabar = r["propuestas"][1]["texto"]
        self.assertNotIn("%%{init", grabar)
        self.assertNotIn("click", grabar)
        self.assertIn('%% esquema: {"refs":{"G":"boton-grabar"}}', grabar)
        self.assertEqual(r["elementos"], [{"id": "boton-grabar", "tipo": "boton", "nombre": "Grabar", "codigo": ["src/grabar.py"]}])
        self.assertEqual(r["descartados"], 3)
        self.assertEqual(r["nota"], "Listo.")
        with open(REGISTRO, encoding="utf-8") as f:
            llamada = [json.loads(l) for l in f][-1]
        self.assertIn("--disallowedTools", llamada["args"])
        self.assertIn("--strict-mcp-config", llamada["args"])
        self.assertEqual(llamada["entorno"], [])
        self.assertNotIn("CLAVE=secreta", llamada["prompt"])
        self.assertIn("<archivo ruta=\"README.md\">", llamada["prompt"])
        # Lo que se ve en «Ver lo que se envía» es exactamente lo que recibe la IA.
        ver = orden("preparar", {"carpeta": p, "tarea": "inicial"})
        for pieza in ver["piezas"]:
            self.assertIn(pieza["texto"], llamada["prompt"])

    def test_revision_a_fondo_solo_lee_el_codigo(self):
        """Con «Revisión a fondo», la IA lee la carpeta del código por su cuenta: solo Read/Glob/Grep, nada que escriba, ejecute
        o salga a internet, y nunca los secretos. Sin pedirla, sigue sin herramientas."""
        p = repo_de_prueba()
        ver = orden("preparar", {"carpeta": p, "tarea": "inicial"})
        self.assertIn(".env", ver["a_fondo"]["no_leer"])
        self.assertTrue(ver["a_fondo"]["puede"])
        self.assertNotIn("a_fondo", orden("preparar", {"carpeta": p, "tarea": "revisar"}))
        if os.path.exists(REGISTRO):
            os.unlink(REGISTRO)
        self.assertTrue(orden("generar", {"carpeta": p, "tarea": "inicial", "a_fondo": True})["ok"])
        with open(REGISTRO, encoding="utf-8") as f:
            llamada = [json.loads(l) for l in f][-1]
        a = llamada["args"]
        self.assertEqual(os.path.realpath(llamada["cwd"]), os.path.realpath(p))
        self.assertEqual(os.path.realpath(a[a.index("--add-dir") + 1]), os.path.realpath(p))
        self.assertEqual(a[a.index("--allowedTools") + 1], "Read,Glob,Grep")
        prohibido = a[a.index("--disallowedTools") + 1].split(",")
        for x in ("Bash", "Edit", "Write", "WebFetch", "Read(**/.env)", "Read(**/.git/**)", "Read(**/*.pem)"):
            self.assertIn(x, prohibido)
        self.assertIn("--strict-mcp-config", a)
        self.assertIn("REVISIÓN A FONDO", llamada["prompt"])
        # Una tarea que no es a fondo (o sin pedirlo) no recibe la carpeta.
        self.assertTrue(orden("generar", {"carpeta": p, "tarea": "inicial"})["ok"])
        with open(REGISTRO, encoding="utf-8") as f:
            llamada = [json.loads(l) for l in f][-1]
        self.assertNotIn("--add-dir", llamada["args"])
        self.assertEqual(llamada["args"][llamada["args"].index("--disallowedTools") + 1], "*")
        self.assertNotIn("REVISIÓN A FONDO", llamada["prompt"])

    def test_generar_pide_archivos_y_basura(self):
        p = repo_de_prueba()
        os.environ["IA_FALSA_MODO"] = "pide"
        try:
            r = orden("generar", {"carpeta": p, "tarea": "flujo", "pedido": "cómo se graba"})
        finally:
            os.environ.pop("IA_FALSA_MODO")
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["pide"], ["src/grabar.py"])  # «../fuera.txt» no pasa
        self.assertEqual(r["propuestas"], [])
        self.assertFalse(orden("generar", {"carpeta": p, "tarea": "flujo", "pedido": ""})["ok"])
        os.environ["IA_FALSA_MODO"] = "basura"
        try:
            r = orden("generar", {"carpeta": p, "tarea": "inicial"})
        finally:
            os.environ.pop("IA_FALSA_MODO")
        self.assertFalse(r["ok"])
        self.assertIn("formato", r["error"])

    def test_carpeta_de_docs_segura(self):
        p = repo_de_prueba()
        for malo in ["../afuera", ".oculta", "docs/../..", "a/b/c/d/e", "docs\\..\\x"]:
            r = orden("abrir", {"carpeta": p, "docs": malo})
            self.assertFalse(r["ok"], malo)
        self.assertFalse(orden("guardar", {"carpeta": p, "esquema": {"formato": 1}})["ok"])
        self.assertFalse(orden("abrir", {"carpeta": os.path.join(p, "no-existe")})["ok"])

    def test_guardar_abrir_y_recientes(self):
        p = repo_de_prueba()
        self.assertFalse(orden("abrir", {"carpeta": p})["existe"])
        r = orden("guardar", {"carpeta": p, "esquema": ESQUEMA_MIN})
        self.assertTrue(r["ok"], r)
        with open(os.path.join(p, "docs", "esquema", "esquema.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), ESQUEMA_MIN)
        a = orden("abrir", {"carpeta": p})
        self.assertTrue(a["existe"])
        self.assertEqual(a["esquema"], ESQUEMA_MIN)
        self.assertEqual(a["recientes"][0]["ruta"], os.path.realpath(p))
        e = correr("estado.py")
        self.assertEqual(e["proyectos"][0], {"nombre": "Minutero", "ruta": os.path.realpath(p), "ubicacion": os.path.realpath(p)})
        # Un esquema.json roto no tumba nada: se avisa.
        with open(os.path.join(p, "docs", "esquema", "esquema.json"), "w", encoding="utf-8") as f:
            f.write('{"formato": 1, "nombre": "x", "documentos": [], "elementos": [{"id": "MAL"}]}')
        a = orden("abrir", {"carpeta": p})
        self.assertTrue(a["ok"])
        self.assertFalse(a["existe"])
        self.assertIn("esquema.json", a["error"])

    def test_versiones_con_git_solo_la_carpeta_de_docs(self):
        p = repo_de_prueba()
        orden("guardar", {"carpeta": p, "esquema": ESQUEMA_MIN})
        with open(os.path.join(p, "docs", "esquema", "README.md"), "w", encoding="utf-8") as f:
            f.write("# Uno\n")
        # Cambios de la persona en otros archivos: uno preparado (staged) y otro sin preparar. Ninguno entra en la versión.
        with open(os.path.join(p, "src", "grabar.py"), "a", encoding="utf-8") as f:
            f.write("# preparado\n")
        git_en(p, "add", "src/grabar.py")
        with open(os.path.join(p, "AGENTS.md"), "a", encoding="utf-8") as f:
            f.write("sin preparar\n")
        # Un hook que no debe correr.
        gancho = os.path.join(p, ".git", "hooks", "pre-commit")
        with open(gancho, "w", encoding="utf-8") as f:
            f.write("#!/bin/sh\ntouch \"$(git rev-parse --show-toplevel)/HOOK-CORRIO\"\nexit 1\n")
        os.chmod(gancho, 0o755)
        r = orden("version", {"carpeta": p, "mensaje": "Documentación inicial"})
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["modo"], "git")
        self.assertFalse(os.path.exists(os.path.join(p, "HOOK-CORRIO")))
        en_commit = git_en(p, "show", "--name-only", "--format=%s%n%an", "HEAD").split("\n")
        self.assertEqual(en_commit[0], "Documentación inicial")
        self.assertEqual(en_commit[1], "Esquema")  # sin nombre configurado en git, queda a nombre de Esquema
        self.assertEqual(sorted(x for x in en_commit[2:] if x), ["docs/esquema/README.md", "docs/esquema/esquema.json"])
        estado = git_en(p, "status", "--porcelain")
        self.assertIn("M  src/grabar.py", estado)  # sigue preparado, sin commit
        self.assertIn(" M AGENTS.md", estado)
        self.assertTrue(orden("version", {"carpeta": p, "mensaje": "otra"})["sin_cambios"])
        # Segunda versión, historia, ver una versión y restaurarla (sin borrar nada).
        with open(os.path.join(p, "docs", "esquema", "README.md"), "w", encoding="utf-8") as f:
            f.write("# Dos\n")
        with open(os.path.join(p, "docs", "esquema", "nuevo.md"), "w", encoding="utf-8") as f:
            f.write("# Nuevo\n")
        self.assertTrue(orden("versiones", {"carpeta": p})["pendiente"])
        orden("version", {"carpeta": p, "mensaje": "Segunda"})
        v = orden("versiones", {"carpeta": p})
        self.assertEqual([x["mensaje"] for x in v["lista"]], ["Segunda", "Documentación inicial"])
        self.assertFalse(v["pendiente"])
        primera = v["lista"][1]["id"]
        x = orden("ver", {"carpeta": p, "id": primera})
        self.assertEqual(x["archivos"]["README.md"], "# Uno\n")
        self.assertIn("esquema.json", x["archivos"])
        self.assertEqual(orden("ver", {"carpeta": p, "id": "actual"})["archivos"]["README.md"], "# Dos\n")
        for malo in ["HEAD", "--all", "main", "../x", "zz"]:
            self.assertFalse(orden("ver", {"carpeta": p, "id": malo})["ok"], malo)
        r = orden("restaurar", {"carpeta": p, "id": primera})
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["escritos"], ["README.md"])
        self.assertEqual(r["sobran"], ["nuevo.md"])
        self.assertTrue(os.path.exists(os.path.join(p, "docs", "esquema", "nuevo.md")))
        with open(os.path.join(p, "docs", "esquema", "README.md"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "# Uno\n")

    def test_cambios_del_codigo_desde_la_ultima_version(self):
        p = repo_de_prueba()
        orden("guardar", {"carpeta": p, "esquema": ESQUEMA_MIN})
        orden("version", {"carpeta": p, "mensaje": "Docs"})
        self.assertEqual(orden("abrir", {"carpeta": p})["cambios"]["n"], 0)
        with open(os.path.join(p, "src", "grabar.py"), "a", encoding="utf-8") as f:
            f.write("# confirma antes de grabar\n")
        git_en(p, "commit", "-qam", "Grabar pide confirmación")
        with open(os.path.join(p, "docs", "esquema", "README.md"), "w", encoding="utf-8") as f:
            f.write("# Minutero\n")
        c = orden("abrir", {"carpeta": p})["cambios"]
        self.assertEqual(c["n"], 1)
        self.assertEqual(c["commits"][0]["mensaje"], "Grabar pide confirmación")
        self.assertIn("src/grabar.py", c["commits"][0]["archivos"])
        # Lo que va a la IA para revisar: los commits (sin autores) y los documentos que se mandan.
        r = orden("preparar", {"carpeta": p, "tarea": "revisar", "documentos": ["README.md", "../../.env", "esquema.json"]})
        self.assertTrue(any("Grabar pide confirmación" in x["texto"] for x in r["piezas"] if x["clave"] == "commits"))
        self.assertEqual([x["ruta"] for x in r["rechazados"]], ["../../.env", "esquema.json"])

    def test_versiones_sin_git_son_copias_con_limite(self):
        p = repo_de_prueba(con_git=False)
        os.makedirs(os.path.join(p, "docs", "esquema"))
        ruta = os.path.join(p, "docs", "esquema", "a.md")
        anterior = proyecto_mod.MAX_COPIAS
        proyecto_mod.MAX_COPIAS = 3
        try:
            for k in range(5):
                with open(ruta, "w", encoding="utf-8") as f:
                    f.write(f"# {k}\n")
                r = proyecto_mod.version({"carpeta": p, "mensaje": f"v{k}"})
                self.assertEqual(r["modo"], "copias")
        finally:
            proyecto_mod.MAX_COPIAS = anterior
        self.assertTrue(proyecto_mod.version({"carpeta": p})["sin_cambios"])
        v = orden("versiones", {"carpeta": p})
        self.assertEqual([x["mensaje"] for x in v["lista"]], ["v4", "v3", "v2"])
        self.assertFalse(v["pendiente"])
        self.assertEqual(orden("ver", {"carpeta": p, "id": v["lista"][2]["id"]})["archivos"], {"a.md": "# 2\n"})
        self.assertEqual(orden("restaurar", {"carpeta": p, "id": v["lista"][2]["id"]})["escritos"], ["a.md"])
        with open(ruta, encoding="utf-8") as f:
            self.assertEqual(f.read(), "# 2\n")
        self.assertFalse(orden("ver", {"carpeta": p, "id": "../../x"})["ok"])

    def test_ocultar_secretos(self):
        t = proyecto_mod.ocultar_secretos("password: hunter22x y https://ana:clave1@ejemplo.cl y AKIAABCDEFGHIJKLMNOP y ghp_" + "a" * 36)
        self.assertNotIn("hunter22x", t)
        self.assertNotIn("clave1", t)
        self.assertNotIn("AKIA", t)
        self.assertNotIn("ghp_", t)
        self.assertIn("password", t)


class Documentar(unittest.TestCase):
    """Documentar por etapas (bin/documentar.py + bin/trabajos.py): inventario sin IA, plan, un documento por llamada escrito al tiro
    en la carpeta de la documentación, progreso en vivo, lo leído en lecturas.json, documentos que fallan, «Quitar este cambio»."""

    def setUp(self):
        for k in ("IA_FALSA_MODO", "IA_FALSA_FALLA_DOC", "IA_FALSA_LENTO"):
            os.environ.pop(k, None)
        self.progreso = os.path.join(TMP, "progreso.jsonl")
        open(self.progreso, "w").close()
        os.environ["ESQUEMA_PROGRESO"] = self.progreso

    def tearDown(self):
        os.environ.pop("ESQUEMA_PROGRESO", None)
        for k in ("IA_FALSA_MODO", "IA_FALSA_FALLA_DOC", "IA_FALSA_LENTO"):
            os.environ.pop(k, None)

    def vinculado(self):
        codigo = repo_de_prueba()
        v = proyecto_mod.vincular({"carpeta": codigo})
        return codigo, os.path.realpath(os.path.join(os.path.expanduser("~"), v["ubicacion"][2:]))

    def eventos(self):
        with open(self.progreso, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def test_inventario_y_tipo_de_proyecto(self):
        import inventario
        d = tempfile.mkdtemp(dir=TMP)
        archivos = {"movil/pubspec.yaml": "name: x", "movil/lib/main.dart": "void main(){}", "api/package.json": json.dumps({"dependencies": {"express": "4"}}),
                    "api/index.js": "x", "web/package.json": json.dumps({"dependencies": {"react": "18"}}), "web/src/app.jsx": "x",
                    "README.md": "# Mono", "logo.png": "x", ".env": "A=1", "datos/ventas.csv": "a,b", "node_modules/x/y.js": "x", ".gitignore": "*.log\n", "a.log": "x"}
        for r, t in archivos.items():
            os.makedirs(os.path.join(d, os.path.dirname(r)), exist_ok=True)
            with open(os.path.join(d, r), "w", encoding="utf-8") as f:
                f.write(t)
        x = inventario.inventario(d)
        rutas = {a[0]: a[2] for a in x["archivos"]}
        self.assertEqual(rutas["movil/lib/main.dart"], "c")
        self.assertEqual(rutas["logo.png"], "i")
        self.assertEqual(rutas["datos/ventas.csv"], "t")
        self.assertEqual(rutas[".env"], "s", "un secreto se ve en el árbol (marcado) pero la IA nunca lo lee")
        self.assertNotIn("a.log", rutas)
        self.assertNotIn("node_modules/x/y.js", rutas)
        self.assertEqual(x["perfil"]["tipo"], "monorepo")
        partes = {p["ruta"]: (p["tipo"], p["tecnologia"]) for p in x["perfil"]["componentes"]}
        self.assertEqual(partes["movil"], ("movil", "Flutter"))
        self.assertEqual(partes["api"], ("servicio", "Node"))
        self.assertEqual(partes["web"], ("web", "JavaScript"))
        # Escritos: casi todo Markdown.
        e = tempfile.mkdtemp(dir=TMP)
        for i in range(6):
            with open(os.path.join(e, f"capitulo-{i}.md"), "w") as f:
                f.write("# x")
        self.assertEqual(inventario.inventario(e)["perfil"]["tipo"], "escritos")
        # Una biblioteca de Python.
        b = tempfile.mkdtemp(dir=TMP)
        with open(os.path.join(b, "pyproject.toml"), "w") as f:
            f.write('[project]\nname = "x"\n')
        with open(os.path.join(b, "x.py"), "w") as f:
            f.write("def f(): pass\n")
        self.assertEqual(inventario.inventario(b)["perfil"]["tipo"], "biblioteca")

    def test_arbol_con_todo_el_codigo_y_lecturas(self):
        codigo, docs = self.vinculado()
        r = orden("arbol", {"carpeta": docs})
        self.assertTrue(r["ok"], r)
        rutas = [a[0] for a in r["archivos"]]
        for x in ("src/grabar.py", "src/ui/boton.js", "src/icono.png", "package.json", "README.md"):
            self.assertIn(x, rutas)
        self.assertNotIn("privado/notas.md", rutas)
        self.assertEqual(r["lecturas"], {})
        # Lo que lee la IA queda en la carpeta de Esquema (nunca en la del código), con su huella: si cambia, se nota.
        import inventario
        pid = inventario.id_proyecto(docs)
        inventario.registrar_lecturas(pid, codigo, ["src/grabar.py", "README.md", "../fuera"])
        self.assertTrue(os.path.isfile(os.path.join(os.environ["ESQUEMA_DATOS"], "proyectos", pid, "lecturas.json")))
        lec = orden("arbol", {"carpeta": docs})["lecturas"]
        self.assertEqual(sorted(lec), ["README.md", "src/grabar.py"])
        self.assertNotIn("c", lec["src/grabar.py"])
        time.sleep(1.1)
        with open(os.path.join(codigo, "src", "grabar.py"), "w") as f:
            f.write("def grabar():\n    return 1\n")
        self.assertTrue(orden("arbol", {"carpeta": docs})["lecturas"]["src/grabar.py"].get("c"))

    def test_stream_json_de_claude(self):
        vistos = []
        lineas = ['{"type":"system","subtype":"init"}', "no es json",
                  json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "x"}, {"type": "tool_use", "name": "Read", "input": {"file_path": "/a/b.py"}}]}}),
                  json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Grep", "input": {"pattern": "def ", "path": "/a"}}]}}),
                  json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "rm"}}]}})]
        for l in lineas:
            self.assertIsNone(ia._evento_claude(l, vistos.append))
        self.assertEqual(vistos, [{"t": "lee", "ruta": "/a/b.py"}, {"t": "busca", "patron": "def ", "ruta": "/a"}])
        self.assertEqual(ia._evento_claude('{"type":"result","is_error":false,"result":"hola"}', vistos.append), ("hola", False))
        self.assertEqual(ia._evento_claude('{"type":"result","is_error":true,"result":"sin saldo"}', vistos.append), ("sin saldo", True))
        # Codex --json: se deduce el archivo de un comando de lectura.
        c = []
        ia._evento_codex(json.dumps({"type": "item.started", "item": {"type": "command_execution", "command": "bash -lc 'sed -n 1,200p src/app.py'"}}), c.append)
        ia._evento_codex(json.dumps({"type": "item.started", "item": {"type": "command_execution", "command": ["rg", "-n", "pagar"]}}), c.append)
        self.assertEqual(c, [{"t": "lee", "ruta": "src/app.py"}, {"t": "busca", "patron": "-n pagar"}])

    def test_plan_valido_ordenado_y_plan_invalido(self):
        import documentar
        perfil = {"tipo": "app", "componentes": [], "archivos": 10}
        plan, desc = documentar.validar_plan("```json\n" + json.dumps({"tipo": "raro", "documentos": [
            {"ruta": "flujos/Pagar Cuenta.md", "titulo": "Pagar", "tipo": "flujo", "archivos": ["src/a.py", "../x", "/etc/hosts"]},
            {"ruta": "Overview.md", "titulo": "Visión", "tipo": "vision"},
            {"ruta": "elementos.md", "titulo": "Glosario", "tipo": "otro"},
            {"ruta": "../fuera.md", "titulo": "x", "tipo": "otro"},
            {"ruta": "x.md", "titulo": "", "tipo": "otro"},
            {"ruta": "api.md", "titulo": "La API", "tipo": "glosario"},
            {"ruta": "Diseño.md", "titulo": "Arquitectura", "tipo": "arquitectura"}]}) + "\n```", perfil)
        self.assertEqual([d["ruta"] for d in plan["documentos"]], ["README.md", "arquitectura.md", "api.md", "elementos-del-proyecto.md", "flujos/pagar-cuenta.md"])
        self.assertEqual(plan["tipo"], "app")
        self.assertEqual(plan["documentos"][-1]["archivos"], ["src/a.py"])
        self.assertEqual(desc, 2)
        self.assertEqual(documentar.validar_plan("No sé.", perfil), (None, 0))
        self.assertIsNone(documentar.validar_plan('{"documentos": []}', perfil)[0])
        # El plan armado con el inventario respeta el tipo de proyecto.
        p = documentar.plan_por_defecto({"tipo": "monorepo", "componentes": [{"ruta": "movil", "nombre": "Móvil", "tecnologia": "Flutter"}]}, "X")
        self.assertEqual([d["ruta"] for d in p["documentos"]], ["README.md", "arquitectura.md", "componentes/movil.md"])
        self.assertEqual([d["ruta"] for d in documentar.plan_por_defecto({"tipo": "escritos"}, "X")["documentos"]], ["README.md", "estructura.md"])

    def test_documentar_por_etapas_escribe_al_tiro(self):
        codigo, docs = self.vinculado()
        if os.path.exists(REGISTRO):
            os.unlink(REGISTRO)
        r = orden("documentar", {"carpeta": docs, "tarea": "inicial", "idioma": "es"})
        self.assertTrue(r["ok"], r)
        t = r["trabajo"]
        self.assertEqual(t["estado"], "listo", t)
        self.assertEqual(t["hechas"], ["inventario", "explorar", "escribir", "cerrar"])
        self.assertEqual([i["ruta"] for i in t["items"]], ["README.md", "arquitectura.md", "flujos/grabar-reunion.md"])
        self.assertTrue(all(i["estado"] == "listo" for i in t["items"]))
        # Cada documento está en la carpeta de la documentación, con el título del plan y sin enlaces ni refs a elementos que no existen.
        with open(os.path.join(docs, "flujos", "grabar-reunion.md"), encoding="utf-8") as f:
            md = f.read()
        self.assertTrue(md.startswith("# Grabar una reunión\n"))
        self.assertIn("[Grabar](../elementos.md#el-boton-grabar)", md)
        self.assertNotIn("el-no-existe", md)
        self.assertNotIn("%%{init", md)
        self.assertIn('%% esquema: {"refs":{"G":"boton-grabar"}}', md)
        x = json.load(open(os.path.join(docs, "esquema.json"), encoding="utf-8"))
        self.assertEqual([d["ruta"] for d in x["documentos"]], ["README.md", "arquitectura.md", "flujos/grabar-reunion.md", "elementos.md"])
        self.assertEqual(x["elementos"][0]["codigo"], ["src/grabar.py"])
        self.assertTrue(os.path.isfile(os.path.join(docs, "elementos.md")))
        self.assertEqual(sorted(x["fuentes"]["archivos"]), ["README.md", "src/grabar.py"])
        # Una sola versión, en el git de la documentación; el del código, igual.
        if proyecto_mod.git_disponible():
            self.assertEqual(proyecto_mod.versiones({"carpeta": docs})["lista"][0]["mensaje"], "Documentación hecha con Claude")
            _, s, _ = proyecto_mod.git(codigo, "log", "--format=%s")
            self.assertEqual(s.split("\n")[0], "Primera versión")
        # La IA: explorar con lectura (solo Read/Glob/Grep, stream-json) y cada documento sin herramientas.
        with open(REGISTRO, encoding="utf-8") as f:
            llamadas = [json.loads(l) for l in f]
        exp = llamadas[0]["args"]
        self.assertIn("stream-json", exp)
        self.assertEqual(exp[exp.index("--allowedTools") + 1], "Read,Glob,Grep")
        self.assertNotIn("MultiEdit", exp[exp.index("--disallowedTools") + 1])
        self.assertIn("Read(**/.env)", exp[exp.index("--disallowedTools") + 1])
        self.assertIn("NO leas todo", llamadas[0]["prompt"])
        for l in llamadas[1:]:
            self.assertEqual(l["args"][l["args"].index("--disallowedTools") + 1], "*")
            self.assertNotIn("CLAVE=secreta", l["prompt"])
        self.assertTrue(any('<archivo ruta="src/grabar.py">' in l["prompt"] for l in llamadas[1:]), "cada documento lleva sus archivos clave")
        # El progreso: estados y lo que leyó (solo dentro del código).
        ev = self.eventos()
        self.assertEqual({e["ruta"] for e in ev if e["t"] == "lee"}, {"README.md", "src/grabar.py"})
        estados = [e["trabajo"]["etapa"] for e in ev if e["t"] == "estado"]
        for etapa in ("inventario", "explorar", "escribir", "cerrar"):
            self.assertIn(etapa, estados)
        self.assertNotIn(codigo, json.dumps([e for e in ev if e["t"] != "estado"]), "rutas relativas al código, nunca absolutas")
        # Lo leído queda en lecturas.json y el árbol lo muestra.
        self.assertIn("src/grabar.py", orden("arbol", {"carpeta": docs})["lecturas"])
        # Abrir el proyecto otra vez: el trabajo dice en qué quedó.
        self.assertEqual(orden("trabajo", {"carpeta": docs})["trabajo"]["id"], t["id"])

    def test_un_documento_que_falla_no_afecta_a_los_demas_y_se_reintenta(self):
        codigo, docs = self.vinculado()
        os.environ["IA_FALSA_FALLA_DOC"] = "arquitectura.md"
        t = orden("documentar", {"carpeta": docs, "tarea": "inicial"})["trabajo"]
        self.assertEqual(t["estado"], "con-fallas")
        estados = {i["ruta"]: i["estado"] for i in t["items"]}
        self.assertEqual(estados, {"README.md": "listo", "arquitectura.md": "fallo", "flujos/grabar-reunion.md": "listo"})
        self.assertIn("Claude no respondió", next(i for i in t["items"] if i["ruta"] == "arquitectura.md")["error"])
        self.assertFalse(os.path.exists(os.path.join(docs, "arquitectura.md")))
        self.assertTrue(os.path.exists(os.path.join(docs, "README.md")))
        os.environ.pop("IA_FALSA_FALLA_DOC")
        r = orden("documentar", {"carpeta": docs, "reintentar": t["id"], "ruta": "arquitectura.md"})
        self.assertEqual(r["trabajo"]["estado"], "listo", r)
        self.assertTrue(os.path.exists(os.path.join(docs, "arquitectura.md")))
        if proyecto_mod.git_disponible():
            self.assertEqual(proyecto_mod.versiones({"carpeta": docs})["lista"][0]["mensaje"], "Reescribí «Arquitectura» con Claude")
        for malo in ({"reintentar": t["id"], "ruta": "../x.md"}, {"reintentar": "../x", "ruta": "a.md"}, {"seguir": "20261028T000000-abcdef"}):
            self.assertFalse(orden("documentar", {"carpeta": docs, **malo})["ok"], malo)

    def test_plan_invalido_usa_el_inventario(self):
        codigo, docs = self.vinculado()
        os.environ["IA_FALSA_MODO"] = "plan-basura"
        t = orden("documentar", {"carpeta": docs, "tarea": "inicial"})["trabajo"]
        self.assertEqual(t["estado"], "listo", t)
        self.assertEqual(t["aviso"], "plan")
        self.assertEqual([i["ruta"] for i in t["items"]], ["README.md", "arquitectura.md"])

    def test_la_ia_que_falla_al_explorar_dice_por_que(self):
        codigo, docs = self.vinculado()
        os.environ["IA_FALSA_MODO"] = "falla"
        r = orden("documentar", {"carpeta": docs, "tarea": "inicial"})
        self.assertEqual(r["trabajo"]["estado"], "error")
        self.assertIn("Claude no respondió", r["trabajo"]["error"])
        self.assertEqual(os.listdir(docs), [".git"] if proyecto_mod.git_disponible() else [])

    def test_quitar_este_cambio(self):
        codigo, docs = self.vinculado()
        with open(os.path.join(docs, "README.md"), "w", encoding="utf-8") as f:
            f.write("# Mío\n")
        t = orden("documentar", {"carpeta": docs, "tarea": "inicial"})["trabajo"]
        self.assertFalse(next(i for i in t["items"] if i["ruta"] == "README.md")["nuevo"])
        # Uno que existía vuelve a como estaba; uno nuevo se borra y sale de esquema.json.
        r = orden("quitar", {"carpeta": docs, "id": t["id"], "ruta": "README.md"})
        self.assertTrue(r["ok"] and not r["borrado"], r)
        self.assertEqual(open(os.path.join(docs, "README.md"), encoding="utf-8").read(), "# Mío\n")
        r = orden("quitar", {"carpeta": docs, "id": t["id"], "ruta": "flujos/grabar-reunion.md"})
        self.assertTrue(r["borrado"])
        self.assertFalse(os.path.exists(os.path.join(docs, "flujos", "grabar-reunion.md")))
        self.assertNotIn("flujos/grabar-reunion.md", [d["ruta"] for d in json.load(open(os.path.join(docs, "esquema.json")))["documentos"]])
        self.assertEqual(next(i for i in r["trabajo"]["items"] if i["ruta"] == "flujos/grabar-reunion.md")["estado"], "quitado")
        self.assertFalse(orden("quitar", {"carpeta": docs, "id": t["id"], "ruta": "flujos/grabar-reunion.md"})["ok"], "dos veces no")
        if proyecto_mod.git_disponible():
            self.assertTrue(proyecto_mod.versiones({"carpeta": docs})["lista"][0]["mensaje"].startswith("Quité «"))

    def test_detener_e_interrumpido_y_seguir(self):
        """«Detener» corta la IA y lo escrito se queda; un trabajo cuyo proceso murió se ve «interrumpido» y «Seguir» lo termina."""
        import trabajos
        codigo, docs = self.vinculado()
        os.environ["IA_FALSA_LENTO"] = "0.6"
        e = entrada({"carpeta": docs, "tarea": "inicial"})
        salida = os.path.join(TMP, "salida-larga.json")
        p = subprocess.Popen([sys.executable, os.path.join(BIN, "proyecto.py"), "documentar", e, salida])
        id_ = None
        for _ in range(100):
            time.sleep(0.1)
            ev = self.eventos()
            if any(x["t"] == "lee" for x in ev):
                id_ = ev[0]["trabajo"]["id"]
                break
        self.assertTrue(id_, "el progreso llega mientras la IA lee")
        self.assertTrue(orden("detener", {"carpeta": docs, "id": id_})["deteniendo"])
        p.wait(30)
        r = json.load(open(salida, encoding="utf-8"))
        self.assertEqual(r["trabajo"]["estado"], "detenido", r)
        # Un trabajo «corriendo» sin latido: el proceso murió (se cerró la app). Se ve interrumpido y «Seguir» lo termina.
        os.environ.pop("IA_FALSA_LENTO")
        t = trabajos.Trabajo.cargar(id_)
        t.x.update({"estado": "corriendo", "latido": time.time() - 999})
        t.guardar(emitir_estado=False)
        self.assertEqual(orden("trabajo", {"carpeta": docs})["trabajo"]["estado"], "interrumpido")
        r = orden("documentar", {"carpeta": docs, "seguir": id_})
        self.assertEqual(r["trabajo"]["estado"], "listo", r)
        self.assertTrue(os.path.exists(os.path.join(docs, "flujos", "grabar-reunion.md")))
        # Otra carpeta no puede tocar este trabajo.
        otro = tempfile.mkdtemp(dir=TMP)
        self.assertFalse(orden("detener", {"carpeta": otro, "id": id_})["ok"])
        self.assertIsNone(orden("trabajo", {"carpeta": otro})["trabajo"])


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

    def test_pagina(self):
        """docs/index.html: CSP sin scripts en línea, JSON-LD válido con las mismas preguntas que se ven, descargas con los nombres
        fijos de publicar.yml, imagen para compartir de 1200×630 y sitemap con la URL canónica."""
        import re
        import struct
        h = open(os.path.join(RAIZ, "docs", "index.html"), encoding="utf-8").read()
        csp = re.search(r'Content-Security-Policy" content="([^"]+)"', h).group(1)
        self.assertIn("script-src 'self'", csp)
        self.assertNotIn("unsafe", csp)
        self.assertNotRegex(h, r"<script>|<script (?!src=|type=\"application/ld\+json\")|\son\w+=|style=\"")
        ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', h, re.S).group(1))
        preguntas = [q["name"] for g in ld["@graph"] if g["@type"] == "FAQPage" for q in g["mainEntity"]]
        visibles = re.findall(r"<summary><span data-es>(.*?)</span>", h)
        self.assertEqual(preguntas, visibles)
        publicar = open(os.path.join(RAIZ, ".github", "workflows", "publicar.yml"), encoding="utf-8").read()
        js = open(os.path.join(RAIZ, "docs", "pagina.js"), encoding="utf-8").read()
        for nombre in set(re.findall(r"releases/latest/download/([\w.-]+)", h)) | set(re.findall(r'"(Esquema-[\w.-]+)"', js)):
            self.assertIn(nombre, publicar)
        for ruta in re.findall(r'(?:src|href)="(?!https?:|#|demo/|\./)([^"?]+)"', h):
            self.assertTrue(os.path.exists(os.path.join(RAIZ, "docs", ruta)), ruta)
        with open(os.path.join(RAIZ, "docs", "img", "compartir.png"), "rb") as f:
            self.assertEqual(struct.unpack(">II", f.read(24)[16:24]), (1200, 630))
        self.assertIn('<link rel="canonical" href="https://esquema-app.github.io/esquema/">', h)
        self.assertIn("<loc>https://esquema-app.github.io/esquema/</loc>", open(os.path.join(RAIZ, "docs", "sitemap.xml"), encoding="utf-8").read())

    def test_licencia_agpl_completa(self):
        t = open(os.path.join(RAIZ, "LICENSE"), encoding="utf-8").read()
        self.assertIn("GNU AFFERO GENERAL PUBLIC LICENSE", t)
        self.assertIn("Version 3, 19 November 2007", t)
        self.assertIn("END OF TERMS AND CONDITIONS", t)
        self.assertGreater(len(t), 30000)

    def test_solo_biblioteca_estandar(self):
        permitidos = set(sys.stdlib_module_names) | {"comun", "carpeta", "ia", "asistente", "plantillas", "plantilla_formato", "estado", "proyecto",
                                                     "inventario", "trabajos", "documentar"}
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
