// La página pública (docs/) servida como en GitHub Pages (docs/ en la raíz y ui/ en /demo/), sin copiar nada:
//   node herramientas/pagina_capturas.mjs servir             → http://localhost:8790/ hasta que lo cortes
//   node herramientas/pagina_capturas.mjs imagenes            → docs/img/compartir.png (1200×630) y docs/apple-touch-icon.png (180×180)
//   node herramientas/pagina_capturas.mjs capturas <carpeta>  → la página entera en español e inglés, escritorio y celular, claro y oscuro,
//                                                               y revisa que no haya errores de JavaScript ni de CSP ni desborde a 390 px
// Necesita Playwright para imágenes y capturas (PLAYWRIGHT=/ruta/a/playwright si no está en node_modules). Todo con datos ficticios.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml" };
const [modo = "servir", destino = ""] = process.argv.slice(2);

function servir(puerto) {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
    const base = p.startsWith("/demo/") ? path.join(RAIZ, "ui") : path.join(RAIZ, "docs");
    if (p.startsWith("/demo/")) p = p.slice(5);
    if (p.endsWith("/")) p += "index.html";
    const ruta = path.normalize(path.join(base, p));
    if (!ruta.startsWith(base + path.sep) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] || "application/octet-stream" });
    fs.createReadStream(ruta).pipe(r);
  });
  return new Promise((ok) => s.listen(puerto, () => ok(s)));
}

if (modo === "servir") {
  await servir(8790);
  console.log("Página en http://localhost:8790/ (la demo en /demo/). Ctrl+C para cortar.");
} else {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
  const s = await servir(0);
  const URL_BASE = `http://localhost:${s.address().port}/`;
  const navegador = await chromium.launch();
  const problemas = [];

  if (modo === "imagenes") {
    // Ícono para iOS: el favicon a 180×180 (fondo lleno, como lo pide Apple).
    const p = await navegador.newPage({ viewport: { width: 180, height: 180 } });
    const svg = fs.readFileSync(path.join(RAIZ, "ui", "favicon.svg"), "utf8").replace('rx="14"', 'rx="0"');
    await p.setContent(`<html><body style="margin:0">${svg.replace("<svg ", '<svg width="180" height="180" ')}</body></html>`);
    await p.screenshot({ path: path.join(RAIZ, "docs", "apple-touch-icon.png") });
    await p.close();
    // Imagen para compartir: nombre, frase, la cifra y una captura real de la app (con la carpeta de ejemplo ficticia).
    const c = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
    const captura = "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, "docs", "img", "esquema-flujo-escritorio-claro.png")).toString("base64");
    const logo = "data:image/svg+xml;base64," + Buffer.from(fs.readFileSync(path.join(RAIZ, "ui", "favicon.svg"))).toString("base64");
    await c.setContent(`<html><head><style>
      body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f7f7f5;color:#161b26;
        background-image:radial-gradient(#d6dce6 1.3px,transparent 1.4px);background-size:24px 24px}
      .t{position:absolute;left:64px;top:70px;width:470px}
      .m{display:flex;align-items:center;gap:14px;font-weight:800;font-size:34px;letter-spacing:-.02em}
      .m img{width:52px;height:52px}
      h1{font-size:54px;line-height:1.04;letter-spacing:-.035em;margin:34px 0 0;font-weight:850}
      h1 em{font-style:normal;color:#2f5fd0}
      p{font-size:22px;line-height:1.4;color:#566173;margin:22px 0 0}
      .c{display:inline-flex;align-items:baseline;gap:12px;margin-top:30px;padding:12px 16px;border:2px dashed #8aa3e6;border-radius:12px;background:#fff}
      .c b{font-size:36px;color:#2f5fd0;letter-spacing:-.03em}.c span{font-size:19px;color:#566173}
      .v{position:absolute;left:590px;top:64px;width:860px;border-radius:14px;overflow:hidden;box-shadow:0 22px 60px rgba(20,30,50,.22);border:1px solid #dfe3ea}
      .v img{display:block;width:860px}
    </style></head><body>
      <div class="t"><div class="m"><img src="${logo}" alt="">Esquema</div>
      <h1>Diagramas que <em>GitHub ya entiende.</em></h1>
      <p>Escribe Mermaid o dibuja en el lienzo: los dos se mantienen al día. Gratis y abierto.</p>
      <div class="c"><b>40–100×</b><span>más rápido que Mermaid</span></div></div>
      <div class="v"><img src="${captura}" alt=""></div></body></html>`);
    await c.waitForTimeout(200);
    await c.screenshot({ path: path.join(RAIZ, "docs", "img", "compartir.png") });
    await c.close();
    console.log("✓ docs/img/compartir.png y docs/apple-touch-icon.png");
  }

  if (modo === "capturas") {
    fs.mkdirSync(destino || "capturas-pagina", { recursive: true });
    for (const idioma of ["es", "en"]) for (const [ancho, alto, nombre] of [[1280, 800, "escritorio"], [390, 844, "celular"]]) for (const oscuro of [false, true]) {
      const p = await navegador.newPage({ viewport: { width: ancho, height: alto }, colorScheme: oscuro ? "dark" : "light", locale: idioma === "en" ? "en-US" : "es-CL",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" });
      p.on("pageerror", (e) => problemas.push(`JS (${idioma}, ${ancho}): ${e.message}`));
      p.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problemas.push(`Consola (${idioma}, ${ancho}): ${m.text().slice(0, 200)}`); });
      await p.goto(URL_BASE + (idioma === "en" ? "?lang=en" : ""));
      await p.waitForSelector("#dibujo svg");
      await p.waitForTimeout(300);
      const ancha = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (ancha) problemas.push(`La página se sale a lo ancho (${idioma}, ${ancho}px)`);
      const base = path.join(destino || "capturas-pagina", `esquema-pagina-${idioma}-${nombre}-${oscuro ? "oscuro" : "claro"}`);
      await p.screenshot({ path: base + "-portada.png" });
      if (!oscuro) {
        await p.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
        await p.screenshot({ path: base + "-completa.png", fullPage: true });
      }
      await p.close();
    }
    console.log(problemas.length ? "✗ " + problemas.join("\n✗ ") : "✓ Página: sin errores de JavaScript ni de CSP y sin desborde a 390 px");
  }
  await navegador.close();
  s.close();
  process.exit(problemas.length ? 1 : 0);
}
