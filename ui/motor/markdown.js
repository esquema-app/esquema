// Motor de Esquema · Markdown: encontrar los bloques ```mermaid``` de un documento y convertirlo a HTML seguro para la vista previa.
// Todo se escapa. Del HTML que trae el documento solo pasan unas pocas etiquetas sin atributos; las imágenes y los enlaces nunca se
// cargan ni navegan solos (la vista previa no pide nada a internet: tampoco las insignias de shields.io).
(function (M) {
  "use strict";
  const esc = (t) => M.esc(t);

  /** Bloques de código cercados: [{ini, fin, lenguaje, contenido, cerco}] (líneas, base 0; ini = línea del cerco que abre). */
  M.bloquesCodigo = function (md) {
    const L = String(md).replace(/\r\n?/g, "\n").split("\n"), r = [];
    for (let i = 0; i < L.length; i++) {
      const m = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/.exec(L[i]);
      if (!m) continue;
      const cerco = m[2];
      let j = i + 1;
      while (j < L.length && !new RegExp(`^ {0,3}${cerco[0]}{${cerco.length},}\\s*$`).test(L[j])) j++;
      r.push({ ini: i, fin: Math.min(j, L.length), lenguaje: m[3].toLowerCase(), contenido: L.slice(i + 1, j).join("\n"), cerco, cerrado: j < L.length });
      i = j;
    }
    return r;
  };
  M.bloquesMermaid = (md) => M.bloquesCodigo(md).filter((b) => b.lenguaje === "mermaid");

  /** Reemplaza el contenido del bloque k (mermaid) del documento. */
  M.reemplazarBloque = function (md, k, contenido) {
    const b = M.bloquesMermaid(md)[k];
    if (!b) return md;
    const L = String(md).replace(/\r\n?/g, "\n").split("\n");
    const c = String(contenido).replace(/\n+$/, "").split("\n");
    L.splice(b.ini + 1, b.fin - b.ini - 1, ...c);
    if (!b.cerrado) L.push(b.cerco);
    return L.join("\n");
  };
  /** Inserta un bloque mermaid después de la línea `linea` (o al final). Devuelve {texto, k}. */
  M.insertarBloque = function (md, contenido, linea = null) {
    const L = String(md).replace(/\r\n?/g, "\n").split("\n");
    let k = linea == null ? L.length : Math.min(L.length, linea + 1);
    if (linea == null) while (k > 0 && !L[k - 1].trim()) k--;
    const bloque = ["", "```mermaid", ...String(contenido).replace(/\n+$/, "").split("\n"), "```", ""];
    L.splice(k, 0, ...bloque);
    const texto = L.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "") + "\n";
    const pos = M.bloquesMermaid(texto).findIndex((b) => b.contenido.trim() === String(contenido).trim());
    return { texto, k: pos };
  };

  const enlaceSeguro = (u) => {
    u = String(u).trim();
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^#[\w-]*$/.test(u)) return u;
    if (/^[\w./-][\w./%-]*(#[\w-]*)?$/.test(u) && !/^[a-z][\w+.-]*:/i.test(u)) return u;  // ruta relativa
    return null;
  };
  const PERMITIDAS = new Set(["br", "details", "summary", "sub", "sup", "kbd", "b", "i", "em", "strong", "code"]);

  /** Texto en línea: código, negritas, cursivas, tachado, enlaces e imágenes (como marcador). */
  function enLinea(t) {
    const guardado = [];
    const g = (html) => { guardado.push(html); return `\u0000${guardado.length - 1}\u0000`; };
    t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => g(`<code>${esc(c.trim())}</code>`));
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_, alt) => g(`<span class="md-img" title="${esc(alt)}">${esc(alt || "imagen")}</span>`));
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, txt, url) => {
      const u = enlaceSeguro(url);
      return u ? g(`<a href="${esc(u)}" data-enlace="${esc(u)}">`) + txt + g("</a>") : txt;
    });
    t = t.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => g(`<a href="${esc(u)}" data-enlace="${esc(u)}">${esc(u)}</a>`));
    // HTML del documento: solo unas pocas etiquetas sin atributos; el resto se quita (queda su texto).
    t = t.replace(/<\/?([a-zA-Z][\w-]*)(\s[^<>]*)?\/?>/g, (m, tag) => (PERMITIDAS.has(tag.toLowerCase()) ? g(m.startsWith("</") ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}>`) : ""));
    t = esc(t);
    t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>").replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<em>$2</em>");
    t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
    return t.replace(/\u0000(\d+)\u0000/g, (_, k) => guardado[Number(k)]);
  }
  M.mdEnLinea = enLinea;

  /** Markdown → HTML. Los bloques mermaid quedan como <figure class="md-diagrama" data-bloque="k"> para que la interfaz los dibuje. */
  M.markdownHTML = function (md) {
    const L = String(md).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0, kMermaid = 0;
    const esLista = (l) => /^(\s*)([-*+]|\d{1,9}[.)])\s+/.exec(l);
    const corte = (l) => !l.trim() || /^\s{0,3}(#{1,6}\s|```|~~~|>|[-*_]{3,}\s*$|\|)/.test(l) || esLista(l);
    // Primero, el front matter (--- … ---) de algunos documentos: no se muestra.
    if (/^---\s*$/.test(L[0] || "")) { const f = L.findIndex((l, k) => k > 0 && /^---\s*$/.test(l)); if (f > 0) i = f + 1; }
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/.exec(l))) {
        const cerco = m[1], lang = m[2].toLowerCase();
        let j = i + 1;
        while (j < L.length && !new RegExp(`^ {0,3}${cerco[0]}{${cerco.length},}\\s*$`).test(L[j])) j++;
        const cont = L.slice(i + 1, j).join("\n");
        if (lang === "mermaid") out.push(`<figure class="md-diagrama" data-bloque="${kMermaid++}" data-linea="${i}"></figure>`);
        else out.push(`<pre><code${lang ? ` data-lenguaje="${esc(lang)}"` : ""}>${esc(cont)}</code></pre>`);
        i = j + 1; continue;
      }
      if ((m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
        const n = m[1].length, id = m[2].toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
        out.push(`<h${n} id="${esc(id)}">${enLinea(m[2])}</h${n}>`); i++; continue;
      }
      if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if (/^\s{0,3}>/.test(l)) {
        const q = [];
        while (i < L.length && /^\s{0,3}>/.test(L[i])) { q.push(L[i].replace(/^\s{0,3}>\s?/, "")); i++; }
        const alerta = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(q[0] || "");
        if (alerta) { q.shift(); out.push(`<blockquote class="alerta ${alerta[1].toLowerCase()}">${M.markdownHTML(q.join("\n"))}</blockquote>`); }
        else out.push(`<blockquote>${M.markdownHTML(q.join("\n"))}</blockquote>`);
        continue;
      }
      if (/^\s*\|/.test(l) && i + 1 < L.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(L[i + 1])) {
        const celdas = (s) => s.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
        const al = celdas(L[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : ""));
        const cab = celdas(l);
        let h = `<table><thead><tr>${cab.map((c, k) => `<th${al[k] ? ` style="text-align:${al[k]}"` : ""}>${enLinea(c)}</th>`).join("")}</tr></thead><tbody>`;
        i += 2;
        while (i < L.length && /^\s*\|/.test(L[i])) { h += `<tr>${celdas(L[i]).map((c, k) => `<td${al[k] ? ` style="text-align:${al[k]}"` : ""}>${enLinea(c)}</td>`).join("")}</tr>`; i++; }
        out.push(h + "</tbody></table>"); continue;
      }
      if (esLista(l)) {
        // Listas (anidadas por sangría), con tareas [ ] y [x].
        const pila = [];
        const cerrarHasta = (n) => { while (pila.length > n) { const t = pila.pop(); out.push(`</li></${t.tag}>`); } };
        let primero = true;
        while (i < L.length) {
          const li = L[i];
          const mm = esLista(li);
          if (!mm) {
            if (!li.trim()) { if (i + 1 < L.length && esLista(L[i + 1])) { i++; continue; } break; }
            if (/^\s{2,}/.test(li) && pila.length) { out.push(" " + enLinea(li.trim())); i++; continue; }
            break;
          }
          const sang = mm[1].replace(/\t/g, "    ").length, tag = /\d/.test(mm[2]) ? "ol" : "ul";
          while (pila.length && pila[pila.length - 1].sang > sang) cerrarHasta(pila.length - 1);
          if (!pila.length || pila[pila.length - 1].sang < sang) { pila.push({ sang, tag }); out.push(`<${tag}${tag === "ol" && primero && mm[2] !== "1." && mm[2] !== "1)" ? ` start="${parseInt(mm[2], 10)}"` : ""}><li>`); }
          else out.push("</li><li>");
          primero = false;
          let cont = li.slice(mm[0].length);
          const tarea = /^\[( |x|X)\]\s+/.exec(cont);
          if (tarea) { cont = cont.slice(tarea[0].length); out.push(`<input type="checkbox" disabled${tarea[1] !== " " ? " checked" : ""}> `); }
          out.push(enLinea(cont));
          i++;
        }
        cerrarHasta(0);
        continue;
      }
      // Párrafo (con títulos «setext»: texto subrayado con === o ---).
      const p = [l.trim()];
      i++;
      while (i < L.length && !corte(L[i])) {
        if (/^\s*=+\s*$/.test(L[i])) break;
        p.push(L[i].trim()); i++;
      }
      if (i < L.length && /^\s*(=+|-+)\s*$/.test(L[i]) && p.length === 1) { out.push(`<h${L[i].includes("=") ? 1 : 2}>${enLinea(p[0])}</h${L[i].includes("=") ? 1 : 2}>`); i++; continue; }
      out.push(`<p>${enLinea(p.join(" "))}</p>`);
    }
    return out.join("\n");
  };
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
