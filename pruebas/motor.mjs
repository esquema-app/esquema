// Pruebas del motor (ui/motor/) en Node, sin navegador: leer, escribir, editar, acomodar, dibujar y Markdown.
// Uso: node pruebas/motor.mjs
// 1) casos de pruebas/casos.json; 2) compatibilidad: cada ejemplo de pruebas/compat/*.mmd (sintaxis Mermaid) se lee sin errores y se
// vuelve a escribir IGUAL; las variantes (formas no canónicas) se leen y su forma canónica dice lo mismo; 3) el acomodo no
// solapa nodos, los grupos abrazan a los suyos y no tapan a los demás, las etiquetas no pisan nodos y las flechas llegan al
// borde; 4) incremental: si solo cambia un texto que no cambia tamaños, no se vuelve a acomodar; 5) seguridad del SVG;
// 6) cada frase de error del motor tiene su traducción; 7) un diagrama de 1000 nodos se dibuja en tiempo razonable;
// 8) proyectos (motor/proyecto.js): las referencias de `%% esquema` sobreviven a cada edición, esquema.json se valida igual que en
// Python, y cambiar un elemento en todas partes (renombrar, quitar) deja los documentos y los diagramas válidos.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
for (const f of ["texto", "flujo", "secuencia", "capas", "formas", "dibujo", "markdown", "proyecto"]) require(path.join(RAIZ, "ui/motor", f + ".js"));
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

console.log("Proyectos: referencias y elementos");
{
  for (const c of casos.proyecto_esquema) ok(!M.validarEsquema(c.esquema).length === c.valido, "validarEsquema (JS) ≠ caso: " + JSON.stringify(c.esquema).slice(0, 100));
  for (const c of casos.tipos) ok(!M.validarTipo(c.tipo).length === c.valido, "validarTipo (JS) ≠ caso: " + JSON.stringify(c.tipo).slice(0, 100));
  // Cada tipo incluido (tipos/*.json) es válido y su sección para un documento sale de sus carpetas y tipos.
  for (const f of fs.readdirSync(path.join(RAIZ, "tipos"))) { const t = JSON.parse(fs.readFileSync(path.join(RAIZ, "tipos", f), "utf8")); ok(!M.validarTipo(t).length && f === t.id + ".json", "tipos/" + f + " no es válido: " + M.validarTipo(t).join(", ")); }
  {
    const sw = JSON.parse(fs.readFileSync(path.join(RAIZ, "tipos", "software.json"), "utf8")), lb = JSON.parse(fs.readFileSync(path.join(RAIZ, "tipos", "libro.json"), "utf8"));
    const sec = (t, ruta, tipo) => M.seccionDe(t, { ruta, tipo });
    ok(sec(sw, "README.md", "vision") === "vision" && sec(sw, "flujos/a.md", "flujo") === "flujos" && sec(sw, "historias/hu-1-a.md", "historia") === "historias", "seccionDe (software): visión, flujos, historias");
    ok(sec(sw, "notas.md", "otro") === "documentos" && sec(sw, "documentos/x.md", "documento") === "documentos" && sec(sw, "fuentes/x.pdf", "fuente") === "fuentes", "seccionDe (software): lo demás va a Documentos; los originales, aparte");
    ok(sec(lb, "README.md", "libro") === "libro" && sec(lb, "capitulos/01-a.md", "capitulo") === "capitulos" && sec(lb, "incongruencias.md", "revision") === "revision" && sec(lb, "estudio/01-a.md", "estudio") === "estudio", "seccionDe (libro): el libro, capítulos, estudio y revisión");
  }
  for (const c of casos.proyecto_elemento) ok(!M.validarElemento(c.elemento).length === c.valido, "validarElemento (JS) ≠ caso: " + JSON.stringify(c.elemento).slice(0, 100));
  const f = 'flowchart TD\n    A[Inicio] --> G[Grabar]\n    G --> S[Guardar]\n%% esquema: {"iconos":{"S":"base-de-datos"},"refs":{"G":"boton-grabar","S":"dato-notas"}}\n';
  ok(igual(M.refsDiagrama(f), { G: "boton-grabar", S: "dato-notas" }), "refsDiagrama lee las referencias");
  ok(M.serializarFlujo(M.parsearFlujo(f)) === f, "leer y escribir conserva la línea con refs");
  const tras = [M.fijar(f, "A", 10, 20), M.renombrarNodo(f, "A", "Empieza"), M.agregarNodo(f, "Otro").texto, M.cambiarForma(f, "A", "rombo", "reloj"), M.cambiarDireccion(f, "LR"), M.estiloAristas(f, "recta"), M.conectar(f, "A", "S")];
  for (const t of tras) ok(igual(M.refsDiagrama(t), { G: "boton-grabar", S: "dato-notas" }), "una edición del lienzo pierde las refs:\n" + t);
  ok(igual(M.refsDiagrama(M.borrarNodo(f, "G")), { S: "dato-notas" }), "borrar un nodo quita su ref (y deja las demás)");
  ok(igual(M.leerMeta('{"refs":{"A":"Mal Id","B":"ok","C":5}}').refs, { B: "ok" }), "leerMeta descarta refs inválidas");
  ok(M.escribirMeta({ refs: { b: "y", a: "x" }, pos: { a: [1, 2] } }) === '%% esquema: {"pos":{"a":[1,2]},"refs":{"a":"x","b":"y"}}', "escribirMeta ordena las refs");
  const s = 'sequenceDiagram\n    actor P as Persona\n    participant G as Grabar\n    participant N as Nube\n    P->>G: Toca\n    G->>+N: Sube\n    N-->>-G: Listo\n    Note over G,N: Cifrado\n    G-->>P: Grabando\n%% esquema: {"refs":{"G":"boton-grabar","N":"nube"}}\n';
  const sinG = M.borrarParticipante(s, "G");
  ok(!M.dibujar(sinG).errores.length && !/G->>|->>G|-->>G|G-->>/.test(sinG) && sinG.includes("Note over N: Cifrado") && igual(M.refsDiagrama(sinG), { N: "nube" }), "borrarParticipante quita sus mensajes y su ref:\n" + sinG);
  ok(igual(M.refsDiagrama(M.renombrarParticipante(s, "G", "Empezar")), { G: "boton-grabar", N: "nube" }), "renombrarParticipante conserva las refs");
  ok(M.idElemento("Botón Grabar", ["boton-grabar"]) === "boton-grabar-2" && M.idElemento("¡¡!!") === "elemento", "idElemento");

  const docs = {
    "docs/esquema/README.md": "# Minutero\n\nToca [Grabar](elementos.md#el-boton-grabar) para empezar. Grabar se pone rojo.\n\n```js\nconst Grabar = 1; // [Grabar](elementos.md#el-boton-grabar)\n```\n",
    "docs/esquema/flujos/grabar.md": "# Grabar una reunión\n\nDespués de [grabar](../elementos.md#el-boton-grabar) queda en la [Nube](../elementos.md#el-nube).\n\n```mermaid\n" + f + "```\n\n```mermaid\n" + s + "```\n",
    "docs/esquema/secuencia.mmd": s,
    "docs/esquema/elementos.md": "# Elementos\n\n<a id=\"el-boton-grabar\"></a>\n\n### Grabar\n",
    "docs/esquema/otro.md": "# Nada que ver\n",
  };
  const el = { id: "boton-grabar", tipo: "boton", nombre: "Grabar" };
  const usos = M.usosElemento(docs, el);
  ok(igual(usos.map((u) => [u.ruta, u.enlaces, u.nodos.length]), [["docs/esquema/README.md", 1, 0], ["docs/esquema/flujos/grabar.md", 1, 2], ["docs/esquema/secuencia.mmd", 0, 1]]), "usosElemento: " + JSON.stringify(usos.map((u) => [u.ruta, u.enlaces, u.nodos.length])));
  // Renombrar en todas partes
  const ren = Object.fromEntries(M.cambiarElemento(docs, el, { tipo: "renombrar", nombre: "Empezar a grabar" }).map((x) => [x.ruta, x]));
  ok(ren["docs/esquema/README.md"].despues.includes("[Empezar a grabar](elementos.md#el-boton-grabar) para empezar. Grabar se pone rojo."), "renombrar cambia el enlace y deja la mención suelta");
  ok(ren["docs/esquema/README.md"].despues.includes("const Grabar = 1; // [Grabar](elementos.md#el-boton-grabar)"), "renombrar no toca los bloques de código");
  ok(ren["docs/esquema/flujos/grabar.md"].despues.includes("[grabar](../elementos.md#el-boton-grabar)") && ren["docs/esquema/flujos/grabar.md"].notas.renombrados.length === 2, "un enlace con otro texto («grabar») se respeta; los dos diagramas cambian");
  ok(ren["docs/esquema/flujos/grabar.md"].despues.includes("G[Empezar a grabar]") && ren["docs/esquema/flujos/grabar.md"].despues.includes("participant G as Empezar a grabar"), "renombrar cambia el nodo y el participante");
  ok(ren["docs/esquema/secuencia.mmd"].despues.includes("participant G as Empezar a grabar"), "renombrar cambia el .mmd");
  ok(!ren["docs/esquema/otro.md"] && !ren["docs/esquema/elementos.md"], "renombrar no toca lo que no lo usa ni el glosario");
  const ren2 = M.cambiarElemento(docs, el, { tipo: "renombrar", nombre: "Empezar a grabar", tambienSinEnlace: true }).find((x) => x.ruta === "docs/esquema/README.md");
  ok(ren2.despues.includes("para empezar. Empezar a grabar se pone rojo.") && ren2.despues.includes("const Grabar = 1;"), "con «también sin enlace» cambia las menciones sueltas (no el código)");
  // Quitar en todas partes: lo que queda es Mermaid y Markdown válidos
  const qui = Object.fromEntries(M.cambiarElemento(docs, el, { tipo: "quitar", reconectar: true }).map((x) => [x.ruta, x]));
  const g2 = qui["docs/esquema/flujos/grabar.md"];
  ok(!g2.despues.includes("elementos.md#el-boton-grabar") && g2.despues.includes("Después de grabar queda en la [Nube](../elementos.md#el-nube)"), "quitar deja el texto sin enlace y no toca otros enlaces");
  for (const b of M.bloquesMermaid(g2.despues)) ok(!M.dibujar(b.contenido).errores.length && !b.contenido.includes("Grabar") && !b.contenido.includes("boton-grabar"), "quitar deja cada diagrama válido y sin el elemento:\n" + b.contenido);
  ok(/A --> S/.test(g2.despues) && igual(g2.notas.unidos, [["Inicio", "Guardar"]]), "quitar con «unir» conecta lo de antes con lo de después");
  ok(qui["docs/esquema/README.md"].notas.frases.length === 1, "quitar avisa de las frases que lo nombran");
  const sinUnir = M.cambiarElemento(docs, el, { tipo: "quitar", reconectar: false }).find((x) => x.ruta === "docs/esquema/flujos/grabar.md");
  ok(igual(sinUnir.notas.sueltos.sort(), ["Guardar", "Inicio"]), "sin unir, avisa de lo que queda suelto: " + JSON.stringify(sinUnir.notas.sueltos));
  ok(!M.cambiarElemento(docs, el, { tipo: "describir" }).some((x) => x.despues !== x.antes), "cambiar la descripción no toca los documentos");
  // Limpiar lo que propone la IA y el glosario
  const limpio = M.limpiarRefs("Ver [X](elementos.md#el-no-existe) y [G](elementos.md#el-boton-grabar).\n\n```mermaid\nflowchart TD\n    A --> B\n%% esquema: {\"refs\":{\"A\":\"no-existe\",\"B\":\"boton-grabar\"}}\n```\n", ["boton-grabar"]);
  ok(limpio.startsWith("Ver X y [G](elementos.md#el-boton-grabar).") && limpio.includes('"refs":{"B":"boton-grabar"}') && !limpio.includes("no-existe"), "limpiarRefs:\n" + limpio);
  const gl = M.glosario({ nombre: "Minutero", elementos: [el, { id: "nube", tipo: "servicio", nombre: "Nube <x>", descripcion: "Guarda", codigo: ["src/nube.py"] }] });
  ok(gl.includes('<a id="el-boton-grabar"></a>') && gl.includes("### Grabar") && gl.includes("`src/nube.py`") && gl.indexOf("## Botones") < gl.indexOf("## Servicios"), "glosario con anclas por elemento");
  ok(M.enlaceElemento("docs/esquema/flujos/a.md", "docs/esquema", "x", "Y [1]") === "[Y 1](../elementos.md#el-x)", "enlaceElemento con la ruta relativa al glosario");
  // Comparar versiones
  ok(igual(M.difLineas("a\nb\nc", "a\nx\nc").map((x) => x.tipo + x.texto), ["=a", "-b", "+x", "=c"]), "difLineas");
  const dd = M.difDiagrama("flowchart TD\n    A[Uno] --> B[Dos]\n", "flowchart TD\n    A[Uno bis] --> C[Tres]\n");
  ok(igual(dd.agregados, ["C"]) && dd.quitados[0].id === "B" && dd.cambiados[0].despues === "Uno bis" && dd.aristasAgregadas.length === 1 && dd.aristasQuitadas.length === 1, "difDiagrama: " + JSON.stringify(dd));
  ok(igual(M.difVersiones({ a: "1", b: "2" }, { b: "3", c: "4" }), [{ ruta: "a", estado: "quitado" }, { ruta: "b", estado: "cambiado" }, { ruta: "c", estado: "nuevo" }]), "difVersiones");
  const af = M.docsAfectados({ elementos: [el, { id: "nube", tipo: "servicio", nombre: "Nube", codigo: ["src/nube/"] }, { id: "otro", tipo: "otro", nombre: "Otro" }] }, docs, [{ mensaje: "Grabar pide confirmación", archivos: ["src/ui/x.js"] }, { mensaje: "x", archivos: ["src/nube/subir.py"] }]);
  ok(igual(af.elementos.map((e) => e.id), ["boton-grabar", "nube"]) && af.documentos.includes("docs/esquema/flujos/grabar.md") && af.documentos.includes("docs/esquema/secuencia.mmd"), "docsAfectados: " + JSON.stringify(af));
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
