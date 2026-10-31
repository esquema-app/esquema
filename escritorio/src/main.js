// Esquema para Windows y Linux, sobre la pieza «host-escritorio» (src/host.js): la ventana con sandbox, el protocolo esquema://ui/,
// el puente con sus guardas, config e idioma desde app.json, menú, apariencia, actualizaciones y las acciones declaradas en
// acciones.json (proyecto, dibujar, crearReadme, estructura, probarIA: solo corren un script). Aquí queda lo propio de Esquema:
// la carpeta de la persona y su vigilancia (src/vigilante.js), abrir y guardar sus archivos, la Papelera, exportar, el catálogo de
// plantillas y el menú. Equivale a app/Sources/Esquema (Mac). El contrato está en pruebas/puente.json y lo revisa pruebas/contrato.py.
"use strict";
const fs = require("fs");
const path = require("path");
const electron = require("electron");
const { crearHost } = require("./host");
const { leerJSON } = require("./enchufe");
const { Vigilante, absoluta } = require("./vigilante");
const { lectorProgreso } = require("./progreso");
const { crear: crearActualizaciones } = require("./actualizaciones");
const { crear: crearCatalogo } = require("./catalogo");

const { app, net, shell } = electron;
const SITIO = "https://esquema-app.github.io/esquema/";
const CODIGO = "https://github.com/esquema-app/esquema";
const MAXIMO_EXPORTAR = 50 * 1024 * 1024;

/** La carpeta elegida, si todavía existe (config.carpeta: la escribe solo el selector del sistema, nunca la interfaz). */
function carpetaActual() {
  const c = host.config.texto("carpeta");
  if (!c || !path.isAbsolute(c)) return null;
  try { return fs.statSync(c).isDirectory() ? fs.realpathSync(c) : null; } catch { return null; }
}

const host = crearHost({
  electron,
  ventana: { ancho: 1280, alto: 800, icono: path.join(__dirname, "..", "iconos", "esquema-256.png"), fondo: { claro: "#f7f7f5", oscuro: "#1c1c1e" } },
  sitio: SITIO, codigo: CODIGO, appUserModelId: "app.esquema.escritorio",
  // Versiones nuevas: pieza «actualizaciones». Solo de los Releases de este repo, con su .sha256; el host atiende
  // buscarActualizacion/actualizar (nunca con un guardado o un script en curso) y revisa cada 6 h con el idioma elegido.
  actualizaciones: crearActualizaciones({ app, net, repo: "esquema-app/esquema", nombre: "Esquema" }),
  lectorProgreso,
  // `carpeta` de las acciones declaradas: siempre la actual, nunca la de la interfaz. Sin carpeta abierta, "" (bin/proyecto.py
  // decide: crear un proyecto Libro no la necesita; lo demás responde «Elige una carpeta primero»).
  inyectar: { carpetaActual: () => carpetaActual() || "" },
  estado: async (base) => {
    const e = { ...base, carpeta: null, archivos: [] };
    const c = carpetaActual();
    if (c) {
      const r = await host.procesador.correrJSON("carpeta.py", ["listar", c]);
      if (r.ok) { e.carpeta = r.carpeta; e.archivos = r.archivos || []; vigilante.empezar(c, e.archivos); }
    } else vigilante.detener();
    return e;
  },
  antesDeSalir: () => vigilante.detener(),
  menu: ({ t, item, salir, abrirEnlace }) => [
    { label: t("Archivo"), submenu: [
      item("Nuevo…", "nuevo", "CmdOrCtrl+N"),
      { label: t("Abrir carpeta…"), accelerator: "CmdOrCtrl+O", click: () => { if (host.idioma.elegido) { host.mostrar(); elegirCarpeta(); } } },
      { label: t("Mostrar la carpeta"), click: () => { const c = carpetaActual(); if (c) shell.openPath(c); } },
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

// La carpeta vigilada: si un archivo abierto cambia en el disco (VS Code, git pull…) o cambia la lista de .md/.mmd, la interfaz se entera.
const vigilante = new Vigilante({
  avisar: (f, d) => llamar(f, d),
  listar: (base) => host.procesador.correrJSON("carpeta.py", ["listar", base]),
});

// Plantillas de la comunidad: pieza «catálogo» (src/catalogo.js). Repo y tipos salen de app.json (solo de
// raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con SHA-256); los errores traen `plantilla` para traducir.
const Catalogo = crearCatalogo({ fetch: (u, o) => net.fetch(u, o), procesador: host.procesador,
  appJson: leerJSON(path.join(host.recursos, "app.json"), {}), agente: `Esquema/${app.getVersion()}` });

/** Deja `c` como la carpeta, la lista, la vigila y responde carpetaElegida (con proyecto: true si viene de un proyecto). */
async function usarCarpeta(c, proyecto) {
  host.config.guardar({ carpeta: c }, { desdeInterfaz: false });
  const l = await host.procesador.correrJSON("carpeta.py", ["listar", c]);
  if (!l.ok) return llamar("carpetaElegida", { ok: false, error: t(l.error || "No pude abrir esa carpeta.") });
  vigilante.empezar(c, l.archivos || []);
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

// ───────────── Lo propio de Esquema (lo demás lo atiende el host o está declarado en acciones.json) ─────────────
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
  if (await host.papelera(abs)) { vigilante.conocidos.delete(ruta); llamar("enPapelera", { ok: true, ruta }); }
  else llamar("enPapelera", { ok: false, ruta, error: t("No pude mandarlo a la Papelera.") });
});

// Abrir y guardar quedan aquí (no declarados) porque la vigilancia tiene que conocer el texto: así un guardado propio no se avisa
// como un cambio de afuera.
A.registrar("abrirArchivo", async (d) => {
  const ruta = typeof d.ruta === "string" ? d.ruta : "";
  const base = carpetaActual();
  if (!base || !absoluta(ruta, base)) return llamar("archivoAbierto", { ok: false, ruta, error: t("Ese nombre de archivo no sirve.") });
  const r = await host.procesador.conEntrada("carpeta.py", "leer", { carpeta: base, ruta });
  if (r.ok && typeof r.texto === "string") vigilante.conocer(ruta, r.texto);
  else Object.assign(r, { ruta, error: t(r.error || "No pude abrir el archivo.") });
  llamar("archivoAbierto", r);
});

A.registrar("guardarArchivo", async (d) => {
  const ruta = typeof d.ruta === "string" ? d.ruta : "";
  const base = carpetaActual();
  if (!base || !absoluta(ruta, base) || typeof d.texto !== "string") return llamar("archivoGuardado", { ok: false, ruta, error: t("No pude guardar el archivo.") });
  // De a uno y en orden (la fila del host): el último texto escrito es el que queda en el disco, y salir o actualizar lo espera.
  await host.fila.agregar(async () => {
    // Lo que Esquema escribe queda como conocido antes de escribirlo: la vigilancia no lo toma como un cambio de afuera.
    const antes = vigilante.conocidos.get(ruta);
    vigilante.conocer(ruta, d.texto);
    const r = await host.procesador.conEntrada("carpeta.py", "guardar", { carpeta: base, ruta, texto: d.texto, nuevo: d.nuevo === true });
    if (!r.ok) { vigilante.conocer(ruta, antes); Object.assign(r, { ruta, error: t(r.error || "No pude guardar el archivo.") }); }
    llamar("archivoGuardado", r);
  });
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
    host, vigilante, idioma: host.idioma, enviarEstado: () => host.enviarEstado(), ventana: () => host.ventana(),
    /** Como el selector del sistema: la carpeta la pone la app, nunca la interfaz. */
    usarCarpeta: (c) => host.config.guardar({ carpeta: c }, { desdeInterfaz: false }),
    /** Un ítem del menú (lo que atiende la interfaz con window.Esquema.menu). Nada antes de elegir el idioma. */
    menu: (accion) => { if (!host.idioma.elegido) return; host.mostrar(); llamar("menu", { accion }); },
  };
}
