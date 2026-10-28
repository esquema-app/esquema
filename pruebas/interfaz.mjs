// Pruebas de la interfaz (ui/) en un navegador real con los datos ficticios de ui/demo.json.
// Uso: node pruebas/interfaz.mjs   (necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
// Revisa: 1) ninguna vista tira errores de JavaScript ni choca con la Content-Security-Policy (español e inglés, escritorio y
// celular, claro y oscuro); 2) todo texto visible tiene traducción en ui/idiomas/en.json; 3) nada se sale a 390 px; 4) contraste
// AA del botón principal, el gris y el rojo, en claro y oscuro; 5) lo primero es elegir el idioma (con teclado) y lo que sigue sale en
// ese idioma; 6) el lienzo edita el texto: crear, renombrar, conectar arrastrando, mover (queda fijado), borrar, deshacer y rehacer;
// 7) el texto edita el lienzo, con errores claros y autocompletar; 8) el documento muestra sus diagramas y se editan en el lugar;
// 9) Dibújame aplica y «Quitar este cambio» lo saca; 10) README para GitHub; 11) plantillas (también las de la comunidad); 12) exportar SVG, PNG y para GitHub;
// 13) la misma regla de plantillas que Python (pruebas/casos.json). Con CAPTURAS=carpeta guarda capturas.
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
  ["sin-carpeta", "E=>{E.lateral=false;E.carpeta=null;E.archivos=[]}"],
];
for (const idioma of ["es", "en"]) for (const ancho of [1280, 390]) {
  const p = await pagina({ ancho, alto: ancho < 500 ? 844 : 800, idioma, oscuro: ancho < 500 && idioma === "en" });
  for (const [nombre, f] of VISTAS) {
    if (nombre === "lateral-celular" && ancho > 500) continue;
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

// ── Capturas para la página y el README (claro y oscuro, escritorio y celular) ──
if (CAPTURAS) {
  const tomas = [
    ["flujo", "docs/arquitectura.mmd", "E=>{}"], ["secuencia", "README.md", "E=>{E.bloque=1;E.lz.ajustar=true}"], ["documento", "README.md", "E=>{}"],
    ["readme", "README.md", "E=>{E.readme={paso:'listo',descripcion:'',estructura:true,texto:document.querySelector('#texto').value}}"],
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
