// La vigilancia de la carpeta de Windows y Linux (src/vigilante.js), sin Electron: con una carpeta temporal ficticia y el listado de
// verdad (bin/carpeta.py). Revisa que un cambio de afuera se avise, que el guardado propio no, que un archivo nuevo actualice la
// lista y que lo de node_modules o .git no cuente. Uso: node escritorio/pruebas/vigilante.mjs
import { createRequire } from "module";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const { Vigilante, importa } = createRequire(import.meta.url)("../src/vigilante.js");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const problemas = [];
const revisar = (cond, m) => { if (!cond) problemas.push(m); };

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "esquema-vigilante-")));
fs.mkdirSync(path.join(base, "docs"));
fs.mkdirSync(path.join(base, "node_modules", "x"), { recursive: true });
fs.writeFileSync(path.join(base, "README.md"), "# Ana Pérez\n");
fs.writeFileSync(path.join(base, "docs", "flujo.mmd"), "flowchart TD\n    A --> B\n");
const listar = (b) => {
  const salida = path.join(os.tmpdir(), `esquema-v-${process.pid}-${Date.now()}.json`);
  execFileSync("python3", [path.join(RAIZ, "bin", "carpeta.py"), "listar", b, salida]);
  const r = JSON.parse(fs.readFileSync(salida, "utf8")); fs.unlinkSync(salida); return r;
};
const avisos = [];
const v = new Vigilante({ avisar: (f, d) => avisos.push([f, d]), listar: async (b) => listar(b), espera: 150, plataforma: process.platform === "win32" ? "win32" : "linux" });
v.empezar(base, listar(base).archivos);
v.conocer("docs/flujo.mmd", "flowchart TD\n    A --> B\n");

// 1. Guardado propio (se conoce antes de escribir): no se avisa.
v.conocer("docs/flujo.mmd", "flowchart TD\n    A --> C\n");
fs.writeFileSync(path.join(base, "docs", "flujo.mmd"), "flowchart TD\n    A --> C\n");
await espera(700);
revisar(!avisos.some(([f]) => f === "archivoCambiado"), "el guardado propio se avisó como cambio de afuera");

// 2. Cambio de afuera: se avisa con el texto nuevo.
fs.writeFileSync(path.join(base, "docs", "flujo.mmd"), "flowchart TD\n    A --> D\n");
await espera(700);
const cambio = avisos.find(([f]) => f === "archivoCambiado");
revisar(cambio && cambio[1].ruta === "docs/flujo.mmd" && cambio[1].texto.includes("A --> D"), "no avisó el cambio de afuera");

// 3. Lo de node_modules no cuenta; un archivo nuevo (también en una carpeta nueva) actualiza la lista.
const antes = avisos.length;
fs.writeFileSync(path.join(base, "node_modules", "x", "nada.md"), "# no\n");
await espera(500);
revisar(avisos.length === antes, "un cambio en node_modules generó un aviso");
fs.mkdirSync(path.join(base, "nueva"));
await espera(500);
fs.writeFileSync(path.join(base, "nueva", "doc.md"), "# Nuevo\n");
await espera(800);
const lista = avisos.filter(([f]) => f === "archivos").pop();
revisar(lista && lista[1].archivos.some((a) => a.ruta === "nueva/doc.md"), "la lista no incluyó el archivo nuevo en una carpeta nueva");

// 4. Qué importa.
revisar(importa("docs/a.md") && importa("a.MMD") && importa("carpeta") && !importa("node_modules/a.md") && !importa(".git/HEAD") && !importa("foto.png"), "importa() no filtra bien");

v.detener();
fs.rmSync(base, { recursive: true, force: true });
if (problemas.length) { console.log("✗ Vigilancia de la carpeta:\n  - " + problemas.join("\n  - ")); process.exit(1); }
console.log("✓ Vigilancia de la carpeta (Windows y Linux): cambios de afuera, guardado propio, archivos nuevos y carpetas pesadas");
