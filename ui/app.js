// Interfaz de Esquema: la misma en Mac (WKWebView), Windows y Linux (Electron) y en el navegador (vista previa con demo.json).
// La app manda el estado con window.Esquema.estado(json); la interfaz pide cosas con host.enviar(accion, datos) (contrato en
// pruebas/puente.json). El texto es la fuente de verdad: el lienzo y la vista del documento se dibujan desde él, y cada cambio en el
// lienzo es un cambio chico en el texto (motor/flujo.js, motor/secuencia.js).
(() => {
  "use strict";
  const M = window.EsquemaMotor;
  const HOST = window.ESQUEMA_HOST || "web";
  document.documentElement.dataset.host = HOST;
  const E = {
    idioma: "es", config: {}, ias: [], version: "", plantillas: [], cargado: false,
    carpeta: null,          // {nombre, ruta}
    archivos: [],           // [{ruta}]
    docs: {},               // ruta → {texto, guardado, estado: "guardado" | "cambiado" | "guardando" | "error", pila: [], futuro: [], t}
    sel: null,              // ruta abierta
    vista: "ambos",         // "texto" | "ambos" | "dibujo"
    bloque: null,           // en un .md: el diagrama que se está editando en el lugar (índice del bloque mermaid)
    lz: { z: 1, x: 0, y: 0, ajustar: true, mini: false },
    elegido: null,          // {tipo: "nodo" | "arista" | "participante" | "evento", id}
    menu: null,             // {tipo: "formas" | "exportar" | "flechas", x, y}
    ajustes: false, probando: {}, resultadoIA: {},
    nuevo: null,            // {fuente: "app" | "comunidad", categoria, busqueda, elegida, nombre}
    catalogo: null,         // plantillas de la comunidad: {estado: "cargando" | "listo" | "error", plantillas, error, bajando: {id: true}}
    readme: null,           // {paso: "pedir" | "escribiendo" | "listo" | "error", descripcion, estructura, envio, texto, pedido, error}
    dibujar: null,          // {pedido, tipo, cambiar, nuevo, codigo, enviando, error}; nuevo: «Crear diagrama» desde el inicio (archivo nuevo)
    cambiosIA: [],          // [{id, ruta, pedido, resumen, antes, despues, estado}]
    tarjetaIA: null,        // id del último cambio de la IA (la tarjeta del lienzo)
    confirmar: null,        // {titulo, texto, si, no, accion, alNo?}
    actualizacion: { hay: false }, // {hay, texto, valores, notas}: versión nueva (pieza «actualizaciones»: la app revisa al abrir y cada 6 horas)
    revisando: null,        // Ajustes → Actualizaciones: null | "buscando" | "al-dia" | "sin-conexion" | {paso, texto, valores, pct}
    lateral: false,         // en celular: la lista de archivos abierta
    abiertas: {},           // árbol de la carpeta: ruta de una subcarpeta → abierta (true) o cerrada (false); sin valor, decide arbolAbierta()
    sugerencias: [],
    // Proyectos (ui/proyectos.js): la documentación de un repo en docs/esquema/, con elementos conectados y versiones.
    proyecto: null,         // {docs, esquema, git, cambios, tipo, historias} si la carpeta tiene documentación de Esquema
    tipos: [],              // tipos de proyecto (tipos/<id>.json, validados con M.validarTipo): Software, Libro…
    tipoProyecto: null,     // el tipo del proyecto abierto aunque todavía no tenga documentación
    recientes: [],          // [{nombre, ruta}] proyectos abiertos antes (los guarda bin/proyecto.py en la carpeta de Esquema)
    panel: null,            // null (editor) | "proyecto" | "elementos" | "versiones" | "propuestas"
  };
  const ENLACES = { sitio: "https://esquema-app.github.io/esquema/", codigo: "https://github.com/esquema-app/esquema",
    comunidad: "https://github.com/esquema-app/esquema/discussions", catalogo: "https://github.com/esquema-app/esquema-catalogo",
    proponer: "https://github.com/esquema-app/esquema-catalogo/issues/new?template=plantilla.yml" };
  const CATEGORIAS = ["arquitectura", "secuencia", "flujo-de-usuario", "proceso", "documentacion"];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = M.esc;
  const movil = () => window.matchMedia("(max-width: 760px)").matches;

  // ───────────── Puente con la app ─────────────
  const host = {
    enviar(accion, datos = {}) {
      const msg = { accion, datos };
      if (window.webkit?.messageHandlers?.esquema) return window.webkit.messageHandlers.esquema.postMessage(msg);
      if (window.esquemaEscritorio) return window.esquemaEscritorio.enviar(msg);
      return simular(accion, datos);
    },
  };

  // ───────────── Idiomas: pieza «i18n» (ui/i18n.js; las claves son el texto en español) ─────────────
  // T escapa la frase y los valores; Tp es texto plano; tr y traducirDOM traducen lo ya pintado (nunca [data-sin-traducir],
  // código, textarea ni lo que se lee de un documento: .md). E.idioma es solo un espejo de i18n.idioma para el resto de la app.
  const i18n = PiezaI18n.crear({ noTraducir: ".md" });
  const { tr, Tp, T, frase, traducirDOM } = i18n;
  /** Lo recién puesto dentro de un contenedor que sigue en pantalla: el contenedor (y sus atributos) ya está traducido. */
  const traducirDentro = (el) => { for (const h of el?.children || []) traducirDOM(h); };
  async function cargarIdioma(elegido) {
    // Lo recién elegido > ?idioma= (vista previa y pruebas) > lo guardado > el del sistema.
    const pedido = new URLSearchParams(location.search).get("idioma");
    const codigo = [elegido, pedido, E.config.idioma_ui].find((c) => c === "es" || c === "en") || i18n.idiomaDelSistema();
    await i18n.cargar(codigo);
    E.idioma = i18n.idioma;
  }
  /** Un problema del motor (o de la IA) como frase en el idioma elegido. */
  const fraseProblema = (p) => T(p.plantilla, p.valores);
  const nombreIA = () => (E.ias.find((x) => x.id === (E.config.ia || "claude")) || { nombre: "Claude" }).nombre;

  // ───────────── Bienvenida: pieza «bienvenida» (ui/bienvenida.js) ─────────────
  // El idioma va primero (paso 0: hasta elegirlo no se pinta nada más y los avisos esperan); después los pasos de Esquema:
  // hola → carpeta → IA. Elegir el idioma lo guarda por el mismo camino que Ajustes (`config`).
  const bv = PiezaBienvenida.crear({
    i18n, listo: false, pintar: () => pintar(), mostrarAviso: (...a) => toast(...a),
    guardarIdioma: (c) => { E.config.idioma_ui = c; host.enviar("config", { idioma_ui: c }); },
    cargarIdioma: (c) => cargarIdioma(c),
    terminar: () => { E.config.bienvenida = true; host.enviar("config", { bienvenida: true }); },
  });
  bv.sumarPaso({ id: "hola", titulo: "Hola, esto es Esquema", orden: 10, saltable: false,
    cuerpo: () => `<p>Diagramas y documentación en tu computador, en el mismo formato que GitHub ya muestra.</p><ul><li>Escribe en texto (Mermaid) o dibuja en el lienzo: los dos se mantienen al día.</li><li>Flujos, secuencias y arquitectura, con plantillas listas.</li><li>Tu propia IA te dibuja diagramas y te escribe el README.</li></ul><p>Gratis, abierto y sin cuentas. Nada sale de tu computador.</p>` });
  bv.sumarPaso({ id: "carpeta", titulo: "Elige tu carpeta", orden: 20, saltable: false, puede: () => !!E.carpeta,
    cuerpo: () => `<p>Esquema trabaja con los archivos .md y .mmd de una carpeta: la de tu proyecto, por ejemplo. No los mueve ni los copia.</p><div class="fila"><span class="txt">${E.carpeta ? `<b data-sin-traducir>${esc(E.carpeta.nombre)}</b><small data-sin-traducir>${esc(E.carpeta.ruta || "")}</small>` : "Todavía no eliges una carpeta."}</span><button class="boton ${E.carpeta ? "" : "principal"}" data-accion="elegir-carpeta">${ic("carpeta")} ${E.carpeta ? "Cambiar" : HOST === "web" ? "Usar la carpeta de ejemplo" : "Elegir carpeta"}</button></div>` });
  bv.sumarPaso({ id: "ia", titulo: "Tu IA (opcional)", orden: 30,
    cuerpo: () => `<p>Para «Dibújame» y el README, Esquema usa la IA que ya tienes, con tu cuenta. Solo ve lo que le pides; nunca tus archivos.</p>${filasIA()}` });

  // ───────────── Íconos de la interfaz (trazos de 16×16) ─────────────
  const IC = {
    mas: "M8 3v10M3 8h10", menos: "M3 8h10", deshacer: "M5.5 4 2.5 7l3 3M2.5 7H10a3.5 3.5 0 0 1 0 7H8", rehacer: "M10.5 4l3 3-3 3M13.5 7H6a3.5 3.5 0 0 0 0 7h2",
    listo: "M3 8.5l3 3 7-7", tarjetas: "M2.5 5h8.5v8.5H2.5zM5 2.5h8.5V11M5 8h3.5M5 10.5h3.5", bandeja: "M1.5 9l2-5.5h9l2 5.5v4.5h-13zM1.5 9h4l1 1.5h3l1-1.5h4", libro: "M2 3h4a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H2zM14 3h-4a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5H14z",
    pregunta: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.3a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.8-.9 1.4v.3M8 11.4v.3", menu: "M2.5 4h11M2.5 8h11M2.5 12h11", carpeta: "M1.5 4.5v8h13v-7H8L6.5 3.5h-5z", doc: "M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3M6 8h4.5M6 11h4.5",
    diagrama: "M5.5 1.5h5v4h-5zM1.5 10.5h5v4h-5zM9.5 10.5h5v4h-5zM8 5.5v2.5M4 10.5V8h8v2.5", chispa: "M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z",
    exportar: "M8 10V2M5 5l3-3 3 3M2.5 9.5v4h11v-4", ajustar: "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4", mapa: "M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10",
    borrar: "M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9.5h6.6l.7-9.5", cerrar: "M3.5 3.5l9 9M12.5 3.5l-9 9", lapiz: "M10.5 2.5l3 3-8 8H2.5v-3z",
    forma: "M2 2.5h6v5H2zM11 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 14l3-5 3 5z", pin: "M8 9.5v5M4.5 9.5h7l-1.5-2.5V2.5h-4V7z",
    flechas: "M2 13c4 0 4-10 12-10M11 1.5 14 3l-1.5 3", direccion: "M8 2v12M4.5 10.5 8 14l3.5-3.5", copiar: "M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3",
    volver: "M10 3 5 8l5 5", ajustes: "M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
    persona: "M8 7.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5", github: "M5.5 2.5 1.5 8l4 5.5M10.5 2.5l4 5.5-4 5.5",
    proyecto: "M2 4.5 8 1.5l6 3v7l-6 3-6-3zM2 4.5l6 3 6-3M8 7.5v7", elemento: "M8 1.5 14.5 8 8 14.5 1.5 8z", historia: "M8 14.5a6.5 6.5 0 1 0-6.2-8.5M1.5 2.5v3.5H5M8 4.5V8l2.5 2",
    flecha: "M3 8h10M9 4l4 4-4 4", codigo: "M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9 3l-2 10", config: "M2.5 4.5h11M2.5 11.5h11M5.5 3v3M10.5 10v3",
    imagen: "M2 2.5h12v11H2zM2 11l3.5-3.5 3 3 2-2L14 12M10.5 6a1 1 0 1 0 0-.01", datos: "M2.5 2.5h11v11h-11zM2.5 6.5h11M2.5 10h11M6.5 2.5v11",
    archivo: "M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3", candado: "M4 7.5h8v6.5H4zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5", detener: "M4.5 4.5h7v7h-7z", inicio: "M2 7.5 8 2.5l6 5M3.5 6.5v7.5h9V6.5M6.5 14v-4h3v4", abajo: "M4 6l4 4 4-4", derecha: "M6 4l4 4-4 4",
  };
  const ic = (n) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="${IC[n]}"/></svg>`;

  // ───────────── Avisos ─────────────
  /** Un aviso corto abajo. Con `accion` ({texto, f}) lleva un botón (p. ej. «Deshacer») y dura más. */
  function toast(texto, traducido = false, accion = null) {
    if (bv.retener(texto, traducido)) return;  // mientras se elige el idioma, los avisos esperan
    const t = $("#toast"); t.textContent = traducido ? texto : tr(texto); t.classList.add("visible");
    toast._accion = accion;
    t.classList.toggle("con-accion", !!accion);
    if (accion) { const b = document.createElement("button"); b.className = "toast-accion"; b.dataset.accion = "toast-accion"; b.textContent = accion.texto; t.appendChild(b); }
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.classList.remove("visible", "con-accion"); toast._accion = null; }, accion ? 8000 : 2400);
  }

  // ───────────── Archivos y documentos ─────────────
  const extension = (r) => (/\.(md|mmd|markdown|mermaid)$/i.exec(r || "") || [, ""])[1].toLowerCase();
  const esDiagrama = (r) => ["mmd", "mermaid"].includes(extension(r));
  const esDocumento = (r) => ["md", "markdown"].includes(extension(r));
  const nombreDe = (r) => String(r).split("/").pop();
  const porRuta = (a, b) => (a.ruta.split("/").length - b.ruta.split("/").length) || a.ruta.localeCompare(b.ruta);
  const carpetaDe = (r) => { const p = String(r).split("/"); p.pop(); return p.join("/"); };
  const doc = () => (E.sel ? E.docs[E.sel] : null);
  /** Lo que muestra el lienzo: el diagrama entero (.mmd) o el bloque que se edita en el lugar (.md). */
  function textoLienzo() {
    const d = doc();
    if (!d) return "";
    if (esDiagrama(E.sel)) return d.texto;
    if (E.bloque != null) { const b = M.bloquesMermaid(d.texto)[E.bloque]; return b ? b.contenido : ""; }
    return "";
  }
  function ponerTextoLienzo(nuevo, op = {}) {
    const d = doc();
    if (!d) return;
    if (esDiagrama(E.sel)) cambiarTexto(nuevo, op);
    else if (E.bloque != null) cambiarTexto(M.reemplazarBloque(d.texto, E.bloque, nuevo), op);
  }
  /** Todo cambio pasa por aquí: guarda para deshacer, programa el guardado y vuelve a dibujar lo que depende del texto. */
  function cambiarTexto(nuevo, op = {}) {
    const d = doc();
    if (!d || nuevo === d.texto) return;
    if (op.ruta && op.ruta !== E.sel) return cambiarTextoDe(op.ruta, nuevo, op);
    const ahora = Date.now();
    if (!(op.agrupar && d.ultimo && ahora - d.ultimo < 900)) { d.pila.push(d.texto); if (d.pila.length > 300) d.pila.shift(); }
    d.ultimo = op.agrupar ? ahora : 0;
    d.futuro = [];
    d.texto = nuevo;
    d.estado = "cambiado";
    programarGuardado(E.sel);
    refrescar(op.origen || "otro");
  }
  /** Lo mismo para un archivo que no es el abierto (proyectos: un cambio que toca varios documentos). Se guarda de inmediato. */
  function cambiarTextoDe(ruta, nuevo, op = {}) {
    const d = E.docs[ruta];
    if (!d || d.texto == null || nuevo === d.texto) return false;
    d.pila.push(d.texto); if (d.pila.length > 300) d.pila.shift();
    d.ultimo = 0; d.futuro = []; d.texto = nuevo; d.estado = "cambiado";
    clearTimeout(temporizadores[ruta]);
    if (op.inmediato) guardar(ruta); else programarGuardado(ruta);
    if (ruta === E.sel) refrescar(op.origen || "otro");
    return true;
  }
  function deshacer() { const d = doc(); if (!d || !d.pila.length) return toast("No hay nada que deshacer"); d.futuro.push(d.texto); d.texto = d.pila.pop(); d.ultimo = 0; d.estado = "cambiado"; programarGuardado(E.sel); E.elegido = null; refrescar("historial"); }
  function rehacer() { const d = doc(); if (!d || !d.futuro.length) return toast("No hay nada que rehacer"); d.pila.push(d.texto); d.texto = d.futuro.pop(); d.ultimo = 0; d.estado = "cambiado"; programarGuardado(E.sel); E.elegido = null; refrescar("historial"); }
  const temporizadores = {};
  function programarGuardado(ruta) {
    clearTimeout(temporizadores[ruta]);
    temporizadores[ruta] = setTimeout(() => guardar(ruta), 650);
    pintarEstadoGuardado();
  }
  function guardar(ruta) {
    const d = E.docs[ruta];
    if (!d || d.texto === d.guardado) { if (d) d.estado = "guardado"; return pintarEstadoGuardado(); }
    d.estado = "guardando"; d.enviado = d.texto;
    if (P.esCodigo(ruta)) P.guardarCodigo(ruta, d.texto);  // un .md del repo del código (proyecto con la documentación aparte)
    else host.enviar("guardarArchivo", { ruta, texto: d.texto });
    pintarEstadoGuardado();
  }
  /** Guarda ya todo lo que tenga cambios (menú Guardar, antes de cerrar la app o de actualizarla). */
  function guardarTodo() {
    for (const [ruta, d] of Object.entries(E.docs)) {
      if (d.texto == null || d.texto === d.guardado || d.estado === "guardando") continue;
      clearTimeout(temporizadores[ruta]);
      guardar(ruta);
    }
  }
  function abrir(ruta) {
    if (E.sel && E.sel !== ruta) guardar(E.sel);
    E.panel = null;
    E.sel = ruta; E.bloque = null; E.elegido = null; E.menu = null; E.lateral = false; E.lz.ajustar = true; E.tarjetaIA = null;
    E.vista = movil() ? (esDocumento(ruta) ? "dibujo" : "dibujo") : "ambos";
    if (!E.docs[ruta]) { E.docs[ruta] = { texto: null, guardado: null, estado: "cargando", pila: [], futuro: [] }; if (P.esCodigo(ruta)) P.leerCodigo(ruta); else host.enviar("abrirArchivo", { ruta }); }
    if (!P.esCodigo(ruta)) try { localStorage.setItem("esquema.ultimo", ruta); } catch { /* sin almacenamiento: no pasa nada */ }
    pintar();
  }

  // ───────────── Proyectos (ui/proyectos.js) ─────────────
  const P = window.EsquemaProyectos({
    E, M, host, $, esc, ic, T, Tp, tr, frase, toast, movil, nombreIA, enBienvenida: () => bv.activa,
    pintar: () => pintar(), abrir: (r) => abrir(r), cambiarTextoDe: (r, t, op) => cambiarTextoDe(r, t, op), guardarTodo: () => guardarTodo(),
    textoLienzo: () => textoLienzo(), traducirDOM: (r) => traducirDOM(r), nombreDe: (r) => nombreDe(r), ponerTextoLienzo: (t, op) => ponerTextoLienzo(t, op), resultadoBloque: (t, p) => resultadoBloque(t, p),
    abrirMenu: (tipo, b) => abrirMenu(tipo, b), pintarMenu: () => pintarMenu(), esDiagrama: (r) => esDiagrama(r), porRuta,
    registrarCambioIA: (c) => { E.cambiosIA.push(c); }, tipoDelPedido: (x) => tipoDelPedido(x),
  });

  // ───────────── Pintar ─────────────
  function pintar() {
    const app = $("#app");
    const textarea = $("#texto");
    const foco = document.activeElement?.id;
    const sel = textarea ? [textarea.selectionStart, textarea.selectionEnd, textarea.scrollTop] : null;
    const scrollDoc = $(".vista-doc")?.scrollTop;
    document.documentElement.dataset.tema = E.config.tema === "claro" ? "claro" : E.config.tema === "oscuro" ? "oscuro" : "";
    if (!document.documentElement.dataset.tema) delete document.documentElement.dataset.tema;
    if (bv.soloIdioma) { app.innerHTML = dialogos(); traducirDOM(app); bv.enfocar(); return; }  // nada más detrás
    app.innerHTML = `${lateral()}<main class="contenido">${barra()}${area()}</main>${E.lateral ? '<div class="velo" data-accion="cerrar-lateral"></div>' : ""}${dialogos()}${menu()}`;
    traducirDOM(app);
    const t = $("#texto");
    if (t) {
      t.value = doc()?.texto ?? "";
      if (sel) { t.selectionStart = sel[0]; t.selectionEnd = sel[1]; t.scrollTop = sel[2]; }
      if (foco === "texto") t.focus();
      pintarMargen(); pintarProblemas();
    }
    if ($("#lienzo")) { dibujarLienzo(true); if (foco === "lienzo") $("#lienzo").focus(); }
    if ($(".vista-doc")) { pintarVistaDoc(); if (scrollDoc) $(".vista-doc").scrollTop = scrollDoc; }
    P.despuesDePintar();
    if (foco && foco !== "texto" && foco !== "lienzo") $("#" + foco)?.focus();
    const af = $("[data-autofoco]"); if (af && !app.contains(document.activeElement)) af.focus();
  }
  /** Después de un cambio de texto: solo lo que depende del texto (rápido; no se vuelve a armar la pantalla). */
  function refrescar(origen) {
    const t = $("#texto");
    if (t && origen !== "texto") {
      const v = doc()?.texto ?? "";
      if (t.value !== v) { const a = t.selectionStart, s = t.scrollTop; t.value = v; t.selectionStart = t.selectionEnd = Math.min(a, v.length); t.scrollTop = s; }
    }
    if ($("#lienzo")) dibujarLienzo(false);
    pintarMargen(); pintarProblemas(); pintarEstadoGuardado(); pintarBarraHistorial();
    if ($(".vista-doc")) programarVistaDoc();
    if (origen === "texto") calcularSugerencias(); else pintarSugerencias([]);
  }

  /** La carpeta como árbol: {ruta, carpetas: Map(nombre → nodo), archivos: [], total} (total: documentos y diagramas adentro). */
  function arbolDe(archivos) {
    const raiz = { ruta: "", carpetas: new Map(), archivos: [], total: 0 };
    for (const a of archivos) {
      let n = raiz; n.total++;
      for (const parte of a.ruta.split("/").slice(0, -1)) {
        if (!n.carpetas.has(parte)) n.carpetas.set(parte, { ruta: n.ruta ? n.ruta + "/" + parte : parte, carpetas: new Map(), archivos: [], total: 0 });
        n = n.carpetas.get(parte); n.total++;
      }
      n.archivos.push(a);
    }
    return raiz;
  }
  /** Si nadie la abrió o cerró: abierta si hay pocos archivos, si tiene el archivo abierto o si es (o lleva a) la documentación del proyecto. */
  function arbolAbierta(ruta) {
    if (ruta in E.abiertas) return E.abiertas[ruta];
    // Las carpetas del proyecto en el lateral: el proyecto y su documentación abiertos; el código, cerrado salvo que tenga lo abierto.
    if (ruta === "#p" || ruta === "#docs") return true;
    if (ruta === "#codigo") return P.esDeCodigo(E.sel) || E.panel === "ficha" || P.leyendoCodigo();
    if (ruta.startsWith("#c:")) return P.codigoAbierta(ruta.slice(3));
    if (P.esCodigo(ruta)) return !!E.sel && E.sel.startsWith(ruta + "/");
    const dentro = (r) => r && (r === ruta || r.startsWith(ruta + "/"));
    return E.archivos.length <= 20 || (E.sel && dentro(carpetaDe(E.sel))) || (E.proyecto && dentro(E.proyecto.docs));
  }
  function arbolHTML(n, nivel) {
    const archivo = (a) => `<button class="archivo" style="--n:${nivel}" data-abrir="${esc(a.ruta)}" aria-current="${a.ruta === E.sel && !E.panel}" title="${esc(a.ruta)}" data-sin-traducir>${ic(esDiagrama(a.ruta) ? "diagrama" : "doc")}<span>${esc(nombreDe(a.ruta))}</span>${P.marcaArchivo(a.ruta)}</button>`;
    const carpeta = (c, nombre) => {
      const ab = arbolAbierta(c.ruta), docs = E.proyecto && c.ruta === E.proyecto.docs;
      return `<button class="archivo carpeta-arbol" style="--n:${nivel}" data-arbol="${esc(c.ruta)}" aria-expanded="${ab}" title="${esc(c.ruta)}" data-sin-traducir>${ic(ab ? "abajo" : "derecha")}${ic("carpeta")}<span>${esc(nombre)}</span><small>${docs ? esc(tr("Documentación")) : c.total}</small></button>${ab ? `<div role="group">${arbolHTML(c, nivel + 1)}</div>` : ""}`;
    };
    return n.archivos.map(archivo).join("") + [...n.carpetas].sort(([a], [b]) => a.localeCompare(b)).map(([nombre, c]) => carpeta(c, nombre)).join("");
  }
  function lateral() {
    const inicio = E.carpeta && !E.proyecto ? `<button class="archivo" data-accion="inicio" aria-current="${!E.sel && !E.panel}">${ic("inicio")}<span>Inicio</span></button>` : "";
    return `<aside class="lateral${E.lateral ? " abierto" : ""}" aria-label="Archivos">
      <div class="marca"><img src="favicon.svg" alt=""><b>Esquema</b></div>
      ${/* Crear es siempre dentro de un proyecto («Nuevo en <proyecto>», en su carpeta del lateral); arriba solo lo global. */ ""}
      <nav class="lista">
        ${P.esProyecto() ? P.lateralHTML({ arbolDe, arbolHTML, arbolAbierta }) : `${inicio}
        ${E.archivos.length ? `<h3>Archivos</h3><div class="arbol">${arbolHTML(arbolDe(E.archivos), 0)}</div>` : ""}
        ${!E.archivos.length && E.carpeta ? `<p class="vacio">Esta carpeta todavía no tiene documentos ni diagramas.</p>` : ""}`}
        ${P.recientesHTML()}
      </nav>
      <div class="pie-lateral"><button class="boton plano" data-accion="ajustes">${ic("ajustes")} Ajustes</button></div>
    </aside>`;
  }
  function barra() {
    if (E.panel && E.carpeta) return P.barraHTML();
    const d = doc();
    const tieneDibujo = E.sel && (esDiagrama(E.sel) || E.bloque != null);
    const vistas = E.sel ? (movil() ? [["texto", "Texto"], ["dibujo", esDocumento(E.sel) && E.bloque == null ? "Vista" : "Dibujo"]] : [["texto", "Texto"], ["ambos", "Ambos"], ["dibujo", esDocumento(E.sel) && E.bloque == null ? "Vista" : "Dibujo"]]) : [];
    const vista = movil() && E.vista === "ambos" ? "dibujo" : E.vista;
    return `<header class="barra">
      <button class="boton plano icono solo-movil" data-accion="abrir-lateral" aria-label="Archivos">${ic("menu")}</button>
      ${E.sel ? `<span class="titulo" data-sin-traducir>${esc(nombreDe(E.sel))}</span><span class="estado-guardado solo-escritorio" id="estado-guardado">${estadoGuardado()}</span>` : `<span class="titulo">Esquema</span>`}
      <span class="espacio"></span>
      ${d ? `<span id="historial" class="solo-escritorio">${botonesHistorial()}</span>
        <div class="seg" role="group" aria-label="Vista">${vistas.map(([v, n]) => `<button data-vista="${v}" aria-pressed="${vista === v}">${n}</button>`).join("")}</div>
        <button class="boton" data-accion="dibujame" title="Pídele un diagrama a tu IA">${ic("chispa")}<span class="solo-escritorio">Dibújame</span></button>
        ${tieneDibujo ? `<button class="boton icono" data-accion="menu-exportar" aria-label="Exportar" title="Exportar">${ic("exportar")}</button>` : ""}
        ${P.puedeBorrar(E.sel) ? `<button class="boton plano icono" data-p-borrar="${esc(E.sel)}" aria-label="Borrar" title="Borrar">${ic("borrar")}</button>` : ""}` : ""}
    </header>`;
  }
  const botonesHistorial = () => { const d = doc(); return `<button class="boton plano icono" data-accion="deshacer" aria-label="Deshacer" title="Deshacer (⌘Z)" ${d?.pila.length ? "" : "disabled"}>${ic("deshacer")}</button><button class="boton plano icono" data-accion="rehacer" aria-label="Rehacer" title="Rehacer (⇧⌘Z)" ${d?.futuro.length ? "" : "disabled"}>${ic("rehacer")}</button>`; };
  function pintarBarraHistorial() { const h = $("#historial"); if (h) { h.innerHTML = botonesHistorial(); traducirDentro(h); } }
  function estadoGuardado() {
    const d = doc();
    if (!d) return "";
    return { cambiado: "Sin guardar", guardando: "Guardando…", guardado: "Guardado", error: "No se pudo guardar", cargando: "Abriendo…" }[d.estado] || "";
  }
  function pintarEstadoGuardado() { const el = $("#estado-guardado"); if (el) el.textContent = tr(estadoGuardado()); }

  function area() {
    if (!E.carpeta) return `<div class="vacio"><div><h2>Elige una carpeta</h2><p>Tus documentos y diagramas viven en una carpeta de tu computador, en archivos .md y .mmd que GitHub muestra tal cual.</p><div class="acciones"><button class="boton principal" data-accion="p-agregar">${ic("mas")} Agregar proyecto</button><button class="boton" data-accion="elegir-carpeta">${ic("carpeta")} Abrir una carpeta</button></div></div></div>`;
    if (E.panel) return P.areaHTML();
    const d = doc();
    if (!E.sel || !d) return inicioHTML();
    if (d.texto == null) return `<div class="vacio"><div class="esperando"><span class="giro"></span> Abriendo…</div></div>`;
    const vista = movil() && E.vista === "ambos" ? "dibujo" : E.vista;
    const derecha = esDiagrama(E.sel) ? `<section class="panel-dibujo">${lienzoHTML()}</section>`
      : E.bloque != null ? `<section class="panel-dibujo con-cab"><div class="cab-bloque"><button class="boton plano" data-accion="volver-doc">${ic("volver")} Listo</button><span data-sin-traducir>${T("Diagrama {n} de {x}", { n: E.bloque + 1, x: nombreDe(E.sel) })}</span></div>${lienzoHTML()}</section>`
      : `<section class="panel-dibujo vista-doc" aria-label="Vista del documento"><article class="md" id="vista-md" data-sin-traducir></article></section>`;
    const barraDoc = P.barraDocHTML();
    return `${barraDoc ? `<div class="con-barra-doc">${barraDoc}` : ""}<div class="area" data-vista="${vista}">
      <section class="panel-texto" aria-label="Texto">
        <div class="editor"><div class="margen" id="margen" aria-hidden="true"></div><textarea id="texto" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Texto del ${esDiagrama(E.sel) ? "diagrama" : "documento"}"></textarea></div>
        <div class="problemas" id="problemas"></div>
        <div class="sugerencias" id="sugerencias" aria-label="Sugerencias"></div>
      </section>${derecha}</div>${barraDoc ? "</div>" : ""}`;
  }

  /** Inicio de una carpeta: lo que se puede hacer, en palabras de quien la usa. Los proyectos lo muestran en su panel. */
  function inicioHTML() {
    return `<div class="inicio"><div class="inicio-cab"><span class="p-icono">${ic("carpeta")}</span><div><h2 data-sin-traducir>${esc(E.carpeta.nombre)}</h2><p>¿Qué quieres hacer?</p></div></div>
      ${P.sinDocumentacion() ? `<div class="p-aviso inicio-docs"><span>Este proyecto todavía no tiene documentación. Tu IA puede leerlo entero y escribir la visión general, la arquitectura y los flujos principales, aparte de tu código.</span><button class="boton principal" data-accion="p-documentar">${ic("chispa")} Hacer la documentación completa</button></div>` : ""}
      ${P.accionesInicio()}
      <p class="inicio-mas"><button class="boton plano" data-accion="readme">${ic("github")} README para GitHub</button></p></div>`;
  }
  /** «el flujo de…» → flujo, «la secuencia de…» → secuencia, «la arquitectura de…» → arquitectura; si no se nota, «auto». */
  function tipoDelPedido(texto) {
    const t = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/\b(secuencia|sequence|como se comunican|how .* talk)\b/.test(t)) return "secuencia";
    if (/\b(arquitectura|architecture|componentes|components)\b/.test(t)) return "arquitectura";
    if (/\b(flujo|flow|proceso|process|pasos|steps)\b/.test(t)) return "flujo";
    return "auto";
  }
  /** «este proyecto», «esta app», «el repo», «mi código»…: el pedido es sobre la carpeta, así que la IA tiene que leerla. */
  function hablaDelProyecto(texto) {
    const t = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return /\b(este|del|el|mi|nuestro|this|the|my|our) (proyecto|repo|repositorio|codigo|app|aplicacion|sistema|project|repository|code|application)\b|\b(esta|la|mi|nuestra) (app|aplicacion)\b/.test(t);
  }
  /** Nombre de archivo a partir de lo que se pidió: «El flujo de compra» → «el-flujo-de-compra». */
  const PALABRAS_VACIAS = new Set("el la los las un una unos unas de del al a en y o con por para entre desde hasta que su sus mi mis the a an of to in and or with for from my".split(" "));
  function nombreDesde(texto, otro) {
    const palabras = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !PALABRAS_VACIAS.has(w));
    return palabras.slice(0, 6).join("-").slice(0, 50).replace(/-+$/, "") || otro;
  }

  // ───────────── Editor de texto: números de línea, problemas, sugerencias ─────────────
  let ultimoResultado = null;  // lo último que se dibujó en el lienzo (con su modelo)
  let ultimoBueno = null;      // lo último que se dibujó sin errores (se sigue mostrando mientras se escribe)
  function problemasActuales() {
    if (!doc() || doc().texto == null) return { errores: [], avisos: [], base: 0 };
    if (esDiagrama(E.sel)) { const r = ultimoResultado || M.dibujar(doc().texto); return { errores: r.errores || [], avisos: r.avisos || [], base: 0 }; }
    // Documento: los problemas de cada diagrama, con la línea del documento.
    const errores = [], avisos = [];
    for (const b of M.bloquesMermaid(doc().texto)) {
      const r = resultadoBloque(b.contenido);
      for (const e of r.errores || []) errores.push({ ...e, linea: e.linea + b.ini + 1 });
      for (const a of r.avisos || []) avisos.push({ ...a, linea: a.linea + b.ini + 1 });
    }
    return { errores, avisos, base: 0 };
  }
  const cacheBloques = new Map();
  function resultadoBloque(texto, prefijo = "md") {
    const k = prefijo + "|" + texto;
    let r = cacheBloques.get(k);
    if (!r) { r = M.dibujar(texto, { prefijo }); cacheBloques.set(k, r); if (cacheBloques.size > 60) cacheBloques.delete(cacheBloques.keys().next().value); }
    return r;
  }
  const margenes = new WeakMap();
  function pintarMargen() {
    const m = $("#margen"), t = $("#texto");
    if (!m || !t) return;
    const n = (t.value.match(/\n/g) || []).length + 1;
    const malas = new Set(problemasActuales().errores.map((e) => e.linea));
    let h = "";
    for (let i = 1; i <= n; i++) h += malas.has(i) ? `<span class="mal">${i}</span>\n` : i + "\n";
    // Escribir dentro de una línea no cambia los números: el margen no se rearma.
    if (margenes.get(m) !== h) { m.innerHTML = h; margenes.set(m, h); }
    m.scrollTop = t.scrollTop;
  }
  function pintarProblemas() {
    const el = $("#problemas");
    if (!el) return;
    const p = problemasActuales();
    const lista = [...p.errores.slice(0, 2).map((e) => ["error", e]), ...(p.errores.length ? [] : p.avisos.slice(0, 1).map((a) => ["aviso", a]))];
    el.innerHTML = lista.map(([tipo, e]) => `<button class="problema ${tipo === "aviso" ? "aviso" : ""}" data-ir-linea="${e.linea}" data-sin-traducir><b>${T("Línea {n}", { n: e.linea })}</b><span>${fraseProblema(e)}${e.sugerencia ? " " + T("Prueba: {x}", { x: "" }) + `<code>${esc(e.sugerencia)}</code>` : ""}</span></button>`).join("");
  }
  function irALinea(n) {
    const t = $("#texto");
    if (!t) return;
    if (E.vista === "dibujo") { E.vista = movil() ? "texto" : "ambos"; pintar(); return irALinea(n); }
    const L = t.value.split("\n");
    let pos = 0; for (let i = 0; i < n - 1 && i < L.length; i++) pos += L[i].length + 1;
    t.focus(); t.selectionStart = pos; t.selectionEnd = pos + (L[n - 1] || "").length;
    t.scrollTop = Math.max(0, (n - 4) * 20);
  }

  /** Autocompletar: según lo que hay antes del cursor, ofrece palabras clave, nombres de nodos, flechas o formas. */
  function calcularSugerencias() {
    const t = $("#texto");
    if (!t || !doc()) return pintarSugerencias([]);
    const v = t.value, c = t.selectionStart;
    if (c !== t.selectionEnd) return pintarSugerencias([]);
    const ini = v.lastIndexOf("\n", c - 1) + 1, antes = v.slice(ini, c);
    // ¿Dentro de qué diagrama está el cursor?
    let texto = v, base = 0;
    if (esDocumento(E.sel)) {
      const lineaCursor = v.slice(0, c).split("\n").length - 1;
      const b = M.bloquesMermaid(v).find((x) => x.ini < lineaCursor && lineaCursor < x.fin);
      if (!b) return pintarSugerencias([]);
      texto = b.contenido; base = b.ini + 1;
    }
    void base;
    const tipo = M.tipoDiagrama(texto).tipo;
    const palabra = /[\p{L}\p{N}_-]*$/u.exec(antes)[0];
    const r = [];
    const agregar = (insertar, mostrar = insertar, reemplaza = palabra.length) => { if (!r.some((x) => x.insertar === insertar)) r.push({ insertar, mostrar, reemplaza }); };
    if (tipo === "flujo") {
      // Los ids que ya existen, sin contar la palabra que se está escribiendo.
      const D = M.parsearFlujo(esDiagrama(E.sel) && palabra ? v.slice(0, c - palabra.length) + v.slice(c) : texto);
      const ids = [...D.nodos.keys()];
      if (/^\s*[\p{L}\p{N}_-]*$/u.test(antes)) {
        for (const k of ["subgraph", "end", "classDef", "class", "style", "direction"]) if (palabra && k.startsWith(palabra) && k !== palabra) agregar(k + " ");
        for (const id of ids) if (palabra && id.toLowerCase().startsWith(palabra.toLowerCase()) && id !== palabra) agregar(id);
      }
      if (/[\p{L}\p{N}_\])}]\s+$/u.test(antes)) for (const f of ["-->", "-->|texto|", "-.->", "==>", "---"]) agregar(f + " ", f, 0);
      else if (/(-->|---|-\.->|==>|\|)\s*[\p{L}\p{N}_-]*$/u.test(antes)) for (const id of ids) if (id.toLowerCase().startsWith(palabra.toLowerCase()) && id !== palabra) agregar(id);
      if (palabra && /^[\p{L}][\p{L}\p{N}_]*$/u.test(palabra) && !ids.includes(palabra) && !/^(subgraph|end|class|classDef|style|direction|flowchart|graph)$/.test(palabra) && /(^\s*|(-->|---|-\.->|==>|\|)\s*)[\p{L}\p{N}_]*$/u.test(antes)) {
        for (const [a, c2] of [["[", "]"], ["{", "}"], ["[(", ")]"], ["([", "])"], ["((", "))"]]) agregar(palabra + a + palabra + c2, palabra + a + "…" + c2);
      }
    } else if (tipo === "secuencia") {
      const S = M.parsearSecuencia(texto);
      if (/^\s*[\p{L}\p{N}_-]*$/u.test(antes)) {
        for (const k of ["participant ", "actor ", "Note right of ", "Note over ", "loop ", "alt ", "else ", "opt ", "par ", "end", "activate ", "deactivate ", "autonumber"]) if (palabra && k.toLowerCase().startsWith(palabra.toLowerCase()) && k.trim() !== palabra) agregar(k);
        for (const p of S.participantes) if (palabra && p.id.toLowerCase().startsWith(palabra.toLowerCase()) && p.id !== palabra) agregar(p.id);
      }
      if (/^\s*[\p{L}\p{N}_]+$/u.test(antes) && S.idx.has(palabra)) for (const f of ["->>", "-->>", "-x", "-)"]) agregar(f, f, 0);
      if (/(->>|-->>|->|-->|-x|--x|-\)|--\))[+-]?[\p{L}\p{N}_-]*$/u.test(antes)) for (const p of S.participantes) if (p.id.toLowerCase().startsWith(palabra.toLowerCase())) agregar(p.id + ": ");
    } else if (tipo === "vacio" && esDiagrama(E.sel)) {
      for (const k of ["flowchart TD", "flowchart LR", "sequenceDiagram"]) if (k.toLowerCase().startsWith(antes.trim().toLowerCase())) agregar(k + "\n    ", k, antes.length);
    }
    pintarSugerencias(r.slice(0, 8));
  }
  function pintarSugerencias(lista) {
    E.sugerencias = lista;
    const el = $("#sugerencias");
    if (!el) return;
    el.innerHTML = lista.length ? lista.map((s, i) => `<button data-sugerencia="${i}" data-sin-traducir>${esc(s.mostrar)}</button>`).join("") + `<span class="tecla">Tab ↹</span>` : "";
    traducirDentro(el);
  }
  function usarSugerencia(i) {
    const s = E.sugerencias[i], t = $("#texto");
    if (!s || !t) return;
    const c = t.selectionStart;
    const nuevo = t.value.slice(0, c - s.reemplaza) + s.insertar + t.value.slice(c);
    t.value = nuevo;
    t.selectionStart = t.selectionEnd = c - s.reemplaza + s.insertar.length;
    t.focus();
    cambiarTexto(nuevo, { origen: "texto" });
  }

  // ───────────── Lienzo ─────────────
  function lienzoHTML() {
    const tipo = M.tipoDiagrama(textoLienzo()).tipo;
    const esSec = tipo === "secuencia";
    return `<div class="lienzo" id="lienzo" tabindex="0" aria-label="Lienzo: doble clic para crear o renombrar, arrastra para mover o conectar">
      <svg class="esq" id="lz-svg" xmlns="http://www.w3.org/2000/svg"><defs id="lz-defs"></defs><g id="lz-vista"><g id="lz-contenido"></g><g id="lz-capa" class="lz-capa"></g></g></svg>
      <div id="lz-vacio"></div>
      <div id="lz-sel"></div>
      ${E.lz.mini ? `<div class="lz-mini" id="lz-mini"></div>` : ""}
      <div id="lz-tarjeta"></div>
      <div class="lz-herr" role="toolbar" aria-label="Lienzo">
        ${tipo === "flujo" || tipo === "vacio" ? `<button class="boton" data-accion="nodo-nuevo" title="Nuevo nodo (N)">${ic("mas")} Nodo</button><span class="sep"></span>
          <button class="boton icono" data-accion="menu-flechas" aria-label="Flechas" title="Flechas">${ic("flechas")}</button>
          <button class="boton icono" data-accion="direccion" aria-label="Cambiar dirección" title="Cambiar dirección">${ic("direccion")}</button><span class="sep"></span>` : ""}
        ${esSec ? `<button class="boton" data-accion="participante-nuevo" title="Nuevo participante">${ic("persona")} Participante</button><span class="sep"></span>` : ""}
        <button class="boton icono no-movil" data-accion="alejar" aria-label="Alejar" title="Alejar (−)">${ic("menos")}</button>
        <button class="boton zoom no-movil" data-accion="zoom-100" title="Tamaño real" id="lz-zoom" data-sin-traducir>100%</button>
        <button class="boton icono no-movil" data-accion="acercar" aria-label="Acercar" title="Acercar (+)">${ic("mas")}</button>
        <button class="boton icono" data-accion="ajustar" aria-label="Ver todo" title="Ver todo (0)">${ic("ajustar")}</button>
        <button class="boton icono no-movil" data-accion="minimapa" aria-label="Minimapa" title="Minimapa" aria-pressed="${E.lz.mini}">${ic("mapa")}</button>
      </div>
    </div>`;
  }
  let partesActuales = [];   // [{clave, svg, el}]
  let arrastre = null;       // nodo que se está moviendo: {id, x, y} (el texto se fija recién al soltar)
  function dibujarLienzo(completo) {
    const lz = $("#lienzo");
    if (!lz) return;
    let texto = textoLienzo();
    if (arrastre) texto = M.fijar(texto, arrastre.id, arrastre.x, arrastre.y);
    const r = M.dibujar(texto, { prefijo: "lz" });
    ultimoResultado = r;
    const conError = r.errores && r.errores.length > 0;
    const mostrar = conError && ultimoBueno && ultimoBueno.tipo === r.tipo ? ultimoBueno : r;
    if (!conError) ultimoBueno = r;
    lz.classList.toggle("con-error", conError);
    const defs = $("#lz-defs");
    if (defs.dataset.h !== mostrar.defs) { defs.innerHTML = mostrar.defs; defs.dataset.h = mostrar.defs; }
    // Reemplazar solo las partes que cambiaron (si el orden de las claves es el mismo).
    const cont = $("#lz-contenido");
    const mismas = !completo && partesActuales.length === mostrar.partes.length && partesActuales.every((p, i) => p.clave === mostrar.partes[i].clave) && cont.childElementCount === partesActuales.length;
    if (mismas) {
      mostrar.partes.forEach((p, i) => { const a = partesActuales[i]; if (a.svg !== p.svg) { const el = svgEl(p.svg); cont.replaceChild(el, a.el); a.el = el; a.svg = p.svg; } });
    } else {
      cont.innerHTML = mostrar.partes.map((p) => p.svg).join("");
      partesActuales = mostrar.partes.map((p, i) => ({ clave: p.clave, svg: p.svg, el: cont.children[i] }));
    }
    const vacio = $("#lz-vacio");
    const tipo = mostrar.tipo;
    let aviso = "";
    if (r.tipo === "pendiente") aviso = T("Esquema todavía no dibuja «{x}». Lo dejo tal cual: GitHub sí lo muestra.", { x: r.palabra });
    else if (!mostrar.partes.length && !conError) aviso = esDiagrama(E.sel) || E.bloque != null ? T("Lienzo vacío. Haz doble clic para crear un nodo o escribe «flowchart TD» a la izquierda.") : "";
    else if (conError && !ultimoBueno) aviso = T("Corrige el texto para ver el dibujo.");
    vacio.className = aviso ? "lz-vacio" : ""; vacio.innerHTML = aviso ? `<p data-sin-traducir>${aviso}</p>` : "";
    lz.dataset.tipo = tipo || "";
    if (E.lz.ajustar && mostrar.partes.length) { ajustarVista(mostrar); E.lz.ajustar = false; }
    else if (E.lz.mostrar && mostrar.geo?.nodos?.get(E.lz.mostrar)) {
      // Lo recién creado siempre queda a la vista: se desplaza lo justo.
      const n = mostrar.geo.nodos.get(E.lz.mostrar), W = lz.clientWidth, H = lz.clientHeight - 64, m = 24;
      const x1 = (n.x - n.w / 2) * E.lz.z + E.lz.x, x2 = (n.x + n.w / 2) * E.lz.z + E.lz.x, y1 = (n.y - n.h / 2) * E.lz.z + E.lz.y, y2 = (n.y + n.h / 2) * E.lz.z + E.lz.y;
      if (x1 < m) E.lz.x += m - x1; else if (x2 > W - m) E.lz.x -= x2 - (W - m);
      if (y1 < m) E.lz.y += m - y1; else if (y2 > H - m) E.lz.y -= y2 - (H - m);
    }
    E.lz.mostrar = null;
    aplicarVista();
    pintarSeleccion();
    pintarTarjetaIA();
  }
  function svgEl(s) { const t = document.createElementNS("http://www.w3.org/2000/svg", "svg"); t.innerHTML = s; return t.firstElementChild; }
  function ajustarVista(r) {
    const lz = $("#lienzo"), c = r.caja;
    if (!lz || !c) return;
    const W = lz.clientWidth || 600, H = lz.clientHeight || 400, m = 40, abajo = 64;
    const z = Math.max(0.1, Math.min(1.4, (W - 2 * m) / Math.max(1, c.w), (H - 2 * m - abajo) / Math.max(1, c.h)));
    E.lz.z = z; E.lz.x = (W - c.w * z) / 2 - c.x * z; E.lz.y = (H - abajo - c.h * z) / 2 - c.y * z;
  }
  function aplicarVista() {
    const v = $("#lz-vista");
    if (!v) return;
    v.setAttribute("transform", `translate(${E.lz.x.toFixed(1)},${E.lz.y.toFixed(1)}) scale(${E.lz.z.toFixed(4)})`);
    const z = $("#lz-zoom"); if (z) z.textContent = Math.round(E.lz.z * 100) + "%";
    const lz = $("#lienzo"); if (lz) lz.style.backgroundSize = `${20 * E.lz.z}px ${20 * E.lz.z}px`, lz.style.backgroundPosition = `${E.lz.x}px ${E.lz.y}px`;
    pintarMinimapa();
  }
  function zoomEn(f, sx, sy) {
    const lz = $("#lienzo"); if (!lz) return;
    const r = lz.getBoundingClientRect();
    if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    const z = Math.max(0.08, Math.min(4, E.lz.z * f));
    E.lz.x = sx - ((sx - E.lz.x) * z) / E.lz.z; E.lz.y = sy - ((sy - E.lz.y) * z) / E.lz.z; E.lz.z = z;
    aplicarVista(); pintarSeleccion();
  }
  const aContenido = (cx, cy) => { const r = $("#lienzo").getBoundingClientRect(); return { x: (cx - r.left - E.lz.x) / E.lz.z, y: (cy - r.top - E.lz.y) / E.lz.z }; };
  function pintarMinimapa() {
    const m = $("#lz-mini"), r = ultimoBueno || ultimoResultado, lz = $("#lienzo");
    if (!m || !r || !lz) return;
    const c = r.caja, pad = 20;
    const vx = -E.lz.x / E.lz.z, vy = -E.lz.y / E.lz.z, vw = lz.clientWidth / E.lz.z, vh = lz.clientHeight / E.lz.z;
    m.innerHTML = `<svg class="esq" viewBox="${c.x - pad} ${c.y - pad} ${c.w + 2 * pad} ${c.h + 2 * pad}" preserveAspectRatio="xMidYMid meet" data-caja="${c.x - pad},${c.y - pad},${c.w + 2 * pad},${c.h + 2 * pad}"><use href="#lz-contenido"/><rect class="ventana" x="${vx}" y="${vy}" width="${vw}" height="${vh}"/></svg>`;
  }

  // Selección y barra contextual
  function elementoElegido() {
    const s = E.elegido;
    if (!s) return null;
    const cont = $("#lz-contenido");
    if (!cont) return null;
    const sel = s.tipo === "nodo" ? `.nodo[data-id="${CSS.escape(s.id)}"]` : s.tipo === "arista" ? `.arista[data-arista="${s.id}"]` : s.tipo === "participante" ? `.vida-p[data-participante="${CSS.escape(s.id)}"]` : `[data-evento="${s.id}"]`;
    return cont.querySelector(sel);
  }
  function pintarSeleccion() {
    for (const el of document.querySelectorAll("#lz-contenido .elegido")) el.classList.remove("elegido");
    const capa = $("#lz-capa"), barraSel = $("#lz-sel");
    if (!capa || !barraSel) return;
    capa.innerHTML = "";
    const el = elementoElegido();
    if (!el) { E.elegido = null; barraSel.innerHTML = ""; return; }
    el.classList.add("elegido");
    const r = ultimoBueno || ultimoResultado;
    const s = E.elegido;
    let botones = "";
    if (s.tipo === "nodo" && r?.geo?.nodos?.get(s.id)) {
      const n = r.geo.nodos.get(s.id), dir = r.geo.dir;
      const p = dir === "LR" ? { x: n.x + n.w / 2 + 12, y: n.y } : dir === "RL" ? { x: n.x - n.w / 2 - 12, y: n.y } : dir === "BT" ? { x: n.x, y: n.y - n.h / 2 - 12 } : { x: n.x, y: n.y + n.h / 2 + 12 };
      capa.innerHTML = `<circle class="asa-fondo" cx="${p.x}" cy="${p.y}" r="${16 / E.lz.z}" data-asa="${esc(s.id)}"/><circle class="asa" cx="${p.x}" cy="${p.y}" r="${7 / Math.min(1.5, Math.max(0.6, E.lz.z))}" data-asa="${esc(s.id)}"/>` + (n.fijo ? `<circle class="pin" cx="${n.x + n.w / 2 - 4}" cy="${n.y - n.h / 2 + 4}" r="3"/>` : "");
      botones = `<button class="boton" data-accion="renombrar">${ic("lapiz")} Renombrar</button><button class="boton" data-accion="menu-formas">${ic("forma")} Forma</button>${n.fijo ? `<button class="boton" data-accion="desfijar" title="Volver al acomodo automático">${ic("pin")} Soltar</button>` : ""}<button class="boton peligro" data-accion="borrar" aria-label="Borrar">${ic("borrar")}</button>`;
    } else if (s.tipo === "arista") botones = `<button class="boton" data-accion="renombrar">${ic("lapiz")} Texto</button><button class="boton peligro" data-accion="borrar" aria-label="Borrar">${ic("borrar")}</button>`;
    else if (s.tipo === "participante") botones = `<button class="boton" data-accion="renombrar">${ic("lapiz")} Renombrar</button>`;
    else if (s.tipo === "evento") {
      const ev = ultimoResultado?.modelo?.eventos?.[s.id];
      botones = ev && (ev.tipo === "mensaje" || ev.tipo === "nota") ? `<button class="boton" data-accion="renombrar">${ic("lapiz")} Texto</button><button class="boton peligro" data-accion="borrar" aria-label="Borrar">${ic("borrar")}</button>` : "";
    }
    if (s.tipo === "nodo" || s.tipo === "participante") botones += P.botonElemento(s.id);
    barraSel.className = botones ? "lz-sel" : "";
    barraSel.innerHTML = botones;
    traducirDentro(barraSel);
    // La barra va justo arriba de lo elegido (o abajo si no cabe), sin taparlo.
    if (botones) {
      const lz = $("#lienzo").getBoundingClientRect(), b = el.getBoundingClientRect(), w = barraSel.offsetWidth, h = barraSel.offsetHeight;
      const x = Math.max(8, Math.min(lz.width - w - 8, b.left - lz.left + b.width / 2 - w / 2));
      let y = b.top - lz.top - h - 10;
      if (y < 8) y = Math.min(lz.height - h - 72, b.bottom - lz.top + 22);
      Object.assign(barraSel.style, { left: x + "px", top: Math.max(8, y) + "px" });
    }
  }

  // Editar en el lugar (doble clic): un campo encima de lo elegido.
  function editarEnLugar() {
    const s = E.elegido, el = elementoElegido(), lz = $("#lienzo");
    if (!s || !el || !lz) return;
    const r = ultimoResultado, m = r?.modelo;
    let valor = "", objetivo = el;
    if (s.tipo === "nodo") valor = m?.nodos?.get(s.id)?.etiqueta ?? "";
    else if (s.tipo === "arista") { valor = m?.aristas?.[s.id]?.etiqueta ?? ""; objetivo = $(`.etq-arista[data-arista="${s.id}"]`) || el; }
    else if (s.tipo === "participante") { valor = m?.idx?.get(s.id)?.etiqueta ?? ""; objetivo = el.querySelector(".participante") || el; }
    else if (s.tipo === "evento") { const ev = m?.eventos?.[s.id]; if (!ev || (ev.tipo !== "mensaje" && ev.tipo !== "nota")) return; valor = ev.texto; objetivo = el.querySelector("text") || el; }
    const b = objetivo.getBoundingClientRect(), base = lz.getBoundingClientRect();
    const w = Math.max(140, b.width + 24), h = Math.max(36, Math.min(160, b.height + 12));
    $("#lz-editar")?.remove();
    const ta = document.createElement("textarea");
    ta.id = "lz-editar"; ta.className = "lz-editar"; ta.value = valor; ta.setAttribute("aria-label", tr("Nuevo texto"));
    Object.assign(ta.style, { left: `${b.left - base.left + b.width / 2 - w / 2}px`, top: `${b.top - base.top + b.height / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
    lz.appendChild(ta);
    ta.focus(); ta.select();
    let hecho = false;
    const terminar = (guardarlo) => {
      if (hecho) return; hecho = true;
      const v = ta.value.trim();
      ta.remove();
      $("#lienzo")?.focus();
      if (!guardarlo || v === valor.trim()) return;
      const t = textoLienzo();
      let n = t;
      if (s.tipo === "nodo") n = M.renombrarNodo(t, s.id, v || s.id);
      else if (s.tipo === "arista") n = M.renombrarArista(t, s.id, v);
      else if (s.tipo === "participante") n = M.renombrarParticipante(t, s.id, v || s.id);
      else if (s.tipo === "evento") n = M.cambiarTextoEvento(t, m.eventos[s.id].linea, v);
      ponerTextoLienzo(n, { origen: "lienzo" });
    };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); terminar(true); }
      else if (e.key === "Escape") { e.preventDefault(); terminar(false); }
      e.stopPropagation();
    });
    ta.addEventListener("blur", () => terminar(true));
  }

  function borrarElegido() {
    const s = E.elegido;
    if (!s) return;
    const t = textoLienzo();
    let n = t;
    if (s.tipo === "nodo") n = M.borrarNodo(t, s.id);
    else if (s.tipo === "arista") n = M.borrarArista(t, s.id);
    else if (s.tipo === "evento") { const ev = ultimoResultado?.modelo?.eventos?.[s.id]; if (ev && (ev.tipo === "mensaje" || ev.tipo === "nota")) n = M.borrarLinea(t, ev.linea); }
    if (n === t) return;
    E.elegido = null;
    ponerTextoLienzo(n, { origen: "lienzo" });
  }
  function nodoNuevo(conectarDesde = null) {
    let t = textoLienzo();
    if (M.tipoDiagrama(t).tipo === "vacio") t = "flowchart TD\n";
    const r = conectarDesde ? M.conectarNuevo(t, conectarDesde, tr("Nuevo")) : M.agregarNodo(t, tr("Nuevo"));
    E.lz.mostrar = r.id;
    ponerTextoLienzo(r.texto, { origen: "lienzo" });
    E.elegido = { tipo: "nodo", id: r.id };
    pintarSeleccion();
    requestAnimationFrame(editarEnLugar);
  }

  // Gestos con puntero (mouse, toque y lápiz): elegir, mover, conectar, crear mensajes, desplazar y pellizcar.
  const punteros = new Map();
  let gesto = null;
  function alBajar(e) {
    const lz = $("#lienzo");
    if (!lz || e.target.closest(".lz-herr, .lz-sel, .lz-mini, .tarjeta-ia, .lz-editar")) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      gesto = { tipo: "pellizco", d: Math.hypot(a.x - b.x, a.y - b.y), z: E.lz.z };
      return;
    }
    const p = aContenido(e.clientX, e.clientY);
    const asa = e.target.closest("[data-asa]"), nodo = e.target.closest(".nodo"), arista = e.target.closest("[data-arista]"), vida = e.target.closest(".vida-p"), ev = e.target.closest("[data-evento]");
    const base = { x0: e.clientX, y0: e.clientY, movido: false };
    if (asa) { gesto = { ...base, tipo: "conectar", de: asa.dataset.asa, desde: p }; return; }
    if (nodo) { E.elegido = { tipo: "nodo", id: nodo.dataset.id }; pintarSeleccion(); const g = ultimoResultado?.geo?.nodos?.get(nodo.dataset.id); gesto = { ...base, tipo: "mover", id: nodo.dataset.id, dx: g ? g.x - p.x : 0, dy: g ? g.y - p.y : 0 }; return; }
    if (arista) { E.elegido = { tipo: "arista", id: Number(arista.dataset.arista) }; pintarSeleccion(); gesto = null; return; }
    if (ev && (ev.classList.contains("mensaje") || ev.classList.contains("nota"))) { E.elegido = { tipo: "evento", id: Number(ev.dataset.evento) }; pintarSeleccion(); gesto = null; return; }
    if (vida) { E.elegido = { tipo: "participante", id: vida.dataset.participante }; pintarSeleccion(); gesto = { ...base, tipo: "mensaje", de: vida.dataset.participante, desde: p }; return; }
    if (E.elegido) { E.elegido = null; pintarSeleccion(); }
    gesto = { ...base, tipo: "panear", x: E.lz.x, y: E.lz.y };
  }
  function alMover(e) {
    if (!punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesto) return;
    if (gesto.tipo === "pellizco" && punteros.size === 2) {
      const [a, b] = [...punteros.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = $("#lienzo").getBoundingClientRect();
      zoomEn((gesto.z * d) / gesto.d / E.lz.z, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    const dist = Math.hypot(e.clientX - gesto.x0, e.clientY - gesto.y0);
    if (!gesto.movido && dist < 4) return;
    // La captura recién al arrastrar: si se captura al bajar, el clic y el doble clic llegan al lienzo y no al nodo.
    if (!gesto.movido) try { $("#lienzo")?.setPointerCapture(e.pointerId); } catch { /* el puntero ya se fue */ }
    gesto.movido = true;
    const p = aContenido(e.clientX, e.clientY);
    if (gesto.tipo === "panear") { E.lz.x = gesto.x + e.clientX - gesto.x0; E.lz.y = gesto.y + e.clientY - gesto.y0; $("#lienzo").classList.add("paneando"); aplicarVista(); pintarSeleccion(); }
    else if (gesto.tipo === "mover") { arrastre = { id: gesto.id, x: p.x + gesto.dx, y: p.y + gesto.dy }; dibujarLienzo(false); }
    else if (gesto.tipo === "conectar" || gesto.tipo === "mensaje") {
      const capa = $("#lz-capa");
      capa.querySelector(".provisoria")?.remove();
      const a = gesto.desde;
      const y = gesto.tipo === "mensaje" ? p.y : p.y;
      capa.insertAdjacentHTML("beforeend", `<path class="provisoria" d="M${a.x},${gesto.tipo === "mensaje" ? p.y : a.y}L${p.x},${y}"/>`);
    }
  }
  function alSoltar(e) {
    punteros.delete(e.pointerId);
    $("#lienzo")?.classList.remove("paneando");
    const g = gesto;
    if (!g || punteros.size) { if (!punteros.size) gesto = null; return; }
    gesto = null;
    if (g.tipo === "mover" && arrastre) {
      const a = arrastre; arrastre = null;
      ponerTextoLienzo(M.fijar(textoLienzo(), a.id, a.x, a.y), { origen: "lienzo" });
    } else if (g.tipo === "conectar" && g.movido) {
      $("#lz-capa .provisoria")?.remove();
      const bajo = document.elementFromPoint(e.clientX, e.clientY)?.closest(".nodo");
      if (bajo && bajo.dataset.id !== g.de) { ponerTextoLienzo(M.conectar(textoLienzo(), g.de, bajo.dataset.id), { origen: "lienzo" }); E.elegido = { tipo: "nodo", id: bajo.dataset.id }; pintarSeleccion(); }
      else if (!bajo) nodoNuevo(g.de);
    } else if (g.tipo === "mensaje" && g.movido) {
      $("#lz-capa .provisoria")?.remove();
      const r = ultimoResultado, p = aContenido(e.clientX, e.clientY);
      if (!r?.geo?.participantes) return;
      let mejor = null, dist = Infinity;
      for (const [id, q] of r.geo.participantes) { const d = Math.abs(q.x - p.x); if (d < dist) { dist = d; mejor = id; } }
      // Después del último evento que queda arriba del punto donde se soltó.
      let despues = null;
      const evs = r.modelo.eventos;
      for (const [k, gg] of r.geo.eventos) if (gg.y < p.y) despues = Math.max(despues ?? -1, evs[k].linea);
      if (despues == null) { const decl = r.modelo.participantes.filter((x) => x.decl).map((x) => x.decl.linea); despues = decl.length ? Math.max(...decl) : r.modelo.cabecera; }
      const res = M.agregarMensaje(textoLienzo(), g.de, mejor, despues, tr("Mensaje"));
      ponerTextoLienzo(res.texto, { origen: "lienzo" });
      const k = M.parsearSecuencia(res.texto).eventos.findIndex((x) => x.linea === res.linea);
      if (k >= 0) { E.elegido = { tipo: "evento", id: k }; pintarSeleccion(); requestAnimationFrame(editarEnLugar); }
    }
  }
  function alDobleClic(evento) {
    const objetivo = document.elementFromPoint(evento.clientX, evento.clientY) || evento.target;
    const e = { target: objetivo };
    if (!$("#lienzo")?.contains(e.target) || e.target.closest(".lz-herr, .lz-sel, .lz-mini, .tarjeta-ia, .lz-editar")) return;
    const nodo = e.target.closest(".nodo"), arista = e.target.closest("[data-arista]"), vida = e.target.closest(".vida-p"), ev = e.target.closest("[data-evento]");
    if (nodo) E.elegido = { tipo: "nodo", id: nodo.dataset.id };
    else if (arista) E.elegido = { tipo: "arista", id: Number(arista.dataset.arista) };
    else if (ev && (ev.classList.contains("mensaje") || ev.classList.contains("nota"))) E.elegido = { tipo: "evento", id: Number(ev.dataset.evento) };
    else if (vida) E.elegido = { tipo: "participante", id: vida.dataset.participante };
    else {
      const tipo = M.tipoDiagrama(textoLienzo()).tipo;
      if (tipo === "flujo" || tipo === "vacio") return nodoNuevo();
      if (tipo === "secuencia") { const r = M.agregarParticipante(textoLienzo(), tr("Nuevo")); ponerTextoLienzo(r.texto, { origen: "lienzo" }); E.elegido = { tipo: "participante", id: r.id }; pintarSeleccion(); requestAnimationFrame(editarEnLugar); }
      return;
    }
    pintarSeleccion();
    editarEnLugar();
  }
  function moverSeleccion(dx, dy) {
    const r = ultimoResultado;
    if (!r?.geo?.nodos) return;
    const actual = E.elegido?.tipo === "nodo" ? r.geo.nodos.get(E.elegido.id) : null;
    let mejor = null, d = Infinity;
    for (const [id, n] of r.geo.nodos) {
      if (!actual) { if (n.y + n.x < d) { d = n.y + n.x; mejor = id; } continue; }
      const vx = n.x - actual.x, vy = n.y - actual.y;
      if (id === E.elegido.id || vx * dx + vy * dy <= 0) continue;
      const dd = Math.hypot(vx, vy) + Math.abs(dx ? vy : vx) * 2;
      if (dd < d) { d = dd; mejor = id; }
    }
    if (mejor) { E.elegido = { tipo: "nodo", id: mejor }; pintarSeleccion(); }
  }

  // ───────────── Menús (formas, flechas, exportar) ─────────────
  const FORMAS = [
    ["Básicas", [["rectangulo", null, "Proceso"], ["redondeado", null, "Redondeado"], ["rombo", null, "Decisión"], ["estadio", null, "Inicio o fin"], ["paralelogramo", null, "Entrada o salida"], ["subrutina", null, "Subproceso"], ["cilindro", null, "Datos"], ["circulo", null, "Círculo"], ["hexagono", null, "Preparación"], ["documento", null, "Documento"]]],
    ["Arquitectura", [["rectangulo", "servidor", "Servicio"], ["cilindro", "base-de-datos", "Base de datos"], ["rectangulo", "cola", "Cola"], ["estadio", "persona", "Persona"], ["redondeado", "nube", "Nube o externo"], ["rectangulo", "navegador", "Web"], ["rectangulo", "movil", "Celular"], ["rectangulo", "funcion", "Función"], ["cilindro", "almacenamiento", "Almacenamiento"], ["rectangulo", "candado", "Seguridad"], ["rectangulo", "balanceador", "Balanceador"], ["hexagono", "api", "API"], ["rectangulo", "correo", "Correo"], ["rectangulo", "reloj", "Tarea programada"]]],
    ["Procesos (BPMN)", [["circulo", null, "Evento de inicio"], ["doble-circulo", null, "Evento de fin"], ["redondeado", null, "Tarea"], ["rombo", null, "Compuerta"]]],
  ];
  function menu() {
    const m = E.menu;
    if (!m) return "";
    let h = "";
    if (m.tipo === "formas") {
      h = FORMAS.map(([g, l]) => `<h4>${g}</h4><div class="rejilla">${l.map(([f, i, n]) => `<button data-forma="${f}" data-icono="${i || ""}">${i ? M.iconoSVG(i) : formaMini(f)} ${n}</button>`).join("")}</div>`).join("");
    } else if (m.tipo === "flechas") {
      const actual = ultimoResultado?.modelo?.meta?.aristas || "curva";
      h = [["curva", "Curvas"], ["recta", "Rectas"], ["ortogonal", "En ángulo recto"]].map(([v, n]) => `<button data-flechas="${v}" aria-pressed="${actual === v}"><span aria-hidden="true" style="width:12px">${actual === v ? "✓" : ""}</span>${n}</button>`).join("");
    } else if (m.tipo === "elementos") {
      h = P.menuElementosHTML();
    } else if (m.tipo === "archivo") {
      h = `<button data-abrir="${esc(m.ruta)}">${ic("doc")} Abrir</button>${P.puedeBorrar(m.ruta) ? `<button data-p-borrar="${esc(m.ruta)}" class="peligro">${ic("borrar")} ${P.puedeBorrar(m.ruta) === "papelera" ? "Mandar a la Papelera…" : "Borrar…"}</button>` : `<p class="menu-nota">Esquema no borra archivos del código</p>`}`;
    } else if (m.tipo === "exportar") {
      h = `<button data-exportar="svg">${ic("exportar")} SVG</button><button data-exportar="png">${ic("exportar")} PNG</button><button data-exportar="md">${ic("doc")} Markdown con Mermaid</button><button data-exportar="github">${ic("copiar")} Copiar para GitHub</button>`;
    }
    return `<div class="menu" id="menu" role="menu" style="left:${Math.round(m.x)}px;top:${Math.round(m.y)}px">${h}</div>`;
  }
  const formaMini = (f) => { const t = M.tamanoForma(f, 20, 10), e = 14 / Math.max(t.w, t.h); return `<svg class="ic esq" viewBox="${-t.w / 2 - 2} ${-t.h / 2 - 2} ${t.w + 4} ${t.h + 4}" aria-hidden="true" style="width:${Math.max(12, t.w * e)}px">${M.dibujarForma(f, t.w, t.h)}</svg>`; };
  function abrirMenu(tipo, boton) {
    const b = boton.getBoundingClientRect();
    const ancho = tipo === "formas" ? 360 : tipo === "elementos" ? 280 : 240;
    let x = Math.min(window.innerWidth - ancho - 8, Math.max(8, b.left)), y = b.bottom + 6;
    if (y > window.innerHeight * 0.55) y = Math.max(8, b.top - 6 - (tipo === "formas" ? 420 : 170));
    E.menu = E.menu?.tipo === tipo ? null : { tipo, x, y };
    pintarMenu();
  }
  function pintarMenu() { $("#menu")?.remove(); if (E.menu) { document.getElementById("app").insertAdjacentHTML("beforeend", menu()); traducirDOM($("#menu")); $("#menu button")?.focus(); } }

  // ───────────── Exportar ─────────────
  function resultadoExportable() { const t = textoLienzo(); const r = M.dibujar(t, { prefijo: "x" }); return { r, t }; }
  function nombreBase() { const n = nombreDe(E.sel || "diagrama").replace(/\.[^.]+$/, ""); return E.bloque != null ? `${n}-${E.bloque + 1}` : n; }
  function exportar(formato) {
    E.menu = null; pintarMenu();
    const { r, t } = resultadoExportable();
    if (formato === "github") return host.enviar("copiar", { texto: "```mermaid\n" + t.replace(/\n+$/, "") + "\n```\n" });
    if (formato === "md") return host.enviar("exportar", { formato: "md", nombre: nombreBase() + ".md", texto: "```mermaid\n" + t.replace(/\n+$/, "") + "\n```\n" });
    if (r.errores?.length || !r.partes.length) return toast("Corrige el diagrama antes de exportarlo");
    const svg = M.svgCompleto(r, { tema: "claro", titulo: nombreBase() });
    if (formato === "svg") return host.enviar("exportar", { formato: "svg", nombre: nombreBase() + ".svg", texto: svg });
    // PNG: el mismo SVG dibujado en un canvas al doble de tamaño, con fondo blanco.
    const img = new Image();
    img.onload = () => {
      const esc2 = 2, c = document.createElement("canvas");
      c.width = Math.ceil(img.width * esc2); c.height = Math.ceil(img.height * esc2);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      host.enviar("exportar", { formato: "png", nombre: nombreBase() + ".png", base64: c.toDataURL("image/png").split(",")[1] });
    };
    img.onerror = () => toast("No pude crear la imagen");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // ───────────── Vista del documento ─────────────
  let temporizadorVista = null;
  function programarVistaDoc() { clearTimeout(temporizadorVista); temporizadorVista = setTimeout(pintarVistaDoc, 90); }
  /** La vista del documento, por partes: cada bloque de primer nivel (párrafo, título, tabla, diagrama…) se compara con el que ya
   *  está y solo se crea lo que cambió. Escribir en un párrafo no vuelve a dibujar los diagramas ni rearma el resto (y lo que no
   *  cambió conserva el foco y el hover). */
  const claveVista = new WeakMap();
  function pintarVistaDoc() {
    const v = $("#vista-md"), d = doc();
    if (!v || !d || d.texto == null) return;
    const bloques = M.bloquesMermaid(d.texto);
    const plantilla = document.createElement("template");
    plantilla.innerHTML = M.markdownHTML(d.texto);
    // Lo que ya está, por clave (un mismo párrafo puede repetirse: una fila por clave).
    const antes = new Map();
    for (const el of v.children) { const k = claveVista.get(el); if (k == null) continue; if (!antes.has(k)) antes.set(k, []); antes.get(k).push(el); }
    const nuevos = [];
    for (const el of [...plantilla.content.children]) {
      const fig = el.matches("figure.md-diagrama"), k = fig ? Number(el.dataset.bloque) : -1;
      // Un diagrama con error muestra su línea del documento: entonces la clave también lleva dónde empieza.
      const b = bloques[k], conError = fig && b && resultadoBloque(b.contenido, "md" + k).errores?.length;
      const clave = fig ? `d|${k}|${conError ? b.ini : ""}|${b?.contenido ?? ""}` : "h|" + el.outerHTML;
      const igual = antes.get(clave)?.shift();
      if (igual) { if (fig) igual.dataset.linea = el.dataset.linea; nuevos.push(igual); continue; }
      claveVista.set(el, clave);
      if (fig) dibujarFigura(el, b, k);
      nuevos.push(el);
    }
    // Primero se quita lo que ya no está (y los espacios entre bloques); después cada uno a su lugar, sin mover lo que ya está bien.
    const quedan = new Set(nuevos);
    for (const n of [...v.childNodes]) if (!quedan.has(n)) n.remove();
    nuevos.forEach((el, i) => { if (v.children[i] !== el) v.insertBefore(el, v.children[i] || null); });
  }
  function dibujarFigura(fig, b, k) {
    if (!b) return;
    const r = resultadoBloque(b.contenido, "md" + k);
    let h = "";
    if (r.tipo === "pendiente") h = `<p class="pendiente">${T("Esquema todavía no dibuja «{x}». Lo dejo tal cual: GitHub sí lo muestra.", { x: r.palabra })}</p><pre><code>${esc(b.contenido)}</code></pre>`;
    else if (r.errores?.length) h = `<p class="error">${T("Línea {n}", { n: r.errores[0].linea + b.ini + 1 })} · ${fraseProblema(r.errores[0])}</p><pre><code>${esc(b.contenido)}</code></pre>`;
    else if (r.partes.length) h = M.svgCompleto(r, { estilo: "", titulo: T("Diagrama {n}", { n: k + 1 }) });
    fig.innerHTML = h + (r.tipo === "flujo" || r.tipo === "secuencia" ? `<button class="boton editar" data-editar-bloque="${k}">${ic("lapiz")} ${T("Editar")}</button>` : "");
    fig.tabIndex = 0;
  }

  // ───────────── Diálogos ─────────────
  function dialogos() {
    const capa = (id, html, clase = "") => `<div class="capa"><div class="dialogo ${clase}" role="dialog" aria-modal="true" aria-labelledby="${id}">${html}</div></div>`;
    if (bv.soloIdioma) return `<div class="capa capa-idioma"><div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="t-bv">${bv.html()}</div></div>`;
    if (bv.activa) return capa("t-bv", bv.html(), "bienvenida");
    // titulo y texto llegan como HTML ya escapado (frase() o esc() del texto en español; traducirDOM lo traduce); los botones, como texto.
    const dp = P.dialogoHTML(capa); if (dp && !E.confirmar) return dp;
    if (E.confirmar) return capa("t-conf", `<h2 id="t-conf" ${E.confirmar.traducido ? "data-sin-traducir" : ""}>${E.confirmar.titulo}</h2><p ${E.confirmar.traducido ? "data-sin-traducir" : ""}>${E.confirmar.texto}</p><div class="pie-dialogo" ${E.confirmar.traducido ? "data-sin-traducir" : ""}><button class="boton" data-accion="confirmar-no">${esc(E.confirmar.no)}</button><button class="boton principal${E.confirmar.peligro ? " peligro-lleno" : ""}" data-accion="confirmar-si" data-autofoco>${esc(E.confirmar.si)}</button></div>`);
    if (E.ajustes) return capa("t-aj", dialogoAjustes(), "ajustes");
    if (E.readme) return capa("t-rm", dialogoReadme(), "ancho");
    if (E.dibujar) return capa("t-dj", dialogoDibujar());
    if (E.nuevo) return capa("t-nv", dialogoNuevo(), "ancho");
    return "";
  }
  // Lo que manda la pieza «actualizaciones» (y los avisos propios de la app, con la misma forma): `texto` es la frase en
  // español con marcadores y `valores` lo que va en ellos; se traduce aquí, al pintar (T escapa todo). Las notas del Release van tal cual.
  const frasePieza = (r) => (r && typeof r.texto === "string" && r.texto ? T(r.texto, r.valores && typeof r.valores === "object" ? r.valores : {}) : "");
  const versionNueva = (r) => (r && r.hay ? { hay: true, texto: String(r.texto || ""), valores: r.valores || {}, notas: String(r.notas || "") } : { hay: false });
  /** Ajustes → Actualizaciones: buscar, el aviso de versión nueva con sus notas y el avance por pasos al instalarla. */
  function filaActualizacion() {
    const v = E.revisando, a = E.actualizacion || {};
    if (v && typeof v === "object") {
      const pct = typeof v.pct === "number" ? ` · ${Math.max(0, Math.min(100, Math.round(v.pct)))}%` : "";
      const error = v.paso === "error";
      return `<div class="fila"><span class="txt"><b class="${error ? "error-texto" : ""}" data-sin-traducir>${frasePieza(v)}${pct}</b>${error ? "" : frase("Paso {n} de 3", { n: v.paso }, "small")}</span>${error ? `<button class="boton" data-accion="buscar-actualizacion">Buscar de nuevo</button>` : ""}</div>`;
    }
    if (a.hay) {
      const detalle = [frasePieza(a), esc(a.notas)].filter(Boolean).join("\n");
      return `<div class="fila"><span class="txt"><b>Hay una versión nueva de Esquema</b><small class="notas-version" data-sin-traducir>${detalle}</small></span><button class="boton principal" data-accion="actualizar">Actualizar ahora</button></div>`;
    }
    const estado = v === "buscando" ? "Buscando…" : v === "al-dia" ? "Estás en la última versión" : v === "sin-conexion" ? "No pude revisar: sin conexión" : "Esquema revisa sola si hay versiones nuevas.";
    return `<div class="fila"><span class="txt">${estado}</span><button class="boton" data-accion="buscar-actualizacion" ${v === "buscando" ? "disabled" : ""}>Buscar actualizaciones</button></div>`;
  }
  function filasIA() {
    if (!E.ias.length) return `<p>No encontré ninguna IA instalada. Puedes instalar Claude Code, Codex o Gemini y probarla en Ajustes.</p>`;
    return E.ias.map((ia) => {
      const r = E.resultadoIA[ia.id], elegida = (E.config.ia || "claude") === ia.id;
      const estado = E.probando[ia.id] ? `<span class="giro"></span>` : r ? (r.ok ? `<span class="ok" data-sin-traducir>${T("Lista")}</span>` : `<span class="mal-txt" data-sin-traducir>${esc(r.error || "")}</span>`) : "";
      return `<div class="fila"><span class="txt"><b data-sin-traducir>${esc(ia.nombre)}</b><small>${ia.instalada ? (elegida ? "Elegida" : "Instalada") : "No está instalada"}</small></span>${estado}<button class="boton ${elegida ? "principal" : ""}" data-probar-ia="${ia.id}" ${ia.instalada ? "" : "disabled"}>${elegida && r?.ok ? "Probar otra vez" : "Usar y probar"}</button></div>`;
    }).join("");
  }
  function dialogoAjustes() {
    const tema = E.config.tema || "sistema";
    return `<h2 id="t-aj">Ajustes</h2>
      <h3>Idioma</h3><div class="seg" role="group" aria-label="Idioma" data-sin-traducir><button data-ajuste-idioma="es" aria-pressed="${E.idioma === "es"}" lang="es">Español</button><button data-ajuste-idioma="en" aria-pressed="${E.idioma === "en"}" lang="en">English</button></div>
      <h3>Tema</h3><div class="seg" role="group" aria-label="Tema">${[["sistema", "Como el sistema"], ["claro", "Claro"], ["oscuro", "Oscuro"]].map(([v, n]) => `<button data-tema="${v}" aria-pressed="${tema === v}">${n}</button>`).join("")}</div>
      <h3>Tu IA</h3>${filasIA()}
      <h3>Actualizaciones</h3>${filaActualizacion()}
      <h3>Acerca de</h3>
      <p>${frase("Esquema {v} · Gratis y abierto (AGPL-3.0). Sin cuentas ni telemetría: tus archivos no salen de tu computador.", { v: E.version || "" })}</p>
      <div class="chips"><button class="chip" data-enlace="${ENLACES.sitio}">Sitio</button><button class="chip" data-enlace="${ENLACES.codigo}">Código</button><button class="chip" data-enlace="${ENLACES.comunidad}">Comunidad</button><button class="chip" data-enlace="${ENLACES.catalogo}">Catálogo de plantillas</button></div>
      <div class="pie-dialogo"><button class="boton principal" data-accion="cerrar" data-autofoco>Listo</button></div>`;
  }
  const textoDe = (o) => (o && typeof o === "object" ? o[E.idioma] || o.es || o.en || "" : o || "");
  function previaPlantilla(pl) {
    if (pl.tipo === "documento") return ic("doc");
    const t = textoDe(pl.contenido);
    const r = resultadoBloque(t, "pl-" + pl.id);
    return r.partes.length && !r.errores.length ? M.svgCompleto(r, { estilo: "", margen: 8 }) : ic("diagrama");
  }
  function plantillasFiltradas() {
    const n = E.nuevo, q = (n.busqueda || "").trim().toLowerCase();
    return E.plantillas.filter((p) => (n.categoria === "todas" || p.categoria === n.categoria) && (!q || `${textoDe(p.nombre)} ${textoDe(p.descripcion)} ${p.categoria}`.toLowerCase().includes(q)));
  }
  const NOMBRE_CAT = { todas: "Todas", arquitectura: "Arquitectura", secuencia: "Secuencia de API", "flujo-de-usuario": "Flujo de usuario", proceso: "Proceso de negocio", documentacion: "Documentación" };
  function dialogoNuevo() {
    const n = E.nuevo, comunidad = n.fuente === "comunidad", lista = plantillasFiltradas(), el = E.plantillas.find((p) => p.id === n.elegida);
    const blancos = [["blanco-flujo", "Diagrama de flujo", "flowchart TD\n    A[Inicio] --> B[Siguiente paso]\n", "diagrama.mmd"], ["blanco-secuencia", "Diagrama de secuencia", "sequenceDiagram\n    participant A as Cliente\n    participant B as Servidor\n    A->>B: Pedido\n    B-->>A: Respuesta\n", "secuencia.mmd"], ["blanco-doc", "Documento", "# Título\n\nEscribe aquí.\n", "documento.md"]];
    const q = (n.busqueda || "").trim();
    const cab = P.nuevoCabHTML();
    return `<div class="titulo-nuevo"><h2 id="t-nv">${cab.titulo}</h2></div>
      ${cab.tarjetas && !q ? `<div class="nuevo-ia">${cab.tarjetas}</div><h3 class="nuevo-sub">Desde una plantilla</h3>` : ""}
      <div class="seg nuevo-fuente" role="group" aria-label="Plantillas"><button data-fuente="app" aria-pressed="${!comunidad}">Plantillas</button><button data-fuente="comunidad" aria-pressed="${comunidad}">Comunidad</button></div>
      <div class="buscar-fila"><input type="search" id="buscar-plantilla" placeholder="Buscar plantillas" value="${esc(n.busqueda || "")}" aria-label="Buscar plantillas" data-sin-traducir data-autofoco></div>
      <div class="chips" style="margin-top:10px">${["todas", ...CATEGORIAS].map((c) => `<button class="chip" data-categoria="${c}" aria-pressed="${n.categoria === c}">${NOMBRE_CAT[c]}</button>`).join("")}</div>
      ${comunidad ? catalogoHTML(q) : `<div class="plantillas">
        ${n.categoria === "todas" && !q ? `${cab.readme ? `<button class="plantilla ia" data-accion="readme"><span class="previa">${ic("github")}</span><span class="info"><b>README para GitHub</b><small>Tu IA lo escribe desde lo que cuentas y la lista de archivos.</small></span></button>` : ""}
          ${blancos.map(([id, nom, , ]) => `<button class="plantilla" data-plantilla="${id}" aria-pressed="${n.elegida === id}"><span class="previa">${ic(id === "blanco-doc" ? "doc" : "diagrama")}</span><span class="info"><b>${nom}</b><small>En blanco</small></span></button>`).join("")}` : ""}
        ${lista.map((p) => `<button class="plantilla" data-plantilla="${esc(p.id)}" aria-pressed="${n.elegida === p.id}" data-sin-traducir><span class="previa">${previaPlantilla(p)}</span><span class="info"><b>${esc(textoDe(p.nombre))}</b><small>${esc(textoDe(p.descripcion))}</small></span></button>`).join("")}
      </div>`}
      ${!comunidad && q && !lista.length ? `<div class="vacio">${frase("Aún no hay una plantilla de «{x}».", { x: q }, "p")}<button class="boton principal" data-accion="dibujame-busqueda">${ic("chispa")} Pídesela a tu IA</button></div>` : ""}
      ${n.elegida ? `<label for="nombre-nuevo">Nombre del archivo</label><input type="text" id="nombre-nuevo" value="${esc(n.nombre || "")}" data-sin-traducir>${n.errorNombre ? `<p class="mal-txt">${n.errorNombre}</p>` : ""}` : ""}
      <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="crear" ${n.elegida ? "" : "disabled"}>Crear</button></div>`;
    void el; void blancos;
  }
  /** «Comunidad» en «Nuevo»: el catálogo esquema-app/esquema-catalogo (la app lo baja y bin/plantillas.py lo valida). Tocar una
   *  plantilla la descarga (huella revisada por la app) y la deja elegida; las descargadas quedan también en «Plantillas». */
  const enMisPlantillas = (p) => E.plantillas.some((x) => x.id === p.id && textoDe(x.contenido) === textoDe(p.contenido));
  function catalogoFiltrado() {
    const n = E.nuevo, q = (n.busqueda || "").trim().toLowerCase();
    return (E.catalogo?.plantillas || []).filter((p) => (n.categoria === "todas" || p.categoria === n.categoria)
      && (!q || `${textoDe(p.nombre)} ${textoDe(p.descripcion)} ${p.categoria} ${(p.etiquetas || []).join(" ")}`.toLowerCase().includes(q)));
  }
  function catalogoHTML(q) {
    const c = E.catalogo, n = E.nuevo;
    if (!c || c.estado === "cargando") return `<div class="esperando"><span class="giro"></span>Buscando plantillas de la comunidad…</div>`;
    if (c.estado === "error") return `<div class="vacio"><p data-sin-traducir>${esc(c.error || tr("No pude conectarme. Revisa tu conexión."))}</p><button class="boton" data-accion="explorar">Reintentar</button></div>`;
    const lista = catalogoFiltrado();
    const estado = (p) => c.bajando[p.id] ? frase("Descargando…", {}, "small") : enMisPlantillas(p) ? frase("En tus plantillas", {}, "small") : frase("Toca para descargarla", {}, "small");
    return `<div class="plantillas">${lista.map((p) => `<button class="plantilla" data-catalogo="${esc(p.id)}" aria-pressed="${n.elegida === p.id}" ${c.bajando[p.id] ? "aria-busy=\"true\"" : ""} data-sin-traducir><span class="previa">${previaPlantilla(p)}</span><span class="info"><b>${esc(textoDe(p.nombre))}</b><small>${esc(textoDe(p.descripcion))}</small>${p.autor ? frase("por {x}", { x: p.autor }, "small") : ""}<span class="estado-catalogo">${estado(p)}</span></span></button>`).join("")}</div>
      ${!lista.length ? `<div class="vacio">${q ? frase("Aún no hay una plantilla de «{x}».", { x: q }, "p") : `<p>Todavía no hay plantillas de la comunidad en esta categoría.</p>`}${q ? `<button class="boton principal" data-accion="dibujame-busqueda">${ic("chispa")} Pídesela a tu IA</button>` : ""}</div>` : ""}
      <p class="proponer"><button class="enlace" data-enlace="${ENLACES.proponer}">¿Hiciste una buena? Compártela con la comunidad</button></p>`;
  }
  function contenidoBlanco(id) {
    return { "blanco-flujo": [tr("flowchart TD\n    A[Inicio] --> B[Siguiente paso]\n"), "diagrama.mmd"], "blanco-secuencia": [tr("sequenceDiagram\n    participant A as Cliente\n    participant B as Servidor\n    A->>B: Pedido\n    B-->>A: Respuesta\n"), "secuencia.mmd"], "blanco-doc": [tr("# Título\n\nEscribe aquí.\n"), "documento.md"] }[id];
  }
  function nombreLibre(nombre) {
    const usados = new Set(E.archivos.map((a) => a.ruta));
    if (!usados.has(nombre)) return nombre;
    const m = /^(.*?)(\.[^.]+)$/.exec(nombre) || [, nombre, ""];
    let k = 2; while (usados.has(`${m[1]}-${k}${m[2]}`)) k++;
    return `${m[1]}-${k}${m[2]}`;
  }
  /** Nombre de archivo válido: relativo, sin «..», terminado en .md o .mmd. Devuelve el error (texto) o "". */
  function validarNombre(n) {
    if (!n || !n.trim()) return "Escribe un nombre.";
    if (/(^|\/)\.\.(\/|$)|^\/|\\|[<>:"|?*\u0000-\u001f]/.test(n)) return "Usa solo letras, números, guiones y «/» para carpetas.";
    if (!/\.(md|mmd)$/i.test(n)) return "Termina el nombre en .md (documento) o .mmd (diagrama).";
    if (E.archivos.some((a) => a.ruta === n)) return "Ya hay un archivo con ese nombre.";
    return "";
  }
  function elegirPlantilla(id) {
    E.nuevo.elegida = id; E.nuevo.errorNombre = null;
    const pl = E.plantillas.find((p) => p.id === id);
    const base = pl ? textoDe(pl.archivo) : contenidoBlanco(id)[1];
    E.nuevo.nombre = nombreLibre(P.prefijoNuevo(esDiagrama(base)) + base);
    pintar(); $("#nombre-nuevo")?.focus();
  }
  function pedirCatalogo() { E.catalogo = { estado: "cargando", plantillas: [], bajando: {} }; host.enviar("catalogoPlantillas"); }
  function crearDesdePlantilla() {
    const n = E.nuevo;
    const nombre = ($("#nombre-nuevo")?.value || n.nombre || "").trim();
    const error = validarNombre(nombre);
    if (error) { n.nombre = nombre; n.errorNombre = tr(error); return pintar(); }
    const pl = E.plantillas.find((p) => p.id === n.elegida);
    const texto = pl ? textoDe(pl.contenido) : contenidoBlanco(n.elegida)[0];
    E.nuevo = null;
    crearArchivo(nombre, texto);
  }
  function crearArchivo(ruta, texto) {
    E.archivos.push({ ruta }); E.archivos.sort(porRuta);
    E.docs[ruta] = { texto, guardado: null, estado: "guardando", pila: [], futuro: [] };
    host.enviar("guardarArchivo", { ruta, texto, nuevo: true });
    abrir(ruta);
  }

  // Dibújame: la IA propone un diagrama; se valida con el motor antes de aplicarlo y queda como un cambio que se puede quitar.
  const EJEMPLOS_DIBUJO = ["El registro de una persona: correo, verificación y bienvenida", "Arquitectura: app web, API, base de datos y cola de correos", "Secuencia de un pago con tarjeta entre app, API y banco"];
  const EJEMPLOS_PROYECTO = ["El flujo de iniciar sesión", "La secuencia de guardar un cambio, de la pantalla a la base de datos", "La arquitectura del proyecto"];
  function dialogoDibujar() {
    const d = E.dibujar, hayDiagrama = !d.nuevo && !!textoLienzo().trim(), titulo = d.nuevo ? "Crear diagrama" : "Dibújame";
    const ejemplos = d.nuevo ? EJEMPLOS_PROYECTO : EJEMPLOS_DIBUJO;
    if (d.enviando) return `<h2 id="t-dj">${titulo}</h2><div class="esperando"><span class="giro"></span>${frase("{ia} está dibujando…", { ia: nombreIA() })}</div><p class="p-ayuda">Puedes cerrar esto y seguir trabajando: el diagrama aparece cuando tu IA responda.</p><div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cerrar</button></div>`;
    return `<h2 id="t-dj">${titulo}</h2>
      <p>${d.nuevo ? "Dile a tu IA qué quieres ver: «el flujo de…», «la secuencia de…» o «la arquitectura de…»." : "Cuéntale a tu IA qué quieres ver. Revisa el resultado en el lienzo: si no te gusta, lo quitas con un toque."}</p>
      <textarea id="pedido-dibujo" placeholder="${d.nuevo ? "Por ejemplo: la secuencia de un pago, desde la app hasta el banco" : "Por ejemplo: el flujo de compra de una tienda, con pago y despacho"}" data-autofoco data-sin-traducir>${esc(d.pedido || "")}</textarea>
      <div class="chips" style="margin-top:8px">${ejemplos.map((x, i) => `<button class="chip" data-ejemplo-dibujo="${i}">${x}</button>`).join("")}</div>
      <label>Tipo</label><div class="chips">${[["auto", "Que elija"], ["flujo", "Flujo"], ["secuencia", "Secuencia"], ["arquitectura", "Arquitectura"]].map(([v, n]) => `<button class="chip" data-tipo-dibujo="${v}" aria-pressed="${(d.tipo || "auto") === v}">${n}</button>`).join("")}</div>
      ${hayDiagrama ? `<label class="marcar"><input type="checkbox" id="cambiar-actual" ${d.cambiar ? "checked" : ""}> <span>Cambiar el diagrama que tengo abierto<small>${esDocumento(E.sel) ? "Si no, agrega uno nuevo al documento." : "Si no, crea uno nuevo."}</small></span></label>` : ""}
      ${E.carpeta ? `<label class="marcar"><input type="checkbox" id="usar-codigo" ${d.codigo ? "checked" : ""}> <span>Que lea el código de esta carpeta${frase("Antes de enviar te muestro exactamente qué va. Queda en la documentación del proyecto ({x}).", { x: (E.proyecto?.docs || "docs/esquema") + "/diagramas/" }, "small")}</span></label>` : ""}
      ${d.error ? `<p class="mal-txt" data-sin-traducir>${d.error}</p>` : ""}
      ${cambiosDelArchivo()}
      <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="enviar-dibujo">${ic("chispa")} Dibujar</button></div>`;
  }
  function cambiosDelArchivo() {
    const l = E.cambiosIA.filter((c) => c.ruta === E.sel);
    if (!l.length) return "";
    return `<label>Lo que hizo tu IA en este archivo</label><div class="cambios-ia">${l.slice().reverse().map((c) => `<div class="cambio-ia ${c.estado}"><b data-sin-traducir>${esc(c.pedido)}</b><span class="meta" data-sin-traducir>${c.estado === "quitado" ? T("Quitado") : esc(resumenCambio(c))}</span>${c.estado === "aplicado" ? `<div><button class="boton" data-quitar-ia="${c.id}">${ic("deshacer")} Quitar este cambio</button></div>` : ""}</div>`).join("")}</div>`;
  }
  /** Qué cambió: nodos y conexiones (o participantes y mensajes) antes y después. */
  function resumen(antes, despues) {
    const cuenta = (t) => {
      const tipo = M.tipoDiagrama(t).tipo;
      if (tipo === "flujo") { const D = M.parsearFlujo(t); return { tipo, a: D.nodos.size, b: D.aristas.length }; }
      if (tipo === "secuencia") { const S = M.parsearSecuencia(t); return { tipo, a: S.participantes.length, b: S.eventos.filter((e) => e.tipo === "mensaje").length }; }
      return { tipo, a: 0, b: 0 };
    };
    const x = cuenta(antes || ""), y = cuenta(despues);
    return { tipo: y.tipo, nodos: y.a - (x.tipo === y.tipo ? x.a : 0), aristas: y.b - (x.tipo === y.tipo ? x.b : 0) };
  }
  function resumenCambio(c) {
    const r = c.resumen, s = (n) => (n > 0 ? "+" + n : String(n));
    return r.tipo === "secuencia" ? Tp("{a} participantes · {b} mensajes", { a: s(r.nodos), b: s(r.aristas) }) : Tp("{a} nodos · {b} conexiones", { a: s(r.nodos), b: s(r.aristas) });
  }
  function enviarDibujo() {
    const d = E.dibujar;
    d.pedido = ($("#pedido-dibujo")?.value || "").trim();
    d.cambiar = !!$("#cambiar-actual")?.checked;
    d.codigo = !!$("#usar-codigo")?.checked;
    if (!d.pedido) { d.error = tr("Escribe qué quieres que dibuje."); return pintar(); }
    const tipo = d.tipo && d.tipo !== "auto" ? d.tipo : tipoDelPedido(d.pedido);
    // Con el código: el mismo camino que «Documentar un flujo» (ver lo que se envía, la IA puede pedir archivos, propuestas que se revisan).
    if (d.codigo && E.carpeta) { E.dibujar = null; P.pedirIA("flujo", { pedido: d.pedido, tipo, forma: "diagrama" }); return; }
    d.enviando = true; d.error = null;
    host.enviar("dibujar", { pedido: d.pedido, tipo, actual: d.cambiar ? textoLienzo() : "", idioma: E.idioma });
    pintar();
  }
  function aplicarDibujo(texto) {
    const d = E.dibujar, dc = doc();
    const r = M.dibujar(texto);
    if (r.errores?.length || !(r.tipo === "flujo" || r.tipo === "secuencia")) {
      d.enviando = false;
      d.error = r.errores?.length ? T("La propuesta tenía un error (línea {n}: {x}). No la apliqué; pídelo otra vez con más detalle.", { n: r.errores[0].linea, x: M.frase(r.errores[0]) }) : T("La respuesta no era un diagrama que Esquema sepa dibujar. No apliqué nada.");
      return pintar();
    }
    // Sin archivo abierto (o desde «Crear diagrama»): un diagrama nuevo con el nombre de lo que se pidió.
    if (d.nuevo || !dc) {
      E.dibujar = null;
      const ruta = nombreLibre("diagramas/" + nombreDesde(d.pedido, "diagrama") + ".mmd");
      crearArchivo(ruta, texto); registrarCambioIA(d.pedido, "", texto, ruta, ""); return;
    }
    const antesDoc = dc.texto;
    const antesDiagrama = d.cambiar ? textoLienzo() : "";
    if (esDiagrama(E.sel)) {
      if (d.cambiar || !dc.texto.trim()) cambiarTexto(texto, { origen: "ia" });
      else { E.dibujar = null; const ruta = nombreLibre(carpetaDe(E.sel) ? carpetaDe(E.sel) + "/dibujo.mmd" : "dibujo.mmd"); crearArchivo(ruta, texto); registrarCambioIA(d.pedido, "", texto, ruta, ""); return; }
    } else if (d.cambiar && E.bloque != null) cambiarTexto(M.reemplazarBloque(dc.texto, E.bloque, texto), { origen: "ia" });
    else {
      const t = $("#texto");
      const linea = t && document.activeElement === t ? t.value.slice(0, t.selectionStart).split("\n").length - 1 : null;
      const res = M.insertarBloque(dc.texto, texto, linea);
      cambiarTexto(res.texto, { origen: "ia" });
      E.bloque = res.k;
    }
    E.dibujar = null;
    E.vista = movil() ? "dibujo" : "ambos";
    E.lz.ajustar = true;
    registrarCambioIA(d.pedido, antesDiagrama, texto, E.sel, antesDoc);
  }
  function registrarCambioIA(pedido, antes, despues, ruta, antesDoc) {
    const c = { id: "ia-" + Date.now().toString(36), ruta, pedido, antes, despues, antesDoc, despuesDoc: E.docs[ruta]?.texto, estado: "aplicado", resumen: resumen(antes, despues) };
    E.cambiosIA.push(c);
    E.tarjetaIA = c.id;
    pintar();
  }
  function pintarTarjetaIA() {
    const el = $("#lz-tarjeta");
    if (!el) return;
    const c = E.cambiosIA.find((x) => x.id === E.tarjetaIA && x.ruta === E.sel && x.estado === "aplicado");
    el.className = c ? "tarjeta-ia" : "";
    el.innerHTML = c ? `<p>${ic("chispa")} <b data-sin-traducir>${esc(c.pedido)}</b></p><p class="meta" data-sin-traducir>${esc(resumenCambio(c))}</p><div class="acciones"><button class="boton" data-quitar-ia="${c.id}">${ic("deshacer")} Quitar este cambio</button><button class="boton plano" data-accion="cerrar-tarjeta">Se queda</button></div>` : "";
    traducirDentro(el);
  }
  /** Quita justo lo que hizo la IA. Si la persona lo editó después, pregunta antes (y se puede deshacer). */
  function quitarCambioIA(id, forzar = false) {
    const c = E.cambiosIA.find((x) => x.id === id);
    if (!c || c.estado !== "aplicado") return;
    if (E.sel !== c.ruta) abrir(c.ruta);
    const d = E.docs[c.ruta];
    if (!d || d.texto == null) return;
    const intacto = d.texto === c.despuesDoc;
    if (!intacto && !forzar) {
      E.confirmar = { titulo: esc("¿Quitar el cambio de la IA?"), texto: esc("Lo editaste después. Si lo quitas, también se van esos cambios (puedes deshacerlo)."), si: "Quitar igual", no: "Dejarlo", accion: () => quitarCambioIA(id, true) };
      return pintar();
    }
    if (c.antesDoc != null && c.antesDoc !== "") cambiarTexto(c.antesDoc, { origen: "ia" });
    else if (esDiagrama(c.ruta)) cambiarTexto(c.antes || "", { origen: "ia" });
    else cambiarTexto(c.antesDoc || "", { origen: "ia" });
    c.estado = "quitado";
    if (E.bloque != null && !M.bloquesMermaid(d.texto)[E.bloque]) E.bloque = null;
    E.tarjetaIA = null; E.lz.ajustar = true;
    toast("Quité el cambio de la IA");
    pintar();
  }

  // README para GitHub
  function dialogoReadme() {
    const r = E.readme;
    const hay = E.archivos.some((a) => a.ruta.toLowerCase() === "readme.md");
    if (r.paso === "escribiendo") return `<h2 id="t-rm">README para GitHub</h2><div class="esperando"><span class="giro"></span>${frase("{ia} está escribiendo tu README…", { ia: nombreIA() })}</div><div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button></div>`;
    if (r.paso === "listo") {
      const bloques = M.bloquesMermaid(r.texto), malos = bloques.map((b, k) => [k, resultadoBloque(b.contenido)]).filter(([, x]) => x.errores?.length);
      return `<h2 id="t-rm">Tu README</h2><p>Revísalo antes de guardarlo. Los diagramas se pueden editar después en el lienzo.</p>
        <div class="previa-readme"><article class="md" id="previa-readme" data-sin-traducir></article></div>
        ${malos.length ? `<p class="mal-txt" data-sin-traducir>${malos.map(([k, x]) => T("El diagrama {n} tiene un error: {x}", { n: k + 1, x: M.frase(x.errores[0]) })).join("<br>")}</p>` : ""}
        <label for="pedido-readme">¿Quieres cambiar algo?</label><textarea id="pedido-readme" placeholder="Por ejemplo: más corto, agrega cómo instalar con Docker" data-sin-traducir>${esc(r.pedido || "")}</textarea>
        <div class="pie-dialogo"><button class="boton izq" data-accion="readme-cambios">${ic("chispa")} Pedir cambios</button><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="readme-guardar" data-autofoco>${hay ? "Reemplazar README.md" : "Guardar como README.md"}</button></div>`;
    }
    return `<h2 id="t-rm">README para GitHub</h2>
      <p>Cuéntale a tu IA de qué se trata tu proyecto. Escribe un README claro, con un diagrama si ayuda.</p>
      <label for="descripcion-readme">¿Qué hace tu proyecto y para quién?</label>
      <textarea id="descripcion-readme" placeholder="Por ejemplo: una app para que Ana Pérez lleve las cuentas de su almacén" data-autofoco data-sin-traducir>${esc(r.descripcion || "")}</textarea>
      <label class="marcar"><input type="checkbox" id="usar-estructura" ${r.estructura ? "checked" : ""}> <span>Usar la lista de archivos de la carpeta<small>Solo los nombres, nunca su contenido. Respeta .gitignore y deja fuera claves y secretos.</small></span></label>
      <button class="boton plano" data-accion="ver-envio">${r.envio ? "Ocultar lo que se envía" : "Ver lo que se envía"}</button>
      ${r.envio ? `<div class="lista-envio" data-sin-traducir>${r.envio.cargando ? esc(tr("Cargando…")) : esc((r.envio.archivos || []).join("\n") || tr("(nada)"))}${r.envio.omitidos ? "\n" + esc(Tp("… y {n} más que quedan fuera (secretos o ignorados).", { n: r.envio.omitidos })) : ""}</div>` : ""}
      ${r.error ? `<p class="mal-txt" data-sin-traducir>${esc(r.error)}</p>` : ""}
      <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="readme-escribir">${ic("chispa")} Escribir README</button></div>`;
  }
  function pintarPreviaReadme() {
    const v = $("#previa-readme");
    if (!v || !E.readme?.texto) return;
    v.innerHTML = M.markdownHTML(E.readme.texto);
    const bloques = M.bloquesMermaid(E.readme.texto);
    v.querySelectorAll(".md-diagrama").forEach((fig) => { const b = bloques[Number(fig.dataset.bloque)]; const r = b && resultadoBloque(b.contenido, "rm" + fig.dataset.bloque); if (r && r.partes.length && !r.errores.length) fig.innerHTML = M.svgCompleto(r, { estilo: "" }); else if (b) fig.innerHTML = `<pre><code>${esc(b.contenido)}</code></pre>`; });
  }
  function pedirReadme(cambios) {
    const r = E.readme;
    if (!cambios) { r.descripcion = ($("#descripcion-readme")?.value || "").trim(); r.estructura = !!$("#usar-estructura")?.checked; if (!r.descripcion) { r.error = tr("Cuéntame de qué se trata tu proyecto."); return pintar(); } }
    else { r.pedido = ($("#pedido-readme")?.value || "").trim(); if (!r.pedido) return toast("Escribe qué quieres cambiar"); }
    r.paso = "escribiendo"; r.error = null;
    host.enviar("crearReadme", { descripcion: r.descripcion, estructura: r.estructura, idioma: E.idioma, anterior: cambios ? r.texto : "", pedido: cambios ? r.pedido : "" });
    pintar();
  }
  function guardarReadme() {
    const r = E.readme, ruta = E.archivos.find((a) => a.ruta.toLowerCase() === "readme.md")?.ruta || "README.md";
    E.readme = null;
    const pedido = tr("README para GitHub");
    if (E.archivos.some((a) => a.ruta === ruta)) {
      const aplicar = () => {
        const d = E.docs[ruta], antes = d.texto;
        cambiarTexto(r.texto, { origen: "ia" });
        const c = { id: "ia-" + Date.now().toString(36), ruta, pedido, antes: "", despues: "", antesDoc: antes, despuesDoc: d.texto, estado: "aplicado", resumen: { tipo: "doc", nodos: 0, aristas: 0 } };
        E.cambiosIA.push(c);
        toast("Guardé tu README. Si no te convence, lo quitas desde Dibújame → Lo que hizo tu IA.");
        pintar();
      };
      abrir(ruta);
      if (E.docs[ruta].texto == null) { E.docs[ruta].alAbrir = aplicar; return; }
      return aplicar();
    }
    crearArchivo(ruta, r.texto);
    E.cambiosIA.push({ id: "ia-" + Date.now().toString(36), ruta, pedido, antes: "", despues: "", antesDoc: "", despuesDoc: r.texto, estado: "aplicado", resumen: { tipo: "doc", nodos: 0, aristas: 0 } });
  }

  // ───────────── Eventos ─────────────
  document.addEventListener("click", (e) => {
    if (bv.manejarClic(e)) return;  // idioma, Atrás, Siguiente, Empezar (pieza «bienvenida»)
    const t = e.target.closest("button, [data-abrir], a[data-enlace], .velo");
    if (!t) { if (E.menu && !e.target.closest("#menu")) { E.menu = null; pintarMenu(); } return; }
    if (t.closest("#menu") === null && E.menu && !t.dataset.accion?.startsWith("menu-")) { E.menu = null; pintarMenu(); }
    const d = t.dataset;
    if (d.abrir && d.pBloque !== undefined) return P.clic(t, d, e);
    if (d.abrir) return abrir(d.abrir);
    if (d.vista) { E.vista = d.vista; return pintar(); }
    if (d.probarIa) { E.config.ia = d.probarIa; host.enviar("config", { ia: d.probarIa }); E.probando[d.probarIa] = true; host.enviar("probarIA", { ia: d.probarIa }); return pintar(); }
    if (d.ajusteIdioma) { E.config.idioma_ui = d.ajusteIdioma; host.enviar("config", { idioma_ui: d.ajusteIdioma }); return cargarIdioma(d.ajusteIdioma).then(pintar); }
    if (d.tema) { E.config.tema = d.tema; host.enviar("config", { tema: d.tema }); return pintar(); }
    if (d.enlace) { e.preventDefault(); return abrirEnlace(d.enlace); }
    if (d.categoria) { E.nuevo.categoria = d.categoria; return pintar(); }
    if (d.fuente && E.nuevo) {
      E.nuevo.fuente = d.fuente; E.nuevo.elegida = null;
      if (d.fuente === "comunidad" && E.catalogo?.estado !== "listo") pedirCatalogo();
      return pintar();
    }
    if (d.catalogo && E.catalogo?.estado === "listo") {
      const p = E.catalogo.plantillas.find((x) => x.id === d.catalogo);
      if (!p || E.catalogo.bajando[p.id]) return;
      if (enMisPlantillas(p)) return elegirPlantilla(p.id);
      E.catalogo.bajando[p.id] = true; host.enviar("descargarPlantilla", { id: p.id }); return pintar();
    }
    if (d.plantilla) return elegirPlantilla(d.plantilla);
    if (d.ejemploDibujo) { const x = E.dibujar; x.pedido = tr((x.nuevo ? EJEMPLOS_PROYECTO : EJEMPLOS_DIBUJO)[Number(d.ejemploDibujo)]); x.cambiar = !!$("#cambiar-actual")?.checked; x.codigo = !!$("#usar-codigo")?.checked; x.tipo = tipoDelPedido(x.pedido); return pintar(); }
    if (d.tipoDibujo) { const x = E.dibujar; x.pedido = $("#pedido-dibujo")?.value || ""; x.cambiar = !!$("#cambiar-actual")?.checked; x.codigo = !!$("#usar-codigo")?.checked; x.tipo = d.tipoDibujo; x.tipoManual = d.tipoDibujo !== "auto"; return pintar(); }
    if (d.arbol !== undefined) { E.abiertas[d.arbol] = !arbolAbierta(d.arbol); return pintar(); }
    if (d.quitarIa) { E.dibujar = null; return quitarCambioIA(d.quitarIa); }
    if (d.irLinea) return irALinea(Number(d.irLinea));
    if (d.sugerencia) return usarSugerencia(Number(d.sugerencia));
    if (d.editarBloque !== undefined) { E.bloque = Number(d.editarBloque); E.elegido = null; E.lz.ajustar = true; if (movil()) E.vista = "dibujo"; else if (E.vista === "texto") E.vista = "ambos"; pintar(); seleccionarBloqueEnTexto(); return; }
    if (d.forma) { const s = E.elegido; E.menu = null; pintarMenu(); if (s?.tipo === "nodo") ponerTextoLienzo(M.cambiarForma(textoLienzo(), s.id, d.forma, d.icono || null), { origen: "lienzo" }); return; }
    if (d.flechas) { E.menu = null; pintarMenu(); return ponerTextoLienzo(M.estiloAristas(textoLienzo(), d.flechas), { origen: "lienzo" }); }
    if (d.exportar) return exportar(d.exportar);
    if (P.clic(t, d, e)) return;
    const a = d.accion;
    if (!a) return;
    switch (a) {
      case "toast-accion": { const a = toast._accion; toast._accion = null; $("#toast").classList.remove("visible", "con-accion"); a?.f(); return; }
      case "abrir-lateral": E.lateral = true; return pintar();
      case "cerrar-lateral": E.lateral = false; return pintar();
      case "elegir-carpeta": return host.enviar("elegirCarpeta");
      case "nuevo": E.lateral = false; E.nuevo = { fuente: "app", categoria: "todas", busqueda: "", elegida: null, nombre: "" }; return pintar();
      case "explorar": pedirCatalogo(); return pintar();
      case "crear": return crearDesdePlantilla();
      case "readme": E.nuevo = null; E.lateral = false; E.readme = { paso: "pedir", descripcion: "", estructura: true, envio: null }; return pintar();
      case "ver-envio": {
        const r = E.readme; r.descripcion = $("#descripcion-readme")?.value || r.descripcion; r.estructura = !!$("#usar-estructura")?.checked;
        if (r.envio) { r.envio = null; return pintar(); }
        r.envio = { cargando: true }; host.enviar("estructura"); return pintar();
      }
      case "readme-escribir": return pedirReadme(false);
      case "readme-cambios": return pedirReadme(true);
      case "readme-guardar": return guardarReadme();
      case "crear-diagrama": E.nuevo = null; E.lateral = false; E.dibujar = { pedido: "", tipo: "auto", nuevo: true, codigo: true }; return pintar();
      case "inicio": E.sel = null; E.bloque = null; E.panel = null; E.lateral = false; return pintar();
      case "dibujame": E.dibujar = { pedido: "", tipo: "auto", cambiar: !!textoLienzo().trim() && (esDiagrama(E.sel) || E.bloque != null) }; return pintar();
      case "dibujame-busqueda": { const q = E.nuevo?.busqueda || ""; E.nuevo = null; if (!E.sel) { toast("Abre o crea un archivo primero"); return pintar(); } E.dibujar = { pedido: q, tipo: "auto", cambiar: false }; return pintar(); }
      case "enviar-dibujo": return enviarDibujo();
      case "cerrar-tarjeta": E.tarjetaIA = null; return pintarTarjetaIA();
      case "ajustes": E.lateral = false; E.ajustes = true; return pintar();
      case "cerrar": cerrarDialogo(); return;
      case "confirmar-si": { const c = E.confirmar; E.confirmar = null; c?.accion(); return pintar(); }
      case "confirmar-no": { const c = E.confirmar; E.confirmar = null; c?.alNo?.(); return pintar(); }
      case "buscar-actualizacion": E.revisando = "buscando"; host.enviar("buscarActualizacion"); return pintar();
      case "actualizar": guardarTodo(); E.revisando = { paso: "0", texto: "Preparando…" }; host.enviar("actualizar"); return pintar();
      case "deshacer": return deshacer();
      case "rehacer": return rehacer();
      case "volver-doc": E.bloque = null; E.elegido = null; if (movil()) E.vista = "dibujo"; return pintar();
      case "nodo-nuevo": return nodoNuevo();
      case "participante-nuevo": { const r = M.agregarParticipante(textoLienzo(), tr("Nuevo")); ponerTextoLienzo(r.texto, { origen: "lienzo" }); E.elegido = { tipo: "participante", id: r.id }; pintarSeleccion(); return requestAnimationFrame(editarEnLugar); }
      case "renombrar": return editarEnLugar();
      case "borrar": return borrarElegido();
      case "desfijar": if (E.elegido?.tipo === "nodo") ponerTextoLienzo(M.desfijar(textoLienzo(), E.elegido.id), { origen: "lienzo" }); return;
      case "direccion": { const D = M.parsearFlujo(textoLienzo()); const sig = { TB: "LR", LR: "BT", BT: "RL", RL: "TD" }[D.dir] || "LR"; E.lz.ajustar = true; return ponerTextoLienzo(M.cambiarDireccion(textoLienzo(), sig), { origen: "lienzo" }); }
      case "menu-formas": return abrirMenu("formas", t);
      case "menu-flechas": return abrirMenu("flechas", t);
      case "menu-exportar": return abrirMenu("exportar", t);
      case "acercar": return zoomEn(1.25);
      case "alejar": return zoomEn(0.8);
      case "zoom-100": return zoomEn(1 / E.lz.z);
      case "ajustar": if (ultimoBueno || ultimoResultado) { ajustarVista(ultimoBueno || ultimoResultado); aplicarVista(); pintarSeleccion(); } return;
      case "minimapa": E.lz.mini = !E.lz.mini; return pintar();
    }
  });
  let pendienteDibujo = null;  // «Dibújame» que se cerró mientras la IA dibujaba: se aplica igual cuando responda
  function cerrarDialogo() {
    if (E.dibujar?.enviando) pendienteDibujo = { ...E.dibujar, ruta: E.sel, bloque: E.bloque, enviando: false };
    if (bv.activa && !bv.soloIdioma) { bv.terminar(); }
    E.ajustes = false; E.nuevo = null; E.readme = null; E.dibujar = null; E.confirmar = null; E.menu = null;
    P.cerrarDialogo();
    pintar();
  }
  const primerArchivo = () => (E.archivos.find((a) => /^readme\.md$/i.test(a.ruta)) || E.archivos[0]).ruta;
  function seleccionarBloqueEnTexto() {
    const t = $("#texto"), b = M.bloquesMermaid(doc()?.texto || "")[E.bloque];
    if (!t || !b) return;
    const L = t.value.split("\n");
    let pos = 0; for (let i = 0; i <= b.ini; i++) pos += L[i].length + 1;
    t.scrollTop = Math.max(0, (b.ini - 2) * 20);
    t.selectionStart = t.selectionEnd = pos;
  }
  function abrirEnlace(url) {
    if (/^https:\/\//.test(url)) return host.enviar("abrirEnlace", { url });
    if (P.enlace(url)) return;
    if (url.startsWith("#")) { const el = document.getElementById(decodeURIComponent(url.slice(1))); el?.scrollIntoView({ behavior: "smooth" }); return; }
    const destino = E.archivos.find((a) => a.ruta === url.replace(/^\.\//, "").split("#")[0]);
    if (destino) return abrir(destino.ruta);
    if (/^http:\/\//.test(url)) return host.enviar("abrirEnlace", { url });
  }
  document.addEventListener("input", (e) => {
    // Casillas de «Pasar al proyecto» (los clics solo llegan a botones): el estado vive en E.pj.dialogo.
    if (e.target.dataset?.pFila !== undefined || e.target.dataset?.pReemplazar !== undefined || e.target.dataset?.pFondo !== undefined) { P.clic(e.target, e.target.dataset, e); return; }
    // «la secuencia de…» marca Secuencia mientras se escribe (si la persona no eligió el tipo a mano).
    if (e.target.id === "pedido-dibujo" && E.dibujar && !E.dibujar.tipoManual) {
      const tipo = tipoDelPedido(e.target.value);
      E.dibujar.tipo = tipo;
      document.querySelectorAll("[data-tipo-dibujo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tipoDibujo === tipo)));
    }
    if (e.target.id === "pedido-dibujo" && E.dibujar && !E.dibujar.codigoManual && hablaDelProyecto(e.target.value)) {
      const c = $("#usar-codigo"); if (c && !c.checked) { c.checked = true; E.dibujar.codigo = true; }
    }
    if (e.target.id === "usar-codigo" && E.dibujar) { E.dibujar.codigo = e.target.checked; E.dibujar.codigoManual = true; }
    if (e.target.id === "texto") { cambiarTexto(e.target.value, { origen: "texto", agrupar: true }); return; }
    if (e.target.id === "buscar-plantilla") {
      E.nuevo.busqueda = e.target.value;
      const pos = e.target.selectionStart;
      pintar();
      const b = $("#buscar-plantilla"); b.focus(); b.selectionStart = b.selectionEnd = pos;
    }
    if (e.target.id === "nombre-nuevo" && E.nuevo) E.nuevo.nombre = e.target.value;
  });
  document.addEventListener("scroll", (e) => { if (e.target.id === "texto") { const m = $("#margen"); if (m) m.scrollTop = e.target.scrollTop; } }, true);
  document.addEventListener("keyup", (e) => { if (e.target.id === "texto" && /^Arrow|Home|End/.test(e.key)) calcularSugerencias(); });
  document.addEventListener("pointerdown", (e) => { if (e.target.closest("#lienzo")) alBajar(e); });
  document.addEventListener("pointermove", (e) => { if (gesto || punteros.size) alMover(e); });
  document.addEventListener("pointerup", (e) => { if (punteros.has(e.pointerId)) alSoltar(e); });
  document.addEventListener("pointercancel", (e) => { punteros.delete(e.pointerId); gesto = null; arrastre = null; });
  document.addEventListener("dblclick", alDobleClic);
  // En el lateral: clic derecho (o Supr) sobre un documento ofrece borrarlo.
  document.addEventListener("contextmenu", (e) => {
    const b = e.target.closest?.(".lateral [data-abrir]");
    if (!b) return;
    e.preventDefault();
    E.menu = { tipo: "archivo", ruta: b.dataset.abrir, x: Math.min(e.clientX, window.innerWidth - 248), y: Math.min(e.clientY, window.innerHeight - 110) };
    pintarMenu();
  });
  document.addEventListener("wheel", (e) => {
    if (!e.target.closest?.("#lienzo") || e.target.closest(".lz-herr, .lz-mini")) return;
    e.preventDefault();
    const r = $("#lienzo").getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomEn(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    else { E.lz.x -= e.deltaX; E.lz.y -= e.deltaY; aplicarVista(); pintarSeleccion(); }
  }, { passive: false });
  document.addEventListener("click", (e) => {
    const m = e.target.closest("#lz-mini svg");
    if (!m) return;
    const [x, y, w, h] = m.dataset.caja.split(",").map(Number), r = m.getBoundingClientRect(), lz = $("#lienzo");
    const s = Math.min(r.width / w, r.height / h), ox = (r.width - w * s) / 2, oy = (r.height - h * s) / 2;
    const cx = x + (e.clientX - r.left - ox) / s, cy = y + (e.clientY - r.top - oy) / s;
    E.lz.x = lz.clientWidth / 2 - cx * E.lz.z; E.lz.y = lz.clientHeight / 2 - cy * E.lz.z; aplicarVista();
  });
  document.addEventListener("keydown", (e) => {
    if (bv.manejarTecla(e) || bv.soloIdioma) return;  // en el idioma: 1/2 y flechas; nada más
    const cmd = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      if (E.menu) { E.menu = null; pintarMenu(); return; }
      if (E.confirmar || E.ajustes || E.nuevo || E.readme || E.dibujar || P.hayDialogo() || bv.activa) return cerrarDialogo();
      if (E.lateral) { E.lateral = false; return pintar(); }
      if (E.elegido) { E.elegido = null; return pintarSeleccion(); }
      if (E.bloque != null) { E.bloque = null; return pintar(); }
    }
    if ((e.key === "Delete" || (e.key === "Backspace" && cmd)) && e.target.closest?.(".lateral [data-abrir]")) { e.preventDefault(); return P.pedirBorrar(e.target.closest(".lateral [data-abrir]").dataset.abrir); }
    if (e.target.id === "texto" && e.key === "Tab" && !e.shiftKey && E.sugerencias.length) { e.preventDefault(); return usarSugerencia(0); }
    if (e.target.id === "texto" && e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const t = e.target, c = t.selectionStart; t.setRangeText("    ", c, t.selectionEnd, "end"); cambiarTexto(t.value, { origen: "texto", agrupar: true }); return; }
    if (cmd && e.key.toLowerCase() === "z" && !e.target.closest(".dialogo, .lz-editar")) { e.preventDefault(); return e.shiftKey ? rehacer() : deshacer(); }
    if (cmd && e.key.toLowerCase() === "y" && !e.target.closest(".dialogo")) { e.preventDefault(); return rehacer(); }
    if (e.target.closest?.(".dialogo") && e.key === "Enter" && cmd) { const p = $(".dialogo .pie-dialogo .principal"); if (p && !p.disabled) p.click(); return; }
    if (e.target.id !== "lienzo") return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); return borrarElegido(); }
    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); return editarEnLugar(); }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); return nodoNuevo(); }
    if (e.key === "+" || e.key === "=") return zoomEn(1.25);
    if (e.key === "-") return zoomEn(0.8);
    if (e.key === "0") { if (ultimoBueno) { ajustarVista(ultimoBueno); aplicarVista(); pintarSeleccion(); } return; }
    const flechas = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (flechas[e.key]) { e.preventDefault(); moverSeleccion(...flechas[e.key]); }
  });
  let anchoAntes = window.innerWidth;
  window.addEventListener("resize", () => { const m = window.innerWidth <= 760, a = anchoAntes <= 760; anchoAntes = window.innerWidth; if (m !== a) pintar(); else if ($("#lienzo")) aplicarVista(); });

  // ───────────── Lo que llama la app ─────────────
  window.Esquema = {
    async estado(e) {
      if (e.actualizacion) {
        E.actualizacion = versionNueva(e.actualizacion);
        if (E.actualizacion.hay && !E.avisoVersion) { E.avisoVersion = true; toast("Hay una versión nueva de Esquema: está en Ajustes"); }
      }
      Object.assign(E, { config: e.config || {}, ias: e.ias || [], version: e.version || "", plantillas: (e.plantillas || []).filter((p) => !validarPlantilla(p).length), tipos: (Array.isArray(e.tipos) ? e.tipos : []).filter((t) => !M.validarTipo(t).length), carpeta: e.carpeta || null, archivos: (e.archivos || []).slice().sort(porRuta), recientes: Array.isArray(e.proyectos) ? e.proyectos : [] });
      const parametros = new URLSearchParams(location.search);
      if (parametros.has("vacio")) { E.carpeta = null; E.archivos = []; }
      await cargarIdioma();
      // La bienvenida se decide con el primer estado (los siguientes no la reinician a medio camino).
      if (!E.cargado) bv.abrir({ config: E.config, forzar: parametros.has("bienvenida") });
      E.cargado = true;
      if (E.carpeta && !E.proyecto) P.alCambiarCarpeta({});
      if (!E.sel && E.archivos.length && !bv.activa) {
        let ultimo = null; try { ultimo = localStorage.getItem("esquema.ultimo"); } catch { /* sin almacenamiento */ }
        return abrir(E.archivos.some((a) => a.ruta === ultimo) ? ultimo : primerArchivo());
      }
      pintar();
    },
    carpetaElegida(r) {
      if (!r.ok) { if (r.error) toast(r.error); return; }
      E.carpeta = r.carpeta; E.archivos = (r.archivos || []).slice().sort(porRuta); E.docs = {}; E.sel = null; E.cambiosIA = []; E.abiertas = {};
      P.alCambiarCarpeta(r);
      pintar();  // una carpeta recién elegida abre en su inicio: qué se puede hacer con ella
    },
    archivoAbierto(r) {
      const d = E.docs[r.ruta];
      if (!d) return;
      if (!r.ok) { d.estado = "error"; toast(r.error || "No pude abrir el archivo"); delete E.docs[r.ruta]; if (E.sel === r.ruta) E.sel = null; return pintar(); }
      d.texto = r.texto; d.guardado = r.texto; d.estado = "guardado";
      if (r.ruta === E.sel) { ultimoBueno = null; pintar(); }
      if (d.alAbrir) { const f = d.alAbrir; d.alAbrir = null; f(); }
      P.alAbrirArchivo(r.ruta);
    },
    /** Respuesta a `catalogoPlantillas`: {ok, plantillas} (el índice ya validado por bin/plantillas.py) o {ok: false, error}. */
    catalogoListo(r) {
      const lista = r.ok && Array.isArray(r.plantillas) ? r.plantillas.filter((p) => p && typeof p === "object" && !validarPlantilla(sinIndice(p)).length) : [];
      E.catalogo = r.ok ? { estado: "listo", plantillas: lista, bajando: {} } : { estado: "error", error: typeof r.error === "string" ? r.error : "", plantillas: [], bajando: {} };
      if (E.nuevo?.fuente === "comunidad") pintar();
    },
    /** Respuesta a `descargarPlantilla`: {ok, plantilla} (revisada y guardada en la carpeta de Esquema) o {ok: false, id, error}. */
    plantillaDescargada(r) {
      const p = r.ok ? r.plantilla : null;
      if (E.catalogo) delete E.catalogo.bajando[p?.id ?? r.id];
      if (!p || validarPlantilla(p).length) { toast(typeof r.error === "string" && r.error ? r.error : tr("No pude descargarla. Intenta de nuevo."), true); return pintar(); }
      E.plantillas = [...E.plantillas.filter((x) => x.id !== p.id), p];
      toast(Tp("«{x}» quedó en tus plantillas", { x: textoDe(p.nombre) }), true);
      if (E.nuevo && !E.nuevo.elegida) return elegirPlantilla(p.id);
      pintar();
    },
    archivoGuardado(r) {
      const d = E.docs[r.ruta];
      if (!d) return;
      if (!r.ok) { d.estado = "error"; toast(r.error || "No se pudo guardar"); P.alGuardarArchivo(r.ruta, false); return pintarEstadoGuardado(); }
      d.guardado = d.enviado ?? d.texto;
      d.estado = d.texto === d.guardado ? "guardado" : "cambiado";
      if (d.estado === "cambiado") programarGuardado(r.ruta);
      pintarEstadoGuardado();
      P.alGuardarArchivo(r.ruta, true);
    },
    /** El archivo cambió en el disco (otro programa, VS Code, git pull…). Si no hay cambios sin guardar, se recarga solo (y se puede
     *  deshacer); si los hay, se pregunta con cuál quedarse. */
    archivoCambiado(r) {
      const d = E.docs[r.ruta];
      if (!d || d.texto == null || typeof r.texto !== "string") return;
      if (r.texto === d.texto) { d.guardado = r.texto; if (d.estado !== "guardando") d.estado = "guardado"; return pintarEstadoGuardado(); }
      const usarDisco = () => {
        clearTimeout(temporizadores[r.ruta]);
        d.pila.push(d.texto); d.futuro = []; d.texto = r.texto; d.guardado = r.texto; d.estado = "guardado"; d.ultimo = 0;
        if (r.ruta === E.sel) { E.elegido = null; refrescar("disco"); }
        pintarEstadoGuardado();
      };
      // Se avisa solo si es lo que la persona tiene abierto (un trabajo de la IA escribe muchos documentos: no es ruido).
      if (d.texto === d.guardado && d.estado !== "guardando") { usarDisco(); if (r.ruta === E.sel) toast(Tp("«{x}» cambió en el disco: lo actualicé", { x: nombreDe(r.ruta) }), true); return; }
      E.confirmar = {
        titulo: frase("«{x}» cambió en el disco", { x: nombreDe(r.ruta) }),
        texto: esc("Otro programa lo cambió mientras tenías cambios sin guardar aquí. ¿Con cuál versión te quedas?"),
        si: "Usar la del disco", no: "Quedarme con la mía",
        accion: usarDisco,
        alNo: () => { d.guardado = r.texto; d.estado = "cambiado"; programarGuardado(r.ruta); },
      };
      pintar();
    },
    archivos(r) { E.archivos = (r.archivos || []).slice().sort(porRuta); P.alCambiarArchivos(); pintar(); },
    /** Respuesta a `papelera`: el archivo (de una carpeta sin documentación de Esquema) está en la Papelera del sistema. */
    enPapelera(r) { P.alPapelera(r || {}); },
    /** Proyectos: la respuesta de bin/proyecto.py (r.orden dice cuál: abrir, leer, preparar, generar, guardar, version…). */
    proyectoRespuesta(r) { P.respuesta(r || {}); },
    /** Proyectos: cómo va un trabajo largo (documentar), mientras corre: {eventos: [{t: "estado", trabajo} | {t: "lee", ruta, n} | {t: "busca", patron}]}. */
    proyectoProgreso(r) { P.progreso(r || {}); },
    iaProbada(r) { delete E.probando[r.ia]; E.resultadoIA[r.ia] = r; if (r.ok) toast("Lista para usar"); pintar(); },
    estructuraLista(r) { if (E.readme?.envio) { E.readme.envio = r.ok ? r : { archivos: [], error: r.error }; pintar(); } },
    readmeListo(r) {
      if (!E.readme) return;
      if (!r.ok) { E.readme.paso = "pedir"; E.readme.error = r.error || tr("Tu IA no respondió."); return pintar(); }
      Object.assign(E.readme, { paso: "listo", texto: r.texto, pedido: "" });
      pintar(); pintarPreviaReadme();
    },
    dibujoListo(r) {
      // Un «Dibújame» que se cerró mientras la IA dibujaba se aplica igual; si hay otro diálogo abierto (sin enviar), se respeta.
      const otro = pendienteDibujo && E.dibujar && !E.dibujar.enviando ? E.dibujar : null;
      if (pendienteDibujo && (!E.dibujar || otro)) {
        const x = pendienteDibujo;
        // Si ya no está abierto lo que iba a cambiar, el dibujo queda en un archivo nuevo (nunca encima de otro).
        E.dibujar = { ...x, oculto: true, nuevo: x.nuevo || E.sel !== x.ruta || E.bloque !== x.bloque };
      }
      pendienteDibujo = null;
      if (!E.dibujar) return;
      if (otro) { const restaurar = () => { if (!E.dibujar) { E.dibujar = otro; pintar(); } }; setTimeout(restaurar, 0); }
      if (!r.ok) {
        if (E.dibujar.oculto) { E.dibujar = null; toast(r.error || tr("Tu IA no respondió."), true); return pintar(); }
        E.dibujar.enviando = false; E.dibujar.error = esc(r.error || tr("Tu IA no respondió.")); return pintar();
      }
      aplicarDibujo(r.texto);
    },
    exportado(r) { if (r.ok) toast(r.ruta ? Tp("Guardado en {x}", { x: r.ruta }) : tr("Listo"), true); else if (r.error) toast(r.error); },
    copiado(r) { toast(r.ok ? "Copiado: pégalo en GitHub y se verá como diagrama" : "No pude copiar"); },
    actualizacionRevisada(r) {
      E.actualizacion = versionNueva(r);
      E.revisando = r.hay ? null : r.sinConexion ? "sin-conexion" : "al-dia";
      pintar();
    },
    actualizacionProgreso(r) { E.revisando = { paso: String(r.paso || ""), texto: String(r.texto || ""), valores: r.valores || {}, pct: r.pct }; pintar(); },
    /** Los menús de la app (Mac: barra de menús; Windows y Linux: menú de la ventana). Nada antes de elegir el idioma. */
    menu(r) {
      const a = r && r.accion;
      if (bv.soloIdioma || !E.cargado) return;
      const campo = document.activeElement;
      const enCampo = campo && campo.id !== "texto" && (campo.tagName === "INPUT" || campo.tagName === "TEXTAREA");
      const conDibujo = () => $("#lienzo") && (ultimoBueno || ultimoResultado);
      switch (a) {
        case "guardar": return guardarTodo();
        case "deshacer": return enCampo ? document.execCommand("undo") : deshacer();
        case "rehacer": return enCampo ? document.execCommand("redo") : rehacer();
        case "acercar": return conDibujo() && zoomEn(1.25);
        case "alejar": return conDibujo() && zoomEn(0.8);
        case "ajustar": if (conDibujo()) { ajustarVista(ultimoBueno || ultimoResultado); aplicarVista(); pintarSeleccion(); } return;
        case "texto": case "ambos": case "dibujo": if (E.sel) { E.vista = a; pintar(); } return;
      }
      if (bv.activa) return;  // en la bienvenida no se abren otros diálogos
      if (a === "nuevo") { if (!E.carpeta) return toast("Elige una carpeta primero"); E.lateral = false; E.nuevo = { fuente: "app", categoria: "todas", busqueda: "", elegida: null, nombre: "" }; return pintar(); }
      if (a === "ajustes") { E.lateral = false; E.ajustes = true; return pintar(); }
    },
    _probar(f) { f(E); pintar(); },
    _pruebas: { validarPlantilla, validarNombre, resumen, abrir, motor: M, proyectos: () => P, bienvenida: bv },
  };

  /** Una plantilla es solo datos: se valida antes de mostrarla (las incluidas y las del catálogo de la comunidad).
   *  La misma regla que bin/plantilla_formato.py (casos en pruebas/casos.json, sección «plantillas»). */
  function validarPlantilla(p) {
    const e = [];
    const txt = (o, max) => o && typeof o === "object" && !Array.isArray(o) && typeof o.es === "string" && Object.entries(o).every(([k, v]) => /^[a-z]{2}(-[A-Z]{2})?$/.test(k) && typeof v === "string" && v.length <= max);
    if (!p || typeof p !== "object") return ["no es un objeto"];
    const permitidas = ["formato", "id", "categoria", "tipo", "nombre", "descripcion", "archivo", "contenido", "autor", "etiquetas"];
    for (const k of Object.keys(p)) if (!permitidas.includes(k)) e.push("campo desconocido: " + k);
    if (p.formato !== 1) e.push("formato");
    if (typeof p.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) || p.id.length > 60) e.push("id");
    if (!CATEGORIAS.includes(p.categoria)) e.push("categoria");
    if (p.tipo !== "diagrama" && p.tipo !== "documento") e.push("tipo");
    if (!txt(p.nombre, 80)) e.push("nombre");
    if (!txt(p.descripcion, 200)) e.push("descripcion");
    if (!txt(p.archivo, 80) || !Object.values(p.archivo || {}).every((v) => /^[\w-]+\.(md|mmd)$/.test(v) && (p.tipo === "diagrama" ? v.endsWith(".mmd") : v.endsWith(".md")))) e.push("archivo");
    if (!txt(p.contenido, 20000)) e.push("contenido");
    if (p.autor !== undefined && (typeof p.autor !== "string" || p.autor.length > 60)) e.push("autor");
    if (p.etiquetas !== undefined && (!Array.isArray(p.etiquetas) || p.etiquetas.length > 10 || !p.etiquetas.every((x) => typeof x === "string" && x.length <= 30))) e.push("etiquetas");
    return e;
  }

  /** Una entrada del índice del catálogo sin lo propio del índice (ruta, huella y tamaño): la plantilla tal cual. */
  const sinIndice = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => !["ruta", "sha256", "tamano"].includes(k)));

  // ───────────── Vista previa en el navegador (sin app): responde con datos ficticios ─────────────
  let DEMO = null;
  const memoria = {};  // ruta → texto (la carpeta de ejemplo vive solo en memoria)
  const luego = (ms, f) => setTimeout(f, ms);
  function simular(accion, d) {
    const A = window.Esquema;
    switch (accion) {
      case "listo":
        return fetch("demo.json").then((r) => r.json()).then((demo) => {
          DEMO = demo;
          for (const a of demo.archivos) memoria[a.ruta] = a.texto;
          let config = { ...demo.config };
          try { Object.assign(config, JSON.parse(localStorage.getItem("esquema.config") || "{}")); } catch { /* nada */ }
          return A.estado({ ...demo, config, archivos: demo.archivos.map((a) => ({ ruta: a.ruta })) });
        });
      case "config": try { const c = JSON.parse(localStorage.getItem("esquema.config") || "{}"); localStorage.setItem("esquema.config", JSON.stringify({ ...c, ...d })); } catch { /* sin almacenamiento */ } return;
      case "elegirCarpeta": { P.simAbrir(DEMO.carpeta.ruta, memoria, DEMO); return luego(150, () => A.carpetaElegida({ ok: true, carpeta: DEMO.carpeta, archivos: Object.keys(memoria).map((ruta) => ({ ruta })), ...(d.proyecto ? { proyecto: true } : {}) })); }
      case "abrirProyecto": { const x = P.simAbrir(Number(d.indice), memoria, DEMO); return luego(150, () => A.carpetaElegida(x ? { ok: true, ...x, proyecto: true } : { ok: false, error: tr("No encontré ese proyecto.") })); }
      case "proyecto": return P.simular(d, memoria, DEMO, luego);
      case "papelera": { const ok = d.ruta in memoria && !String(d.ruta).includes(".."); if (ok) delete memoria[d.ruta]; return luego(80, () => A.enPapelera(ok ? { ok: true, ruta: d.ruta } : { ok: false, ruta: d.ruta, error: tr("Ese archivo no se puede borrar.") })); }
      case "abrirArchivo": return luego(20, () => A.archivoAbierto(d.ruta in memoria ? { ok: true, ruta: d.ruta, texto: memoria[d.ruta] } : { ok: false, ruta: d.ruta, error: tr("No encontré el archivo") }));
      case "guardarArchivo": memoria[d.ruta] = d.texto; return luego(60, () => A.archivoGuardado({ ok: true, ruta: d.ruta }));
      case "probarIA": return luego(500, () => A.iaProbada({ ia: d.ia, ok: true }));
      case "estructura": return luego(200, () => A.estructuraLista({ ok: true, ...DEMO.estructura }));
      case "crearReadme": return luego(900, () => A.readmeListo({ ok: true, texto: readmeSimulado(d) }));
      case "dibujar": return luego(700, () => A.dibujoListo({ ok: true, texto: dibujoSimulado(d) }));
      case "exportar": {
        const blob = d.base64 ? new Blob([Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0))], { type: "image/png" }) : new Blob([d.texto], { type: d.formato === "svg" ? "image/svg+xml" : "text/markdown" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = d.nombre; document.body.appendChild(a); a.click(); a.remove();
        window._ultimaExportacion = d;
        return luego(10, () => A.exportado({ ok: true, ruta: d.nombre }));
      }
      case "copiar":
        window._copiado = d.texto;
        return (navigator.clipboard?.writeText(d.texto) || Promise.reject()).then(() => A.copiado({ ok: true }), () => A.copiado({ ok: true }));
      case "abrirEnlace": return toast("En la app, aquí se abre el enlace en tu navegador");
      case "buscarActualizacion": return luego(300, () => A.actualizacionRevisada({ hay: false, sinConexion: false }));
      case "actualizar": return luego(300, () => A.actualizacionProgreso({ paso: "error", codigo: "vista-previa", texto: "En la vista previa no hay nada que actualizar.", valores: {} }));
      case "catalogoPlantillas": return luego(400, () => A.catalogoListo({ ok: true, plantillas: JSON.parse(JSON.stringify(DEMO.catalogo || [])) }));
      case "descargarPlantilla": return luego(500, () => {  // en la app: Swift o Electron la bajan de raw.githubusercontent.com y bin/plantillas.py la valida
        const x = (DEMO.catalogo || []).find((y) => y.id === d.id);
        A.plantillaDescargada(x ? { ok: true, plantilla: sinIndice(JSON.parse(JSON.stringify(x))) } : { ok: false, id: d.id, error: tr("Esa plantilla no es válida.") });
      });
    }
  }
  function readmeSimulado(d) {
    const en = d.idioma === "en";
    const base = d.anterior ? d.anterior.replace(/\n## (Licencia|License)[\s\S]*$/, "") + (en ? "\n## Changes\n\n" + d.pedido + "\n" : "\n## Cambios\n\n" + d.pedido + "\n") : null;
    if (base) return base + (en ? "\n## License\n\nAGPL-3.0\n" : "\n## Licencia\n\nAGPL-3.0\n");
    return en
      ? `# Sample project\n\n${d.descripcion}\n\n## How it works\n\n\`\`\`mermaid\nflowchart LR\n    U([Person]) --> W[Web app]\n    W --> A[API]\n    A --> D[(Database)]\n\`\`\`\n\n## Getting started\n\n1. Clone the repository.\n2. Follow the steps in \`docs/\`.\n\n## License\n\nAGPL-3.0\n`
      : `# Proyecto de ejemplo\n\n${d.descripcion}\n\n## Cómo funciona\n\n\`\`\`mermaid\nflowchart LR\n    U([Persona]) --> W[App web]\n    W --> A[API]\n    A --> D[(Base de datos)]\n\`\`\`\n\n## Para empezar\n\n1. Clona el repositorio.\n2. Sigue los pasos de \`docs/\`.\n\n## Licencia\n\nAGPL-3.0\n`;
  }
  /** La «IA» de la vista previa: arma un diagrama con las partes del pedido (separadas por comas o «y»). */
  function dibujoSimulado(d) {
    const partes = d.pedido.replace(/^[^:]*:\s*/, "").split(/,|\by\b|\band\b/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
    if (d.actual && M.tipoDiagrama(d.actual).tipo === "flujo") {
      const D = M.parsearFlujo(d.actual), ult = [...D.nodos.keys()].pop();
      let t = d.actual;
      for (const p of partes) { const r = ult ? M.conectarNuevo(t, ult, p) : M.agregarNodo(t, p); t = r.texto; }
      return t;
    }
    if (d.tipo === "secuencia" || /secuencia|sequence/i.test(d.pedido)) {
      const ps = partes.length >= 2 ? partes : ["App", "API", "Banco"];
      return "sequenceDiagram\n" + ps.map((p, i) => `    participant P${i + 1} as ${p}`).join("\n") + "\n" + ps.slice(1).map((p, i) => `    P${i + 1}->>P${i + 2}: ${d.idioma === "en" ? "Request" : "Pedido"}`).join("\n") + "\n" + ps.slice(1).reverse().map((p, i) => `    P${ps.length - i}-->>P${ps.length - i - 1}: OK`).join("\n") + "\n";
    }
    if (d.tipo === "arquitectura" || /arquitectura|architecture/i.test(d.pedido)) {
      return "flowchart LR\n" + partes.map((p, i) => `    N${i + 1}[${M.etiquetaMermaid(p)}]`).join("\n") + "\n" + partes.slice(1).map((p, i) => `    N${i + 1} --> N${i + 2}`).join("\n") + `\n%% esquema: {"iconos":{${partes.map((p, i) => `"N${i + 1}":"${/base|datos|data/i.test(p) ? "base-de-datos" : /cola|queue|correo|mail/i.test(p) ? "cola" : /web|app/i.test(p) ? "navegador" : "servidor"}"`).join(",")}}}\n`;
    }
    const pasos = partes.length ? partes : [d.pedido];
    return "flowchart TD\n" + `    I([${d.idioma === "en" ? "Start" : "Inicio"}]) --> N1[${M.etiquetaMermaid(pasos[0])}]\n` + pasos.slice(1).map((p, i) => `    N${i + 1} --> N${i + 2}[${M.etiquetaMermaid(p)}]`).join("\n") + `\n    N${pasos.length} --> F([${d.idioma === "en" ? "End" : "Fin"}])\n`;
  }

  host.enviar("listo");
})();
