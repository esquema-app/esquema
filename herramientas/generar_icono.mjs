// Íconos de las apps desde ui/favicon.svg (el mismo logo de la interfaz). Solo para desarrollo: se versionan los resultados.
//   app/Esquema.icns                 Mac: el logo a 824 px dentro de 1024 (la rejilla de íconos de macOS), con sombra suave.
//   escritorio/iconos/esquema-N.png  Windows y Linux (16…512) y esquema.ico (16…256).
// Playwright dibuja el SVG y Pillow arma el .icns y el .ico.
// Uso: node herramientas/generar_icono.mjs   (PLAYWRIGHT=/ruta/a/playwright si no está instalado aquí)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const logo = fs.readFileSync(path.join(RAIZ, "ui", "favicon.svg"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "esquema-icono-"));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
async function dibujar(destino, lado, logoLado, sombra) {
  await p.setViewportSize({ width: lado, height: lado });
  const svg = logo.replace("<svg ", `<svg width="${logoLado}" height="${logoLado}" `);
  await p.setContent(`<body style="margin:0;background:transparent"><div style="width:${lado}px;height:${lado}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${logoLado}px;height:${logoLado}px;${sombra ? "filter:drop-shadow(0 10px 14px rgba(0,0,0,.28))" : ""}">${svg}</div></div></body>`);
  await p.screenshot({ path: destino, omitBackground: true });
}
await dibujar(path.join(tmp, "mac.png"), 1024, 824, true);
const dir = path.join(RAIZ, "escritorio", "iconos");
fs.mkdirSync(dir, { recursive: true });
for (const n of [16, 32, 48, 64, 128, 256, 512]) await dibujar(path.join(dir, `esquema-${n}.png`), n, n, false);
await b.close();
execFileSync("python3", ["-c", `from PIL import Image
Image.open(${JSON.stringify(path.join(tmp, "mac.png"))}).convert("RGBA").save(${JSON.stringify(path.join(RAIZ, "app", "Esquema.icns"))}, sizes=[(16,16),(32,32),(64,64),(128,128),(256,256),(512,512),(1024,1024)])
Image.open(${JSON.stringify(path.join(dir, "esquema-256.png"))}).convert("RGBA").save(${JSON.stringify(path.join(dir, "esquema.ico"))}, sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])`]);
fs.copyFileSync(path.join(dir, "esquema-512.png"), path.join(dir, "esquema.png"));
console.log("Listo: app/Esquema.icns y escritorio/iconos/");
