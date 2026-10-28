// Pruebas de la interfaz (ui/) en un navegador real con los datos ficticios de ui/demo.json.
// Uso: node pruebas/interfaz.mjs   (necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
// Revisa: 1) ninguna vista tira errores de JavaScript ni choca con la Content-Security-Policy (español e inglés, escritorio y
// celular, claro y oscuro); 2) todo texto visible tiene traducción en ui/idiomas/en.json; 3) nada se sale a 390 px; 4) contraste
// AA del botón principal, el gris y el rojo, en claro y oscuro; 5) lo primero es elegir el idioma (con teclado) y lo que sigue sale en
// ese idioma; 6) el lienzo edita el texto: crear, renombrar, conectar arrastrando, mover (queda fijado), borrar, deshacer y rehacer;
// 7) el texto edita el lienzo, con errores claros y autocompletar; 8) el documento muestra sus diagramas y se editan en el lugar;
// 9) Dibújame aplica y «Quitar este cambio» lo saca; 10) README para GitHub; 11) plantillas (también las de la comunidad); 12) exportar SVG, PNG y para GitHub;
// 13) la misma regla de plantillas que Python (pruebas/casos.json); 14) proyectos: documentar un proyecto → lo que encontré →
// lo que se envía → propuestas de la IA (simulada) → elementos conectados → enlazar desde el lienzo → renombrar en todas partes →
// versiones → comparar → restaurar, documentar un flujo (la IA pide archivos) y los cambios del código. Con CAPTURAS=carpeta
// guarda capturas.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const CAPTURAS = process.env.CAPTURAS || "";
const errores = [];
const falla = (m) => { errores.push(m); console.log("  ✗ " + m); };
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const servidor = http.createServer((q, r) => {
  const ruta = path.join(RAIZ, "ui", decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!ruta.startsWith(path.join(RAIZ, "ui")) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": tipos[path.extname(ruta)] || "application/octet-stream" });
  fs.createReadStream(ruta).pipe(r);
}).listen(0);
const BASE = `http://localhost:${servidor.address().port}/index.html`;
const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "casos.json"), "utf8"));
const demo = JSON.parse(fs.readFileSync(path.join(RAIZ, "ui", "demo.json"), "utf8"));
// Contenido ficticio de la demo (nombres de archivos, plantillas): no es texto de la interfaz.
const datosDemo = new Set();
(function juntar(v) { if (typeof v === "string") datosDemo.add(v.replace(/\s+/g, " ").trim()); else if (v && typeof v === "object") Object.values(v).forEach(juntar); })(demo);
const esDato = (t) => datosDemo.has(t) || /^(Esquema|Claude|ChatGPT \(Codex\)|Gemini|English|Español|SVG|PNG|API|Tab ↹|\d+%)$/.test(t);

const navegador = await chromium.launch();
async function pagina({ ancho = 1280, alto = 800, idioma = "es", oscuro = false, query = "", config = { bienvenida: true, idioma_ui: idioma } } = {}) {
  const p = await navegador.newPage({ viewport: { width: ancho, height: alto }, colorScheme: oscuro ? "dark" : "light", locale: idioma === "en" ? "en-US" : "es-CL" });
  p.on("pageerror", (e) => falla(`JS (${idioma}, ${ancho}px): ${e.message}`));
  p.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) falla("CSP: " + m.text().slice(0, 200)); else if (m.type() === "error" && !/favicon|404/.test(m.text())) falla("Consola: " + m.text().slice(0, 200)); });
  if (config) await p.addInitScript((c) => { try { localStorage.setItem("esquema.config", JSON.stringify(c)); localStorage.removeItem("esquema.ultimo"); } catch { /* nada */ } }, config);
  await p.addInitScript((c) => { window._faltantes = new Set(); window._demoCatalogo = c; }, demo.catalogo);
  await p.goto(BASE + query);
  await p.waitForFunction(() => window.Esquema && document.querySelector("#app").children.length);
  await p.waitForTimeout(150);
  return p;
}
const probar = (p, f) => p.evaluate((src) => window.Esquema._probar(new Function("E", src)), f);
const espera = (p, ms = 120) => p.waitForTimeout(ms);
const textoDoc = (p) => p.evaluate(() => { let t; window.Esquema._probar((E) => { t = E.docs[E.sel]?.texto; }); return t; });
async function abrir(p, ruta) { await p.click(`[data-abrir="${ruta}"]`); await p.waitForFunction(() => document.querySelector("#texto")?.value.length > 0); await espera(p, 200); }
async function sinTraducir(p, vista) {
  const faltan = await p.evaluate(() => {
    const r = new Set(window._faltantes);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest("[data-sin-traducir], script, style, svg, textarea, .md, #toast") || !/\p{L}/u.test(n.nodeValue)) continue; const t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t) r.add("@" + t); }
    for (const el of document.querySelectorAll("[title],[aria-label],[placeholder]")) { if (el.closest("[data-sin-traducir]")) continue; for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v) r.add("@" + v.trim()); } }
    return [...r];
  });
  const en = JSON.parse(fs.readFileSync(path.join(RAIZ, "ui/idiomas/en.json"), "utf8")).textos;
  const valores = new Set(Object.values(en));
  const malos = faltan.filter((t) => { const x = t.startsWith("@") ? t.slice(1) : t; return !esDato(x) && !en[x] && !(t.startsWith("@") && valores.has(x)); }).map((t) => t.replace(/^@/, ""));
  if (malos.length) falla(`Sin traducir en «${vista}»: ${[...new Set(malos)].map((x) => JSON.stringify(x)).join(", ")}`);
  if (malos.length && process.env.FALTANTES) fs.appendFileSync(process.env.FALTANTES, malos.map((x) => JSON.stringify(x) + "\n").join(""));
}
async function desborde(p, vista) {
  const d = await p.evaluate(() => { const malos = []; for (const el of document.querySelectorAll("body *")) { if (el.closest("svg, .lienzo, .lz-herr, .lz-sel, .sugerencias, .md, .lista-envio, pre, table, .chips")) continue; const r = el.getBoundingClientRect(); if (r.width && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== "fixed" && !el.closest(".lateral:not(.abierto)")) malos.push(el.className || el.tagName); } return { scroll: document.documentElement.scrollWidth > window.innerWidth + 1, malos: malos.slice(0, 5) }; });
  if (d.scroll || d.malos.length) falla(`«${vista}» se sale a lo ancho: ${d.malos.join(", ")}`);
}
async function captura(p, nombre) { if (CAPTURAS) { fs.mkdirSync(CAPTURAS, { recursive: true }); await p.screenshot({ path: path.join(CAPTURAS, nombre + ".png") }); } }

// ── 1–4) Todas las vistas, en español e inglés, a ancho de escritorio y de celular ──
const VISTAS = [
  ["documento", "E=>{}"],
  ["documento-texto", "E=>{E.vista='texto'}"],
  ["documento-vista", "E=>{E.vista='dibujo'}"],
  ["bloque", "E=>{E.vista='ambos';E.bloque=1;E.lz.ajustar=true}"],
  ["diagrama", "E=>{E.bloque=null;window.Esquema._pruebas.abrir('docs/arquitectura.mmd')}"],
  ["diagrama-elegido", "E=>{E.elegido={tipo:'nodo',id:'A'}}"],
  ["menu-formas", "E=>{E.menu={tipo:'formas',x:10,y:120}}"],
  ["menu-flechas", "E=>{E.menu={tipo:'flechas',x:10,y:120}}"],
  ["menu-exportar", "E=>{E.menu={tipo:'exportar',x:10,y:120}}"],
  ["arista-elegida", "E=>{E.menu=null;E.elegido={tipo:'arista',id:0}}"],
  ["minimapa", "E=>{E.elegido=null;E.lz.mini=true}"],
  ["con-error", "E=>{E.lz.mini=false;E.docs[E.sel].texto=E.docs[E.sel].texto.replace('W[App web]','W[App web')}"],
  ["sin-diagrama", "E=>{E.docs[E.sel].texto=''}"],
  ["pendiente", "E=>{E.docs[E.sel].texto='gantt\\n    title Plan'}"],
  ["tarjeta-ia", "E=>{E.docs[E.sel].texto='flowchart TD\\n    A --> B\\n';E.cambiosIA=[{id:'ia-x',ruta:E.sel,pedido:'Un flujo',antes:'',despues:'',antesDoc:'',despuesDoc:'flowchart TD\\n    A --> B\\n',estado:'aplicado',resumen:{tipo:'flujo',nodos:2,aristas:1}}];E.tarjetaIA='ia-x'}"],
  ["secuencia-elegida", "E=>{E.tarjetaIA=null;E.docs[E.sel].texto='sequenceDiagram\\n    actor A as Ana\\n    A->>B: Hola\\n    Note right of B: Piensa\\n';E.lz.ajustar=true;E.elegido={tipo:'evento',id:0}}"],
  ["participante-elegido", "E=>{E.elegido={tipo:'participante',id:'A'}}"],
  ["nuevo", "E=>{E.elegido=null;E.nuevo={categoria:'todas',busqueda:'',elegida:null,nombre:''}}"],
  ["nuevo-categoria", "E=>{E.nuevo.categoria='documentacion';E.nuevo.elegida='adr';E.nuevo.nombre='0001-decision.md'}"],
  ["nuevo-nombre-malo", "E=>{E.nuevo.errorNombre='Ya hay un archivo con ese nombre.'}"],
  ["nuevo-nada", "E=>{E.nuevo={categoria:'todas',busqueda:'zzz',elegida:null}}"],
  ["comunidad-cargando", "E=>{E.nuevo={fuente:'comunidad',categoria:'todas',busqueda:'',elegida:null};E.catalogo={estado:'cargando',plantillas:[],bajando:{}}}"],
  ["comunidad-error", "E=>{E.catalogo={estado:'error',error:'',plantillas:[],bajando:{}}}"],
  ["comunidad", "E=>{const c=JSON.parse(JSON.stringify(window._demoCatalogo));E.catalogo={estado:'listo',plantillas:c,bajando:{[c[0].id]:true}};E.plantillas.push(Object.fromEntries(Object.entries(c[1]).filter(([k])=>!['ruta','sha256','tamano'].includes(k))))}"],
  ["comunidad-vacia", "E=>{E.nuevo.busqueda='zzz'}"],
  ["readme", "E=>{E.nuevo=null;E.readme={paso:'pedir',descripcion:'',estructura:true,envio:{archivos:['README.md','docs/pago.mmd'],omitidos:2}}}"],
  ["readme-error", "E=>{E.readme.error='Claude no respondió.';E.readme.envio={cargando:true}}"],
  ["readme-escribiendo", "E=>{E.readme.paso='escribiendo'}"],
  ["readme-listo", "E=>{E.readme.paso='listo';E.readme.texto='# Hola\\n\\nTexto.\\n\\n```mermaid\\nflowchart LR\\n    A --> B\\n```\\n\\n```mermaid\\nflowchart LR\\n    A --> \\n```\\n'}"],
  ["dibujar", "E=>{E.readme=null;E.dibujar={pedido:'',tipo:'auto',cambiar:true,error:'Escribe qué quieres que dibuje.'}}"],
  ["dibujar-historial", "E=>{E.dibujar.error=null;E.cambiosIA.push({id:'ia-y',ruta:E.sel,pedido:'Otro',antes:'',despues:'',estado:'quitado',resumen:{tipo:'secuencia',nodos:1,aristas:-2}})}"],
  ["dibujar-enviando", "E=>{E.dibujar.enviando=true}"],
  ["crear-diagrama", "E=>{E.dibujar={pedido:'',tipo:'secuencia',nuevo:true,codigo:true}}"],
  ["confirmar", "E=>{E.dibujar=null;E.confirmar={titulo:'¿Quitar el cambio de la IA?',texto:'Lo editaste después. Si lo quitas, también se van esos cambios (puedes deshacerlo).',si:'Quitar igual',no:'Dejarlo',accion:()=>{}}}"],
  ["conflicto", "E=>{E.confirmar=null;const d=E.docs[E.sel];d.guardado=d.texto+'%%';d.estado='cambiado';window.Esquema.archivoCambiado({ruta:E.sel,texto:'flowchart TD\\n    X --> Y\\n'})}"],
  ["ajustes", "E=>{E.confirmar=null;E.ajustes=true;E.resultadoIA={claude:{ok:true},codex:{ok:false,error:'No encontré ChatGPT (Codex) en este computador.'}};E.probando={gemini:true}}"],
  ["ajustes-al-dia", "E=>{E.revisando='al-dia'}"],
  ["ajustes-version-nueva", "E=>{E.revisando=null;E.actualizacion={hay:true,detalle:'Versión 0.2.0\\nMás rápido al abrir carpetas grandes'}}"],
  ["ajustes-actualizando", "E=>{E.revisando={paso:'1',texto:'Descargando la versión nueva…',pct:40}}"],
  ["ajustes-error-actualizar", "E=>{E.revisando={paso:'error',texto:'No pude descargar la versión nueva.'}}"],
  ["bienvenida-1", "E=>{E.ajustes=false;E.revisando=null;E.actualizacion={hay:false};E.bv=1}"],
  ["bienvenida-2", "E=>{E.bv=2}"],
  ["bienvenida-2-sin-carpeta", "E=>{E.bv=2;E._carpeta=E.carpeta;E.carpeta=null}"],
  ["bienvenida-3", "E=>{E.carpeta=E._carpeta;E.bv=3}"],
  ["bienvenida-3-sin-ia", "E=>{E._ias=E.ias;E.ias=[]}"],
  ["sin-archivo", "E=>{E.ias=E._ias;E.bv=null;E.sel=null}"],
  ["lateral-celular", "E=>{E.lateral=true}"],
  ["arbol-cerrado", "E=>{E.abiertas={docs:false}}"],
  ["sin-carpeta", "E=>{E.lateral=false;E.carpeta=null;E.archivos=[]}"],
];
for (const idioma of (process.env.SOLO_PROYECTOS ? [] : ["es", "en"])) for (const ancho of [1280, 390]) {
  const p = await pagina({ ancho, alto: ancho < 500 ? 844 : 800, idioma, oscuro: ancho < 500 && idioma === "en" });
  for (const [nombre, f] of VISTAS) {
    if ((nombre === "lateral-celular" || nombre === "arbol-cerrado") && ancho > 500) continue;
    await probar(p, f.slice(f.indexOf("{") + 1, f.lastIndexOf("}")));
    await espera(p, 60);
    if (idioma === "en") await sinTraducir(p, `${nombre} ${ancho}`);
    if (ancho < 500) await desborde(p, `${nombre} (${idioma})`);
  }
  await p.close();
}
console.log("Vistas en español e inglés, escritorio y celular: revisadas");

// ── 4) Contraste ──
for (const oscuro of [false, true]) {
  const p = await pagina({ oscuro });
  const r = await p.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const v = (n) => { const d = document.createElement("div"); d.style.color = `var(${n})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const b = document.querySelector(".boton.principal"), cs = getComputedStyle(b);
    return { principal: contraste(cs.color, cs.backgroundColor), gris: contraste(v("--gris"), v("--fondo")), grisPanel: contraste(v("--gris"), v("--panel")), rojo: contraste(v("--rojo"), v("--panel")), rojoSuave: contraste(v("--rojo"), v("--rojo-suave")), lineas: contraste(v("--d-linea"), v("--lienzo")) };
  });
  for (const [k, x] of Object.entries(r)) if (x < (k === "lineas" ? 3 : 4.5)) falla(`Contraste ${k} (${oscuro ? "oscuro" : "claro"}): ${x.toFixed(2)}`);
  await p.close();
}
console.log("Contraste: revisado");

// ── 5) Lo primero es el idioma ──
{
  const p = await pagina({ idioma: "en", config: null, query: "?bienvenida" });
  const h = await p.evaluate(() => ({ titulo: document.querySelector("#t-bv")?.textContent, botones: [...document.querySelectorAll("#app button")].map((b) => b.textContent.trim()), lateral: !!document.querySelector(".lateral"), foco: document.activeElement?.dataset.idioma }));
  if (!/Elige tu idioma · Choose your language/.test(h.titulo || "")) falla("La primera pantalla no es elegir el idioma: " + h.titulo);
  if (h.lateral || h.botones.length !== 2) falla("Antes del idioma se ve otra cosa: " + h.botones.join(" | "));
  if (h.foco !== "en") falla("El idioma del sistema (inglés) no queda sugerido y enfocado: " + h.foco);
  await captura(p, "bienvenida-idioma");
  await p.keyboard.press("Enter");
  await espera(p, 200);
  const t = await p.evaluate(() => document.querySelector("#t-bv")?.textContent);
  if (t !== "Hi, this is Esquema") falla("Después de elegir inglés no sigue en inglés: " + t);
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem("esquema.config")).idioma_ui);
  if (guardado !== "en") falla("El idioma no se guarda por el mismo camino que Ajustes");
  await sinTraducir(p, "bienvenida inglés");
  await p.close();
}
console.log("Idioma primero: revisado");

// ── 6) El lienzo edita el texto ──
{
  const p = await pagina();
  await abrir(p, "docs/pago.mmd");
  const lz = await p.$("#lienzo"), caja = await lz.boundingBox();
  // Crear con doble clic en un lugar vacío y nombrarlo
  await p.mouse.dblclick(caja.x + 30, caja.y + 30);
  await p.waitForSelector("#lz-editar");
  await p.keyboard.type("Revisar comprobante");
  await p.keyboard.press("Enter");
  await espera(p, 150);
  let t = await textoDoc(p);
  if (!t.includes("N1[Revisar comprobante]")) falla("Doble clic en el lienzo no crea un nodo con nombre:\n" + t);
  // Renombrar con doble clic
  const nodoA = await p.$('.nodo[data-id="A"]');
  const ba = await nodoA.boundingBox();
  await p.mouse.dblclick(ba.x + ba.width / 2, ba.y + ba.height / 2);
  await p.waitForSelector("#lz-editar");
  await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.type("Elige (qué) pagar"); await p.keyboard.press("Enter");
  await espera(p, 150);
  t = await textoDoc(p);
  if (!t.includes('A(["Elige (qué) pagar"])')) falla("Renombrar en el lienzo no cambia el texto: " + t.split("\n")[1]);
  // Conectar arrastrando desde el asa del nodo elegido hasta otro nodo
  await p.focus("#lienzo"); await p.keyboard.press("0"); await espera(p, 80);
  const n1 = await (await p.$('.nodo[data-id="N1"]')).boundingBox();
  await p.mouse.click(n1.x + n1.width / 2, n1.y + n1.height / 2);
  await espera(p, 80);
  const asa = await (await p.$(".asa")).boundingBox();
  const h = await (await p.$('.nodo[data-id="D"]')).boundingBox();
  await p.mouse.move(asa.x + asa.width / 2, asa.y + asa.height / 2); await p.mouse.down();
  const bajo = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.closest(".nodo")?.dataset.id || e.className?.baseVal || e.className || e.tagName); }, [h.x + h.width / 2, h.y + h.height / 2]);
  if (bajo !== "D") console.log("    (debajo del punto de soltar: " + bajo + ")");
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2, { steps: 8 }); await p.mouse.up();
  await espera(p, 150);
  t = await textoDoc(p);
  if (!/N1 --> D\n/.test(t)) falla("Arrastrar desde el asa hasta un nodo no conecta:\n" + t);
  await p.focus("#lienzo"); await p.keyboard.press("0"); await espera(p, 80);
  // Mover un nodo: queda fijado en la línea %% esquema
  const b = await (await p.$('.nodo[data-id="B"]')).boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 + 10, { steps: 6 }); await p.mouse.up();
  await espera(p, 150);
  t = await textoDoc(p);
  if (!/%% esquema: \{"pos":\{"B":\[/.test(t)) falla("Mover un nodo no lo fija en el texto:\n" + t);
  // Borrar con la tecla Supr y deshacer/rehacer
  const antes = t;
  await p.click('.nodo[data-id="N1"]'); await p.keyboard.press("Delete"); await espera(p, 120);
  t = await textoDoc(p);
  if (t.includes("N1")) falla("Supr no borra el nodo elegido");
  await p.keyboard.press("ControlOrMeta+z"); await espera(p, 120);
  if ((await textoDoc(p)) !== antes) falla("Deshacer no vuelve al texto anterior");
  await p.keyboard.press("ControlOrMeta+Shift+z"); await espera(p, 120);
  if ((await textoDoc(p)).includes("N1")) falla("Rehacer no vuelve a borrar");
  const tx = await p.$eval("#texto", (x) => x.value);
  if (tx !== (await textoDoc(p))) falla("El texto de la izquierda no sigue al lienzo");
  // Cambiar la forma desde la barra del elegido
  await p.focus("#lienzo"); await p.keyboard.press("0"); await espera(p, 80);
  await p.click('.nodo[data-id="C"]'); await p.click('[data-accion="menu-formas"]'); await p.click('[data-icono="base-de-datos"]'); await espera(p, 120);
  t = await textoDoc(p);
  if (!t.includes("C[(¿Tiene saldo?)]") || !t.includes('"C":"base-de-datos"')) falla("Cambiar la forma a base de datos no queda en el texto:\n" + t);
  // Teclado: flechas para moverse entre nodos, Enter para renombrar
  await p.focus("#lienzo"); await p.keyboard.press("Escape"); await p.keyboard.press("ArrowDown"); await espera(p, 50);
  const elegido = await p.evaluate(() => { let x; window.Esquema._probar((E) => { x = E.elegido; }); return x; });
  if (!elegido || elegido.tipo !== "nodo") falla("Las flechas del teclado no eligen un nodo");
  await captura(p, "lienzo-editado");
  await p.close();
}
console.log("Lienzo → texto: revisado");

// ── 7) El texto edita el lienzo: errores claros y autocompletar ──
{
  const p = await pagina();
  await abrir(p, "docs/pago.mmd");
  const nodos = () => p.$$eval("#lz-contenido .nodo", (x) => x.length);
  const n0 = await nodos();
  await p.click("#texto"); await p.keyboard.press("ControlOrMeta+End");
  await p.keyboard.type("\n    H --> Z[Nuevo paso]");
  await espera(p, 150);
  if ((await nodos()) !== n0 + 1) falla("Escribir un nodo en el texto no lo agrega al lienzo");
  await p.keyboard.type("\n    Z --> Y[Sin cerrar");
  await espera(p, 150);
  const prob = await p.$eval("#problemas", (x) => x.textContent);
  if (!/Línea 13/.test(prob) || !/Falta cerrar «\]»/.test(prob)) falla("El error no dice la línea ni qué falta: " + prob);
  if (!(await p.$("#lienzo.con-error"))) falla("Con un error, el lienzo no muestra el último dibujo bueno atenuado");
  if ((await nodos()) !== n0 + 2) falla("Con un error, el lienzo pierde el dibujo");
  await p.keyboard.type("]");
  await espera(p, 150);
  if (await p.$("#lienzo.con-error")) falla("Al corregir, el error no se va");
  await p.keyboard.type("\n    Y ");
  await espera(p, 80);
  const sug = await p.$$eval("#sugerencias button", (b) => b.map((x) => x.textContent));
  if (!sug.includes("-->")) falla("Autocompletar no ofrece flechas después de un nodo: " + sug.join(" "));
  await p.keyboard.press("Tab");
  await p.keyboard.type("Fi");
  await espera(p, 80);
  const sug2 = await p.$$eval("#sugerencias button", (b) => b.map((x) => x.textContent));
  if (!sug2.some((x) => x.startsWith("Fi["))) falla("Autocompletar no ofrece formas para un nodo nuevo: " + sug2.join(" "));
  await p.keyboard.type("n[Listo]");
  await espera(p, 120);
  const t = await textoDoc(p);
  if (!t.includes("Y --> Fin[Listo]")) falla("Tab no completó la flecha:\n" + t);
  await p.close();
}
console.log("Texto → lienzo: revisado");

// ── 8) Documento con diagramas editables en el lugar ──
{
  const p = await pagina();
  await abrir(p, "README.md");
  await espera(p, 200);
  const figs = await p.$$eval(".md-diagrama svg.esq", (x) => x.length);
  if (figs !== 2) falla("La vista del documento no dibuja sus 2 diagramas: " + figs);
  await p.hover(".md-diagrama"); await p.click('[data-editar-bloque="0"]');
  await p.waitForSelector("#lienzo .nodo");
  const w = await (await p.$('.nodo[data-id="W"]')).boundingBox();
  await p.mouse.dblclick(w.x + w.width / 2, w.y + w.height / 2);
  await p.waitForSelector("#lz-editar");
  await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.type("Sitio web"); await p.keyboard.press("Enter");
  await espera(p, 150);
  const t = await textoDoc(p);
  if (!t.includes("W[Sitio web]") || !t.startsWith("# Pagos de Banco Ejemplo")) falla("Editar un diagrama en el lugar no cambia solo su bloque del documento");
  await captura(p, "documento-bloque");
  await p.click('[data-accion="volver-doc"]'); await espera(p, 200);
  if (!(await p.$(".md-diagrama svg"))) falla("Al volver, la vista del documento no se ve");
  await p.close();
}
console.log("Documento: revisado");

// ── 9) Dibújame + Quitar este cambio ──
{
  const p = await pagina();
  await abrir(p, "docs/pago.mmd");
  const original = await textoDoc(p);
  await p.click('[data-accion="dibujame"]');
  await p.fill("#pedido-dibujo", "Revisar fraude, pedir clave y avisar por correo");
  await p.click('[data-accion="enviar-dibujo"]');
  await p.waitForSelector(".tarjeta-ia", { timeout: 4000 });
  let t = await textoDoc(p);
  if (!t.includes("[Revisar fraude]") || t === original) falla("Dibújame no aplicó la propuesta:\n" + t);
  await captura(p, "dibujame-tarjeta");
  await p.click(".tarjeta-ia [data-quitar-ia]");
  await espera(p, 150);
  t = await textoDoc(p);
  if (t !== original) falla("«Quitar este cambio» no deja el texto como estaba");
  // Una propuesta con errores no se aplica
  await p.evaluate(() => window.Esquema._probar((E) => { E.dibujar = { pedido: "x", tipo: "auto", cambiar: true, enviando: true }; }));
  await p.evaluate(() => window.Esquema.dibujoListo({ ok: true, texto: "flowchart TD\n    A[sin cerrar --> B\n" }));
  await espera(p, 80);
  if ((await textoDoc(p)) !== original || !(await p.$eval(".dialogo", (d) => /línea 2/.test(d.textContent)))) falla("Una propuesta con errores se aplicó o no se explicó");
  await p.close();
}
console.log("Dibújame: revisado");

// ── 9b) Inicio de la carpeta, árbol y «Crear diagrama» ──
{
  const p = await pagina();
  // Toda carpeta se ve como proyecto: su «Código» y su «Documentación»; sin documentación, esta lleva al inicio, que invita a hacerla.
  await p.click('.lateral [data-p-docs]');
  await espera(p);
  if (!(await p.$('.inicio-docs [data-accion="p-documentar"]'))) falla("Sin documentación, el inicio no invita a hacerla completa");
  if (!(await p.$('.lateral [data-p-docs] ~ [role="group"] [data-accion="p-documentar"], .lateral [data-accion="p-documentar"]'))) falla("La carpeta «Documentación» vacía no invita a hacerla");
  await p.click('.lateral [data-arbol="#codigo"]'); await espera(p);
  const tarjetas = await p.$$eval(".tarjeta-inicio", (l) => l.map((x) => x.dataset.accion));
  if (tarjetas.join() !== "crear-diagrama,p-documentar,p-flujo,nuevo") falla("El inicio no ofrece las cuatro acciones: " + tarjetas.join());
  // El árbol: «docs» se cierra y se abre; lo de adentro desaparece y vuelve.
  await p.click('[data-arbol="#c:docs"]'); await espera(p);
  if (await p.$('[data-abrir="docs/pago.mmd"]')) falla("Cerrar la carpeta del árbol no esconde sus archivos");
  await p.click('[data-arbol="#c:docs"]'); await espera(p);
  if (!(await p.$('[data-abrir="docs/pago.mmd"]'))) falla("Abrir la carpeta del árbol no muestra sus archivos");
  // «la secuencia de…» marca Secuencia mientras se escribe; sin el código, crea un diagrama nuevo en diagramas/.
  await p.click('[data-accion="crear-diagrama"]');
  await p.fill("#pedido-dibujo", "la secuencia de un pago entre la app y el banco");
  if ((await p.getAttribute('[data-tipo-dibujo="secuencia"]', "aria-pressed")) !== "true") falla("«la secuencia de…» no elige Secuencia");
  await p.uncheck("#usar-codigo");
  await p.click('[data-accion="enviar-dibujo"]');
  await p.waitForSelector(".tarjeta-ia", { timeout: 4000 });
  const sel = await p.evaluate(() => { let s; window.Esquema._probar((E) => { s = E.sel; }); return s; });
  if (sel !== "diagramas/secuencia-pago-app-banco.mmd") falla("«Crear diagrama» no creó el archivo esperado: " + sel);
  if (!/^sequenceDiagram/.test(await textoDoc(p))) falla("«Crear diagrama» no hizo un diagrama de secuencia");
  // Con el código: el mismo camino de los proyectos, primero «lo que se envía».
  await p.click('.lateral [data-p-docs]');
  await p.click('[data-accion="crear-diagrama"]');
  await p.fill("#pedido-dibujo", "el flujo de pagar con tarjeta");
  await p.click('[data-accion="enviar-dibujo"]');
  await p.waitForSelector('[data-accion="p-enviar"]', { timeout: 4000 });
  const datos = await p.evaluate(() => { let d; window.Esquema._probar((E) => { d = E.pj.dialogo?.datos; }); return d; });
  if (datos?.forma !== "diagrama" || datos?.tipo !== "flujo") falla("«Crear diagrama» con el código no pide un diagrama de flujo: " + JSON.stringify(datos));
  // «Dibújame» con un archivo abierto: un pedido sobre «este proyecto» marca «Que lea el código» y va por lo que se envía.
  await p.evaluate(() => window.Esquema._probar((E) => { E.pj.dialogo = null; }));
  await p.evaluate(() => window.Esquema._pruebas.abrir("docs/pago.mmd")); await p.waitForFunction(() => document.querySelector("#texto")?.value.length > 0); await espera(p, 200);
  await p.click('[data-accion="dibujame"]');
  if (await p.isChecked("#usar-codigo")) falla("«Dibújame» lee el código sin que se lo pidan");
  await p.fill("#pedido-dibujo", "quiero el diagrama de secuencia de este proyecto, explicando lo de git");
  if (!(await p.isChecked("#usar-codigo"))) falla("Un pedido sobre «este proyecto» no marca «Que lea el código»");
  await p.click('[data-accion="enviar-dibujo"]');
  await p.waitForSelector('[data-accion="p-enviar"]', { timeout: 4000 });
  // Si se cierra mientras la IA dibuja, el dibujo igual llega (en un archivo nuevo).
  await p.evaluate(() => window.Esquema._probar((E) => { E.pj.dialogo = null; E.dibujar = { pedido: "Otro flujo", tipo: "flujo", enviando: true, nuevo: true }; }));
  await p.keyboard.press("Escape");
  await p.evaluate(() => window.Esquema.dibujoListo({ ok: true, texto: "flowchart TD\n    A --> B\n" }));
  await espera(p, 150);
  const otro = await p.evaluate(() => { let s; window.Esquema._probar((E) => { s = E.sel; }); return s; });
  if (otro !== "diagramas/otro-flujo.mmd") falla("Un dibujo que llega con el diálogo cerrado se perdió: " + otro);
  await p.close();
}
console.log("Inicio, árbol y Crear diagrama: revisado");

// ── 10) README para GitHub ──
{
  const p = await pagina();
  await abrir(p, "docs/pago.mmd");
  await p.click('[data-accion="nuevo"]'); await p.click('.plantilla[data-accion="readme"]');
  await p.click('[data-accion="ver-envio"]'); await p.waitForFunction(() => /docs\/pago\.mmd/.test(document.querySelector(".lista-envio")?.textContent || ""));
  await p.fill("#descripcion-readme", "Pagos ficticios para la demo");
  await p.click('[data-accion="readme-escribir"]');
  await p.waitForSelector("#previa-readme svg", { timeout: 4000 });
  await captura(p, "readme-listo");
  await p.click('[data-accion="readme-guardar"]');
  await p.waitForFunction(() => document.querySelector("#texto")?.value.startsWith("# Proyecto de ejemplo"), null, { timeout: 4000 });
  const sel = await p.evaluate(() => { let s; window.Esquema._probar((E) => { s = E.sel; }); return s; });
  if (sel !== "README.md") falla("El README no queda abierto después de guardarlo");
  await p.close();
}
console.log("README: revisado");

// ── 11) Plantillas y 12) exportar ──
{
  const p = await pagina();
  await abrir(p, "README.md");
  await p.click('[data-accion="nuevo"]');
  await p.click('[data-categoria="arquitectura"]');
  await p.click('[data-plantilla="aplicacion-web"]');
  const nombre = await p.$eval("#nombre-nuevo", (x) => x.value);
  if (nombre !== "arquitectura.mmd") falla("El nombre sugerido de la plantilla no es el de su idioma: " + nombre);
  await p.fill("#nombre-nuevo", "../fuera.mmd"); await p.click('[data-accion="crear"]');
  if (!(await p.$(".dialogo .mal-txt"))) falla("Un nombre con «..» no se rechaza");
  await p.fill("#nombre-nuevo", "docs/web.mmd"); await p.click('[data-accion="crear"]');
  await p.waitForSelector('#lienzo .nodo[data-id="A"]');
  if (await p.$("#lienzo.con-error")) falla("La plantilla crea un diagrama con errores");
  await p.click('[data-accion="menu-exportar"]'); await p.click('[data-exportar="svg"]'); await espera(p, 150);
  const svg = await p.evaluate(() => window._ultimaExportacion);
  if (!svg || !svg.texto.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') || !svg.texto.includes("<style>") || svg.nombre !== "web.svg") falla("Exportar SVG no da un SVG independiente");
  await p.click('[data-accion="menu-exportar"]'); await p.click('[data-exportar="png"]');
  await p.waitForFunction(() => window._ultimaExportacion?.formato === "png", null, { timeout: 4000 });
  const png = await p.evaluate(() => atob(window._ultimaExportacion.base64).slice(1, 4));
  if (png !== "PNG") falla("Exportar PNG no da un PNG");
  await p.click('[data-accion="menu-exportar"]'); await p.click('[data-exportar="github"]'); await espera(p, 150);
  const gh = await p.evaluate(() => window._copiado);
  if (!gh || !gh.startsWith("```mermaid\nflowchart LR") || !gh.endsWith("```\n")) falla("Copiar para GitHub no da un bloque ```mermaid");
  await p.close();
}
console.log("Plantillas y exportar: revisado");

// ── 11b) Plantillas de la comunidad: «Comunidad» pide el catálogo, tocar una la descarga, queda elegida y crea el archivo ──
{
  const p = await pagina();
  await abrir(p, "README.md");
  await p.click('[data-accion="nuevo"]');
  await p.click('[data-fuente="comunidad"]');
  await p.waitForSelector("[data-catalogo]");
  const n = await p.$$eval("[data-catalogo] .previa svg", (x) => x.length);
  if (n < 4) falla("Las plantillas de la comunidad no muestran su vista previa");
  const id = demo.catalogo.find((x) => x.tipo === "diagrama").id;
  await p.click(`[data-catalogo="${id}"]`);
  await p.waitForSelector("#nombre-nuevo");
  if (!(await p.evaluate((i) => { let ok; window.Esquema._probar((E) => { ok = E.plantillas.some((x) => x.id === i) && E.nuevo.elegida === i; }); return ok; }, id))) falla("La plantilla descargada no quedó en tus plantillas ni elegida");
  const estado = await p.$eval(`[data-catalogo="${id}"] .estado-catalogo`, (x) => x.textContent);
  if (estado !== "En tus plantillas") falla("La plantilla descargada no dice «En tus plantillas»: " + estado);
  await p.fill("#nombre-nuevo", "docs/comunidad.mmd"); await p.click('[data-accion="crear"]');
  await p.waitForSelector("#lienzo .nodo");
  if (await p.$("#lienzo.con-error")) falla("La plantilla de la comunidad crea un diagrama con errores");
  // Una respuesta inválida de la app no se muestra (la interfaz vuelve a validar).
  await p.evaluate(() => window.Esquema.catalogoListo({ ok: true, plantillas: [{ id: "x", script: "alert(1)" }] }));
  const malos = await p.evaluate(() => { let n; window.Esquema._probar((E) => { n = E.catalogo.plantillas.length; }); return n; });
  if (malos) falla("La interfaz mostró una plantilla del catálogo que no es válida");
  await p.close();
}
console.log("Plantillas de la comunidad: revisado");

// ── 13) Misma regla de plantillas que Python ──
{
  const p = await pagina();
  const malos = await p.evaluate((c) => c.filter((k) => (window.Esquema._pruebas.validarPlantilla(k.plantilla).length === 0) !== k.valida).map((k) => JSON.stringify(k.plantilla).slice(0, 80)), casos.plantillas);
  for (const m of malos) falla("validarPlantilla (JS) no coincide con el caso: " + m);
  const incl = await p.evaluate((pl) => pl.filter((x) => window.Esquema._pruebas.validarPlantilla(x).length).map((x) => x.id), demo.plantillas);
  if (incl.length) falla("Plantillas incluidas que la interfaz rechaza: " + incl.join(", "));
  await p.close();
}

// ── 14) Proyectos ──
async function recorridoProyecto({ idioma, ancho, oscuro = false }) {
  const p = await pagina({ ancho, alto: ancho < 500 ? 844 : 800, idioma, oscuro });
  const etapa = async (nombre) => { await espera(p, 120); if (idioma === "en") await sinTraducir(p, "proyecto " + nombre + " " + ancho); if (ancho < 500) await desborde(p, "proyecto " + nombre + ` (${idioma})`); await captura(p, `proyecto-${nombre}-${idioma}-${ancho}`); };
  const estado = (f) => p.evaluate((src) => { let x; window.Esquema._probar((E) => { x = new Function("E", src)(E); }); return x; }, f);
  const texto = (ruta) => estado(`return E.docs[${JSON.stringify(ruta)}]?.texto`);
  const D = "docs/esquema/";
  // Documentar un proyecto: lo que encontré (sin IA)
  if (ancho < 500) await p.click('[data-accion="abrir-lateral"]');
  await p.click('[data-accion="nuevo"]'); await p.click('.plantilla[data-accion="p-nuevo"]');
  await p.waitForSelector('[data-accion="p-generar-inicial"]');
  if (!(await p.$eval(".p-panel", (x) => /Python/.test(x.textContent) && /v1\.2\.0/.test(x.textContent)))) falla("«Lo que encontré» no muestra lenguajes y git");
  await etapa("encontrado");
  // Lo que se envía, exacto, antes de mandarlo
  await p.click('[data-accion="p-generar-inicial"]'); await p.waitForSelector(".p-envio details");
  const piezas = await p.$$eval(".p-envio summary", (x) => x.map((s) => s.textContent));
  if (!piezas.some((x) => x.includes("README.md"))) falla("Lo que se envía no muestra el README: " + piezas.join(" | "));
  // Revisión a fondo: marcada de partida, dice qué carpeta y qué no abre, y se puede desmarcar
  if (!(await p.isChecked("[data-p-fondo]"))) falla("«Revisión a fondo» no viene marcada al documentar un proyecto");
  if (!(await p.$eval(".p-fondo", (x) => x.textContent.includes(".env")))) falla("«Revisión a fondo» no dice que no abre los .env");
  await p.click("[data-p-fondo]"); if (await p.isChecked("[data-p-fondo]")) falla("«Revisión a fondo» no se desmarca");
  await p.click("[data-p-fondo]");
  await p.click(".p-envio summary"); await etapa("envio");
  // El trabajo por etapas: en segundo plano, cada documento al disco apenas termina. Escape no lo cancela.
  await p.evaluate(() => { window._simVelocidad = 0.08; });
  await p.click('[data-accion="p-enviar"]'); await p.waitForSelector(".p-trabajo", { timeout: 5000 });
  if (await p.$(".capa")) falla("Documentar abre un diálogo que bloquea (debe ser una tarjeta en el panel)");
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => /listo/.test(document.querySelector(".p-trabajo")?.className || ""), null, { timeout: 15000 });
  await etapa("trabajo-listo");
  await p.click('[data-accion="p-trabajo-visto"]');
  await p.waitForFunction(() => document.querySelectorAll(".p-doc").length >= 5, null, { timeout: 5000 });
  const ini = await estado(`return { els: E.proyecto.esquema.elementos.length, docs: E.proyecto.esquema.documentos.map((d) => d.ruta), arch: E.archivos.map((a) => a.ruta) }`);
  if (ini.els !== 7 || !ini.docs.includes("elementos.md") || !ini.arch.includes(D + "flujos/pagar-una-cuenta.md")) falla("Documentar no deja los documentos y elementos: " + JSON.stringify(ini));
  if (ini.docs.join() !== "README.md,arquitectura.md,flujos/pagar-una-cuenta.md,flujos/recibir-el-comprobante.md,elementos.md") falla("Los documentos no quedan ordenados (visión, arquitectura, flujos, elementos): " + ini.docs.join());
  if (!(await texto(D + "elementos.md"))?.includes('<a id="el-boton-pagar"></a>')) falla("El glosario no tiene el ancla de cada elemento");
  await etapa("inicio");
  // Pasar al proyecto: se elige qué va al repo; lo que ya existe no va marcado y solo se reemplaza si se pide
  if (!(await estado("return E.proyecto.vinculado"))) falla("Un proyecto nuevo no queda con su documentación aparte");
  await p.click('.p-acciones [data-accion="p-pasar"]'); await p.waitForSelector(".p-pasar-fila");
  const k = await p.$$eval(".p-pasar-fila b", (l) => l.findIndex((x) => x.textContent === "arquitectura.md"));
  if (k < 0 || (await p.isChecked(`[data-p-fila="${k}"]`))) falla("«Pasar al proyecto» marca un archivo que ya existe en el repo");
  await p.click(`[data-p-ver-dif="${k}"]`); await p.waitForSelector(".p-pasar .p-dif");
  await etapa("pasar");
  await p.click(`[data-p-reemplazar="${k}"]`);
  if (!(await p.isChecked(`[data-p-fila="${k}"]`))) falla("«Reemplazar» no marca el archivo para pasarlo");
  await p.click('[data-accion="p-pasar-enviar"]');
  await p.waitForFunction(() => !document.querySelector(".p-pasar"), null, { timeout: 4000 });
  await p.waitForFunction(() => /Pasé|copied/.test(document.querySelector("#toast")?.textContent || ""), null, { timeout: 4000 });
  // El lateral: el proyecto como carpeta, con su código (los .md del repo, que se abren y se guardan ahí) y su documentación
  await p.waitForFunction(() => Number(document.querySelector(".lateral [data-arbol='#codigo'] small")?.textContent) >= 2, null, { timeout: 4000 });
  if (!(await p.$(".lateral [data-p-docs]"))) falla("El lateral no muestra la carpeta «Documentación» del proyecto");
  await p.evaluate(() => window.Esquema._pruebas.abrir("@codigo/docs/arquitectura.md"));
  await p.waitForFunction(() => /^# (Arquitectura|Architecture)/.test(document.querySelector("#texto")?.value || ""), null, { timeout: 4000 });
  if (!(await p.$(".lateral [data-abrir='@codigo/docs/arquitectura.md'][aria-current='true']"))) falla("Un .md del código abierto no se marca en el lateral");
  await probar(p, "E.panel='proyecto';E.sel=null"); await espera(p, 120);
  // Lo que falta: con la documentación completa no queda nada; sin la arquitectura, «Completar lo que falta» pide solo eso
  if (!(await p.$(".p-falta"))) falla("La documentación no dice qué le falta");
  await probar(p, "E._docs=E.proyecto.esquema.documentos;E.proyecto.esquema.documentos=E.proyecto.esquema.documentos.filter((y)=>y.tipo!=='arquitectura');E.panel='proyecto'"); await espera(p, 120);
  if (!(await p.$('.p-falta [data-accion="p-completar"]'))) falla("Sin arquitectura, no ofrece «Completar lo que falta»");
  await etapa("falta");
  await p.click('[data-accion="p-completar"]'); await p.waitForSelector(".p-envio details");
  if (!(await p.$eval(".p-envio", (x) => /arquitectura\.md/.test(x.textContent)))) falla("«Completar lo que falta» no pide la arquitectura");
  await p.click('.pie-dialogo [data-accion="cerrar"]');
  // Propuestas (lo que la IA cambia en documentos que ya existen): tarjetas con «Quitar este cambio»; se ven más abajo con «Cambió cómo funciona».
  await probar(p, "E.proyecto.esquema.documentos=E._docs;delete E._docs");
  // El lienzo: un nodo enlazado muestra su elemento; uno sin enlace se enlaza (con un elemento nuevo)
  await p.evaluate((r) => window.Esquema._pruebas.abrir(r), D + "flujos/recibir-el-comprobante.md");
  await p.waitForFunction(() => document.querySelector("#texto")?.value.length > 0);
  await probar(p, "E.bloque=0;E.vista='dibujo';E.lz.ajustar=true"); await espera(p, 200);
  await probar(p, "E.elegido={tipo:'nodo',id:'Q'}"); await espera(p, 120);
  await p.click('.lz-sel [data-accion="p-enlazar"]'); await p.waitForSelector("#menu [data-p-enlazar-nuevo]"); await etapa("enlazar");
  await p.click("#menu [data-p-enlazar-nuevo]"); await espera(p, 300);
  const refs = await estado(`return window.Esquema._pruebas.motor.refsDiagrama(window.Esquema._pruebas.motor.bloquesMermaid(E.docs[E.sel].texto)[0].contenido)`);
  if (!refs.Q || !(await estado(`return E.proyecto.esquema.elementos.some((e) => e.id === ${JSON.stringify(refs.Q || "")})`))) falla("Enlazar con un elemento nuevo no deja la ref ni el elemento: " + JSON.stringify(refs));
  await probar(p, "E.elegido={tipo:'nodo',id:'T'}"); await espera(p, 120);
  if (!(await p.$('.lz-sel [data-p-elemento="boton-pagar"]'))) falla("Un nodo enlazado no muestra su elemento en la barra");
  await p.click('.lz-sel [data-p-elemento="boton-pagar"]'); await p.waitForSelector(".p-ficha h2");
  await etapa("elemento");
  // Renombrar en todas partes: vista previa por archivo y una sola versión
  await p.click('[data-accion="p-renombrar"]'); await p.fill("#p-valor", idioma === "en" ? "Pay now" : "Pagar ahora"); await p.click('[data-accion="p-ver-cambio"]');
  await p.waitForSelector(".p-cambio-lista .p-prop"); await etapa("renombrar");
  await p.click('[data-p-ver-cambio="0"]'); await p.waitForSelector(".p-dif .d-mas"); await etapa("renombrar-dif");
  const nuevo = idioma === "en" ? "Pay now" : "Pagar ahora";
  await p.click('[data-accion="p-aplicar-cambio"]');
  await p.waitForFunction(() => !document.querySelector(".capa"), null, { timeout: 4000 });
  for (const r of ["README.md", "flujos/pagar-una-cuenta.md", "flujos/recibir-el-comprobante.md"]) if (!(await texto(D + r))?.includes(`[${nuevo}](`) && !(await texto(D + r))?.includes(`T[${nuevo}]`)) falla(`Renombrar no cambió ${r}`);
  if (!(await texto(D + "flujos/recibir-el-comprobante.md"))?.includes(`T[${nuevo}]`)) falla("Renombrar no cambió el nodo del diagrama");
  if (!(await texto(D + "elementos.md"))?.includes(`### ${nuevo}`)) falla("Renombrar no cambió el glosario");
  // Quitar, cambio de comportamiento con la IA y elemento nuevo: los diálogos
  await p.click('[data-accion="p-quitar"]'); await p.waitForSelector(".p-cambio-lista"); await etapa("quitar"); await p.click('.capa [data-accion="cerrar"]');
  await p.click('[data-accion="p-comportamiento"]'); await p.waitForSelector("#p-pedido"); await etapa("comportamiento");
  await p.fill("#p-pedido", "pide confirmación"); await p.click('[data-accion="p-comportamiento-enviar"]'); await p.waitForSelector(".p-envio details");
  if ((await p.$$eval(".p-envio summary", (x) => x.filter((s) => /\.md/.test(s.textContent)).length)) < 3) falla("Un cambio de comportamiento no manda los documentos que usan el elemento");
  await p.click('[data-accion="p-enviar"]'); await p.waitForSelector(".p-prop"); await etapa("propuestas-cambio");
  await p.click('[data-p-quitar="0"]'); if (!(await p.$(".p-prop.quitada"))) falla("«Quitar este cambio» no marca la propuesta");
  await p.click('[data-p-quitar="0"]'); if (await p.$(".p-prop.quitada")) falla("«Volver a agregar» no vuelve la propuesta");
  await p.click('[data-p-ver="0"]'); await p.waitForSelector(".p-prop .p-dif"); await etapa("propuesta-vista");
  await p.click('[data-accion="p-descartar"]');
  await p.click('.p-panel [data-p="elementos"]'); await p.click('[data-accion="p-elemento-nuevo"]'); await p.waitForSelector("#p-el-nombre"); await etapa("elemento-nuevo"); await p.click('.capa [data-accion="cerrar"]');
  // Versiones, comparar y restaurar
  await p.click(ancho < 500 ? '.barra [data-p="proyecto"]' : '.lateral [data-p-docs]'); await p.waitForSelector('.p-acciones [data-p="versiones"]');
  if (!(await p.$('[data-accion="p-deshacer"]'))) falla("Después de renombrar no se ofrece deshacer el cambio");
  await p.click('.p-acciones [data-p="versiones"]'); await p.waitForSelector("[data-p-version]");
  const versiones = await p.$$eval("[data-p-version]", (x) => x.map((b) => b.textContent));
  if (versiones.length !== 2) falla("Versiones: " + versiones.join(" | "));
  await etapa("versiones");
  await p.click("[data-p-version]:last-of-type >> nth=-1"); await p.waitForSelector("[data-p-dif]");
  await p.click(`[data-p-dif="flujos/recibir-el-comprobante.md"]`); await p.waitForSelector(".p-dif-svg svg");
  if (!(await p.$(".p-dif-svg .dif-cambia"))) falla("La comparación de diagramas no marca el nodo que cambió");
  await etapa("comparar");
  await p.click('[data-accion="p-restaurar"]'); await p.waitForSelector('[data-accion="p-restaurar-si"]'); await etapa("restaurar");
  await p.click('[data-accion="p-restaurar-si"]');
  await p.waitForFunction((d) => { let t; window.Esquema._probar((E) => { t = E.docs[d]?.texto; }); return t && !t.includes("Pagar ahora") && !t.includes("Pay now"); }, D + "README.md", { timeout: 4000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-p-version]").length === 3, null, { timeout: 4000 });
  if (!(await estado(`return E.proyecto.esquema.elementos.find((e) => e.id === "boton-pagar").nombre`))?.match(/^(Pagar|Pay)$/)) falla("Restaurar no vuelve el elemento a su nombre");
  // Documentar un flujo: la IA pide un archivo, la persona lo aprueba y lo ve antes de mandarlo
  await p.click('.barra [data-accion="p-flujo"]'); await p.fill("#p-pedido", idioma === "en" ? "How a payment is processed" : "Cómo se procesa un pago"); await etapa("flujo");
  await p.click('[data-accion="p-flujo-enviar"]'); await p.waitForSelector(".p-envio"); await p.click('[data-accion="p-enviar"]');
  await p.waitForSelector("[data-p-elegir]"); await etapa("pedir");
  await p.click('[data-accion="p-pedir-enviar"]'); await p.waitForSelector(".p-envio details");
  if (!(await p.$$eval(".p-envio summary", (x) => x.some((s) => s.textContent.includes("src/api/pagos.py"))))) falla("El archivo aprobado no aparece en lo que se envía");
  await p.click('[data-accion="p-enviar"]'); await p.waitForSelector(".p-prop"); await p.click('[data-accion="p-aplicar"]');
  await p.waitForFunction(() => document.querySelectorAll(".p-doc").length >= 6, null, { timeout: 4000 });
  await p.waitForFunction(() => !document.querySelector(".p-aviso .giro"), null, { timeout: 4000 }); await espera(p, 500);
  if (await p.$('[data-accion="p-deshacer"]')) falla("Después de restaurar y documentar otra cosa, todavía se ofrece deshacer un cambio viejo");
  // Cambios del código desde la última versión
  await probar(p, "E.proyecto.cambios={n:2,desde:'abc',commits:[{id:'1',fecha:'2026-10-27',mensaje:'Pagar pide confirmación',archivos:['src/web/pagar.js']},{id:'2',fecha:'2026-10-26',mensaje:'Correo más rápido',archivos:['src/api/correo.py']}]};E.proyecto.cambiosVistos=false;E.panel='proyecto'");
  await p.waitForSelector('[data-accion="p-revisar"]'); await etapa("cambios");
  await p.click('[data-accion="p-revisar"]'); await p.waitForSelector('[data-accion="p-revisar-ia"]');
  const afectados = await estado("return E.proyecto.revision.documentos");
  if (!afectados.includes(D + "flujos/recibir-el-comprobante.md") || !afectados.includes(D + "README.md")) falla("Revisar qué documentos afecta: " + afectados.join(", "));
  await etapa("revision");
  await p.click('[data-accion="p-revisar-ia"]'); await p.waitForSelector(".p-envio"); await p.click('[data-accion="p-enviar"]'); await p.waitForSelector(".p-prop"); await p.click('[data-accion="p-descartar"]');
  await p.close();
}
// ── 15) Documentar por etapas y el árbol «Código» (todo el código, sin abrirlo; lo que la IA leyó) ──
async function recorridoTrabajo({ idioma, ancho, oscuro = false }) {
  const p = await pagina({ ancho, alto: ancho < 500 ? 844 : 800, idioma, oscuro });
  const etapa = async (nombre) => { await espera(p, 120); if (idioma === "en") await sinTraducir(p, "trabajo " + nombre + " " + ancho); if (ancho < 500) await desborde(p, "trabajo " + nombre + ` (${idioma})`); await captura(p, `trabajo-${nombre}-${idioma}-${ancho}${oscuro ? "-oscuro" : ""}`); };
  const estado = (f) => p.evaluate((src) => { let x; window.Esquema._probar((E) => { x = new Function("E", src)(E); }); return x; }, f);
  const lateral = async () => { if (ancho < 500 && !(await p.$(".lateral.abierto"))) { await p.click('[data-accion="abrir-lateral"]'); await espera(p, 150); } };
  await p.evaluate(() => { window._simVelocidad = 0.25; window._simFallar = "arquitectura.md"; });
  await lateral();
  await p.click('[data-accion="nuevo"]'); await p.click('.plantilla[data-accion="p-nuevo"]');
  await p.waitForSelector('[data-accion="p-generar-inicial"]'); await p.click('[data-accion="p-generar-inicial"]');
  await p.waitForSelector(".p-envio details"); await p.click('[data-accion="p-enviar"]');
  // Mientras lee: etapas, el archivo que lee, cuántos lleva; Escape y tocar fuera no cancelan nada.
  await p.waitForSelector("[data-t-leyendo]", { timeout: 8000 });
  await p.keyboard.press("Escape"); await p.mouse.click(5, 790);
  if (!(await estado("return E.pj.trabajo?.estado === 'corriendo'"))) falla("Escape o tocar fuera cancelaron el trabajo");
  if (!(await p.$(".t-etapas li.hecha")) || !(await p.$(".t-etapas li.actual"))) falla("La tarjeta del trabajo no muestra las etapas");
  await etapa("leyendo");
  // El árbol «Código»: todos los archivos (no solo .md), con lo que la IA va leyendo.
  await lateral();
  await p.waitForSelector('.lateral [data-c="src/api/pagos.py"]', { timeout: 5000 });
  const filas = await p.$$eval(".lateral [data-c]", (x) => x.map((b) => b.dataset.c));
  for (const r of ["package.json", "src/web/pagar.js", "src/api/correo.py", "README.md"]) if (!filas.includes(r)) falla("El árbol «Código» no muestra " + r);
  if (filas.some((r) => r.startsWith("docs/esquema/"))) falla("El árbol «Código» muestra la documentación");
  const orden = await p.$$eval(".lateral [data-c], .lateral .c-carpeta", (x) => x.map((b) => b.dataset.c || "/" + b.dataset.arbol.slice(3)));
  if (orden.indexOf("/src") > orden.indexOf("package.json")) falla("El árbol «Código» no pone las carpetas primero: " + orden.join(" "));
  await p.waitForSelector(".lateral .c-archivo.leido", { timeout: 8000 });
  await etapa("arbol-leyendo");
  if (ancho < 500) await p.keyboard.press("Escape");
  // Mientras escribe, cada documento listo ya está en la documentación (antes de terminar el trabajo).
  await p.waitForFunction(() => document.querySelectorAll(".t-doc.listo").length >= 1, null, { timeout: 15000 });
  await p.waitForFunction(() => { let x; window.Esquema._probar((E) => { x = E.archivos.some((a) => a.ruta === "docs/esquema/README.md"); }); return x; }, null, { timeout: 3000 }).catch(() => {});
  if (!(await estado("return E.pj.trabajo.estado === 'corriendo' && E.archivos.some((a) => a.ruta === 'docs/esquema/README.md')"))) falla("Un documento listo no aparece en la documentación mientras el trabajo sigue");
  if (!(await p.$(".lateral [data-p-docs] .trabajando-punto"))) falla("«Documentación» no muestra que la IA está trabajando");
  await etapa("escribiendo");
  // Un documento que falla queda con «Reintentar» y los demás siguen.
  await p.waitForFunction(() => /con-fallas/.test(document.querySelector(".p-trabajo")?.className || ""), null, { timeout: 20000 });
  const est = await estado("return Object.fromEntries(E.pj.trabajo.items.map((i) => [i.ruta, i.estado]))");
  if (est["arquitectura.md"] !== "fallo" || Object.values(est).filter((x) => x === "listo").length !== 3) falla("Un documento que falla afecta a los demás: " + JSON.stringify(est));
  await etapa("con-fallas");
  await p.click('[data-t-reintentar="arquitectura.md"]');
  await p.waitForFunction(() => /\blisto\b/.test(document.querySelector(".p-trabajo")?.className || ""), null, { timeout: 15000 });
  if (!(await estado("return E.archivos.some((a) => a.ruta === 'docs/esquema/arquitectura.md')"))) falla("«Reintentar» no escribe el documento");
  await etapa("listo");
  // «Quitar este cambio» de un documento nuevo: se va (con confirmación).
  await p.click('[data-t-quitar="flujos/recibir-el-comprobante.md"]'); await p.waitForSelector('[data-accion="confirmar-si"]');
  await p.click('[data-accion="confirmar-si"]');
  await p.waitForFunction(() => { let x; window.Esquema._probar((E) => { x = !E.archivos.some((a) => a.ruta === "docs/esquema/flujos/recibir-el-comprobante.md"); }); return x; }, null, { timeout: 4000 });
  await p.waitForSelector(".t-doc.quitado", { timeout: 3000 }).catch(() => falla("«Quitar este cambio» no marca el documento como quitado"));
  // La ficha de un archivo de código: sin su contenido, con si la IA lo leyó y dónde aparece.
  await lateral();
  if ((await p.getAttribute('.lateral [data-arbol="#codigo"]', "aria-expanded")) !== "true") await p.click('.lateral [data-arbol="#codigo"]');
  await p.click('.lateral [data-p-ficha="src/api/pagos.py"]'); await p.waitForSelector(".p-panel .p-fila");
  const ficha = await p.$eval(".p-panel", (x) => x.textContent);
  if (/def |import /.test(ficha)) falla("La ficha de un archivo de código muestra su contenido");
  if (!/(leyó|Read on)/.test(ficha)) falla("La ficha no dice que la IA leyó el archivo: " + ficha.slice(0, 200));
  if (!(await p.$('.p-panel [data-p-elemento="api-pagos"]'))) falla("La ficha no muestra el elemento que usa el archivo");
  await etapa("ficha");
  // Un .md del código se sigue abriendo en el editor.
  await lateral();
  await p.click('.lateral [data-c="docs/decisiones/0001-usar-cola.md"]');
  await p.waitForFunction(() => (document.querySelector("#texto")?.value || "").length > 0, null, { timeout: 4000 });
  // Detener: pide confirmación y lo escrito se queda.
  await probar(p, "E.panel='proyecto';E.sel=null;E.pj.trabajo.visto=false");
  await p.evaluate(() => window.Esquema._pruebas.proyectos().pedirIA("inicial", {}));
  await p.waitForSelector(".p-envio details"); await p.click('[data-accion="p-enviar"]');
  await p.waitForSelector('[data-accion="p-detener"]', { timeout: 5000 });
  await p.click('[data-accion="p-detener"]'); await p.waitForSelector('[data-accion="confirmar-si"]'); await etapa("detener");
  await p.click('[data-accion="confirmar-si"]');
  await p.waitForFunction(() => /detenido/.test(document.querySelector(".p-trabajo")?.className || ""), null, { timeout: 8000 });
  if (!(await estado("return E.archivos.some((a) => a.ruta === 'docs/esquema/README.md')"))) falla("Detener borró lo que ya estaba escrito");
  await p.close();
}
await recorridoTrabajo({ idioma: "es", ancho: 1280 });
await recorridoTrabajo({ idioma: "en", ancho: 390, oscuro: true });
await recorridoTrabajo({ idioma: "en", ancho: 1280, oscuro: true });
await recorridoTrabajo({ idioma: "es", ancho: 390 });
console.log("Documentar por etapas y el árbol «Código»: revisado");

await recorridoProyecto({ idioma: "es", ancho: 1280 });
await recorridoProyecto({ idioma: "en", ancho: 390, oscuro: true });
await recorridoProyecto({ idioma: "en", ancho: 1280 });
console.log("Proyectos: revisado");

// ── Capturas para la página y el README (claro y oscuro, escritorio y celular) ──
if (CAPTURAS) {
  const tomas = [
    ["flujo", "docs/arquitectura.mmd", "E=>{}"], ["secuencia", "README.md", "E=>{E.bloque=1;E.lz.ajustar=true}"], ["documento", "README.md", "E=>{}"],
    ["readme", "README.md", "E=>{E.readme={paso:'listo',descripcion:'',estructura:true,texto:document.querySelector('#texto').value}}"],
    ["inicio", "README.md", "E=>{E.sel=null;E.panel=null}"],
  ];
  for (const [ancho, alto] of [[1280, 800], [390, 844]]) for (const oscuro of [false, true]) {
    const p = await pagina({ ancho, alto, oscuro });
    for (const [n, ruta, f] of tomas) {
      await probar(p, `E.readme=null;E.bloque=null;E.vista=${ancho < 500 ? "'dibujo'" : "'ambos'"};E.sel=null`);
      await p.evaluate((r) => window.Esquema._pruebas.abrir(r), ruta);
      await p.waitForFunction(() => document.querySelector("#texto")?.value.length > 0);
      await probar(p, f.slice(f.indexOf("{") + 1, f.lastIndexOf("}")));
      await espera(p, 250);
      if (n === "readme") await p.evaluate(() => window.Esquema.readmeListo({ ok: true, texto: document.querySelector("#texto").value }));
      await espera(p, 150);
      await p.screenshot({ path: path.join(CAPTURAS, `esquema-${n}-${ancho < 500 ? "390" : "escritorio"}-${oscuro ? "oscuro" : "claro"}.png`) });
    }
    await p.close();
  }
}

await navegador.close();
servidor.close();
if (errores.length) { console.log(`✗ Interfaz: ${errores.length} problemas`); process.exit(1); }
console.log("✓ Interfaz");
