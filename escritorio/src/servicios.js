// Configuración, idioma y scripts de bin/. Equivale a app/Sources/Esquema/Servicios.swift (misma config que bin/comun.py).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { CONFIG, datos, prepararDatos, recursos, python } = require("./rutas");

let EMPAQUETADA = false;
/** main.js dice si la app está empaquetada (app.isPackaged) antes de usar nada de aquí. */
function configurar({ empaquetada }) { EMPAQUETADA = !!empaquetada; }

function leerJSON(ruta, defecto = {}) {
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return defecto; }
}
/** Escribe de una vez (temporal en la misma carpeta + renombrar), con las claves ordenadas y solo para la persona (0600). */
function escribirAtomico(ruta, contenido, modo = 0o600) {
  const tmp = path.join(path.dirname(ruta), `.esquema-${crypto.randomBytes(6).toString("hex")}`);
  fs.writeFileSync(tmp, contenido, { mode: modo });
  try { fs.renameSync(tmp, ruta); } catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}
function escribirJSON(ruta, d) {
  const ordenado = Object.fromEntries(Object.keys(d).sort().map((k) => [k, d[k]]));
  escribirAtomico(ruta, JSON.stringify(ordenado, null, 2) + "\n");
}

// ───────────── Configuración ─────────────
const Config = {
  ias: ["claude", "codex", "gemini"],
  temas: ["sistema", "claro", "oscuro"],
  leer() { const c = leerJSON(CONFIG(), {}); return c && typeof c === "object" && !Array.isArray(c) ? c : {}; },
  /** Solo claves y valores conocidos: lo que manda la interfaz no puede escribir cualquier cosa. `carpeta` nunca llega por aquí:
   *  solo la cambia el selector de carpetas del sistema (guardarCarpeta). */
  guardar(cambios) {
    const d = this.leer();
    for (const [k, v] of Object.entries(cambios || {})) {
      if (k === "ia" && this.ias.includes(v)) d.ia = v;
      else if (k === "idioma_ui" && (v === "es" || v === "en")) d.idioma_ui = v;
      else if (k === "tema" && this.temas.includes(v)) d.tema = v;
      else if (k === "bienvenida" && typeof v === "boolean") d.bienvenida = v;
    }
    prepararDatos();
    escribirJSON(CONFIG(), d);
  },
  guardarCarpeta(ruta) {
    const d = this.leer();
    d.carpeta = ruta;
    prepararDatos();
    escribirJSON(CONFIG(), d);
  },
  texto(clave) { const v = this.leer()[clave]; return typeof v === "string" ? v : ""; },
};

// ───────────── Idioma (las claves son el texto en español, igual que en ui/idiomas) ─────────────
const Idioma = {
  _cache: null,
  sistema: "es",
  /** Solo «es» o «en» (el archivo de traducciones se busca con este código: nunca otra cosa). */
  get codigo() {
    const e = Config.texto("idioma_ui");
    if (e === "es" || e === "en") return e;
    return String(this.sistema || "").toLowerCase().startsWith("es") ? "es" : "en";
  },
  /** Ya hay idioma: lo eligió (bienvenida o Ajustes) o terminó la bienvenida. */
  get elegido() { return !!Config.texto("idioma_ui") || Config.leer().bienvenida === true; },
  t(texto) {
    const c = this.codigo;
    if (c === "es") return texto;
    if (!this._cache || this._cache.codigo !== c) {
      const j = leerJSON(path.join(recursos(EMPAQUETADA), "ui", "idiomas", `${c}.json`), {}) || {};
      this._cache = { codigo: c, textos: j.textos || {} };
    }
    return this._cache.textos[texto] || texto;
  },
};

// ───────────── Scripts de bin/ (contrato: el último argumento es la ruta del JSON de salida) ─────────────
const Procesador = {
  enCurso: 0,
  /** `progreso(eventos)`: para los trabajos largos. El script escribe sus eventos (JSONL) en ESQUEMA_PROGRESO; cada 0,5 s se leen
   *  las líneas nuevas y se pasan juntas. */
  correrJSON(script, args, progreso = null) {
    return new Promise((fin) => {
      const salida = path.join(os.tmpdir(), `esquema-${crypto.randomUUID()}.json`);
      // Nada del entorno con nombre ESQUEMA_* llega a los scripts: solo las rutas de la app. (bin/ia.py además se las quita a la IA.)
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("ESQUEMA_")));
      Object.assign(env, { ESQUEMA_RECURSOS: recursos(EMPAQUETADA), ESQUEMA_DATOS: datos(), PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" });
      const lector = progreso ? lectorProgreso(progreso) : null;
      if (lector) env.ESQUEMA_PROGRESO = lector.ruta;
      let p;
      this.enCurso++;
      const terminar = (r) => { this.enCurso--; if (lector) lector.terminar(); try { fs.unlinkSync(salida); } catch {} fin(r); };
      try {
        p = spawn(python(EMPAQUETADA), [path.join(recursos(EMPAQUETADA), "bin", script), ...args, salida],
          { env, cwd: os.tmpdir(), stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      } catch (e) { return terminar({ ok: false, error: e.message }); }
      let err = "";
      p.stderr.on("data", (d) => { if (err.length < 4000) err += d; });
      p.on("error", (e) => terminar({ ok: false, error: e.message }));
      p.on("close", () => {
        const r = leerJSON(salida, null);
        if (!r && err) console.error("Esquema:", script, err.slice(-600));
        terminar(r && typeof r === "object" ? r : { ok: false, error: Idioma.t("No pude terminar. Intenta de nuevo.") });
      });
    });
  },
  /** Lo que manda la interfaz va en un archivo de entrada (nunca como argumento). */
  async conEntrada(script, accion, datosEntrada, progreso = null) {
    const entrada = path.join(os.tmpdir(), `esquema-entrada-${crypto.randomUUID()}.json`);
    escribirAtomico(entrada, JSON.stringify(datosEntrada));
    try { return await this.correrJSON(script, [accion, entrada], progreso); } finally { try { fs.unlinkSync(entrada); } catch {} }
  },
};

/** Lee el archivo de progreso de un script (JSONL) cada 0,5 s y pasa las líneas nuevas, como JSON, a `aviso(eventos)`. */
function lectorProgreso(aviso) {
  const ruta = path.join(os.tmpdir(), `esquema-progreso-${crypto.randomUUID()}.jsonl`);
  fs.writeFileSync(ruta, "", { mode: 0o600 });
  let desde = 0, resto = "";
  const leer = () => {
    let d;
    try {
      const fd = fs.openSync(ruta, "r");
      try { const tam = fs.fstatSync(fd).size; if (tam <= desde) return; d = Buffer.alloc(tam - desde); fs.readSync(fd, d, 0, d.length, desde); desde = tam; } finally { fs.closeSync(fd); }
    } catch { return; }
    resto += d.toString("utf8");
    const lineas = resto.split("\n"); resto = lineas.pop();
    const eventos = [];
    for (const l of lineas) { try { const j = JSON.parse(l); if (j && typeof j === "object") eventos.push(j); } catch {} }
    if (eventos.length) aviso(eventos);
  };
  const reloj = setInterval(leer, 500);
  return { ruta, terminar() { clearInterval(reloj); leer(); try { fs.unlinkSync(ruta); } catch {} } };
}

/** Los guardados corren de a uno y en el orden en que llegaron: así el último texto escrito es el que queda en el disco. */
const EnOrden = {
  _cola: Promise.resolve(),
  pendientes: 0,
  agregar(tarea) {
    this.pendientes++;
    const r = this._cola.then(tarea).finally(() => { this.pendientes--; });
    this._cola = r.catch(() => {});
    return r;
  },
};

module.exports = { configurar, leerJSON, escribirAtomico, Config, Idioma, Procesador, EnOrden, lectorProgreso };
