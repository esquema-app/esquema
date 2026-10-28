// Pruebas del motor (ui/motor/) en Node, sin navegador: leer, escribir, editar, acomodar, dibujar y Markdown.
// Uso: node pruebas/motor.mjs
// 1) casos de pruebas/casos.json; 2) compatibilidad: cada ejemplo de pruebas/compat/*.mmd (sintaxis Mermaid) se lee sin errores y se
// vuelve a escribir IGUAL; las variantes (formas no canónicas) se leen y su forma canónica dice lo mismo; 3) el acomodo no
// solapa nodos, los grupos abrazan a los suyos y no tapan a los demás, las etiquetas no pisan nodos y las flechas llegan al
// borde; 4) incremental: si solo cambia un texto que no cambia tamaños, no se vuelve a acomodar; 5) seguridad del SVG;
// 6) cada frase de error del motor tiene su traducción; 7) un diagrama de 1000 nodos se dibuja en tiempo razonable.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
for (const f of ["texto", "flujo", "secuencia", "capas", "formas", "dibujo", "markdown"]) require(path.join(RAIZ, "ui/motor", f + ".js"));
const M = globalThis.EsquemaMotor;
const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas/casos.json"), "utf8"));
let fallas = 0, total = 0;
const falla = (m) => { fallas++; console.log("  ✗ " + m); };
const ok = (c, m) => { total++; if (!c) falla(m); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("Leer");
for (const c of casos.flujo) {
  const D = M.parsearFlujo(c.texto);
  ok(!D.errores.length, `sin errores: ${c.texto.split("\n")[1]} → ${D.errores.map(M.frase)}`);
  ok(D.dir === c.dir, `dirección ${D.dir} ≠ ${c.dir}`);
  for (const [id, [forma, etq]] of Object.entries(c.nodos)) { const n = D.nodos.get(id); ok(n && n.forma === forma && n.etiqueta === etq, `nodo ${id}: ${n && [n.forma, n.etiqueta]} ≠ ${[forma, etq]}`); }
  const ar = D.aristas.map((e) => [e.de, e.a, e.etiqueta, e.trazo]);
  ok(igual(ar, c.aristas), `aristas ${JSON.stringify(ar)} ≠ ${JSON.stringify(c.aristas)}`);
}
for (const c of casos.secuencia) {
  const S = M.parsearSecuencia(c.texto);
  ok(!S.errores.length, "secuencia sin errores: " + S.errores.map(M.frase));
  ok(igual(S.participantes.map((p) => [p.id, p.etiqueta, p.actor]), c.participantes), "participantes " + JSON.stringify(S.participantes.map((p) => [p.id, p.etiqueta, p.actor])));
  const ms = S.eventos.filter((e) => e.tipo === "mensaje").map((e) => [e.de, e.a, e.texto, e.trazo, e.punta]);
  ok(igual(ms, c.mensajes), "mensajes " + JSON.stringify(ms));
}
console.log("Errores claros");
for (const c of casos.errores) {
  const r = M.dibujar(c.texto);
  const lista = c.aviso ? r.avisos : r.errores;
  const e = lista.find((x) => x.plantilla === c.plantilla);
  ok(e, `«${c.texto.replace(/\n/g, "⏎")}» debería decir «${c.plantilla}» y dice ${JSON.stringify(lista.map(M.frase))}`);
  if (e) ok(e.linea === c.linea, `línea ${e.linea} ≠ ${c.linea} en «${c.plantilla}»`);
  if (e && c.sugerencia) ok(e.sugerencia === c.sugerencia, `sugerencia «${e.sugerencia}» ≠ «${c.sugerencia}»`);
}
console.log("Editar (el texto cambia solo donde hace falta)");
for (const c of [...casos.ediciones, ...casos.ediciones_secuencia]) {
  const r = M[c.op](c.texto, ...c.args);
  const t = typeof r === "string" ? r : r.texto;
  ok(t === c.esperado, `${c.op}(${JSON.stringify(c.args)}):\n${t}\n≠\n${c.esperado}`);
  ok(!M.dibujar(t).errores.length, `${c.op} deja el texto sin errores`);
}
{
  const t = "flowchart TD\n    A --> B\n";
  const r1 = M.agregarNodo(t, "Nuevo"), r2 = M.conectarNuevo(r1.texto, "B", "Otro");
  ok(r1.id === "N1" && r2.id === "N2" && r2.texto.includes("B --> N2[Otro]"), "agregarNodo/conectarNuevo con ids libres");
  const s = M.agregarMensaje("sequenceDiagram\n    A->>B: x\n", "B", "A", 1, "Respuesta");
  ok(s.texto === "sequenceDiagram\n    A->>B: x\n    B->>A: Respuesta\n" && s.linea === 2, "agregarMensaje después de una línea: " + JSON.stringify(s));
  const p = M.agregarParticipante("sequenceDiagram\n    participant A\n    A->>A: x\n", "Nuevo");
  ok(p.texto.includes("participant A\n    participant P1 as Nuevo\n"), "agregarParticipante después de los declarados");
}

console.log("Compatibilidad con Mermaid");
const dir = path.join(RAIZ, "pruebas/compat");
const resumen = (t) => {
  const tipo = M.tipoDiagrama(t).tipo;
  if (tipo === "flujo") { const D = M.parsearFlujo(t); return { dir: D.dir, nodos: [...D.nodos.values()].map((n) => [n.id, n.forma, n.etiqueta, n.subgrafo]), aristas: D.aristas.map((e) => [e.de, e.a, e.etiqueta, e.trazo, e.inicio, e.fin, e.largo]), grupos: [...D.subgrafos.values()].map((s) => [s.id, s.titulo, s.padre, s.dir]) }; }
  const S = M.parsearSecuencia(t);
  return { ps: S.participantes.map((p) => [p.id, p.etiqueta, p.actor]), ev: S.eventos.map((e) => [e.tipo, e.de, e.a, e.texto, e.trazo, e.punta, e.clase, e.lado]) };
};
const serializar = (t) => (M.tipoDiagrama(t).tipo === "flujo" ? M.serializarFlujo(M.parsearFlujo(t)) : M.serializarSecuencia(M.parsearSecuencia(t)));
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mmd")).sort()) {
  const t = fs.readFileSync(path.join(dir, f), "utf8");
  const r = M.dibujar(t);
  ok(!r.errores.length, `${f}: ${r.errores.map(M.frase)}`);
  ok(serializar(t) === t, `${f}: escribir(leer(x)) ≠ x:\n${serializar(t)}`);
}
for (const f of fs.readdirSync(path.join(dir, "variantes")).sort()) {
  const t = fs.readFileSync(path.join(dir, "variantes", f), "utf8");
  const r = M.dibujar(t);
  ok(!r.errores.length, `variantes/${f}: ${r.errores.map(M.frase)}`);
  const c = serializar(t);
  ok(igual(resumen(c), resumen(t)), `variantes/${f}: la forma canónica dice otra cosa:\n${c}`);
  ok(serializar(c) === c, `variantes/${f}: la forma canónica no es estable`);
}

console.log("Acomodo");
function grafo(n, semilla = 7, grupos = false) {
  let s = semilla;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const L = ["flowchart TD"];
  for (let i = 1; i < n; i++) {
    const p = Math.floor(rnd() * i);
    L.push(`    N${p} --> N${i}[Paso número ${i}]`);
    if (rnd() < 0.2) L.push(`    N${i} -->|sí| N${Math.floor(rnd() * n)}`);
  }
  if (grupos) { L.push("    subgraph g1 [Grupo uno]"); for (let i = 1; i < Math.min(n, 6); i++) L.push(`        N${i}`); L.push("    end"); }
  return L.join("\n") + "\n";
}
const solapan = (a, b, m = 0.5) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - m && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - m;
function revisarAcomodo(nombre, t) {
  const r = M.dibujar(t);
  if (r.tipo !== "flujo") return;
  const g = r.geo, nodos = [...g.nodos.entries()];
  let malos = 0;
  for (let i = 0; i < nodos.length; i++) for (let j = i + 1; j < nodos.length; j++) if (!nodos[i][1].fijo && !nodos[j][1].fijo && solapan(nodos[i][1], nodos[j][1])) malos++;
  ok(!malos, `${nombre}: ${malos} pares de nodos solapados`);
  const D = r.modelo;
  const dentro = (id, sg) => { let x = D.nodos.get(id)?.subgrafo; while (x) { if (x === sg) return true; x = D.subgrafos.get(x)?.padre; } return false; };
  for (const [sg, b] of g.grupos) {
    const caja = { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h };
    for (const [id, n] of nodos) {
      if (n.fijo) continue;
      if (dentro(id, sg)) ok(n.x - n.w / 2 >= b.x - 0.5 && n.x + n.w / 2 <= b.x + b.w + 0.5 && n.y - n.h / 2 >= b.y - 0.5 && n.y + n.h / 2 <= b.y + b.h + 0.5, `${nombre}: ${id} se sale de su grupo ${sg}`);
      else ok(!solapan(n, caja), `${nombre}: el grupo ${sg} tapa a ${id}`);
    }
  }
  for (const [k, a] of g.aristas) {
    const e = D.aristas[k], A = g.nodos.get(e.de), B = g.nodos.get(e.a);
    if (!A || !B || e.de === e.a) continue;
    const p0 = a.puntos[0], p1 = a.puntos[a.puntos.length - 1];
    const cerca = (p, n) => Math.abs(p.x - n.x) <= n.w / 2 + 1 && Math.abs(p.y - n.y) <= n.h / 2 + 1;
    ok(cerca(p0, A) && cerca(p1, B), `${nombre}: la flecha ${e.de}→${e.a} no sale o no llega al borde`);
  }
  const etqs = r.partes.filter((p) => p.clave.startsWith("e:")).map((p) => { const m = /translate\(([-\d.]+),([-\d.]+)\)"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(p.svg); return { x: +m[1], y: +m[2], w: +m[5], h: +m[6] }; });
  let pisadas = 0;
  for (const q of etqs) for (const [, n] of nodos) if (!n.fijo && solapan(q, n, 1)) pisadas++;
  ok(!pisadas, `${nombre}: ${pisadas} etiquetas de flechas encima de nodos`);
}
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mmd"))) revisarAcomodo(f, fs.readFileSync(path.join(dir, f), "utf8"));
// Las plantillas incluidas y la copia del catálogo de la comunidad (ejemplos/catalogo-ejemplo) se dibujan bien.
for (const base of [path.join(RAIZ, "plantillas"), path.join(RAIZ, "ejemplos", "catalogo-ejemplo", "plantillas")]) for (const f of fs.readdirSync(base).filter((x) => !x.includes("."))) for (const p of fs.readdirSync(path.join(base, f))) {
  const pl = JSON.parse(fs.readFileSync(path.join(base, f, p), "utf8"));
  for (const [idioma, t] of Object.entries(pl.contenido)) {
    if (pl.tipo === "diagrama") { ok(!M.dibujar(t).errores.length, `plantilla ${pl.id} (${idioma}) sin errores`); revisarAcomodo(`plantilla ${pl.id}`, t); }
    else for (const b of M.bloquesMermaid(t)) ok(!M.dibujar(b.contenido).errores.length, `plantilla ${pl.id} (${idioma}): diagrama sin errores`);
  }
}
for (const n of [30, 120]) revisarAcomodo(`aleatorio ${n}`, grafo(n, n));
revisarAcomodo("aleatorio con grupo", grafo(40, 3, true));
for (const d of ["LR", "BT", "RL"]) revisarAcomodo("dirección " + d, grafo(25, 5).replace("flowchart TD", "flowchart " + d));
{
  const t = "flowchart TD\n    A --> B\n    B --> C\n    C --> A\n    A --> C\n";
  ok(!M.dibujar(t).errores.length && M.dibujar(t).geo.aristas.size === 4, "ciclos: se dibujan todas las flechas");
  const x = M._cruces([[0, 1], [1, 0]], 2); ok(x === 1, "contar cruces: " + x);
  const y = M._isotonica([3, 1, 2], [1, 1, 1]); ok(igual(Array.from(y), [2, 2, 2]), "regresión isotónica: " + Array.from(y));
}

console.log("Incremental");
{
  const t = grafo(80, 11);
  M._cacheAcomodo.clear();
  const a0 = M.estadisticas.acomodos, r0 = M.estadisticas.reutilizados;
  M.dibujar(t);
  const t2 = M.renombrarNodo(t, "N5", "Paso numero 5");  // mismo largo: mismo tamaño
  M.dibujar(t2);
  ok(M.estadisticas.acomodos === a0 + 1 && M.estadisticas.reutilizados === r0 + 1, `renombrar sin cambiar tamaños no vuelve a acomodar (${M.estadisticas.acomodos - a0} acomodos)`);
  M.dibujar(M.fijar(t2, "N5", 10, 10));
  ok(M.estadisticas.acomodos === a0 + 1, "mover un nodo no vuelve a acomodar");
  M.dibujar(M.conectar(t2, "N1", "N2"));
  ok(M.estadisticas.acomodos === a0 + 2, "una flecha nueva sí");
  const p1 = M.dibujar(t).partes, p2 = M.dibujar(M.renombrarNodo(t, "N5", "Paso numero 5")).partes;
  const distintas = p1.filter((p, i) => p.svg !== p2[i].svg).map((p) => p.clave);
  ok(igual(distintas, ["n:N5"]), "solo cambia la parte del nodo renombrado: " + distintas.join(","));
}

console.log("Seguridad");
{
  const r = M.dibujar('flowchart TD\n    A["<script>alert(1)</script>"] --> B["<img src=x onerror=alert(1)>"]\n    classDef x fill:url(javascript:alert(1)),stroke:#f00\n    class A x\n    click A call alert()');
  const svg = M.svgCompleto(r);
  ok(!/<script|<img|onerror=|javascript:|url\((?!#)/i.test(svg.replace(/&lt;script|&lt;img[^&]*/g, "")), "el SVG no lleva HTML ni url() de afuera");
  ok(svg.includes("stroke:#f00"), "los estilos válidos sí pasan");
  const s = M.dibujar('sequenceDiagram\n    participant A as <b onmouseover=x>Ana</b>\n    A->>A: <script>x</script>');
  ok(!/<b |<script/.test(M.svgCompleto(s)), "secuencia: texto escapado");
  ok(M.leerMeta('{"pos":{"A":[1,"x"]},"iconos":{"A":"<x>"},"otro":1}') !== null && !M.leerMeta('{"pos":{"A":[1,"x"]}}').pos.A, "metadatos validados");
}
for (const c of casos.markdown) {
  const h = M.markdownHTML(c.md);
  for (const x of c.contiene || []) ok(h.includes(x), `markdown «${c.md.slice(0, 40)}» debería tener ${x}: ${h}`);
  for (const x of c.no_contiene || []) ok(!h.includes(x), `markdown «${c.md.slice(0, 40)}» no debería tener ${x}: ${h}`);
}
{
  const md = "# T\n\n```mermaid\nflowchart TD\n    A --> B\n```\n\nfin\n";
  const r = M.reemplazarBloque(md, 0, "flowchart LR\n    X --> Y");
  ok(r === "# T\n\n```mermaid\nflowchart LR\n    X --> Y\n```\n\nfin\n", "reemplazar un bloque del documento: " + r);
  const ins = M.insertarBloque(md, "sequenceDiagram\n    A->>B: x\n");
  ok(ins.k === 1 && M.bloquesMermaid(ins.texto).length === 2 && ins.texto.endsWith("```\n"), "insertar un bloque al final: " + JSON.stringify(ins));
}

console.log("Traducciones del motor");
{
  const en = JSON.parse(fs.readFileSync(path.join(RAIZ, "ui/idiomas/en.json"), "utf8")).textos;
  const frases = new Set();
  for (const f of fs.readdirSync(path.join(RAIZ, "ui/motor"))) for (const m of fs.readFileSync(path.join(RAIZ, "ui/motor", f), "utf8").matchAll(/M\.problema\([^"]*"((?:[^"\\]|\\.)*)"/g)) frases.add(m[1].replace(/\\"/g, '"'));
  const faltan = [...frases].filter((x) => !en[x]);
  ok(!faltan.length, "frases del motor sin traducir:\n    " + faltan.join("\n    "));
  for (const [k, v] of Object.entries(en)) { const a = (k.match(/\{\w+\}/g) || []).sort().join(), b = (v.match(/\{\w+\}/g) || []).sort().join(); ok(a === b, `en.json: marcadores distintos en «${k}»`); }
}

console.log("Rendimiento");
{
  const t = grafo(1000, 1), t2 = M.renombrarNodo(t, "N7", "Paso numero 7");
  const mediana = (f) => { const l = []; for (let i = 0; i < 5; i++) { const a = performance.now(); f(); l.push(performance.now() - a); } return l.sort((x, y) => x - y)[2]; };
  const r = M.dibujar(t);
  const cero = mediana(() => { M._cacheAcomodo.clear(); M.dibujar(t); });
  let alterna = false;
  const editar = mediana(() => { alterna = !alterna; M.dibujar(alterna ? t2 : t); });
  ok(!r.errores.length && r.geo.nodos.size === 1000, "1000 nodos sin errores");
  ok(cero < 3000, `1000 nodos en ${Math.round(cero)} ms (límite 3000 en CI)`);
  ok(editar < cero, `editar uno es más rápido que dibujar todo (${Math.round(editar)} ms)`);
  console.log(`  1000 nodos (Node, mediana de 5): ${Math.round(cero)} ms desde cero, ${Math.round(editar)} ms al renombrar uno`);
}
console.log(fallas ? `✗ Motor: ${fallas} de ${total} revisiones fallaron` : `✓ Motor: ${total} revisiones`);
process.exit(fallas ? 1 : 0);
