// Motor de Esquema · dibujar: elige el tipo de diagrama, acomoda (con caché: si solo cambió un texto que no cambia tamaños, no se
// vuelve a acomodar nada) y arma el SVG en partes con clave, para que la interfaz reemplace solo las que cambiaron.
(function (M) {
  "use strict";
  const f = (n) => Math.round(n * 10) / 10;
  const LINEA = 18, TAM = 14, TAM_ETQ = 13, MAX_ETQ = 200;
  const PENDIENTES = ["classDiagram", "stateDiagram", "stateDiagram-v2", "erDiagram", "gantt", "pie", "mindmap", "journey", "gitGraph",
    "timeline", "quadrantChart", "requirementDiagram", "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment", "sankey-beta",
    "xychart-beta", "block-beta", "architecture-beta", "packet-beta", "kanban", "radar-beta", "treemap-beta", "zenuml"];

  /** Qué tipo de diagrama es el texto: "flujo", "secuencia", "pendiente" (Mermaid lo tiene y Esquema aún no) o null. */
  M.tipoDiagrama = function (texto) {
    const lineas = String(texto).split(/\r?\n/);
    let i = 0;
    if (/^---\s*$/.test(lineas[0] || "")) { const k = lineas.findIndex((l, j) => j > 0 && /^---\s*$/.test(l)); if (k > 0) i = k + 1; }
    for (; i < lineas.length; i++) {
      const t = lineas[i].trim();
      if (!t || t.startsWith("%%")) continue;
      const p = t.split(/[\s;]/)[0];
      if (p === "flowchart" || p === "graph") return { tipo: "flujo", palabra: p };
      if (p === "sequenceDiagram") return { tipo: "secuencia", palabra: p };
      if (PENDIENTES.includes(p)) return { tipo: "pendiente", palabra: p };
      return { tipo: null, palabra: p, linea: i };
    }
    return { tipo: "vacio" };
  };

  const cacheAcomodo = new Map();
  const guardarCache = (k, v) => { cacheAcomodo.set(k, v); if (cacheAcomodo.size > 24) cacheAcomodo.delete(cacheAcomodo.keys().next().value); };
  M._cacheAcomodo = cacheAcomodo;
  M.estadisticas = { acomodos: 0, reutilizados: 0 };

  /** Estilo de classDef/style ya validado (flujo.js) → atributo style para la forma y para el texto. */
  function estiloNodo(D, n) {
    const e = { ...(D.clases.default || {}) };
    for (const c of n.clases) Object.assign(e, D.clases[c] || {});
    Object.assign(e, D.estilos[n.id] || {});
    const forma = [], texto = [];
    for (const [k, v] of Object.entries(e)) {
      if (["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity"].includes(k)) forma.push(`${k}:${v}`);
      else if (k === "color") texto.push(`fill:${v}`);
      else texto.push(`${k}:${v}`);
    }
    return { forma: M.esc(forma.join(";")), texto: M.esc(texto.join(";")) };
  }

  function textoSVG(lineas, clase, dx = 0, estilo = "") {
    if (!lineas.length) return "";
    const y0 = -((lineas.length - 1) * LINEA) / 2 + 5;
    const st = estilo ? ` style="${estilo}"` : "";
    return `<text class="${clase}" text-anchor="middle" x="${f(dx)}" y="${f(y0)}"${st}>${lineas.map((l, i) => `<tspan x="${f(dx)}"${i ? ` dy="${LINEA}"` : ""}>${M.esc(l) || "&#8203;"}</tspan>`).join("")}</text>`;
  }

  // Ejes: en TB/BT las flechas avanzan en y; en LR/RL, en x.
  const horizontal = (dir) => dir === "LR" || dir === "RL";

  function ordenDe(D, id) {
    if (D._orden?.has(id)) return D._orden.get(id);
    if (!D._orden) D._orden = new Map();
    let o;
    const n = D.nodos.get(id);
    if (n) o = n.primera.linea * 1000 + n.primera.ini;
    else {
      o = D.subgrafos.get(id).linea * 1000;
      for (const m of D.nodos.values()) { let g = m.subgrafo; while (g) { if (g === id) { o = Math.min(o, m.primera.linea * 1000 + m.primera.ini); break; } g = D.subgrafos.get(g)?.padre; } }
    }
    D._orden.set(id, o);
    return o;
  }

  /** Acomoda un nivel (la raíz o un subgrafo) y, antes, sus subgrafos hijos. */
  function acomodarNivel(D, g, hijos, tam, nivelAristas, dirPadre, cajas) {
    const sg = g ? D.subgrafos.get(g) : null;
    const dir = sg ? sg.dir || dirPadre : D.dir;
    const items = [];
    for (const id of hijos.get(g)?.grupos || []) { const r = acomodarNivel(D, id, hijos, tam, nivelAristas, dir, cajas); items.push({ id, w: r.w, h: r.h, grupo: r }); }
    for (const id of hijos.get(g)?.nodos || []) { const t = tam.get(id); items.push({ id, w: t.w + (t.bucle ? 28 : 0), h: t.h }); }
    for (const pu of hijos.get(g)?.puertos || []) items.push({ id: pu.id, w: 2, h: 2, extremo: pu.extremo, puerto: true });
    // En el orden en que aparecen en el texto: así lo que se escribe primero queda primero (y los ciclos se cortan donde se espera).
    items.sort((a, b) => (a.puerto ? 1e12 : ordenDe(D, a.id)) - (b.puerto ? 1e12 : ordenDe(D, b.id)));
    const hz = horizontal(dir);
    const aristas = nivelAristas.get(g) || [];
    const res = M.capas({
      nodos: items.map((it) => ({ id: it.id, w: hz ? it.h : it.w, h: hz ? it.w : it.h, extremo: it.extremo })),
      aristas: aristas.map((a) => ({ id: a.id, de: a.de, a: a.a, minlen: a.minlen, etq: a.etq ? (hz ? { w: a.etq.h, h: a.etq.w } : a.etq) : null })),
    }, { sepNodos: hz ? 30 : 40, sepCapas: hz ? 60 : 52 });
    const L = res.alto, A = res.ancho;
    const tr = (p) => dir === "TB" ? { x: p.x, y: p.y } : dir === "BT" ? { x: p.x, y: L - p.y } : dir === "LR" ? { x: p.y, y: p.x } : { x: L - p.y, y: p.x };
    const cw = hz ? L : A, ch = hz ? A : L;
    const pos = new Map();
    for (const [id, p] of res.pos) pos.set(id, tr(p));
    const rutas = new Map();
    for (const [id, r] of res.aristas) rutas.set(id, { puntos: r.puntos.map(tr), etq: r.etq ? tr(r.etq) : null, dir });
    let w = cw, h = ch, ox = 0, oy = 0;
    if (sg) {
      const pad = 16, tit = sg.titulo ? 28 : 6;
      const tw = sg.titulo ? M.medir(sg.titulo, 13, 600) + 2 * pad : 0;
      w = Math.max(cw + 2 * pad, tw); h = ch + 2 * pad + tit - 6;
      ox = (w - cw) / 2; oy = pad + tit - 6;
    }
    return { id: g, w, h, ox, oy, pos, rutas, items, dir };
  }

  /** Posiciones absolutas desde el árbol de niveles. */
  function aplanar(nivel, x0, y0, salida) {
    for (const it of nivel.items) {
      const p = nivel.pos.get(it.id);
      const cx = x0 + nivel.ox + p.x, cy = y0 + nivel.oy + p.y;
      if (it.grupo) {
        const bx = cx - it.w / 2, by = cy - it.h / 2;
        salida.grupos.set(it.id, { x: bx, y: by, w: it.w, h: it.h });
        aplanar(it.grupo, bx, by, salida);
      } else if (it.puerto) salida.puertos.set(it.id, { x: cx, y: cy });
      else salida.nodos.set(it.id, { x: cx, y: cy });
    }
    for (const [id, r] of nivel.rutas) {
      salida.rutas.set(id, { puntos: r.puntos.map((p) => ({ x: x0 + nivel.ox + p.x, y: y0 + nivel.oy + p.y })), etq: r.etq ? { x: x0 + nivel.ox + r.etq.x, y: y0 + nivel.oy + r.etq.y } : null, dir: r.dir });
    }
  }

  /** Une los puntos de una flecha: curva (tangentes en el eje de avance), recta u ortogonal con esquinas redondeadas. */
  function trazar(pts, estilo, ejes) {
    if (estilo === "recta" || pts.length < 2) return "M" + pts.map((p) => `${f(p.x)},${f(p.y)}`).join("L");
    if (estilo === "ortogonal") {
      const o = [pts[0]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], v = ejes[i] === "v";
        if (v) { const m = (a.y + b.y) / 2; o.push({ x: a.x, y: m }, { x: b.x, y: m }); } else { const m = (a.x + b.x) / 2; o.push({ x: m, y: a.y }, { x: m, y: b.y }); }
        o.push(b);
      }
      const q = o.filter((p, i) => !i || Math.abs(p.x - o[i - 1].x) > 0.5 || Math.abs(p.y - o[i - 1].y) > 0.5);
      let d = `M${f(q[0].x)},${f(q[0].y)}`;
      for (let i = 1; i < q.length - 1; i++) {
        const a = q[i - 1], b = q[i], c = q[i + 1];
        const r = Math.min(8, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
        const u = (p, s, t) => { const l = Math.hypot(s.x - p.x, s.y - p.y) || 1; return { x: p.x + ((s.x - p.x) / l) * t, y: p.y + ((s.y - p.y) / l) * t }; };
        const p1 = u(b, a, r), p2 = u(b, c, r);
        d += `L${f(p1.x)},${f(p1.y)}Q${f(b.x)},${f(b.y)} ${f(p2.x)},${f(p2.y)}`;
      }
      const z = q[q.length - 1];
      return d + `L${f(z.x)},${f(z.y)}`;
    }
    // Curva: B-spline (como «basis» de d3) con un tramo corto en el eje de avance en cada punta, para salir y llegar derecho.
    const a = pts[0], z = pts[pts.length - 1], v = ejes[0] === "v";
    const sa = v ? Math.sign((pts[1].y - a.y) || 1) : Math.sign((pts[1].x - a.x) || 1);
    const sz = v ? Math.sign((z.y - pts[pts.length - 2].y) || 1) : Math.sign((z.x - pts[pts.length - 2].x) || 1);
    const largo = Math.min(22, (v ? Math.abs(z.y - a.y) : Math.abs(z.x - a.x)) / 3 + 4);
    const q = [a, v ? { x: a.x, y: a.y + sa * largo } : { x: a.x + sa * largo, y: a.y }, ...pts.slice(1, -1), v ? { x: z.x, y: z.y - sz * largo } : { x: z.x - sz * largo, y: z.y }, z];
    let d = `M${f(q[0].x)},${f(q[0].y)}`;
    let x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y;
    d += `L${f((5 * x0 + x1) / 6)},${f((5 * y0 + y1) / 6)}`;
    const bz = (x, y) => { d += `C${f((2 * x0 + x1) / 3)},${f((2 * y0 + y1) / 3)} ${f((x0 + 2 * x1) / 3)},${f((y0 + 2 * y1) / 3)} ${f((x0 + 4 * x1 + x) / 6)},${f((y0 + 4 * y1 + y) / 6)}`; };
    for (let i = 2; i < q.length; i++) { bz(q[i].x, q[i].y); x0 = x1; y0 = y1; x1 = q[i].x; y1 = q[i].y; }
    bz(x1, y1);
    return d + `L${f(x1)},${f(y1)}`;
  }

  function puntaDefs(p) {
    return `<marker id="${p}-flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="punta" d="M0,0L10,5L0,10z"/></marker>` +
      `<marker id="${p}-cruz" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="punta-linea" d="M1,1L9,9M9,1L1,9"/></marker>` +
      `<marker id="${p}-circulo" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><circle class="punta" cx="5" cy="5" r="4"/></marker>` +
      `<marker id="${p}-abierta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="punta-linea" d="M1,1L9,5L1,9"/></marker>`;
  }

  M.dibujarFlujo = function (D, op = {}) {
    const p = op.prefijo || "esq";
    const estilo = D.meta.aristas || "curva";
    // 1) Tamaños (medir es lo único caro del texto, y tiene caché).
    const tam = new Map();
    const bucles = new Set(D.aristas.filter((e) => e.de === e.a).map((e) => e.de));
    for (const n of D.nodos.values()) {
      const sin = M.sinTexto(n.forma);
      const lineas = sin ? [] : M.lineas(n.etiqueta, MAX_ETQ, TAM);
      const tw = lineas.reduce((m, l) => Math.max(m, M.medir(l, TAM)), 0) + (n.icono && !sin ? 24 : 0);
      const th = lineas.length * LINEA;
      tam.set(n.id, { ...M.tamanoForma(n.forma, tw, th), lineas, bucle: bucles.has(n.id) });
    }
    // 2) Árbol de grupos y en qué nivel va cada flecha (el grupo común más bajo de sus dos puntas).
    const hijos = new Map();
    const hijo = (g) => { if (!hijos.has(g)) hijos.set(g, { nodos: [], grupos: [], puertos: [] }); return hijos.get(g); };
    hijo(null);
    for (const sg of D.subgrafos.values()) hijo(D.subgrafos.has(sg.padre) ? sg.padre : null).grupos.push(sg.id);
    for (const n of D.nodos.values()) hijo(D.subgrafos.has(n.subgrafo) ? n.subgrafo : null).nodos.push(n.id);
    const padreDe = (id) => (D.subgrafos.has(id) ? D.subgrafos.get(id).padre : D.nodos.get(id)?.subgrafo) ?? null;
    const cadena = (id) => { const r = [id]; let g = padreDe(id); while (g && D.subgrafos.has(g)) { r.push(g); g = D.subgrafos.get(g).padre; } r.push(null); return r; };
    const nivelAristas = new Map();
    const etqTam = new Map();
    D.aristas.forEach((e, k) => {
      if (e.de === e.a) return;
      const cu = cadena(e.de), cv = cadena(e.a);
      const sv = new Set(cv.slice(1));
      let lca = null;
      for (const g of cu.slice(1)) if (sv.has(g)) { lca = g; break; }
      const item = (c) => { const i = c.indexOf(lca); return i > 0 ? c[i - 1] : c[0]; };
      const iu = item(cu), iv = item(cv);
      if (iu === iv || cu.includes(e.a) || cv.includes(e.de)) return;  // de un grupo a algo suyo: no se acomoda (se dibuja directo)
      let etq = null;
      if (e.etiqueta) {
        const lineas = M.lineas(e.etiqueta, 160, TAM_ETQ);
        etq = { w: lineas.reduce((m, l) => Math.max(m, M.medir(l, TAM_ETQ)), 0) + 12, h: lineas.length * 16 + 6, lineas };
        etqTam.set(k, etq);
      }
      if (!nivelAristas.has(lca)) nivelAristas.set(lca, []);
      nivelAristas.get(lca).push({ id: k, de: iu, a: iv, minlen: e.largo, etq: etq ? { w: etq.w, h: etq.h } : null });
      // Si sale (o entra) de grupos, cada grupo le reserva un puerto en su borde: así adentro la flecha esquiva a los demás nodos.
      const enGrupo = (c, lado) => {
        const L = c.indexOf(lca);
        for (let j = 1; j < L; j++) {
          const G = c[j], pid = `${lado === "s" ? "⇣" : "⇡"}${k}@${G}`;
          hijo(G).puertos.push({ id: pid, extremo: lado === "s" ? "fin" : "inicio" });
          if (!nivelAristas.has(G)) nivelAristas.set(G, []);
          nivelAristas.get(G).push(lado === "s" ? { id: `s${k}@${G}`, de: c[j - 1], a: pid, minlen: 1, etq: null } : { id: `t${k}@${G}`, de: pid, a: c[j - 1], minlen: 1, etq: null });
        }
      };
      enGrupo(cu, "s"); enGrupo(cv, "t");
    });
    // 3) Acomodar con caché: la clave es todo lo que cambia posiciones (no los textos que no cambian tamaños).
    const clave = JSON.stringify([D.dir, [...tam].map(([id, t]) => [id, f(t.w), f(t.h), t.bucle ? 1 : 0, padreDe(id)]),
      [...D.subgrafos.values()].map((s) => [s.id, s.padre, s.dir, s.titulo]), [...hijos].map(([g, h]) => [g, h.puertos.map((x) => x.id)]), [...nivelAristas].map(([g, l]) => [g, l.map((a) => [a.de, a.a, a.minlen, a.etq ? [f(a.etq.w), f(a.etq.h)] : 0])])]);
    let geo = cacheAcomodo.get(clave);
    if (geo) M.estadisticas.reutilizados++;
    else {
      M.estadisticas.acomodos++;
      const raiz = acomodarNivel(D, null, hijos, tam, nivelAristas, D.dir, null);
      geo = { nodos: new Map(), grupos: new Map(), rutas: new Map(), puertos: new Map(), ancho: raiz.w, alto: raiz.h };
      aplanar(raiz, 0, 0, geo);
      guardarCache(clave, geo);
    }
    // 4) Lo fijado a mano gana (y los grupos que lo contienen crecen para abrazarlo).
    const nodos = new Map();
    for (const [id, q] of geo.nodos) { const t = tam.get(id); nodos.set(id, { x: q.x, y: q.y, w: t.w, h: t.h, forma: D.nodos.get(id).forma, fijo: false }); }
    const fijos = new Set();
    for (const [id, xy] of Object.entries(D.meta.pos || {})) { const n = nodos.get(id); if (n) { n.x = xy[0]; n.y = xy[1]; n.fijo = true; fijos.add(id); } }
    const grupos = new Map([...geo.grupos].map(([id, b]) => [id, { ...b }]));
    if (fijos.size) {
      const orden = [...D.subgrafos.values()].sort((a, b) => cadena(b.id).length - cadena(a.id).length);
      for (const sg of orden) {
        const b = grupos.get(sg.id);
        if (!b) continue;
        const dentro = (id) => cadena(id).includes(sg.id) && id !== sg.id;
        if (![...fijos].some(dentro)) continue;
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const [id, n] of nodos) if (dentro(id)) { x1 = Math.min(x1, n.x - n.w / 2); y1 = Math.min(y1, n.y - n.h / 2); x2 = Math.max(x2, n.x + n.w / 2); y2 = Math.max(y2, n.y + n.h / 2); }
        for (const [id, c] of grupos) if (id !== sg.id && dentro(id)) { x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + c.w); y2 = Math.max(y2, c.y + c.h); }
        const tit = sg.titulo ? 28 : 6;
        Object.assign(b, { x: x1 - 16, y: y1 - 16 - tit + 6, w: x2 - x1 + 32, h: y2 - y1 + 32 + tit - 6 });
      }
    }
    // 5) Puertos: cada flecha sale y llega al borde, repartidas a lo largo del lado si llegan varias.
    const forma = (id) => (nodos.get(id) ? nodos.get(id) : grupos.has(id) ? { ...grupos.get(id), x: grupos.get(id).x + grupos.get(id).w / 2, y: grupos.get(id).y + grupos.get(id).h / 2, forma: "rectangulo" } : null);
    const lados = new Map();  // "id|lado" → [{k, extremo, otro}]
    const planes = [];
    D.aristas.forEach((e, k) => {
      if (e.de === e.a) return;
      const A = forma(e.de), B = forma(e.a);
      if (!A || !B) return;
      const ruta = geo.rutas.get(k);
      const directa = !ruta || fijos.has(e.de) || fijos.has(e.a);
      let medios = [];
      if (!directa) {
        // Puntos: de adentro hacia afuera en los grupos del origen, el tramo del nivel común y de afuera hacia adentro en el destino.
        const cu = cadena(e.de), cv = cadena(e.a);
        const L = (c) => { let lca = null; const sv = new Set((c === cu ? cv : cu).slice(1)); for (const g of c.slice(1)) if (sv.has(g)) { lca = g; break; } return c.indexOf(lca); };
        const sal = [], ent = [];
        for (let j = 1; j < L(cu); j++) { const G = cu[j], r = geo.rutas.get(`s${k}@${G}`), pu = geo.puertos.get(`⇣${k}@${G}`); if (r) sal.push(...r.puntos); if (pu) sal.push(pu); }
        for (let j = L(cv) - 1; j >= 1; j--) { const G = cv[j], r = geo.rutas.get(`t${k}@${G}`), pu = geo.puertos.get(`⇡${k}@${G}`); if (pu) ent.push(pu); if (r) ent.push(...r.puntos); }
        medios = [...sal, ...ruta.puntos, ...ent];
      }
      let ejeV;
      if (!directa) ejeV = !horizontal(ruta.dir);
      else { const dx = Math.abs(B.x - A.x) - (A.w + B.w) / 2, dy = Math.abs(B.y - A.y) - (A.h + B.h) / 2; ejeV = dy >= dx; }
      const sig = medios[0] || B, ant = medios[medios.length - 1] || A;
      const ladoA = ejeV ? (sig.y >= A.y ? "abajo" : "arriba") : (sig.x >= A.x ? "derecha" : "izquierda");
      const ladoB = ejeV ? (ant.y <= B.y ? "arriba" : "abajo") : (ant.x <= B.x ? "izquierda" : "derecha");
      const plan = { k, e, A, B, medios, ejeV, ladoA, ladoB, ruta: directa ? null : ruta };
      planes.push(plan);
      for (const [id, lado, otro, extremo] of [[e.de, ladoA, sig, "a"], [e.a, ladoB, ant, "b"]]) {
        const c = id + "|" + lado;
        if (!lados.has(c)) lados.set(c, []);
        lados.get(c).push({ plan, extremo, otro });
      }
    });
    const puerto = (nd, lado, off) => {
      if (lado === "abajo" || lado === "arriba") { const m = M.medioAlto(nd.forma, nd.w, nd.h, off); return { x: nd.x + off, y: nd.y + (lado === "abajo" ? m : -m) }; }
      const m = M.medioAlto(nd.forma, nd.h, nd.w, off); return { x: nd.x + (lado === "derecha" ? m : -m), y: nd.y + off };
    };
    for (const [c, lista] of lados) {
      const [id, lado] = [c.slice(0, c.lastIndexOf("|")), c.slice(c.lastIndexOf("|") + 1)];
      const nd = forma(id);
      const v = lado === "abajo" || lado === "arriba";
      lista.sort((a, b) => (v ? a.otro.x - b.otro.x : a.otro.y - b.otro.y));
      const n = lista.length, ancho = (v ? nd.w : nd.h) * (nd.forma === "rombo" || nd.forma === "circulo" ? 0.3 : 0.6);
      const paso = n > 1 ? Math.min(18, ancho / (n - 1)) : 0;
      lista.forEach((it, i) => { const off = (i - (n - 1) / 2) * paso; it.plan[it.extremo === "a" ? "pa" : "pb"] = puerto(nd, lado, off); });
    }
    // 6) SVG por partes.
    const partes = [];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const crecer = (x, y, w = 0, h = 0) => { x1 = Math.min(x1, x - w / 2); y1 = Math.min(y1, y - h / 2); x2 = Math.max(x2, x + w / 2); y2 = Math.max(y2, y + h / 2); };
    const profundidad = (id) => cadena(id).length;
    for (const [id, b] of [...grupos].sort((a, c) => profundidad(a[0]) - profundidad(c[0]))) {
      const sg = D.subgrafos.get(id);
      crecer(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h);
      partes.push({ clave: "g:" + id, svg: `<g class="grupo" data-grupo="${M.esc(id)}"><rect class="caja" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="8"/>${sg.titulo ? `<text class="titulo-grupo" x="${f(b.x + 12)}" y="${f(b.y + 19)}">${M.esc(sg.titulo)}</text>` : ""}</g>` });
    }
    const aristasGeo = new Map(), etiquetas = [];
    const estiloArista = (k) => { const s = { ...(D.estilosArista.default || {}), ...(D.estilosArista[k] || {}) }; return M.esc(Object.entries(s).filter(([c]) => ["stroke", "stroke-width", "stroke-dasharray", "opacity"].includes(c)).map(([c, v]) => `${c}:${v}`).join(";")); };
    for (const pl of planes) {
      const { k, e } = pl;
      const pts = [pl.pa, ...pl.medios, pl.pb];
      const ejes = pts.slice(1).map((_, i) => (pl.ejeV ? "v" : "h"));
      if (pl.ruta) { for (const q of pl.medios) crecer(q.x, q.y); }
      crecer(pl.pa.x, pl.pa.y); crecer(pl.pb.x, pl.pb.y);
      aristasGeo.set(k, { puntos: pts, de: e.de, a: e.a });
      if (e.trazo === "invisible") continue;
      const d = trazar(pts, estilo, ejes);
      const m1 = e.inicio ? ` marker-start="url(#${p}-${e.inicio})"` : "", m2 = e.fin ? ` marker-end="url(#${p}-${e.fin})"` : "";
      const st = estiloArista(k);
      partes.push({ clave: "a:" + k, svg: `<g class="arista ${e.trazo}" data-arista="${k}"><path class="toque" d="${d}"/><path class="trazo" d="${d}"${m1}${m2}${st ? ` style="${st}"` : ""}/></g>` });
      const et = etqTam.get(k);
      if (et) {
        let q = pl.ruta && pl.ruta.etq ? pl.ruta.etq : null;
        if (!q) { // a la mitad del camino
          let total = 0; const tramos = [];
          for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); tramos.push(l); total += l; }
          let r = total / 2, i = 0; while (i < tramos.length - 1 && r > tramos[i]) { r -= tramos[i]; i++; }
          const t = tramos[i] ? r / tramos[i] : 0; q = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
        }
        crecer(q.x, q.y, et.w, et.h);
        etiquetas.push({ clave: "e:" + k, svg: `<g class="etq-arista" data-arista="${k}" transform="translate(${f(q.x)},${f(q.y)})"><rect x="${f(-et.w / 2)}" y="${f(-et.h / 2)}" width="${f(et.w)}" height="${f(et.h)}" rx="4"/><text text-anchor="middle" y="${f(-((et.lineas.length - 1) * 16) / 2 + 4.5)}">${et.lineas.map((l, i) => `<tspan x="0"${i ? ' dy="16"' : ""}>${M.esc(l)}</tspan>`).join("")}</text></g>` });
      }
    }
    // Bucles (A --> A): un lazo al costado.
    D.aristas.forEach((e, k) => {
      if (e.de !== e.a || !nodos.has(e.de)) return;
      const n = nodos.get(e.de), x = n.x + n.w / 2, y = n.y;
      const d = `M${f(x)},${f(y - n.h / 4)}C${f(x + 30)},${f(y - n.h / 2 - 6)} ${f(x + 30)},${f(y + n.h / 2 + 6)} ${f(x)},${f(y + n.h / 4)}`;
      crecer(x + 26, y);
      aristasGeo.set(k, { puntos: [{ x, y: y - n.h / 4 }, { x: x + 24, y }, { x, y: y + n.h / 4 }], de: e.de, a: e.a });
      partes.push({ clave: "a:" + k, svg: `<g class="arista ${e.trazo}" data-arista="${k}"><path class="toque" d="${d}"/><path class="trazo" d="${d}"${e.fin ? ` marker-end="url(#${p}-${e.fin})"` : ""}/></g>` });
      const et = etqTam.get(k);
      if (et) etiquetas.push({ clave: "e:" + k, svg: `<g class="etq-arista" data-arista="${k}" transform="translate(${f(x + 26 + et.w / 2)},${f(y)})"><rect x="${f(-et.w / 2)}" y="${f(-et.h / 2)}" width="${f(et.w)}" height="${f(et.h)}" rx="4"/><text text-anchor="middle" y="4.5">${M.esc(et.lineas.join(" "))}</text></g>` });
    });
    for (const [id, n] of nodos) {
      const nd = D.nodos.get(id), t = tam.get(id), st = estiloNodo(D, nd);
      crecer(n.x, n.y, n.w, n.h);
      const conIcono = nd.icono && !M.sinTexto(nd.forma);
      const tw = t.lineas.reduce((m, l) => Math.max(m, M.medir(l, TAM)), 0);
      const icono = conIcono ? M.dibujarIcono(nd.icono, -(tw + 24) / 2, -8) : "";
      partes.push({ clave: "n:" + id, svg: `<g class="nodo${n.fijo ? " fijo" : ""}" data-id="${M.esc(id)}" data-forma="${nd.forma}" transform="translate(${f(n.x)},${f(n.y)})">${M.dibujarForma(nd.forma, n.w, n.h, st.forma)}${icono}${textoSVG(t.lineas, "etq", conIcono ? 12 : 0, st.texto)}</g>` });
    }
    partes.push(...etiquetas);
    if (!isFinite(x1)) { x1 = y1 = 0; x2 = y2 = 0; }
    return { tipo: "flujo", caja: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, defs: puntaDefs(p), partes, geo: { nodos, grupos, aristas: aristasGeo, dir: D.dir } };
  };

  /** Dibuja cualquier texto: devuelve {tipo, partes, defs, caja, geo, errores, avisos, modelo}. Nunca lanza. */
  M.dibujar = function (texto, op = {}) {
    const t = M.tipoDiagrama(texto);
    if (t.tipo === "vacio") return { tipo: "vacio", partes: [], defs: "", caja: { x: 0, y: 0, w: 0, h: 0 }, errores: [], avisos: [] };
    if (t.tipo === "pendiente") return { tipo: "pendiente", palabra: t.palabra, partes: [], defs: "", caja: { x: 0, y: 0, w: 0, h: 0 }, errores: [], avisos: [M.problema(1, 1, "Esquema todavía no dibuja «{x}». Lo dejo tal cual: GitHub sí lo muestra.", { x: t.palabra })] };
    if (!t.tipo) return { tipo: null, partes: [], defs: "", caja: { x: 0, y: 0, w: 0, h: 0 }, avisos: [], errores: [M.problema((t.linea || 0) + 1, 1, "No reconozco «{x}». Empieza con «flowchart TD» o «sequenceDiagram».", { x: t.palabra }, "flowchart TD")] };
    try {
      if (t.tipo === "flujo") { const D = M.parsearFlujo(texto); return { ...M.dibujarFlujo(D, op), errores: D.errores, avisos: D.avisos, modelo: D }; }
      const S = M.parsearSecuencia(texto);
      return { ...M.dibujarSecuencia(S, op), errores: S.errores, avisos: S.avisos, modelo: S };
    } catch (err) {
      return { tipo: t.tipo, partes: [], defs: "", caja: { x: 0, y: 0, w: 0, h: 0 }, avisos: [], errores: [M.problema(1, 1, "No pude dibujar esto: {x}", { x: String(err && err.message || err) })] };
    }
  };

  /** SVG completo e independiente (exportar, copiar, vista previa del documento). Los colores van adentro: se ve igual en GitHub,
   *  en un correo o en otra app. */
  M.svgCompleto = function (r, op = {}) {
    const m = op.margen ?? 16, c = r.caja;
    const w = Math.max(1, c.w + 2 * m), h = Math.max(1, c.h + 2 * m);
    const estilo = op.estilo != null ? op.estilo : M.estiloSVG(op.tema || "claro");
    return `<svg xmlns="http://www.w3.org/2000/svg" class="esq" viewBox="${f(c.x - m)} ${f(c.y - m)} ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" role="img"${op.titulo ? ` aria-label="${M.esc(op.titulo)}"` : ""}>` +
      (estilo ? `<style>${estilo}</style>` : "") + `<defs>${r.defs}</defs>` + (op.fondo ? `<rect x="${f(c.x - m)}" y="${f(c.y - m)}" width="${f(w)}" height="${f(h)}" fill="${op.fondo}"/>` : "") +
      r.partes.map((x) => x.svg).join("") + "</svg>";
  };

  /** Colores del diagrama para un SVG suelto (los mismos que usa la interfaz). */
  M.COLORES = {
    claro: { nodo: "#ffffff", borde: "#3d4a5c", texto: "#1b2230", linea: "#56627a", grupo: "#f3f5f8", grupoBorde: "#c5ccd8", etq: "#ffffff", acento: "#2f5fd0", nota: "#fff8db", notaBorde: "#d8c37a", sombra: "#e8ecf2" },
    oscuro: { nodo: "#1d2330", borde: "#9aa6ba", texto: "#e8ecf3", linea: "#9aa6ba", grupo: "#191e28", grupoBorde: "#3a4456", etq: "#151a23", acento: "#7fa2ff", nota: "#332d17", notaBorde: "#7d6b2e", sombra: "#222a37" },
  };
  M.estiloSVG = function (tema) {
    const c = M.COLORES[tema] || M.COLORES.claro;
    return `.esq{font-family:${M.FUENTE};font-size:14px}.esq .forma{fill:${c.nodo};stroke:${c.borde};stroke-width:1.4}.esq .forma.lleno{fill:${c.borde}}` +
      `.esq .linea{fill:none;stroke:${c.borde};stroke-width:1.2}.esq .etq,.esq text{fill:${c.texto}}.esq .icono{fill:none;stroke:${c.acento};stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}` +
      `.esq .trazo{fill:none;stroke:${c.linea};stroke-width:1.5}.esq .toque{fill:none;stroke:transparent;stroke-width:12}.esq .punteada .trazo{stroke-dasharray:5 4}.esq .gruesa .trazo{stroke-width:3}` +
      `.esq .punta{fill:${c.linea}}.esq .punta-linea{fill:none;stroke:${c.linea};stroke-width:1.6}.esq .etq-arista rect{fill:${c.etq};stroke:none}.esq .etq-arista text{font-size:13px}` +
      `.esq .caja{fill:${c.grupo};stroke:${c.grupoBorde};stroke-width:1}.esq .titulo-grupo{font-size:13px;font-weight:600;fill:${c.texto}}` +
      `.esq .participante rect,.esq .participante .cuerpo{fill:${c.nodo};stroke:${c.borde};stroke-width:1.4}.esq .vida{stroke:${c.grupoBorde};stroke-width:1.2;stroke-dasharray:4 4}` +
      `.esq .activacion{fill:${c.sombra};stroke:${c.borde};stroke-width:1}.esq .nota rect{fill:${c.nota};stroke:${c.notaBorde};stroke-width:1}.esq .bloque rect{fill:none;stroke:${c.grupoBorde};stroke-width:1.2}` +
      `.esq .bloque .rotulo{fill:${c.grupo};stroke:${c.grupoBorde}}.esq .bloque .sep{stroke:${c.grupoBorde};stroke-dasharray:4 3}.esq .bloque text{font-size:12.5px}.esq .numero circle{fill:${c.borde}}.esq .numero text{fill:${c.nodo};font-size:11px;font-weight:700}` +
      `.esq .mensaje text{font-size:13px}`;
  };
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
