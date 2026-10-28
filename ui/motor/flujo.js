// Motor de Esquema · diagramas de flujo (flowchart/graph de Mermaid): leer, escribir y editar el texto sin perder su forma.
// El texto es la fuente de verdad. Cada cambio del lienzo (renombrar, conectar, borrar, mover) toca solo las líneas que hace
// falta: lo demás (comentarios, sangrías, el estilo de quien lo escribió) queda igual. Subconjunto documentado en AGENTS.md.
(function (M) {
  "use strict";
  const DIRS = ["TB", "TD", "BT", "LR", "RL"];
  // Formas con sintaxis clásica de Mermaid: [abre, cierra]. El orden importa (lo más largo primero).
  const CLASICAS = [
    ["(((", ")))", "doble-circulo"], ["((", "))", "circulo"], ["([", "])", "estadio"], ["[[", "]]", "subrutina"], ["[(", ")]", "cilindro"],
    ["{{", "}}", "hexagono"], ["[/", "/]", "paralelogramo"], ["[/", "\\]", "trapecio"], ["[\\", "\\]", "paralelogramo-inv"],
    ["[\\", "/]", "trapecio-inv"], ["(", ")", "redondeado"], ["[", "]", "rectangulo"], ["{", "}", "rombo"], [">", "]", "asimetrico"],
  ];
  const SINTAXIS = Object.fromEntries(CLASICAS.map(([a, c, f]) => [f, [a, c]]));
  // Formas nuevas de Mermaid (`A@{ shape: cyl }`): nombre de Mermaid → forma de Esquema.
  const ARROBA = {
    rect: "rectangulo", rectangle: "rectangulo", proc: "rectangulo", process: "rectangulo", rounded: "redondeado", event: "redondeado",
    stadium: "estadio", pill: "estadio", terminal: "estadio", subproc: "subrutina", subroutine: "subrutina", "fr-rect": "subrutina",
    "framed-rectangle": "subrutina", cyl: "cilindro", db: "cilindro", database: "cilindro", cylinder: "cilindro", circle: "circulo",
    circ: "circulo", diam: "rombo", diamond: "rombo", decision: "rombo", question: "rombo", hex: "hexagono", hexagon: "hexagono",
    prepare: "hexagono", "lean-r": "paralelogramo", "lean-right": "paralelogramo", "in-out": "paralelogramo", "lean-l": "paralelogramo-inv",
    "lean-left": "paralelogramo-inv", "out-in": "paralelogramo-inv", "trap-b": "trapecio", trapezoid: "trapecio", priority: "trapecio",
    "trap-t": "trapecio-inv", manual: "trapecio-inv", "dbl-circ": "doble-circulo", "double-circle": "doble-circulo", "h-cyl": "cilindro-h",
    das: "cilindro-h", "horizontal-cylinder": "cilindro-h", doc: "documento", document: "documento", cloud: "nube", odd: "asimetrico",
    "sm-circ": "inicio", start: "inicio", "small-circle": "inicio", "fr-circ": "fin", stop: "fin", "framed-circle": "fin",
  };
  const ARROBA_DE = { documento: "doc", nube: "cloud", "cilindro-h": "h-cyl", inicio: "sm-circ", fin: "fr-circ" };
  M.FORMAS_FLUJO = [...new Set([...CLASICAS.map((c) => c[2]), ...Object.keys(ARROBA_DE)])];
  const ID = /^[\p{L}\p{N}_$]+(?:[-.][\p{L}\p{N}_$]+)*/u;
  const PALABRA = /[\p{L}\p{N}_]/u;

  /** Parte una línea en sentencias separadas por «;» (sin cortar dentro de comillas, corchetes ni entidades como #quot;). */
  function partirSentencias(linea) {
    const r = [];
    let ini = 0, prof = 0, comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') comillas = !comillas;
      else if (comillas) continue;
      else if ("[({".includes(c)) prof++;
      else if ("])}".includes(c)) prof = Math.max(0, prof - 1);
      else if (c === ";" && prof === 0) {
        if (/#\w*$/.test(linea.slice(ini, i)) && /#\w+$/.test(linea.slice(Math.max(ini, i - 12), i))) continue;  // #quot;
        r.push([ini, i]); ini = i + 1;
      }
    }
    r.push([ini, linea.length]);
    return r.map(([a, b]) => { while (a < b && /\s/.test(linea[a])) a++; while (b > a && /\s/.test(linea[b - 1])) b--; return [a, b]; }).filter(([a, b]) => b > a);
  }

  const limpiarEtiqueta = (t) => {
    t = t.trim();
    if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') t = t.slice(1, -1);
    if (t.length >= 2 && t[0] === "`" && t[t.length - 1] === "`") t = t.slice(1, -1);
    return M.decodificar(t).trim();
  };

  /** Lee un nodo en s desde p. Devuelve {nodo, p} o {error}. */
  function leerNodo(s, p, linea) {
    const m = ID.exec(s.slice(p));
    if (!m) return { error: M.problema(linea + 1, p + 1, "Esperaba el nombre de un nodo y encontré «{x}».", { x: s.slice(p, p + 12) || "fin de línea" }) };
    const ref = { id: m[0], idIni: p, idFin: p + m[0].length, forma: null, etiqueta: null, def: null, clases: [] };
    p += m[0].length;
    const resto = s.slice(p);
    if (resto.startsWith("@{")) {
      const cierre = s.indexOf("}", p + 2);
      if (cierre < 0) return { error: M.problema(linea + 1, p + 1, "Falta cerrar «}» en «{x}».", { x: s.slice(ref.idIni, ref.idIni + 30) }, s.slice(ref.idIni) + " }") };
      const cuerpo = s.slice(p + 2, cierre);
      const shape = /\bshape\s*:\s*"?([\w-]+)"?/.exec(cuerpo), label = /\blabel\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cuerpo) || /\blabel\s*:\s*([^,}]+)/.exec(cuerpo);
      ref.forma = shape ? ARROBA[shape[1]] || "rectangulo" : "rectangulo";
      ref.formaDesconocida = shape && !ARROBA[shape[1]] ? shape[1] : null;
      ref.etiqueta = label ? limpiarEtiqueta(label[1]) : ref.id;
      ref.def = { ini: ref.idIni, fin: cierre + 1, sintaxis: "arroba", shape: shape ? shape[1] : "rect", crudo: s.slice(ref.idIni + ref.id.length, cierre + 1) };
      p = cierre + 1;
    } else {
      for (const [abre, cierra, forma] of CLASICAS) {
        if (!resto.startsWith(abre)) continue;
        const cont = p + abre.length;
        let fin = -1, finCont = -1;
        if (s[cont] === '"') {
          const q = s.indexOf('"', cont + 1);
          if (q < 0) return { error: M.problema(linea + 1, cont + 1, "Falta cerrar las comillas en «{x}».", { x: s.slice(ref.idIni, ref.idIni + 30) }, s.slice(ref.idIni) + '"' + cierra) };
          let k = q + 1; while (s[k] === " ") k++;
          if (s.startsWith(cierra, k)) { finCont = q + 1; fin = k + cierra.length; }
        } else {
          const k = s.indexOf(cierra, cont);
          if (k >= 0) { finCont = k; fin = k + cierra.length; }
        }
        if (fin < 0) {
          // ¿Es otra forma con la misma apertura ([/ … \] por ejemplo)? Sigue probando; si ninguna cierra, es un error.
          if (CLASICAS.some(([a, c, f]) => a === abre && f !== forma && s.indexOf(c, cont) >= 0)) continue;
          return { error: M.problema(linea + 1, p + 1, "Falta cerrar «{c}» en «{x}».", { c: cierra, x: s.slice(ref.idIni, ref.idIni + 30).trim() }, s.slice(ref.idIni).trim() + cierra) };
        }
        ref.forma = forma;
        ref.etiqueta = limpiarEtiqueta(s.slice(cont, finCont));
        ref.def = { ini: ref.idIni, fin, contIni: cont, contFin: finCont, sintaxis: "clasica", comillas: s[cont] === '"', crudo: s.slice(cont, finCont) };
        p = fin;
        break;
      }
    }
    const cl = /^:::([\w-]+)/.exec(s.slice(p));
    if (cl) { ref.clases.push(cl[1]); p += cl[0].length; ref.claseFin = p; }
    return { nodo: ref, p };
  }

  /** Lee una flecha en s desde p. Devuelve null si no hay flecha ahí. */
  function leerEnlace(s, p) {
    const resto = s.slice(p);
    const r = { ini: p, trazo: "normal", inicio: null, fin: null, largo: 1, etiqueta: null };
    const cabeza = (c) => (c === ">" || c === "<" ? "flecha" : c === "x" ? "cruz" : c === "o" ? "circulo" : null);
    // 1) Texto en medio: A -- texto --> B · A -. texto .-> B · A == texto ==> B
    let m = /^([<xo])?(--|==|-\.)\s+(?=\S)/.exec(resto);
    if (m && !/^([<xo])?(-{3,}|={3,}|--[>xo]|==[>xo]|-\.-)/.test(resto)) {
      const tipo = m[2], desde = p + m[0].length;
      const cierre = tipo === "--" ? /(-{2,})([>xo])?/g : tipo === "==" ? /(={2,})([>xo])?/g : /(\.+)-([>xo])?/g;
      cierre.lastIndex = desde;
      const c = cierre.exec(s);
      if (c) {
        let etq = s.slice(desde, c.index), finEtq = c.index;
        while (etq.endsWith(" ")) { etq = etq.slice(0, -1); finEtq--; }
        r.trazo = tipo === "--" ? "normal" : tipo === "==" ? "gruesa" : "punteada";
        r.inicio = cabeza(m[1]);
        r.fin = cabeza(c[2]);
        r.largo = tipo === "-." ? c[1].length : Math.max(1, c[1].length - (c[2] ? 1 : 2));
        r.etiqueta = limpiarEtiqueta(etq); r.etqIni = desde; r.etqFin = finEtq; r.etqComillas = etq.trim().startsWith('"'); r.etqCrudo = etq.trim();
        r.finEnlace = c.index + c[0].length;
        r.p = r.finEnlace;
        r.forma = "medio";
        return r;
      }
    }
    // 2) Flecha sola: --> --- -.-> -.- ==> === ~~~ (con o sin cabeza al inicio), y su etiqueta opcional |texto|
    m = /^([<xo])?(?:(-{2,})([>xo])?|(-\.+-)([>xo])?|(={2,})([>xo])?|(~{3,}))/.exec(resto);
    if (!m) return null;
    if (m[1] && !/[-=]/.test(resto[1] || "")) return null;
    let largoTxt = m[0].length;
    let cab = m[3] || m[5] || m[7] || null;
    // «x» u «o» seguidas de letras son el nombre del nodo siguiente, no una cabeza (A --> xB no existe: A --x B sí).
    if ((cab === "x" || cab === "o") && PALABRA.test(resto[largoTxt] || "")) { cab = null; largoTxt -= 1; }
    if (m[2]) {
      if (!cab && m[2].length < 3) return null;
      r.trazo = "normal"; r.largo = Math.max(1, m[2].length - (cab ? 1 : 2));
    } else if (m[4]) { r.trazo = "punteada"; r.largo = m[4].length - 2; }
    else if (m[6]) {
      if (!cab && m[6].length < 3) return null;
      r.trazo = "gruesa"; r.largo = Math.max(1, m[6].length - (cab ? 1 : 2));
    } else { r.trazo = "invisible"; r.largo = Math.max(1, m[8].length - 2); }
    r.inicio = cabeza(m[1]); r.fin = cabeza(cab);
    r.finEnlace = p + largoTxt;
    let q = r.finEnlace;
    const pipe = /^\s*\|/.exec(s.slice(q));
    if (pipe) {
      const a = q + pipe[0].length, b = s.indexOf("|", a);
      if (b < 0) return { error: "pipe", col: a };
      r.etiqueta = limpiarEtiqueta(s.slice(a, b)); r.etqIni = a; r.etqFin = b; r.etqComillas = s.slice(a, b).trim().startsWith('"'); r.etqCrudo = s.slice(a, b);
      q = b + 1;
    }
    r.p = q; r.forma = "sola";
    return r;
  }

  /** Lee una cadena: grupos de nodos (A & B) unidos por flechas. */
  function leerCadena(s, a, b, linea) {
    const t = s.slice(0, b);
    let p = a;
    const grupos = [], enlaces = [];
    const salto = () => { while (p < b && /\s/.test(t[p])) p++; };
    for (;;) {
      salto();
      const grupo = [];
      for (;;) {
        const n = leerNodo(t, p, linea);
        if (n.error) return { error: n.error };
        if (n.nodo.id === "end" && !n.nodo.def) return { error: M.problema(linea + 1, p + 1, "«end» es una palabra reservada de Mermaid y no puede ser el nombre de un nodo.", {}, "Fin[end]") };
        grupo.push(n.nodo); p = n.p; salto();
        if (t[p] === "&") { p++; salto(); continue; }
        break;
      }
      grupos.push(grupo);
      if (p >= b) break;
      const e = leerEnlace(t, p);
      if (!e) {
        const resto = t.slice(p, b);
        const sug = /^->/.test(resto) ? "-->" : /^=>/.test(resto) ? "==>" : /^-(?!-)/.test(resto) ? "-->" : null;
        const ult = grupo[grupo.length - 1].id;
        if (sug) return { error: M.problema(linea + 1, p + 1, "«{x}» no es una flecha de Mermaid. ¿Quisiste decir «{s}»?", { x: resto.split(/\s/)[0], s: sug }, t.slice(a, p) + sug + resto.replace(/^[-=]+>?/, "")) };
        return { error: M.problema(linea + 1, p + 1, "No entiendo «{x}» después de «{n}».", { x: resto.slice(0, 20), n: ult }) };
      }
      if (e.error) return { error: M.problema(linea + 1, e.col + 1, "Falta cerrar «|» en la etiqueta de la flecha.", {}) };
      enlaces.push(e); p = e.p; salto();
      if (p >= b) return { error: M.problema(linea + 1, p + 1, "La flecha que sale de «{n}» no llega a ningún nodo.", { n: grupo.map((x) => x.id).join(" & ") }, t.slice(a, b) + " B") };
    }
    return { grupos, enlaces };
  }

  function leerEstilo(t) {
    const r = {};
    for (const parte of t.replace(/;\s*$/, "").split(",")) {
      const m = /^\s*([a-z-]+)\s*:\s*(.+?)\s*$/.exec(parte);
      if (!m) continue;
      // Solo propiedades y valores conocidos: nada de url(), expresiones ni comillas.
      if (!["fill", "stroke", "stroke-width", "stroke-dasharray", "color", "font-weight", "font-style", "opacity"].includes(m[1])) continue;
      if (!/^[#\w\s.%(),-]{1,40}$/.test(m[2]) || /url|expression|var\(/i.test(m[2])) continue;
      r[m[1]] = m[2];
    }
    return r;
  }

  /** Lee un diagrama de flujo. Nunca lanza: devuelve el modelo con `errores` (y lo que alcanzó a leer). */
  M.parsearFlujo = function (texto) {
    const lineas = String(texto).replace(/\r\n?/g, "\n").split("\n");
    const D = { tipo: "flujo", dir: "TB", lineas, nodos: new Map(), aristas: [], subgrafos: new Map(), clases: {}, estilos: {}, estilosArista: {},
      meta: {}, metaLinea: -1, cabecera: -1, sentencias: [], errores: [], avisos: [], titulo: null, sangria: "    " };
    let i = 0;
    // Front matter de Mermaid (---\ntitle: …\n---): se respeta y se lee el título.
    if (/^---\s*$/.test(lineas[0] || "")) {
      const f = lineas.findIndex((l, k) => k > 0 && /^---\s*$/.test(l));
      if (f > 0) { for (let k = 1; k < f; k++) { const m = /^title:\s*(.+)$/.exec(lineas[k]); if (m) D.titulo = m[1].trim(); } i = f + 1; }
    }
    const pila = [];
    let sgAuto = 0, avisoClick = false, avisoInit = false;
    const mencion = (ref, linea, sent) => {
      let n = D.nodos.get(ref.id);
      if (!n) { n = { id: ref.id, etiqueta: ref.id, forma: "rectangulo", def: null, primera: { linea, ini: ref.idIni, fin: ref.idFin }, subgrafo: null, clases: [] }; D.nodos.set(ref.id, n); }
      if (ref.def) { n.etiqueta = ref.etiqueta; n.forma = ref.forma; n.def = { ...ref.def, linea, sent }; if (ref.formaDesconocida) D.avisos.push(M.problema(linea + 1, ref.idIni + 1, "Esquema todavía no dibuja la forma «{x}»: la muestra como rectángulo.", { x: ref.formaDesconocida })); }
      if (pila.length) n.subgrafo = pila[pila.length - 1].id;
      for (const c of ref.clases) if (!n.clases.includes(c)) n.clases.push(c);
      return n;
    };
    for (; i < lineas.length; i++) {
      const L = lineas[i];
      const t0 = L.trim();
      if (!t0) continue;
      const meta = /^%%\s*esquema:\s*(\{.*\})\s*$/.exec(t0);
      if (meta) { D.metaLinea = i; const m = M.leerMeta(meta[1]); if (m) D.meta = m; else D.avisos.push(M.problema(i + 1, 1, "No pude leer la línea «%% esquema:»; la ignoro.", {})); continue; }
      if (t0.startsWith("%%{")) { if (!avisoInit) D.avisos.push(M.problema(i + 1, 1, "Esquema ignora la configuración «%%{init}%%» (GitHub sí la usa).", {})); avisoInit = true; continue; }
      if (t0.startsWith("%%")) { if (D.cabecera >= 0) D.sentencias.push({ linea: i, ini: L.indexOf("%%"), fin: L.length, tipo: "comentario", subgrafo: null }); continue; }
      if (D.cabecera < 0) {
        const m = /^(flowchart|graph)(?:\s+(\w+))?\s*;?\s*$/.exec(t0);
        if (!m) { D.errores.push(M.problema(i + 1, 1, "La primera línea tiene que ser «flowchart TD» (o LR, BT, RL).", {}, "flowchart TD")); return D; }
        if (m[2] && !DIRS.includes(m[2])) D.errores.push(M.problema(i + 1, m[1].length + 2, "«{x}» no es una dirección: usa TD, LR, BT o RL.", { x: m[2] }, m[1] + " TD"));
        else if (m[2]) D.dir = m[2] === "TD" ? "TB" : m[2];
        D.cabecera = i; D.dirTexto = m[2] || null; D.palabra = m[1];
        continue;
      }
      if (/^\S/.test(L) === false) { const s = /^(\s+)/.exec(L)[1]; if (D.sentencias.length === 0) D.sangria = s; }
      for (const [a, b] of partirSentencias(L)) {
        const t = L.slice(a, b);
        const sent = { linea: i, ini: a, fin: b, tipo: "cadena", subgrafo: pila.length ? pila[pila.length - 1].id : null };
        let m;
        if ((m = /^subgraph\b\s*(.*)$/.exec(t))) {
          const resto = m[1].trim();
          let id, titulo, mm;
          if ((mm = /^([\p{L}\p{N}_-]+)\s*\[\s*"?(.*?)"?\s*\]$/u.exec(resto))) { id = mm[1]; titulo = M.decodificar(mm[2]); }
          else if ((mm = /^"(.*)"$/.exec(resto))) { id = "sg" + ++sgAuto; titulo = M.decodificar(mm[1]); }
          else if (/^[\p{L}\p{N}_-]+$/u.test(resto)) { id = titulo = resto; }
          else if (resto) { id = "sg" + ++sgAuto; titulo = M.decodificar(resto); }
          else { id = "sg" + ++sgAuto; titulo = ""; }
          const sg = { id, titulo, padre: pila.length ? pila[pila.length - 1].id : null, dir: null, linea: i, lineaFin: -1 };
          if (D.nodos.has(id)) D.nodos.get(id).esGrupo = true;
          D.subgrafos.set(id, sg); pila.push(sg);
          Object.assign(sent, { tipo: "subgrafo", id });
        } else if (t === "end") {
          if (!pila.length) { D.errores.push(M.problema(i + 1, a + 1, "Sobra este «end»: no hay ningún «subgraph» abierto.", {})); continue; }
          pila.pop().lineaFin = i; sent.tipo = "fin";
        } else if ((m = /^direction\s+(\w+)$/.exec(t))) {
          if (!DIRS.includes(m[1])) D.errores.push(M.problema(i + 1, a + 11, "«{x}» no es una dirección: usa TD, LR, BT o RL.", { x: m[1] }));
          else if (pila.length) pila[pila.length - 1].dir = m[1] === "TD" ? "TB" : m[1];
          else D.dir = m[1] === "TD" ? "TB" : m[1];
          sent.tipo = "direccion";
        } else if ((m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(t))) {
          for (const c of m[1].split(",")) D.clases[c] = leerEstilo(m[2]);
          sent.tipo = "classDef";
        } else if ((m = /^class\s+([\w,\s-]+?)\s+([\w-]+)\s*$/.exec(t))) {
          sent.tipo = "class"; sent.ids = m[1].split(",").map((x) => x.trim()).filter(Boolean); sent.clase = m[2];
        } else if ((m = /^style\s+([\w-]+)\s+(.+)$/.exec(t))) {
          D.estilos[m[1]] = leerEstilo(m[2]); sent.tipo = "style"; sent.id = m[1];
        } else if ((m = /^linkStyle\s+([\d,\s]+|default)\s+(.+)$/.exec(t))) {
          const est = leerEstilo(m[2]);
          for (const k of m[1] === "default" ? ["default"] : m[1].split(",").map((x) => x.trim())) D.estilosArista[k] = est;
          sent.tipo = "linkStyle";
        } else if (/^click\b/.test(t)) {
          if (!avisoClick) D.avisos.push(M.problema(i + 1, a + 1, "Esquema no ejecuta «click»: lo deja en el texto para GitHub.", {}));
          avisoClick = true; sent.tipo = "click";
        } else if (/^acc(Title|Descr)\s*:/.test(t)) {
          sent.tipo = "acc"; if (t.startsWith("accTitle")) D.titulo = D.titulo || t.split(":").slice(1).join(":").trim();
        } else {
          const c = leerCadena(L, a, b, i);
          if (c.error) { D.errores.push(c.error); continue; }
          sent.grupos = c.grupos; sent.enlaces = c.enlaces;
          const k = D.sentencias.length;
          for (const g of c.grupos) for (const ref of g) { mencion(ref, i, k); }
          c.enlaces.forEach((e, j) => {
            for (const x of c.grupos[j]) for (const y of c.grupos[j + 1]) {
              D.aristas.push({ de: x.id, a: y.id, etiqueta: e.etiqueta, trazo: e.trazo, inicio: e.inicio, fin: e.fin, largo: e.largo, sent: k, enlace: j, linea: i, indice: D.aristas.length });
            }
          });
        }
        D.sentencias.push(sent);
      }
    }
    if (D.cabecera < 0) D.errores.push(M.problema(1, 1, "Falta la primera línea: «flowchart TD».", {}, "flowchart TD"));
    for (const sg of pila) D.errores.push(M.problema(sg.linea + 1, 1, "Falta «end» para cerrar el grupo «{x}» de la línea {n}.", { x: sg.titulo || sg.id, n: sg.linea + 1 }, "end"));
    // class A,B nombre
    for (const s of D.sentencias) if (s.tipo === "class") for (const id of s.ids) { const n = D.nodos.get(id); if (n && !n.clases.includes(s.clase)) n.clases.push(s.clase); }
    // Un subgrafo que también aparece como nodo (A --> grupo) es un grupo, no un nodo suelto.
    for (const id of D.subgrafos.keys()) { const n = D.nodos.get(id); if (n && !n.def) { D.nodos.delete(id); } }
    D.meta.iconos = D.meta.iconos || {};
    for (const [id, ic] of Object.entries(D.meta.iconos)) { const n = D.nodos.get(id); if (n) n.icono = ic; }
    return D;
  };

  // ───────────── Escribir ─────────────
  const necesitaComillas = (t) => /[[\](){}|<>"#;:&@]/.test(t) || /^\s|\s$/.test(t) || t === "";
  /** Etiqueta lista para el texto (con comillas si tiene caracteres que Mermaid lee como sintaxis). */
  M.etiquetaMermaid = function (t) { const c = M.codificar(t); return necesitaComillas(t) ? `"${c}"` : c; };
  /** Un nodo con su forma: A[Texto], B{¿Sí?}, C[(Base)] o D@{ shape: doc, label: "…" }. */
  M.tokenNodo = function (id, forma, etiqueta) {
    if (SINTAXIS[forma]) { const [a, c] = SINTAXIS[forma]; return `${id}${a}${M.etiquetaMermaid(etiqueta)}${c}`; }
    return `${id}@{ shape: ${ARROBA_DE[forma] || "rect"}, label: "${M.codificar(etiqueta)}" }`;
  };
  function tokenEnlace(e) {
    const ini = e.inicio === "flecha" ? "<" : e.inicio === "cruz" ? "x" : e.inicio === "circulo" ? "o" : "";
    const fin = e.fin === "flecha" ? ">" : e.fin === "cruz" ? "x" : e.fin === "circulo" ? "o" : "";
    const n = Math.max(1, e.largo || 1);
    let t;
    if (e.trazo === "invisible") t = "~".repeat(n + 2);
    else if (e.trazo === "punteada") t = ini + "-" + ".".repeat(n) + "-" + fin;
    else { const c = e.trazo === "gruesa" ? "=" : "-"; t = ini + c.repeat(fin ? n + 1 : n + 2) + fin; }
    if (e.etqCrudo != null && e.etiqueta != null) return `${t}|${e.etqCrudo}|`;
    return e.etiqueta != null && e.etiqueta !== "" ? `${t}|${M.etiquetaMermaid(e.etiqueta)}|` : t;
  }
  M.tokenEnlace = tokenEnlace;
  /** Escribe una cadena (grupos + enlaces) en su forma canónica. */
  function escribirCadena(grupos, enlaces) {
    const tok = (r) => {
      if (!r.def) return r.id;
      if (r.def.crudo != null && r.def.sintaxis === "clasica") { const [a, c] = SINTAXIS[r.forma]; return r.id + a + r.def.crudo + c; }
      if (r.def.crudo != null) return r.id + r.def.crudo;
      return M.tokenNodo(r.id, r.forma, r.etiqueta);
    };
    const g = (grupo) => grupo.map((r) => tok(r) + r.clases.map((c) => ":::" + c).join("")).join(" & ");
    let t = g(grupos[0]);
    enlaces.forEach((e, j) => { t += " " + tokenEnlace(e) + " " + g(grupos[j + 1]); });
    return t;
  }

  /** Forma canónica de todo el diagrama (la usan las plantillas, la IA y la prueba de compatibilidad). */
  M.serializarFlujo = function (D) {
    const s = D.sangria || "    ";
    const r = [`${D.palabra || "flowchart"} ${D.dirTexto || (D.dir === "TB" ? "TD" : D.dir)}`];
    let nivel = 1;
    for (const st of D.sentencias) {
      if (st.tipo === "fin") { nivel = Math.max(1, nivel - 1); r.push(s.repeat(nivel) + "end"); continue; }
      const ind = s.repeat(nivel);
      if (st.tipo === "subgrafo") {
        const sg = D.subgrafos.get(st.id), auto = /^sg\d+$/.test(sg.id);
        r.push(ind + "subgraph " + (auto ? `"${M.codificar(sg.titulo)}"` : sg.titulo && sg.titulo !== sg.id ? `${sg.id} [${M.etiquetaMermaid(sg.titulo)}]` : sg.id));
        nivel++;
      } else if (st.tipo === "cadena") r.push(ind + escribirCadena(st.grupos, st.enlaces));
      else if (st.tipo === "direccion") r.push(ind + "direction " + (st.subgrafo ? D.subgrafos.get(st.subgrafo).dir : D.dir));
      else if (st.tipo === "comentario") r.push(ind + D.lineas[st.linea].slice(st.ini, st.fin).trimEnd());
      else r.push(ind + D.lineas[st.linea].slice(st.ini, st.fin));
    }
    const meta = M.escribirMeta(D.meta || {});
    if (meta) r.push(meta);
    return r.join("\n") + "\n";
  };

  // ───────────── Editar (cada función recibe el texto y devuelve el texto nuevo) ─────────────
  const reemplazar = (lineas, linea, ini, fin, nuevo) => { lineas[linea] = lineas[linea].slice(0, ini) + nuevo + lineas[linea].slice(fin); };
  const unir = (lineas) => lineas.join("\n");
  /** Dónde va una línea nueva: antes de la línea de metadatos y de las líneas vacías del final. */
  function finCuerpo(D) {
    let k = D.lineas.length;
    while (k > 0 && (!D.lineas[k - 1].trim() || k - 1 === D.metaLinea)) k--;
    return k;
  }
  function sangria(D) { return D.sangria || "    "; }
  /** Id libre para un nodo nuevo: N1, N2… */
  M.idLibre = function (D, base = "N") {
    let k = 1;
    while (D.nodos.has(base + k) || D.subgrafos.has(base + k)) k++;
    return base + k;
  };

  M.renombrarNodo = function (texto, id, etiqueta) {
    const D = M.parsearFlujo(texto), n = D.nodos.get(id);
    if (!n) return texto;
    const L = [...D.lineas];
    if (n.def && n.def.sintaxis === "clasica") {
      const c = n.def.comillas || necesitaComillas(etiqueta) ? `"${M.codificar(etiqueta)}"` : M.codificar(etiqueta);
      reemplazar(L, n.def.linea, n.def.contIni, n.def.contFin, c);
    } else if (n.def) {
      reemplazar(L, n.def.linea, n.def.ini, n.def.fin, `${id}@{ shape: ${n.def.shape}, label: "${M.codificar(etiqueta)}" }`);
    } else {
      reemplazar(L, n.primera.linea, n.primera.ini, n.primera.fin, M.tokenNodo(id, "rectangulo", etiqueta));
    }
    return unir(L);
  };

  M.cambiarForma = function (texto, id, forma, icono) {
    const D = M.parsearFlujo(texto), n = D.nodos.get(id);
    if (!n) return texto;
    const L = [...D.lineas];
    const tok = M.tokenNodo(id, forma, n.etiqueta);
    if (n.def) reemplazar(L, n.def.linea, n.def.ini, n.def.fin, tok);
    else reemplazar(L, n.primera.linea, n.primera.ini, n.primera.fin, tok);
    let r = unir(L);
    if (icono !== undefined) r = M.ponerMeta(r, (m) => { m.iconos = m.iconos || {}; if (icono) m.iconos[id] = icono; else delete m.iconos[id]; });
    return r;
  };

  M.agregarNodo = function (texto, etiqueta = "Nuevo", forma = "rectangulo", id = null, dentroDe = null) {
    const D = M.parsearFlujo(texto);
    id = id || M.idLibre(D);
    const L = [...D.lineas];
    let k = finCuerpo(D), s = sangria(D);
    const sg = dentroDe && D.subgrafos.get(dentroDe);
    if (sg && sg.lineaFin > 0) { k = sg.lineaFin; s = (/^(\s*)/.exec(L[sg.linea])[1]) + sangria(D); }
    L.splice(k, 0, s + M.tokenNodo(id, forma, etiqueta));
    return { texto: unir(L), id };
  };

  M.conectar = function (texto, de, a, etiqueta = null) {
    const D = M.parsearFlujo(texto);
    const L = [...D.lineas];
    L.splice(finCuerpo(D), 0, sangria(D) + `${de} ${tokenEnlace({ trazo: "normal", fin: "flecha", largo: 1, etiqueta })} ${a}`);
    return unir(L);
  };

  /** Conecta con un nodo nuevo en una sola línea: A --> N1[Nuevo]. */
  M.conectarNuevo = function (texto, de, etiqueta = "Nuevo", forma = "rectangulo") {
    const D = M.parsearFlujo(texto), id = M.idLibre(D);
    const L = [...D.lineas];
    L.splice(finCuerpo(D), 0, sangria(D) + `${de} --> ${M.tokenNodo(id, forma, etiqueta)}`);
    return { texto: unir(L), id };
  };

  /** Vuelve a escribir las sentencias de las líneas tocadas (lo demás queda tal cual). `cambio(sent)` devuelve el texto nuevo de
   *  la sentencia, o null para quitarla. */
  function reescribirLineas(D, tocadas, cambio) {
    const L = [...D.lineas];
    const porLinea = new Map();
    for (const st of D.sentencias) if (tocadas.has(st.linea)) { if (!porLinea.has(st.linea)) porLinea.set(st.linea, []); porLinea.get(st.linea).push(st); }
    const borrar = [];
    for (const [k, sts] of porLinea) {
      const partes = sts.flatMap((st) => [].concat(cambio(st) ?? [])).filter((x) => x !== null && x !== "");
      const ind = /^(\s*)/.exec(L[k])[1];
      if (!partes.length) borrar.push(k);
      else if (sts.length === 1) L[k] = L[k].slice(0, sts[0].ini) + partes.join("\n" + ind) + L[k].slice(sts[0].fin);
      else L[k] = ind + partes.join("; ");
    }
    for (const k of borrar.sort((a, b) => b - a)) L.splice(k, 1);
    return L;
  }
  const original = (D, st) => D.lineas[st.linea].slice(st.ini, st.fin);
  /** Parte una cadena en pedazos sin los enlaces marcados (`fuera[j]` = true) y sin los nodos borrados. */
  function partirCadena(D, st, nodoFuera, enlaceFuera) {
    const grupos = st.grupos.map((g) => g.filter((r) => r.id !== nodoFuera));
    const trozos = [];
    let actual = null;
    grupos.forEach((g, j) => {
      if (!g.length) { if (actual) trozos.push(actual); actual = null; return; }
      if (!actual) actual = { grupos: [g], enlaces: [] };
      else actual.grupos.push(g);
      if (j < st.enlaces.length) {
        if (enlaceFuera(j) || !grupos[j + 1].length) { trozos.push(actual); actual = null; }
        else actual.enlaces.push(st.enlaces[j]);
      }
    });
    if (actual) trozos.push(actual);
    // Un nodo suelto sin forma que ya aparece en otra parte sobra.
    const enOtra = (id) => D.sentencias.some((s2) => s2 !== st && s2.tipo === "cadena" && s2.grupos.some((g) => g.some((r) => r.id === id)));
    return trozos.filter((tr) => !(tr.enlaces.length === 0 && tr.grupos[0].every((r) => !r.def && (r.id === nodoFuera || enOtra(r.id)))))
      .map((tr) => escribirCadena(tr.grupos, tr.enlaces));
  }

  M.borrarNodo = function (texto, id) {
    const D = M.parsearFlujo(texto);
    if (!D.nodos.has(id)) return texto;
    const tocadas = new Set();
    for (const st of D.sentencias) {
      if (st.tipo === "cadena" && st.grupos.some((g) => g.some((r) => r.id === id))) tocadas.add(st.linea);
      if ((st.tipo === "class" && st.ids.includes(id)) || (st.tipo === "style" && st.id === id)) tocadas.add(st.linea);
    }
    const L = reescribirLineas(D, tocadas, (st) => {
      if (st.tipo === "cadena") {
        if (!st.grupos.some((g) => g.some((r) => r.id === id))) return original(D, st);
        return partirCadena(D, st, id, () => false);
      }
      if (st.tipo === "class") { const ids = st.ids.filter((x) => x !== id); return ids.length ? `class ${ids.join(",")} ${st.clase}` : null; }
      if (st.tipo === "style" && st.id === id) return null;
      return original(D, st);
    });
    let r = unir(L);
    if (D.meta.pos?.[id] || D.meta.iconos?.[id]) r = M.ponerMeta(r, (m) => { if (m.pos) delete m.pos[id]; if (m.iconos) delete m.iconos[id]; });
    return r;
  };

  M.borrarArista = function (texto, indice) {
    const D = M.parsearFlujo(texto), e = D.aristas[indice];
    if (!e) return texto;
    const st = D.sentencias[e.sent];
    const simple = st.grupos[e.enlace].length === 1 && st.grupos[e.enlace + 1].length === 1;
    const L = reescribirLineas(D, new Set([st.linea]), (s) => {
      if (s !== st) return original(D, s);
      if (simple) return partirCadena(D, st, null, (j) => j === e.enlace);
      // A & B --> C: se escribe cada flecha por separado, sin la que se borra.
      const r = [];
      st.enlaces.forEach((en, j) => { for (const x of st.grupos[j]) for (const y of st.grupos[j + 1]) {
        if (j === e.enlace && x.id === e.de && y.id === e.a) continue;
        r.push(escribirCadena([[x], [y]], [en]));
      } });
      return r;
    });
    return unir(L);
  };

  M.renombrarArista = function (texto, indice, etiqueta) {
    const D = M.parsearFlujo(texto), e = D.aristas[indice];
    if (!e) return texto;
    const st = D.sentencias[e.sent], en = st.enlaces[e.enlace];
    const L = [...D.lineas];
    const vacia = etiqueta == null || etiqueta.trim() === "";
    if (en.etiqueta != null && en.forma === "sola") {
      if (vacia) { const k = L[st.linea].lastIndexOf("|", en.etqIni - 1); reemplazar(L, st.linea, k, en.etqFin + 1, ""); }
      else reemplazar(L, st.linea, en.etqIni, en.etqFin, en.etqComillas || necesitaComillas(etiqueta) ? `"${M.codificar(etiqueta)}"` : M.codificar(etiqueta));
    } else if (en.etiqueta != null) {
      // A -- texto --> B: se pasa a la forma con |texto| (más clara) o sin etiqueta.
      reemplazar(L, st.linea, en.ini, en.p, tokenEnlace({ ...en, etqCrudo: null, etiqueta: vacia ? null : etiqueta }));
    } else if (!vacia) {
      reemplazar(L, st.linea, en.finEnlace, en.finEnlace, `|${M.etiquetaMermaid(etiqueta)}|`);
    }
    return unir(L);
  };

  /** Cambia la línea `%% esquema:` (la crea al final si no está; la quita si queda vacía). */
  M.ponerMeta = function (texto, cambio) {
    const lineas = String(texto).replace(/\r\n?/g, "\n").split("\n");
    let k = lineas.findIndex((l) => /^\s*%%\s*esquema:/.test(l));
    let meta = {};
    if (k >= 0) meta = M.leerMeta(lineas[k].replace(/^\s*%%\s*esquema:\s*/, "")) || {};
    cambio(meta);
    const nueva = M.escribirMeta(meta);
    if (k >= 0) { if (nueva) lineas[k] = nueva; else lineas.splice(k, 1); }
    else if (nueva) {
      let f = lineas.length;
      while (f > 0 && !lineas[f - 1].trim()) f--;
      lineas.splice(f, 0, nueva);
    }
    return lineas.join("\n");
  };
  M.fijar = (texto, id, x, y) => M.ponerMeta(texto, (m) => { m.pos = m.pos || {}; m.pos[id] = [Math.round(x), Math.round(y)]; });
  M.desfijar = (texto, ids) => M.ponerMeta(texto, (m) => { for (const id of [].concat(ids)) if (m.pos) delete m.pos[id]; });
  M.estiloAristas = (texto, estilo) => M.ponerMeta(texto, (m) => { m.aristas = estilo; });
  M.cambiarDireccion = function (texto, dir) {
    const D = M.parsearFlujo(texto);
    if (D.cabecera < 0) return texto;
    const L = [...D.lineas];
    L[D.cabecera] = L[D.cabecera].replace(/^(\s*(?:flowchart|graph))(?:\s+\w+)?/, `$1 ${dir}`);
    // Las posiciones fijadas eran para la otra dirección: se sueltan.
    return M.ponerMeta(unir(L), (m) => { delete m.pos; });
  };
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
