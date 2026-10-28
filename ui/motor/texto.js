// Motor de Esquema · utilidades de texto: medir (con caché), partir etiquetas en líneas, escapar y armar errores claros.
// Sin dependencias. Funciona igual en el navegador (mide con canvas) y en Node (las pruebas: medida aproximada y estable).
(function (M) {
  "use strict";
  const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  M.FUENTE = FUENTE;

  /** Escapa texto para meterlo en SVG/HTML. Todo lo que viene del usuario pasa por aquí antes de dibujarse. */
  M.esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Medir texto cuesta: se guarda cada medida (las etiquetas se repiten entre una pintada y la siguiente).
  const cache = new Map();
  let ctx = null;
  if (typeof document !== "undefined" && document.createElement) {
    try { ctx = document.createElement("canvas").getContext("2d"); } catch { ctx = null; }
  }
  /** Ancho aproximado sin canvas (Node): por tipo de letra. Estable, para que las pruebas den siempre lo mismo. */
  function aproximado(t, tam) {
    let a = 0;
    for (const c of t) {
      if (/[il.,:;'|!¡ ]/.test(c)) a += 0.3;
      else if (/[mwMW@%]/.test(c)) a += 0.85;
      else if (/[A-ZÁÉÍÓÚÑ0-9]/.test(c)) a += 0.64;
      else a += 0.54;
    }
    return a * tam;
  }
  M.medir = function (t, tam = 14, peso = 400) {
    const k = tam + "|" + peso + "|" + t;
    let w = cache.get(k);
    if (w === undefined) {
      if (ctx) { ctx.font = `${peso} ${tam}px ${FUENTE}`; w = ctx.measureText(t).width; } else w = aproximado(t, tam);
      if (cache.size > 20000) cache.clear();
      cache.set(k, w);
    }
    return w;
  };
  M._sinCanvas = () => { ctx = null; cache.clear(); };

  /** Entidades de Mermaid (#quot; #35; #9829;) y saltos <br>. Devuelve texto plano con \n. */
  M.decodificar = function (t) {
    return String(t)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x10ffff ? String.fromCodePoint(c) : ""; })
      .replace(/#(quot|amp|lt|gt|nbsp|apos);/g, (_, n) => ({ quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", apos: "'" }[n]));
  };
  /** Lo contrario: texto plano a etiqueta de Mermaid (comillas si hace falta, <br> para los saltos). */
  M.codificar = function (t) {
    const s = String(t).replace(/"/g, "#quot;").replace(/\r?\n/g, "<br>");
    return s;
  };

  /** Parte una etiqueta en líneas que caben en `max` px (respeta los saltos que puso la persona). */
  M.lineas = function (texto, max = 190, tam = 14, peso = 400) {
    const r = [];
    for (const parrafo of String(texto).split("\n")) {
      const palabras = parrafo.split(/ +/);
      let actual = "";
      for (const p of palabras) {
        const prueba = actual ? actual + " " + p : p;
        if (actual && M.medir(prueba, tam, peso) > max) { r.push(actual); actual = p; } else actual = prueba;
      }
      r.push(actual);
    }
    return r;
  };

  /** Un error o aviso para la persona: línea (1 en adelante), columna, una frase con marcadores y, si se puede, cómo arreglarlo.
   *  La frase está en español con {marcadores}: la interfaz la traduce entera (ui/idiomas) y después pone los valores. */
  M.problema = function (linea, columna, plantilla, valores = {}, sugerencia = null) {
    return { linea, columna, plantilla, valores, sugerencia };
  };
  /** La frase lista en español (las pruebas y la consola). */
  M.frase = function (p) {
    let t = p.plantilla;
    for (const [k, v] of Object.entries(p.valores || {})) t = t.split(`{${k}}`).join(String(v));
    return t;
  };

  /** Hash corto y estable (para claves de caché y ids de marcadores). */
  M.hash = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };

  /** Lee y valida la línea `%% esquema: {...}` (lo que Mermaid ignora y Esquema guarda: posiciones fijadas, íconos, estilo de
   *  las flechas). Lo desconocido se descarta: nunca se ejecuta nada de aquí. */
  M.leerMeta = function (json) {
    let d;
    try { d = JSON.parse(json); } catch { return null; }
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const r = {};
    if (d.pos && typeof d.pos === "object") {
      r.pos = {};
      for (const [id, v] of Object.entries(d.pos)) {
        if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && isFinite(n) && Math.abs(n) < 1e6) && id.length <= 80) r.pos[id] = [Math.round(v[0]), Math.round(v[1])];
      }
    }
    if (d.iconos && typeof d.iconos === "object") {
      r.iconos = {};
      for (const [id, v] of Object.entries(d.iconos)) if (typeof v === "string" && /^[a-z-]{1,24}$/.test(v) && id.length <= 80) r.iconos[id] = v;
    }
    if (d.aristas === "curva" || d.aristas === "recta" || d.aristas === "ortogonal") r.aristas = d.aristas;
    return r;
  };
  /** Escribe la línea de metadatos (una sola línea JSON, ordenada para que el diff de git sea chico). */
  M.escribirMeta = function (meta) {
    const o = {};
    if (meta.aristas && meta.aristas !== "curva") o.aristas = meta.aristas;
    if (meta.iconos && Object.keys(meta.iconos).length) o.iconos = Object.fromEntries(Object.keys(meta.iconos).sort().map((k) => [k, meta.iconos[k]]));
    if (meta.pos && Object.keys(meta.pos).length) o.pos = Object.fromEntries(Object.keys(meta.pos).sort().map((k) => [k, meta.pos[k]]));
    return Object.keys(o).length ? "%% esquema: " + JSON.stringify(o) : null;
  };
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
