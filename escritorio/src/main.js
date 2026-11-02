// Esquema para Windows y Linux, sobre la pieza «host-escritorio» (src/host.js): la ventana con sandbox, el protocolo esquema://ui/,
// el puente con sus guardas, config e idioma desde app.json, menú, apariencia, actualizaciones y las acciones declaradas en
// acciones.json (proyecto, dibujar, crearReadme, estructura, abrirArchivo, guardarArchivo, probarIA: solo corren un script), la
// carpeta de la persona (carpeta: config.carpeta) y su vigilante (vigilar: src/vigilante.js de la pieza). Aquí queda lo propio de
// Esquema: elegir la carpeta o un proyecto reciente, volver a listar cuando cambia, la Papelera, exportar, el catálogo de
// plantillas y el menú. Equivale a app/Sources/Esquema (Mac). El contrato está en pruebas/puente.json y lo revisa pruebas/contrato.py.
"use strict";
const fs = require("fs");
const path = require("path");
const electron = require("electron");
const { crearHost } = require("./host");
const { leerJSON } = require("./enchufe");
const { lectorProgreso } = require("./progreso");
const { crear: crearActualizaciones } = require("./actualizaciones");
const { crear: crearCatalogo } = require("./catalogo");

const { app, net } = electron;
const SITIO = "https://esquema-app.github.io/esquema/";
const CODIGO = "https://github.com/esquema-app/esquema";
const MAXIMO_EXPORTAR = 50 * 1024 * 1024;
/** Esquema solo abre, guarda, vigila y borra documentos y diagramas. */
const EXTENSIONES = [".md", ".mmd"];

/** La carpeta elegida, si todavía existe (config.carpeta: la escribe solo el host, con el selector del sistema o un reciente). */
const carpetaActual = () => host.carpeta.actual();
/** La ruta relativa que manda la interfaz, revisada igual que comun.ruta_en (bin/ la vuelve a revisar), o null. */
const absoluta = (ruta, base) => host.dentro(base, ruta, { extensiones: EXTENSIONES });
/** Las rutas del último listado: si cambian (archivo nuevo, borrado o renombrado), la interfaz recibe `archivos`. */
let lista = null;
const recordar = (archivos) => { lista = (archivos || []).map((a) => a.ruta); };

const host = crearHost({
  electron,
  ventana: { ancho: 1280, alto: 800, icono: path.join(__dirname, "..", "iconos", "esquema-256.png"), fondo: { claro: "#f7f7f5", oscuro: "#1c1c1e" } },
  sitio: SITIO, codigo: CODIGO, appUserModelId: "app.esquema.escritorio",
  // Versiones nuevas: pieza «actualizaciones». Solo de los Releases de este repo, con su .sha256; el host atiende
  // buscarActualizacion/actualizar (nunca con un guardado o un script en curso) y revisa cada 6 h con el idioma elegido.
  actualizaciones: crearActualizaciones({ app, net, repo: "esquema-app/esquema", nombre: "Esquema" }),
  lectorProgreso,
  // La carpeta de la persona (config.carpeta, "interfaz": false en app.json) y su vigilante: si un archivo abierto cambia en el
  // disco (VS Code, git pull…), la interfaz recibe archivoCambiado; lo que Esquema lee o guarda (abrirArchivo/guardarArchivo, con
  // «vigilar») no se avisa. Si cambia la lista de .md/.mmd, `archivos`.
  carpeta: { clave: "carpeta" },
  vigilar: { extensiones: EXTENSIONES, alCambiar: (base) => relistar(base) },
  // `carpeta` de las acciones declaradas: siempre la actual, nunca la de la interfaz. Sin carpeta abierta, "" (bin/proyecto.py
  // decide: crear un proyecto Libro no la necesita; lo demás, y bin/carpeta.py, responden «Elige una carpeta primero»).
  inyectar: { carpetaActual: () => carpetaActual() || "" },
  estado: async (base) => {
    const e = { ...base, carpeta: null, archivos: [] };
    const c = carpetaActual();
    if (c) {
      const r = await host.procesador.correrJSON("carpeta.py", ["listar", c]);
      if (r.ok) { e.carpeta = r.carpeta; e.archivos = r.archivos || []; recordar(e.archivos); host.vigilante.empezar(c); }
    } else host.vigilante.detener();
    return e;
  },
  menu: ({ t, item, salir, abrirEnlace }) => [
    { label: t("Archivo"), submenu: [
      item("Nuevo…", "nuevo", "CmdOrCtrl+N"),
      { label: t("Abrir carpeta…"), accelerator: "CmdOrCtrl+O", click: () => { if (host.idioma.elegido) { host.mostrar(); elegirCarpeta(); } } },
      { label: t("Mostrar la carpeta"), click: () => { const c = carpetaActual(); if (c) host.mostrarEnCarpeta(c); } },
      { type: "separator" },
      item("Guardar", "guardar", "CmdOrCtrl+S"),
      { type: "separator" },
      item("Ajustes…", "ajustes", "CmdOrCtrl+,"),
      { type: "separator" },
      { label: t("Salir de Esquema"), accelerator: "CmdOrCtrl+Q", click: () => salir() },
    ] },
    // Deshacer y rehacer los hace Esquema (el atajo lo atiende la interfaz; aquí no se registra para que no se haga dos veces).
    { label: t("Edición"), submenu: [
      item("Deshacer", "deshacer", "CmdOrCtrl+Z", { registerAccelerator: false }),
      item("Rehacer", "rehacer", "CmdOrCtrl+Shift+Z", { registerAccelerator: false }),
      { type: "separator" },
      { label: t("Cortar"), role: "cut" },
      { label: t("Copiar"), role: "copy" },
      { label: t("Pegar"), role: "paste" },
      { label: t("Seleccionar todo"), role: "selectAll" },
    ] },
    { label: t("Ver"), submenu: [
      item("Acercar", "acercar", "CmdOrCtrl+="),
      item("Alejar", "alejar", "CmdOrCtrl+-"),
      item("Ajustar a la ventana", "ajustar", "CmdOrCtrl+0"),
      { type: "separator" },
      item("Solo texto", "texto", "CmdOrCtrl+1"),
      item("Texto y dibujo", "ambos", "CmdOrCtrl+2"),
      item("Solo dibujo", "dibujo", "CmdOrCtrl+3"),
      { type: "separator" },
      { label: t("Pantalla completa"), role: "togglefullscreen" },
    ] },
    { label: t("Ayuda"), submenu: [
      { label: t("Sitio de Esquema"), click: () => abrirEnlace(SITIO) },
      { label: t("Código"), click: () => abrirEnlace(CODIGO) },
    ] },
  ],
});
const t = host.t;
const llamar = host.llamar;

/** Algo cambió en la carpeta vigilada: se vuelve a listar y, si la lista cambió, la interfaz recibe `archivos`. */
async function relistar(base) {
  const r = await host.procesador.correrJSON("carpeta.py", ["listar", base]);
  if (!r || !r.ok || host.vigilante.base !== base) return;
  const rutas = (r.archivos || []).map((a) => a.ruta);
  if (lista && rutas.length === lista.length && rutas.every((x, i) => x === lista[i])) return;
  lista = rutas;
  llamar("archivos", { archivos: r.archivos || [] });
}

// Plantillas de la comunidad: pieza «catálogo» (src/catalogo.js). Repo y tipos salen de app.json (solo de
// raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con SHA-256); los errores traen `frase` para traducir.
const Catalogo = crearCatalogo({ fetch: (u, o) => net.fetch(u, o), procesador: host.procesador,
  appJson: leerJSON(path.join(host.recursos, "app.json"), {}), agente: `Esquema/${app.getVersion()}` });

/** Deja `c` como la carpeta (el host la guarda y mueve el vigilante), la lista y responde carpetaElegida (con proyecto: true si
 *  viene de un proyecto). `c` es una ruta que eligió la persona o que la app leyó de proyectos.json, nunca de la interfaz. */
async function usarCarpeta(c, proyecto) {
  const real = host.carpeta.usar(c);
  if (!real) return llamar("carpetaElegida", { ok: false, error: t("No pude abrir esa carpeta.") });
  const l = await host.procesador.correrJSON("carpeta.py", ["listar", real]);
  if (!l.ok) return llamar("carpetaElegida", { ok: false, error: t(l.error || "No pude abrir esa carpeta.") });
  recordar(l.archivos);
  llamar("carpetaElegida", { ok: true, carpeta: l.carpeta, archivos: l.archivos || [], ...(proyecto ? { proyecto: true } : {}) });
}

async function elegirCarpeta(proyecto = false) {
  const c = await host.dialogos.carpeta({
    titulo: t("Elige la carpeta con tus documentos y diagramas (la de tu proyecto, por ejemplo). Esquema no los mueve ni los copia."),
    boton: t("Usar esta carpeta"), desde: carpetaActual(),
  });
  if (!c) return llamar("carpetaElegida", { ok: false });
  await usarCarpeta(c, proyecto);
}

// ───────────── Lo propio de Esquema (lo demás lo atiende el host o está declarado en acciones.json: abrirArchivo y guardarArchivo
// con «vigilar», así un guardado propio no se avisa como un cambio de afuera) ─────────────
const A = host.acciones;

A.registrar("elegirCarpeta", (d) => elegirCarpeta(d.proyecto === true));

/** Un proyecto reciente: la ruta sale de <carpeta de Esquema>/proyectos.json (lo escribe bin/proyecto.py), nunca de la interfaz. */
A.registrar("abrirProyecto", async (d) => {
  const j = leerJSON(path.join(host.datos, "proyectos.json"), {}) || {};
  const lista = (Array.isArray(j.recientes) ? j.recientes : []).filter((p) => p && typeof p.ruta === "string" && path.isAbsolute(p.ruta) && typeof p.nombre === "string").slice(0, 30);
  const p = Number.isInteger(d.indice) && d.indice >= 0 && d.indice < lista.length ? lista[d.indice] : null;
  let c = null;
  try { if (p && fs.statSync(p.ruta).isDirectory()) c = fs.realpathSync(p.ruta); } catch {}
  if (!c) return llamar("carpetaElegida", { ok: false, error: t("No encontré ese proyecto. ¿Lo moviste?") });
  await usarCarpeta(c, true);
});

/** Un .md/.mmd de la carpeta abierta (que no es documentación de Esquema) a la Papelera del sistema, donde se puede recuperar. */
A.registrar("papelera", async (d) => {
  const ruta = typeof d.ruta === "string" ? d.ruta : "";
  const base = carpetaActual();
  const abs = base && absoluta(ruta, base);
  if (!abs) return llamar("enPapelera", { ok: false, ruta, error: t("Ese archivo no se puede borrar.") });
  if (await host.papelera(abs)) { host.vigilante.olvidar(ruta); llamar("enPapelera", { ok: true, ruta }); }
  else llamar("enPapelera", { ok: false, ruta, error: t("No pude mandarlo a la Papelera.") });
});

/** «Guardar como» del sistema: SVG o Markdown (texto) o PNG (base64), donde la persona elija. */
A.registrar("exportar", async (d) => {
  const formato = ["svg", "png", "md"].includes(d.formato) ? d.formato : "";
  if (!formato) return llamar("exportado", { ok: false });
  const contenido = formato === "png" ? (typeof d.base64 === "string" ? Buffer.from(d.base64, "base64") : null) : typeof d.texto === "string" ? Buffer.from(d.texto, "utf8") : null;
  if (!contenido || !contenido.length || contenido.length > MAXIMO_EXPORTAR) return llamar("exportado", { ok: false, error: t("No pude crear el archivo.") });
  try {
    const destino = await host.dialogos.guardarComo({ nombre: typeof d.nombre === "string" && d.nombre ? d.nombre : "esquema", extension: formato, contenido, desde: carpetaActual() });
    llamar("exportado", destino ? { ok: true, ruta: destino } : { ok: false });
  } catch { llamar("exportado", { ok: false, error: t("No pude guardar el archivo.") }); }
});

A.registrar("catalogoPlantillas", async () => llamar("catalogoListo", await Catalogo.listar("plantillas")));
A.registrar("descargarPlantilla", async (d) => llamar("plantillaDescargada", await Catalogo.descargar("plantillas", String(typeof d.id === "string" ? d.id : "").slice(0, 60))));

host.iniciar();

// Pruebas automáticas (escritorio/pruebas/arranque.mjs): acceso al estado y a las acciones desde Playwright.
if (process.env.ESQUEMA_PRUEBAS === "1") {
  global.esquemaPruebas = {
    host, vigilante: host.vigilante, idioma: host.idioma, enviarEstado: () => host.enviarEstado(), ventana: () => host.ventana(),
    /** Como el selector del sistema: la carpeta la pone la app, nunca la interfaz. */
    usarCarpeta: (c) => host.carpeta.usar(c),
    /** Un ítem del menú (lo que atiende la interfaz con window.Esquema.menu). Nada antes de elegir el idioma. */
    menu: (accion) => { if (!host.idioma.elegido) return; host.mostrar(); llamar("menu", { accion }); },
  };
}
