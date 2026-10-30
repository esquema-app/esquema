// Prueba de Esquema para Linux en una pantalla virtual: abre la app (Electron de verdad), revisa que la interfaz cargue sin errores
// y prueba el puente de punta a punta con una carpeta ficticia: idioma primero, config solo con claves conocidas, abrir y guardar,
// vigilar la carpeta (un cambio de afuera se recarga; con cambios sin guardar se pregunta), archivo nuevo de afuera, rutas fuera de
// la carpeta, IA falsa sin herramientas, «Dibújame», proyectos (órdenes conocidas, siempre sobre la carpeta actual, recientes
// por posición), menú, navegación y protocolo.
// Uso (desde escritorio/): xvfb-run -a node pruebas/arranque.mjs [carpeta-de-capturas]
//   HOME y la carpeta de Esquema son temporales (nunca toca tus datos). Playwright puede estar aparte: NODE_PATH=/ruta/node_modules.
//   SOLO_ARRANQUE=1 con ELECTRON=dist/linux-unpacked/esquema APP=1: solo revisa que la app empaquetada abra y cargue.
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ESCRITORIO = path.resolve(AQUI, "..");
const RAIZ = path.resolve(ESCRITORIO, "..");
const requerir = createRequire(import.meta.url);
const { _electron: electron } = requerir(requerir.resolve("playwright", { paths: [process.cwd(), ESCRITORIO, ...(process.env.NODE_PATH || "").split(":").filter(Boolean)] }));
const CASA = fs.mkdtempSync(path.join(os.tmpdir(), "esquema-arranque-"));
const salida = process.argv[2] || path.join(CASA, "capturas");
fs.mkdirSync(salida, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const errores = [];
const falla = (m) => { errores.push(m); console.log("  ✗ " + m); };
const bien = (m) => console.log("  ✓ " + m);

// Carpeta ficticia de la persona y una IA falsa (la de pruebas/, como `claude` en ~/.local/bin, que bin/ia.py suma al PATH).
const PROYECTO = path.join(CASA, "proyecto-ejemplo");
fs.mkdirSync(path.join(PROYECTO, "docs"), { recursive: true });
fs.mkdirSync(path.join(PROYECTO, "node_modules", "x"), { recursive: true });
fs.writeFileSync(path.join(PROYECTO, "README.md"), "# Proyecto de Ana Pérez\n\n```mermaid\nflowchart LR\n    A[App] --> B[(Datos)]\n```\n");
fs.writeFileSync(path.join(PROYECTO, "docs", "flujo.mmd"), "flowchart TD\n    A[Inicio] --> B[Fin]\n");
fs.writeFileSync(path.join(CASA, "secreto.md"), "no se lee\n");
fs.mkdirSync(path.join(CASA, ".local", "bin"), { recursive: true });
fs.copyFileSync(path.join(RAIZ, "pruebas", "ia_falsa.py"), path.join(CASA, ".local", "bin", "claude"));
fs.chmodSync(path.join(CASA, ".local", "bin", "claude"), 0o755);
const REGISTRO = path.join(CASA, "ia.jsonl");
const DATOS = path.join(CASA, ".config", "esquema");

const app = await electron.launch({
  executablePath: process.env.ELECTRON || path.join(ESCRITORIO, "node_modules", "electron", "dist", "electron"),
  args: ["--no-sandbox", ...(process.env.APP ? [] : [ESCRITORIO])],
  env: { ...process.env, HOME: CASA, XDG_CONFIG_HOME: path.join(CASA, ".config"), PATH: path.join(CASA, ".local", "bin") + path.delimiter + process.env.PATH, ESQUEMA_PRUEBAS: "1", IA_FALSA_REGISTRO: REGISTRO, LANG: "es_CL.UTF-8" },
});
app.on("console", (m) => { if (m.type() === "error") errores.push("principal: " + m.text()); });
let v = null;
for (let i = 0; i < 80 && !v; i++) { v = app.windows().find((w) => w.url() === "esquema://ui/index.html"); if (!v) await espera(250); }
if (!v) throw new Error("no apareció la ventana principal");
v.on("pageerror", (e) => falla("interfaz: " + e.message));
let esperar404 = false;
v.on("console", (m) => { if (m.type() === "error" && !(esperar404 && /404|Failed to fetch|ERR_|Content Security Policy/.test(m.text()))) falla("consola: " + m.text()); });
await v.waitForFunction(() => window.Esquema && document.getElementById("app").innerHTML.length > 100, null, { timeout: 15000 });
const info = await v.evaluate(() => ({ host: window.ESQUEMA_HOST, html: document.documentElement.dataset.host, node: typeof window.require, ipc: typeof window.ipcRenderer }));
if (info.host !== "linux" || info.html !== "linux") falla("ESQUEMA_HOST no es linux: " + JSON.stringify(info));
if (info.node !== "undefined" || info.ipc !== "undefined") falla("la página ve Node o ipcRenderer");
const sandbox = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const p = w.webContents.getLastWebPreferences(); return { sandbox: p.sandbox, aislado: p.contextIsolation, node: p.nodeIntegration }; });
if (!sandbox.sandbox || !sandbox.aislado || sandbox.node) falla("la ventana no tiene sandbox y contextIsolation: " + JSON.stringify(sandbox));
await v.screenshot({ path: path.join(salida, "1-idioma.png") });
if (!(await v.$(".idiomas"))) falla("la primera pantalla no es la de idioma");
else bien("abre con la pantalla de idioma, con sandbox y contextIsolation");

if (process.env.SOLO_ARRANQUE) {
  await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
  console.log(errores.length ? `✗ ${errores.length} problemas: ${errores.slice(0, 3).join(" | ")}` : "✓ Esquema para Linux: la app abre y la interfaz carga");
  process.exit(errores.length ? 1 : 0);
}

// Antes del idioma, el menú no hace nada.
await app.evaluate(() => global.esquemaPruebas.menu("ajustes"));
await espera(300);
if (await v.evaluate(() => { let a; window.Esquema._probar((E) => { a = E.ajustes; }); return a; })) falla("el menú abrió Ajustes antes de elegir el idioma");

// Respuestas de la app que la prueba quiere esperar.
await v.evaluate(() => {
  window._r = {};
  for (const f of ["estado", "carpetaElegida", "archivoAbierto", "archivoGuardado", "archivoCambiado", "archivos", "iaProbada", "dibujoListo", "estructuraLista", "copiado", "proyectoRespuesta"]) {
    const antes = window.Esquema[f];
    window.Esquema[f] = (x) => { (window._r[f] ||= []).push(x); return antes.call(window.Esquema, x); };
  }
});
const enviar = (accion, datos = {}) => v.evaluate(([a, d]) => window.esquemaEscritorio.enviar({ accion: a, datos: d }), [accion, datos]);
const esperarR = async (f, n = 1, ms = 20000) => {
  for (let i = 0; i < ms / 100; i++) { const r = await v.evaluate(([f, n]) => (window._r[f] || [])[n - 1], [f, n]); if (r) return r; await espera(100); }
  return null;
};
const cuantas = (f) => v.evaluate((f) => (window._r[f] || []).length, f);
const E = (f) => v.evaluate((s) => { let r; window.Esquema._probar((E) => { r = new Function("E", "return " + s)(E); }); return r; }, f);

// Elegir el idioma (como un clic) y config con claves que no existen o que no le tocan a la interfaz.
await v.click('[data-idioma="es"]');
await enviar("config", { tema: "oscuro", carpeta: "/etc", inventada: 1, idioma_ui: "../../x" });
await espera(500);
const config = JSON.parse(fs.readFileSync(path.join(DATOS, "config.json"), "utf8"));
if (config.idioma_ui !== "es" || config.tema !== "oscuro") falla("config no guardó idioma y tema: " + JSON.stringify(config));
if ("carpeta" in config || "inventada" in config) falla("config aceptó una clave que no debía: " + JSON.stringify(config));
else bien("config solo guarda claves y valores conocidos (nunca la carpeta)");
const modo = fs.statSync(DATOS).mode & 0o777, modoConfig = fs.statSync(path.join(DATOS, "config.json")).mode & 0o777;
if (modo !== 0o700 || modoConfig !== 0o600) falla(`la carpeta de Esquema no es privada (${modo.toString(8)}, ${modoConfig.toString(8)})`);

// La carpeta (como si se hubiera elegido con el selector del sistema) y el estado.
await app.evaluate((_e, p) => { global.esquemaPruebas.Config.guardarCarpeta(p); return global.esquemaPruebas.enviarEstado(); }, fs.realpathSync(PROYECTO));
const estado = await esperarR("estado");
const rutas = (estado?.archivos || []).map((a) => a.ruta).sort();
if (JSON.stringify(rutas) !== JSON.stringify(["README.md", "docs/flujo.mmd"])) falla("el estado no trae los archivos de la carpeta: " + JSON.stringify(rutas));
else bien("estado con la carpeta y sus archivos (sin node_modules)");
await v.evaluate(() => window.Esquema._probar((E) => { E.bv = null; E.config.bienvenida = true; }));

// Abrir y guardar.
await enviar("abrirArchivo", { ruta: "docs/flujo.mmd" });
const abierto = await esperarR("archivoAbierto");
if (!abierto?.ok || !abierto.texto.includes("flowchart")) falla("abrirArchivo no funcionó: " + JSON.stringify(abierto));
await v.evaluate(() => window.Esquema._pruebas.abrir("docs/flujo.mmd"));
await espera(800);
const nuevoTexto = "flowchart TD\n    A[Inicio] --> B[Fin]\n    B --> C[Otro]\n";
await v.evaluate((t) => window.Esquema._probar((E) => { const d = E.docs["docs/flujo.mmd"]; d.texto = t; d.estado = "cambiado"; }), nuevoTexto);
await app.evaluate(() => global.esquemaPruebas.menu("guardar"));
const guardado = await esperarR("archivoGuardado");
if (!guardado?.ok || fs.readFileSync(path.join(PROYECTO, "docs", "flujo.mmd"), "utf8") !== nuevoTexto) falla("Guardar (menú) no escribió el archivo: " + JSON.stringify(guardado));
else bien("abrir y guardar (menú Archivo → Guardar)");
await espera(1500);
if (await cuantas("archivoCambiado")) falla("el guardado de la propia app se avisó como un cambio de afuera");

// Un cambio de afuera (VS Code, git pull…) sin cambios sin guardar: se recarga solo.
const deAfuera = "flowchart TD\n    A[Inicio] --> B[Fin]\n    B --> D[Desde VS Code]\n";
fs.writeFileSync(path.join(PROYECTO, "docs", "flujo.mmd"), deAfuera);
const cambio = await esperarR("archivoCambiado", 1, 8000);
if (cambio?.texto !== deAfuera) falla("no avisó el cambio de afuera: " + JSON.stringify(cambio));
await espera(300);
if ((await E('E.docs["docs/flujo.mmd"].texto')) !== deAfuera) falla("la interfaz no recargó el archivo cambiado afuera");
else bien("un cambio hecho afuera se recarga solo");

// Con cambios sin guardar: se pregunta. «Usar la del disco» deja el texto de afuera.
await v.evaluate(() => window.Esquema._probar((E) => { const d = E.docs["docs/flujo.mmd"]; d.texto = d.texto + "    D --> E[Mío]\n"; d.estado = "cambiado"; }));
const otroDeAfuera = deAfuera + "    D --> F[Otra vez de afuera]\n";
fs.writeFileSync(path.join(PROYECTO, "docs", "flujo.mmd"), otroDeAfuera);
await esperarR("archivoCambiado", 2, 8000);
await espera(300);
if (!(await E("!!E.confirmar"))) falla("con cambios sin guardar no preguntó");
else {
  await v.screenshot({ path: path.join(salida, "2-conflicto.png") });
  await v.click('[data-accion="confirmar-si"]');
  await espera(300);
  if ((await E('E.docs["docs/flujo.mmd"].texto')) !== otroDeAfuera) falla("«Usar la del disco» no dejó el texto de afuera");
  else bien("con cambios sin guardar pregunta con cuál quedarse");
}

// Archivo nuevo creado afuera: la lista se actualiza. Lo de node_modules no cuenta.
fs.writeFileSync(path.join(PROYECTO, "node_modules", "x", "nada.md"), "# no\n");
fs.writeFileSync(path.join(PROYECTO, "docs", "nuevo.md"), "# Nuevo\n");
const lista = await esperarR("archivos", 1, 8000);
const nuevas = (lista?.archivos || []).map((a) => a.ruta);
if (!nuevas.includes("docs/nuevo.md") || nuevas.some((r) => r.includes("node_modules"))) falla("la lista no se actualizó bien: " + JSON.stringify(nuevas));
else bien("un archivo nuevo de afuera aparece en la lista");

// Rutas fuera de la carpeta o que no son .md/.mmd: nunca.
const antesA = await cuantas("archivoAbierto"), antesG = await cuantas("archivoGuardado");
await enviar("abrirArchivo", { ruta: "../secreto.md" });
await enviar("abrirArchivo", { ruta: "/etc/passwd" });
await enviar("guardarArchivo", { ruta: "../escrito.md", texto: "x" });
await esperarR("archivoAbierto", antesA + 2);
await esperarR("archivoGuardado", antesG + 1);
const fuera = await v.evaluate(([a, g]) => [...window._r.archivoAbierto.slice(a), ...window._r.archivoGuardado.slice(g)].map((r) => r.ok), [antesA, antesG]);
if (fuera.some(Boolean) || fs.existsSync(path.join(CASA, "escrito.md"))) falla("se abrió o escribió algo fuera de la carpeta: " + JSON.stringify(await v.evaluate(() => [window._r.archivoAbierto, window._r.archivoGuardado])).slice(0, 600));
else bien("nada fuera de la carpeta");

// IA falsa: probar y «Dibújame», sin herramientas ni variables ESQUEMA_*.
await enviar("probarIA", { ia: "claude" });
const ia = await esperarR("iaProbada");
if (!ia?.ok) falla("probarIA no funcionó con la IA falsa: " + JSON.stringify(ia));
await enviar("dibujar", { pedido: "Dibuja el proceso de compra", tipo: "auto", idioma: "es" });
const dibujo = await esperarR("dibujoListo");
if (!dibujo?.ok || !dibujo.texto.startsWith("flowchart")) falla("dibujar no respondió un diagrama: " + JSON.stringify(dibujo));
const llamadas = fs.existsSync(REGISTRO) ? fs.readFileSync(REGISTRO, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
if (!llamadas.length || llamadas.some((l) => !l.args.includes("--disallowedTools") || !l.args.includes("--strict-mcp-config") || l.entorno.length)) falla("la IA no corrió sin herramientas: " + JSON.stringify(llamadas.map((l) => [l.args, l.entorno])));
else bien("la IA de la persona corre sin herramientas ni MCP");
await enviar("estructura");
const est = await esperarR("estructuraLista");
if (!est?.ok || !est.archivos.includes("README.md")) falla("estructura no funcionó: " + JSON.stringify(est));

// Copiar al portapapeles.
await enviar("copiar", { texto: "```mermaid\nflowchart LR\n    A --> B\n```\n" });
const copiado = await esperarR("copiado");
const portapapeles = await app.evaluate(({ clipboard }) => clipboard.readText());
if (!copiado?.ok || !portapapeles.includes("flowchart LR")) falla("copiar no dejó el texto en el portapapeles");

// Proyectos: solo órdenes conocidas, siempre sobre la carpeta actual (aunque la interfaz mande otra), y los recientes por posición.
{
  const pedir = async (datos) => { const n = await cuantas("proyectoRespuesta"); await enviar("proyecto", datos); return esperarR("proyectoRespuesta", n + 1, 30000); };
  const rara = await pedir({ orden: "rm", carpeta: "/" });
  if (rara?.ok !== false) falla("una orden desconocida llegó a bin/proyecto.py: " + JSON.stringify(rara));
  const leido = await pedir({ orden: "leer", carpeta: CASA });
  if (!leido?.ok || leido.encontrado.carpeta !== "proyecto-ejemplo" || leido.encontrado.git.hay) falla("leer el proyecto no usó la carpeta actual: " + JSON.stringify(leido).slice(0, 300));
  const gen = await pedir({ orden: "generar", tarea: "inicial", idioma: "es" });
  if (!gen?.ok || !gen.propuestas.some((x) => x.ruta === "README.md") || gen.propuestas.some((x) => x.ruta.includes(".."))) falla("generar con la IA falsa no dio propuestas válidas: " + JSON.stringify(gen).slice(0, 300));
  const esquema = { formato: 1, nombre: "Proyecto de prueba", documentos: [], elementos: [{ id: "boton-grabar", tipo: "boton", nombre: "Grabar" }] };
  const g = await pedir({ orden: "guardar", esquema, docs: "../fuera" });
  if (g?.ok !== false) falla("guardar aceptó una carpeta de docs fuera del proyecto");
  const g2 = await pedir({ orden: "guardar", esquema, carpeta: CASA });
  if (!g2?.ok || !fs.existsSync(path.join(PROYECTO, "docs", "esquema", "esquema.json")) || fs.existsSync(path.join(CASA, "docs"))) falla("guardar no escribió esquema.json en el proyecto: " + JSON.stringify(g2));
  const ver = await pedir({ orden: "version", mensaje: "Primera" });
  if (!ver?.ok || ver.modo !== "copias" || !fs.readdirSync(path.join(PROYECTO, "docs", "esquema", ".versiones")).length) falla("sin git, la versión no quedó como copia: " + JSON.stringify(ver));
  const lista = JSON.parse(fs.readFileSync(path.join(DATOS, "proyectos.json"), "utf8")).recientes;
  if (lista[0]?.ruta !== fs.realpathSync(PROYECTO)) falla("el proyecto no quedó en los recientes: " + JSON.stringify(lista));
  // Un reciente se abre por su posición; una posición que no existe, no. La ruta nunca viene de la interfaz.
  const nc = await cuantas("carpetaElegida");
  await enviar("abrirProyecto", { indice: 7, ruta: "/etc" });
  const malo = await esperarR("carpetaElegida", nc + 1);
  await enviar("abrirProyecto", { indice: 0 });
  const bueno = await esperarR("carpetaElegida", nc + 2);
  if (malo?.ok !== false || !bueno?.ok || !bueno.proyecto || bueno.carpeta?.ruta !== fs.realpathSync(PROYECTO)) falla("abrirProyecto: " + JSON.stringify([malo, bueno]).slice(0, 300));
  else bien("proyectos: órdenes conocidas, siempre en la carpeta actual, versiones y recientes");
  await espera(800);
  await v.evaluate(() => window.Esquema._pruebas.abrir("docs/flujo.mmd"));
  await espera(400);
}

// Un proyecto con git, de punta a punta desde la interfaz (Python, git y la vigilancia de verdad): la documentación va aparte, en
// ~/Esquema/<proyecto>/ con su propio git (`proyecto.biblioteca()` + `vincular`); documentar con la IA falsa, renombrar un elemento
// en todas partes (un commit solo en el git de la documentación), comparar y restaurar. El git del código nunca recibe nada.
const { execFileSync } = requerir("child_process");
const REPO = path.join(CASA, "repo-git");
fs.mkdirSync(path.join(REPO, "src"), { recursive: true });
fs.writeFileSync(path.join(REPO, "README.md"), "# Minutero\n\nNotas de reuniones.\n");
fs.writeFileSync(path.join(REPO, "src", "grabar.py"), "def grabar():\n    pass\n");
const gitEn = (dir) => (...a) => execFileSync("git", ["-C", dir, "-c", "user.name=Pruebas", "-c", "user.email=pruebas@users.noreply.github.com", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const gitR = gitEn(REPO);
gitR("init", "-q", "-b", "main"); gitR("add", "-A"); gitR("commit", "-qm", "Código");
const headCodigo = gitR("rev-parse", "HEAD").trim();
{
  const nc = await cuantas("carpetaElegida");
  await enviar("config", { bienvenida: true });  // al volver a mandar el estado, no se repite la bienvenida
  await app.evaluate((_e, p) => global.esquemaPruebas.Config.guardarCarpeta(p), fs.realpathSync(REPO));
  await enviar("abrirProyecto", { indice: 99 });  // no existe: la carpeta se pone por config, como el selector
  await esperarR("carpetaElegida", nc + 1);
  await app.evaluate(() => global.esquemaPruebas.enviarEstado());
  await espera(800);
  // «Agregar proyecto»: abrir la carpeta del código la vincula y la app abre la documentación aparte (vacía → «Lo que encontré»).
  await v.evaluate(() => window.Esquema._pruebas.proyectos().alCambiarCarpeta({ proyecto: true }));
  await v.waitForSelector('[data-accion="p-generar-inicial"]', { timeout: 15000 });
  const vinculo = JSON.parse(fs.readFileSync(path.join(DATOS, "proyectos.json"), "utf8")).recientes.find((x) => x.codigo === fs.realpathSync(REPO));
  const DOCS = path.join(fs.realpathSync(CASA), "Esquema", "repo-git");
  if (!vinculo || vinculo.ruta !== DOCS || vinculo.docs !== "" || !fs.existsSync(path.join(DOCS, ".git"))) falla("vincular no dejó la documentación aparte en ~/Esquema/repo-git con su git: " + JSON.stringify(vinculo));
  const gitD = gitEn(DOCS);
  await v.click('[data-accion="p-generar-inicial"]'); await v.waitForSelector(".p-envio details", { timeout: 15000 });
  await v.click('[data-accion="p-enviar"]'); await v.waitForSelector(".p-prop", { timeout: 30000 });
  await v.click('[data-accion="p-aplicar"]');
  const log = () => { try { return gitD("log", "--format=%s"); } catch { return ""; } };
  for (let i = 0; i < 100 && !log().includes("Documentación inicial"); i++) await espera(150);
  if (!log().includes("Documentación inicial") || !["README.md", "elementos.md", "esquema.json", path.join("flujos", "grabar.md")].every((r) => fs.existsSync(path.join(DOCS, r)))) falla("documentar el proyecto no dejó los archivos y la versión en la carpeta aparte: " + log());
  const inicial = gitD("show", "--name-only", "--format=", "HEAD").trim().split("\n");
  if (!["README.md", "elementos.md", "esquema.json", "flujos/grabar.md"].every((r) => inicial.includes(r))) falla("la versión inicial no tiene todos los documentos: " + inicial.join(", "));
  const codigoIntacto = () => gitR("rev-parse", "HEAD").trim() === headCodigo && !gitR("status", "--porcelain").trim() && !fs.existsSync(path.join(REPO, "docs"));
  if (!codigoIntacto()) falla("documentar tocó el repo del código: " + gitR("log", "--format=%s") + gitR("status", "--porcelain"));
  await v.click('.lateral [data-p="elementos"]'); await v.click('[data-p-elemento="boton-grabar"]');
  await v.click('[data-accion="p-renombrar"]'); await v.fill("#p-valor", "Empezar a grabar"); await v.click('[data-accion="p-ver-cambio"]');
  await v.waitForSelector(".p-cambio-lista .p-prop"); await v.screenshot({ path: path.join(salida, "5-proyecto-renombrar.png") });
  await v.click('[data-accion="p-aplicar-cambio"]');
  for (let i = 0; i < 100 && !log().includes("Renombré"); i++) await espera(150);
  const archivosCommit = gitD("show", "--name-only", "--format=", "HEAD").trim().split("\n").sort();
  if (!fs.readFileSync(path.join(DOCS, "README.md"), "utf8").includes("[Empezar a grabar](elementos.md#el-boton-grabar)") || !fs.readFileSync(path.join(DOCS, "flujos", "grabar.md"), "utf8").includes("G[Empezar a grabar]")) falla("renombrar no cambió los archivos en el disco");
  if (!log().includes("Renombré") || !archivosCommit.includes("README.md") || !archivosCommit.includes("flujos/grabar.md")) falla("renombrar no guardó una versión con los archivos cambiados: " + log() + " | " + archivosCommit.join(", "));
  if (!codigoIntacto()) falla("renombrar tocó el repo del código: " + gitR("log", "--format=%s"));
  await v.click('.lateral [data-p="versiones"]'); await v.waitForSelector("[data-p-version]");
  await v.click("[data-p-version] >> nth=-1"); await v.waitForSelector("[data-p-dif]", { timeout: 15000 });
  await v.screenshot({ path: path.join(salida, "6-proyecto-versiones.png") });
  await v.click('[data-accion="p-restaurar"]'); await v.click('[data-accion="p-restaurar-si"]');
  for (let i = 0; i < 100 && !log().includes("Restauré"); i++) await espera(150);
  if (!fs.readFileSync(path.join(DOCS, "README.md"), "utf8").includes("[Grabar](elementos.md#el-boton-grabar)") || !log().includes("Restauré")) falla("restaurar no volvió los archivos o no guardó la versión: " + log());
  else if (!codigoIntacto()) falla("restaurar tocó el repo del código");
  else bien("proyecto con git: documentación aparte en ~/Esquema con su git; documentar, renombrar en todas partes, versiones y restaurar (el git del código, intacto)");
  if (gitD("status", "--porcelain").trim()) falla("quedaron cambios sin versión después de restaurar: " + gitD("status", "--porcelain"));
  if (fs.existsSync(path.join(DOCS, ".versiones"))) falla("con git, las versiones no deberían quedar como copias");
  await v.evaluate(() => window.Esquema._probar((E) => { E.panel = null; }));
  await app.evaluate((_e, p) => global.esquemaPruebas.Config.guardarCarpeta(p), fs.realpathSync(PROYECTO));
  await app.evaluate(() => global.esquemaPruebas.enviarEstado());
  await espera(800);
  await v.evaluate(() => window.Esquema._pruebas.abrir("docs/flujo.mmd"));
  await espera(400);
}

// Menú → Ajustes (con idioma elegido) y Ver → Solo texto.
await app.evaluate(() => global.esquemaPruebas.menu("ajustes"));
await espera(400);
if (!(await E("E.ajustes"))) falla("el menú no abrió Ajustes");
await v.screenshot({ path: path.join(salida, "3-ajustes.png") });
await v.evaluate(() => window.Esquema._probar((E) => { E.ajustes = false; }));
await app.evaluate(() => global.esquemaPruebas.menu("texto"));
await espera(300);
if ((await E("E.vista")) !== "texto") falla("Ver → Solo texto no cambió la vista");
await app.evaluate(() => global.esquemaPruebas.menu("ambos"));
await espera(500);
await v.screenshot({ path: path.join(salida, "4-editor.png") });

// La ventana nunca navega fuera de ui/ y el protocolo solo sirve ui/.
esperar404 = true;
await v.evaluate(() => { location.href = "https://example.com/"; });
await espera(800);
if (!v.url().startsWith("esquema://ui/")) falla("la ventana navegó fuera de la interfaz: " + v.url());
const protocolo = await v.evaluate(async () => {
  const pedir = (u) => fetch(u).then((r) => r.status).catch(() => "error");
  return [await pedir("esquema://ui/idiomas/en.json"), await pedir("esquema://ui/%2e%2e/bin/comun.py"), await pedir("esquema://otro/index.html")];
});
esperar404 = false;
if (protocolo[0] !== 200 || protocolo[1] === 200 || protocolo[2] === 200) falla("esquema:// sirvió algo fuera de ui/: " + JSON.stringify(protocolo));
else bien("la ventana solo muestra ui/ y el protocolo solo sirve ui/");

// Un iframe (aunque la CSP lo bloquea) nunca habla con el puente: lo revisa el proceso principal con senderFrame.
fs.writeFileSync(path.join(salida, "errores.json"), JSON.stringify(errores, null, 1));
await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
await espera(300);
try { fs.rmSync(CASA, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
console.log(errores.length ? `✗ ${errores.length} problemas` : "✓ Esquema para Linux: arranque, puente y vigilancia de la carpeta en orden");
process.exit(errores.length ? 1 : 0);
