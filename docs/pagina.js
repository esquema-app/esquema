// Página de Esquema: idioma (es/en), botón de descarga según el sistema, el editor de la portada y la animación de «Cómo funciona».
// Los diagramas los dibuja el motor de verdad (demo/motor/, el mismo de la app), aquí mismo y sin pedir nada a otro sitio.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const html = document.documentElement;
  const M = window.EsquemaMotor;
  const BASE = "https://github.com/esquema-app/esquema/releases/latest/download/";

  // ───────────── Idioma: ?lang=en, lo que eligió antes o el del navegador ─────────────
  const TITULOS = {
    es: "Esquema — editor de diagramas Mermaid gratis: dibuja o escribe, y GitHub lo muestra | Alternativa abierta a Mermaid Live y draw.io",
    en: "Esquema — free Mermaid diagram editor: draw or type, and GitHub shows it | Open-source alternative to Mermaid Live and draw.io",
  };
  let textosEn = null;  // las frases de error del motor en inglés (demo/idiomas/en.json)
  const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const pedido = new URLSearchParams(location.search).get("lang");
  const idiomaInicial = pedido === "en" || pedido === "es" ? pedido : leer("esquema-idioma") || ((navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en");
  const boton = $("#idioma");
  function ponerIdioma(l) {
    const antes = html.lang;
    html.lang = l;
    boton.textContent = l === "es" ? "EN" : "ES";
    document.title = TITULOS[l];
    if (l === "en" && !textosEn) fetch("demo/idiomas/en.json").then((r) => r.json()).then((j) => { textosEn = j.textos || {}; dibujarEditor(); }).catch(() => {});
    if (antes !== l) { cambiarEjemplo(l); reiniciarAnimacion(); }
  }
  boton.addEventListener("click", () => { const l = html.lang === "es" ? "en" : "es"; ponerIdioma(l); guardar("esquema-idioma", l); });

  // ───────────── Descarga según el sistema ─────────────
  function sistema() {
    const p = `${navigator.userAgentData?.platform || ""} ${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
    if (/android|iphone|ipad|ipod/.test(p) || (/mac/.test(p) && navigator.maxTouchPoints > 1)) return "movil";
    if (/mac/.test(p)) return "mac";
    if (/win/.test(p)) return "windows";
    if (/linux|x11|cros/.test(p)) return "linux";
    return "";
  }
  const so = sistema();
  const DESCARGA = {
    mac: ["Esquema-macOS.zip", "Descargar para Mac", "Download for Mac", "Apple Silicon, macOS 15 o posterior. Con la Terminal es todavía más fácil: mira abajo.", "Apple Silicon, macOS 15 or later. It's even easier with Terminal: see below."],
    windows: ["Esquema-Windows.exe", "Descargar para Windows", "Download for Windows", "Windows 10 u 11, 64 bits. Si Windows avisa, mira «App sin firmar» abajo.", "Windows 10 or 11, 64-bit. If Windows warns you, see “Unsigned app” below."],
    linux: ["Esquema-Linux.AppImage", "Descargar para Linux", "Download for Linux", "AppImage para x86_64; también hay .deb y un comando de instalación abajo.", "AppImage for x86_64; there's also a .deb and an install command below."],
  };
  const frase = (es, en) => `<span data-es>${es}</span><span data-en>${en}</span>`;
  if (DESCARGA[so]) {
    const [archivo, es, en, notaEs, notaEn] = DESCARGA[so];
    $("#descarga-principal").href = BASE + archivo;
    $("#descarga-texto").innerHTML = frase(es, en);
    $("#descarga-nota").innerHTML = frase(notaEs + " Sin cuenta.", notaEn + " No account.");
    document.querySelector(`.so[data-so="${so}"]`)?.classList.add("tuyo");
  } else if (so === "movil") {
    $("#descarga-texto").innerHTML = frase("Ver las descargas", "See downloads");
    $("#descarga-nota").innerHTML = frase("Esquema es para computador (Mac, Windows y Linux). Desde aquí puedes probar la vista previa.", "Esquema is for computers (Mac, Windows and Linux). From here you can try the preview.");
  }

  // ───────────── El editor de la portada: el motor de verdad ─────────────
  const EJEMPLO = {
    es: "flowchart TD\n    U([Persona]) --> W[App web]\n    W -->|HTTPS| A{{API}}\n    A --> D[(Base de datos)]\n    A -.-> Q[[Cola de correos]]\n%% esquema: {\"iconos\":{\"A\":\"api\",\"Q\":\"cola\",\"U\":\"persona\",\"W\":\"navegador\"}}\n",
    en: "flowchart TD\n    U([Person]) --> W[Web app]\n    W -->|HTTPS| A{{API}}\n    A --> D[(Database)]\n    A -.-> Q[[Email queue]]\n%% esquema: {\"iconos\":{\"A\":\"api\",\"Q\":\"cola\",\"U\":\"persona\",\"W\":\"navegador\"}}\n",
  };
  const area = $("#mermaid"), dibujo = $("#dibujo"), tiempo = $("#tiempo"), pie = $("#editor-pie");
  const pieOriginal = pie.innerHTML;
  let tocado = false, pendiente = false;
  /** Una frase del motor ({plantilla, valores}) en el idioma de la página, como texto (nunca HTML). */
  function fraseMotor(p) {
    let t = (html.lang === "en" && textosEn?.[p.plantilla]) || p.plantilla;
    for (const [k, v] of Object.entries(p.valores || {})) t = t.split(`{${k}}`).join(String(v));
    return t;
  }
  function dibujarEditor() {
    pendiente = false;
    if (!M || !area) return;
    const t0 = performance.now();
    const r = M.dibujar(area.value);
    const svg = r.partes.length ? M.svgCompleto(r, { estilo: "", margen: 12 }) : "";
    const ms = performance.now() - t0;
    const e = r.errores[0] || r.avisos?.find((a) => r.tipo === "pendiente" && a);
    if (svg) dibujo.innerHTML = svg;
    dibujo.classList.toggle("con-error", !!r.errores.length);
    tiempo.classList.toggle("error", !!e);
    if (e) {
      tiempo.textContent = html.lang === "en" ? `line ${e.linea}` : `línea ${e.linea}`;
      pie.classList.add("error");
      pie.textContent = (html.lang === "en" ? `Line ${e.linea}: ` : `Línea ${e.linea}: `) + fraseMotor(e) + (e.sugerencia ? (html.lang === "en" ? ` Try: ${e.sugerencia}` : ` Prueba: ${e.sugerencia}`) : "");
    } else {
      const n = ms < 1 ? "< 1" : Math.round(ms);
      tiempo.textContent = html.lang === "en" ? `drawn in ${n} ms` : `dibujado en ${n} ms`;
      if (pie.classList.contains("error")) { pie.classList.remove("error"); pie.innerHTML = pieOriginal; }
    }
  }
  function cambiarEjemplo(l) { if (area && !tocado) { area.value = EJEMPLO[l]; dibujarEditor(); } }
  if (area) {
    area.addEventListener("input", () => { tocado = true; if (!pendiente) { pendiente = true; requestAnimationFrame(dibujarEditor); } });
    area.addEventListener("keydown", (ev) => {  // Tab escribe cuatro espacios (como en la app); Esc suelta el foco
      if (ev.key === "Tab" && !ev.shiftKey) { ev.preventDefault(); const a = area.selectionStart; area.setRangeText("    ", a, area.selectionEnd, "end"); area.dispatchEvent(new Event("input")); }
      if (ev.key === "Escape") area.blur();
    });
  }

  // ───────────── «Cómo funciona»: un diagrama que se arma línea por línea ─────────────
  const PASOS = {
    es: [
      [0, "flowchart TD\n    A([Pedido nuevo])"],
      [0, "flowchart TD\n    A([Pedido nuevo]) --> B{¿Hay stock?}"],
      [1, "flowchart TD\n    A([Pedido nuevo]) --> B{¿Hay stock?}\n    B -->|Sí| C[Cobrar]\n    B -->|No| D[Avisar a la persona]"],
      [1, "flowchart TD\n    A([Pedido nuevo]) --> B{¿Hay stock?}\n    B -->|Sí| C[Cobrar]\n    B -->|No| D[Avisar a la persona]\n    C --> E[(Pedidos)]\n    C -.-> F[[Correo de confirmación]]"],
      [2, "flowchart TD\n    A([Pedido nuevo]) --> B{¿Hay stock?}\n    B -->|Sí| C[Cobrar]\n    B -->|No| D[Avisar a la persona]\n    C --> E[(Pedidos)]\n    C -.-> F[[Correo de confirmación]]\n%% esquema: {\"iconos\":{\"C\":\"servidor\",\"F\":\"correo\"}}"],
    ],
    en: [
      [0, "flowchart TD\n    A([New order])"],
      [0, "flowchart TD\n    A([New order]) --> B{In stock?}"],
      [1, "flowchart TD\n    A([New order]) --> B{In stock?}\n    B -->|Yes| C[Charge]\n    B -->|No| D[Tell the customer]"],
      [1, "flowchart TD\n    A([New order]) --> B{In stock?}\n    B -->|Yes| C[Charge]\n    B -->|No| D[Tell the customer]\n    C --> E[(Orders)]\n    C -.-> F[[Confirmation email]]"],
      [2, "flowchart TD\n    A([New order]) --> B{In stock?}\n    B -->|Yes| C[Charge]\n    B -->|No| D[Tell the customer]\n    C --> E[(Orders)]\n    C -.-> F[[Confirmation email]]\n%% esquema: {\"iconos\":{\"C\":\"servidor\",\"F\":\"correo\"}}"],
    ],
  };
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animTexto = $("#anim-texto"), animDibujo = $("#anim-dibujo"), animBoton = $("#anim-boton"), animEstado = $("#anim-estado");
  let paso = 0, reloj = null, enPausa = quieto, visible = false;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function mostrarPaso() {
    const lista = PASOS[html.lang] || PASOS.es, [p, texto] = lista[paso], anterior = paso ? lista[paso - 1][1] : "";
    const nuevas = texto.split("\n").map((l, i) => (anterior.split("\n")[i] === l ? esc(l) : `<mark>${esc(l)}</mark>`));
    animTexto.innerHTML = nuevas.join("\n");
    const r = M ? M.dibujar(texto) : null;
    if (r?.partes.length) animDibujo.innerHTML = M.svgCompleto(r, { estilo: "", margen: 12 });
    document.querySelectorAll("#pasos li").forEach((li) => li.classList.toggle("activo", Number(li.dataset.paso) === p));
    animEstado.textContent = `${paso + 1} / ${lista.length}`;
  }
  function avanzar() { const n = (PASOS[html.lang] || PASOS.es).length; paso = (paso + 1) % n; mostrarPaso(); }
  function programar() { clearInterval(reloj); reloj = null; if (!enPausa && visible) reloj = setInterval(avanzar, 1800); }
  function ponerBoton() { animBoton.innerHTML = enPausa ? frase(quieto ? "Siguiente paso" : "Seguir", quieto ? "Next step" : "Play") : frase("Pausar", "Pause"); }
  function reiniciarAnimacion() { if (!animTexto) return; paso = quieto ? (PASOS.es.length - 1) : 0; mostrarPaso(); programar(); }
  if (animBoton) {
    animBoton.addEventListener("click", () => {
      if (quieto) return avanzar();  // con «reducir movimiento», el botón avanza a mano
      enPausa = !enPausa; ponerBoton(); programar();
    });
    new IntersectionObserver((e) => { visible = e.some((x) => x.isIntersecting); programar(); }, { threshold: 0.3 }).observe(animBoton.closest(".animacion"));
    ponerBoton();
  }

  ponerIdioma(idiomaInicial);
  if (html.lang === "es") { cambiarEjemplo("es"); reiniciarAnimacion(); }
})();
