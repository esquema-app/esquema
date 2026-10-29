// Dónde vive cada cosa (equivale a Rutas en app/Sources/Esquema/Servicios.swift y a bin/comun.py).
// La configuración en la carpeta de Esquema del sistema; el código (bin/, ui/, plantillas/, tipos/) dentro de la app (sin empaquetar, el del repo).
// Los documentos de la persona, en la carpeta que elige (nunca se copian a otro lado).
const fs = require("fs");
const os = require("os");
const path = require("path");

const ES_WIN = process.platform === "win32";
const PLATAFORMA = ES_WIN ? "windows" : "linux";
/** Carpeta de escritorio/vendor (mismos nombres que usa electron-builder en ${os}: linux, win). */
const VENDOR = ES_WIN ? "win" : "linux";
const HOME = os.homedir();
/** Raíz del repo cuando se corre sin empaquetar (escritorio/src → raíz). */
const REPO = path.resolve(__dirname, "..", "..");

/** La misma carpeta que comun.carpeta_app(): %APPDATA%\Esquema o ~/.config/esquema. */
function datos() {
  if (ES_WIN) return path.join(process.env.APPDATA || path.join(HOME, "AppData", "Roaming"), "Esquema");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, ".config"), "esquema");
}
const CONFIG = () => path.join(datos(), "config.json");

/** La carpeta de Esquema queda solo para la persona (0700), igual que comun.carpeta_privada. */
function prepararDatos() {
  fs.mkdirSync(datos(), { recursive: true });
  try { fs.chmodSync(datos(), 0o700); } catch {}
}

/** Código (bin/, ui/, plantillas/, tipos/): dentro de la app si está empaquetada; si no, el del repo. */
function recursos(empaquetada) {
  return empaquetada ? path.join(process.resourcesPath, "esquema") : REPO;
}

/** Python portátil que viene con la app; en desarrollo (sin vendor/), el del sistema. */
function python(empaquetada) {
  const dentro = empaquetada ? path.join(process.resourcesPath, "python") : path.join(REPO, "escritorio", "vendor", VENDOR, "python");
  const r = ES_WIN ? path.join(dentro, "python.exe") : path.join(dentro, "bin", "python3");
  return fs.existsSync(r) ? r : ES_WIN ? "python" : "python3";
}

const EXTENSIONES = [".md", ".mmd"];
const MAXIMO = 2 * 1024 * 1024;

/** La ruta relativa que manda la interfaz, revisada igual que comun.ruta_en (bin/ la vuelve a revisar): relativa, sin «..»,
 *  .md o .mmd y, siguiendo enlaces, dentro de la carpeta. Devuelve la ruta absoluta o null. */
function absoluta(relativa, base) {
  if (typeof relativa !== "string" || !relativa || relativa.length > 400 || relativa.includes("\0")) return null;
  if (path.isAbsolute(relativa) || /^[\\/]/.test(relativa) || /^[A-Za-z]:/.test(relativa)) return null;
  const partes = relativa.split(/[\\/]/);
  if (partes.some((p) => p === "" || p === "." || p === "..")) return null;
  if (!EXTENSIONES.some((e) => relativa.toLowerCase().endsWith(e))) return null;
  let raiz;
  try { raiz = fs.realpathSync(base); } catch { return null; }
  let ruta = path.join(raiz, ...partes);
  try { ruta = fs.realpathSync(ruta); } catch { /* todavía no existe (archivo nuevo): se revisa la carpeta que lo contiene */
    try { ruta = path.join(fs.realpathSync(path.dirname(ruta)), path.basename(ruta)); } catch {}
  }
  const rel = path.relative(raiz, ruta);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? ruta : null;
}

module.exports = { ES_WIN, PLATAFORMA, HOME, REPO, datos, CONFIG, prepararDatos, recursos, python, absoluta, EXTENSIONES, MAXIMO };
