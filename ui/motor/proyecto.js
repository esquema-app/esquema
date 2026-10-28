// Motor de Esquema · proyectos: la documentación de un repositorio (docs/esquema/) con sus elementos conectados.
// Lógica pura, sin dependencias (igual en el navegador y en Node): validar esquema.json, encontrar dónde se usa cada elemento,
// cambiarlo en todas partes (renombrar, quitar), el glosario, comparar versiones y qué documentos afecta un cambio del código.
//
// Cómo se conecta un documento con un elemento (todo es Markdown y Mermaid que GitHub muestra bien):
// - En un diagrama, la línea `%% esquema: {"refs": {"N3": "boton-grabar"}}` dice que el nodo (o participante) N3 es ese elemento.
// - En el texto, un enlace normal al glosario: `[Grabar](elementos.md#el-boton-grabar)` (con `../` si el documento está en una
//   subcarpeta). En GitHub se ve como un enlace que lleva a la ficha del elemento; Esquema lo reconoce por `elementos.md#el-<id>`.
(function (M) {
  "use strict";
  const TIPOS_ELEMENTO = ["pantalla", "boton", "accion", "servicio", "modulo", "dato", "actor", "otro"];
  const TIPOS_DOCUMENTO = ["vision", "arquitectura", "flujo", "glosario", "otro"];
  M.TIPOS_ELEMENTO = TIPOS_ELEMENTO;
  M.TIPOS_DOCUMENTO = TIPOS_DOCUMENTO;
  M.GLOSARIO = "elementos.md";

  const esTexto = (v, max, vacio = false) => typeof v === "string" && v.length <= max && (vacio || v.trim().length > 0);
  const rutaRelativa = (r, max = 200) => typeof r === "string" && r.length > 0 && r.length <= max && !/\0/.test(r) && !/^([\\/]|[A-Za-z]:)/.test(r) && r.replace(/\/$/, "").split(/[\\/]/).every((p) => p && p !== "." && p !== "..");
  const rutaDoc = (r) => rutaRelativa(r, 160) && /^[\w.-]+(\/[\w.-]+){0,2}\.(md|mmd)$/.test(r) && !r.split("/").some((p) => p.startsWith("."));

  /** Errores de un elemento (vacío = válido). La misma regla que bin/proyecto.py (casos en pruebas/casos.json, «proyecto_esquema»). */
  M.validarElemento = function (el) {
    const e = [];
    if (!el || typeof el !== "object" || Array.isArray(el)) return ["no es un objeto"];
    for (const k of Object.keys(el)) if (!["id", "tipo", "nombre", "descripcion", "codigo"].includes(k)) e.push("campo desconocido: " + k);
    if (typeof el.id !== "string" || el.id.length > 60 || !M.ID_ELEMENTO.test(el.id)) e.push("id");
    if (!TIPOS_ELEMENTO.includes(el.tipo)) e.push("tipo");
    if (!esTexto(el.nombre, 80)) e.push("nombre");
    if (el.descripcion !== undefined && !esTexto(el.descripcion, 500, true)) e.push("descripcion");
    if (el.codigo !== undefined && (!Array.isArray(el.codigo) || el.codigo.length > 20 || !el.codigo.every((r) => rutaRelativa(r)))) e.push("codigo");
    return e;
  };
  /** Errores de esquema.json (vacío = válido). */
  M.validarEsquema = function (x) {
    const e = [];
    if (!x || typeof x !== "object" || Array.isArray(x)) return ["no es un objeto"];
    for (const k of Object.keys(x)) if (!["formato", "nombre", "descripcion", "documentos", "elementos", "fuentes"].includes(k)) e.push("campo desconocido: " + k);
    if (x.formato !== 1) e.push("formato");
    if (!esTexto(x.nombre, 80)) e.push("nombre");
    if (x.descripcion !== undefined && !esTexto(x.descripcion, 1000, true)) e.push("descripcion");
    if (!Array.isArray(x.documentos) || x.documentos.length > 300) e.push("documentos");
    else {
      const vistas = new Set();
      for (const d of x.documentos) {
        if (!d || typeof d !== "object" || !rutaDoc(d.ruta) || !esTexto(d.titulo, 120) || !TIPOS_DOCUMENTO.includes(d.tipo) || Object.keys(d).some((k) => !["ruta", "titulo", "tipo"].includes(k)) || vistas.has(d.ruta)) { e.push("documento: " + JSON.stringify(d).slice(0, 60)); continue; }
        vistas.add(d.ruta);
      }
    }
    if (!Array.isArray(x.elementos) || x.elementos.length > 1000) e.push("elementos");
    else {
      const ids = new Set();
      for (const el of x.elementos) {
        const m = M.validarElemento(el);
        if (m.length) e.push(`elemento ${el && el.id}: ${m.join(", ")}`);
        else if (ids.has(el.id)) e.push("elemento repetido: " + el.id);
        else ids.add(el.id);
      }
    }
    if (x.fuentes !== undefined) {
      const f = x.fuentes;
      if (!f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).some((k) => !["leido", "archivos"].includes(k)) || (f.leido !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(f.leido)) || (f.archivos !== undefined && (!Array.isArray(f.archivos) || f.archivos.length > 100 || !f.archivos.every((r) => rutaRelativa(r))))) e.push("fuentes");
    }
    return e;
  };
  M.rutaDocProyecto = rutaDoc;

  /** Un id para un elemento nuevo desde su nombre: «Botón Grabar» → «boton-grabar» (sin repetir los que ya hay). */
  M.idElemento = function (nombre, usados = []) {
    const base = String(nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "elemento";
    const u = new Set(usados);
    if (!u.has(base)) return base;
    let k = 2; while (u.has(`${base}-${k}`)) k++;
    return `${base}-${k}`;
  };

  // ───────────── Referencias ─────────────
  const RE_META = /^\s*%%\s*esquema:\s*(\{.*\})\s*$/m;
  /** Las referencias de un diagrama (cualquier tipo): {idNodo: idElemento}. */
  M.refsDiagrama = function (texto) {
    const m = RE_META.exec(String(texto));
    const meta = m ? M.leerMeta(m[1]) : null;
    return (meta && meta.refs) || {};
  };
  M.ponerRef = (texto, nodo, elemento) => M.ponerMeta(texto, (m) => { m.refs = m.refs || {}; if (elemento) m.refs[nodo] = elemento; else delete m.refs[nodo]; });

  /** Líneas de un Markdown que están dentro de un bloque de código (ahí no se buscan enlaces ni menciones). */
  function enCodigo(md) {
    const s = new Set();
    for (const b of M.bloquesCodigo(md)) for (let i = b.ini; i <= b.fin; i++) s.add(i);
    return s;
  }
  const RE_ENLACE = /\[([^\]\n]+)\]\(((?:\.\.?\/)*(?:[\w.-]+\/)*)elementos\.md#el-([a-z0-9]+(?:-[a-z0-9]+)*)\)/g;
  /** Enlaces a elementos en un Markdown: [{linea, ini, fin, texto, id, prefijo}] (fuera de los bloques de código). */
  M.enlacesElementos = function (md) {
    const L = String(md).replace(/\r\n?/g, "\n").split("\n"), codigo = enCodigo(md), r = [];
    L.forEach((l, i) => {
      if (codigo.has(i)) return;
      for (const m of l.matchAll(RE_ENLACE)) r.push({ linea: i, ini: m.index, fin: m.index + m[0].length, texto: m[1], id: m[3], prefijo: m[2] });
    });
    return r;
  };
  /** Cómo enlazar un elemento desde un documento: la ruta relativa al glosario, que está en la raíz de la carpeta de docs. */
  M.enlaceElemento = function (rutaDocumento, carpetaDocs, id, texto) {
    const rel = carpetaDocs && rutaDocumento.startsWith(carpetaDocs + "/") ? rutaDocumento.slice(carpetaDocs.length + 1) : rutaDocumento;
    const nivel = rel.split("/").length - 1;
    return `[${String(texto).replace(/[[\]]/g, "")}](${"../".repeat(nivel)}${M.GLOSARIO}#el-${id})`;
  };

  const diagramasDe = (ruta, texto) => (/\.(mmd|mermaid)$/i.test(ruta) ? [{ k: -1, contenido: texto, ini: -1 }] : M.bloquesMermaid(texto).map((b, k) => ({ k, contenido: b.contenido, ini: b.ini })));
  const escRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** ¿El nombre aparece como palabra en el texto? (sin distinguir mayúsculas) */
  const reNombre = (nombre, exacto = false) => new RegExp(`(^|[^\\p{L}\\p{N}_])(${escRe(nombre)})(?=$|[^\\p{L}\\p{N}_])`, exacto ? "gu" : "giu");
  /** Las etiquetas de los nodos o participantes de un diagrama: Map(id → etiqueta). */
  function etiquetas(texto) {
    const t = M.tipoDiagrama(texto).tipo;
    if (t === "flujo") { const D = M.parsearFlujo(texto); return new Map([...D.nodos].map(([id, n]) => [id, n.etiqueta])); }
    if (t === "secuencia") { const S = M.parsearSecuencia(texto); return new Map(S.participantes.map((p) => [p.id, p.etiqueta])); }
    return new Map();
  }

  /** Dónde se usa un elemento en los documentos del proyecto ({ruta: texto}): [{ruta, enlaces, nodos: [{bloque, id, etiqueta}], frases}].
   *  `frases` son las líneas que lo nombran (con enlace o sin él) para revisarlas. */
  M.usosElemento = function (docs, el) {
    const r = [];
    for (const [ruta, texto] of Object.entries(docs)) {
      if (typeof texto !== "string" || ruta.endsWith("/" + M.GLOSARIO) || ruta === M.GLOSARIO) continue;
      const nodos = [];
      for (const d of diagramasDe(ruta, texto)) {
        const refs = M.refsDiagrama(d.contenido), et = etiquetas(d.contenido);
        for (const [id, x] of Object.entries(refs)) if (x === el.id && et.has(id)) nodos.push({ bloque: d.k, id, etiqueta: et.get(id) });
      }
      let enlaces = 0, frases = [];
      if (!/\.(mmd|mermaid)$/i.test(ruta)) {
        const en = M.enlacesElementos(texto).filter((x) => x.id === el.id);
        enlaces = en.length;
        const L = texto.replace(/\r\n?/g, "\n").split("\n"), codigo = enCodigo(texto);
        const lineas = new Set(en.map((x) => x.linea));
        L.forEach((l, i) => { if (!codigo.has(i) && el.nombre && reNombre(el.nombre).test(l.replace(RE_ENLACE, "$1"))) lineas.add(i); });
        frases = [...lineas].sort((a, b) => a - b).map((i) => ({ linea: i + 1, texto: L[i].trim().slice(0, 300) }));
      }
      if (nodos.length || enlaces || frases.length) r.push({ ruta, enlaces, nodos, frases });
    }
    return r;
  };

  // ───────────── Cambiar en todas partes ─────────────
  /** Renombra un nodo/participante que es el elemento: si su etiqueta es el nombre viejo, pasa a ser el nuevo; si lo contiene,
   *  se cambia esa parte; si no, se deja (y se avisa). */
  function etiquetaNueva(actual, viejo, nuevo) {
    const plano = (t) => String(t).normalize("NFC").replace(/\s+/g, " ").trim();
    if (plano(actual) === plano(viejo)) return nuevo;
    // Con las mismas mayúsculas: «grabar» (un verbo en una frase) no es el botón «Grabar».
    if (viejo && reNombre(viejo, true).test(actual)) return actual.replace(reNombre(viejo, true), (_, a) => a + nuevo);
    return null;
  }
  function cambiarDiagrama(texto, el, cambio, notas) {
    const refs = M.refsDiagrama(texto), ids = Object.keys(refs).filter((k) => refs[k] === el.id);
    if (!ids.length) return texto;
    const tipo = M.tipoDiagrama(texto).tipo;
    let t = texto;
    if (cambio.tipo === "renombrar") {
      for (const id of ids) {
        const et = etiquetas(t).get(id);
        if (et == null) continue;
        const nueva = etiquetaNueva(et, el.nombre, cambio.nombre);
        if (nueva == null) { notas.sinCambiar.push(et); continue; }
        t = tipo === "secuencia" ? M.renombrarParticipante(t, id, nueva) : M.renombrarNodo(t, id, nueva);
        notas.renombrados.push([et, nueva]);
      }
    } else if (cambio.tipo === "quitar") {
      for (const id of ids) {
        const et = etiquetas(t).get(id);
        if (tipo === "secuencia") { t = M.borrarParticipante(t, id); notas.quitados.push(et ?? id); continue; }
        if (tipo !== "flujo") continue;
        const D = M.parsearFlujo(t);
        if (!D.nodos.has(id)) continue;
        const antes = D.aristas.filter((e) => e.a === id && e.de !== id).map((e) => e.de), despues = D.aristas.filter((e) => e.de === id && e.a !== id).map((e) => e.a);
        // Lo que venía antes se une con lo que sigue (si se pidió): así el flujo no queda cortado.
        if (cambio.reconectar) for (const a of [...new Set(antes)]) for (const b of [...new Set(despues)]) {
          if (a !== b && !D.aristas.some((e) => e.de === a && e.a === b)) { t = M.conectar(t, a, b); notas.unidos.push([D.nodos.get(a)?.etiqueta ?? a, D.nodos.get(b)?.etiqueta ?? b]); }
        }
        t = M.borrarNodo(t, id);
        notas.quitados.push(et ?? id);
        const D2 = M.parsearFlujo(t);
        for (const v of new Set([...antes, ...despues])) if (D2.nodos.has(v) && !D2.aristas.some((e) => e.de === v || e.a === v)) notas.sueltos.push(D2.nodos.get(v).etiqueta);
      }
    }
    return t;
  }
  /** Lo que pasaría con cada documento si el elemento cambia. `cambio`: {tipo: "renombrar", nombre, tambienSinEnlace?} |
   *  {tipo: "quitar", reconectar?} | {tipo: "describir"} (solo cambia el glosario). Devuelve [{ruta, antes, despues, notas}] solo
   *  con los archivos que cambian o que lo mencionan (para revisar). Nada se aplica aquí. */
  M.cambiarElemento = function (docs, el, cambio) {
    const r = [];
    for (const [ruta, texto] of Object.entries(docs)) {
      if (typeof texto !== "string" || ruta === M.GLOSARIO || ruta.endsWith("/" + M.GLOSARIO)) continue;
      const notas = { renombrados: [], sinCambiar: [], quitados: [], sueltos: [], unidos: [], enlaces: 0, menciones: 0, frases: [] };
      let t = texto;
      if (cambio.tipo !== "describir") {
        if (/\.(mmd|mermaid)$/i.test(ruta)) t = cambiarDiagrama(t, el, cambio, notas);
        else {
          M.bloquesMermaid(t).forEach((b, k) => {
            const nuevo = cambiarDiagrama(b.contenido, el, cambio, notas);
            if (nuevo !== b.contenido) t = M.reemplazarBloque(t, k, nuevo);
          });
          const L = t.replace(/\r\n?/g, "\n").split("\n"), codigo = enCodigo(t);
          for (let i = 0; i < L.length; i++) {
            if (codigo.has(i)) continue;
            let l = L[i];
            const conEnlace = RE_ENLACE.test(l); RE_ENLACE.lastIndex = 0;
            l = l.replace(RE_ENLACE, (todo, txt, pre, id) => {
              if (id !== el.id) return todo;
              notas.enlaces++;
              if (cambio.tipo === "quitar") return txt;  // queda el texto, sin enlace
              const nuevo = etiquetaNueva(txt, el.nombre, cambio.nombre);
              return `[${nuevo ?? txt}](${pre}${M.GLOSARIO}#el-${id})`;
            });
            if (cambio.tipo === "renombrar" && cambio.tambienSinEnlace && el.nombre) {
              // Fuera de los enlaces: se protegen y se cambian las menciones sueltas.
              const guardados = [];
              l = l.replace(/\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`/g, (m) => { guardados.push(m); return `\u0000${guardados.length - 1}\u0000`; });
              l = l.replace(reNombre(el.nombre, true), (_, a) => { notas.menciones++; return a + cambio.nombre; });
              l = l.replace(/\u0000(\d+)\u0000/g, (_, k) => guardados[Number(k)]);
            }
            const plano = l.replace(RE_ENLACE, "$1");
            if ((conEnlace && L[i] !== l) || (el.nombre && reNombre(el.nombre).test(L[i].replace(RE_ENLACE, "$1")))) notas.frases.push({ linea: i + 1, antes: L[i].trim().slice(0, 300), despues: plano.trim().slice(0, 300) });
            L[i] = l;
          }
          t = L.join("\n");
        }
      }
      if (t !== texto || notas.frases.length) r.push({ ruta, antes: texto, despues: t, notas });
    }
    return r;
  };

  /** Quita enlaces a elementos que no existen y referencias de diagramas a elementos desconocidos (lo que propone la IA se limpia
   *  así antes de mostrarse). */
  M.limpiarRefs = function (texto, ids, esDiagramaSuelto = false) {
    const validos = new Set(ids);
    const limpiarDiag = (d) => { const refs = M.refsDiagrama(d); return Object.values(refs).some((x) => !validos.has(x)) ? M.ponerMeta(d, (m) => { for (const [k, v] of Object.entries(m.refs || {})) if (!validos.has(v)) delete m.refs[k]; }) : d; };
    if (esDiagramaSuelto) return limpiarDiag(texto);
    let t = texto;
    M.bloquesMermaid(t).forEach((b, k) => { const n = limpiarDiag(b.contenido); if (n !== b.contenido) t = M.reemplazarBloque(t, k, n); });
    const L = t.split("\n"), codigo = enCodigo(t);
    return L.map((l, i) => (codigo.has(i) ? l : l.replace(RE_ENLACE, (todo, txt, _p, id) => (validos.has(id) ? todo : txt)))).join("\n");
  };

  // ───────────── Glosario (elementos.md) ─────────────
  const NOMBRE_TIPO = {
    es: { pantalla: "Pantallas", boton: "Botones", accion: "Acciones", servicio: "Servicios", modulo: "Módulos y archivos", dato: "Datos", actor: "Personas y sistemas", otro: "Otros" },
    en: { pantalla: "Screens", boton: "Buttons", accion: "Actions", servicio: "Services", modulo: "Modules and files", dato: "Data", actor: "People and systems", otro: "Other" },
  };
  /** El glosario que GitHub muestra: un ancla invisible por elemento (`<a id="el-…">`) para que los enlaces lleguen a su ficha. */
  M.glosario = function (esquema, idioma = "es") {
    const en = idioma === "en";
    const r = [en ? `# Elements of ${esquema.nombre}` : `# Elementos de ${esquema.nombre}`, "",
      en ? "<!-- Esquema writes this file from esquema.json. Change elements in Esquema so every document stays connected. -->" : "<!-- Esquema escribe este archivo desde esquema.json. Cambia los elementos en Esquema para que todos los documentos sigan conectados. -->", ""];
    if (!esquema.elementos.length) r.push(en ? "No elements yet." : "Todavía no hay elementos.", "");
    for (const tipo of TIPOS_ELEMENTO) {
      const lista = esquema.elementos.filter((e) => e.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre));
      if (!lista.length) continue;
      r.push(`## ${NOMBRE_TIPO[en ? "en" : "es"][tipo]}`, "");
      for (const e of lista) {
        r.push(`<a id="el-${e.id}"></a>`, "", `### ${e.nombre.replace(/\n/g, " ")}`, "");
        if (e.descripcion) r.push(e.descripcion.replace(/\n+/g, " "), "");
        if (e.codigo && e.codigo.length) r.push((en ? "In the code: " : "En el código: ") + e.codigo.map((c) => "`" + c.replace(/`/g, "") + "`").join(", "), "");
      }
    }
    return r.join("\n").replace(/\n+$/, "") + "\n";
  };

  // ───────────── Comparar versiones ─────────────
  /** Diferencias por línea (LCS): [{tipo: "=" | "+" | "-", texto}]. Para archivos enormes, compara por bloques sin LCS. */
  M.difLineas = function (a, b) {
    const A = String(a ?? "").replace(/\r\n?/g, "\n").split("\n"), B = String(b ?? "").replace(/\r\n?/g, "\n").split("\n");
    let ini = 0; while (ini < A.length && ini < B.length && A[ini] === B[ini]) ini++;
    let fa = A.length, fb = B.length; while (fa > ini && fb > ini && A[fa - 1] === B[fb - 1]) { fa--; fb--; }
    const r = A.slice(0, ini).map((t) => ({ tipo: "=", texto: t }));
    const X = A.slice(ini, fa), Y = B.slice(ini, fb);
    if (X.length * Y.length > 4_000_000) { for (const t of X) r.push({ tipo: "-", texto: t }); for (const t of Y) r.push({ tipo: "+", texto: t }); }
    else {
      const n = X.length, m = Y.length, T = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = X[i] === Y[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
      let i = 0, j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && X[i] === Y[j]) { r.push({ tipo: "=", texto: X[i] }); i++; j++; }
        else if (i < n && (j === m || T[i + 1][j] >= T[i][j + 1])) { r.push({ tipo: "-", texto: X[i] }); i++; }
        else { r.push({ tipo: "+", texto: Y[j] }); j++; }
      }
    }
    for (const t of A.slice(fa)) r.push({ tipo: "=", texto: t });
    return r;
  };
  /** Qué cambió en un diagrama: nodos (o participantes) agregados, quitados y con otra etiqueta; flechas agregadas y quitadas. */
  M.difDiagrama = function (a, b) {
    const ea = etiquetas(a || ""), eb = etiquetas(b || "");
    const aristas = (t) => {
      const tipo = M.tipoDiagrama(t || "").tipo;
      if (tipo === "flujo") return M.parsearFlujo(t).aristas.map((e) => `${e.de}→${e.a}${e.etiqueta ? ": " + e.etiqueta : ""}`);
      if (tipo === "secuencia") return M.parsearSecuencia(t).eventos.filter((e) => e.tipo === "mensaje").map((e) => `${e.de}→${e.a}: ${e.texto}`);
      return [];
    };
    const xa = aristas(a), xb = aristas(b);
    const resta = (p, q) => { const c = new Map(); for (const x of q) c.set(x, (c.get(x) || 0) + 1); return p.filter((x) => { const k = c.get(x) || 0; if (k) { c.set(x, k - 1); return false; } return true; }); };
    return {
      agregados: [...eb.keys()].filter((k) => !ea.has(k)),
      quitados: [...ea.keys()].filter((k) => !eb.has(k)).map((k) => ({ id: k, etiqueta: ea.get(k) })),
      cambiados: [...eb.keys()].filter((k) => ea.has(k) && ea.get(k) !== eb.get(k)).map((k) => ({ id: k, antes: ea.get(k), despues: eb.get(k) })),
      aristasAgregadas: resta(xb, xa), aristasQuitadas: resta(xa, xb),
    };
  };
  /** Compara dos versiones de la carpeta de docs ({ruta: texto}): [{ruta, estado: "nuevo" | "quitado" | "cambiado"}]. */
  M.difVersiones = function (antes, despues) {
    const r = [];
    for (const k of [...new Set([...Object.keys(antes), ...Object.keys(despues)])].sort()) {
      if (!(k in antes)) r.push({ ruta: k, estado: "nuevo" });
      else if (!(k in despues)) r.push({ ruta: k, estado: "quitado" });
      else if (antes[k] !== despues[k]) r.push({ ruta: k, estado: "cambiado" });
    }
    return r;
  };

  // ───────────── Cambios del código ─────────────
  /** Qué documentos podría afectar un grupo de commits: por los archivos de código de cada elemento (la ruta del commit empieza
   *  con la del elemento, o al revés) y por los mensajes que nombran al elemento. Devuelve {elementos: [{id, nombre, por}],
   *  documentos: [ruta]}. */
  M.docsAfectados = function (esquema, docs, commits) {
    const elementos = [];
    const archivos = new Set(commits.flatMap((c) => c.archivos || []));
    const mensajes = commits.map((c) => c.mensaje || "").join("\n");
    for (const el of esquema.elementos) {
      const por = [];
      const toca = (el.codigo || []).filter((r) => [...archivos].some((a) => a === r || a.startsWith(r.replace(/\/$/, "") + "/") || r.startsWith(a + "/")));
      if (toca.length) por.push({ tipo: "codigo", rutas: toca });
      if (el.nombre.length >= 3 && reNombre(el.nombre).test(mensajes)) por.push({ tipo: "mensaje" });
      if (por.length) elementos.push({ id: el.id, nombre: el.nombre, por });
    }
    const documentos = new Set();
    for (const e of elementos) for (const u of M.usosElemento(docs, esquema.elementos.find((x) => x.id === e.id))) documentos.add(u.ruta);
    return { elementos, documentos: [...documentos].sort() };
  };
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
