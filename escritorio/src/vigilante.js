// Vigilar la carpeta de la persona (equivale a Vigilante en app/Sources/Esquema/Carpeta.swift, que usa FSEvents).
// Si un archivo abierto cambia en el disco (VS Code, git pull…), la interfaz se entera; si la lista de .md/.mmd cambia, también.
//
// Esquema recuerda el último texto que leyó o guardó de cada archivo abierto (`conocidos`). Cuando fs.watch avisa algo que puede
// importar (un .md o .mmd, o una carpeta), espera a que la carpeta quede quieta y:
//   1. relee cada archivo conocido; si su texto no es el que Esquema conoce, avisa `archivoCambiado {ruta, texto}`. Un guardado de la
//      propia app no se avisa: su texto queda como conocido antes de escribirlo.
//   2. vuelve a listar (bin/carpeta.py listar) y, si la lista cambió, avisa `archivos {archivos}`.
// Windows: fs.watch recursivo (nativo). Linux: un fs.watch por carpeta (inotify), sin entrar a .git, node_modules y otras carpetas
// pesadas (las mismas que salta bin/comun.py), con un máximo de carpetas; se vuelven a revisar en cada cambio.
// Sin Electron: se prueba con Node (escritorio/pruebas/vigilante.mjs).
const fs = require("fs");
const path = require("path");
const { absoluta, MAXIMO } = require("./rutas");

const FUERA = new Set([".git", "node_modules", ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".tox", "dist", "build",
  ".next", ".nuxt", "target", ".gradle", ".idea", ".terraform", ".aws", ".ssh", ".gnupg", ".cache", "Pods", "DerivedData", ".build"]);
const MAX_CARPETAS = 3000;
const PROFUNDIDAD = 8;

/** ¿Puede importar este nombre (relativo a la carpeta)? Un .md/.mmd o algo sin extensión (una carpeta), fuera de las pesadas. */
function importa(relativa) {
  if (!relativa) return true;
  const partes = String(relativa).split(/[\\/]/);
  if (partes.some((p) => FUERA.has(p))) return false;
  const ext = path.extname(partes[partes.length - 1]).toLowerCase();
  return ext === ".md" || ext === ".mmd" || ext === "";
}

/** El texto de un archivo como lo lee bin/carpeta.py (UTF-8; lo que no lo es se reemplaza), o null. */
function leerTexto(ruta) {
  try {
    const st = fs.statSync(ruta);
    if (!st.isFile() || st.size > MAXIMO) return null;
    return fs.readFileSync(ruta).toString("utf8");
  } catch { return null; }
}

class Vigilante {
  /** avisar(funcion, datos): hacia la interfaz. listar(base) → promesa con la respuesta de bin/carpeta.py listar. */
  constructor({ avisar, listar, espera = 350, plataforma = process.platform }) {
    Object.assign(this, { avisar, listar, espera, plataforma });
    this.base = null;
    this.conocidos = new Map();  // ruta relativa → último texto que Esquema leyó o guardó
    this.lista = null;           // rutas del último listado
    this._vigias = new Map();    // carpeta absoluta → FSWatcher
    this._reloj = null;
    this._revisando = false;
    this._otraVez = false;
  }

  empezar(base, archivos) {
    if (this.base === base && this._vigias.size) { if (archivos) this.lista = archivos.map((a) => a.ruta); return; }
    this.detener();
    this.base = base;
    this.conocidos = new Map();
    this.lista = archivos ? archivos.map((a) => a.ruta) : null;
    if (this.plataforma === "win32" || this.plataforma === "darwin") this._vigiar(base, true);
    else this._sincronizarCarpetas();
  }

  detener() {
    for (const w of this._vigias.values()) { try { w.close(); } catch {} }
    this._vigias.clear();
    clearTimeout(this._reloj);
    this.base = null;
  }

  _vigiar(dir, recursivo) {
    if (this._vigias.has(dir)) return;
    try {
      const w = fs.watch(dir, { recursive: recursivo, persistent: false }, (_tipo, nombre) => {
        const rel = recursivo ? nombre : path.relative(this.base || dir, path.join(dir, String(nombre || "")));
        if (importa(rel)) this.programar();
      });
      w.on("error", () => { try { w.close(); } catch {} this._vigias.delete(dir); });
      this._vigias.set(dir, w);
    } catch { /* sin permiso o se borró: no pasa nada */ }
  }

  /** Linux: un vigía por carpeta. Agrega las nuevas y quita las que ya no están. */
  _sincronizarCarpetas() {
    if (!this.base) return;
    const vistas = new Set();
    const pila = [[this.base, 0]];
    while (pila.length && vistas.size < MAX_CARPETAS) {
      const [dir, nivel] = pila.pop();
      vistas.add(dir);
      if (nivel >= PROFUNDIDAD) continue;
      let entradas = [];
      try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entradas) if (e.isDirectory() && !e.isSymbolicLink() && !FUERA.has(e.name)) pila.push([path.join(dir, e.name), nivel + 1]);
    }
    for (const [dir, w] of this._vigias) if (!vistas.has(dir)) { try { w.close(); } catch {} this._vigias.delete(dir); }
    for (const dir of vistas) this._vigiar(dir, false);
  }

  /** Un editor o git escriben varias veces seguidas: se espera a que la carpeta quede quieta. */
  programar() {
    clearTimeout(this._reloj);
    this._reloj = setTimeout(() => this.revisar(), this.espera);
  }

  /** Recuerda el texto que Esquema leyó o guardó (así su propio guardado no se avisa como un cambio de afuera). */
  conocer(ruta, texto) { if (typeof texto === "string") this.conocidos.set(ruta, texto); else this.conocidos.delete(ruta); }

  async revisar() {
    const base = this.base;
    if (!base) return;
    if (this._revisando) { this._otraVez = true; return; }
    this._revisando = true;
    try {
      for (const [ruta, conocido] of this.conocidos) {
        const abs = absoluta(ruta, base);
        const texto = abs && leerTexto(abs);
        if (texto == null || texto === conocido) continue;
        this.conocidos.set(ruta, texto);
        this.avisar("archivoCambiado", { ruta, texto });
      }
      if (this.plataforma !== "win32" && this.plataforma !== "darwin") this._sincronizarCarpetas();
      const r = await this.listar(base);
      if (r && r.ok && this.base === base) {
        const rutas = (r.archivos || []).map((a) => a.ruta);
        if (!this.lista || rutas.length !== this.lista.length || rutas.some((x, i) => x !== this.lista[i])) {
          this.lista = rutas;
          this.avisar("archivos", { archivos: r.archivos || [] });
        }
      }
    } finally {
      this._revisando = false;
      if (this._otraVez) { this._otraVez = false; this.programar(); }
    }
  }
}

module.exports = { Vigilante, importa, leerTexto, FUERA };
