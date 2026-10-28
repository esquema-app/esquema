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
    idioma: "es", textos: {}, config: {}, ias: [], version: "", plantillas: [], cargado: false,
    carpeta: null,          // {nombre, ruta}
    archivos: [],           // [{ruta}]
    docs: {},               // ruta → {texto, guardado, estado: "guardado" | "cambiado" | "guardando" | "error", pila: [], futuro: [], t}
    sel: null,              // ruta abierta
    vista: "ambos",         // "texto" | "ambos" | "dibujo"
    bloque: null,           // en un .md: el diagrama que se está editando en el lugar (índice del bloque mermaid)
    lz: { z: 1, x: 0, y: 0, ajustar: true, mini: false },
    elegido: null,          // {tipo: "nodo" | "arista" | "participante" | "evento", id}
    menu: null,             // {tipo: "formas" | "exportar" | "flechas", x, y}
    bv: null,               // bienvenida: 0 idioma, 1 hola, 2 carpeta, 3 IA
    ajustes: false, probando: {}, resultadoIA: {},
    nuevo: null,            // {categoria, busqueda, elegida, nombre}
    readme: null,           // {paso: "pedir" | "escribiendo" | "listo" | "error", descripcion, estructura, envio, texto, pedido, error}
    dibujar: null,          // {pedido, tipo, cambiar, enviando, error, propuesta}
    cambiosIA: [],          // [{id, ruta, pedido, resumen, antes, despues, estado}]
    tarjetaIA: null,        // id del último cambio de la IA (la tarjeta del lienzo)
    confirmar: null,        // {titulo, texto, si, no, accion, alNo?}
    actualizacion: { hay: false }, // {hay, detalle}: versión nueva (la revisa la app al abrir y cada 6 horas)
    revisando: null,        // Ajustes → Actualizaciones: null | "buscando" | "al-dia" | "sin-conexion" | {paso, texto, pct}
    lateral: false,         // en celular: la lista de archivos abierta
    sugerencias: [],
  };
  const ENLACES = { sitio: "https://esquema-app.github.io/esquema/", codigo: "https://github.com/esquema-app/esquema",
    comunidad: "https://github.com/esquema-app/esquema/discussions", catalogo: "https://github.com/esquema-app/esquema-catalogo" };
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

  // ───────────── Idiomas (las claves son el texto en español) ─────────────
  function tr(t) {
    if (E.idioma === "es" || !t) return t;
    const limpio = String(t).replace(/\s+/g, " ").trim();
    if (!limpio) return t;
    if (E.textos[limpio]) return t.replace(limpio, E.textos[limpio]);
    if (window._faltantes && /\p{L}{2}/u.test(limpio)) window._faltantes.add(limpio);
    return t;
  }
  function Tp(plantilla, valores = {}) {
    let t = plantilla;
    if (E.idioma !== "es") { if (E.textos[plantilla]) t = E.textos[plantilla]; else if (window._faltantes) window._faltantes.add(plantilla); }
    for (const [k, v] of Object.entries(valores)) t = t.split(`{${k}}`).join(String(v));
    return t;
  }
  /** Frase completa con marcadores, escapada (valores incluidos), lista para HTML. */
  function T(plantilla, valores = {}) {
    let t = plantilla;
    if (E.idioma !== "es") { if (E.textos[plantilla]) t = E.textos[plantilla]; else if (window._faltantes) window._faltantes.add(plantilla); }
    t = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    for (const [k, v] of Object.entries(valores)) t = t.split(`{${k}}`).join(esc(String(v)));
    return t;
  }
  const frase = (plantilla, valores, etiqueta = "span") => `<${etiqueta} data-sin-traducir>${T(plantilla, valores)}</${etiqueta}>`;
  function traducirDOM(raiz) {
    if (E.idioma === "es" || !raiz) return;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nodos = []; let n; while ((n = w.nextNode())) nodos.push(n);
    for (const t of nodos) {
      const el = t.parentElement;
      if (!el || el.closest("[data-sin-traducir], script, style, svg, textarea, .md") || !/\p{L}/u.test(t.nodeValue)) continue;
      const v = tr(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v;
    }
    for (const el of raiz.querySelectorAll("[title],[aria-label],[placeholder]")) {
      if (el.closest("[data-sin-traducir]")) continue;
      for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v) el.setAttribute(a, tr(v)); }
    }
  }
  async function cargarIdioma(elegido) {
    const pedido = new URLSearchParams(location.search).get("idioma");
    const codigo = elegido || pedido || E.config.idioma_ui || ((navigator.language || "es").startsWith("es") ? "es" : "en");
    if (codigo === E.idioma && (codigo === "es" || Object.keys(E.textos).length)) return;
    E.idioma = codigo; E.textos = {};
    if (codigo !== "es") { try { E.textos = (await (await fetch(`idiomas/${codigo}.json`)).json()).textos || {}; } catch { E.idioma = "es"; } }
    document.documentElement.lang = E.idioma;
  }
  /** Un problema del motor (o de la IA) como frase en el idioma elegido. */
  const fraseProblema = (p) => T(p.plantilla, p.valores);
  const nombreIA = () => (E.ias.find((x) => x.id === (E.config.ia || "claude")) || { nombre: "Claude" }).nombre;

  // ───────────── Íconos de la interfaz (trazos de 16×16) ─────────────
  const IC = {
    mas: "M8 3v10M3 8h10", menos: "M3 8h10", deshacer: "M5.5 4 2.5 7l3 3M2.5 7H10a3.5 3.5 0 0 1 0 7H8", rehacer: "M10.5 4l3 3-3 3M13.5 7H6a3.5 3.5 0 0 0 0 7h2",
    menu: "M2.5 4h11M2.5 8h11M2.5 12h11", carpeta: "M1.5 4.5v8h13v-7H8L6.5 3.5h-5z", doc: "M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3M6 8h4.5M6 11h4.5",
    diagrama: "M5.5 1.5h5v4h-5zM1.5 10.5h5v4h-5zM9.5 10.5h5v4h-5zM8 5.5v2.5M4 10.5V8h8v2.5", chispa: "M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z",
    exportar: "M8 10V2M5 5l3-3 3 3M2.5 9.5v4h11v-4", ajustar: "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4", mapa: "M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10",
    borrar: "M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9.5h6.6l.7-9.5", cerrar: "M3.5 3.5l9 9M12.5 3.5l-9 9", lapiz: "M10.5 2.5l3 3-8 8H2.5v-3z",
    forma: "M2 2.5h6v5H2zM11 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 14l3-5 3 5z", pin: "M8 9.5v5M4.5 9.5h7l-1.5-2.5V2.5h-4V7z",
    flechas: "M2 13c4 0 4-10 12-10M11 1.5 14 3l-1.5 3", direccion: "M8 2v12M4.5 10.5 8 14l3.5-3.5", copiar: "M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3",
    volver: "M10 3 5 8l5 5", ajustes: "M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
    persona: "M8 7.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5", github: "M5.5 2.5 1.5 8l4 5.5M10.5 2.5l4 5.5-4 5.5",
  };
  const ic = (n) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="${IC[n]}"/></svg>`;

  // ───────────── Avisos ─────────────
  let avisosPendientes = [];
  function toast(texto, traducido = false) {
    if (E.bv === 0) { avisosPendientes.push([texto, traducido]); return; }
    const t = $("#toast"); t.textContent = traducido ? texto : tr(texto); t.classList.add("visible");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("visible"), 2400);
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
    const ahora = Date.now();
    if (!(op.agrupar && d.ultimo && ahora - d.ultimo < 900)) { d.pila.push(d.texto); if (d.pila.length > 300) d.pila.shift(); }
    d.ultimo = op.agrupar ? ahora : 0;
    d.futuro = [];
    d.texto = nuevo;
    d.estado = "cambiado";
    programarGuardado(E.sel);
    refrescar(op.origen || "otro");
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
    host.enviar("guardarArchivo", { ruta, texto: d.texto });
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
    E.sel = ruta; E.bloque = null; E.elegido = null; E.menu = null; E.lateral = false; E.lz.ajustar = true; E.tarjetaIA = null;
    E.vista = movil() ? (esDocumento(ruta) ? "dibujo" : "dibujo") : "ambos";
    if (!E.docs[ruta]) { E.docs[ruta] = { texto: null, guardado: null, estado: "cargando", pila: [], futuro: [] }; host.enviar("abrirArchivo", { ruta }); }
    try { localStorage.setItem("esquema.ultimo", ruta); } catch { /* sin almacenamiento: no pasa nada */ }
    pintar();
  }

  // ───────────── Pintar ─────────────
  function pintar() {
    const app = $("#app");
    const textarea = $("#texto");
    const foco = document.activeElement?.id;
    const sel = textarea ? [textarea.selectionStart, textarea.selectionEnd, textarea.scrollTop] : null;
    const scrollDoc = $(".vista-doc")?.scrollTop;
    document.documentElement.dataset.tema = E.config.tema === "claro" ? "claro" : E.config.tema === "oscuro" ? "oscuro" : "";
    if (!document.documentElement.dataset.tema) delete document.documentElement.dataset.tema;
    if (E.bv === 0) { app.innerHTML = dialogos(); traducirDOM(app); $(".idiomas .principal")?.focus(); return; }
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

  function lateral() {
    const docs = E.archivos.filter((a) => esDocumento(a.ruta)), diags = E.archivos.filter((a) => esDiagrama(a.ruta));
    const fila = (a) => `<button class="archivo" data-abrir="${esc(a.ruta)}" aria-current="${a.ruta === E.sel}" title="${esc(a.ruta)}" data-sin-traducir>${ic(esDiagrama(a.ruta) ? "diagrama" : "doc")}<span>${esc(nombreDe(a.ruta))}</span>${carpetaDe(a.ruta) ? `<small>${esc(carpetaDe(a.ruta))}</small>` : ""}</button>`;
    return `<aside class="lateral${E.lateral ? " abierto" : ""}" aria-label="Archivos">
      <div class="marca"><img src="favicon.svg" alt=""><b>Esquema</b></div>
      <button class="carpeta" data-accion="elegir-carpeta" title="Cambiar de carpeta">${ic("carpeta")}<span data-sin-traducir>${esc(E.carpeta?.nombre || "")}</span></button>
      <button class="boton principal nuevo" data-accion="nuevo">${ic("mas")} Nuevo</button>
      <nav class="lista">
        ${docs.length ? `<h3>Documentos</h3>${docs.map(fila).join("")}` : ""}
        ${diags.length ? `<h3>Diagramas</h3>${diags.map(fila).join("")}` : ""}
        ${!docs.length && !diags.length && E.carpeta ? `<p class="vacio">Esta carpeta todavía no tiene documentos ni diagramas.</p>` : ""}
      </nav>
      <div class="pie-lateral"><button class="boton plano" data-accion="ajustes">${ic("ajustes")} Ajustes</button></div>
    </aside>`;
  }
  function barra() {
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
        ${tieneDibujo ? `<button class="boton icono" data-accion="menu-exportar" aria-label="Exportar" title="Exportar">${ic("exportar")}</button>` : ""}` : ""}
    </header>`;
  }
  const botonesHistorial = () => { const d = doc(); return `<button class="boton plano icono" data-accion="deshacer" aria-label="Deshacer" title="Deshacer (⌘Z)" ${d?.pila.length ? "" : "disabled"}>${ic("deshacer")}</button><button class="boton plano icono" data-accion="rehacer" aria-label="Rehacer" title="Rehacer (⇧⌘Z)" ${d?.futuro.length ? "" : "disabled"}>${ic("rehacer")}</button>`; };
  function pintarBarraHistorial() { const h = $("#historial"); if (h) { h.innerHTML = botonesHistorial(); traducirDOM(h); } }
  function estadoGuardado() {
    const d = doc();
    if (!d) return "";
    return { cambiado: "Sin guardar", guardando: "Guardando…", guardado: "Guardado", error: "No se pudo guardar", cargando: "Abriendo…" }[d.estado] || "";
  }
  function pintarEstadoGuardado() { const el = $("#estado-guardado"); if (el) el.textContent = tr(estadoGuardado()); }

  function area() {
    if (!E.carpeta) return `<div class="vacio"><div><h2>Elige una carpeta</h2><p>Tus documentos y diagramas viven en una carpeta de tu computador, en archivos .md y .mmd que GitHub muestra tal cual.</p><div class="acciones"><button class="boton principal" data-accion="elegir-carpeta">${ic("carpeta")} Elegir carpeta</button></div></div></div>`;
    const d = doc();
    if (!E.sel || !d) return `<div class="vacio"><div><h2>Empieza un documento o un diagrama</h2><p>Escríbelo como texto o dibújalo en el lienzo: los dos se mantienen al día.</p><div class="acciones"><button class="boton principal" data-accion="nuevo">${ic("mas")} Nuevo</button><button class="boton" data-accion="readme">${ic("github")} README para GitHub</button></div></div></div>`;
    if (d.texto == null) return `<div class="vacio"><div class="esperando"><span class="giro"></span> Abriendo…</div></div>`;
    const vista = movil() && E.vista === "ambos" ? "dibujo" : E.vista;
    const derecha = esDiagrama(E.sel) ? `<section class="panel-dibujo">${lienzoHTML()}</section>`
      : E.bloque != null ? `<section class="panel-dibujo con-cab"><div class="cab-bloque"><button class="boton plano" data-accion="volver-doc">${ic("volver")} Listo</button><span data-sin-traducir>${T("Diagrama {n} de {x}", { n: E.bloque + 1, x: nombreDe(E.sel) })}</span></div>${lienzoHTML()}</section>`
      : `<section class="panel-dibujo vista-doc" aria-label="Vista del documento"><article class="md" id="vista-md" data-sin-traducir></article></section>`;
    return `<div class="area" data-vista="${vista}">
      <section class="panel-texto" aria-label="Texto">
        <div class="editor"><div class="margen" id="margen" aria-hidden="true"></div><textarea id="texto" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Texto del ${esDiagrama(E.sel) ? "diagrama" : "documento"}"></textarea></div>
        <div class="problemas" id="problemas"></div>
        <div class="sugerencias" id="sugerencias" aria-label="Sugerencias"></div>
      </section>${derecha}</div>`;
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
  function pintarMargen() {
    const m = $("#margen"), t = $("#texto");
    if (!m || !t) return;
    const n = (t.value.match(/\n/g) || []).length + 1;
    const malas = new Set(problemasActuales().errores.map((e) => e.linea));
    let h = "";
    for (let i = 1; i <= n; i++) h += malas.has(i) ? `<span class="mal">${i}</span>\n` : i + "\n";
    m.innerHTML = h;
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
    traducirDOM(el);
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
    barraSel.className = botones ? "lz-sel" : "";
    barraSel.innerHTML = botones;
    traducirDOM(barraSel);
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
    } else if (m.tipo === "exportar") {
      h = `<button data-exportar="svg">${ic("exportar")} SVG</button><button data-exportar="png">${ic("exportar")} PNG</button><button data-exportar="md">${ic("doc")} Markdown con Mermaid</button><button data-exportar="github">${ic("copiar")} Copiar para GitHub</button>`;
    }
    return `<div class="menu" id="menu" role="menu" style="left:${Math.round(m.x)}px;top:${Math.round(m.y)}px">${h}</div>`;
  }
  const formaMini = (f) => { const t = M.tamanoForma(f, 20, 10), e = 14 / Math.max(t.w, t.h); return `<svg class="ic esq" viewBox="${-t.w / 2 - 2} ${-t.h / 2 - 2} ${t.w + 4} ${t.h + 4}" aria-hidden="true" style="width:${Math.max(12, t.w * e)}px">${M.dibujarForma(f, t.w, t.h)}</svg>`; };
  function abrirMenu(tipo, boton) {
    const b = boton.getBoundingClientRect();
    const ancho = tipo === "formas" ? 360 : 240;
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
  function pintarVistaDoc() {
    const v = $("#vista-md"), d = doc();
    if (!v || !d || d.texto == null) return;
    v.innerHTML = M.markdownHTML(d.texto);
    const bloques = M.bloquesMermaid(d.texto);
    v.querySelectorAll(".md-diagrama").forEach((fig) => {
      const k = Number(fig.dataset.bloque), b = bloques[k];
      if (!b) return;
      const r = resultadoBloque(b.contenido, "md" + k);
      let h = "";
      if (r.tipo === "pendiente") h = `<p class="pendiente">${T("Esquema todavía no dibuja «{x}». Lo dejo tal cual: GitHub sí lo muestra.", { x: r.palabra })}</p><pre><code>${esc(b.contenido)}</code></pre>`;
      else if (r.errores?.length) h = `<p class="error">${T("Línea {n}", { n: r.errores[0].linea + b.ini + 1 })} · ${fraseProblema(r.errores[0])}</p><pre><code>${esc(b.contenido)}</code></pre>`;
      else if (r.partes.length) h = M.svgCompleto(r, { estilo: "", titulo: T("Diagrama {n}", { n: k + 1 }) });
      fig.innerHTML = h + (r.tipo === "flujo" || r.tipo === "secuencia" ? `<button class="boton editar" data-editar-bloque="${k}">${ic("lapiz")} ${T("Editar")}</button>` : "");
      fig.tabIndex = 0;
    });
  }

  // ───────────── Diálogos ─────────────
  function dialogos() {
    const capa = (id, html, clase = "") => `<div class="capa"><div class="dialogo ${clase}" role="dialog" aria-modal="true" aria-labelledby="${id}">${html}</div></div>`;
    if (E.bv === 0) return `<div class="capa capa-idioma"><div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="t-bv">${bienvenida()}</div></div>`;
    if (E.bv !== null) return capa("t-bv", bienvenida(), "bienvenida");
    // titulo y texto llegan como HTML ya escapado (frase() o esc() del texto en español; traducirDOM lo traduce); los botones, como texto.
    if (E.confirmar) return capa("t-conf", `<h2 id="t-conf">${E.confirmar.titulo}</h2><p>${E.confirmar.texto}</p><div class="pie-dialogo"><button class="boton" data-accion="confirmar-no">${esc(E.confirmar.no)}</button><button class="boton principal" data-accion="confirmar-si" data-autofoco>${esc(E.confirmar.si)}</button></div>`);
    if (E.ajustes) return capa("t-aj", dialogoAjustes(), "ajustes");
    if (E.readme) return capa("t-rm", dialogoReadme(), "ancho");
    if (E.dibujar) return capa("t-dj", dialogoDibujar());
    if (E.nuevo) return capa("t-nv", dialogoNuevo(), "ancho");
    return "";
  }
  function pasoIdioma() {
    const sugerido = (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
    const op = [["es", "Español", "Sugerido"], ["en", "English", "Suggested"]];
    if (sugerido === "en") op.reverse();
    return `<h2 id="t-bv" data-sin-traducir>Elige tu idioma · Choose your language</h2>
      <div class="idiomas" data-sin-traducir>${op.map(([c, n, s], i) => `<button class="boton ${i === 0 ? "principal" : ""}" data-idioma="${c}" lang="${c}">${n}${i === 0 ? `<small>${s}</small>` : ""}</button>`).join("")}</div>`;
  }
  function bienvenida() {
    const paso = E.bv;
    const puntos = `<div class="pasos-bv" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i class="${i <= paso ? "hecho" : ""}"></i>`).join("")}</div>`;
    if (paso === 0) return puntos + pasoIdioma();
    const pasos = [null,
      ["Hola, esto es Esquema", `<p>Diagramas y documentación en tu computador, en el mismo formato que GitHub ya muestra.</p><ul><li>Escribe en texto (Mermaid) o dibuja en el lienzo: los dos se mantienen al día.</li><li>Flujos, secuencias y arquitectura, con plantillas listas.</li><li>Tu propia IA te dibuja diagramas y te escribe el README.</li></ul><p>Gratis, abierto y sin cuentas. Nada sale de tu computador.</p>`, true],
      ["Elige tu carpeta", `<p>Esquema trabaja con los archivos .md y .mmd de una carpeta: la de tu proyecto, por ejemplo. No los mueve ni los copia.</p><div class="fila"><span class="txt">${E.carpeta ? `<b data-sin-traducir>${esc(E.carpeta.nombre)}</b><small data-sin-traducir>${esc(E.carpeta.ruta || "")}</small>` : "Todavía no eliges una carpeta."}</span><button class="boton ${E.carpeta ? "" : "principal"}" data-accion="elegir-carpeta">${ic("carpeta")} ${E.carpeta ? "Cambiar" : HOST === "web" ? "Usar la carpeta de ejemplo" : "Elegir carpeta"}</button></div>`, !!E.carpeta],
      ["Tu IA (opcional)", `<p>Para «Dibújame» y el README, Esquema usa la IA que ya tienes, con tu cuenta. Solo ve lo que le pides; nunca tus archivos.</p>${filasIA()}`, true],
    ];
    const [titulo, cuerpo, puede] = pasos[paso];
    return `${puntos}<h2 id="t-bv" tabindex="-1">${titulo}</h2>${cuerpo}
      <div class="pie-dialogo"><button class="boton izq" data-bv="${paso - 1}">Atrás</button>
        ${paso < pasos.length - 1 ? `<button class="boton principal" data-bv="${paso + 1}" ${puede ? "" : "disabled"} data-autofoco>Siguiente</button>` : `<button class="boton" data-accion="bv-fin">Lo hago después</button><button class="boton principal" data-accion="bv-fin" data-autofoco>Empezar</button>`}</div>`;
  }
  /** Ajustes → Actualizaciones: buscar, el aviso de versión nueva con sus notas y el avance por pasos al instalarla. */
  function filaActualizacion() {
    const v = E.revisando, a = E.actualizacion || {};
    if (v && typeof v === "object") {
      const pct = typeof v.pct === "number" ? ` · ${Math.max(0, Math.min(100, Math.round(v.pct)))}%` : "";
      const error = v.paso === "error";
      return `<div class="fila"><span class="txt"><b class="${error ? "error-texto" : ""}" data-sin-traducir>${esc(v.texto || "")}${pct}</b>${error ? "" : frase("Paso {n} de 3", { n: v.paso }, "small")}</span>${error ? `<button class="boton" data-accion="buscar-actualizacion">Buscar de nuevo</button>` : ""}</div>`;
    }
    if (a.hay) return `<div class="fila"><span class="txt"><b>Hay una versión nueva de Esquema</b><small class="notas-version" data-sin-traducir>${esc(a.detalle || "")}</small></span><button class="boton principal" data-accion="actualizar">Actualizar ahora</button></div>`;
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
    const n = E.nuevo, lista = plantillasFiltradas(), el = E.plantillas.find((p) => p.id === n.elegida);
    const blancos = [["blanco-flujo", "Diagrama de flujo", "flowchart TD\n    A[Inicio] --> B[Siguiente paso]\n", "diagrama.mmd"], ["blanco-secuencia", "Diagrama de secuencia", "sequenceDiagram\n    participant A as Cliente\n    participant B as Servidor\n    A->>B: Pedido\n    B-->>A: Respuesta\n", "secuencia.mmd"], ["blanco-doc", "Documento", "# Título\n\nEscribe aquí.\n", "documento.md"]];
    const q = (n.busqueda || "").trim();
    return `<h2 id="t-nv">Nuevo</h2>
      <div class="buscar-fila"><input type="search" id="buscar-plantilla" placeholder="Buscar plantillas" value="${esc(n.busqueda || "")}" aria-label="Buscar plantillas" data-sin-traducir data-autofoco></div>
      <div class="chips" style="margin-top:10px">${["todas", ...CATEGORIAS].map((c) => `<button class="chip" data-categoria="${c}" aria-pressed="${n.categoria === c}">${NOMBRE_CAT[c]}</button>`).join("")}</div>
      <div class="plantillas">
        ${n.categoria === "todas" && !q ? `<button class="plantilla ia" data-accion="readme"><span class="previa">${ic("github")}</span><span class="info"><b>README para GitHub</b><small>Tu IA lo escribe desde lo que cuentas y la lista de archivos.</small></span></button>
          ${blancos.map(([id, nom, , ]) => `<button class="plantilla" data-plantilla="${id}" aria-pressed="${n.elegida === id}"><span class="previa">${ic(id === "blanco-doc" ? "doc" : "diagrama")}</span><span class="info"><b>${nom}</b><small>En blanco</small></span></button>`).join("")}` : ""}
        ${lista.map((p) => `<button class="plantilla" data-plantilla="${esc(p.id)}" aria-pressed="${n.elegida === p.id}" data-sin-traducir><span class="previa">${previaPlantilla(p)}</span><span class="info"><b>${esc(textoDe(p.nombre))}</b><small>${esc(textoDe(p.descripcion))}</small></span></button>`).join("")}
      </div>
      ${q && !lista.length ? `<div class="vacio">${frase("Aún no hay una plantilla de «{x}».", { x: q }, "p")}<button class="boton principal" data-accion="dibujame-busqueda">${ic("chispa")} Pídesela a tu IA</button></div>` : ""}
      ${n.elegida ? `<label for="nombre-nuevo">Nombre del archivo</label><input type="text" id="nombre-nuevo" value="${esc(n.nombre || "")}" data-sin-traducir>${n.errorNombre ? `<p class="mal-txt">${n.errorNombre}</p>` : ""}` : ""}
      <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="crear" ${n.elegida ? "" : "disabled"}>Crear</button></div>`;
    void el; void blancos;
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
  function dialogoDibujar() {
    const d = E.dibujar, hayDiagrama = !!textoLienzo().trim();
    if (d.enviando) return `<h2 id="t-dj">Dibújame</h2><div class="esperando"><span class="giro"></span>${frase("{ia} está dibujando…", { ia: nombreIA() })}</div><div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button></div>`;
    return `<h2 id="t-dj">Dibújame</h2>
      <p>Cuéntale a tu IA qué quieres ver. Revisa el resultado en el lienzo: si no te gusta, lo quitas con un toque.</p>
      <textarea id="pedido-dibujo" placeholder="Por ejemplo: el flujo de compra de una tienda, con pago y despacho" data-autofoco data-sin-traducir>${esc(d.pedido || "")}</textarea>
      <div class="chips" style="margin-top:8px">${EJEMPLOS_DIBUJO.map((x, i) => `<button class="chip" data-ejemplo-dibujo="${i}">${x}</button>`).join("")}</div>
      <label>Tipo</label><div class="chips">${[["auto", "Que elija"], ["flujo", "Flujo"], ["secuencia", "Secuencia"], ["arquitectura", "Arquitectura"]].map(([v, n]) => `<button class="chip" data-tipo-dibujo="${v}" aria-pressed="${(d.tipo || "auto") === v}">${n}</button>`).join("")}</div>
      ${hayDiagrama ? `<label class="marcar"><input type="checkbox" id="cambiar-actual" ${d.cambiar ? "checked" : ""}> <span>Cambiar el diagrama que tengo abierto<small>${esDocumento(E.sel) ? "Si no, agrega uno nuevo al documento." : "Si no, crea uno nuevo."}</small></span></label>` : ""}
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
    if (!d.pedido) { d.error = tr("Escribe qué quieres que dibuje."); return pintar(); }
    d.enviando = true; d.error = null;
    host.enviar("dibujar", { pedido: d.pedido, tipo: d.tipo || "auto", actual: d.cambiar ? textoLienzo() : "", idioma: E.idioma });
    pintar();
  }
  function aplicarDibujo(texto) {
    const d = E.dibujar, dc = doc();
    if (!dc) return;
    const r = M.dibujar(texto);
    if (r.errores?.length || !(r.tipo === "flujo" || r.tipo === "secuencia")) {
      d.enviando = false;
      d.error = r.errores?.length ? T("La propuesta tenía un error (línea {n}: {x}). No la apliqué; pídelo otra vez con más detalle.", { n: r.errores[0].linea, x: M.frase(r.errores[0]) }) : T("La respuesta no era un diagrama que Esquema sepa dibujar. No apliqué nada.");
      return pintar();
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
    traducirDOM(el);
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
    const t = e.target.closest("button, [data-abrir], a[data-enlace], .velo");
    if (!t) { if (E.menu && !e.target.closest("#menu")) { E.menu = null; pintarMenu(); } return; }
    if (t.closest("#menu") === null && E.menu && !t.dataset.accion?.startsWith("menu-")) { E.menu = null; pintarMenu(); }
    const d = t.dataset;
    if (d.idioma) return elegirIdioma(d.idioma);
    if (d.abrir) return abrir(d.abrir);
    if (d.vista) { E.vista = d.vista; return pintar(); }
    if (d.bv !== undefined && t.closest(".bienvenida, .capa")) { E.bv = Math.max(1, Number(d.bv)); return pintar(); }
    if (d.probarIa) { E.config.ia = d.probarIa; host.enviar("config", { ia: d.probarIa }); E.probando[d.probarIa] = true; host.enviar("probarIA", { ia: d.probarIa }); return pintar(); }
    if (d.ajusteIdioma) { E.config.idioma_ui = d.ajusteIdioma; host.enviar("config", { idioma_ui: d.ajusteIdioma }); return cargarIdioma(d.ajusteIdioma).then(pintar); }
    if (d.tema) { E.config.tema = d.tema; host.enviar("config", { tema: d.tema }); return pintar(); }
    if (d.enlace) { e.preventDefault(); return abrirEnlace(d.enlace); }
    if (d.categoria) { E.nuevo.categoria = d.categoria; return pintar(); }
    if (d.plantilla) {
      E.nuevo.elegida = d.plantilla; E.nuevo.errorNombre = null;
      const pl = E.plantillas.find((p) => p.id === d.plantilla);
      E.nuevo.nombre = nombreLibre(pl ? textoDe(pl.archivo) : contenidoBlanco(d.plantilla)[1]);
      pintar(); $("#nombre-nuevo")?.focus(); return;
    }
    if (d.ejemploDibujo) { E.dibujar.pedido = tr(EJEMPLOS_DIBUJO[Number(d.ejemploDibujo)]); E.dibujar.cambiar = !!$("#cambiar-actual")?.checked; return pintar(); }
    if (d.tipoDibujo) { E.dibujar.pedido = $("#pedido-dibujo")?.value || ""; E.dibujar.cambiar = !!$("#cambiar-actual")?.checked; E.dibujar.tipo = d.tipoDibujo; return pintar(); }
    if (d.quitarIa) { E.dibujar = null; return quitarCambioIA(d.quitarIa); }
    if (d.irLinea) return irALinea(Number(d.irLinea));
    if (d.sugerencia) return usarSugerencia(Number(d.sugerencia));
    if (d.editarBloque !== undefined) { E.bloque = Number(d.editarBloque); E.elegido = null; E.lz.ajustar = true; if (movil()) E.vista = "dibujo"; else if (E.vista === "texto") E.vista = "ambos"; pintar(); seleccionarBloqueEnTexto(); return; }
    if (d.forma) { const s = E.elegido; E.menu = null; pintarMenu(); if (s?.tipo === "nodo") ponerTextoLienzo(M.cambiarForma(textoLienzo(), s.id, d.forma, d.icono || null), { origen: "lienzo" }); return; }
    if (d.flechas) { E.menu = null; pintarMenu(); return ponerTextoLienzo(M.estiloAristas(textoLienzo(), d.flechas), { origen: "lienzo" }); }
    if (d.exportar) return exportar(d.exportar);
    const a = d.accion;
    if (!a) return;
    switch (a) {
      case "abrir-lateral": E.lateral = true; return pintar();
      case "cerrar-lateral": E.lateral = false; return pintar();
      case "elegir-carpeta": return host.enviar("elegirCarpeta");
      case "nuevo": E.lateral = false; E.nuevo = { categoria: "todas", busqueda: "", elegida: null, nombre: "" }; return pintar();
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
      case "dibujame": E.dibujar = { pedido: "", tipo: "auto", cambiar: !!textoLienzo().trim() && (esDiagrama(E.sel) || E.bloque != null) }; return pintar();
      case "dibujame-busqueda": { const q = E.nuevo?.busqueda || ""; E.nuevo = null; if (!E.sel) { toast("Abre o crea un archivo primero"); return pintar(); } E.dibujar = { pedido: q, tipo: "auto", cambiar: false }; return pintar(); }
      case "enviar-dibujo": return enviarDibujo();
      case "cerrar-tarjeta": E.tarjetaIA = null; return pintarTarjetaIA();
      case "ajustes": E.lateral = false; E.ajustes = true; return pintar();
      case "cerrar": cerrarDialogo(); return;
      case "confirmar-si": { const c = E.confirmar; E.confirmar = null; c?.accion(); return pintar(); }
      case "confirmar-no": { const c = E.confirmar; E.confirmar = null; c?.alNo?.(); return pintar(); }
      case "buscar-actualizacion": E.revisando = "buscando"; host.enviar("buscarActualizacion"); return pintar();
      case "actualizar": guardarTodo(); E.revisando = { paso: "0", texto: tr("Preparando…") }; host.enviar("actualizar"); return pintar();
      case "bv-fin": E.bv = null; E.config.bienvenida = true; host.enviar("config", { bienvenida: true }); if (!E.sel && E.archivos.length) return abrir(primerArchivo()); return pintar();
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
  function cerrarDialogo() {
    if (E.bv !== null && E.bv !== 0) { E.bv = null; E.config.bienvenida = true; host.enviar("config", { bienvenida: true }); }
    E.ajustes = false; E.nuevo = null; E.readme = null; E.dibujar = null; E.confirmar = null; E.menu = null;
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
    if (url.startsWith("#")) { const el = document.getElementById(decodeURIComponent(url.slice(1))); el?.scrollIntoView({ behavior: "smooth" }); return; }
    const destino = E.archivos.find((a) => a.ruta === url.replace(/^\.\//, "").split("#")[0]);
    if (destino) return abrir(destino.ruta);
    if (/^http:\/\//.test(url)) return host.enviar("abrirEnlace", { url });
  }
  document.addEventListener("input", (e) => {
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
    if (E.bv === 0) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      if (E.menu) { E.menu = null; pintarMenu(); return; }
      if (E.confirmar || E.ajustes || E.nuevo || E.readme || E.dibujar || (E.bv !== null)) return cerrarDialogo();
      if (E.lateral) { E.lateral = false; return pintar(); }
      if (E.elegido) { E.elegido = null; return pintarSeleccion(); }
      if (E.bloque != null) { E.bloque = null; return pintar(); }
    }
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

  async function elegirIdioma(codigo) {
    E.config.idioma_ui = codigo;
    host.enviar("config", { idioma_ui: codigo });  // el mismo camino que el selector de Ajustes
    await cargarIdioma(codigo);
    E.bv = 1;
    pintar();
    $("#t-bv")?.focus();
    const avisos = avisosPendientes; avisosPendientes = [];
    if (avisos.length) toast(...avisos[avisos.length - 1]);
  }

  // ───────────── Lo que llama la app ─────────────
  window.Esquema = {
    async estado(e) {
      if (e.actualizacion) {
        E.actualizacion = e.actualizacion.hay ? { hay: true, detalle: e.actualizacion.detalle || "" } : { hay: false };
        if (E.actualizacion.hay && !E.avisoVersion) { E.avisoVersion = true; toast("Hay una versión nueva de Esquema: está en Ajustes"); }
      }
      Object.assign(E, { config: e.config || {}, ias: e.ias || [], version: e.version || "", plantillas: (e.plantillas || []).filter((p) => !validarPlantilla(p).length), carpeta: e.carpeta || null, archivos: (e.archivos || []).slice().sort(porRuta) });
      const parametros = new URLSearchParams(location.search);
      if (parametros.has("vacio")) { E.carpeta = null; E.archivos = []; }
      await cargarIdioma();
      if (!E.config.bienvenida || parametros.has("bienvenida")) E.bv = E.config.idioma_ui && !parametros.has("bienvenida") ? 1 : 0;
      E.cargado = true;
      if (!E.sel && E.archivos.length && E.bv === null) {
        let ultimo = null; try { ultimo = localStorage.getItem("esquema.ultimo"); } catch { /* sin almacenamiento */ }
        return abrir(E.archivos.some((a) => a.ruta === ultimo) ? ultimo : primerArchivo());
      }
      pintar();
    },
    carpetaElegida(r) {
      if (!r.ok) { if (r.error) toast(r.error); return; }
      E.carpeta = r.carpeta; E.archivos = (r.archivos || []).slice().sort(porRuta); E.docs = {}; E.sel = null; E.cambiosIA = [];
      if (E.bv === null && E.archivos.length) return abrir(primerArchivo());
      pintar();
    },
    archivoAbierto(r) {
      const d = E.docs[r.ruta];
      if (!d) return;
      if (!r.ok) { d.estado = "error"; toast(r.error || "No pude abrir el archivo"); delete E.docs[r.ruta]; if (E.sel === r.ruta) E.sel = null; return pintar(); }
      d.texto = r.texto; d.guardado = r.texto; d.estado = "guardado";
      if (r.ruta === E.sel) { ultimoBueno = null; pintar(); }
      if (d.alAbrir) { const f = d.alAbrir; d.alAbrir = null; f(); }
    },
    archivoGuardado(r) {
      const d = E.docs[r.ruta];
      if (!d) return;
      if (!r.ok) { d.estado = "error"; toast(r.error || "No se pudo guardar"); return pintarEstadoGuardado(); }
      d.guardado = d.enviado ?? d.texto;
      d.estado = d.texto === d.guardado ? "guardado" : "cambiado";
      if (d.estado === "cambiado") programarGuardado(r.ruta);
      pintarEstadoGuardado();
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
      if (d.texto === d.guardado && d.estado !== "guardando") { usarDisco(); return toast(Tp("«{x}» cambió en el disco: lo actualicé", { x: nombreDe(r.ruta) }), true); }
      E.confirmar = {
        titulo: frase("«{x}» cambió en el disco", { x: nombreDe(r.ruta) }),
        texto: esc("Otro programa lo cambió mientras tenías cambios sin guardar aquí. ¿Con cuál versión te quedas?"),
        si: "Usar la del disco", no: "Quedarme con la mía",
        accion: usarDisco,
        alNo: () => { d.guardado = r.texto; d.estado = "cambiado"; programarGuardado(r.ruta); },
      };
      pintar();
    },
    archivos(r) { E.archivos = (r.archivos || []).slice().sort(porRuta); pintar(); },
    iaProbada(r) { delete E.probando[r.ia]; E.resultadoIA[r.ia] = r; if (r.ok) toast("Lista para usar"); pintar(); },
    estructuraLista(r) { if (E.readme?.envio) { E.readme.envio = r.ok ? r : { archivos: [], error: r.error }; pintar(); } },
    readmeListo(r) {
      if (!E.readme) return;
      if (!r.ok) { E.readme.paso = "pedir"; E.readme.error = r.error || tr("Tu IA no respondió."); return pintar(); }
      Object.assign(E.readme, { paso: "listo", texto: r.texto, pedido: "" });
      pintar(); pintarPreviaReadme();
    },
    dibujoListo(r) {
      if (!E.dibujar) return;
      if (!r.ok) { E.dibujar.enviando = false; E.dibujar.error = esc(r.error || tr("Tu IA no respondió.")); return pintar(); }
      aplicarDibujo(r.texto);
    },
    exportado(r) { if (r.ok) toast(r.ruta ? Tp("Guardado en {x}", { x: r.ruta }) : tr("Listo"), true); else if (r.error) toast(r.error); },
    copiado(r) { toast(r.ok ? "Copiado: pégalo en GitHub y se verá como diagrama" : "No pude copiar"); },
    actualizacionRevisada(r) {
      E.actualizacion = r.hay ? { hay: true, detalle: r.detalle || "" } : { hay: false };
      E.revisando = r.hay ? null : r.sinConexion ? "sin-conexion" : "al-dia";
      pintar();
    },
    actualizacionProgreso(r) { E.revisando = { paso: String(r.paso || ""), texto: r.texto || "", pct: r.pct }; pintar(); },
    /** Los menús de la app (Mac: barra de menús; Windows y Linux: menú de la ventana). Nada antes de elegir el idioma. */
    menu(r) {
      const a = r && r.accion;
      if (E.bv === 0 || !E.cargado) return;
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
      if (E.bv !== null) return;  // en la bienvenida no se abren otros diálogos
      if (a === "nuevo") { if (!E.carpeta) return toast("Elige una carpeta primero"); E.lateral = false; E.nuevo = { categoria: "todas", busqueda: "", elegida: null, nombre: "" }; return pintar(); }
      if (a === "ajustes") { E.lateral = false; E.ajustes = true; return pintar(); }
    },
    _probar(f) { f(E); pintar(); },
    _pruebas: { validarPlantilla, validarNombre, resumen, abrir, motor: M },
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
      case "elegirCarpeta": return luego(150, () => A.carpetaElegida({ ok: true, carpeta: DEMO.carpeta, archivos: Object.keys(memoria).map((ruta) => ({ ruta })) }));
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
      case "buscarActualizacion": return luego(300, () => A.actualizacionRevisada({ hay: false, detalle: "" }));
      case "actualizar": return luego(300, () => A.actualizacionProgreso({ paso: "error", texto: tr("En la vista previa no hay nada que actualizar.") }));
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
