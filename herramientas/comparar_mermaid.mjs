// Compara Esquema con Mermaid real, en el mismo navegador (Chromium con Playwright): rendimiento y compatibilidad.
// Mermaid se instala solo para esta comparación, en una carpeta temporal: NUNCA es una dependencia de Esquema.
// Uso: node herramientas/comparar_mermaid.mjs            (instala mermaid@VERSION en una carpeta temporal; necesita red)
//      MERMAID_DIR=/ruta/con/node_modules node herramientas/comparar_mermaid.mjs
//      PLAYWRIGHT=/ruta/a/playwright si no está en node_modules
// Mide, para flujos de 50, 200 y 1000 nodos y secuencias de 50 y 200 mensajes: Mermaid (mermaid.render), Esquema dibujando todo
// desde cero (leer + acomodar + SVG + ponerlo en la página) y Esquema al renombrar un nodo (lo que pasa al editar). Y revisa que
// Mermaid lea los ejemplos de pruebas/compat/ y cuente los mismos nodos y flechas que Esquema.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const VERSION = "12.2.0";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
let dir = process.env.MERMAID_DIR;
if (!dir) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "esquema-mermaid-"));
  console.log(`Instalando mermaid@${VERSION} en ${dir} (solo para comparar)…`);
  execFileSync("npm", ["install", "--prefix", dir, "--ignore-scripts", "--no-audit", "--no-fund", `mermaid@${VERSION}`], { stdio: "ignore" });
}
const mermaidJs = path.join(dir, "node_modules", "mermaid", "dist", "mermaid.min.js");
const version = JSON.parse(fs.readFileSync(path.join(dir, "node_modules", "mermaid", "package.json"), "utf8")).version;
const motor = ["texto", "flujo", "secuencia", "capas", "formas", "dibujo", "markdown"].map((f) => fs.readFileSync(path.join(RAIZ, "ui/motor", f + ".js"), "utf8")).join("\n");
const css = fs.readFileSync(path.join(RAIZ, "ui/app.css"), "utf8");
const pagina = `<!doctype html><meta charset="utf-8"><style>${css} body{overflow:auto}</style><div id="m"></div><div id="e"></div><script src="/mermaid.js"></script><script src="/motor.js"></script>`;
const servidor = http.createServer((q, r) => {
  if (q.url === "/mermaid.js") { r.writeHead(200, { "Content-Type": "text/javascript" }); return fs.createReadStream(mermaidJs).pipe(r); }
  if (q.url === "/motor.js") { r.writeHead(200, { "Content-Type": "text/javascript" }); return r.end(motor); }
  r.writeHead(200, { "Content-Type": "text/html" }); r.end(pagina);
}).listen(0);
const navegador = await chromium.launch();
const p = await navegador.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto(`http://localhost:${servidor.address().port}/`);
await p.waitForFunction(() => window.mermaid && window.EsquemaMotor);

// Mismos diagramas para los dos: un árbol al azar (semilla fija) con un 20 % de flechas extra con etiqueta.
const resultados = await p.evaluate(async () => {
  const M = window.EsquemaMotor;
  mermaid.initialize({ startOnLoad: false, maxEdges: 100000, maxTextSize: 10000000, securityLevel: "strict" });
  const flujo = (n) => { let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const L = ["flowchart TD"]; for (let i = 1; i < n; i++) { L.push(`    N${Math.floor(rnd() * i)} --> N${i}[Paso número ${i}]`); if (rnd() < 0.2) L.push(`    N${i} -->|sí| N${Math.floor(rnd() * n)}`); } return L.join("\n") + "\n"; };
  const secuencia = (n) => { const ps = ["Cliente", "Web", "API", "Base", "Cola", "Correo"]; const L = ["sequenceDiagram"]; for (let i = 0; i < n; i++) { const a = ps[i % 6], b = ps[(i * 7 + 1) % 6]; L.push(`    ${a}->>${a === b ? ps[(i + 1) % 6] : b}: Mensaje ${i}`); if (i % 10 === 0) L.push(`    Note over ${a}: Nota ${i}`); } return L.join("\n") + "\n"; };
  const mediana = (l) => l.sort((a, b) => a - b)[Math.floor(l.length / 2)];
  const medir = async (f, veces) => { const t = []; for (let i = 0; i < veces; i++) { const a = performance.now(); await f(); t.push(performance.now() - a); } return mediana(t); };
  let k = 0;
  const conMermaid = async (texto) => { const { svg } = await mermaid.render("m" + k++, texto); document.getElementById("m").innerHTML = svg; };
  const conEsquema = (texto) => { const r = M.dibujar(texto); document.getElementById("e").innerHTML = M.svgCompleto(r, { estilo: "" }); return r; };
  await conMermaid("flowchart TD\n A-->B"); conEsquema("flowchart TD\n A-->B");
  const filas = [];
  for (const [tipo, n, texto] of [["flujo", 50, flujo(50)], ["flujo", 200, flujo(200)], ["flujo", 1000, flujo(1000)], ["secuencia", 50, secuencia(50)], ["secuencia", 200, secuencia(200)]]) {
    const veces = n >= 1000 ? 3 : 5;
    let errorMermaid = null;
    const tm = await medir(() => conMermaid(texto).catch((e) => { errorMermaid = String(e.message || e).slice(0, 120); }), veces);
    const te = await medir(() => { M._cacheAcomodo.clear(); conEsquema(texto); }, veces);
    // Editar: renombrar un nodo (o un mensaje) con un texto del mismo largo. Es lo que pasa en cada tecla.
    const editado = tipo === "flujo" ? texto.replace("N3[Paso número 3]", "N3[Paso numero 3]") : texto.replace("Mensaje 3", "Mensaje X");
    conEsquema(texto);
    let alterna = false;
    const ti = await medir(() => { alterna = !alterna; conEsquema(alterna ? editado : texto); }, veces * 2);
    filas.push({ tipo, n, mermaid: Math.round(tm), esquema: Math.round(te), editar: Math.round(ti * 10) / 10, errorMermaid });
  }
  return filas;
});
// Compatibilidad: Mermaid lee cada ejemplo y cuenta lo mismo que Esquema.
const compat = [];
const carpeta = path.join(RAIZ, "pruebas/compat");
const archivos = [...fs.readdirSync(carpeta).filter((f) => f.endsWith(".mmd")).map((f) => [f, path.join(carpeta, f)]), ...fs.readdirSync(path.join(carpeta, "variantes")).map((f) => ["variantes/" + f, path.join(carpeta, "variantes", f)])];
for (const [nombre, ruta] of archivos) {
  const texto = fs.readFileSync(ruta, "utf8");
  compat.push({ nombre, ...(await p.evaluate(async (t) => {
    const M = window.EsquemaMotor;
    try {
      const d = await mermaid.mermaidAPI.getDiagramFromText(t);
      const db = d.db;
      let mm;
      if (db.getVertices) { const v = db.getVertices(); const sg = new Set((db.getSubGraphs?.() || []).map((s) => s.id)); mm = { nodos: [...(v instanceof Map ? v.keys() : Object.keys(v))].filter((x) => !sg.has(x)).length, flechas: db.getEdges().length }; }
      else mm = { participantes: (db.getActors() instanceof Map ? db.getActors().size : Object.keys(db.getActors()).length), mensajes: db.getMessages().filter((m) => typeof m.from === "string" && typeof m.to === "string" && m.message !== undefined && m.type !== 2 && m.from && m.to && m.type <= 6 || [24, 25, 33, 34].includes(m.type)).length };
      const tipo = M.tipoDiagrama(t).tipo;
      let es;
      if (tipo === "flujo") { const D = M.parsearFlujo(t); es = { nodos: D.nodos.size, flechas: D.aristas.length }; }
      else { const S = M.parsearSecuencia(t); es = { participantes: S.participantes.length, mensajes: S.eventos.filter((e) => e.tipo === "mensaje").length }; }
      return { ok: true, mermaid: mm, esquema: es };
    } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 160) }; }
  }, texto)) });
}
await navegador.close();
servidor.close();
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(`\nMermaid ${version} (${kb(mermaidJs)} KB minificado) vs. motor de Esquema (${Math.round(Buffer.byteLength(motor) / 1024)} KB sin minificar), Chromium, mediana:\n`);
console.log("| Diagrama | Mermaid | Esquema (desde cero) | Esquema (al editar) | Veces más rápido |");
console.log("|---|---:|---:|---:|---:|");
for (const f of resultados) console.log(`| ${f.tipo === "flujo" ? "Flujo" : "Secuencia"}, ${f.n} ${f.tipo === "flujo" ? "nodos" : "mensajes"} | ${f.errorMermaid ? "error: " + f.errorMermaid : f.mermaid + " ms"} | ${f.esquema} ms | ${f.editar} ms | ${f.errorMermaid ? "—" : (f.mermaid / f.esquema).toFixed(1) + "× (" + Math.round(f.mermaid / Math.max(0.1, f.editar)) + "× al editar)"} |`);
console.log("\nCompatibilidad (Mermaid lee el ejemplo; cuentas de Mermaid / Esquema):");
let malos = 0;
for (const c of compat) {
  const igual = c.ok && JSON.stringify(c.mermaid) === JSON.stringify(c.esquema);
  if (!igual) malos++;
  console.log(`  ${igual ? "✓" : "✗"} ${c.nombre}: ${c.ok ? JSON.stringify(c.mermaid) + " / " + JSON.stringify(c.esquema) : "Mermaid no lo lee: " + c.error}`);
}
process.exit(malos ? 1 : 0);
