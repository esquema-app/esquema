// Esquema para Windows y Linux. Misma interfaz (ui/) y mismo procesamiento (bin/) que la app de Mac; aquí está lo que en Mac hacen
// EsquemaApp.swift (menús), Ventana.swift (puente: un caso por acción en ACCIONES), Carpeta.swift (carpeta y vigilancia) y
// Actualizaciones.swift. El contrato está en pruebas/puente.json y lo revisa pruebas/contrato.py.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, net, protocol, session, shell } = require("electron");
const { ES_WIN, datos, prepararDatos, recursos, absoluta } = require("./rutas");
const { configurar, leerJSON, Config, Idioma, Procesador, EnOrden } = require("./servicios");
const { Vigilante } = require("./vigilante");
const { Actualizaciones, SIN_CONEXION } = require("./actualizaciones");
const { crearCatalogo } = require("./catalogo");

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
if (ES_WIN) app.setAppUserModelId("app.esquema.escritorio");
app.setName("Esquema");
configurar({ empaquetada: app.isPackaged });
// Lo que Chromium guarda (caché, preferencias del navegador) va en una subcarpeta de la carpeta de Esquema, no junto a config.json.
app.setPath("userData", path.join(datos(), "electron"));

// La interfaz se sirve desde esquema://ui/… (así fetch() de archivos relativos funciona igual que en Mac). Nada más se sirve.
protocol.registerSchemesAsPrivileged([{ scheme: "esquema", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const ORIGEN = "esquema://ui/";
const ICONOS = path.join(__dirname, "..", "iconos");
const t = (s) => Idioma.t(s);
const MAXIMO_EXPORTAR = 50 * 1024 * 1024;
// Plantillas de la comunidad: solo de raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones (src/catalogo.js).
const Catalogo = crearCatalogo({ fetch: (u, o) => net.fetch(u, o), procesador: Procesador, t, version: app.getVersion() });

// ───────────────────────── Ventana (equivale a Ventana.swift) ─────────────────────────
let ventana = null, lista = false, saliendo = false;
let guardando = 0;

function mostrar() {
  if (!ventana || ventana.isDestroyed()) return crearVentana();
  if (ventana.isMinimized()) ventana.restore();
  ventana.show(); ventana.focus();
}

function crearVentana() {
  let g = {};
  try { g = JSON.parse(fs.readFileSync(path.join(datos(), "ventana.json"), "utf8")); } catch {}
  lista = false;
  ventana = new BrowserWindow({
    width: g.width || 1280, height: g.height || 800, x: g.x, y: g.y, minWidth: 720, minHeight: 520, show: false,
    title: "Esquema", icon: nativeImage.createFromPath(path.join(ICONOS, "esquema-256.png")), backgroundColor: "#f7f7f5",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false,
      webviewTag: false, spellcheck: false },
  });
  ventana.loadURL(ORIGEN + "index.html");
  ventana.once("ready-to-show", () => ventana.show());
  // Cerrar la ventana cierra la app, pero antes la interfaz guarda lo pendiente (como mucho 3 segundos).
  ventana.on("close", (e) => {
    try { prepararDatos(); fs.writeFileSync(path.join(datos(), "ventana.json"), JSON.stringify(ventana.getNormalBounds())); } catch {}
    if (saliendo) return;
    e.preventDefault();
    salir();
  });
  ventana.on("closed", () => { ventana = null; lista = false; });
  // La ventana nunca navega fuera de ui/ ni abre otras ventanas: un enlace https se abre en el navegador.
  ventana.webContents.setWindowOpenHandler(({ url }) => { abrirEnlace(url); return { action: "deny" }; });
  ventana.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGEN)) { e.preventDefault(); abrirEnlace(url); } });
  ventana.webContents.on("will-redirect", (e, url) => { if (!url.startsWith(ORIGEN)) e.preventDefault(); });
  ventana.webContents.on("will-attach-webview", (e) => e.preventDefault());
  // Si el proceso de la página se cae, se vuelve a cargar la interfaz (lo guardado está en el disco).
  ventana.webContents.on("render-process-gone", () => { lista = false; if (ventana && !ventana.isDestroyed()) ventana.loadURL(ORIGEN + "index.html"); });
}

async function salir() {
  if (saliendo) return;
  saliendo = true;
  llamar("menu", { accion: "guardar" });
  await esperarGuardados(3000);
  vigilante.detener();
  app.exit(0);
}

/** Espera a que terminen los guardados en curso (y a que lleguen los que la interfaz acaba de pedir). */
async function esperarGuardados(ms) {
  const limite = Date.now() + ms;
  await new Promise((r) => setTimeout(r, 300));
  while ((guardando > 0 || EnOrden.pendientes > 0) && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
}

function abrirEnlace(url) {
  try { const u = new URL(String(url || "")); if (u.protocol === "https:" && u.host) shell.openExternal(u.toString()); } catch {}
}

// ───────────────────────── Hacia la interfaz ─────────────────────────
function llamar(funcion, d) {
  if (!ventana || ventana.isDestroyed() || !lista) return;
  ventana.webContents.executeJavaScript(`window.Esquema && window.Esquema.${funcion}(${JSON.stringify(d)})`).catch(() => {});
}

// ───────────────────────── La carpeta (equivale a Carpeta.swift) ─────────────────────────
/** La carpeta elegida, si todavía existe. */
function carpetaActual() {
  const c = Config.texto("carpeta");
  if (!c || !path.isAbsolute(c)) return null;
  try { return fs.statSync(c).isDirectory() ? fs.realpathSync(c) : null; } catch { return null; }
}

const vigilante = new Vigilante({
  avisar: (f, d) => llamar(f, d),
  listar: (base) => Procesador.correrJSON("carpeta.py", ["listar", base]),
});

async function enviarEstado() {
  if (!lista) return;
  const e = await Procesador.correrJSON("estado.py", []);
  delete e.ok; delete e.error;
  Object.assign(e, { version: app.getVersion(), actualizacion: Actualizaciones.disponible });
  if (!e.config) e.config = Config.leer();
  const c = carpetaActual();
  e.carpeta = null; e.archivos = [];
  if (c) {
    const r = await Procesador.correrJSON("carpeta.py", ["listar", c]);
    if (r.ok) { e.carpeta = r.carpeta; e.archivos = r.archivos || []; vigilante.empezar(c, e.archivos); }
  } else vigilante.detener();
  llamar("estado", e);
}

/** Proyectos: lo que bin/proyecto.py sabe hacer (la interfaz no puede pedir otra cosa). */
const ORDENES_PROYECTO = ["abrir", "leer", "preparar", "generar", "guardar", "version", "versiones", "ver", "restaurar", "vincular", "mover", "destinos", "pasar", "codigo", "codigo_leer", "codigo_guardar", "arbol", "documentar", "trabajo", "detener", "quitar", "detectar", "agregar", "crear", "responder", "continuar", "borrar", "recuperar", "historia_estado", "historia_cierre", "estudiar", "incongruencias", "wiki_preparar", "wiki_publicar"];
/** Las órdenes largas que cuentan cómo van (bin/trabajos.py): sus eventos llegan a la interfaz como `proyectoProgreso`. */
const ORDENES_CON_PROGRESO = ["documentar", "agregar", "crear", "responder", "continuar", "historia_cierre", "estudiar", "incongruencias"];
/** Las que no necesitan una carpeta abierta (crear un proyecto Libro desde cero): no reciben `carpeta`. */
const ORDENES_SIN_CARPETA = ["detectar", "crear"];

/** Deja `c` como la carpeta, la lista, la vigila y responde carpetaElegida (con proyecto: true si viene de un proyecto). */
async function usarCarpeta(c, proyecto) {
  Config.guardarCarpeta(c);
  const l = await Procesador.correrJSON("carpeta.py", ["listar", c]);
  if (!l.ok) return llamar("carpetaElegida", { ok: false, error: t(l.error || "No pude abrir esa carpeta.") });
  vigilante.empezar(c, l.archivos || []);
  llamar("carpetaElegida", { ok: true, carpeta: l.carpeta, archivos: l.archivos || [], ...(proyecto ? { proyecto: true } : {}) });
}

/** Un proyecto reciente: la ruta sale de <carpeta de Esquema>/proyectos.json (lo escribe bin/proyecto.py), nunca de la interfaz. */
async function abrirProyecto(indice) {
  const d = leerJSON(path.join(datos(), "proyectos.json"), {}) || {};
  const lista = (Array.isArray(d.recientes) ? d.recientes : []).filter((p) => p && typeof p.ruta === "string" && path.isAbsolute(p.ruta) && typeof p.nombre === "string").slice(0, 30);
  const p = Number.isInteger(indice) && indice >= 0 && indice < lista.length ? lista[indice] : null;
  let c = null;
  try { if (p && fs.statSync(p.ruta).isDirectory()) c = fs.realpathSync(p.ruta); } catch {}
  if (!c) return llamar("carpetaElegida", { ok: false, error: t("No encontré ese proyecto. ¿Lo moviste?") });
  await usarCarpeta(c, true);
}

async function elegirCarpeta(proyecto = false) {
  if (!ventana) return;
  const r = await dialog.showOpenDialog(ventana, {
    title: t("Elige la carpeta con tus documentos y diagramas (la de tu proyecto, por ejemplo). Esquema no los mueve ni los copia."),
    buttonLabel: t("Usar esta carpeta"), defaultPath: carpetaActual() || undefined, properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return llamar("carpetaElegida", { ok: false });
  let c;
  try { c = fs.realpathSync(r.filePaths[0]); } catch { return llamar("carpetaElegida", { ok: false, error: t("No pude abrir esa carpeta.") }); }
  await usarCarpeta(c, proyecto);
}

/** Nombre sugerido para «Guardar como»: solo el nombre (sin carpetas), con la extensión del formato. */
function nombreExportar(valor, formato) {
  let n = String(valor || "esquema").replace(/[\\/:*?"<>|\0]/g, "-").trim().slice(0, 120);
  if (!n || n.startsWith(".")) n = "esquema" + n;
  if (!n.toLowerCase().endsWith("." + formato)) n += "." + formato;
  return n;
}

const texto = (d, k, max) => String(typeof d[k] === "string" ? d[k] : "").slice(0, max);
const idiomaDe = (d) => (d.idioma === "en" ? "en" : "es");

// ───────────────────────── Desde la interfaz (equivale al switch de Ventana.swift) ─────────────────────────
const ACCIONES = {
  async listo() {
    lista = true;
    await enviarEstado();
  },
  config(d) {
    Config.guardar(d);
    // El menú se rearma en el idioma nuevo y, en el primer uso, recién ahí parte lo que esperaba (actualizaciones).
    if (d.idioma_ui !== undefined) armarMenu();
    if (Idioma.elegido) iniciarTareas();
  },
  async elegirCarpeta(d) {
    await elegirCarpeta(d.proyecto === true);
  },
  async abrirProyecto(d) {
    await abrirProyecto(d.indice);
  },
  /** Un .md/.mmd de la carpeta abierta (que no es documentación de Esquema) a la Papelera del sistema, donde se puede recuperar. */
  async papelera(d) {
    const ruta = typeof d.ruta === "string" ? d.ruta : "";
    const base = carpetaActual();
    const abs = base && absoluta(ruta, base);
    if (!abs) return llamar("enPapelera", { ok: false, ruta, error: t("Ese archivo no se puede borrar.") });
    try { await shell.trashItem(abs); vigilante.conocidos.delete(ruta); llamar("enPapelera", { ok: true, ruta }); }
    catch { llamar("enPapelera", { ok: false, ruta, error: t("No pude mandarlo a la Papelera.") }); }
  },
  async abrirArchivo(d) {
    const ruta = typeof d.ruta === "string" ? d.ruta : "";
    const base = carpetaActual();
    if (!base || !absoluta(ruta, base)) return llamar("archivoAbierto", { ok: false, ruta, error: t("Ese nombre de archivo no sirve.") });
    const r = await Procesador.conEntrada("carpeta.py", "leer", { carpeta: base, ruta });
    if (r.ok && typeof r.texto === "string") vigilante.conocer(ruta, r.texto);
    else Object.assign(r, { ruta, error: t(r.error || "No pude abrir el archivo.") });
    llamar("archivoAbierto", r);
  },
  async guardarArchivo(d) {
    const ruta = typeof d.ruta === "string" ? d.ruta : "";
    const base = carpetaActual();
    if (!base || !absoluta(ruta, base) || typeof d.texto !== "string") return llamar("archivoGuardado", { ok: false, ruta, error: t("No pude guardar el archivo.") });
    guardando++;
    await EnOrden.agregar(async () => {
      // Lo que Esquema escribe queda como conocido antes de escribirlo: la vigilancia no lo toma como un cambio de afuera.
      const antes = vigilante.conocidos.get(ruta);
      vigilante.conocer(ruta, d.texto);
      const r = await Procesador.conEntrada("carpeta.py", "guardar", { carpeta: base, ruta, texto: d.texto, nuevo: d.nuevo === true });
      guardando--;
      if (!r.ok) { vigilante.conocer(ruta, antes); Object.assign(r, { ruta, error: t(r.error || "No pude guardar el archivo.") }); }
      llamar("archivoGuardado", r);
    });
  },
  async probarIA(d) {
    const ia = Config.ias.includes(d.ia) ? d.ia : "";
    if (!ia) return llamar("iaProbada", { ia: String(d.ia || ""), ok: false, error: t("No conozco esa IA.") });
    const r = await Procesador.correrJSON("ia.py", ["probar", ia]);
    llamar("iaProbada", { ...r, ia });
  },
  async estructura() {
    const base = carpetaActual();
    if (!base) return llamar("estructuraLista", { ok: false, error: t("Elige una carpeta primero") });
    llamar("estructuraLista", await Procesador.correrJSON("carpeta.py", ["estructura", base]));
  },
  async crearReadme(d) {
    // Lo que escribió la persona va en el archivo de entrada; bin/asistente.py arma el prompt y limpia la respuesta.
    const e = { descripcion: texto(d, "descripcion", 4000), estructura: d.estructura === true, idioma: idiomaDe(d),
      anterior: texto(d, "anterior", 200000), pedido: texto(d, "pedido", 2000) };
    const base = carpetaActual();
    if (base) e.carpeta = base;
    llamar("readmeListo", await Procesador.conEntrada("asistente.py", "readme", e));
  },
  async dibujar(d) {
    const tipo = ["auto", "flujo", "secuencia", "arquitectura"].includes(d.tipo) ? d.tipo : "auto";
    llamar("dibujoListo", await Procesador.conEntrada("asistente.py", "dibujar",
      { pedido: texto(d, "pedido", 3000), tipo, actual: texto(d, "actual", 60000), idioma: idiomaDe(d) }));
  },
  async proyecto(d) {
    // Solo órdenes conocidas y siempre sobre la carpeta actual; bin/proyecto.py valida el resto (rutas, docs, esquema.json, tamaños).
    const orden = ORDENES_PROYECTO.includes(d.orden) ? d.orden : "";
    const base = carpetaActual();
    if (!orden || (!base && !ORDENES_SIN_CARPETA.includes(orden))) return llamar("proyectoRespuesta", { orden: String(d.orden || "").slice(0, 20), ok: false, error: t("Elige una carpeta primero") });
    // La carpeta siempre la pone la app (nunca la interfaz).
    const e = { ...d };
    delete e.orden; delete e.carpeta;
    if (base) e.carpeta = base;
    const progreso = ORDENES_CON_PROGRESO.includes(orden) ? (eventos) => llamar("proyectoProgreso", { eventos }) : null;
    const r = await Procesador.conEntrada("proyecto.py", orden, e, progreso);
    llamar("proyectoRespuesta", { ...r, orden });
  },
  async exportar(d) {
    const formato = ["svg", "png", "md"].includes(d.formato) ? d.formato : "";
    if (!formato || !ventana) return llamar("exportado", { ok: false });
    const contenido = formato === "png" ? (typeof d.base64 === "string" ? Buffer.from(d.base64, "base64") : null) : typeof d.texto === "string" ? Buffer.from(d.texto, "utf8") : null;
    if (!contenido || !contenido.length || contenido.length > MAXIMO_EXPORTAR) return llamar("exportado", { ok: false, error: t("No pude crear el archivo.") });
    const nombres = { svg: "SVG", png: "PNG", md: "Markdown" };
    const r = await dialog.showSaveDialog(ventana, {
      defaultPath: path.join(carpetaActual() || app.getPath("documents"), nombreExportar(d.nombre, formato)),
      filters: [{ name: nombres[formato], extensions: [formato] }], properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (r.canceled || !r.filePath) return llamar("exportado", { ok: false });
    let destino = r.filePath;
    if (!destino.toLowerCase().endsWith("." + formato)) destino += "." + formato;
    try {
      const tmp = path.join(path.dirname(destino), `.esquema-${process.pid}-${Date.now()}`);
      fs.writeFileSync(tmp, contenido);
      fs.renameSync(tmp, destino);
      llamar("exportado", { ok: true, ruta: destino });
    } catch { llamar("exportado", { ok: false, error: t("No pude guardar el archivo.") }); }
  },
  copiar(d) {
    const x = typeof d.texto === "string" ? d.texto : "";
    const ok = !!x && x.length <= MAXIMO_EXPORTAR;
    if (ok) clipboard.writeText(x);
    llamar("copiado", { ok });
  },
  abrirEnlace(d) {
    abrirEnlace(d.url);
  },
  async catalogoPlantillas() {
    llamar("catalogoListo", await Catalogo.listar());
  },
  async descargarPlantilla(d) {
    llamar("plantillaDescargada", await Catalogo.descargar(texto(d, "id", 60)));
  },
  async buscarActualizacion() {
    const r = await Actualizaciones.revisar().catch(() => ({ hay: false, detalle: SIN_CONEXION }));
    llamar("actualizacionRevisada", { hay: r.hay, detalle: r.hay ? r.detalle : "", sinConexion: r.detalle === SIN_CONEXION });
  },
  async actualizar() {
    // La interfaz guarda todo justo antes de pedirlo: se espera a que termine. Nunca en medio de la IA escribiendo.
    await esperarGuardados(5000);
    if (guardando > 0 || Procesador.enCurso > 0) {
      return llamar("actualizacionProgreso", { paso: "error", texto: t("Espera a que termine de guardar o de responder tu IA y vuelve a intentarlo.") });
    }
    await Actualizaciones.instalar((p) => llamar("actualizacionProgreso", p));
  },
};

ipcMain.on("esquema", async (e, msg) => {
  // Solo la ventana principal, su marco principal y la interfaz propia (esquema://ui/) hablan con el puente.
  if (!ventana || ventana.isDestroyed() || e.sender !== ventana.webContents) return;
  if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame || !String(e.senderFrame.url || "").startsWith(ORIGEN)) return;
  const fn = msg && typeof msg.accion === "string" && Object.hasOwn(ACCIONES, msg.accion) && ACCIONES[msg.accion];
  if (!fn) return;
  const d = msg.datos && typeof msg.datos === "object" && !Array.isArray(msg.datos) ? msg.datos : {};
  try { await fn(d); } catch (err) { console.error("Esquema:", msg.accion, err); }
});

// ───────────────────────── Menú (equivale a Menu en EsquemaApp.swift) ─────────────────────────
/** Lo que es de Esquema lo hace la interfaz (window.Esquema.menu). Nada antes de elegir el idioma. */
function menu(accion) {
  if (!Idioma.elegido) return;
  mostrar();
  llamar("menu", { accion });
}

function armarMenu() {
  const i = (label, accion, accelerator, extra = {}) => ({ label: t(label), accelerator, click: () => menu(accion), ...extra });
  const plantilla = [
    { label: t("Archivo"), submenu: [
      i("Nuevo…", "nuevo", "CmdOrCtrl+N"),
      { label: t("Abrir carpeta…"), accelerator: "CmdOrCtrl+O", click: () => { if (Idioma.elegido) { mostrar(); elegirCarpeta(); } } },
      { label: t("Mostrar la carpeta"), click: () => { const c = carpetaActual(); if (c) shell.openPath(c); } },
      { type: "separator" },
      i("Guardar", "guardar", "CmdOrCtrl+S"),
      { type: "separator" },
      i("Ajustes…", "ajustes", "CmdOrCtrl+,"),
      { type: "separator" },
      { label: t("Salir de Esquema"), accelerator: "CmdOrCtrl+Q", click: () => salir() },
    ] },
    // Deshacer y rehacer los hace Esquema (el atajo lo atiende la interfaz; aquí no se registra para que no se haga dos veces).
    { label: t("Edición"), submenu: [
      i("Deshacer", "deshacer", "CmdOrCtrl+Z", { registerAccelerator: false }),
      i("Rehacer", "rehacer", "CmdOrCtrl+Shift+Z", { registerAccelerator: false }),
      { type: "separator" },
      { label: t("Cortar"), role: "cut" },
      { label: t("Copiar"), role: "copy" },
      { label: t("Pegar"), role: "paste" },
      { label: t("Seleccionar todo"), role: "selectAll" },
    ] },
    { label: t("Ver"), submenu: [
      i("Acercar", "acercar", "CmdOrCtrl+="),
      i("Alejar", "alejar", "CmdOrCtrl+-"),
      i("Ajustar a la ventana", "ajustar", "CmdOrCtrl+0"),
      { type: "separator" },
      i("Solo texto", "texto", "CmdOrCtrl+1"),
      i("Texto y dibujo", "ambos", "CmdOrCtrl+2"),
      i("Solo dibujo", "dibujo", "CmdOrCtrl+3"),
      { type: "separator" },
      { label: t("Pantalla completa"), role: "togglefullscreen" },
    ] },
    { label: t("Ayuda"), submenu: [
      { label: t("Sitio de Esquema"), click: () => abrirEnlace("https://esquema-app.github.io/esquema/") },
      { label: t("Código"), click: () => abrirEnlace("https://github.com/esquema-app/esquema") },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

// ───────────────────────── Protocolo esquema:// (solo los archivos de ui/) ─────────────────────────
function registrarProtocolo() {
  protocol.handle("esquema", (req) => {
    let u;
    try { u = new URL(req.url); } catch { return new Response("no", { status: 404 }); }
    if (u.host !== "ui") return new Response("no", { status: 404 });
    const raiz = path.join(recursos(app.isPackaged), "ui");
    const ruta = path.normalize(path.join(raiz, decodeURIComponent(u.pathname)));
    if (!ruta.startsWith(raiz + path.sep)) return new Response("no", { status: 404 });
    try { if (!fs.statSync(ruta).isFile()) return new Response("no", { status: 404 }); } catch { return new Response("no", { status: 404 }); }
    return net.fetch(pathToFileURL(ruta).toString());
  });
}

// ───────────────────────── Tareas y arranque ─────────────────────────
let tareasIniciadas = false;
/** Lo que corre solo (revisar actualizaciones al abrir y cada 6 horas), recién con el idioma elegido. Solo avisa si hay una nueva. */
function iniciarTareas() {
  if (tareasIniciadas) return;
  tareasIniciadas = true;
  const revisar = async () => {
    const r = await Actualizaciones.revisar().catch(() => ({ hay: false }));
    if (r.hay) llamar("actualizacionRevisada", { hay: true, detalle: r.detalle, sinConexion: false });
  };
  setTimeout(revisar, 15000);
  setInterval(revisar, 6 * 3600 * 1000);
}

app.on("second-instance", () => mostrar());
app.on("window-all-closed", () => app.quit());
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
});

app.whenReady().then(() => {
  prepararDatos();
  Idioma.sistema = app.getLocale();
  registrarProtocolo();
  // La interfaz no necesita ningún permiso del navegador (cámara, ubicación, notificaciones…): todo se niega.
  session.defaultSession.setPermissionRequestHandler((_wc, _permiso, ok) => ok(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  armarMenu();
  crearVentana();
  if (Idioma.elegido) iniciarTareas();
});

// Pruebas automáticas (escritorio/pruebas/arranque.mjs): acceso al estado y a las acciones desde Playwright.
if (process.env.ESQUEMA_PRUEBAS === "1") global.esquemaPruebas = { ACCIONES, vigilante, Config, Idioma, menu, enviarEstado, ventana: () => ventana };
