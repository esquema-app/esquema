// Las plantillas de la comunidad en Windows y Linux (src/catalogo.js, pieza «catálogo»), sin Electron ni red: un «servidor» falso sirve
// el catálogo de ejemplo (ejemplos/catalogo-ejemplo) y los scripts de verdad (bin/catalogo.py con plantilla_formato) validan y guardan. Revisa que solo se pida al
// dominio fijo, que una redirección, un archivo de más o una huella distinta se rechacen y que lo bueno quede en la carpeta de
// Esquema (temporal). Uso: node escritorio/pruebas/catalogo.mjs
import { createRequire } from "module";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "esquema-catalogo-"));
process.env.XDG_CONFIG_HOME = TMP;  // la carpeta de Esquema de la prueba (datos() → TMP/esquema)
process.env.APPDATA = TMP;
const require = createRequire(import.meta.url);
const { crear } = require("../src/catalogo.js");
const { Procesador } = require("../src/servicios.js");
const problemas = [];
const revisar = (c, m) => { if (!c) problemas.push(m); };

// El índice del catálogo de ejemplo, armado como en el catálogo de verdad.
const salida = path.join(TMP, "indice.json");
execFileSync("python3", [path.join(RAIZ, "bin", "catalogo.py"), "generar", "plantillas", path.join(RAIZ, "ejemplos", "catalogo-ejemplo"), salida]);
const indice = fs.readFileSync(salida);
const pedidos = [];
let trampa = null;  // para probar respuestas malas
const archivo = (ruta) => (ruta === "index.json" ? indice : fs.readFileSync(path.join(RAIZ, "ejemplos", "catalogo-ejemplo", ruta)));
async function falso(url, opciones) {
  pedidos.push([url, opciones]);
  if (trampa === "redireccion") throw new TypeError("redirect");
  const ruta = url.slice(BASE.length);
  let cuerpo = archivo(ruta);
  if (trampa === "dañada" && ruta !== "index.json") cuerpo = Buffer.concat([cuerpo, Buffer.from(" ")]);
  if (trampa === "enorme") cuerpo = Buffer.alloc(2 * 1024 * 1024, 32);
  return new Response(cuerpo, { status: 200 });
}
const C = crear({ fetch: falso, procesador: Procesador, appJson: JSON.parse(fs.readFileSync(path.join(RAIZ, "app.json"), "utf8")), agente: "Esquema/prueba" });
const BASE = C.config.base;
revisar(BASE === "https://raw.githubusercontent.com/esquema-app/esquema-catalogo/main/", "app.json no apunta a esquema-app/esquema-catalogo: " + BASE);

const l = await C.listar("plantillas");
revisar(l.ok && l.plantillas.length >= 6, "el índice del catálogo no se leyó: " + JSON.stringify(l).slice(0, 200));
revisar(pedidos.every(([u, o]) => u.startsWith(BASE) && o.redirect === "error"), "se pidió algo fuera de raw.githubusercontent.com/esquema-app/esquema-catalogo o siguiendo redirecciones");
const id = l.plantillas?.[0]?.id;
const d = await C.descargar("plantillas", id);
revisar(d.ok && d.plantilla?.id === id, "la plantilla no se descargó: " + JSON.stringify(d).slice(0, 200));
revisar(fs.existsSync(path.join(TMP, "esquema", "plantillas", id + ".json")), "la plantilla no quedó en la carpeta de Esquema");
revisar((await C.descargar("plantillas", "no-existe")).codigo === "no_esta", "se descargó un id que no está en el índice");
revisar(!(await C.descargar("plantillas", "../../config")).ok, "se aceptó un id con ruta");
trampa = "dañada";
const danada = await C.descargar("plantillas", id);
revisar(danada.codigo === "danado" && danada.plantilla === "Llegó dañado. Intenta de nuevo." && danada.id === id, "una plantilla con otra huella no se rechazó: " + JSON.stringify(danada));
trampa = "redireccion";
revisar(!(await C.descargar("plantillas", id)).ok && !(await C.listar("plantillas")).ok, "una redirección no se rechazó");
trampa = "enorme";
revisar(!(await C.listar("plantillas")).ok, "un índice de más de 1 MB no se rechazó");

fs.rmSync(TMP, { recursive: true, force: true });
if (problemas.length) { console.log("✗ Catálogo (Windows y Linux):\n  - " + problemas.join("\n  - ")); process.exit(1); }
console.log("✓ Catálogo (Windows y Linux): solo el dominio fijo, sin redirecciones, tamaño máximo y huella; lo bueno queda en la carpeta de Esquema");
