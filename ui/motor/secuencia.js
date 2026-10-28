// Motor de Esquema · diagramas de secuencia (sequenceDiagram de Mermaid): leer, acomodar, dibujar y editar el texto.
(function (M) {
  "use strict";
  const f = (n) => Math.round(n * 10) / 10;
  const FLECHAS = [  // el orden importa: lo más largo primero
    ["<<-->>", "punteada", "llena", true], ["<<->>", "continua", "llena", true], ["-->>", "punteada", "llena"], ["->>", "continua", "llena"],
    ["--x", "punteada", "cruz"], ["-x", "continua", "cruz"], ["--)", "punteada", "async"], ["-)", "continua", "async"],
    ["-->", "punteada", "ninguna"], ["->", "continua", "ninguna"],
  ];
  const RE_MSG = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*([^:]+?)\s*(?::(.*))?$/;
  const BLOQUES = ["loop", "alt", "opt", "par", "critical", "break", "rect"];
  const SECCIONES = { else: "alt", and: "par", option: "critical" };

  M.parsearSecuencia = function (texto) {
    const lineas = String(texto).replace(/\r\n?/g, "\n").split("\n");
    const S = { tipo: "secuencia", lineas, participantes: [], idx: new Map(), eventos: [], autonumero: false, titulo: null, errores: [], avisos: [], cabecera: -1, sangria: "    " };
    const participante = (id, linea = -1) => {
      id = id.trim();
      if (!S.idx.has(id)) { const p = { id, etiqueta: id, actor: false, decl: null, linea }; S.idx.set(id, p); S.participantes.push(p); }
      return S.idx.get(id);
    };
    const pila = [];
    let i = 0;
    if (/^---\s*$/.test(lineas[0] || "")) { const k = lineas.findIndex((l, j) => j > 0 && /^---\s*$/.test(l)); if (k > 0) i = k + 1; }
    for (; i < lineas.length; i++) {
      const L = lineas[i], t = L.trim(), ini = L.length - L.trimStart().length;
      if (!t || /^%%\s*esquema:/.test(t)) continue;
      if (t.startsWith("%%")) { if (S.cabecera >= 0) S.eventos.push({ tipo: "comentario", texto: t, linea: i }); continue; }
      if (S.cabecera < 0) {
        if (!/^sequenceDiagram\s*$/.test(t)) { S.errores.push(M.problema(i + 1, 1, "La primera línea tiene que ser «sequenceDiagram».", {}, "sequenceDiagram")); return S; }
        S.cabecera = i; continue;
      }
      if (S.eventos.length === 0 && S.participantes.length === 0 && ini > 0) S.sangria = L.slice(0, ini);
      let m;
      if ((m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(t))) {
        const p = participante(m[2], i);
        p.actor = m[1] === "actor";
        if (m[3]) p.etiqueta = M.decodificar(m[3].trim());
        const aliasIni = m[3] ? ini + t.lastIndexOf(m[3]) : -1;
        p.decl = { linea: i, idFin: ini + t.indexOf(m[2]) + m[2].length, aliasIni, aliasFin: m[3] ? aliasIni + m[3].length : -1 };
        continue;
      }
      if (/^autonumber\b/.test(t)) { S.autonumero = true; continue; }
      if ((m = /^title\s*:?\s*(.+)$/.exec(t))) { S.titulo = m[1]; continue; }
      if ((m = /^(activate|deactivate)\s+(.+)$/.exec(t))) { S.eventos.push({ tipo: m[1] === "activate" ? "activar" : "desactivar", p: participante(m[2]).id, linea: i }); continue; }
      if ((m = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s?(.*)$/i.exec(t))) {
        const ps = m[2].split(",").map((x) => participante(x).id);
        const lado = m[1].toLowerCase() === "over" ? "sobre" : m[1].toLowerCase() === "left of" ? "izquierda" : "derecha";
        const txtIni = ini + t.length - m[3].length;
        S.eventos.push({ tipo: "nota", lado, ps, texto: M.decodificar(m[3]), linea: i, txtIni, txtFin: ini + t.length });
        continue;
      }
      if (/^note\b/i.test(t)) { S.errores.push(M.problema(i + 1, ini + 1, "Una nota necesita lado y texto: «Note right of A: texto».", {}, "Note right of A: texto")); continue; }
      const pal = t.split(/\s+/)[0];
      if (BLOQUES.includes(pal)) {
        const ev = { tipo: "bloque", clase: pal, texto: M.decodificar(t.slice(pal.length).trim()), linea: i };
        S.eventos.push(ev); pila.push(ev); continue;
      }
      if (SECCIONES[pal]) {
        const abierto = pila[pila.length - 1];
        if (!abierto || (abierto.clase !== SECCIONES[pal])) { S.errores.push(M.problema(i + 1, ini + 1, "«{x}» solo va dentro de un «{b}».", { x: pal, b: SECCIONES[pal] }, `${SECCIONES[pal]} …`)); continue; }
        S.eventos.push({ tipo: "seccion", clase: pal, texto: M.decodificar(t.slice(pal.length).trim()), linea: i }); continue;
      }
      if (t === "end") {
        if (!pila.length) { S.errores.push(M.problema(i + 1, ini + 1, "Sobra este «end»: no hay ningún bloque abierto.", {})); continue; }
        pila.pop(); S.eventos.push({ tipo: "finBloque", linea: i }); continue;
      }
      if (/^(box|create|destroy|links?|properties|details)\b/.test(t)) { S.avisos.push(M.problema(i + 1, ini + 1, "Esquema todavía no dibuja «{x}» en secuencias; lo dejo en el texto.", { x: pal })); continue; }
      if ((m = RE_MSG.exec(t))) {
        if (m[5] === undefined) { S.errores.push(M.problema(i + 1, ini + t.length + 1, "Al mensaje le falta «:» y su texto.", {}, t + ": mensaje")); continue; }
        const fl = FLECHAS.find((x) => x[0] === m[2]);
        const de = participante(m[1]).id, a = participante(m[4]).id;
        const txtIni = ini + t.length - m[5].length + (m[5].startsWith(" ") ? 1 : 0);
        S.eventos.push({ tipo: "mensaje", de, a, texto: M.decodificar(m[5].trim()), trazo: fl[1], punta: fl[2], doble: !!fl[3], activar: m[3] || null, linea: i, txtIni, txtFin: ini + t.length });
        continue;
      }
      const sug = /[-=]>/.test(t) ? "A->>B: mensaje" : null;
      S.errores.push(M.problema(i + 1, ini + 1, "No entiendo «{x}». Un mensaje se escribe «A->>B: texto».", { x: t.slice(0, 30) }, sug));
    }
    if (S.cabecera < 0) S.errores.push(M.problema(1, 1, "Falta la primera línea: «sequenceDiagram».", {}, "sequenceDiagram"));
    for (const b of pila) S.errores.push(M.problema(b.linea + 1, 1, "Falta «end» para cerrar «{x}» de la línea {n}.", { x: b.clase, n: b.linea + 1 }, "end"));
    return S;
  };

  M.dibujarSecuencia = function (S, op = {}) {
    const p = op.prefijo || "esq";
    const TM = 13, LM = 16;
    const ps = S.participantes, n = ps.length;
    const ix = new Map(ps.map((q, i) => [q.id, i]));
    const ancho = ps.map((q) => Math.max(84, M.lineas(q.etiqueta, 180, 14).reduce((m, l) => Math.max(m, M.medir(l, 14, 500)), 0) + 28));
    const alto = ps.map((q) => (q.actor ? 64 : Math.max(40, M.lineas(q.etiqueta, 180, 14).length * 18 + 20)));
    const altoCab = Math.max(40, ...alto);
    const lin = (t, max = 260) => M.lineas(t, max, TM);
    const anchoTxt = (ls) => ls.reduce((m, l) => Math.max(m, M.medir(l, TM)), 0);
    // Distancias mínimas entre centros.
    const need = Array.from({ length: n }, () => new Map());
    const pedir = (i, j, d) => { if (i > j) [i, j] = [j, i]; if (i === j) return; need[j].set(i, Math.max(need[j].get(i) || 0, d)); };
    let margenIzq = 0, margenDer = 0;
    for (const ev of S.eventos) {
      if (ev.tipo === "mensaje") {
        const i = ix.get(ev.de), j = ix.get(ev.a), w = anchoTxt(lin(ev.texto)) + (S.autonumero ? 34 : 24);
        if (i === j) { if (i + 1 < n) pedir(i, i + 1, ancho[i + 1] / 2 + Math.max(60, w + 30)); else margenDer = Math.max(margenDer, w + 40); }
        else pedir(i, j, w);
      } else if (ev.tipo === "nota") {
        const w = Math.min(240, anchoTxt(lin(ev.texto, 220))) + 20;
        const is = ev.ps.map((x) => ix.get(x)).sort((a, b) => a - b);
        if (ev.lado === "derecha") { const i = is[0]; if (i + 1 < n) pedir(i, i + 1, w + 24 + ancho[i + 1] / 2 - 10); else margenDer = Math.max(margenDer, w + 24); }
        else if (ev.lado === "izquierda") { const i = is[0]; if (i > 0) pedir(i - 1, i, w + 24 + ancho[i - 1] / 2 - 10); else margenIzq = Math.max(margenIzq, w + 24); }
        else if (is.length > 1) pedir(is[0], is[is.length - 1], w - 40);
        else { const i = is[0]; if (i > 0) pedir(i - 1, i, w / 2 + ancho[i - 1] / 2 + 10); if (i + 1 < n) pedir(i, i + 1, w / 2 + ancho[i + 1] / 2 + 10); }
      }
    }
    const x = new Array(n);
    for (let j = 0; j < n; j++) {
      if (!j) { x[0] = ancho[0] / 2 + margenIzq; continue; }
      let v = x[j - 1] + (ancho[j - 1] + ancho[j]) / 2 + 36;
      for (const [i, d] of need[j]) v = Math.max(v, x[i] + d);
      x[j] = v;
    }
    // Filas.
    const partes = [];
    let y = altoCab + 26;
    const act = new Map(ps.map((q) => [q.id, []]));  // pila de activaciones abiertas: [{y0, nivel}]
    const activaciones = [];
    const abrirAct = (id, yy) => { const l = act.get(id); l.push({ y0: yy, nivel: l.length }); };
    const cerrarAct = (id, yy) => { const l = act.get(id); const a = l.pop(); if (a) activaciones.push({ id, y0: a.y0, y1: yy, nivel: a.nivel }); };
    const desplazamiento = (id, haciaDerecha) => { const l = act.get(id).length; return l ? (haciaDerecha ? 5 + (l - 1) * 4 : -5) : 0; };
    const pilaB = [];
    const bloques = [];
    let numero = 0;
    const tocar = (is) => { for (const b of pilaB) for (const i of is) { b.min = Math.min(b.min, i); b.max = Math.max(b.max, i); } };
    const geoEventos = new Map();
    S.eventos.forEach((ev, k) => {
      if (ev.tipo === "mensaje") {
        const i = ix.get(ev.de), j = ix.get(ev.a), ls = lin(ev.texto);
        tocar([i, j]);
        y += ls.length * LM + 6;
        const yy = y;
        if (ev.activar === "+") abrirAct(ev.a, yy);
        let d, tx, ty = yy - 7 - (ls.length - 1) * LM;
        const clase = `mensaje ${ev.trazo}`;
        const mk = (pt) => (pt === "llena" ? "flecha" : pt === "cruz" ? "cruz" : pt === "async" ? "abierta" : null);
        const ma = mk(ev.punta);
        if (i === j) {
          const x0 = x[i] + desplazamiento(ev.de, true);
          d = `M${f(x0)},${f(yy)}H${f(x0 + 36)}V${f(yy + 22)}H${f(x0 + 2)}`;
          tx = x0 + 44; y += 22;
          const tw = anchoTxt(ls);
          partes.push({ clave: "m:" + k, svg: `<g class="${clase}" data-evento="${k}" data-linea="${ev.linea}"><path class="toque" d="${d}"/><path class="trazo" d="${d}"${ma ? ` marker-end="url(#${p}-${ma})"` : ""}/>${ls.map((l, q) => `<text x="${f(tx)}" y="${f(yy + 4 + q * LM)}">${M.esc(l)}</text>`).join("")}${S.autonumero ? numeroSVG(++numero, x0, yy) : ""}</g>` });
          geoEventos.set(k, { x: tx + tw / 2, y: yy, w: tw, tipo: "mensaje" });
        } else {
          const der = j > i;
          const x0 = x[i] + desplazamiento(ev.de, der), x1 = x[j] + (der ? -1 : 1) * (act.get(ev.a).length ? 5 : 0) * (der ? 1 : 1);
          const x1b = der ? x[j] - (act.get(ev.a).length ? 5 : 0) : x[j] + (act.get(ev.a).length ? 5 + (act.get(ev.a).length - 1) * 4 : 0);
          d = `M${f(x0)},${f(yy)}H${f(x1b)}`;
          tx = (x0 + x1b) / 2;
          void x1;
          partes.push({ clave: "m:" + k, svg: `<g class="${clase}" data-evento="${k}" data-linea="${ev.linea}"><path class="toque" d="${d}"/><path class="trazo" d="${d}"${ma ? ` marker-end="url(#${p}-${ma})"` : ""}${ev.doble && ma ? ` marker-start="url(#${p}-${ma})"` : ""}/>${ls.map((l, q) => `<text text-anchor="middle" x="${f(tx + (S.autonumero ? 8 : 0))}" y="${f(ty + q * LM)}">${M.esc(l)}</text>`).join("")}${S.autonumero ? numeroSVG(++numero, x0, yy) : ""}</g>` });
          geoEventos.set(k, { x: tx, y: ty - 4 + ((ls.length - 1) * LM) / 2, w: anchoTxt(ls), tipo: "mensaje" });
        }
        if (ev.activar === "-") cerrarAct(ev.de, yy);
        y += 14;
      } else if (ev.tipo === "activar") { abrirAct(ev.p, y); }
      else if (ev.tipo === "desactivar") { cerrarAct(ev.p, y); }
      else if (ev.tipo === "nota") {
        const is = ev.ps.map((q) => ix.get(q)).sort((a, b) => a - b), ls = lin(ev.texto, 220);
        tocar(is);
        const w = Math.min(240, anchoTxt(ls)) + 20, h = ls.length * LM + 12;
        y += 8;
        let nx;
        if (ev.lado === "derecha") nx = x[is[0]] + 12;
        else if (ev.lado === "izquierda") nx = x[is[0]] - 12 - w;
        else if (is.length > 1) { const a = x[is[0]] - 20, b = x[is[is.length - 1]] + 20; nx = Math.min(a, (a + b) / 2 - w / 2); const ww = Math.max(w, b - a); partes.push(nota(k, ev, nx, y, ww, h, ls)); geoEventos.set(k, { x: nx + ww / 2, y: y + h / 2, w: ww, tipo: "nota" }); y += h + 8; return; }
        else nx = x[is[0]] - w / 2;
        partes.push(nota(k, ev, nx, y, w, h, ls));
        geoEventos.set(k, { x: nx + w / 2, y: y + h / 2, w, tipo: "nota" });
        y += h + 8;
      } else if (ev.tipo === "bloque") {
        y += 10;
        pilaB.push({ k, ev, y0: y, min: Infinity, max: -Infinity, secciones: [], prof: pilaB.length });
        y += 30;
      } else if (ev.tipo === "seccion") {
        y += 8;
        pilaB[pilaB.length - 1]?.secciones.push({ k, ev, y });
        y += 24;
      } else if (ev.tipo === "finBloque") {
        y += 8;
        const b = pilaB.pop();
        if (b) { b.y1 = y; bloques.push(b); for (const o of pilaB) { o.min = Math.min(o.min, b.min); o.max = Math.max(o.max, b.max); } }
        y += 4;
      }
    });
    const yFin = y + 18;
    for (const [id] of act) while (act.get(id).length) cerrarAct(id, yFin - 8);
    // Bloques (detrás de todo).
    const fondo = [], textos = [];
    for (const b of bloques) {
      const i0 = isFinite(b.min) ? b.min : 0, i1 = isFinite(b.max) ? b.max : n - 1;
      const extra = 14 + Math.max(0, 3 - b.prof) * 4;
      const bx = x[i0] - ancho[i0] / 2 - extra + 10, bw = x[i1] + ancho[i1] / 2 + extra - 10 - bx;
      const titulo = b.ev.clase === "rect" ? "" : b.ev.clase;
      const etq = b.ev.texto ? `[${b.ev.texto}]` : "";
      if (b.ev.clase === "rect") {
        const col = /^(rgba?\([\d\s.,%]+\)|#[0-9a-fA-F]{3,8}|[a-z]{3,20})$/.test(b.ev.texto) ? b.ev.texto : "rgba(120,140,180,.12)";
        fondo.push({ clave: "b:" + b.k, svg: `<g class="bloque fondo" data-evento="${b.k}" data-linea="${b.ev.linea}"><rect x="${f(bx)}" y="${f(b.y0)}" width="${f(bw)}" height="${f(b.y1 - b.y0)}" style="fill:${M.esc(col)};stroke:none"/></g>` });
        continue;
      }
      const tw = M.medir(titulo, 12.5, 600) + 16;
      const cx = bx + tw + (bw - tw) / 2;
      fondo.push({ clave: "b:" + b.k, svg: `<g class="bloque" data-evento="${b.k}" data-linea="${b.ev.linea}"><rect x="${f(bx)}" y="${f(b.y0)}" width="${f(bw)}" height="${f(b.y1 - b.y0)}"/>` +
        b.secciones.map((s) => `<line class="sep" x1="${f(bx)}" x2="${f(bx + bw)}" y1="${f(s.y)}" y2="${f(s.y)}"/>`).join("") + "</g>" });
      textos.push({ clave: "bt:" + b.k, svg: `<g class="bloque" data-evento="${b.k}" data-linea="${b.ev.linea}"><path class="rotulo" d="M${f(bx)},${f(b.y0)}h${f(tw)}v13l-7,7h${f(-tw + 7)}z"/><text x="${f(bx + 8)}" y="${f(b.y0 + 14)}" font-weight="600">${M.esc(titulo)}</text>` +
        (etq ? `<text class="condicion" text-anchor="middle" x="${f(cx)}" y="${f(b.y0 + 15)}">${M.esc(etq)}</text>` : "") +
        b.secciones.map((s) => `<text class="condicion" text-anchor="middle" x="${f(bx + bw / 2)}" y="${f(s.y + 15)}" data-linea="${s.ev.linea}">[${M.esc(s.ev.texto || s.ev.clase)}]</text>`).join("") + "</g>" });
    }
    // Participantes con su línea de vida (arriba y abajo, como Mermaid).
    const cab = [];
    ps.forEach((q, i) => {
      const w = ancho[i], h = alto[i], ls = M.lineas(q.etiqueta, 180, 14);
      const caja = (yy) => q.actor
        ? `<g class="participante actor" transform="translate(${f(x[i])},${f(yy)})"><circle class="cuerpo" cx="0" cy="9" r="8"/><path class="linea" d="M0,17V36M-12,24H12M0,36L-10,50M0,36L10,50"/><text text-anchor="middle" y="${f(h - 2)}" font-weight="500">${M.esc(q.etiqueta)}</text></g>`
        : `<g class="participante" transform="translate(${f(x[i])},${f(yy + h / 2)})"><rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" rx="5"/><text text-anchor="middle" y="${f(-((ls.length - 1) * 18) / 2 + 5)}" font-weight="500">${ls.map((l, k) => `<tspan x="0"${k ? ' dy="18"' : ""}>${M.esc(l)}</tspan>`).join("")}</text></g>`;
      const y0 = altoCab - h;
      cab.push({ clave: "p:" + q.id, svg: `<g class="vida-p" data-participante="${M.esc(q.id)}"><line class="vida" x1="${f(x[i])}" x2="${f(x[i])}" y1="${f(altoCab)}" y2="${f(yFin)}"/>${caja(y0)}${caja(yFin)}</g>` });
    });
    const acts = activaciones.map((a, k) => ({ clave: `v:${a.id}:${k}`, svg: `<rect class="activacion" x="${f(x[ix.get(a.id)] - 5 + a.nivel * 4)}" y="${f(a.y0)}" width="10" height="${f(Math.max(8, a.y1 - a.y0))}"/>` }));
    const todo = [...fondo, ...cab, ...acts, ...textos, ...partes];
    const izq = Math.min(0, ...ps.map((q, i) => x[i] - ancho[i] / 2)) - (margenIzq ? 0 : 0);
    const der = Math.max(0, ...ps.map((q, i) => x[i] + ancho[i] / 2)) + margenDer;
    let bx1 = izq, bx2 = der;
    for (const b of bloques) { const i0 = isFinite(b.min) ? b.min : 0, i1 = isFinite(b.max) ? b.max : n - 1; bx1 = Math.min(bx1, x[i0] - ancho[i0] / 2 - 30); bx2 = Math.max(bx2, x[i1] + ancho[i1] / 2 + 30); }
    for (const g of geoEventos.values()) { bx1 = Math.min(bx1, g.x - g.w / 2 - 12); bx2 = Math.max(bx2, g.x + g.w / 2 + 12); }
    const participantes = new Map(ps.map((q, i) => [q.id, { x: x[i], w: ancho[i], h: alto[i], y: altoCab - alto[i] }]));
    return { tipo: "secuencia", caja: { x: Math.min(bx1, 0), y: 0, w: Math.max(bx2, der) - Math.min(bx1, 0), h: yFin + altoCab }, defs: defsSec(p), partes: todo,
      geo: { participantes, eventos: geoEventos, altoCab, yFin } };

    function nota(k, ev, nx, ny, w, h, ls) {
      return { clave: "n:" + k, svg: `<g class="nota" data-evento="${k}" data-linea="${ev.linea}"><rect x="${f(nx)}" y="${f(ny)}" width="${f(w)}" height="${f(h)}" rx="3"/>${ls.map((l, q) => `<text text-anchor="middle" x="${f(nx + w / 2)}" y="${f(ny + 18 + q * LM)}">${M.esc(l)}</text>`).join("")}</g>` };
    }
    function numeroSVG(nn, cx, cy) { return `<g class="numero"><circle cx="${f(cx)}" cy="${f(cy)}" r="8"/><text text-anchor="middle" x="${f(cx)}" y="${f(cy + 3.8)}">${nn}</text></g>`; }
  };
  function defsSec(p) {
    return `<marker id="${p}-flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="punta" d="M0,0L10,5L0,10z"/></marker>` +
      `<marker id="${p}-cruz" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="punta-linea" d="M3,1L9,9M9,1L3,9"/></marker>` +
      `<marker id="${p}-abierta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="punta-linea" d="M1,1L9,5L1,9"/></marker>`;
  }

  // ───────────── Escribir y editar ─────────────
  const flechaTxt = (ev) => (FLECHAS.find((x) => x[1] === ev.trazo && x[2] === ev.punta && !!x[3] === !!ev.doble) || FLECHAS[3])[0];
  const textoMsg = (t) => M.codificar(t).replace(/;/g, "#59;");
  M.serializarSecuencia = function (S) {
    const s = S.sangria || "    ", r = ["sequenceDiagram"];
    if (S.titulo) r.push(s + "title " + S.titulo);
    if (S.autonumero) r.push(s + "autonumber");
    for (const p of S.participantes) if (p.decl) r.push(s + `${p.actor ? "actor" : "participant"} ${p.id}${p.etiqueta !== p.id ? " as " + M.codificar(p.etiqueta) : ""}`);
    let nivel = 1;
    for (const ev of S.eventos) {
      if (ev.tipo === "finBloque") nivel--;
      const ind = s.repeat(ev.tipo === "seccion" ? nivel - 1 : nivel);
      if (ev.tipo === "mensaje") r.push(ind + `${ev.de}${flechaTxt(ev)}${ev.activar || ""}${ev.a}: ${textoMsg(ev.texto)}`);
      else if (ev.tipo === "nota") r.push(ind + `Note ${ev.lado === "sobre" ? "over" : ev.lado === "izquierda" ? "left of" : "right of"} ${ev.ps.join(",")}: ${textoMsg(ev.texto)}`);
      else if (ev.tipo === "activar") r.push(ind + "activate " + ev.p);
      else if (ev.tipo === "desactivar") r.push(ind + "deactivate " + ev.p);
      else if (ev.tipo === "bloque") { r.push(ind + (ev.clase + " " + M.codificar(ev.texto)).trim()); nivel++; }
      else if (ev.tipo === "seccion") r.push(ind + (ev.clase + " " + M.codificar(ev.texto)).trim());
      else if (ev.tipo === "finBloque") r.push(ind + "end");
      else if (ev.tipo === "comentario") r.push(ind + ev.texto);
    }
    return r.join("\n") + "\n";
  };
  const lineasDe = (t) => String(t).replace(/\r\n?/g, "\n").split("\n");
  M.renombrarParticipante = function (texto, id, etiqueta) {
    const S = M.parsearSecuencia(texto), q = S.idx.get(id);
    if (!q) return texto;
    const L = lineasDe(texto), et = M.codificar(etiqueta);
    if (q.decl) {
      const l = L[q.decl.linea];
      if (q.decl.aliasIni >= 0) L[q.decl.linea] = etiqueta === id ? l.slice(0, q.decl.idFin) + l.slice(q.decl.aliasFin) : l.slice(0, q.decl.aliasIni) + et + l.slice(q.decl.aliasFin);
      else if (etiqueta !== id) L[q.decl.linea] = l.slice(0, q.decl.idFin) + " as " + et + l.slice(q.decl.idFin);
    } else {
      // Se declara después de los participantes ya declarados (o justo después de «sequenceDiagram»).
      const ult = S.participantes.filter((x) => x.decl).map((x) => x.decl.linea);
      const k = ult.length ? Math.max(...ult) + 1 : S.cabecera + 1;
      L.splice(k, 0, S.sangria + `participant ${id}${etiqueta !== id ? " as " + et : ""}`);
    }
    return L.join("\n");
  };
  M.cambiarTextoEvento = function (texto, linea, nuevo) {
    const S = M.parsearSecuencia(texto), ev = S.eventos.find((e) => e.linea === linea && (e.tipo === "mensaje" || e.tipo === "nota"));
    if (!ev) return texto;
    const L = lineasDe(texto);
    L[linea] = L[linea].slice(0, ev.txtIni) + textoMsg(nuevo) + L[linea].slice(ev.txtFin);
    return L.join("\n");
  };
  /** Quita un participante: su declaración, sus mensajes, sus notas y sus activaciones (lo demás queda igual). Una nota sobre
   *  varios participantes sigue sobre los demás. */
  M.borrarParticipante = function (texto, id) {
    const S = M.parsearSecuencia(texto);
    if (!S.idx.has(id)) return texto;
    const L = lineasDe(texto), fuera = new Set();
    const q = S.idx.get(id);
    if (q.decl) fuera.add(q.decl.linea);
    for (const ev of S.eventos) {
      if (ev.tipo === "mensaje" && (ev.de === id || ev.a === id)) fuera.add(ev.linea);
      else if ((ev.tipo === "activar" || ev.tipo === "desactivar") && ev.p === id) fuera.add(ev.linea);
      else if (ev.tipo === "nota" && ev.ps.includes(id)) {
        const otros = ev.ps.filter((x) => x !== id);
        if (!otros.length) fuera.add(ev.linea);
        else L[ev.linea] = L[ev.linea].replace(/^(\s*note\s+(?:left of|right of|over)\s+)([^:]+?)(\s*:)/i, (_, a, __, c) => a + otros.join(",") + c);
      }
    }
    const r = L.filter((_, i) => !fuera.has(i)).join("\n");
    const m = M.leerMeta((/^\s*%%\s*esquema:\s*(\{.*\})\s*$/m.exec(r) || [])[1] || "null");
    return m && (m.refs?.[id] || m.pos?.[id] || m.iconos?.[id]) ? M.ponerMeta(r, (x) => { if (x.refs) delete x.refs[id]; if (x.pos) delete x.pos[id]; if (x.iconos) delete x.iconos[id]; }) : r;
  };
  M.borrarLinea = function (texto, linea) { const L = lineasDe(texto); L.splice(linea, 1); return L.join("\n"); };
  /** Agrega un mensaje después de la línea `despues` (o al final): A->>B: texto. */
  M.agregarMensaje = function (texto, de, a, despues = null, msg = "Mensaje") {
    const S = M.parsearSecuencia(texto), L = lineasDe(texto);
    let k = despues;
    if (k == null) { k = L.length - 1; while (k > 0 && !L[k].trim()) k--; }
    const ref = L[k] || "";
    const ind = /^(\s*)/.exec(ref)[1] || S.sangria;
    const dentro = /^\s*(loop|alt|opt|par|critical|break|rect|else|and|option)\b/.test(ref) ? ind + S.sangria : ind;
    L.splice(k + 1, 0, (k === S.cabecera ? S.sangria : dentro) + `${de}->>${a}: ${textoMsg(msg)}`);
    return { texto: L.join("\n"), linea: k + 1 };
  };
  M.agregarParticipante = function (texto, etiqueta = "Nuevo") {
    const S = M.parsearSecuencia(texto), L = lineasDe(texto);
    let k = 1; while (S.idx.has("P" + k)) k++;
    const id = "P" + k;
    const ult = S.participantes.filter((x) => x.decl).map((x) => x.decl.linea);
    const pos = ult.length ? Math.max(...ult) + 1 : S.cabecera + 1;
    L.splice(pos, 0, S.sangria + `participant ${id} as ${M.codificar(etiqueta)}`);
    return { texto: L.join("\n"), id };
  };
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
