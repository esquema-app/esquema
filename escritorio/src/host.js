// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Pieza «host-escritorio» (Windows y Linux, Electron): la app nativa genérica. Una ventana con la interfaz de ui/ servida por
// <id>://ui/…, el puente con la interfaz (host.enviar ↔ window.<App>.*) y los scripts de bin/ con el Python portátil.
// Equivale a la pieza «host-mac» (Swift). Nada de una app adentro: todo sale de app.json y de los parámetros.
//
//   const electron = require("electron");
//   const { crearHost } = require("./host");
//   const host = crearHost({ electron, ventana: { ancho: 1280, alto: 800 }, sitio: "https://ana-app.github.io/ana/" });
//   host.acciones.registrar("grabar", async (datos) => { … host.llamar("grabando", { ok: true }); });
//   host.iniciar();
//
// Seguridad (igual o mejor que la mejor app de la familia):
//   · la ventana: sandbox, contextIsolation, sin nodeIntegration ni webview; solo navega dentro de <id>://ui/ (https → navegador);
//   · el puente solo atiende el marco principal de la ventana propia con origen <id>://ui/;
//   · las acciones declaradas (acciones.json) validan los datos por sus reglas, lo de la persona va por archivo de entrada y todo
//     tiene límite de tiempo; los scripts no heredan variables <ID>_*;
//   · todo permiso del navegador se niega (la app puede permitir alguno con `permisos`);
//   · el protocolo sirve solo archivos de ui/ y, si la app lo pide, los que su resolvedor de medios aprueba.
"use strict";
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { Readable } = require("stream");
const E = require("./enchufe");
const { crearProcesador, crearFila } = require("./procesador");

const ES_WIN = process.platform === "win32";
const TEMAS = { sistema: "system", claro: "light", oscuro: "dark" };
const TEXTOS = {
  datos: "No entendí lo que pediste. Intenta de nuevo.",
  falta: "Falta algo para hacer esto.",
};
const TIPOS_MEDIOS = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4a": "audio/mp4", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
const TROZO = 4 << 20;

function crearHost(op = {}) {
  const electron = op.electron || require("electron");
  const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeTheme, net, protocol, session, shell } = electron;

  const RECURSOS = op.recursos || (app.isPackaged ? recursosEmpaquetados(process.resourcesPath) : path.resolve(__dirname, "..", ".."));
  const a = E.leerApp(RECURSOS);
  const id = a.id;
  const nombre = a.nombre;
  const ORIGEN = `${id}://ui/`;
  const GLOBAL = op.global === undefined ? globalDe(id) : String(op.global);
  if (!/^[A-Z][A-Za-z0-9]{0,40}$/.test(GLOBAL)) throw new Error("«global» es el nombre del objeto window.<App> (ej. «Ana»).");
  const propia = E.esObjeto(a.datos);
  const DATOS = op.datos || E.carpetaDatos(a);
  const preparar = () => E.prepararCarpeta(DATOS, { propia });
  const config = E.crearConfig({ ruta: path.join(DATOS, "config.json"), reglas: a.config, preparar });
  const idioma = E.crearIdioma({ config, recursos: RECURSOS, elegidoDe: op.idiomaElegido || null });
  const t = (x) => idioma.t(x);
  const procesador = crearProcesador({ python: op.python || pythonDe(RECURSOS, app.isPackaged), recursos: RECURSOS, id, datos: DATOS, t,
    lectorProgreso: op.lectorProgreso || null });
  const fila = crearFila();
  const { acciones: declaradas, errores } = E.cargarAcciones(RECURSOS);
  for (const e of errores) console.error(`${nombre}: ${e}`);
  const registradas = new Map();
  const internas = new Map();
  const medios = new Map();
  const inyectores = { idiomaUI: () => idioma.codigo, carpetaDatos: () => DATOS, ...(op.inyectar || {}) };
  const ventanaOp = { ancho: 1280, alto: 800, minAncho: 720, minAlto: 520, alCerrar: "salir", fondo: { claro: "#f7f7f5", oscuro: "#1c1c1e" }, ...(op.ventana || {}) };
  let ventana = null, lista = false, saliendo = false, tareas = false, ocupadas = 0;

  // Antes de que Electron esté listo: el protocolo propio <id>://.
  protocol.registerSchemesAsPrivileged([{ scheme: id, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

  // ───────────── Hacia la interfaz ─────────────
  function llamar(funcion, d = {}) {
    if (!E.FUNCION.test(String(funcion)) || !ventana || ventana.isDestroyed() || !lista) return false;
    let json;
    try { json = JSON.stringify(d === undefined ? null : d); } catch { return false; }
    ventana.webContents.executeJavaScript(`window.${GLOBAL} && typeof window.${GLOBAL}.${funcion} === "function" && window.${GLOBAL}.${funcion}(${json})`).catch(() => {});
    return true;
  }

  // ───────────── Acciones ─────────────
  /** Una acción declarada: validar → inyectar → (fila) → script con límite → eco → responder → después. */
  async function correrDeclarada(nombreAccion, def, datos) {
    const v = E.validarDatos(def, datos);
    const eco = (entrada) => Object.fromEntries((def.eco || []).filter((k) => entrada && Object.hasOwn(entrada, k)).map((k) => [k, entrada[k]]));
    const responder = (r, entrada) => { if (def.responde) llamar(def.responde, { ...r, ...eco(entrada) }); return r; };
    if (!v.ok) return responder({ ok: false, codigo: "datos", campo: v.campo, texto: TEXTOS.datos, valores: {}, error: t(TEXTOS.datos) }, {});
    const entrada = v.entrada;
    for (const [campo, fuente] of Object.entries(def.inyectar || {})) {
      const f = inyectores[fuente];
      const valor = typeof f === "function" ? await f(entrada) : undefined;
      if (valor === undefined || valor === null) return responder({ ok: false, codigo: "falta", campo, texto: TEXTOS.falta, valores: {}, error: t(TEXTOS.falta) }, entrada);
      entrada[campo] = valor;
    }
    const opciones = { limite: def.limite };
    if (def.progreso) opciones.progreso = (eventos) => llamar(def.progreso, { eventos });
    const tarea = async () => {
      const args = E.armarArgs(def, entrada);
      const r = def.entrada === "archivo" ? await procesador.conEntrada(def.script, args, entrada, opciones) : await procesador.correrJSON(def.script, args, opciones);
      responder(r, entrada);
      for (const x of def.despues || []) if (x !== nombreAccion) await despachar(x, {});
      return r;
    };
    return def.cola === "escritura" ? fila.agregar(tarea) : tarea();
  }

  /** Primero lo que registró la app (así puede reemplazar una acción de a poco), después lo que trae el host y al final lo declarado. */
  async function despachar(accion, datos) {
    if (!E.ACCION.test(String(accion))) return undefined;
    const d = E.esObjeto(datos) ? datos : {};
    if (registradas.has(accion)) return registradas.get(accion)(d, host);
    if (internas.has(accion)) return internas.get(accion)(d);
    if (Object.hasOwn(declaradas, accion)) return correrDeclarada(accion, declaradas[accion], d);
    return undefined;
  }

  /** El puente: solo la ventana propia, su marco principal y la interfaz de <id>://ui/. Todo lo demás se ignora. */
  async function alMensaje(e, msg) {
    if (!ventana || ventana.isDestroyed() || !e || e.sender !== ventana.webContents) return;
    if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame || !String(e.senderFrame.url || "").startsWith(ORIGEN)) return;
    if (!E.esObjeto(msg) || typeof msg.accion !== "string" || !E.ACCION.test(msg.accion)) return;
    try { await despachar(msg.accion, E.esObjeto(msg.datos) ? msg.datos : {}); } catch (err) { console.error(`${nombre}:`, msg.accion, err); }
  }

  // ───────────── Lo que trae el host (capacidades comunes) ─────────────
  async function estado() {
    let base = {};
    const script = op.estadoScript === undefined ? "estado.py" : op.estadoScript;
    if (script && fs.existsSync(path.join(RECURSOS, "bin", script))) {
      base = await procesador.correrJSON(script, [], { limite: op.limiteEstado || 60 });
      delete base.ok; delete base.error;
    }
    Object.assign(base, { version: app.getVersion(), idioma: idioma.codigo, plataforma: ES_WIN ? "windows" : "linux" });
    if (!base.config) base.config = config.leer();
    if (op.actualizaciones) base.actualizacion = op.actualizaciones.disponible || null;
    return op.estado ? op.estado(base, host) : base;
  }
  async function enviarEstado() { if (lista) llamar("estado", await estado()); }

  internas.set("listo", async () => { lista = true; await enviarEstado(); });
  internas.set("config", async (d) => {
    const antes = config.leer();
    config.guardar(d);
    const ahora = config.leer();
    if (antes.idioma_ui !== ahora.idioma_ui) { idioma.olvidar(); armarMenu(); }
    if (antes.tema !== ahora.tema) aplicarTema();
    if (op.alCambiarConfig) await op.alCambiarConfig(ahora, antes, host);
    if (idioma.elegido) iniciarTareas();
  });
  internas.set("abrirEnlace", (d) => { abrirEnlace(d.url); });
  internas.set("copiar", (d) => llamar("copiado", { ok: copiar(d.texto) }));
  if (op.actualizaciones) {
    const act = op.actualizaciones;
    internas.set("buscarActualizacion", async () => llamar("actualizacionRevisada", await act.revisar().catch(() => ({ hay: false, sinConexion: true }))));
    internas.set("actualizar", async () => {
      // La interfaz guarda todo justo antes de pedirlo: se espera. Nunca en medio de un guardado o de un script.
      await esperarLibre(5000);
      if (ocupada()) return llamar("actualizacionProgreso", { paso: "error", codigo: "ocupada", texto: "Espera a que termine lo que está haciendo y vuelve a intentarlo.", valores: {}, total: 3 });
      await act.instalar((p) => llamar("actualizacionProgreso", p));
    });
  }

  function abrirEnlace(url) {
    try { const u = new URL(String(url || "")); if (u.protocol === "https:" && u.hostname && !u.username && !u.password) shell.openExternal(u.toString()); } catch {}
  }
  function copiar(texto) {
    const ok = typeof texto === "string" && !!texto && texto.length <= 50 * 1024 * 1024;
    if (ok) clipboard.writeText(texto);
    return ok;
  }
  /** Algo se cortaría si la app se cierra: un guardado en la fila, un script corriendo o algo que la app marcó (ocupar/soltar). */
  const ocupada = () => fila.pendientes > 0 || procesador.enCurso > 0 || ocupadas > 0;
  async function esperarLibre(ms) {
    const limite = Date.now() + ms;
    await new Promise((r) => setTimeout(r, 300));
    while ((fila.pendientes > 0 || ocupadas > 0) && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
  }

  // ───────────── Diálogos del sistema (para las acciones propias de la app) ─────────────
  const dialogos = {
    /** Una carpeta (ruta real) o null. */
    async carpeta({ titulo, boton, desde } = {}) {
      const r = await dialog.showOpenDialog(ventana || undefined, { title: titulo, buttonLabel: boton, defaultPath: desde || undefined, properties: ["openDirectory", "createDirectory"] });
      if (r.canceled || !r.filePaths[0]) return null;
      try { return fs.realpathSync(r.filePaths[0]); } catch { return null; }
    },
    /** Archivos (rutas reales) o []. `extensiones`: ["md", "txt"]. */
    async archivos({ titulo, boton, extensiones, varios = false, nombreFiltro } = {}) {
      const filters = Array.isArray(extensiones) && extensiones.length ? [{ name: nombreFiltro || extensiones.join(", "), extensions: extensiones }] : undefined;
      const r = await dialog.showOpenDialog(ventana || undefined, { title: titulo, buttonLabel: boton, filters, properties: ["openFile", ...(varios ? ["multiSelections"] : [])] });
      if (r.canceled) return [];
      return r.filePaths.map((x) => { try { return fs.realpathSync(x); } catch { return null; } }).filter(Boolean);
    },
    /** «Guardar como»: escribe `contenido` (Buffer o texto) de una vez donde la persona elija. Devuelve la ruta o null. */
    async guardarComo({ nombre: sugerido = nombre, extension, contenido, desde, maximo = 50 * 1024 * 1024 } = {}) {
      const ext = String(extension || "").replace(/[^\w]/g, "").slice(0, 10);
      const datos = Buffer.isBuffer(contenido) ? contenido : typeof contenido === "string" ? Buffer.from(contenido, "utf8") : null;
      if (!ext || !datos || !datos.length || datos.length > maximo) return null;
      const r = await dialog.showSaveDialog(ventana || undefined, {
        defaultPath: path.join(desde || app.getPath("documents"), nombreArchivo(sugerido, ext)),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }], properties: ["createDirectory", "showOverwriteConfirmation"],
      });
      if (r.canceled || !r.filePath) return null;
      let destino = r.filePath;
      if (!destino.toLowerCase().endsWith("." + ext.toLowerCase())) destino += "." + ext;
      E.escribirAtomico(destino, datos, 0o644);
      return destino;
    },
  };
  /** A la Papelera del sistema (se puede recuperar). Solo rutas que la app ya revisó (host.dentro). */
  async function papelera(absoluta) {
    if (typeof absoluta !== "string" || !path.isAbsolute(absoluta)) return false;
    try { await shell.trashItem(absoluta); return true; } catch { return false; }
  }

  // ───────────── Ventana ─────────────
  function crearVentana() {
    let g = {};
    try { g = JSON.parse(fs.readFileSync(path.join(DATOS, "ventana.json"), "utf8")) || {}; } catch {}
    const num = (x) => (Number.isFinite(x) ? Math.round(x) : undefined);
    lista = false;
    ventana = new BrowserWindow({
      width: num(g.width) || ventanaOp.ancho, height: num(g.height) || ventanaOp.alto, x: num(g.x), y: num(g.y),
      minWidth: ventanaOp.minAncho, minHeight: ventanaOp.minAlto, show: false, title: nombre,
      icon: ventanaOp.icono || undefined, backgroundColor: fondo(),
      webPreferences: {
        preload: op.preload || path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false,
        webviewTag: false, spellcheck: false, additionalArguments: [`--pieza-host=${id}`],
      },
    });
    ventana.loadURL(ORIGEN + "index.html");
    ventana.once("ready-to-show", () => ventana && ventana.show());
    ventana.on("close", (e) => {
      try { preparar(); E.escribirAtomico(path.join(DATOS, "ventana.json"), JSON.stringify(ventana.getNormalBounds())); } catch {}
      if (saliendo) return;
      if (ventanaOp.alCerrar === "esconder") { e.preventDefault(); ventana.hide(); llamar("menu", { accion: "guardar" }); return; }
      if (ventanaOp.alCerrar === "salir") { e.preventDefault(); salir(); }
    });
    ventana.on("closed", () => { ventana = null; lista = false; });
    const wc = ventana.webContents;
    // La ventana nunca navega fuera de ui/ ni abre otras ventanas: un enlace https se abre en el navegador.
    wc.setWindowOpenHandler(({ url }) => { abrirEnlace(url); return { action: "deny" }; });
    wc.on("will-navigate", (e, url) => { if (!String(url).startsWith(ORIGEN)) { e.preventDefault(); abrirEnlace(url); } });
    wc.on("will-redirect", (e, url) => { if (!String(url).startsWith(ORIGEN)) e.preventDefault(); });
    wc.on("will-attach-webview", (e) => e.preventDefault());
    // Si el proceso de la página se cae, se vuelve a cargar la interfaz (lo guardado está en el disco).
    wc.on("render-process-gone", () => { lista = false; if (ventana && !ventana.isDestroyed()) ventana.loadURL(ORIGEN + "index.html"); });
    if (op.alCrearVentana) op.alCrearVentana(ventana, host);
    return ventana;
  }
  function mostrar() {
    if (!ventana || ventana.isDestroyed()) return crearVentana();
    if (ventana.isMinimized()) ventana.restore();
    ventana.show(); ventana.focus();
    return ventana;
  }
  const fondo = () => (nativeTheme.shouldUseDarkColors ? ventanaOp.fondo.oscuro : ventanaOp.fondo.claro);
  /** La barra de título, los menús y el fondo mientras carga siguen la apariencia elegida (pieza «tema»: config.tema). */
  function aplicarTema() {
    const v = config.leer().tema;
    nativeTheme.themeSource = TEMAS[v] || "system";
    if (ventana && !ventana.isDestroyed()) ventana.setBackgroundColor(fondo());
  }

  async function salir() {
    if (saliendo) return;
    saliendo = true;
    if (op.guardarAlSalir !== false) llamar("menu", { accion: "guardar" });
    await esperarLibre(3000);
    try { if (op.antesDeSalir) await op.antesDeSalir(host); } catch (e) { console.error(`${nombre}:`, e); }
    app.exit(0);
  }

  // ───────────── Menú ─────────────
  /** Un ítem que la interfaz atiende (window.<App>.menu({accion})). Nada antes de elegir el idioma. */
  function item(label, accion, accelerator, extra = {}) {
    return { label: t(label), accelerator, click: () => { if (!idioma.elegido) return; mostrar(); llamar("menu", { accion }); }, ...extra };
  }
  function menuBase() {
    const ayuda = [];
    if (op.sitio) ayuda.push({ label: idioma.f("Sitio de {app}", { app: nombre }), click: () => abrirEnlace(op.sitio) });
    if (op.codigo) ayuda.push({ label: t("Código"), click: () => abrirEnlace(op.codigo) });
    return [
      { label: t("Archivo"), submenu: [item("Ajustes…", "ajustes", "CmdOrCtrl+,"), { type: "separator" },
        { label: idioma.f("Salir de {app}", { app: nombre }), accelerator: "CmdOrCtrl+Q", click: () => salir() }] },
      { label: t("Edición"), submenu: [{ label: t("Deshacer"), role: "undo" }, { label: t("Rehacer"), role: "redo" }, { type: "separator" },
        { label: t("Cortar"), role: "cut" }, { label: t("Copiar"), role: "copy" }, { label: t("Pegar"), role: "paste" }, { label: t("Seleccionar todo"), role: "selectAll" }] },
      { label: t("Ver"), submenu: [{ label: t("Pantalla completa"), role: "togglefullscreen" }] },
      ...(ayuda.length ? [{ label: t("Ayuda"), submenu: ayuda }] : []),
    ];
  }
  function armarMenu() {
    const plantilla = op.menu ? op.menu({ t, f: idioma.f, item, salir, abrirEnlace, base: menuBase, host }) : menuBase();
    Menu.setApplicationMenu(plantilla ? Menu.buildFromTemplate(plantilla) : null);
  }

  // ───────────── Protocolo <id>:// (ui/ y, si la app lo pide, sus medios) ─────────────
  function servirUI(u) {
    const raiz = path.join(RECURSOS, "ui");
    let rel;
    try { rel = decodeURIComponent(u.pathname); } catch { return no(); }
    if (rel.includes("\0")) return no();
    const ruta = path.normalize(path.join(raiz, rel));
    if (!ruta.startsWith(raiz + path.sep)) return no();
    try { if (!fs.statSync(ruta).isFile() || !fs.realpathSync(ruta).startsWith(fs.realpathSync(raiz) + path.sep)) return no(); } catch { return no(); }
    return net.fetch(pathToFileURL(ruta).toString());
  }
  async function manejarProtocolo(req) {
    let u;
    try { u = new URL(req.url); } catch { return no(); }
    if (u.search || u.username || u.password) return no();
    if (u.host === "ui") return servirUI(u);
    const resolver = medios.get(u.host);
    if (!resolver) return no();
    let rel;
    try { rel = decodeURIComponent(u.pathname.replace(/^\//, "")); } catch { return no(); }
    const archivo = rel.includes("\0") ? null : await resolver(rel, req);
    return typeof archivo === "string" && path.isAbsolute(archivo) ? servirArchivo(req, archivo) : no();
  }

  function registrarSesion() {
    protocol.handle(id, manejarProtocolo);
    // La interfaz no necesita ningún permiso del navegador: todo se niega, salvo lo que la app permita (la cámara de una app que graba…).
    const permitir = typeof op.permisos === "function" ? op.permisos : () => false;
    session.defaultSession.setPermissionRequestHandler((wc, permiso, ok, detalles) => ok(esPropia(wc) && permitir(permiso, detalles) === true));
    session.defaultSession.setPermissionCheckHandler((wc, permiso, origen, detalles) => esPropia(wc) && permitir(permiso, detalles) === true);
  }
  const esPropia = (wc) => { try { return !!wc && String(wc.getURL()).startsWith(`${id}://`); } catch { return false; } };

  function iniciarTareas() {
    if (tareas) return;
    tareas = true;
    if (op.actualizaciones) setTimeout(() => op.actualizaciones.revisarCadaRato((r) => llamar("actualizacionRevisada", r)), 15000);
    if (op.tareas) op.tareas(host);
  }

  // ───────────── Arranque ─────────────
  function iniciar() {
    if (!op.variasInstancias && !app.requestSingleInstanceLock()) { app.quit(); return false; }
    if (ES_WIN && op.appUserModelId) app.setAppUserModelId(op.appUserModelId);
    app.setName(nombre);
    // Lo que Chromium guarda (caché, preferencias del navegador) va en una subcarpeta de los datos, no junto a config.json.
    app.setPath("userData", path.join(DATOS, "electron"));
    ipcMain.on(id, alMensaje);
    app.on("second-instance", () => mostrar());
    app.on("window-all-closed", () => { if (ventanaOp.alCerrar !== "esconder") app.quit(); });
    app.on("web-contents-created", (_e, wc) => {
      wc.on("will-attach-webview", (e) => e.preventDefault());
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
    });
    app.whenReady().then(() => {
      preparar();
      idioma.sistema = app.getLocale();
      registrarSesion();
      aplicarTema();
      armarMenu();
      crearVentana();
      if (idioma.elegido) iniciarTareas();
    });
    return true;
  }

  const host = {
    id, nombre, app: a, datos: DATOS, recursos: RECURSOS, ORIGEN, config, idioma, t, procesador, fila, dialogos,
    acciones: {
      /** Una acción propia de la app (grabar la pantalla, un lienzo…). Gana sobre lo que trae el host y lo declarado. */
      registrar(nombreAccion, fn) {
        if (!E.ACCION.test(String(nombreAccion)) || typeof fn !== "function") throw new Error(`acción rara: ${nombreAccion}`);
        registradas.set(nombreAccion, fn);
      },
      declaradas: () => Object.keys(declaradas),
      todas: () => [...new Set([...registradas.keys(), ...internas.keys(), ...Object.keys(declaradas)])],
      errores,
    },
    medios: {
      /** <id>://<nombre>/<ruta>: `resolver(ruta, req)` devuelve la ruta absoluta que se puede servir (con rangos) o null. */
      registrar(nombreHost, resolver) {
        if (!/^[a-z][a-z0-9-]{0,30}$/.test(nombreHost) || nombreHost === "ui" || typeof resolver !== "function") throw new Error("medios: nombre raro");
        medios.set(nombreHost, resolver);
      },
    },
    inyectores,
    llamar, despachar, alMensaje, enviarEstado, estado, mostrar, salir, iniciar, iniciarTareas, aplicarTema, armarMenu, abrirEnlace, copiar, papelera,
    dentro: E.dentro,
    ocupar() { ocupadas++; }, soltar() { ocupadas = Math.max(0, ocupadas - 1); }, ocupada,
    ventana: () => ventana,
    get lista() { return lista; },
  };
  return host;
}

function no() { return new Response("no", { status: 404 }); }

/** Un archivo con rangos (para adelantar un video) en trozos de 4 MB como mucho. */
function servirArchivo(req, archivo) {
  let total;
  try { const s = fs.statSync(archivo); if (!s.isFile()) return no(); total = s.size; } catch { return no(); }
  const tipo = TIPOS_MEDIOS[path.extname(archivo).toLowerCase()] || "application/octet-stream";
  let desde = 0, hasta = total - 1, conRango = false;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.get("range") || ""));
  if (m) {
    conRango = true;
    if (m[1] === "") desde = Math.max(0, total - (parseInt(m[2], 10) || 0));
    else { desde = parseInt(m[1], 10); if (m[2] !== "") hasta = Math.min(parseInt(m[2], 10), total - 1); }
  }
  if (total === 0 || desde > hasta || desde >= total) {
    return new Response(null, { status: total === 0 ? 200 : 416, headers: { "Content-Type": tipo, "Content-Range": `bytes */${total}` } });
  }
  hasta = Math.min(hasta, desde + TROZO - 1);
  const parcial = conRango || hasta - desde + 1 < total;
  const cabeceras = { "Content-Type": tipo, "Content-Length": String(hasta - desde + 1), "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (parcial) cabeceras["Content-Range"] = `bytes ${desde}-${hasta}/${total}`;
  return new Response(Readable.toWeb(fs.createReadStream(archivo, { start: desde, end: hasta })), { status: parcial ? 206 : 200, headers: cabeceras });
}

/** Python portátil que viene con la app; en desarrollo (sin escritorio/vendor/), el del sistema. */
function pythonDe(recursos, empaquetada) {
  const vendor = ES_WIN ? "win" : "linux";
  const dentro = empaquetada ? path.join(process.resourcesPath, "python") : path.join(recursos, "escritorio", "vendor", vendor, "python");
  const r = ES_WIN ? path.join(dentro, "python.exe") : path.join(dentro, "bin", "python3");
  return fs.existsSync(r) ? r : ES_WIN ? "python" : "python3";
}

/** Empaquetada, el código va en resources/<id>/ (extraResources de package.json): la carpeta cuyo app.json dice ese mismo id. */
function recursosEmpaquetados(base) {
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory() || !E.ID.test(d.name)) continue;
    const j = E.leerJSON(path.join(base, d.name, "app.json"), null, 1024 * 1024);
    if (j && j.id === d.name) return path.join(base, d.name);
  }
  throw new Error("No encontré app.json dentro de la app (resources/<id>/app.json).");
}

/** «ana» → «Ana» (el objeto window.<App> de la pieza «host-ui»). */
function globalDe(id) { return id[0].toUpperCase() + id.slice(1); }

/** Solo el nombre (sin carpetas), con la extensión. */
function nombreArchivo(valor, ext) {
  let n = String(valor || "archivo").replace(/[\\/:*?"<>|\0]/g, "-").trim().slice(0, 120);
  if (!n || n.startsWith(".")) n = "archivo" + n;
  if (!n.toLowerCase().endsWith("." + ext.toLowerCase())) n += "." + ext;
  return n;
}

module.exports = { crearHost, servirArchivo, nombreArchivo, globalDe, TEXTOS };
