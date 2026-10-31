// Interfaz de Esquema · proyectos: documentar un repositorio (docs/esquema/ dentro del mismo repo), con elementos conectados en todos
// los documentos y versiones (commits de git solo de esa carpeta, o copias en .versiones/ si no hay git).
// app.js lo crea con `window.EsquemaProyectos(api)` y le pasa lo que necesita (estado E, motor M, puente, textos, pintar…).
// Lo que cambia archivos pasa por lo de siempre (guardarArchivo, deshacer por archivo, cambios de la IA con «Quitar este cambio»);
// lo propio del proyecto va por la acción `proyecto` del puente ({orden: abrir | leer | preparar | generar | guardar | version |
// versiones | ver | restaurar}) → `proyectoRespuesta`, que corre bin/proyecto.py.
(() => {
  "use strict";
  window.EsquemaProyectos = function (api) {
    const { E, M, host, ui, $, esc, ic, T, Tp, tr, frase, toast, movil, nombreIA, enBienvenida } = api;
    /** El error de un trabajo o de uno de sus ítems, en el idioma de la persona: un error de la IA trae {codigo, plantilla, valores}
     *  (pieza «ia» / bin/ia_vivo.py) y se traduce con su plantilla; los demás son una frase en español. */
    const errorTrabajo = (x) => (x?.error_ia?.plantilla ? Tp(x.error_ia.plantilla, x.error_ia.valores || {}) : tr(x?.error || ""));
    const errorTrabajoHTML = (x) => esc(errorTrabajo(x));
    const pj = (E.pj = { dialogo: null, generando: null, versiones: null, elemento: null, buscar: "", editar: null, ultimo: null, espera: null, pedido: false, ultimoEnvio: null,
      trabajo: null,       // el trabajo largo de este proyecto (bin/trabajos.py): {id, estado, etapa, etapas, hechas, items, leidos, leyendo, …}
      esperando: false,    // se pidió `documentar` y todavía no llega su primer evento
      ficha: null,         // ruta del archivo de código que muestra la ficha (panel «ficha»)
      ultimoEvento: 0 });
    const NOMBRE_TIPO = { pantalla: "Pantalla", boton: "Botón", accion: "Acción", servicio: "Servicio", modulo: "Módulo o archivo", dato: "Dato", actor: "Persona o sistema", personaje: "Personaje", concepto: "Concepto", lugar: "Lugar", otro: "Otro" };
    // ───────────── Tipos de proyecto (tipos/<id>.json, validados con M.validarTipo): qué secciones, acciones y «Nuevo» tiene cada uno ─────────────
    const TIPO_RESPALDO = { id: "software", icono: "codigo", nombre: { es: "Software", en: "Software" }, descripcion: { es: "", en: "" }, fuente: "carpeta", elementos: M.TIPOS_ELEMENTO.slice(0, 8),
      secciones: [{ id: "documentos", nombre: { es: "Documentos", en: "Documents" }, icono: "doc", carpetas: [] }, { id: "elementos", nombre: { es: "Elementos", en: "Elements" } }, { id: "versiones", nombre: { es: "Versiones", en: "Versions" } }],
      falta: ["vision", "arquitectura", "segun-codigo", "flujos", "elementos", "elementos-usados", "al-dia"], acciones: ["documentar", "completar", "flujo", "diagrama", "readme"], nuevo: ["diagrama", "documento"], agregar: [] };
    const textoDe = (o) => (o && typeof o === "object" ? o[E.idioma] || o.es || "" : String(o || ""));
    const tipos = () => (E.tipos?.length ? E.tipos : [TIPO_RESPALDO]);
    const tipoDe = (id) => tipos().find((t) => t.id === id) || tipos().find((t) => t.id === "software") || tipos()[0];
    const tipoActual = () => tipoDe(E.proyecto?.esquema?.tipo || E.proyecto?.tipo || E.tipoProyecto || "software");
    const ofrece = (lista, x) => (tipoActual()[lista] || []).includes(x);
    const nombreSeccion = (id, defecto) => textoDe(tipoActual().secciones.find((x) => x.id === id)?.nombre) || tr(defecto);
    /** El nombre del proyecto abierto (el que se ve en el lateral y en «Nuevo en …»). */
    const nombreProyecto = () => (vinculado() && E.codigoArbol?.nombre) || (E.proyecto && !E.proyecto.vinculado ? E.carpeta?.nombre : esquema()?.nombre) || E.carpeta?.nombre || "";
    const hoy = () => new Date().toISOString().slice(0, 10);
    const clon = (x) => JSON.parse(JSON.stringify(x));
    const docsDir = () => E.proyecto?.docs ?? E.encontrado?.docs ?? (E.vinculo ? "" : "docs/esquema");
    // Un proyecto vinculado (documentación aparte, en ~/Esquema) tiene docs "": la documentación es la carpeta entera.
    const enDocs = (ruta) => !docsDir() || ruta.startsWith(docsDir() + "/");
    const rel = (ruta) => (docsDir() ? ruta.slice(docsDir().length + 1) : ruta);
    const completa = (r) => (docsDir() ? docsDir() + "/" + r : r);
    const vinculado = () => !!(E.proyecto?.vinculado || E.vinculo);
    const listaProyectos = (l) => l.map((p) => ({ nombre: p.nombre, ruta: p.ruta, ubicacion: p.ubicacion || "", codigo: p.codigo || "" }));
    const esquema = () => E.proyecto?.esquema || null;
    const elemento = (id) => esquema()?.elementos.find((e) => e.id === id) || null;
    const enviar = (orden, datos = {}) => host.enviar("proyecto", { orden, docs: docsDir(), ...datos });
    const tamano = (n) => (n < 1024 ? Tp("{n} B", { n }) : Tp("{n} KB", { n: Math.round(n / 102.4) / 10 }));
    const fecha = (f) => { const d = new Date(f); return isNaN(d) ? String(f || "") : d.toLocaleString(E.idioma === "en" ? "en-US" : "es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

    // ───────────── Documentos del proyecto (cargados en E.docs, igual que los que se abren) ─────────────
    function rutasDocs() { return E.archivos.map((a) => a.ruta).filter((r) => enDocs(r) && /\.(md|mmd)$/i.test(r) && !rel(r).startsWith(".")); }
    /** Pide a la app los documentos que faltan (sin abrirlos en el editor). */
    function cargarDocs() {
      for (const r of rutasDocs()) if (!E.docs[r]) { E.docs[r] = { texto: null, guardado: null, estado: "cargando", pila: [], futuro: [] }; host.enviar("abrirArchivo", { ruta: r }); }
    }
    /** {ruta: texto} de los documentos del proyecto ya cargados; `listos` dice si están todos. */
    function docsProyecto() {
      const r = {}; let listos = true;
      for (const ruta of rutasDocs()) { const d = E.docs[ruta]; if (d && d.texto != null) r[ruta] = d.texto; else listos = false; }
      return { docs: r, listos };
    }
    /** «1 enlace», «3 enlaces»… (frases completas por cantidad, para que se traduzcan bien). */
    const cuenta = (n, uno, varios) => (n === 1 ? tr(uno) : Tp(varios, { n }));
    const resumenUso = (u) => [u.enlaces ? cuenta(u.enlaces, "1 enlace", "{n} enlaces") : "", u.nodos.length ? cuenta(u.nodos.length, "en 1 diagrama", "{n} veces en diagramas") : "", u.frases.length ? cuenta(u.frases.length, "1 frase lo nombra", "{n} frases lo nombran") : ""].filter(Boolean).join(" · ");
    function tituloDoc(ruta) { const d = esquema()?.documentos.find((x) => x.ruta === rel(ruta)); return d ? d.titulo : rel(ruta); }

    /** Archivo nuevo sin abrirlo en el editor (cuando se guardan varios de una vez). */
    function crearSilencioso(ruta, texto) {
      if (!E.archivos.some((a) => a.ruta === ruta)) { E.archivos.push({ ruta }); E.archivos.sort(api.porRuta); }
      E.docs[ruta] = { texto, guardado: null, estado: "guardando", enviado: texto, pila: [], futuro: [] };
      host.enviar("guardarArchivo", { ruta, texto, nuevo: true });
    }
    /** Escribe un documento del proyecto (existente o nuevo). Devuelve el texto de antes (null si es nuevo) o undefined si no cambió. */
    function escribir(ruta, texto) {
      const d = E.docs[ruta];
      if (d && d.texto != null) { const antes = d.texto; return api.cambiarTextoDe(ruta, texto, { inmediato: true, origen: "ia" }) ? antes : undefined; }
      crearSilencioso(ruta, texto);
      return null;
    }
    const glosarioRuta = () => completa(M.GLOSARIO);
    function conGlosario(x) {
      if (!x.documentos.some((d) => d.ruta === M.GLOSARIO)) x.documentos.push({ ruta: M.GLOSARIO, titulo: tr("Elementos"), tipo: "glosario" });
      return x;
    }
    /** Guarda esquema.json, espera a que terminen de guardarse los documentos y recién ahí guarda la versión (una sola). */
    function guardarYVersion(x, mensaje, rutas) {
      pj.espera = { pendientes: new Set(rutas), esquema: false, mensaje };
      enviar("guardar", { esquema: x });
      pintarProyecto();
    }
    function revisarEspera() {
      const w = pj.espera;
      if (!w || !w.esquema || w.pendientes.size) return;
      pj.espera = null;
      if (w.mensaje) enviar("version", { mensaje: w.mensaje });
    }
    const pintarProyecto = () => api.pintar();

    // ───────────── Pedirle a la IA (siempre se ve antes lo que se envía) ─────────────
    function pedirIA(tarea, datos) {
      if (!E.proyecto && !vinculado()) { pj.despues = { tarea, datos }; pj.dialogo = null; enviar("vincular"); toast("Primero preparo la carpeta de documentación, aparte del código"); return api.pintar(); }
      pj.dialogo = { tipo: "envio", tarea, datos, cargando: true };
      enviar("preparar", { tarea, ...datos });
      api.pintar();
    }
    function enviarIA() {
      const d = pj.dialogo;
      pj.dialogo = null;
      // Documentar todo (o completar lo que falta) es un trabajo por etapas, en segundo plano, que guarda a medida que avanza.
      if (TAREAS_TRABAJO.includes(d.tarea)) return empezarTrabajo(d);
      pj.generando = { tarea: d.tarea, datos: d.datos, desde: Date.now() };
      pj.ultimoEnvio = d;
      enviar("generar", { tarea: d.tarea, idioma: E.idioma, ...d.datos, ...(d.aFondo && d.fondo ? { a_fondo: true } : {}) });
      api.pintar();
    }
    /** Lo que propuso la IA, listo para revisar: cada documento como tarjeta con «Quitar este cambio». Se limpia (enlaces a elementos
     *  que no existen fuera) y cada diagrama se valida con el motor: uno con errores no se agrega. */
    function armarPropuestas(r) {
      const actuales = esquema()?.elementos || [];
      const ids = [...new Set([...actuales.map((e) => e.id), ...r.elementos.map((e) => e.id)])];
      const lista = [];
      for (const p of r.propuestas) {
        const ruta = completa(p.ruta), texto = M.limpiarRefs(p.texto, ids);
        const antes = E.archivos.some((a) => a.ruta === ruta) ? (E.docs[ruta]?.texto ?? null) : null;
        if (antes === texto) continue;
        let error = null;
        M.bloquesMermaid(texto).forEach((b) => { const x = api.resultadoBloque(b.contenido, "pp"); if (!error && x.errores?.length) error = { linea: x.errores[0].linea + b.ini + 1, frase: M.frase(x.errores[0]) }; });
        const existe = antes != null || E.archivos.some((a) => a.ruta === ruta);
        // «Agregar información»: cada cambio trae qué hace (crear / completar / modificar), por qué y de dónde salió. Lo que modifica
        // algo no se guarda hasta que la persona lo confirma (y se muestra abierto, con antes y después).
        const accion = ["crear", "completar", "modificar"].includes(p.accion) ? (p.accion === "crear" && existe ? "modificar" : p.accion) : null;
        lista.push({ ruta, titulo: p.titulo, tipo: p.tipo, texto, antes, existe, error, quitada: !!error, ver: accion === "modificar" && !error,
          accion, porque: p.porque || "", cita: p.cita || "", citaExacta: !!p.cita_exacta, confirmar: accion === "modificar", confirmada: false });
      }
      const elementos = [];
      for (const el of r.elementos) {
        const ya = actuales.find((x) => x.id === el.id);
        if (ya && JSON.stringify(ya) === JSON.stringify({ ...ya, ...el })) continue;
        elementos.push({ ...el, estado: ya ? "cambia" : "nuevo" });
      }
      return { tarea: r.tarea, nota: r.nota || "", lista, elementos, elementosQuitados: false, descartados: r.descartados || 0, rechazados: r.rechazados || [], pide: r.pide || [] };
    }
    function aplicarPropuestas() {
      const pr = E.propuestas;
      const { listos } = docsProyecto();
      if (!listos) { cargarDocs(); return toast("Espera: estoy leyendo los documentos del proyecto"); }
      const anterior = esquema();
      const x = anterior ? clon(anterior) : { formato: 1, nombre: (E.encontrado?.nombre || E.carpeta?.nombre || "Proyecto").slice(0, 80), documentos: [], elementos: [] };
      if (!anterior && E.encontrado?.readme?.resumen) x.descripcion = E.encontrado.readme.resumen.slice(0, 1000);
      if (pr.tarea === "inicial" && pj.ultimoEnvio?.piezas) x.fuentes = { leido: hoy(), archivos: pj.ultimoEnvio.piezas.filter((p) => p.ruta && !p.ruta.includes("..")).map((p) => p.ruta).slice(0, 100) };
      const escritas = [], antes = {};
      for (const p of pr.lista) {
        if (p.quitada || (p.confirmar && !p.confirmada)) continue;
        const a = escribir(p.ruta, p.texto);
        if (a === undefined) continue;
        escritas.push(p.ruta); antes[p.ruta] = a;
        if (a != null) api.registrarCambioIA({ id: "ia-" + Date.now().toString(36) + escritas.length, ruta: p.ruta, pedido: p.titulo, antes: "", despues: "", antesDoc: a, despuesDoc: p.texto, estado: "aplicado", resumen: { tipo: "doc", nodos: 0, aristas: 0 } });
        const d = x.documentos.find((y) => y.ruta === rel(p.ruta));
        if (d) d.titulo = p.titulo; else x.documentos.push({ ruta: rel(p.ruta), titulo: p.titulo, tipo: p.tipo });
      }
      if (!pr.elementosQuitados) for (const el of pr.elementos) {
        const { estado, ...limpio } = el; void estado;
        const k = x.elementos.findIndex((y) => y.id === el.id);
        if (k >= 0) x.elementos[k] = { ...x.elementos[k], ...limpio }; else x.elementos.push(limpio);
      }
      if (!escritas.length && (pr.elementosQuitados || !pr.elementos.length)) { E.propuestas = null; E.panel = "proyecto"; toast("No había nada que guardar"); return api.pintar(); }
      conGlosario(x);
      const g = escribir(glosarioRuta(), M.glosario(x, E.idioma));
      if (g !== undefined) escritas.push(glosarioRuta());
      const mensaje = pr.tarea === "inicial" ? tr("Documentación inicial") : pr.tarea === "flujo" ? Tp("Documenté «{x}»", { x: (pj.ultimoEnvio?.datos?.pedido || "").slice(0, 80) }) : pr.tarea === "revisar" ? tr("Puse al día la documentación con los cambios del código") : pr.tarea === "incorporar" ? Tp("Información incorporada con {ia}", { ia: nombreIA() }) : Tp("Actualicé la documentación: {x}", { x: (pj.ultimoEnvio?.datos?.pedido || "").slice(0, 80) });
      E.proyecto = { ...(E.proyecto || { docs: docsDir(), git: { hay: !!E.encontrado?.git?.hay }, cambios: null,
        vinculado: !!E.vinculo, ubicacion: E.vinculo?.ubicacion || "", codigo: E.vinculo?.codigo || "" }), esquema: x };
      guardarYVersion(x, mensaje, escritas);
      E.propuestas = null; E.encontrado = null; E.panel = "proyecto";
      pj.ultimo = null;  // deshacer un cambio anterior ya no tiene sentido: pasaría por encima de esto
      toast(cuenta(escritas.length, "Guardé 1 archivo en una versión", "Guardé {n} archivos en una sola versión"), true);
      api.pintar();
    }

    // ───────────── Cambiar un elemento en todas partes ─────────────
    function previaCambio() {
      const c = pj.dialogo;
      const { docs } = docsProyecto();
      return M.cambiarElemento(docs, c.el, c.cambio);
    }
    function aplicarCambio() {
      const c = pj.dialogo, archivos = previaCambio().filter((a) => a.despues !== a.antes);
      const x = clon(esquema()), k = x.elementos.findIndex((e) => e.id === c.el.id);
      let mensaje = "";
      if (c.cambio.tipo === "renombrar") { x.elementos[k].nombre = c.cambio.nombre; mensaje = Tp("Renombré «{a}» a «{b}» en toda la documentación", { a: c.el.nombre, b: c.cambio.nombre }); }
      else if (c.cambio.tipo === "describir") { if (c.cambio.descripcion) x.elementos[k].descripcion = c.cambio.descripcion; else delete x.elementos[k].descripcion; mensaje = Tp("Cambié la descripción de «{a}»", { a: c.el.nombre }); }
      else if (c.cambio.tipo === "quitar") { x.elementos.splice(k, 1); mensaje = Tp("Quité «{a}» de la documentación", { a: c.el.nombre }); }
      const antes = {}, escritas = [];
      for (const a of archivos) { const v = escribir(a.ruta, a.despues); if (v !== undefined) { antes[a.ruta] = v; escritas.push(a.ruta); } }
      conGlosario(x);
      const g = glosarioRuta(), ga = E.docs[g]?.texto, gv = escribir(g, M.glosario(x, E.idioma));
      if (gv !== undefined) { antes[g] = gv; escritas.push(g); } else if (ga == null && !E.docs[g]) antes[g] = null;
      pj.ultimo = { mensaje, antes, esquemaAntes: esquema(), puede: Object.values(antes).every((v) => v != null) };
      E.proyecto.esquema = x;
      if (c.cambio.tipo === "quitar") pj.elemento = null;
      pj.dialogo = null;
      guardarYVersion(x, mensaje, escritas);
      toast(cuenta(escritas.length, "Listo: cambié 1 archivo en una versión", "Listo: cambié {n} archivos en una sola versión"), true);
      api.pintar();
    }
    /** Vuelve todo a como estaba antes del último cambio (también es una versión, así nada se pierde). */
    function deshacerUltimo() {
      const u = pj.ultimo;
      if (!u || !u.puede) return;
      const escritas = [];
      for (const [ruta, texto] of Object.entries(u.antes)) if (escribir(ruta, texto) !== undefined) escritas.push(ruta);
      E.proyecto.esquema = u.esquemaAntes;
      pj.ultimo = null;
      guardarYVersion(clon(u.esquemaAntes), Tp("Deshice: {x}", { x: u.mensaje }), escritas);
      toast("Volví a como estaba");
      api.pintar();
    }

    // ───────────── Respuestas de bin/proyecto.py ─────────────
    function respuesta(r) {
      switch (r.orden) {
        case "abrir": {
          if (!r.ok) { if (r.error) toast(r.error); return; }
          if (Array.isArray(r.recientes)) E.recientes = listaProyectos(r.recientes);
          // Es la carpeta del código de un proyecto con su documentación aparte: se abre esa.
          if (r.vinculado_en != null) { pj.pedido = true; host.enviar("abrirProyecto", { indice: r.vinculado_en }); return; }
          if (r.error) toast(r.error);
          E.vinculo = r.vinculado ? { ubicacion: r.ubicacion || "", codigo: r.codigo || "" } : null;
          E.tipoProyecto = r.tipo || null;
          if (Array.isArray(r.esperan)) pj.esperan = r.esperan;
          if (r.existe) {
            E.proyecto = { docs: r.docs, esquema: r.esquema, git: r.git || { hay: false }, cambios: r.cambios || null, pendiente: !!r.pendiente,
              vinculado: !!r.vinculado, ubicacion: r.ubicacion || "", codigo: r.codigo || "", tipo: r.tipo || r.esquema?.tipo || "software", historias: Array.isArray(r.historias) ? r.historias : [], sola: !!r.sola, wiki: !!r.wiki };
            E.encontrado = null;
            cargarDocs();
            if (pj.pedido) { pj.pedido = false; E.panel = "proyecto"; }
          } else if (r.vinculado) {
            // Recién vinculado: falta escribir la documentación. Se muestra lo que Esquema encontró en el código.
            E.proyecto = null; pj.pedido = false; E.panel = "proyecto"; E.encontrado = { cargando: true, docs: "" }; enviar("leer");
          } else {
            E.proyecto = null;
            // «Agregar proyecto»: la documentación va aparte, en ~/Esquema, vinculada a esta carpeta. Antes se mira qué hay
            // (el árbol): una carpeta de escritos propone, ya elegido, el tipo Libro.
            if (pj.pedido) { pj.pedido = false; pj.decidirTipo = true; if (E.codigoArbol) recibirArbol({ ok: true, ...E.codigoArbol.respuesta }); }
          }
          if (!E.codigoArbol) enviar("arbol");
          if (!pj.trabajo && !pj.esperando && !pj.pidioTrabajo) { pj.pidioTrabajo = true; enviar("trabajo"); }
          if (vinculado() && pj.despues) { const x = pj.despues; pj.despues = null; pedirIA(x.tarea, x.datos); }
          if (vinculado() && pj.agregarPendiente) { const x = pj.agregarPendiente; pj.agregarPendiente = null; empezarAgregar(x); }
          return api.pintar();
        }
        case "codigo":
          E.codigoDocs = r.ok ? { nombre: r.nombre, ubicacion: r.ubicacion, archivos: (r.archivos || []).slice().sort((a, b) => a.ruta.localeCompare(b.ruta)) } : { archivos: [] };
          return api.pintar();
        case "arbol": return recibirArbol(r);
        case "documentar": case "trabajo": case "detener": case "quitar": case "agregar": case "responder": case "continuar": case "historia_cierre": case "estudiar": case "incongruencias": return respuestaTrabajo(r);
        case "detectar": return alDetectar(r);
        case "crear": {
          const d = pj.dialogo;
          if (!r.ok) { if (d?.tipo === "nuevo-proyecto") { d.paso = d.det ? "detectado" : "carpeta"; toast(r.error || "No pude crear el proyecto"); } else toast(r.error || "No pude crear el proyecto"); return api.pintar(); }
          pj.dialogo = null;
          if (Array.isArray(r.recientes)) E.recientes = listaProyectos(r.recientes);
          toast(Tp("El libro quedó en {x}", { x: r.ubicacion }), true);
          pj.pedido = true; pj.irAPreguntas = true; host.enviar("abrirProyecto", { indice: r.indice }); return;
        }
        case "borrar": {
          if (!r.ok) { toast(r.error || "No pude borrarlo"); return api.pintar(); }
          sacarArchivo(completa(r.ruta));
          for (const x of r.cambiados || []) { const ruta = completa(x); if (E.docs[ruta]) { E.docs[ruta].estado = "cargando"; host.enviar("abrirArchivo", { ruta }); } }
          toast(Tp("Borré «{x}»", { x: r.titulo || r.ruta }), true, { texto: tr("Deshacer"), f: () => enviar("recuperar", { id: r.id, idioma: E.idioma }) });
          enviar("abrir"); if (!vinculado()) enviar("arbol");
          return api.pintar();
        }
        case "recuperar": {
          if (!r.ok) { toast(r.error || "No pude recuperarlo"); return api.pintar(); }
          const ruta = completa(r.ruta);
          if (!E.archivos.some((a) => a.ruta === ruta) && /\.(md|mmd)$/.test(ruta)) { E.archivos.push({ ruta }); E.archivos.sort(api.porRuta); }
          for (const x of r.cambiados || []) { const c = completa(x); if (E.docs[c]) { E.docs[c].estado = "cargando"; host.enviar("abrirArchivo", { ruta: c }); } }
          toast("Lo recuperé"); enviar("abrir");
          return api.pintar();
        }
        case "historia_estado": {
          if (!r.ok) { toast(r.error || "No pude cambiar el estado"); enviar("abrir"); return api.pintar(); }
          const l = E.proyecto?.historias || [], k = l.findIndex((x) => x.ruta === r.historia.ruta);
          if (k >= 0) l[k] = r.historia; else l.push(r.historia);
          const ruta = completa(r.historia.ruta);
          if (E.docs[ruta]) { E.docs[ruta].estado = "cargando"; host.enviar("abrirArchivo", { ruta }); }
          toast(Tp("Ahora está «{x}»", { x: tr(NOMBRE_ESTADO[r.historia.estado]) }), true);
          return api.pintar();
        }
        case "wiki_preparar": {
          const d = pj.dialogo;
          if (!d || d.tipo !== "wiki") return;
          if (!r.ok) { Object.assign(d, { cargando: false, error: r.error, falta_url: !!r.falta_url, no_existe: !!r.no_existe, web: r.web || "", primera: !!r.falta_url && !d.intento }); return api.pintar(); }
          if (E.proyecto) E.proyecto.wiki = true;
          Object.assign(d, { cargando: false, error: null, falta_url: false, url: r.url, web: r.web, paginas: (r.paginas || []).map((x) => ({ ...x, elegida: true })) });
          return api.pintar();
        }
        case "wiki_publicar": {
          const d = pj.dialogo;
          if (!r.ok) { if (d?.tipo === "wiki") { d.publicando = false; d.error = r.error; } else toast(r.error); return api.pintar(); }
          pj.dialogo = null;
          const n = (r.escritas || []).length + (r.quitadas || []).length;
          toast(r.sin_cambios ? tr("La wiki ya estaba al día") : n === 1 ? tr("Publiqué 1 página en la wiki") : Tp("Publiqué {n} páginas en la wiki", { n }), true, r.web ? { texto: tr("Ver la wiki"), f: () => host.enviar("abrirEnlace", { url: r.web }) } : null);
          return api.pintar();
        }
        case "codigo_leer": return window.Esquema.archivoAbierto({ ...r, ruta: CODIGO + r.ruta });
        case "codigo_guardar": return window.Esquema.archivoGuardado({ ...r, ruta: CODIGO + r.ruta });
        case "vincular":
        case "mover": {
          if (!r.ok) { pj.despues = null; pj.agregarPendiente = null; toast(r.error || "No pude preparar la carpeta de documentación"); return api.pintar(); }
          if (Array.isArray(r.recientes)) E.recientes = listaProyectos(r.recientes);
          if (r.orden === "mover") toast(Tp("Tu documentación quedó en {x}. La copia dentro del repo sigue ahí: bórrala cuando quieras.", { x: r.ubicacion }), true);
          else toast(Tp("La documentación de este proyecto va a vivir en {x}", { x: r.ubicacion }), true);
          pj.pedido = true; host.enviar("abrirProyecto", { indice: r.indice }); return;
        }
        case "destinos": {
          const d = pj.dialogo;
          if (!d || d.tipo !== "pasar") return;
          if (!r.ok) { d.cargando = false; d.error = r.error; return api.pintar(); }
          d.cargando = false; d.codigo = r.codigo || "";
          for (const f of d.filas) {
            const s = r.estados?.[f.destino];
            if (!s) continue;
            f.valido = s.valido !== false; f.existe = !!s.existe; f.antes = s.texto ?? null;
            f.igual = f.existe && f.antes === (E.docs[completa(f.ruta)]?.texto ?? null);
            if (!f.revisado) { f.elegido = f.valido && !f.igual && !f.existe; f.revisado = true; }
          }
          return api.pintar();
        }
        case "pasar": {
          if (!r.ok) { toast(r.error || "No pude pasar los archivos"); return api.pintar(); }
          pj.dialogo = null;
          const n = (r.escritos || []).length, s = (r.saltados || []).length;
          toast(s ? Tp("Pasé {n} archivos a {x}; {s} quedaron igual (ya existían o la ruta no servía)", { n, x: r.codigo, s }) : cuenta(n, "Pasé 1 archivo al proyecto", "Pasé {n} archivos al proyecto"), true);
          if (n) enviar("arbol");  // el lateral muestra lo que quedó en el código
          return api.pintar();
        }
        case "leer":
          if (!r.ok) { E.encontrado = null; E.panel = null; toast(r.error || "No pude leer el proyecto"); return api.pintar(); }
          E.encontrado = r.encontrado;
          cargarDocs();
          return api.pintar();
        case "preparar": {
          const d = pj.dialogo;
          if (!d || d.tipo !== "envio") return;
          if (!r.ok) { d.cargando = false; d.error = r.error; return api.pintar(); }
          Object.assign(d, { cargando: false, piezas: r.piezas || [], rechazados: r.rechazados || [], bytes: r.bytes || 0, aFondo: r.a_fondo || null });
          // Revisión a fondo: activada de partida cuando la IA sabe leer la carpeta (se puede desmarcar).
          if (d.aFondo && d.fondo === undefined) d.fondo = !!d.aFondo.puede;
          return api.pintar();
        }
        case "generar": {
          if (!pj.generando) return;  // se canceló con «Cancelar» (nunca con Escape)
          const g = pj.generando;
          pj.generando = null;
          if (g.oculto && r.ok) toast(Tp("{ia} respondió: revisa lo que propone", { ia: nombreIA() }), true);
          if (!r.ok) { pj.dialogo = { tipo: "error", texto: r.error || tr("Tu IA no respondió.") }; return api.pintar(); }
          if (r.pide?.length && !r.propuestas?.length) {
            pj.dialogo = { tipo: "pedir", tarea: g.tarea, datos: g.datos, rutas: r.pide, elegidas: r.pide.slice(), nota: r.nota || "" };
            return api.pintar();
          }
          E.propuestas = armarPropuestas(r);
          E.propuestas.datos = g.datos;
          E.panel = "propuestas";
          return api.pintar();
        }
        case "guardar":
          if (!r.ok) { pj.espera = null; toast(r.error || "No pude guardar esquema.json"); return api.pintar(); }
          if (E.proyecto && r.esquema) E.proyecto.esquema = r.esquema;
          if (Array.isArray(r.recientes)) E.recientes = listaProyectos(r.recientes);
          if (pj.espera) { pj.espera.esquema = true; revisarEspera(); }
          return api.pintar();
        case "version":
          if (!r.ok) { toast(r.error || "No pude guardar la versión"); return api.pintar(); }
          if (E.proyecto) { E.proyecto.pendiente = false; if (r.modo === "git" && !r.sin_cambios) E.proyecto.cambios = null; }
          toast(r.sin_cambios ? "No hay cambios desde la última versión" : "Guardé la versión");
          if (!r.sin_cambios && vinculado()) pj.ofrecerPasar = true;
          if (!r.sin_cambios && ofrece("acciones", "wiki") && E.proyecto?.wiki) pj.ofrecerWiki = true;
          if (pj.versiones) cargarVersiones();
          return api.pintar();
        case "versiones": {
          const v = pj.versiones;
          if (!v) return;
          if (!r.ok) { v.cargando = false; v.error = r.error; return api.pintar(); }
          Object.assign(v, { cargando: false, lista: r.lista || [], modo: r.modo, pendiente: !!r.pendiente });
          if (E.proyecto) E.proyecto.pendiente = !!r.pendiente;
          if (v.sel && !v.lista.some((x) => x.id === v.sel)) v.sel = null;
          return api.pintar();
        }
        case "ver": {
          const v = pj.versiones;
          if (!v) return;
          if (!r.ok) { toast(r.error || "No encontré esa versión"); return; }
          v.archivos[r.id] = r.archivos || {};
          return api.pintar();
        }
        case "restaurar": {
          if (!r.ok) { toast(r.error || "No pude restaurar esa versión"); return api.pintar(); }
          // Se vuelven a leer los documentos que cambiaron (la app también avisa si alguno estaba abierto) y el esquema.
          for (const x of r.escritos || []) {
            const ruta = completa(x);
            if (!/\.(md|mmd)$/i.test(ruta)) continue;
            if (!E.archivos.some((a) => a.ruta === ruta)) { E.archivos.push({ ruta }); E.archivos.sort(api.porRuta); }
            if (E.docs[ruta]) E.docs[ruta].estado = "cargando";
            else E.docs[ruta] = { texto: null, guardado: null, estado: "cargando", pila: [], futuro: [] };
            host.enviar("abrirArchivo", { ruta });
          }
          pj.ultimo = null;
          const v = pj.versiones, ver = v?.lista?.find((x) => x.id === v.sel);
          pj.trasRestaurar = Tp("Restauré la versión del {f}", { f: ver ? fecha(ver.fecha) : "" });
          enviar("abrir");
          if (v) { v.archivos = {}; v.sel = null; }
          if (r.sobran?.length) toast(Tp("Listo. Estos archivos no estaban en esa versión y los dejé: {x}", { x: r.sobran.join(", ") }), true);
          else toast("Restauré esa versión");
          enviar("version", { mensaje: pj.trasRestaurar }); pj.trasRestaurar = null;
          return api.pintar();
        }
      }
    }
    function cargarVersiones() {
      pj.versiones = { ...(pj.versiones || {}), cargando: true, archivos: {}, sel: pj.versiones?.sel || null, contra: pj.versiones?.contra || "actual" };
      enviar("versiones");
      if (pj.versiones.sel) { enviar("ver", { id: pj.versiones.sel }); enviar("ver", { id: pj.versiones.contra }); }
    }


    // ───────────── Trabajos largos: documentar por etapas, en segundo plano (bin/documentar.py + bin/trabajos.py) ─────────────
    // El trabajo deja todo en disco a medida que avanza; aquí solo se muestra. Escape o tocar fuera no lo cancelan: solo «Detener».
    const TAREAS_TRABAJO = ["inicial", "completar"];
    const corriendo = () => pj.esperando || ["corriendo"].includes(pj.trabajo?.estado);
    function empezarTrabajo(d) {
      pj.esperando = true; pj.trabajo = null; pj.ficha = null;
      E.panel = "proyecto"; E.sel = null; E.propuestas = null;
      enviar("documentar", { tarea: d.tarea, idioma: E.idioma, ...(d.datos?.pedido ? { pedido: d.datos.pedido } : {}), a_fondo: !!(d.aFondo && d.fondo) });
      relojTrabajo();
      api.pintar();
    }
    /** Lo que llega de la app mientras corre un trabajo: {eventos: [{t: "estado", trabajo} | {t: "lee", ruta, n} | {t: "busca", patron}]}. */
    function progreso(r) {
      let cambioEstado = false;
      for (const ev of Array.isArray(r.eventos) ? r.eventos : []) {
        if (!ev || typeof ev !== "object") continue;
        if (ev.t === "estado" && ev.trabajo && typeof ev.trabajo === "object") {
          if (!esDeEsteProyecto(ev.trabajo)) continue;
          const antes = pj.trabajo;
          pj.trabajo = ev.trabajo; pj.esperando = false; pj.ultimoEvento = Date.now(); cambioEstado = cambioEstado || 1;
          // Cambió la etapa o el estado: la pantalla entera (el lateral abre «Código» mientras la IA lee). Si no, solo la tarjeta.
          if (!antes || antes.etapa !== ev.trabajo.etapa || antes.estado !== ev.trabajo.estado) cambioEstado = 2;
          alAvanzar(antes, ev.trabajo);
        } else if (ev.t === "lee" && typeof ev.ruta === "string" && pj.trabajo && ev.id === pj.trabajo.id) {
          pj.ultimoEvento = Date.now();
          const anterior = pj.trabajo.leyendo;
          pj.trabajo.leyendo = ev.ruta; pj.trabajo.leidos = Number(ev.n) || pj.trabajo.leidos;
          if (E.codigoArbol) E.codigoArbol.lecturas[ev.ruta] = { f: new Date().toISOString().slice(0, 19) };
          marcarLectura(anterior, ev.ruta);
        } else if (ev.t === "busca" && pj.trabajo && ev.id === pj.trabajo.id) {
          pj.ultimoEvento = Date.now(); pj.trabajo.buscando = String(ev.patron || "").slice(0, 120); pintarTrabajo();
        }
      }
      if (cambioEstado === 2) api.pintar(); else if (cambioEstado) pintarTrabajo(true);
    }
    const esDeEsteProyecto = (t) => !t.carpeta || !E.carpeta?.ruta || t.carpeta === E.carpeta.ruta;
    /** Un documento quedó listo: la documentación se vuelve a leer (esquema.json y la lista) para que aparezca en el lateral. */
    function alAvanzar(antes, ahora) {
      const listos = (t) => (t?.items || []).filter((i) => i.estado === "listo").length;
      if (listos(ahora) > listos(antes)) { enviar("abrir"); }
    }
    /** La respuesta final de un trabajo (o la de detener, reintentar, quitar, responder…). */
    function respuestaTrabajo(r) {
      if (r.trabajo && !esDeEsteProyecto(r.trabajo)) return;
      if (Array.isArray(r.esperan)) pj.esperan = r.esperan;
      if (r.orden === "trabajo") {
        if (r.propuestas && pj.pidePropuestas === r.trabajo?.id) { pj.pidePropuestas = null; return abrirPropuestasDe(r.trabajo.id, r.propuestas); }
        // Al abrir el proyecto, o preguntando mientras corre sin eventos (la app se cerró y se volvió a abrir con el trabajo andando).
        const antes = pj.trabajo;
        pj.trabajo = r.trabajo || null;
        if (antes && pj.trabajo && antes.id === pj.trabajo.id) {
          alAvanzar(antes, pj.trabajo);
          if (antes.estado === "corriendo" && pj.trabajo.estado !== "corriendo") { enviar("abrir"); enviar("arbol"); }
        }
        if (pj.trabajo && corriendo()) relojTrabajo();
        if (pj.trabajo?.estado === "esperando" && pj.irAPreguntas) { pj.irAPreguntas = false; return abrirPreguntas(pj.trabajo.id); }
        return api.pintar();
      }
      if (!r.ok) {
        pj.esperando = false;
        if (r.trabajo) pj.trabajo = r.trabajo;
        toast(r.error || "No pude terminar");
        return api.pintar();
      }
      if (r.orden === "detener") { pj.trabajo = r.trabajo; toast("Deteniendo… lo que ya está escrito se queda"); return pintarTrabajo(true); }
      const antes = pj.trabajo;
      pj.trabajo = r.trabajo; pj.esperando = false;
      if (r.orden === "quitar") {
        toast(r.borrado ? "Quité ese documento; queda en la historia de versiones" : "Volví ese documento a como estaba");
        enviar("abrir"); enviar("arbol"); return api.pintar();
      }
      if (r.encolado) { toast("Lo vuelvo a escribir apenas pueda"); return pintarTrabajo(true); }
      const t = r.trabajo || {};
      if (r.propuestas) pj.propuestasDe = { ...(pj.propuestasDe || {}), [t.id]: r.propuestas };
      // Pregunta algo: se ve al tiro si la persona está mirando el proyecto; si no, un aviso con «Responder».
      if (t.estado === "esperando") {
        pj.esperan = [t, ...(pj.esperan || []).filter((x) => x.id !== t.id)];
        enviar("abrir");
        if ((pj.irAPreguntas || E.panel === "proyecto") && !E.sel) { pj.irAPreguntas = false; return abrirPreguntas(t.id); }
        toast(Tp("«{x}» tiene preguntas para ti", { x: t.titulo || "" }), true, { texto: tr("Responder"), f: () => abrirPreguntas(t.id) });
        return api.pintar();
      }
      pj.irAPreguntas = false;
      if (t.tipo === "incorporar" && t.estado === "listo" && r.propuestas) {
        enviar("abrir");
        if (E.panel === "proyecto" && !E.sel && !hayDialogo()) return abrirPropuestasDe(t.id, r.propuestas);
        toast(Tp("Tu IA ordenó «{x}»", { x: t.titulo || "" }), true, { texto: tr("Revisar"), f: () => abrirPropuestasDe(t.id, r.propuestas) });
        return api.pintar();
      }
      // Terminó (listo, con fallas, detenido o error): se vuelve a leer todo y se avisa.
      const n = (t.items || []).filter((i) => i.estado === "listo").length;
      if (antes?.estado !== t.estado || r.orden !== "documentar") {
        if (t.tipo === "documentar" || !t.tipo) {
          if (t.estado === "listo") toast(cuenta(n, "Listo: escribí 1 documento y guardé una versión", "Listo: escribí {n} documentos y guardé una versión"), true);
          else if (t.estado === "con-fallas") toast("Terminé, pero algunos documentos fallaron: puedes reintentarlos");
          else if (t.estado === "detenido") toast("Detenido. Lo que ya estaba escrito se quedó");
          else if (t.estado === "error") toast(errorTrabajo(t) || tr("No pude documentar el proyecto"), true);
        } else if (t.estado === "error") toast(errorTrabajo(t) || tr("No pude terminar"), true);
        else if (["listo", "con-fallas", "detenido"].includes(t.estado)) { const div = document.createElement("div"); div.innerHTML = tituloTrabajo(t); toast(div.textContent, true); }
      }
      enviar("abrir"); enviar("arbol");
      api.pintar();
    }
    /** Mientras corre: el tiempo cada segundo y, si no llegan eventos (la app se abrió de nuevo con el trabajo corriendo), preguntar. */
    function relojTrabajo() {
      if (pj.reloj) return;
      pj.reloj = setInterval(() => {
        if (!corriendo()) { clearInterval(pj.reloj); pj.reloj = null; return; }
        const el = document.querySelector("[data-t-reloj]");
        if (el && pj.trabajo) el.textContent = transcurrido(pj.trabajo.inicio);
        if (pj.trabajo && !pj.esperando && Date.now() - pj.ultimoEvento > 6000 && HOST_REAL()) { pj.ultimoEvento = Date.now(); enviar("trabajo", { id: pj.trabajo.id }); }
      }, 1000);
    }
    const HOST_REAL = () => !!(window.webkit?.messageHandlers?.esquema || window.esquemaEscritorio);
    function transcurrido(inicio, fin) {
      const s = Math.max(0, Math.round(((fin ? new Date(fin) : new Date()) - new Date(inicio)) / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    const NOMBRE_ETAPA = { inventario: "Inventario", explorar: "Leyendo el código", escribir: "Escribiendo", cerrar: "Guardando", contexto: "Mirando el proyecto",
      analizar: "Entendiendo", ordenar: "Ordenando la información", plan: "Armando el plan", preguntas: "Tus respuestas", guardar: "Guardando", cambios: "Buscando los cambios", comparar: "Comparando", importar: "Partiendo en capítulos",
      preguntar: "Tus respuestas", resumir: "Resumiendo", preparar: "Preparando", leer: "Leyendo" };
    const NOMBRE_TIPO_PROYECTO = { app: "App o servicio", biblioteca: "Biblioteca", sitio: "Sitio", monorepo: "Proyecto con varias partes", escritos: "Documentos y escritos", mezcla: "Mezcla de código y documentos" };
    /** El título de la tarjeta según el tipo de trabajo y su estado (frases completas, para que se traduzcan bien). */
    function tituloTrabajo(t) {
      const ia = t.ia || nombreIA(), x = t.titulo || "", n = t.preguntas?.length || 0, h = t.hallazgos;
      const f = {
        documentar: { corriendo: ["{ia} está documentando el proyecto"], listo: ["La documentación está lista"], "con-fallas": ["Terminé, pero algunos documentos fallaron"], detenido: ["Detuviste la documentación"], interrumpido: ["La documentación quedó a medias"], error: ["No pude terminar la documentación"] },
        historia: { corriendo: ["{ia} está entendiendo «{x}»"], esperando: [n === 1 ? "«{x}» espera 1 respuesta" : "«{x}» espera {n} respuestas"], listo: ["«{x}» quedó documentada"], interrumpido: ["«{x}» quedó a medias"], detenido: ["Detuviste «{x}»"], error: ["No pude entender «{x}»"] },
        historia_cierre: { corriendo: ["{ia} está comparando lo pedido con lo que cambió"], listo: ["Quedó documentado cómo quedó «{x}»"], interrumpido: ["«{x}» quedó a medias"], detenido: ["Detuviste «{x}»"], error: ["No pude documentar cómo quedó «{x}»"] },
        libro: { corriendo: ["{ia} está resumiendo «{x}»"], esperando: ["Antes de resumir «{x}», dos preguntas"], listo: ["«{x}» está listo para leer y estudiar"], "con-fallas": ["Resumí «{x}», pero algunos capítulos fallaron"], interrumpido: ["«{x}» quedó a medias"], detenido: ["Detuviste «{x}»"], error: ["No pude resumir «{x}»"] },
        estudio: { corriendo: ["{ia} está armando el material de estudio"], listo: ["El material de estudio está listo"], "con-fallas": ["Armé el material, pero algunos capítulos fallaron"], interrumpido: ["El material de estudio quedó a medias"], detenido: ["Detuviste el material de estudio"], error: ["No pude armar el material de estudio"] },
        incongruencias: { corriendo: ["{ia} está revisando las incongruencias"], listo: [h === 0 ? "No encontré incongruencias" : h === 1 ? "Encontré 1 incongruencia" : "Encontré {h} incongruencias"], interrumpido: ["La revisión quedó a medias"], detenido: ["Detuviste la revisión"], error: ["No pude terminar la revisión"] },
        incorporar: { corriendo: ["{ia} está ordenando «{x}»"], esperando: [n === 1 ? "«{x}» espera 1 respuesta" : "«{x}» espera {n} respuestas"], listo: ["{ia} ordenó «{x}»: revisa los cambios antes de guardarlos"], interrumpido: ["«{x}» quedó a medias"], detenido: ["Detuviste «{x}»"], error: ["No pude ordenar «{x}»"] },
        documento: { corriendo: ["{ia} está leyendo «{x}»"], listo: ["«{x}» quedó en la documentación"], interrumpido: ["«{x}» quedó a medias"], detenido: ["Detuviste «{x}»"], error: ["No pude leer «{x}»"] },
      }[t.tipo || "documentar"] || {};
      const k = (f[t.estado] || f.error || ["{x}"])[0];
      return frase(k, { ia, x, n, h });
    }
    /** La tarjeta del trabajo: etapas, lo que lee ahora, cuántos lleva, el tiempo, y cada documento con su estado. */
    function trabajoHTML() {
      const t = pj.trabajo;
      if (!t && pj.esperando) return `<section class="p-tarjeta p-trabajo" aria-live="polite" data-sin-traducir><h3>${T("Trabajando…")}</h3><div class="esperando"><span class="pz-giro"></span> ${T("Preparando el trabajo…")}</div></section>`;
      if (!t || t.descartado || (t.visto && !corriendo() && t.estado !== "esperando")) return "";
      const vivo = t.estado === "corriendo", items = t.items || [], espera = t.estado === "esperando";
      const listos = items.filter((i) => i.estado === "listo").length, total = items.filter((i) => i.estado !== "quitado").length;
      const hechas = new Set(t.hechas || []);
      const etapa = (e) => {
        const actual = (vivo || espera) && t.etapa === e, ok = hechas.has(e) && !actual;
        const nombre = (e === "escribir" || e === "resumir") && total ? T(e === "resumir" ? "Resumiendo {n} de {x}" : "Escribiendo {n} de {x}", { n: Math.min(listos + (actual ? 1 : 0), total) || listos, x: total }) : T(NOMBRE_ETAPA[e] || e);
        return `<li class="${ok ? "hecha" : actual ? "actual" : ""}">${ok ? ic("listo") : actual && vivo ? `<span class="pz-giro chico"></span>` : actual ? ic("pregunta") : `<span class="punto"></span>`}<span>${nombre}</span></li>`;
      };
      const fila = (i) => {
        const est = { cola: ["En cola", ""], escribiendo: [i.tipo === "lectura" ? "Leyendo…" : "Escribiendo…", "giro"], listo: [i.tipo === "lectura" ? "Leído" : i.nuevo === false ? "Actualizado" : "Nuevo", "listo"], fallo: ["Falló", "mal"], quitado: ["Quitado", ""] }[i.estado] || ["", ""];
        const acc = i.estado === "fallo" && !vivo ? `<button class="pz-boton" data-t-reintentar="${esc(i.ruta)}">${ic("rehacer")} ${T("Reintentar")}</button>`
          : i.estado === "fallo" && t.tipo === "documentar" ? `<button class="pz-boton" data-t-reintentar="${esc(i.ruta)}">${ic("rehacer")} ${T("Reintentar")}</button>`
          : i.estado === "listo" && !vivo && !espera && i.quitable !== false ? `<button class="pz-boton pz-plano" data-t-quitar="${esc(i.ruta)}">${ic("deshacer")} ${T("Quitar este cambio")}</button>` : "";
        // Un documento listo se abre tocando su nombre (sin un botón «Abrir» más por fila).
        const nombre = i.estado === "listo" && i.tipo !== "lectura" ? `<button class="t-abrir" data-abrir="${esc(completa(i.ruta))}" data-sin-traducir>${esc(i.titulo || i.ruta)}</button>` : `<b data-sin-traducir>${esc(i.titulo || i.ruta)}</b>`;
        return `<li class="t-doc ${esc(i.estado)}"><span class="t-ic">${est[1] === "giro" ? `<span class="pz-giro chico"></span>` : est[1] === "listo" ? ic("listo") : est[1] === "mal" ? ic("cerrar") : ic(i.tipo === "lectura" ? "libro" : "doc")}</span>
          <span class="p-txt">${nombre}<small>${esc(i.ruta)} · ${T(est[0])}</small>${i.error ? `<small class="pz-error-texto">${errorTrabajoHTML(i)}</small>` : ""}</span>
          ${acc ? `<span class="t-acc">${acc}</span>` : ""}</li>`;
      };
      const lee = vivo && t.etapa === "explorar" || (vivo && t.leyendo);
      // Muchos ítems (un libro largo): se ven los que importan ahora y un resumen del resto.
      const muestra = items.length > 14 ? items.filter((i) => i.estado !== "cola" && i.estado !== "listo").concat(items.filter((i) => i.estado === "listo").slice(-4)) : items;
      const ocultos = items.length - muestra.length;
      const otroTipo = { libro: "un libro", documento: "un documento", historia: "una historia de usuario" }[t.tipo_ia];
      // Todo el texto de la tarjeta ya va traducido (T, frase): traducirDOM no la vuelve a tocar.
      // («esperando» como clase chocaría con .esperando, la del giro de espera.)
      return `<section class="p-tarjeta p-trabajo ${esc(espera ? "espera" : t.estado)}" aria-live="polite" data-sin-traducir>
        <div class="t-cab"><h3 class="t-titulo">${tituloTrabajo(t)}</h3><span class="t-tiempo" data-t-reloj>${espera ? "" : transcurrido(t.inicio, vivo ? null : t.fin)}</span></div>
        <ol class="t-etapas">${(t.etapas || []).map(etapa).join("")}</ol>
        ${t.archivos != null && t.tipo === "documentar" ? `<p class="p-ayuda t-datos">${frase("{n} archivos · {t}", { n: t.archivos, t: tr(NOMBRE_TIPO_PROYECTO[t.tipo_proyecto] || "") })}${t.partes ? " " + frase("· {n} partes", { n: t.partes }) : ""}
          <span data-t-leidos data-sin-traducir>${t.leidos ? " · " + T("{n} archivos leídos", { n: t.leidos }) : ""}</span></p>` : ""}
        ${t.tipo === "historia_cierre" && t.commits != null ? `<p class="p-ayuda">${t.commits ? frase("Miré {c} commits y {a} archivos que cambiaron.", { c: t.commits, a: t.archivos || 0 }) : T("No encontré commits desde que la historia pasó a «En desarrollo»: lo documenté con lo que hay.")}</p>` : ""}
        ${lee && (t.leyendo || t.buscando) ? `<p class="t-lee"><span class="pz-giro chico"></span><span class="t-lee-txt">${t.leyendo ? `${T("Leyendo")} <code data-t-leyendo data-sin-traducir>${esc(t.leyendo)}</code>` : `${T("Buscando")} <code data-sin-traducir>${esc(t.buscando)}</code>`}</span></p>` : ""}
        ${t.aviso === "plan" ? `<p class="p-ayuda">${frase("{ia} no devolvió un plan que sirva: uso uno armado con lo que encontré en el código.", { ia: t.ia || nombreIA() })}</p>` : ""}
        ${t.aviso === "tope" ? `<p class="p-ayuda">${T("Ya hubo tres rondas de preguntas: lo que falta quedó en «Preguntas abiertas» del documento.")}</p>` : ""}
        ${otroTipo ? `<p class="p-aviso">${frase("{ia} cree que esto es {x}. Si tiene razón, bórralo y agrégalo de nuevo con ese tipo.", { ia: t.ia || nombreIA(), x: tr(otroTipo) })}</p>` : ""}
        ${t.error ? `<p class="pz-error-texto" data-sin-traducir>${errorTrabajoHTML(t)}</p>` : ""}
        ${muestra.length ? `<ul class="t-docs">${muestra.map(fila).join("")}</ul>${ocultos ? `<p class="p-ayuda">${frase("Y {n} más ({l} listos).", { n: ocultos, l: listos })}</p>` : ""}` : ""}
        <div class="p-acciones izq">
          ${espera ? `<button class="pz-boton pz-principal" data-p-responder="${esc(t.id)}">${ic("pregunta")} ${n2(t)}</button><button class="pz-boton pz-plano" data-t-descartar="${esc(t.id)}">${T("No responder ahora")}</button>` : ""}
          ${t.propuestas && !vivo && !pj.propuestasVistas?.[t.id] ? `<button class="pz-boton pz-principal" data-t-propuestas="${esc(t.id)}">${ic("lapiz")} ${t.propuestas === 1 ? T("Revisar 1 cambio que propone") : T("Revisar {n} cambios que propone", { n: t.propuestas })}</button>` : ""}
          ${vivo ? `<button class="pz-boton" data-accion="p-detener">${ic("detener")} ${T("Detener")}</button><span class="p-ayuda t-sigue">${T("Puedes seguir usando Esquema: lo que termina queda guardado al tiro.")}</span>` : ""}
          ${["interrumpido", "detenido", "error"].includes(t.estado) && items.some((i) => i.estado !== "listo" && i.estado !== "quitado") ? `<button class="pz-boton pz-principal" data-accion="p-seguir">${ic("rehacer")} ${T("Seguir donde quedó")}</button>` : ""}
          ${!vivo && !espera ? `<button class="pz-boton pz-plano" data-accion="p-trabajo-visto">${T("Listo")}</button>` : ""}
        </div></section>`;
    }
    const n2 = (t) => ((t.preguntas?.length || 0) === 1 ? T("Responder 1 pregunta") : T("Responder {n} preguntas", { n: t.preguntas?.length || 0 }));
    /** Repintar solo la tarjeta y los indicadores (no toda la pantalla: la persona puede estar escribiendo). */
    function pintarTrabajo(todo = false) {
      const el = document.querySelector(".p-trabajo");
      const panelVisible = E.panel === "proyecto" || (!E.panel && sinDocumentacion() && !E.sel);
      if (todo && (!el && panelVisible || !corriendo())) return api.pintar();
      if (el) { const n = document.createElement("div"); n.innerHTML = trabajoHTML(); const nuevo = n.firstElementChild; if (nuevo) { api.traducirDOM(nuevo); el.replaceWith(nuevo); } else el.remove(); }
      const ind = document.querySelector(".lateral [data-p-docs]");
      if (ind) ind.classList.toggle("trabajando", corriendo());
    }
    /** La IA empezó a leer `ahora` (y dejó `antes`): solo se tocan esas filas del árbol y los contadores. */
    function marcarLectura(antes, ahora) {
      const fila = (r) => r && document.querySelector(`.lateral [data-c="${CSS.escape(r)}"]`);
      const a = fila(antes); if (a) { a.classList.remove("leyendo"); a.classList.add("leido"); }
      document.querySelectorAll(".lateral .c-carpeta.leyendo").forEach((x) => x.classList.remove("leyendo"));
      const b = fila(ahora); if (b) b.classList.add("leyendo", "leido");
      for (let r = carpetaDe(ahora); r; r = carpetaDe(r)) { const c = document.querySelector(`.lateral [data-arbol="${CSS.escape("#c:" + r)}"]`); if (c) c.classList.add("leyendo"); }
      const l = document.querySelector("[data-t-leyendo]"); if (l) l.textContent = ahora; else pintarTrabajo();
      const n = document.querySelector("[data-t-leidos]"); if (n) n.textContent = " · " + Tp("{n} archivos leídos", { n: pj.trabajo?.leidos || 0 });
      const h = document.querySelector("[data-c-resumen]"); if (h) h.textContent = resumenCodigo();
    }
    const carpetaDe = (r) => { const i = String(r || "").lastIndexOf("/"); return i > 0 ? r.slice(0, i) : ""; };

    // ───────────── «Código»: todos los archivos del repo, sin abrirlos (los .md/.mmd sí se abren) ─────────────
    const NOMBRE_CLASE = { c: "Código", f: "Configuración", d: "Documento", i: "Imagen", t: "Datos", m: "Audio o video", s: "Secreto (tu IA no lo lee)", o: "Otro" };
    const ICONO_CLASE = { c: "codigo", f: "config", d: "doc", i: "imagen", t: "datos", m: "archivo", s: "candado", o: "archivo" };
    /** Lo que manda `arbol`: {archivos: [[ruta, tamaño, clase]], perfil, lecturas}. El árbol se arma una vez (carpetas primero). */
    function recibirArbol(r) {
      if (!r.ok) { E.codigoArbol = { base: [], archivos: [], raiz: nodoVacio(""), lecturas: {}, error: r.error || "" }; return api.pintar(); }
      const base = (Array.isArray(r.archivos) ? r.archivos : []).filter((a) => Array.isArray(a) && typeof a[0] === "string" && typeof a[2] === "string");
      E.codigoArbol = { nombre: r.nombre || "", base, perfil: r.perfil || null, lecturas: r.lecturas && typeof r.lecturas === "object" ? r.lecturas : {}, omitidos: r.omitidos || 0, sinCodigo: !!r.sin_codigo, respuesta: r };
      armarArbol();
      if (pj.decidirTipo) {
        pj.decidirTipo = false;
        if (r.perfil?.tipo === "escritos" && tipos().some((t) => t.id === "libro")) pj.dialogo = { tipo: "nuevo-proyecto", t: "libro", paso: "carpeta", carpeta: E.carpeta?.nombre || "", titulo: E.carpeta?.nombre || "", archivos: [], texto: "", leyendo: 0 };
        else enviar("vincular");
      }
      api.pintar();
    }
    /** El árbol (carpetas primero, por nombre). En una carpeta sin vínculo, los .md/.mmd nuevos (creados en Esquema o afuera) se suman
     *  al tiro, sin esperar a otro `arbol`. Se arma solo cuando cambian los archivos, nunca en cada evento de progreso. */
    function armarArbol() {
      const ca = E.codigoArbol;
      if (!ca?.base) return;
      const ya = new Set(ca.base.map((a) => a[0]));
      const extra = vinculado() ? [] : E.archivos.filter((a) => !ya.has(a.ruta) && !(E.proyecto && docsDir() && a.ruta.startsWith(docsDir() + "/"))).map((a) => [a.ruta, a.tamano || 0, "d"]);
      const archivos = extra.length ? ca.base.concat(extra) : ca.base;
      const raiz = nodoVacio("");
      for (const a of archivos) {
        let n = raiz; n.total++;
        const partes = a[0].split("/");
        for (const p of partes.slice(0, -1)) {
          if (!n.carpetas.has(p)) n.carpetas.set(p, nodoVacio(n.ruta ? n.ruta + "/" + p : p));
          n = n.carpetas.get(p); n.total++;
        }
        n.archivos.push(a);
      }
      const ordenar = (n) => { n.carpetas = new Map([...n.carpetas].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))); n.archivos.sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" })); n.carpetas.forEach(ordenar); };
      ordenar(raiz);
      ca.archivos = archivos; ca.raiz = raiz;
    }
    const nodoVacio = (ruta) => ({ ruta, carpetas: new Map(), archivos: [], total: 0 });
    const leidos = () => Object.keys(E.codigoArbol?.lecturas || {}).length;
    const resumenCodigo = () => Tp("{n} archivos · {l} leídos por tu IA", { n: E.codigoArbol?.archivos.length || 0, l: leidos() });
    /** Cómo se abre un archivo del código: los .md/.mmd en el editor (con @codigo/ si el código es otra carpeta); el resto, su ficha. */
    function abrirDeCodigo(ruta) {
      if (!/\.(md|mmd)$/i.test(ruta)) return null;
      if (vinculado()) return CODIGO + ruta;
      return E.archivos.some((a) => a.ruta === ruta) ? ruta : null;
    }
    function codigoAbierta(ruta) {
      const k = "#c:" + ruta;
      if (k in E.abiertas) return E.abiertas[k];
      const sel = E.sel ? (esCodigo(E.sel) ? E.sel.slice(CODIGO.length) : E.sel) : "";
      const dentro = (r) => r && (r === ruta || r.startsWith(ruta + "/"));
      return (E.codigoArbol?.archivos.length || 0) <= 20 || dentro(carpetaDe(sel)) || dentro(carpetaDe(pj.ficha || ""));
    }
    function codigoHTML(n, nivel) {
      const lec = E.codigoArbol.lecturas, t = pj.trabajo, leyendo = corriendo() ? t?.leyendo || "" : "";
      const marca = (ruta) => {
        const x = lec[ruta];
        if (leyendo === ruta) return `<i class="c-marca" title="${esc(tr("Tu IA lo está leyendo"))}" data-sin-traducir></i>`;
        if (!x) return `<i class="c-marca"></i>`;
        return `<i class="c-marca" title="${esc(x.c ? tr("Cambió desde que tu IA lo leyó") : Tp("Tu IA lo leyó el {f}", { f: fecha(x.f) }))}" data-sin-traducir></i>`;
      };
      const archivo = ([ruta, , clase]) => {
        const abre = abrirDeCodigo(ruta), x = lec[ruta];
        const cls = ["archivo", "c-archivo", x ? "leido" : "", x?.c ? "cambio" : "", leyendo === ruta ? "leyendo" : ""].filter(Boolean).join(" ");
        const actual = abre ? abre === E.sel && !E.panel : pj.ficha === ruta && E.panel === "ficha";
        return `<button class="${cls}" style="--n:${nivel}" data-c="${esc(ruta)}" ${abre ? `data-abrir="${esc(abre)}"` : `data-p-ficha="${esc(ruta)}"`} aria-current="${actual}" title="${esc(ruta)}" data-sin-traducir>${ic(ICONO_CLASE[clase] || "archivo")}<span data-sin-traducir>${esc(ruta.slice(ruta.lastIndexOf("/") + 1))}</span>${marca(ruta)}</button>`;
      };
      const enLectura = (c) => leyendo && leyendo.startsWith(c.ruta + "/");
      const carpeta = ([nombre, c]) => {
        const ab = codigoAbierta(c.ruta);
        return `<button class="archivo carpeta-arbol c-carpeta${enLectura(c) ? " leyendo" : ""}" style="--n:${nivel}" data-arbol="${esc("#c:" + c.ruta)}" aria-expanded="${ab}" title="${esc(c.ruta)}" data-sin-traducir>${ic(ab ? "abajo" : "derecha")}${ic("carpeta")}<span>${esc(nombre)}</span><small data-sin-traducir>${c.total}</small></button>${ab ? `<div role="group">${codigoHTML(c, nivel + 1)}</div>` : ""}`;
      };
      return [...n.carpetas].map(carpeta).join("") + n.archivos.map(archivo).join("");
    }

    /** La ficha de un archivo del código: qué es, si la IA lo leyó, dónde se nombra. Sin mostrar su contenido. */
    function fichaCodigoHTML() {
      const ruta = pj.ficha, a = E.codigoArbol?.archivos.find((x) => x[0] === ruta);
      if (!a) return `<p class="p-ayuda">Ese archivo ya no está en el código.</p>`;
      const lec = E.codigoArbol.lecturas[ruta], x = esquema();
      const els = (x?.elementos || []).filter((el) => (el.codigo || []).some((c) => c === ruta || ruta.startsWith(c.replace(/\/$/, "") + "/")));
      const { docs } = docsProyecto();
      const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
      const docsQue = Object.entries(docs).filter(([r, t]) => !r.endsWith(M.GLOSARIO) && (t.includes(ruta) || els.some((el) => M.usosElemento({ [r]: t }, el).length))).map(([r]) => r);
      const fila = (etq, val) => `<div class="p-fila"><span class="p-etq">${etq}</span><span class="p-val">${val}</span></div>`;
      return `<div class="p-cab"><span class="p-icono">${ic(ICONO_CLASE[a[2]] || "archivo")}</span><div><h2 data-sin-traducir>${esc(nombre)}</h2><p><code data-sin-traducir>${esc(ruta)}</code></p></div></div>
        <section class="p-tarjeta" data-sin-traducir>
          ${fila(T("Tipo"), T(NOMBRE_CLASE[a[2]] || "Otro"))}
          ${fila(T("Tamaño"), `<span data-sin-traducir>${esc(tamano(a[1]))}</span>`)}
          ${fila(T("Tu IA"), lec ? `<span data-sin-traducir>${esc(Tp("Lo leyó el {f}", { f: fecha(lec.f) }))}${lec.c ? " · " + esc(tr("cambió después")) : ""}</span>` : a[2] === "s" ? T("No lo lee nunca: parece un secreto") : T("Todavía no lo lee"))}
        </section>
        <section class="p-tarjeta"><h3>Dónde aparece</h3>
          ${els.length ? `<div class="p-chips">${els.map((el) => `<button class="p-chip" data-p-elemento="${esc(el.id)}" data-sin-traducir>${ic("elemento")} ${esc(el.nombre)}</button>`).join("")}</div>` : ""}
          ${docsQue.length ? `<div class="p-lista">${docsQue.map((r) => `<button class="p-doc" data-abrir="${esc(r)}"><span class="p-tipo">${ic("doc")}</span><span class="p-txt"><b data-sin-traducir>${esc(tituloDoc(r))}</b><small data-sin-traducir>${esc(rel(r))}</small></span></button>`).join("")}</div>` : ""}
          ${!els.length && !docsQue.length ? `<p class="p-ayuda" data-sin-traducir>${x ? T("Ningún documento ni elemento lo nombra todavía.") : T("Cuando haya documentación, aquí verás qué documentos y elementos lo nombran.")}</p>` : ""}
        </section>
        <p class="p-ayuda">Esquema no muestra el código: lo lee tu IA para escribir la documentación.</p>`;
    }

    // ───────────── Barra lateral ─────────────
    // ───────────── Lateral: una carpeta por proyecto, con su código y su documentación ─────────────
    /** Los .md/.mmd del repo del código de un proyecto vinculado se abren con este prefijo (no están en la carpeta abierta). */
    const CODIGO = "@codigo/";
    const esCodigo = (r) => typeof r === "string" && r.startsWith(CODIGO);
    /** Toda carpeta abierta se muestra como proyecto: su código y su documentación (aunque todavía no tenga). */
    const esProyecto = () => !!E.carpeta;
    const sinDocumentacion = () => !E.proyecto && !vinculado();
    /** Si un archivo abierto está en la carpeta «Código» del lateral. */
    const esDeCodigo = (r) => !!r && (esCodigo(r) || (!vinculado() && (sinDocumentacion() || !r.startsWith(docsDir() + "/"))));
    function leerCodigo(ruta) { enviar("codigo_leer", { ruta: ruta.slice(CODIGO.length) }); }
    function guardarCodigo(ruta, texto) { enviar("codigo_guardar", { ruta: ruta.slice(CODIGO.length), texto }); }
    /** La documentación como árbol (el código va aparte: codigoHTML, con todos sus archivos). */
    function partesProyecto(arbolDe) {
      if (vinculado() && !docsDir()) return { docs: arbolDe(E.archivos), nDocs: E.archivos.length };
      if (sinDocumentacion()) return { docs: arbolDe([]), nDocs: 0 };
      const d = docsDir(), enDocs = E.archivos.filter((a) => a.ruta.startsWith(d + "/"));
      let raiz = arbolDe(enDocs);
      for (const parte of d.split("/")) raiz = raiz.carpetas.get(parte) || { ruta: d, carpetas: new Map(), archivos: [], total: 0 };
      return { docs: raiz, nDocs: enDocs.length };
    }
    /** El lateral de los proyectos. Lo global arriba («Proyectos» con «Agregar proyecto»); lo del proyecto abierto, adentro de su
     *  carpeta: primero «Nuevo en <proyecto>» (todo lo que se crea va a ese proyecto), después su código y su documentación. */
    function lateralHTML({ arbolDe, arbolHTML, arbolAbierta }) {
      if (!esProyecto()) return "";
      const x = esquema(), p = E.panel, partes = partesProyecto(arbolDe), t = tipoActual();
      const nombre = nombreProyecto();
      const carpeta = (clave, nivel, icono, etiqueta, extra = "", attrs = `data-arbol="${clave}"`) => {
        const ab = arbolAbierta(clave);
        return [ab, `<button class="archivo carpeta-arbol" style="--n:${nivel}" ${attrs} aria-expanded="${ab}">${ic(ab ? "abajo" : "derecha")}${ic(icono)}${etiqueta}${extra}</button>`];
      };
      const [abP, filaP] = carpeta("#p", 0, t.icono || "proyecto", `<span data-sin-traducir>${esc(nombre)}</span>`);
      let html = filaP;
      if (abP) {
        const nuevoEn = `<button class="archivo nuevo-en" style="--n:1" data-accion="p-nuevo-en" title="${esc(Tp("Nuevo en {x}", { x: nombre }))}" data-sin-traducir>${ic("mas")}<span>${T("Nuevo en {x}", { x: nombre })}</span></button>`;
        const conCodigo = t.fuente === "carpeta";
        const firma = E.archivos.length + ":" + (E.archivos[E.archivos.length - 1]?.ruta || "");
        if (conCodigo && E.codigoArbol && E.codigoArbol.firma !== firma) { E.codigoArbol.firma = firma; armarArbol(); }
        const ca = E.codigoArbol;
        let codigo = "";
        if (conCodigo && !ca?.sinCodigo) {
          const [abC, filaC] = carpeta("#codigo", 1, "carpeta", `<span>Código</span>`, `<small data-sin-traducir>${ca ? ca.archivos.length : "…"}</small>`);
          const cuerpoC = !ca ? `<p class="vacio" style="--n:2"><span class="pz-giro chico"></span> Leyendo la carpeta…</p>`
            : !ca.archivos.length ? `<p class="vacio" style="--n:2">${ca.error ? esc(tr(ca.error)) : "La carpeta del código está vacía."}</p>`
            : `<p class="c-resumen" style="--n:2" data-c-resumen data-sin-traducir>${esc(resumenCodigo())}</p>${codigoHTML(ca.raiz, 2)}`;
          codigo = filaC + (abC ? `<div role="group">${cuerpoC}</div>` : "");
        }
        const espera = (pj.esperan || []).length;
        const marca = corriendo() ? `<span class="trabajando-punto" title="${esc(tr("Tu IA está trabajando en la documentación"))}" data-sin-traducir></span>${partes.nDocs ? `<small data-sin-traducir>${partes.nDocs}</small>` : ""}`
          : espera ? `<span class="espera-punto" title="${esc(espera === 1 ? tr("Hay 1 pregunta esperando tu respuesta") : Tp("Hay {n} trabajos esperando tus respuestas", { n: espera }))}" data-sin-traducir>?</span>`
          : `<small data-sin-traducir>${partes.nDocs || esc(tr("vacía"))}</small>`;
        const [abD, filaD] = carpeta("#docs", 1, "carpeta", `<span>Documentación</span>`, marca, `data-p-docs aria-current="${p === "proyecto"}"`);
        const extras = E.proyecto ? `<button class="archivo" style="--n:2" data-p="elementos" aria-current="${p === "elementos"}">${ic("elemento")}<span data-sin-traducir>${esc(nombreSeccion("elementos", "Elementos"))}</span><small data-sin-traducir>${x.elementos.length}</small></button>
          <button class="archivo" style="--n:2" data-p="versiones" aria-current="${p === "versiones"}">${ic("historia")}<span data-sin-traducir>${esc(nombreSeccion("versiones", "Versiones"))}</span>${E.proyecto.pendiente ? `<small>Sin guardar</small>` : ""}</button>` : "";
        const docs = partes.nDocs ? arbolHTML(partes.docs, 2) : conCodigo ? `<button class="archivo" style="--n:2" data-accion="p-documentar">${ic("chispa")}<span>Hacer la documentación completa</span></button>` : "";
        html += `<div role="group">${nuevoEn}${codigo}${filaD}${abD ? `<div role="group">${extras}${docs}</div>` : ""}</div>`;
      }
      const actual = E.carpeta?.ruta;
      const otros = E.recientes.map((r, i) => [r, i]).filter(([r]) => r.ruta !== actual);
      return `${cabProyectosHTML()}<div class="arbol">${html}${otros.map(filaReciente).join("")}</div>`;
    }
    /** «Proyectos» con la acción global al lado: agregar otro proyecto (de cualquier tipo). */
    const cabProyectosHTML = () => `<div class="lat-cab"><h3>Proyectos</h3><button class="pz-boton pz-plano chico" data-accion="p-agregar" title="Agregar proyecto">${ic("mas")}<span>Agregar</span></button></div>`;
    const filaReciente = ([p, i]) => `<button class="archivo carpeta-arbol" data-p-reciente="${i}" title="${esc(p.ubicacion || p.ruta)}" data-sin-traducir>${ic("derecha")}${ic(tipoDe(p.tipo).icono || "proyecto")}<span>${esc(p.nombre)}</span></button>`;
    function recientesHTML() {
      if (esProyecto()) return "";
      const actual = E.carpeta?.ruta;
      const otros = E.recientes.map((p, i) => [p, i]).filter(([p]) => p.ruta !== actual);
      return `${cabProyectosHTML()}<div class="arbol">${otros.map(filaReciente).join("")}</div>
        ${otros.length ? "" : `<button class="pz-boton pz-principal lat-agregar" data-accion="p-agregar">${ic("mas")} Agregar proyecto</button>`}`;
    }
    /** El punto de color de una historia de usuario en el lateral (por entender, lista, en desarrollo, terminada). */
    function marcaArchivo(ruta) {
      if (!E.proyecto) return "";
      const h = (E.proyecto.historias || []).find((x) => completa(x.ruta) === ruta);
      if (!h) return "";
      const espera = (pj.esperan || []).some((t) => t.ruta === h.ruta);
      return `<i class="hu-punto${espera ? " espera" : ""}" data-estado="${esc(h.estado)}" title="${esc(tr(NOMBRE_ESTADO[h.estado] || "") + (espera ? " · " + tr("Espera tus respuestas") : ""))}" data-sin-traducir></i>`;
    }
    const NOMBRE_ESTADO = { "por-entender": "Por entender", lista: "Lista para desarrollar", "en-desarrollo": "En desarrollo", terminada: "Terminada" };

    /** «Lo que falta» en la documentación: lo que una documentación completa trae y esta todavía no. */
    function loQueFalta() {
      const x = esquema(), t = tipoActual(), tipos = x.documentos.map((d) => d.tipo), { docs, listos } = docsProyecto();
      const flujos = tipos.filter((k) => k === "flujo").length;
      const sinUso = listos ? x.elementos.filter((el) => !M.usosElemento(docs, el).length) : [];
      const c = E.proyecto.cambios, perfil = E.codigoArbol?.perfil, tipo = perfil?.tipo || "app";
      const rutas = x.documentos.map((d) => d.ruta);
      const partes = (perfil?.componentes || []).filter((k) => k.ruta && k.tipo !== "modulo");
      const porTipo = {
        escritos: [{ ok: rutas.includes("estructura.md") || tipos.includes("arquitectura"), titulo: "Cómo se organiza", falta: "cómo se organiza el material (estructura.md): sus secciones y qué hay en cada una" }],
        biblioteca: [{ ok: rutas.some((r) => /^(uso|como-se-usa|ejemplos)\.md$/.test(r)), titulo: "Cómo se usa", falta: "cómo se usa (uso.md): instalarla y usarla, con ejemplos" }],
        sitio: [{ ok: rutas.some((r) => /^(contenido|paginas|publicar)\.md$/.test(r)), titulo: "Páginas y publicación", falta: "las páginas del sitio y cómo se publica (contenido.md)" }],
        monorepo: [{ ok: partes.length < 2 || rutas.filter((r) => r.startsWith("componentes/")).length >= Math.min(partes.length, 6), titulo: "Cada parte", n: rutas.filter((r) => r.startsWith("componentes/")).length,
          falta: "un documento por cada parte del proyecto (componentes/<nombre>.md)", lista: partes.map((k) => k.ruta + "/").join(", ") }],
      }[tipo] || [];
      const capitulos = rutas.filter((r) => r.startsWith("capitulos/")).length;
      // Cada revisión tiene un id (el de tipos/<tipo>.json → «falta»): un tipo de proyecto elige cuáles le importan.
      const todos = {
        vision: [{ ok: tipos.includes("vision"), titulo: "Visión general", falta: "la visión general (README.md): qué es el proyecto y para quién" }],
        arquitectura: tipo === "escritos" ? [] : [{ ok: tipos.includes("arquitectura"), titulo: "Arquitectura", falta: "la arquitectura (arquitectura.md): sus componentes y cómo se conectan, con un diagrama" }],
        "segun-codigo": porTipo,
        flujos: tipo === "escritos" || tipo === "biblioteca" ? [] : [{ ok: flujos > 0, titulo: "Flujos principales", n: flujos, falta: "los flujos principales (un archivo por flujo en flujos/), cada uno con su diagrama" }],
        elementos: [{ ok: x.elementos.length > 0, titulo: t.fuente === "texto" ? "Personajes y conceptos" : "Elementos", n: x.elementos.length, falta: "los elementos del proyecto (pantallas, botones, servicios, módulos…)" }],
        "elementos-usados": [{ ok: !sinUso.length, titulo: "Cada elemento aparece en un documento", n: sinUso.length, nombres: sinUso.map((e) => e.nombre), falta: "documentar los elementos que ningún documento nombra" }],
        "al-dia": [{ ok: !c?.n, titulo: "Al día con el código", n: c?.n || 0, falta: "poner al día lo que cambió en el código desde la última versión" }],
        capitulos: [{ ok: capitulos > 0, titulo: "Capítulos", n: capitulos }],
        resumenes: [{ ok: capitulos > 0 && !(pj.trabajo?.tipo === "libro" && pj.trabajo.items?.some((i) => i.estado !== "listo")), titulo: "Un resumen por capítulo", accion: "p-seguir-libro" }],
        "libro-readme": [{ ok: tipos.includes("libro"), titulo: "De qué trata y el mapa de ideas" }],
        estudio: [{ ok: rutas.some((r) => r.startsWith("estudio/")), titulo: "Material de estudio" }],
        incongruencias: [{ ok: tipos.includes("revision"), titulo: "Revisión de incongruencias" }],
      };
      return t.falta.flatMap((k) => todos[k] || []);
    }
    function faltaHTML() {
      const items = loQueFalta(), faltan = items.filter((i) => !i.ok), completar = faltan.some((i) => i.falta);
      const sinCuenta = ["Cada elemento aparece en un documento", "Al día con el código"];
      const fila = (i) => `<li class="${i.ok ? "hecho" : "pendiente"}">${ic(i.ok ? "listo" : "mas")}<span><b data-sin-traducir>${esc(tr(i.titulo))}</b>${i.n != null && (i.ok ? i.n && !sinCuenta.includes(i.titulo) : i.n) ? ` <small data-sin-traducir>${i.n}</small>` : ""}${i.nombres?.length ? `<small data-sin-traducir> · ${esc(i.nombres.slice(0, 4).join(", "))}${i.nombres.length > 4 ? "…" : ""}</small>` : ""}</span>${!i.ok && i.accion && !corriendo() ? `<button class="pz-boton pz-plano chico" data-accion="${i.accion}">Hacerlo</button>` : ""}</li>`;
      return `<section class="p-tarjeta p-falta">
        <h3>${tipoActual().fuente === "texto" ? (faltan.length ? (faltan.length === 1 ? frase("Le falta 1 cosa") : frase("Le faltan {n} cosas", { n: faltan.length })) : "Está completo") : faltan.length ? (faltan.length === 1 ? frase("Le falta 1 cosa a la documentación") : frase("Le faltan {n} cosas a la documentación", { n: faltan.length })) : "La documentación está completa"}</h3>
        <ul>${items.map(fila).join("")}</ul>
        ${completar ? `<div class="p-acciones izq"><button class="pz-boton pz-principal" data-accion="p-completar">${ic("chispa")} Completar lo que falta</button></div>` : !faltan.length && ofrece("acciones", "flujo") ? `<div class="p-acciones izq"><button class="pz-boton" data-accion="p-flujo">${ic("chispa")} Documentar otro flujo</button></div>` : ""}
      </section>`;
    }
    /** El pedido para «Completar lo que falta» (lo ve la persona en «Ver lo que se envía»). */
    function pedidoCompletar() {
      const faltan = loQueFalta().filter((i) => !i.ok && i.falta);
      return tr("Completa la documentación. Falta:") + "\n" + faltan.map((i) => "- " + tr(i.falta) + (i.lista ? ": " + i.lista : "") + (i.nombres?.length ? ": " + i.nombres.join(", ") : "")).join("\n");
    }
    function barraHTML() {
      const fijos = { propuestas: "Revisa lo que propone tu IA", preguntas: "Preguntas" };
      const n = nombreProyecto(), propio = E.panel === "elementos" ? nombreSeccion("elementos", "Elementos") : E.panel === "versiones" ? nombreSeccion("versiones", "Versiones") : n;
      return `<header class="barra">
        <button class="pz-boton pz-plano icono solo-movil" data-accion="abrir-lateral" aria-label="Archivos">${ic("menu")}</button>
        ${E.proyecto && E.panel !== "proyecto" && E.panel !== "propuestas" ? `<button class="pz-boton pz-plano solo-movil" data-p="proyecto" aria-label="Proyecto">${ic("volver")}</button>` : ""}
        <span class="titulo">${fijos[E.panel] || `<span data-sin-traducir>${esc(propio)}</span>`}</span><span class="espacio"></span>
        ${E.panel !== "propuestas" && E.panel !== "preguntas" ? `<button class="pz-boton pz-principal" data-accion="p-nuevo-en" aria-label="${esc(Tp("Nuevo en {x}", { x: n }))}" data-sin-traducir>${ic("mas")}<span class="solo-escritorio">${T("Nuevo en {x}", { x: n })}</span></button>` : ""}
      </header>`;
    }

    // ───────────── Paneles ─────────────
    function areaHTML() {
      if (E.panel === "ficha" && pj.ficha) return `<div class="p-panel">${fichaCodigoHTML()}</div>`;
      if (E.panel === "preguntas") return `<div class="p-panel">${preguntasHTML()}</div>`;
      if (E.panel === "propuestas" && E.propuestas) return `<div class="p-panel" data-sin-traducir>${propuestasHTML()}</div>`;
      if (E.panel === "versiones" && E.proyecto) return `<div class="p-panel">${versionesHTML()}</div>`;
      if (E.panel === "elementos" && E.proyecto) return `<div class="p-panel">${elementosHTML()}</div>`;
      if (E.proyecto) return `<div class="p-panel">${inicioHTML()}</div>`;
      // Documentando por primera vez (todavía no hay esquema.json): solo el trabajo, con lo que encontró arriba.
      if (pj.esperando || pj.trabajo && !pj.trabajo.visto) return `<div class="p-panel">${cabEncontrado()}${trabajoHTML()}</div>`;
      if (E.encontrado) return `<div class="p-panel">${encontradoHTML()}</div>`;
      return `<div class="vacio"><div class="esperando"><span class="pz-giro"></span> Leyendo el proyecto…</div></div>`;
    }

    /** «Lo que encontré»: lo que Esquema leyó del repo, sin IA. */
    function cabEncontrado() {
      const n = E.encontrado?.nombre || E.codigoArbol?.nombre || E.carpeta?.nombre || "";
      return `<div class="p-cab"><span class="p-icono">${ic("proyecto")}</span><div><h2 data-sin-traducir>${esc(n)}</h2>${frase("La documentación queda en {x}, aparte de tu código.", { x: E.vinculo?.ubicacion || E.proyecto?.ubicacion || "~/Esquema" }, "p")}</div></div>`;
    }
    function encontradoHTML() {
      const f = E.encontrado;
      if (f.cargando) return `<div class="esperando"><span class="pz-giro"></span> Leyendo el proyecto…</div>`;
      const fila = (titulo, html) => (html ? `<div class="p-fila"><span class="p-etq" data-sin-traducir>${esc(titulo)}</span><span class="p-val" data-sin-traducir>${html}</span></div>` : "");
      const g = f.git || {};
      const man = Object.entries(f.manifiestos || {}).map(([k, v]) => `<code>${esc(k)}</code>${v && v.name ? " " + esc(v.name) : ""}`).join(" · ");
      return `<div class="p-cab"><span class="p-icono">${ic("proyecto")}</span><div><h2 data-sin-traducir>${esc(f.nombre)}</h2><p>Esto es lo que encontré en el proyecto. Nada salió de tu computador.</p></div></div>
        <section class="p-tarjeta">
          ${fila(tr("README"), f.readme ? `<b>${esc(f.readme.titulo || f.readme.ruta)}</b>${f.readme.resumen ? `<br>${esc(f.readme.resumen)}` : ""}` : "")}
          ${fila(tr("Lenguajes"), (f.lenguajes || []).map(([l, n]) => `${esc(l)} <small>${n}</small>`).join(" · "))}
          ${fila(tr("Carpetas"), (f.carpetas || []).map(([c, n]) => `<code>${esc(c)}/</code> <small>${n}</small>`).join(" · "))}
          ${fila(tr("Guías"), (f.guias || []).map((x) => `<code>${esc(x)}</code>`).join(" · "))}
          ${fila(tr("Proyecto"), man)}
          ${fila(tr("Automatización"), (f.workflows || []).map((x) => `<code>${esc(x)}</code>`).join(" · "))}
          ${fila(tr("Git"), g.hay ? `${T("Rama {r} · {n} commits", { r: g.rama, n: g.total })}${g.tags?.length ? " · " + T("versiones: {x}", { x: g.tags.slice(0, 4).join(", ") }) : ""}` : T("No es un repositorio de git: las versiones serán copias en la carpeta de la documentación."))}
          ${fila(tr("Archivos"), T("{n} archivos leídos · {o} quedaron fuera (secretos, ignorados o demasiados)", { n: f.archivos, o: f.omitidos }))}
        </section>
        ${g.commits?.length ? `<section class="p-tarjeta"><h3>Últimos cambios</h3><ul class="p-commits" data-sin-traducir>${g.commits.slice(0, 6).map((c) => `<li><small>${esc(c.fecha)}</small> ${esc(c.mensaje)}</li>`).join("")}</ul></section>` : ""}
        ${E.vinculo ? `<section class="p-tarjeta">
          <h3>Dónde queda la documentación</h3>
          ${frase("Aparte de tu código, en {x}, con su propio historial de versiones. Después eliges qué pasar al proyecto.", { x: E.vinculo.ubicacion }, "p")}
        </section>` : `<section class="p-tarjeta">
          <label for="p-docs">Dónde guardo la documentación (dentro del proyecto)</label>
          <input type="text" id="p-docs" value="${esc(f.docs || "docs/esquema")}" data-sin-traducir spellcheck="false">
          <p class="p-ayuda">Markdown y diagramas que GitHub muestra tal cual, más esquema.json con los elementos. ${g.hay ? "Cada versión es un commit solo de esa carpeta." : ""}</p>
        </section>`}
        <div class="p-acciones"><button class="pz-boton pz-principal" data-accion="p-generar-inicial">${ic("chispa")} ${frase("Documentar con {ia}", { ia: nombreIA() })}</button></div>`;
    }

    function inicioHTML() {
      const x = esquema(), c = E.proyecto.cambios, u = pj.ultimo, { listos } = docsProyecto(), t = tipoActual();
      const rev = E.proyecto.revision;
      const donde = E.proyecto.vinculado ? E.proyecto.ubicacion + "/" : docsDir() + "/";
      const ofrecerWiki = pj.ofrecerWiki && ofrece("acciones", "wiki") && !pj.espera;
      return `<div class="p-cab"><span class="p-icono">${ic(t.icono || "proyecto")}</span><div><h2 data-sin-traducir>${esc(x.nombre)}</h2>${frase("{t} · {d} documentos · {e} elementos · en {c}", { t: textoDe(t.nombre), d: x.documentos.filter((d) => d.tipo !== "fuente").length, e: x.elementos.length, c: donde }, "p")}${E.proyecto.vinculado && E.proyecto.codigo ? frase("Código: {x}", { x: E.proyecto.codigo }, "p") : ""}</div></div>
        ${!E.proyecto.vinculado ? `<div class="p-aviso"><span>${frase("Esta documentación está dentro del repo ({x}). ¿La paso a una carpeta aparte en ~/Esquema? No borro nada del repo.", { x: docsDir() + "/" })}</span><button class="pz-boton" data-accion="p-mover">Moverla aparte</button></div>` : ""}
        ${E.proyecto.vinculado && pj.ofrecerPasar && !pj.espera && E.proyecto.codigo ? `<div class="p-aviso"><span>Guardé la versión. ¿Quieres llevar algo de esto al repo del proyecto?</span><button class="pz-boton" data-accion="p-pasar">Pasar al proyecto</button></div>` : ""}
        ${ofrecerWiki ? `<div class="p-aviso"><span>¿Actualizo también la wiki de GitHub con esta versión?</span><button class="pz-boton" data-accion="p-wiki">${ic("exportar")} Publicar en la wiki</button><button class="pz-boton pz-plano" data-accion="p-wiki-no">Ahora no</button></div>` : ""}
        ${esperanHTML()}
        ${(E.proyecto.historias || []).filter((h) => h.estado === "en-desarrollo" && h.commits && !corriendo()).map((h) => `<div class="p-aviso"><span>${h.commits === 1 ? frase("«{x}»: 1 commit la nombra. ¿Terminaste?", { x: h.id }) : frase("«{x}»: {n} commits la nombran. ¿Terminaste?", { x: h.id, n: h.commits })}</span><button class="pz-boton" data-p-cerrar-hu="${esc(h.ruta)}">${ic("listo")} Documentar cómo quedó</button></div>`).join("")}
        ${trabajoHTML()}
        ${x.documentos.length && !corriendo() ? faltaHTML() : ""}
        ${corriendo() ? "" : accionesHTML()}
        ${pj.espera ? `<div class="p-aviso"><span class="pz-giro"></span> Guardando la versión…</div>` : ""}
        ${pj.generando?.oculto ? `<div class="p-aviso"><span class="pz-giro"></span><span>${frase("{ia} está trabajando en tu pedido…", { ia: nombreIA() })}</span><button class="pz-boton pz-plano" data-accion="p-ver-generando">Ver</button></div>` : ""}
        ${u ? `<div class="p-aviso"><span data-sin-traducir>${esc(u.mensaje)}</span>${u.puede ? `<button class="pz-boton" data-accion="p-deshacer">${ic("deshacer")} Deshacer este cambio</button>` : ""}</div>` : ""}
        ${c?.n && !E.proyecto.cambiosVistos ? `<section class="p-tarjeta p-cambios">
          <h3>${frase("Cambió el proyecto desde tu última versión: {n} commits", { n: c.n })}</h3>
          <ul class="p-commits" data-sin-traducir>${c.commits.slice(0, 5).map((k) => `<li><small>${esc(k.fecha)}</small> ${esc(k.mensaje)}</li>`).join("")}</ul>
          ${rev ? revisionHTML(rev) : `<div class="p-acciones izq"><button class="pz-boton pz-principal" data-accion="p-revisar" ${listos ? "" : "disabled"}>Revisar qué documentos afecta</button><button class="pz-boton pz-plano" data-accion="p-cambios-vistos">Ya lo revisé</button></div>`}
        </section>` : ""}
        ${seccionesHTML()}
        <div class="p-acciones izq">
          ${E.proyecto.vinculado && E.proyecto.codigo ? `<button class="pz-boton" data-accion="p-pasar">${ic("exportar")} Pasar al proyecto</button>` : ""}
          ${ofrece("acciones", "wiki") ? `<button class="pz-boton" data-accion="p-wiki">${ic("github")} Publicar en la wiki</button>` : ""}
          ${ofrece("acciones", "documentar") && !corriendo() ? `<button class="pz-boton pz-plano" data-accion="p-documentar">${ic("proyecto")} Volver a documentar todo</button>` : ""}
          <button class="pz-boton" data-p="elementos">${ic("elemento")} <span data-sin-traducir>${esc(nombreSeccion("elementos", "Elementos"))}</span></button>
          <button class="pz-boton" data-p="versiones">${ic("historia")} <span data-sin-traducir>${esc(nombreSeccion("versiones", "Versiones"))}</span></button>
        </div>`;
    }
    /** Todos los documentos del proyecto (los de esquema.json y los que están en la carpeta), con su título y tipo. */
    function documentosDelProyecto() {
      const x = esquema(), meta = new Map((x?.documentos || []).map((d) => [d.ruta, d]));
      const rutas = new Set([...(x?.documentos || []).map((d) => d.ruta), ...rutasDocs().map(rel)]);
      rutas.delete(M.GLOSARIO);
      return [...rutas].map((r) => meta.get(r) || { ruta: r, titulo: r.split("/").pop().replace(/\.(md|mmd)$/, "").replace(/-/g, " "), tipo: "otro", suelto: true }).sort(ordenDocs);
    }
    /** El panel del proyecto por secciones, según su tipo: Visión y arquitectura · Componentes · Flujos · Historias · Documentos… */
    function seccionesHTML() {
      const t = tipoActual(), grupos = new Map();
      for (const d of documentosDelProyecto()) { const k = M.seccionDe(t, d) || "documentos"; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(d); }
      const historias = new Map((E.proyecto.historias || []).map((h) => [h.ruta, h]));
      const fila = (d) => {
        const h = historias.get(d.ruta), espera = (pj.esperan || []).find((x) => x.ruta === d.ruta);
        const abre = d.tipo !== "fuente" || /\.(md|mmd)$/.test(d.ruta);
        const icono = d.tipo === "fuente" ? "archivo" : d.tipo === "historia" ? "persona" : /\.mmd$/.test(d.ruta) ? "diagrama" : "doc";
        const estado = h ? `<span class="hu-estado"><i class="hu-punto" data-estado="${esc(h.estado)}"></i>${esc(tr(NOMBRE_ESTADO[h.estado]))}</span>` : "";
        const extra = espera ? `<span class="p-nuevo">${esc(espera.preguntas?.length === 1 ? tr("Espera 1 respuesta") : Tp("Espera {n} respuestas", { n: espera.preguntas?.length || 0 }))}</span>` : h?.commits ? `<span class="p-nuevo">${esc(h.commits === 1 ? tr("1 commit la nombra") : Tp("{n} commits la nombran", { n: h.commits }))}</span>` : esNuevo(d.ruta) ? `<span class="p-nuevo">${esc(tr("Nuevo"))}</span>` : "";
        const cuerpo = `<span class="p-tipo">${ic(icono)}</span><span class="p-txt"><b>${esc(d.titulo)}</b><small>${esc(d.ruta)}</small></span>${estado}${extra}`;
        return abre ? `<button class="p-doc" data-abrir="${esc(completa(d.ruta))}" data-sin-traducir>${cuerpo}</button>` : `<div class="p-doc fijo" data-sin-traducir title="${esc(tr("Es el original: Esquema no lo abre, pero queda en la carpeta y en el historial."))}">${cuerpo}</div>`;
      };
      const secs = t.secciones.filter((x) => !["elementos", "versiones"].includes(x.id) && grupos.get(x.id)?.length);
      if (!secs.length) return `<section class="p-tarjeta"><h3>Documentos</h3><p class="p-ayuda">Todavía no hay documentos.</p></section>`;
      return secs.map((x) => `<section class="p-tarjeta p-seccion"><h3 data-sin-traducir>${ic(x.icono || "doc")}<span>${esc(textoDe(x.nombre))}</span><small>${grupos.get(x.id).length}</small></h3>
        <div class="p-lista">${grupos.get(x.id).map(fila).join("")}</div></section>`).join("");
    }
    /** Lo que espera respuestas de la persona (preguntas de una historia o de un libro): una fila por trabajo. */
    function esperanHTML() {
      const l = (pj.esperan || []).filter((t) => !(pj.trabajo && pj.trabajo.id === t.id && !pj.trabajo.visto));
      if (!l.length) return "";
      return l.map((t) => `<div class="p-aviso p-espera"><span>${ic("pregunta")} ${(t.preguntas?.length || 0) === 1 ? frase("«{x}» espera 1 respuesta", { x: t.titulo || "" }) : frase("«{x}» espera {n} respuestas", { x: t.titulo || "", n: t.preguntas?.length || 0 })}</span><button class="pz-boton pz-principal" data-p-responder="${esc(t.id)}">Responder</button></div>`).join("");
    }
    /** Lo que se puede hacer con este proyecto (según su tipo): tarjetas grandes, como en el inicio de una carpeta. */
    function accionesHTML() {
      const t = tipoActual(), a = (k) => t.acciones.includes(k);
      const tarjeta = (accion, icono, titulo, texto) => `<button class="tarjeta-inicio" data-accion="${accion}"><span class="ti-icono">${ic(icono)}</span><span class="ti-txt"><b>${titulo}</b><small>${texto}</small></span></button>`;
      const l = [];
      if (a("historia")) l.push(tarjeta("p-historia", "persona", "Historia de usuario", "Pégala y tu IA te ayuda a entenderla: te pregunta lo que falta y la documenta. No programa."));
      if (a("estudiar")) l.push(tarjeta("p-estudiar", "tarjetas", "Material de estudio", "Por capítulo: un esquema, preguntas de repaso con respuesta y tarjetas."));
      if (a("incongruencias")) l.push(tarjeta("p-incongruencias", "chispa", "Revisar incongruencias", "Contradicciones, fechas o nombres que no calzan y cabos sueltos, con la cita y dónde está."));
      if (a("incorporar")) l.push(tarjeta("p-incorporar", "bandeja", "Agregar información", "Pega notas, un correo, lo que salió de una reunión… Tu IA lo ordena: crea lo nuevo, completa lo que existe y corrige lo que cambió."));
      if (a("agregar") && !a("incorporar")) l.push(tarjeta("p-agregar-algo", "archivo", "Agregar archivo o texto", t.fuente === "carpeta" ? "Un acta, una especificación, un artículo o un libro: Esquema detecta qué es y lo ordena." : "Notas, apuntes o textos de referencia: tu IA los resume y los deja en Notas."));
      if (a("diagrama")) l.push(tarjeta("crear-diagrama", "diagrama", "Crear diagrama", t.fuente === "carpeta" ? "Pídele a tu IA «el flujo de…», «la secuencia de…» o «la arquitectura de…». Puede leer tu código." : "Pídele a tu IA un mapa, una línea de tiempo o un esquema."));
      if (a("flujo")) l.push(tarjeta("p-flujo", "flecha", "Documentar un flujo", "Un flujo explicado paso a paso, con su diagrama. Tú apruebas qué archivos lee."));
      return l.length ? `<div class="acciones-inicio">${l.slice(0, 4).join("")}</div>` : "";
    }
    /** Lo que escribió el último trabajo (hasta que la persona lo marca como visto). */
    const esNuevo = (ruta) => !!pj.trabajo && !pj.trabajo.visto && (pj.trabajo.items || []).some((i) => i.ruta === ruta && i.estado === "listo");
    /** Visión arriba, arquitectura, lo de la raíz, componentes, flujos, secciones, diagramas y el glosario al final (igual que
     *  documentar.orden_doc en Python, que ordena esquema.json). */
    const ORDEN_TIPO = { vision: 0, libro: 0, arquitectura: 1, otro: 2, revision: 2, flujo: 3, glosario: 9 }, ORDEN_CARPETA = { "": 0, componentes: 1, flujos: 2, secciones: 3, diagramas: 4, capitulos: 5, historias: 6, estudio: 7, documentos: 8, fuentes: 10 };
    function ordenDocs(a, b) {
      const k = (d) => { const c = d.ruta.includes("/") ? d.ruta.split("/")[0] : ""; return [d.tipo === "glosario" ? 99 : c ? 5 : ORDEN_TIPO[d.tipo] ?? 2, ORDEN_CARPETA[c] ?? 6]; };
      const [a1, a2] = k(a), [b1, b2] = k(b);
      return a1 - b1 || a2 - b2 || a.ruta.localeCompare(b.ruta);
    }
    function revisionHTML(rev) {
      if (!rev.documentos.length) return `<p class="p-ayuda">Ningún documento nombra lo que tocaron esos commits.</p><div class="p-acciones izq"><button class="pz-boton" data-accion="p-cambios-vistos">Listo</button></div>`;
      return `<p class="p-ayuda">${rev.documentos.length === 1 ? frase("Puede estar desactualizado 1 documento, por:") : frase("Pueden estar desactualizados {n} documentos, por:", { n: rev.documentos.length })} <span data-sin-traducir>${rev.elementos.map((e) => esc(e.nombre)).join(", ")}</span></p>
        <ul class="p-commits" data-sin-traducir>${rev.documentos.map((r) => `<li>${esc(tituloDoc(r))} <small>${esc(rel(r))}</small></li>`).join("")}</ul>
        <div class="p-acciones izq"><button class="pz-boton pz-principal" data-accion="p-revisar-ia">${ic("chispa")} ${frase("Pedir a {ia} que los ponga al día", { ia: nombreIA() })}</button><button class="pz-boton pz-plano" data-accion="p-cambios-vistos">Ya lo revisé</button></div>`;
    }

    // Propuestas de la IA: una tarjeta por archivo, con «Quitar este cambio».
    function propuestasHTML() {
      const pr = E.propuestas, n = pr.lista.filter((p) => !p.quitada && !(p.confirmar && !p.confirmada)).length + (pr.elementos.length && !pr.elementosQuitados ? 1 : 0);
      if (pr.tarea === "incorporar") return incorporarHTML(pr, n);
      const tarjeta = (p, i) => `<article class="p-prop ${p.quitada ? "quitada" : ""}">
          <div class="p-prop-cab"><span class="p-tipo">${ic(p.existe ? "lapiz" : "doc")}</span><span class="p-txt"><b>${esc(p.titulo)}</b><small>${esc(rel(p.ruta))} · ${T(p.existe ? "Cambia" : "Nuevo")}</small></span>
            <span class="p-prop-acc">${p.error ? "" : `<button class="pz-boton pz-plano" data-p-ver="${i}">${T(p.ver ? "Ocultar" : "Ver")}</button><button class="pz-boton" data-p-quitar="${i}">${p.quitada ? ic("mas") + " " + T("Volver a agregar") : ic("deshacer") + " " + T("Quitar este cambio")}</button>`}</span></div>
          ${p.error ? `<p class="pz-error-texto">${T("Un diagrama tiene un error (línea {n}: {x}). No lo agrego; pídelo de nuevo.", { n: p.error.linea, x: p.error.frase })}</p>` : ""}
          ${p.ver ? (p.existe ? difHTML(p.antes || "", p.texto) : `<div class="p-previa md" data-p-md="${i}"></div>`) : ""}
        </article>`;
      return `<div class="p-cab"><span class="p-icono">${ic("chispa")}</span><div><h2>${T("Revisa lo que propone tu IA")}</h2><p>${T("Nada está guardado todavía. Quita lo que no te sirva y guarda el resto como una sola versión.")}</p></div></div>
        ${pr.nota ? `<div class="p-aviso p-nota"><b>${esc(nombreIA())}:</b> ${esc(pr.nota)}</div>` : ""}
        ${pr.descartados ? `<p class="p-ayuda">${T("Descarté {n} partes de la respuesta que no venían en el formato correcto.", { n: pr.descartados })}</p>` : ""}
        ${pr.lista.map(tarjeta).join("")}
        ${pr.elementos.length ? `<article class="p-prop ${pr.elementosQuitados ? "quitada" : ""}"><div class="p-prop-cab"><span class="p-tipo">${ic("elemento")}</span><span class="p-txt"><b>${T("Elementos ({n})", { n: pr.elementos.length })}</b><small>${T("Lo que la documentación nombra y conecta")}</small></span><span class="p-prop-acc"><button class="pz-boton" data-p-quitar="el">${pr.elementosQuitados ? ic("mas") + " " + T("Volver a agregar") : ic("deshacer") + " " + T("Quitar este cambio")}</button></span></div>
          <div class="p-chips">${pr.elementos.map((e) => `<span class="p-chip" title="${esc(e.descripcion || "")}">${esc(e.nombre)} <small>${T(NOMBRE_TIPO[e.tipo])}${e.estado === "cambia" ? " · " + T("cambia") : ""}</small></span>`).join("")}</div></article>` : ""}
        ${!pr.lista.length && !pr.elementos.length ? `<p class="p-ayuda">${T("Tu IA no propuso cambios.")}</p>` : ""}
        <div class="p-acciones p-pie"><button class="pz-boton" data-accion="p-descartar">${T("Descartar todo")}</button><button class="pz-boton pz-principal" data-accion="p-aplicar" ${n ? "" : "disabled"}>${T("Guardar {n} cambios", { n })}</button></div>`;
    }

    /** El plan de «Agregar información», agrupado: Nuevo / Se completa / Se modifica. Cada cambio dice por qué y de dónde salió (la cita);
     *  lo que se modifica se ve con antes y después y solo se guarda si la persona lo confirma. */
    function incorporarHTML(pr, n) {
      const elementos = pr.elementos.length ? `<article class="p-prop ${pr.elementosQuitados ? "quitada" : ""}"><div class="p-prop-cab"><span class="p-tipo">${ic("elemento")}</span><span class="p-txt"><b>${T("Elementos ({n})", { n: pr.elementos.length })}</b><small>${T("Lo que la documentación nombra y conecta")}</small></span><span class="p-prop-acc"><button class="pz-boton" data-p-quitar="el">${pr.elementosQuitados ? ic("mas") + " " + T("Volver a agregar") : ic("deshacer") + " " + T("Quitar este cambio")}</button></span></div>
          <div class="p-chips">${pr.elementos.map((e) => `<span class="p-chip" title="${esc(e.descripcion || "")}">${esc(e.nombre)} <small>${T(NOMBRE_TIPO[e.tipo])}${e.estado === "cambia" ? " · " + T("cambia") : ""}</small></span>`).join("")}</div></article>` : "";
      const tarjeta = (p, i) => {
        const fuera = p.quitada || (p.confirmar && !p.confirmada);
        const boton = p.error ? "" : p.confirmar
          ? `<button class="pz-boton ${p.confirmada ? "" : "pz-principal"}" data-p-confirmar="${i}" aria-pressed="${p.confirmada}">${p.confirmada ? ic("listo") + " " + T("Lo aplico") : T("Aplicar este cambio")}</button>`
          : `<button class="pz-boton" data-p-quitar="${i}">${p.quitada ? ic("mas") + " " + T("Volver a agregar") : ic("deshacer") + " " + T("Quitar este cambio")}</button>`;
        return `<article class="p-prop ${fuera ? "quitada" : ""} ${p.confirmar ? "p-modifica" : ""}">
          <div class="p-prop-cab"><span class="p-tipo">${ic(p.accion === "crear" ? "doc" : p.accion === "completar" ? "mas" : "lapiz")}</span><span class="p-txt"><b>${esc(p.titulo)}</b><small>${esc(rel(p.ruta))}</small></span>
            <span class="p-prop-acc">${p.error ? "" : `<button class="pz-boton pz-plano" data-p-ver="${i}">${T(p.ver ? "Ocultar" : "Ver")}</button>`}${boton}</span></div>
          ${p.porque ? `<p class="p-porque">${esc(p.porque)}</p>` : ""}
          ${p.cita ? `<blockquote class="p-cita">«${esc(p.cita)}»${p.citaExacta ? "" : ` <small>${T("(no aparece tal cual en lo que agregaste)")}</small>`}</blockquote>` : ""}
          ${p.error ? `<p class="pz-error-texto">${T("Un diagrama tiene un error (línea {n}: {x}). No lo agrego; pídelo de nuevo.", { n: p.error.linea, x: p.error.frase })}</p>` : ""}
          ${p.ver ? (p.existe ? difHTML(p.antes || "", p.texto) : `<div class="p-previa md" data-p-md="${i}"></div>`) : ""}
        </article>`;
      };
      const grupo = (accion, titulo, ayuda) => {
        const l = pr.lista.map((p, i) => [p, i]).filter(([p]) => (p.accion || (p.existe ? "modificar" : "crear")) === accion);
        return l.length ? `<section class="p-grupo" aria-labelledby="g-${accion}"><h3 id="g-${accion}">${T(titulo)} <span class="p-n">${l.length}</span></h3><p class="p-ayuda">${T(ayuda)}</p>${l.map(([p, i]) => tarjeta(p, i)).join("")}</section>` : "";
      };
      const faltan = pr.lista.filter((p) => p.confirmar && !p.confirmada && !p.quitada && !p.error).length;
      return `<div class="p-cab"><span class="p-icono">${ic("bandeja")}</span><div><h2>${T("Revisa cómo ordenó tu IA la información")}</h2><p>${T("Nada está guardado todavía. Quita lo que no te sirva; lo que cambia algo que ya estaba solo se guarda si lo confirmas.")}</p></div></div>
        ${pr.nota ? `<div class="p-aviso p-nota"><b>${esc(nombreIA())}:</b> ${esc(pr.nota)}</div>` : ""}
        ${pr.descartados ? `<p class="p-ayuda">${T("Descarté {n} partes de la respuesta que no venían en el formato correcto.", { n: pr.descartados })}</p>` : ""}
        ${grupo("crear", "Nuevo", "Documentos que no existían.")}
        ${grupo("completar", "Se completa", "Se agrega a lo que ya estaba, sin quitar nada.")}
        ${grupo("modificar", "Se modifica", "Cambia algo que quedó viejo o contradice lo nuevo. Revisa el antes y el después.")}
        ${elementos}
        ${!pr.lista.length && !pr.elementos.length ? `<p class="p-ayuda">${T("Tu IA no propuso cambios.")}</p>` : ""}
        <div class="p-acciones p-pie">${faltan ? `<span class="p-ayuda">${faltan === 1 ? T("1 cambio sin confirmar no se guarda") : T("{n} cambios sin confirmar no se guardan", { n: faltan })}</span>` : ""}<button class="pz-boton" data-accion="p-descartar">${T("Descartar todo")}</button><button class="pz-boton pz-principal" data-accion="p-aplicar" ${n ? "" : "disabled"}>${T("Guardar {n} cambios", { n })}</button></div>`;
    }

    /** Diferencias de texto (solo lo que cambió, con 2 líneas alrededor) y, si hay diagramas que cambiaron, antes y después. */
    function difHTML(a, b) {
      const L = M.difLineas(a, b), cerca = new Set();
      L.forEach((x, i) => { if (x.tipo !== "=") for (let j = i - 2; j <= i + 2; j++) cerca.add(j); });
      let h = "", salto = 0;
      L.forEach((x, i) => {
        if (!cerca.has(i)) { salto++; return; }
        if (salto) { h += `<div class="d-salto">${esc(Tp("… {n} líneas iguales", { n: salto }))}</div>`; salto = 0; }
        h += `<div class="d-${x.tipo === "+" ? "mas" : x.tipo === "-" ? "menos" : "igual"}"><span aria-hidden="true">${x.tipo === "=" ? " " : x.tipo === "+" ? "+" : "−"}</span>${esc(x.texto) || " "}</div>`;
      });
      if (salto && h) h += `<div class="d-salto">${esc(Tp("… {n} líneas iguales", { n: salto }))}</div>`;
      const bA = M.bloquesMermaid(a), bB = M.bloquesMermaid(b), dg = [];
      const esMmd = !bA.length && !bB.length && (M.tipoDiagrama(a).tipo !== "vacio" || M.tipoDiagrama(b).tipo !== "vacio") && !/^#/m.test(a + b);
      const pares = esMmd ? [[a, b]] : Array.from({ length: Math.max(bA.length, bB.length) }, (_, k) => [bA[k]?.contenido || "", bB[k]?.contenido || ""]);
      pares.forEach(([x, y], k) => { if (x !== y) dg.push(difDiagramaHTML(x, y, k)); });
      return `<div class="p-dif">${h || `<div class="d-salto">${esc(tr("Sin cambios de texto"))}</div>`}</div>${dg.join("")}`;
    }
    function difDiagramaHTML(a, b, k) {
      const d = M.difDiagrama(a, b);
      const svg = (t, marcar) => { if (!t.trim()) return `<p class="p-ayuda">${esc(tr("(no estaba)"))}</p>`; const r = api.resultadoBloque(t, "dif" + k); return r.partes.length && !r.errores.length ? `<div class="p-dif-svg" data-marcar="${esc(JSON.stringify(marcar))}">${M.svgCompleto(r, { estilo: "", margen: 8 })}</div>` : `<pre>${esc(t)}</pre>`; };
      const res = [d.agregados.length ? Tp("Nuevos: {x}", { x: d.agregados.join(", ") }) : "", d.quitados.length ? Tp("Quitados: {x}", { x: d.quitados.map((q) => q.etiqueta).join(", ") }) : "", d.cambiados.length ? Tp("Con otro texto: {x}", { x: d.cambiados.map((c) => `${c.antes} → ${c.despues}`).join(", ") }) : "", d.aristasAgregadas.length || d.aristasQuitadas.length ? Tp("Flechas: +{a} −{q}", { a: d.aristasAgregadas.length, q: d.aristasQuitadas.length }) : ""].filter(Boolean);
      return `<div class="p-dif-diag"><p class="p-ayuda">${esc(Tp("Diagrama {n}", { n: k + 1 }))}${res.length ? " · " + esc(res.join(" · ")) : ""}</p>
        <div class="p-dif-par"><figure><figcaption>${esc(tr("Antes"))}</figcaption>${svg(a, { menos: d.quitados.map((q) => q.id), cambia: d.cambiados.map((c) => c.id) })}</figure>
        <figure><figcaption>${esc(tr("Después"))}</figcaption>${svg(b, { mas: d.agregados, cambia: d.cambiados.map((c) => c.id) })}</figure></div></div>`;
    }

    // Elementos: lista a la izquierda (o arriba en celular) y la ficha del elegido.
    function elementosHTML() {
      const x = esquema(), q = pj.buscar.trim().toLowerCase();
      const lista = x.elementos.filter((e) => !q || `${e.nombre} ${e.id} ${e.descripcion || ""}`.toLowerCase().includes(q));
      const el = elemento(pj.elemento);
      const grupos = M.TIPOS_ELEMENTO.map((t) => [t, lista.filter((e) => e.tipo === t).sort((a, b) => a.nombre.localeCompare(b.nombre))]).filter(([, l]) => l.length);
      const listaHTML = `<div class="p-el-lista ${el && movil() ? "oculto" : ""}">
          <div class="buscar-fila"><input type="search" id="p-buscar" placeholder="Buscar elementos" aria-label="Buscar elementos" value="${esc(pj.buscar)}" data-sin-traducir><button class="pz-boton" data-accion="p-elemento-nuevo">${ic("mas")} Nuevo</button></div>
          ${grupos.map(([t, l]) => `<h4>${NOMBRE_TIPO[t]}</h4>${l.map((e) => `<button class="archivo" data-p-elemento="${esc(e.id)}" aria-current="${e.id === pj.elemento}" data-sin-traducir>${ic("elemento")}<span>${esc(e.nombre)}</span></button>`).join("")}`).join("")}
          ${!lista.length ? (q ? `<div class="p-ayuda">${frase("Aún no existe «{x}».", { x: pj.buscar.trim() })} <button class="pz-boton" data-accion="p-elemento-nuevo">${ic("mas")} ${frase("Crear «{x}»", { x: pj.buscar.trim() })}</button></div>` : `<p class="p-ayuda">Todavía no hay elementos. Documenta el proyecto con tu IA o crea uno.</p>`) : ""}
        </div>`;
      return `<div class="p-el">${listaHTML}${el ? fichaHTML(el) : movil() ? "" : `<div class="p-ficha vacio"><p>Elige un elemento para ver dónde se usa y cambiarlo en todos los documentos a la vez.</p></div>`}</div>`;
    }
    function fichaHTML(el) {
      const { docs, listos } = docsProyecto();
      const usos = M.usosElemento(docs, el);
      const ed = pj.editar;
      const editar = ed ? `<div class="p-editar">
          ${ed.campo === "nombre" ? `<label for="p-valor">Nombre nuevo</label><input type="text" id="p-valor" value="${esc(ed.valor)}" data-sin-traducir data-autofoco>` : `<label for="p-valor">Descripción</label><textarea id="p-valor" data-sin-traducir data-autofoco>${esc(ed.valor)}</textarea>`}
          ${ed.error ? `<p class="pz-error-texto">${esc(tr(ed.error))}</p>` : ""}
          <div class="p-acciones izq"><button class="pz-boton pz-principal" data-accion="p-ver-cambio">${ed.campo === "nombre" ? "Ver qué cambia" : "Guardar"}</button><button class="pz-boton pz-plano" data-accion="p-editar-no">Cancelar</button></div></div>` : "";
      return `<div class="p-ficha">
        ${movil() ? `<button class="pz-boton pz-plano" data-accion="p-volver-lista">${ic("volver")} Elementos</button>` : ""}
        <div class="p-ficha-cab"><span class="p-icono">${ic("elemento")}</span><div><h2 data-sin-traducir>${esc(el.nombre)}</h2><p><span>${NOMBRE_TIPO[el.tipo]}</span> · <code data-sin-traducir>${esc(el.id)}</code></p></div></div>
        ${el.descripcion ? `<p class="p-desc" data-sin-traducir>${esc(el.descripcion)}</p>` : ""}
        ${el.codigo?.length ? `<p class="p-codigo"><span>En el código:</span> <span data-sin-traducir>${el.codigo.map((c) => `<code>${esc(c)}</code>`).join(" ")}</span></p>` : ""}
        ${editar || `<div class="p-acciones izq"><button class="pz-boton" data-accion="p-renombrar">${ic("lapiz")} Renombrar</button><button class="pz-boton" data-accion="p-describir">Cambiar descripción</button><button class="pz-boton" data-accion="p-comportamiento">${ic("chispa")} Cambió cómo funciona</button><button class="pz-boton pz-peligro" data-accion="p-quitar">${ic("borrar")} Quitar</button></div>`}
        <h3>Dónde se usa</h3>
        ${!listos ? `<div class="esperando"><span class="pz-giro"></span> Leyendo los documentos…</div>` : usos.length ? `<div class="p-lista">${usos.map((u) => `<button class="p-doc" data-abrir="${esc(u.ruta)}" ${u.nodos[0] && u.nodos[0].bloque >= 0 ? `data-p-bloque="${u.nodos[0].bloque}"` : ""}><span class="p-tipo">${ic(/\.mmd$/.test(u.ruta) ? "diagrama" : "doc")}</span><span class="p-txt"><b data-sin-traducir>${esc(tituloDoc(u.ruta))}</b>${`<small data-sin-traducir>${esc(resumenUso(u))}</small>`}</span></button>`).join("")}</div>` : `<p class="p-ayuda">Ningún documento lo usa todavía.</p>`}
      </div>`;
    }

    // Versiones: línea de tiempo, ver una, comparar y restaurar.
    function versionesHTML() {
      const v = pj.versiones;
      if (!v || (v.cargando && !v.lista)) return `<div class="esperando"><span class="pz-giro"></span> Leyendo la historia…</div>`;
      if (v.error) return `<p class="pz-error-texto" data-sin-traducir>${esc(tr(v.error))}</p>`;
      const sel = v.lista.find((x) => x.id === v.sel);
      const linea = `<ol class="p-tiempo">
          ${v.pendiente ? `<li class="pendiente"><span class="p-punto"></span><div><b>Cambios sin guardar como versión</b><button class="pz-boton pz-principal" data-accion="p-guardar-version">${ic("historia")} Guardar versión</button></div></li>` : ""}
          ${v.lista.map((x) => `<li><span class="p-punto"></span><button class="p-version" data-p-version="${esc(x.id)}" aria-current="${x.id === v.sel}"><b data-sin-traducir>${esc(x.mensaje)}</b><small data-sin-traducir>${esc(fecha(x.fecha))}${v.modo === "git" ? " · " + esc(x.id.slice(0, 7)) : ""}</small></button></li>`).join("")}
          ${!v.lista.length ? `<li><p class="p-ayuda">Todavía no hay versiones guardadas.</p></li>` : ""}
        </ol>`;
      let detalle = "";
      if (sel) {
        const A = v.archivos[sel.id], B = v.archivos[v.contra];
        const opciones = [["actual", tr("Ahora")], ...v.lista.filter((x) => x.id !== sel.id).map((x) => [x.id, `${fecha(x.fecha)} · ${x.mensaje.slice(0, 40)}`])];
        let cuerpo = `<div class="esperando"><span class="pz-giro"></span> Comparando…</div>`;
        if (A && B) {
          const lista = M.difVersiones(A, B);
          cuerpo = lista.length ? lista.map((f) => `<div class="p-dif-archivo"><button class="p-doc" data-p-dif="${esc(f.ruta)}" aria-expanded="${v.abierto === f.ruta}"><span class="p-tipo">${ic(f.ruta.endsWith(".mmd") ? "diagrama" : "doc")}</span><span class="p-txt"><b data-sin-traducir>${esc(f.ruta)}</b><small>${{ nuevo: "Nuevo después", quitado: "Ya no está", cambiado: "Cambió" }[f.estado]}</small></span></button>
              ${v.abierto === f.ruta ? `<div data-sin-traducir>${difHTML(A[f.ruta] || "", B[f.ruta] || "")}</div>` : ""}</div>`).join("") : `<p class="p-ayuda">Son iguales.</p>`;
        }
        detalle = `<section class="p-tarjeta p-detalle">
          <h3 data-sin-traducir>${esc(sel.mensaje)}</h3>
          <div class="p-comparar"><label for="p-contra">Comparar con</label><select id="p-contra" data-sin-traducir>${opciones.map(([id, n]) => `<option value="${esc(id)}" ${id === v.contra ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          ${cuerpo}
          <div class="p-acciones izq"><button class="pz-boton" data-accion="p-restaurar">${ic("deshacer")} Restaurar esta versión</button></div>
        </section>`;
      }
      return `<div class="p-cab"><span class="p-icono">${ic("historia")}</span><div><h2>Versiones de la documentación</h2><p>${v.modo === "git" ? "Cada versión es un commit de git solo con la carpeta de la documentación." : "Sin git: cada versión es una copia comprimida en la carpeta de la documentación."}</p></div></div>
        <div class="p-versiones">${linea}${detalle}</div>`;
    }

    // ───────────── Diálogos ─────────────
    /** «Pasar al proyecto»: cada documento con su casilla, dónde quedaría en el repo y si ya existe (con su diferencia). */
    function abrirPasar() {
      const filas = rutasDocs().map((r) => rel(r)).sort().map((ruta) => ({ ruta, destino: "docs/" + ruta, elegido: false, reemplazar: false }));
      pj.ofrecerPasar = false;
      pj.dialogo = { tipo: "pasar", filas, cargando: true, abierta: null };
      enviar("destinos", { rutas: filas.map((f) => f.destino) });
      api.pintar();
    }
    function pasarHTML(d) {
      const n = d.filas.filter((f) => f.elegido && f.valido !== false).length;
      const estado = (f) => f.valido === false ? `<span class="p-estado mal">La ruta no sirve</span>` : f.igual ? `<span class="p-estado">Igual</span>` : f.existe ? `<span class="p-estado aviso">Ya existe</span>` : `<span class="p-estado ok">Nuevo</span>`;
      const fila = (f, i) => `<div class="p-pasar-fila">
          <label class="marcar"><input type="checkbox" data-p-fila="${i}" ${f.elegido ? "checked" : ""} ${f.valido === false || f.igual ? "disabled" : ""}><span><b data-sin-traducir>${esc(f.ruta)}</b><small data-sin-traducir>→ ${esc(f.destino)}</small></span></label>
          ${d.cargando ? "" : estado(f)}
          ${f.existe && !f.igual ? `<span class="p-pasar-acc"><label class="marcar chico"><input type="checkbox" data-p-reemplazar="${i}" ${f.reemplazar ? "checked" : ""}> <span>Reemplazar</span></label><button class="pz-boton pz-plano" data-p-ver-dif="${i}">${d.abierta === i ? "Ocultar" : "Ver diferencia"}</button></span>` : ""}
          ${d.abierta === i ? `<div class="p-dif" data-sin-traducir>${difHTML(f.antes || "", E.docs[completa(f.ruta)]?.texto || "")}</div>` : ""}
        </div>`;
      return `<h2 id="t-pj">Pasar al proyecto</h2>
        ${frase("Elige qué documentos copiar al repo {x}. Lo que ya existe solo se cambia si marcas «Reemplazar».", { x: d.codigo || E.proyecto?.codigo || "" }, "p")}
        ${d.cargando ? `<div class="esperando"><span class="pz-giro"></span> Revisando el repo…</div>` : `<div class="p-pasar">${d.filas.map(fila).join("")}</div>`}
        ${d.error ? `<p class="pz-error-texto">${esc(tr(d.error))}</p>` : ""}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-pasar-enviar" ${d.cargando || d.enviando || !n ? "disabled" : ""}>${n === 1 ? "Pasar 1 archivo" : frase("Pasar {n} archivos", { n })}</button></div>`;
    }
    function dialogoHTML(capa) {
      if (pj.generando && !pj.generando.oculto) return capa("t-pj", `<h2 id="t-pj">${frase("{ia} está trabajando…", { ia: nombreIA() })}</h2><div class="esperando"><span class="pz-giro"></span><span>Si lee el código, puede tardar varios minutos. Cuando responda te muestro lo que propone; puedes seguir usando Esquema mientras tanto.</span></div><div class="pz-pie"><button class="pz-boton" data-accion="p-cancelar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-ocultar" data-autofoco>Seguir usando Esquema</button></div>`);
      const d = pj.dialogo;
      if (!d) return "";
      if (d.tipo === "error") return capa("t-pj", `<h2 id="t-pj">No resultó</h2><p data-sin-traducir>${esc(tr(d.texto))}</p><div class="pz-pie"><button class="pz-boton pz-principal" data-accion="cerrar" data-autofoco>Entendido</button></div>`);
      if (d.tipo === "envio") return capa("t-pj", envioHTML(d), "pz-ancho");
      if (d.tipo === "pasar") return capa("t-pj", pasarHTML(d), "pz-ancho");
      if (d.tipo === "agregar") return capa("t-pj", agregarHTML(d), "pz-ancho agregar");
      if (d.tipo === "nuevo-proyecto") return capa("t-pj", nuevoProyectoHTML(d), "pz-ancho agregar");
      if (d.tipo === "wiki") return capa("t-pj", wikiHTML(d), "pz-ancho");
      if (d.tipo === "flujo") return capa("t-pj", `<h2 id="t-pj">Documentar un flujo</h2><p>Cuéntale a tu IA qué quieres documentar: «el flujo de…» o «la secuencia de…». Si necesita leer archivos del código, te pregunta antes.</p>
        <textarea id="p-pedido" placeholder="Por ejemplo: cómo se graba una reunión, desde que tocas Grabar hasta que queda guardada" data-autofoco data-sin-traducir>${esc(d.pedido || "")}</textarea>
        ${d.error ? `<p class="pz-error-texto">${esc(tr(d.error))}</p>` : ""}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-flujo-enviar">${ic("chispa")} Seguir</button></div>`);
      if (d.tipo === "pedir") return capa("t-pj", `<h2 id="t-pj">${frase("{ia} quiere leer estos archivos", { ia: nombreIA() })}</h2>
        ${d.nota ? `<p data-sin-traducir>${esc(d.nota)}</p>` : ""}<p>Elige cuáles le mandas. Solo van archivos de texto del proyecto, nunca secretos ni lo que ignora .gitignore.</p>
        <div class="p-pedir" data-sin-traducir>${d.rutas.map((r, i) => `<label class="marcar"><input type="checkbox" data-p-elegir="${i}" ${d.elegidas.includes(r) ? "checked" : ""}> <span><code>${esc(r)}</code></span></label>`).join("")}</div>
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">No mandar nada</button><button class="pz-boton pz-principal" data-accion="p-pedir-enviar" ${d.elegidas.length ? "" : "disabled"}>Seguir</button></div>`);
      if (d.tipo === "cambio") return capa("t-pj", cambioHTML(d), "pz-ancho");
      if (d.tipo === "comportamiento") return capa("t-pj", `<h2 id="t-pj">${frase("¿Qué cambió en «{x}»?", { x: d.el.nombre })}</h2><p>Tu IA propone cómo cambiar cada documento que lo usa; tú aceptas o quitas cada cambio.</p>
        <textarea id="p-pedido" placeholder="Por ejemplo: ahora pide confirmación antes de empezar" data-autofoco data-sin-traducir>${esc(d.pedido || "")}</textarea>
        ${frase("Documentos que lo usan: {n}", { n: d.documentos.length }, "p")}
        ${d.error ? `<p class="pz-error-texto">${esc(tr(d.error))}</p>` : ""}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-comportamiento-enviar" ${d.documentos.length ? "" : "disabled"}>${ic("chispa")} Seguir</button></div>`);
      if (d.tipo === "version") return capa("t-pj", `<h2 id="t-pj">Guardar versión</h2><p>${E.proyecto?.git?.hay ? "Hago un commit solo con la carpeta de la documentación. No toco otros archivos ni subo nada." : "Guardo una copia de la documentación en .versiones/."}</p>
        <label for="p-mensaje">¿Qué cambió?</label><input type="text" id="p-mensaje" value="${esc(d.mensaje)}" data-sin-traducir data-autofoco>
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-version-enviar">${ic("historia")} Guardar versión</button></div>`);
      if (d.tipo === "nuevo-elemento") return capa("t-pj", `<h2 id="t-pj">Nuevo elemento</h2><p>Algo que la persona reconoce de la app: una pantalla, un botón, un servicio… Después lo enlazas desde los diagramas.</p>
        <label for="p-el-nombre">Nombre</label><input type="text" id="p-el-nombre" value="${esc(d.nombre || "")}" data-sin-traducir data-autofoco>
        <label>Tipo</label><div class="pz-chips">${M.TIPOS_ELEMENTO.map((t) => `<button class="pz-chip" data-p-tipo="${t}" aria-pressed="${d.tipoEl === t}">${NOMBRE_TIPO[t]}</button>`).join("")}</div>
        <label for="p-el-desc">Descripción (opcional)</label><textarea id="p-el-desc" data-sin-traducir>${esc(d.descripcion || "")}</textarea>
        ${d.error ? `<p class="pz-error-texto">${esc(tr(d.error))}</p>` : ""}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-elemento-crear">Crear</button></div>`);
      if (d.tipo === "restaurar") return capa("t-pj", `<h2 id="t-pj">¿Restaurar esta versión?</h2>${frase("Vuelvo la documentación a como estaba el {f}. Lo de ahora no se pierde: queda en la historia y puedes volver.", { f: fecha(d.version.fecha) }, "p")}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-restaurar-si" data-autofoco>Restaurar</button></div>`);
      return "";
    }
    function envioHTML(d) {
      const titulo = d.datos?.forma === "diagrama" ? "Crear diagrama" : { inicial: "Documentar el proyecto", flujo: "Documentar un flujo", cambio: "Actualizar los documentos", revisar: "Poner al día la documentación", completar: "Completar la documentación" }[d.tarea];
      if (d.cargando) return `<h2 id="t-pj">${titulo}</h2><div class="esperando"><span class="pz-giro"></span> Preparando lo que se envía…</div>`;
      if (d.error) return `<h2 id="t-pj">${titulo}</h2><p class="pz-error-texto" data-sin-traducir>${esc(tr(d.error))}</p><div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cerrar</button></div>`;
      const motivos = { ruta: "ruta no válida", fuera: "no existe, es un secreto o está ignorado", binario: "no es texto", tope: "pasa del tope de tamaño" };
      return `<h2 id="t-pj">${titulo}</h2>
        <p>${frase("Esto es exactamente lo que le mando a {ia} ({b}). Revísalo antes de enviar: nada más sale de tu computador.", { ia: nombreIA(), b: tamano(d.bytes) })}</p>
        <div class="p-envio">${d.piezas.map((p, i) => `<details ${d.abierta === i ? "open" : ""}><summary><span data-sin-traducir>${p.ruta ? `<code>${esc(p.ruta)}</code>` : esc(tr(p.titulo))}</span><small data-sin-traducir>${esc(tamano(p.bytes))}${p.recortado ? " · " + esc(tr("recortado")) : ""}</small></summary><pre data-sin-traducir>${esc(p.texto)}</pre></details>`).join("")}</div>
        ${d.aFondo ? fondoHTML(d) : ""}
        ${d.rechazados.length ? `<p class="p-ayuda">No mando: <span data-sin-traducir>${d.rechazados.map((r) => `<code>${esc(r.ruta)}</code> (${esc(tr(motivos[r.motivo] || r.motivo))})`).join(", ")}</span></p>` : ""}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-enviar" data-autofoco>${ic("chispa")} ${frase("Enviar a {ia}", { ia: nombreIA() })}</button></div>`;
    }
    /** La casilla «Revisión a fondo»: la IA lee (solo lee) la carpeta del código por su cuenta, menos los secretos. */
    function fondoHTML(d) {
      const a = d.aFondo;
      if (!a.puede) return `<p class="p-ayuda">${frase("{ia} no sabe leer una carpeta con permisos de solo lectura: le mando solo lo de arriba.", { ia: nombreIA() })}</p>`;
      return `<label class="marcar p-fondo"><input type="checkbox" data-p-fondo ${d.fondo ? "checked" : ""}><span><b>Revisión a fondo</b>
        <small>${frase("Además, {ia} puede leer (solo leer) la carpeta {c} de pies a cabeza. Nunca escribe ni ejecuta nada, y no abre:", { ia: nombreIA(), c: a.carpeta }, "span")} <span data-sin-traducir>${a.no_leer.map((x) => `<code>${esc(x)}</code>`).join(" ")}</span></small>
        <small>Tarda más, pero no se le escapa nada.</small></span></label>`;
    }
    function cambioHTML(d) {
      const { listos } = docsProyecto();
      if (!listos) return `<h2 id="t-pj">Revisando los documentos…</h2><div class="esperando"><span class="pz-giro"></span></div>`;
      const archivos = previaCambio(), cambian = archivos.filter((a) => a.despues !== a.antes);
      const c = d.cambio;
      const titulo = c.tipo === "renombrar" ? frase("Renombrar «{a}» a «{b}»", { a: d.el.nombre, b: c.nombre }, "span") : c.tipo === "quitar" ? frase("Quitar «{a}»", { a: d.el.nombre }, "span") : frase("Cambiar la descripción de «{a}»", { a: d.el.nombre }, "span");
      const nota = (a) => {
        const n = a.notas, l = [];
        for (const [x, y] of n.renombrados) l.push(Tp("En un diagrama: «{a}» → «{b}»", { a: x, b: y }));
        for (const x of n.quitados) l.push(Tp("Sale de un diagrama: «{a}»", { a: x }));
        for (const [x, y] of n.unidos) l.push(Tp("Uno «{a}» con «{b}»", { a: x, b: y }));
        if (n.sueltos.length) l.push(Tp("Quedan sueltos (sin flechas): {x}", { x: n.sueltos.join(", ") }));
        for (const x of n.sinCambiar) l.push(Tp("No cambié «{a}»: no dice el nombre; revísalo", { a: x }));
        if (n.enlaces) l.push(c.tipo === "quitar" ? cuenta(n.enlaces, "1 enlace queda como texto", "{n} enlaces quedan como texto") : cuenta(n.enlaces, "1 enlace", "{n} enlaces"));
        if (n.menciones) l.push(cuenta(n.menciones, "1 mención sin enlace", "{n} menciones sin enlace"));
        return l;
      };
      return `<h2 id="t-pj">${titulo}</h2>
        ${c.tipo === "describir" ? frase("Solo cambia el glosario (elementos.md).", {}, "p") : cambian.length === 1 ? frase("Cambia 1 documento y el glosario, todo en una sola versión que puedes deshacer.", {}, "p") : cambian.length ? frase("Cambia {n} documentos y el glosario, todo en una sola versión que puedes deshacer.", { n: cambian.length }, "p") : frase("Ningún documento cambia; solo el glosario.", {}, "p")}
        ${c.tipo === "quitar" ? `<label class="marcar"><input type="checkbox" data-p-opcion="reconectar" ${c.reconectar ? "checked" : ""}> <span>Unir lo que venía antes con lo que sigue<small>Así los flujos no quedan cortados donde estaba.</small></span></label>` : ""}
        ${c.tipo === "renombrar" ? `<label class="marcar"><input type="checkbox" data-p-opcion="tambienSinEnlace" ${c.tambienSinEnlace ? "checked" : ""}> <span>Cambiar también donde lo nombran sin enlace<small>Busca el nombre exacto como palabra.</small></span></label>` : ""}
        <div class="p-cambio-lista" data-sin-traducir>${archivos.map((a, i) => `<div class="p-prop"><div class="p-prop-cab"><span class="p-tipo">${ic(/\.mmd$/.test(a.ruta) ? "diagrama" : "doc")}</span><span class="p-txt"><b>${esc(tituloDoc(a.ruta))}</b><small>${esc(rel(a.ruta))}${a.despues === a.antes ? " · " + esc(tr("lo menciona, no cambia")) : ""}</small></span>${a.despues !== a.antes ? `<button class="pz-boton pz-plano" data-p-ver-cambio="${i}">${esc(tr(d.abierto === i ? "Ocultar" : "Antes y después"))}</button>` : ""}</div>
            ${nota(a).length ? `<ul class="p-notas">${nota(a).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
            ${a.notas.frases.length && c.tipo !== "renombrar" ? `<p class="p-ayuda">${esc(tr("Frases que lo mencionan (revísalas después):"))}</p><ul class="p-frases">${a.notas.frases.slice(0, 6).map((f) => `<li><small>${esc(Tp("Línea {n}", { n: f.linea }))}</small> ${esc(f.despues)}</li>`).join("")}</ul>` : ""}
            ${d.abierto === i ? difHTML(a.antes, a.despues) : ""}</div>`).join("")}</div>
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-aplicar-cambio" data-autofoco>${c.tipo === "describir" ? "Guardar" : frase("Aplicar en {n} archivos", { n: cambian.length + 1 })}</button></div>`;
    }

    // ───────────── Agregar al proyecto (y crear un proyecto Libro): texto pegado o archivos; Esquema detecta qué es ─────────────
    const ACEPTA = ".md,.markdown,.txt,.pdf,.docx,.odt,.epub,.html,.htm";
    const MAX_ARCHIVO = 25 * 1024 * 1024;
    const NOMBRE_CONTENIDO = { historia: "Historia de usuario", libro: "Libro", documento: "Documento", incorporar: "Información para ordenar" };
    const AYUDA_CONTENIDO = {
      historia: "Va a Historias de usuario. Tu IA la entiende, te pregunta lo que falta y la documenta. No programa.",
      libro: "Queda en Documentos como referencia: un resumen con sus ideas principales. Para estudiarlo entero, mejor como proyecto Libro.",
      documento: "Va a Documentos: tu IA lo resume, saca los puntos clave, lo diagrama y anota las preguntas abiertas.",
      incorporar: "Tu IA lo reparte en la documentación: crea lo nuevo, completa lo que existe y corrige lo que cambió. Antes de guardar ves cada cambio y por qué.",
    };
    /** «Agregar archivo o texto» (o «Historia de usuario», con el tipo elegido de antemano). */
    function abrirAgregar(preset = null, archivos = null) {
      E.nuevo = null; E.lateral = false;
      pj.dialogo = { tipo: "agregar", paso: "entrada", preset, texto: "", archivos: [], leyendo: 0, aFondo: true };
      pj.datosArchivos = [];
      if (archivos?.length) leerArchivos(archivos);
      api.pintar();
    }
    /** «Agregar proyecto»: primero el tipo (Software, Libro… los de tipos/), después de dónde sale. */
    function abrirNuevoProyecto(tipoId = null, archivos = null) {
      E.nuevo = null; E.lateral = false;
      pj.dialogo = { tipo: "nuevo-proyecto", t: tipoId || (archivos?.length ? "libro" : "software"), paso: "entrada", texto: "", archivos: [], leyendo: 0 };
      if (!tipos().some((x) => x.id === pj.dialogo.t)) pj.dialogo.t = tipos()[0].id;
      pj.datosArchivos = [];
      if (archivos?.length) leerArchivos(archivos);
      api.pintar();
    }
    /** Los archivos elegidos o soltados: se leen aquí (FileReader) y van a bin/ en base64, que los valida. */
    function leerArchivos(lista) {
      const d = pj.dialogo;
      if (!d || !("archivos" in d)) return;
      for (const f of [...lista].slice(0, 10)) {
        if (f.size > MAX_ARCHIVO) { d.error = Tp("«{x}» es muy grande (más de 25 MB).", { x: f.name }); continue; }
        if (d.archivos.some((a) => a.nombre === f.name && a.tamano === f.size)) continue;
        d.archivos.push({ nombre: f.name, tamano: f.size }); d.leyendo++;
        const r = new FileReader();
        r.onload = () => { pj.datosArchivos.push({ nombre: f.name, datos: base64(r.result) }); d.leyendo--; if (pj.dialogo === d) api.pintar(); };
        r.onerror = () => { d.leyendo--; d.archivos = d.archivos.filter((a) => a.nombre !== f.name); d.error = Tp("No pude leer «{x}».", { x: f.name }); if (pj.dialogo === d) api.pintar(); };
        r.readAsArrayBuffer(f);
      }
      d.paso = "entrada"; d.error = d.error || null;
      api.pintar();
    }
    function base64(buf) { const b = new Uint8Array(buf); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); }
    function detectar() {
      const d = pj.dialogo;
      d.texto = $("#p-pegar")?.value ?? d.texto ?? "";
      if (!d.texto.trim() && !pj.datosArchivos.length) { d.error = tr("Pega un texto o elige un archivo."); return api.pintar(); }
      d.paso = "leyendo"; d.error = null;
      enviar("detectar", { texto: d.texto, archivos: pj.datosArchivos });
      api.pintar();
    }
    /** Lo que se puede agregar a este proyecto, según su tipo (tipos/<id>.json → «agregar»). */
    const tiposContenido = () => { const l = tipoActual().agregar || []; return l.length ? l : ["documento"]; };
    function alDetectar(r) {
      const d = pj.dialogo;
      if (!d || d.paso !== "leyendo") return;
      if (!r.ok) { d.paso = "entrada"; d.error = r.error || tr("No pude leerlo."); d.avisos = r.avisos || []; return api.pintar(); }
      const permitidos = tiposContenido();
      // «Agregar información»: la persona ya dijo qué es; sin segundo paso (un enlace solo no sirve: Esquema no lo abre).
      if (d.preset === "incorporar" && permitidos.includes("incorporar")) {
        if (r.solo_enlace) { d.paso = "entrada"; d.error = tr("Esquema no abre enlaces (nada sale de tu computador). Pega también el texto."); return api.pintar(); }
        Object.assign(d, { det: r, elegido: "incorporar", titulo: r.titulo || "" });
        return enviarAgregar();
      }
      Object.assign(d, { paso: "detectado", det: r, titulo: r.titulo || "", avisos: r.avisos || [] });
      d.elegido = d.preset && permitidos.includes(d.preset) ? d.preset : permitidos.includes(r.tipo) ? r.tipo : permitidos.includes("documento") ? "documento" : permitidos[0];
      api.pintar();
      $("#p-titulo")?.focus();
    }
    function enviarAgregar() {
      const d = pj.dialogo, titulo = ($("#p-titulo")?.value ?? d.titulo ?? "").trim();
      const x = { token: d.det.token, tipo: d.elegido, titulo, idioma: E.idioma, a_fondo: d.elegido === "historia" ? d.aFondo !== false : false };
      pj.dialogo = null;
      // Sin carpeta de documentación todavía: primero se prepara (aparte del código) y recién ahí se agrega.
      if (!E.proyecto && !vinculado()) { pj.agregarPendiente = x; enviar("vincular"); toast("Primero preparo la carpeta de documentación, aparte del código"); return api.pintar(); }
      empezarAgregar(x);
    }
    function empezarAgregar(x) {
      pj.esperando = true; pj.trabajo = null; pj.ficha = null; pj.irAPreguntas = true;
      E.panel = "proyecto"; E.sel = null; E.propuestas = null; E.lateral = false;
      enviar("agregar", x);
      relojTrabajo();
      api.pintar();
    }
    const tamanoArchivo = (n) => (n < 1024 * 1024 ? Tp("{n} KB", { n: Math.max(1, Math.round(n / 1024)) }) : Tp("{n} MB", { n: Math.round(n / 104857.6) / 10 }));
    /** Pegar o elegir (o soltar) archivos: lo mismo en «Agregar» y en un proyecto Libro nuevo. */
    function entradaHTML(d, placeholder) {
      return `<div class="soltar" data-p-soltar>
          <span class="soltar-ic">${ic("archivo")}</span>
          <span class="soltar-txt"><b>Arrastra archivos aquí</b><small>Markdown, texto, PDF con texto, Word (.docx), OpenDocument, EPUB o HTML.</small></span>
          <button class="pz-boton" data-accion="p-elegir-archivos">Elegir archivos</button>
          <input type="file" id="p-archivos" class="pz-sr" tabindex="-1" aria-hidden="true" multiple accept="${ACEPTA}">
        </div>
        ${d.archivos.length ? `<ul class="p-archivos" data-sin-traducir>${d.archivos.map((a, k) => `<li>${ic("doc")}<span>${esc(a.nombre)}</span><small>${esc(tamanoArchivo(a.tamano))}</small><button class="pz-boton pz-plano icono" data-p-quitar-archivo="${k}" aria-label="${esc(Tp("Quitar «{x}»", { x: a.nombre }))}">${ic("cerrar")}</button></li>`).join("")}</ul>` : ""}
        <label for="p-pegar">O pega el texto</label>
        <textarea id="p-pegar" class="p-pegar" placeholder="${esc(tr(placeholder))}" data-sin-traducir ${d.archivos.length ? "" : "data-autofoco"}>${esc(d.texto || "")}</textarea>
        ${(d.avisos || []).map((a) => `<p class="pz-error-texto" data-sin-traducir>${esc(a.nombre ? a.nombre + ": " : "")}${esc(tr(a.error))}</p>`).join("")}
        ${d.error ? `<p class="pz-error-texto" data-sin-traducir>${esc(tr(d.error))}</p>` : ""}`;
    }
    function agregarHTML(d) {
      const n = nombreProyecto(), historia = d.preset === "historia", info = d.preset === "incorporar";
      const titulo = historia ? frase("Historia de usuario en {x}", { x: n }) : info ? frase("Agregar información a {x}", { x: n }) : frase("Agregar a {x}", { x: n });
      if (d.paso === "leyendo") return `<h2 id="t-pj">${titulo}</h2><div class="esperando"><span class="pz-giro"></span> Leyendo lo que agregaste…</div>`;
      if (d.paso === "entrada") return `<h2 id="t-pj">${titulo}</h2>
        <p>${historia ? "Pega la historia (o el texto del ticket) o elige el archivo. Tu IA te ayuda a entenderla y te pregunta lo que falta; no programa." : info ? "Notas, un correo, lo que salió de una reunión… Tu IA lo ordena en la documentación: crea lo nuevo, completa lo que existe y corrige lo que cambió. Nada se guarda hasta que revises cada cambio." : "Pega un texto o elige archivos. Esquema detecta si es una historia de usuario, un libro o un documento, y lo ordena en su sección."}</p>
        ${entradaHTML(d, historia ? "Como cliente quiero… para… (y sus criterios de aceptación)" : info ? "Pega aquí tus notas" : "Pega aquí el texto")}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-detectar" ${d.leyendo ? "disabled" : ""} data-sin-traducir>${d.leyendo ? `<span class="pz-giro chico"></span> ${esc(tr("Leyendo archivos…"))}` : esc(tr("Seguir"))}</button></div>`;
      const r = d.det, permitidos = tiposContenido();
      const datos = r.capitulos > 1 ? frase("{p} palabras · {c} capítulos", { p: r.palabras.toLocaleString(), c: r.capitulos }) : frase("{p} palabras", { p: r.palabras.toLocaleString() });
      const cod = !!(E.proyecto?.codigo || E.vinculo?.codigo || (!vinculado() && E.carpeta));
      return `<h2 id="t-pj">${titulo}</h2>
        <p class="p-ayuda">${datos}${r.archivos?.length ? ` · <span data-sin-traducir>${esc(r.archivos.join(", "))}</span>` : ""}</p>
        <label id="t-que">¿Qué es?</label>
        <div class="pz-seg tipos-contenido" role="radiogroup" aria-labelledby="t-que">${permitidos.map((k) => `<button role="radio" aria-checked="${d.elegido === k}" aria-pressed="${d.elegido === k}" data-p-contenido="${k}" data-sin-traducir>${esc(tr(NOMBRE_CONTENIDO[k]))}</button>`).join("")}</div>
        ${r.tipo === d.elegido && r.razones?.length ? `<p class="p-ayuda razones">${frase("Lo detecté así porque: {x}.", { x: r.razones.map((x) => tr(x)).join(" · ") })}</p>` : `<p class="p-ayuda razones" data-sin-traducir>${T("Tu IA lo confirma (o te avisa) en su primera respuesta.")}</p>`}
        ${r.solo_enlace && d.elegido === "historia" ? `<p class="pz-error-texto" data-sin-traducir>${T("Esquema no abre enlaces (nada sale de tu computador). Vuelve atrás y pega también el texto del ticket.")}</p>` : ""}
        ${r.sugerir_libro && tipos().some((x) => x.id === "libro") && tipoActual().id !== "libro" ? `<div class="p-aviso"><span data-sin-traducir>${T("Es un libro largo. Para estudiarlo, resumir cada capítulo y revisar incongruencias, créalo como un proyecto Libro aparte.")}</span><button class="pz-boton" data-accion="p-a-libro">${ic("libro")} ${T("Crear un proyecto Libro")}</button></div>` : ""}
        <label for="p-titulo">Título</label><input type="text" id="p-titulo" class="p-input" value="${esc(d.titulo || "")}" placeholder="Si lo dejas vacío, tu IA le pone uno">
        ${d.elegido === "historia" && cod ? `<label class="marcar p-fondo" data-sin-traducir><input type="checkbox" data-p-afondo ${d.aFondo !== false ? "checked" : ""}><span><b data-sin-traducir>${T("Que lea el código (solo leer)")}</b><small data-sin-traducir>${T("Para ubicar qué partes toca. Nunca escribe ni ejecuta nada, y no abre secretos.")}</small></span></label>` : ""}
        ${(d.avisos || []).map((a) => `<p class="pz-error-texto" data-sin-traducir>${esc(a.nombre ? a.nombre + ": " : "")}${esc(tr(a.error))}</p>`).join("")}
        <p class="p-ayuda agregar-ayuda" data-sin-traducir>${T(AYUDA_CONTENIDO[d.elegido] || "")}</p>
        <div class="pz-pie"><button class="pz-boton" data-accion="p-volver-entrada">Atrás</button><button class="pz-boton pz-principal" data-accion="p-agregar-enviar" ${r.solo_enlace && d.elegido === "historia" ? "disabled" : ""} data-sin-traducir>${ic("mas")} ${esc(tr("Agregar"))}</button></div>`;
    }
    function nuevoProyectoHTML(d) {
      const t = tipoDe(d.t);
      const tarjetas = tipos().map((x) => `<button class="tipo-proyecto" role="radio" aria-checked="${x.id === t.id}" data-p-tipo-proyecto="${esc(x.id)}" data-sin-traducir><span class="ti-icono">${ic(x.icono)}</span><span class="ti-txt"><b>${esc(textoDe(x.nombre))}</b><small>${esc(textoDe(x.descripcion))}</small></span></button>`).join("");
      const cab = `<h2 id="t-pj">Agregar proyecto</h2><p id="t-tipo">¿Qué tipo de proyecto es?</p><div class="tipos-proyecto" role="radiogroup" aria-labelledby="t-tipo">${tarjetas}</div>`;
      if (d.paso === "carpeta") return t.fuente === "carpeta"
        ? `${cab}<p class="p-ayuda" data-sin-traducir>${T("La documentación de «{x}» queda aparte, en ~/Esquema, con su propio historial: Esquema nunca escribe en tu código.", { x: d.carpeta })}</p>
          <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-vincular">Seguir</button></div>`
        : `${cab}<p class="p-aviso" data-sin-traducir>${T("«{x}» tiene textos, no código: parece un libro. Creo un proyecto Libro con sus textos, en orden, en ~/Esquema. Los archivos de la carpeta no se tocan.", { x: d.carpeta })}</p>
          <label for="p-titulo">Nombre del libro</label><input type="text" id="p-titulo" class="p-input" value="${esc(d.titulo || "")}" data-sin-traducir data-autofoco>
          <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-crear-libro" data-sin-traducir>${ic("libro")} ${esc(tr("Crear proyecto"))}</button></div>`;
      if (t.fuente === "carpeta") return `${cab}<p class="p-ayuda" data-sin-traducir>${T("Elige la carpeta del código. La documentación queda aparte, en ~/Esquema, con su propio historial: Esquema nunca escribe en tu código.")}</p>
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-elegir-codigo" data-sin-traducir>${ic("carpeta")} ${esc(tr("Elegir la carpeta"))}</button></div>`;
      if (d.paso === "leyendo" || d.paso === "creando") return `${cab}<div class="esperando" data-sin-traducir><span class="pz-giro"></span> ${esc(tr(d.paso === "creando" ? "Creando el proyecto…" : "Leyendo lo que agregaste…"))}</div>`;
      if (d.paso === "entrada") return `${cab}${entradaHTML(d, "Pega aquí el texto del libro")}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-detectar" ${d.leyendo ? "disabled" : ""} data-sin-traducir>${d.leyendo ? `<span class="pz-giro chico"></span> ${esc(tr("Leyendo archivos…"))}` : esc(tr("Seguir"))}</button></div>`;
      const r = d.det;
      return `${cab}<p class="p-ayuda">${r.capitulos > 1 ? frase("{p} palabras · {c} capítulos", { p: r.palabras.toLocaleString(), c: r.capitulos }) : frase("{p} palabras", { p: r.palabras.toLocaleString() })}</p>
        ${r.tipo !== "libro" ? `<p class="p-aviso" data-sin-traducir>${T("No parece un libro (es corto o no tiene capítulos). Igual lo parto en partes; si es otra cosa, agrégalo a un proyecto como documento.")}</p>` : ""}
        <label for="p-titulo">Nombre del libro</label><input type="text" id="p-titulo" class="p-input" value="${esc(d.titulo || r.titulo || "")}" data-sin-traducir data-autofoco>
        <p class="p-ayuda" data-sin-traducir>${T("Queda en ~/Esquema, con su propio historial. Lo parto en capítulos y, antes de resumir, te pregunto para qué lo quieres.")}</p>
        <div class="pz-pie"><button class="pz-boton" data-accion="p-volver-entrada">Atrás</button><button class="pz-boton pz-principal" data-accion="p-crear-libro" data-sin-traducir>${ic("libro")} ${esc(tr("Crear proyecto"))}</button></div>`;
    }

    // ───────────── Preguntas: una a la vez, grande y simple (las de una historia de usuario o de un libro) ─────────────
    const trabajoPorId = (id) => [pj.trabajo, ...(pj.esperan || [])].find((t) => t && t.id === id) || null;
    function abrirPreguntas(id) {
      const t = trabajoPorId(id);
      if (!t || t.estado !== "esperando" || !t.preguntas?.length) return toast("Esas preguntas ya se respondieron");
      pj.preguntas = { id, k: 0, respuestas: {} };
      E.panel = "preguntas"; E.sel = null; E.lateral = false;
      api.pintar();
      document.querySelector(".pregunta [data-p-resp], #preg-libre")?.focus();
    }
    function preguntasHTML() {
      const q = pj.preguntas, t = q && trabajoPorId(q.id);
      if (!t || t.estado !== "esperando") return `<div class="pregunta"><p>Ya no hay preguntas pendientes.</p><button class="pz-boton" data-p="proyecto">${ic("volver")} Volver al proyecto</button></div>`;
      const ps = t.preguntas, p = ps[q.k], r = q.respuestas[p.id] || {}, ultima = q.k === ps.length - 1;
      return `<section class="pregunta" aria-labelledby="t-preg" data-sin-traducir>
        <p class="preg-de"><span>${esc(t.titulo || "")}</span><span>${T("Pregunta {n} de {x}", { n: q.k + 1, x: ps.length })}</span></p>
        <div class="preg-avance" aria-hidden="true">${ps.map((x, i) => `<i class="${i < q.k ? "hecha" : i === q.k ? "actual" : ""}"></i>`).join("")}</div>
        <h2 id="t-preg" class="preg-txt">${esc(p.pregunta)}</h2>
        ${p.porque ? `<p class="preg-porque">${esc(p.porque)}</p>` : ""}
        ${p.opciones?.length ? `<div class="preg-opciones" role="group" aria-label="${esc(tr("Respuestas sugeridas"))}">${p.opciones.map((o, i) => `<button class="preg-opcion" data-p-resp="${i}" aria-pressed="${r.respuesta === o}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join("")}</div>` : ""}
        <label for="preg-libre">${p.opciones?.length ? T("Otra respuesta") : T("Tu respuesta")}</label>
        <textarea id="preg-libre" rows="3" placeholder="${esc(tr("Escribe con tus palabras (Enter para seguir)"))}">${esc(r.respuesta && !(p.opciones || []).includes(r.respuesta) ? r.respuesta : "")}</textarea>
        <div class="preg-pie">
          ${q.k ? `<button class="pz-boton pz-plano" data-accion="p-preg-atras">${ic("volver")} ${T("Anterior")}</button>` : `<button class="pz-boton pz-plano" data-p="proyecto">${T("Responder después")}</button>`}
          <span class="espacio"></span>
          <button class="pz-boton pz-plano" data-accion="p-preg-nose">${T("No sé todavía")}</button>
          <button class="pz-boton pz-plano" data-accion="p-preg-saltar">${T("Saltar")}</button>
          <button class="pz-boton pz-principal" data-accion="p-preg-siguiente">${ultima ? T("Enviar respuestas") : T("Siguiente")}</button>
        </div>
        <p class="p-ayuda">${T(t.tipo === "historia" ? "Lo que respondas queda en «Decisiones», con la fecha. Si cierras Esquema, las preguntas te esperan." : t.tipo === "incorporar" ? "Con lo que respondas, tu IA termina de ordenar la información. Si cierras Esquema, las preguntas te esperan." : "Si cierras Esquema, las preguntas te esperan.")}</p>
      </section>`;
    }
    /** Guarda lo escrito y avanza (o envía todo al final). `como`: "opcion" | "nose" | "saltar" | "siguiente". */
    function responderPregunta(como, opcion) {
      const q = pj.preguntas, t = trabajoPorId(q.id), p = t.preguntas[q.k];
      const libre = ($("#preg-libre")?.value || "").trim();
      if (como === "opcion") q.respuestas[p.id] = { respuesta: p.opciones[opcion] };
      else if (como === "nose") q.respuestas[p.id] = { nose: true };
      else if (como === "saltar") delete q.respuestas[p.id];
      else if (libre) q.respuestas[p.id] = { respuesta: libre };
      if (q.k < t.preguntas.length - 1) { q.k++; api.pintar(); document.querySelector(".pregunta [data-p-resp], #preg-libre")?.focus(); return; }
      const respuestas = t.preguntas.map((x) => ({ id: x.id, respuesta: q.respuestas[x.id]?.respuesta || "", nose: !!q.respuestas[x.id]?.nose }));
      enviar("responder", { id: t.id, respuestas, idioma: E.idioma });
      Object.assign(t, { estado: "corriendo", preguntas: [] });
      pj.trabajo = t; pj.esperan = (pj.esperan || []).filter((x) => x.id !== t.id); pj.preguntas = null; pj.ultimoEvento = Date.now();
      E.panel = "proyecto"; relojTrabajo();
      toast(respuestas.some((x) => x.respuesta) ? "Gracias: tu IA sigue con lo que respondiste" : "Listo: lo que no respondiste queda como pregunta abierta");
      api.pintar();
    }

    // ───────────── Historias de usuario: estado y «Terminé el desarrollo» ─────────────
    const ESTADOS_HU = ["por-entender", "lista", "en-desarrollo", "terminada"];
    const historiaAbierta = () => (E.proyecto && E.sel ? (E.proyecto.historias || []).find((x) => completa(x.ruta) === E.sel) || null : null);
    /** Arriba del documento de una HU: su estado (se cambia con un toque), las preguntas que esperan y «Terminé el desarrollo». */
    function barraDocHTML() {
      const h = historiaAbierta();
      if (!h) return "";
      const espera = (pj.esperan || []).find((t) => t.ruta === h.ruta);
      return `<div class="hu-barra" data-sin-traducir>
        <span class="hu-id">${esc(h.id)}</span>
        <div class="pz-seg hu-estados" role="group" aria-label="${esc(tr("Estado de la historia"))}">${ESTADOS_HU.map((e) => `<button data-hu-estado="${e}" aria-pressed="${h.estado === e}" title="${esc(tr(NOMBRE_ESTADO[e]))}"><i class="hu-punto" data-estado="${e}"></i><span class="hu-etq">${T(NOMBRE_ESTADO[e])}</span></button>`).join("")}</div>
        <span class="espacio"></span>
        ${espera ? `<button class="pz-boton pz-principal" data-p-responder="${esc(espera.id)}">${ic("pregunta")} ${n2(espera)}</button>` : ""}
        ${h.estado === "en-desarrollo" ? `${h.commits ? `<small class="hu-commits">${h.commits === 1 ? T("1 commit la nombra") : T("{n} commits la nombran", { n: h.commits })}</small>` : ""}<button class="pz-boton pz-principal" data-accion="p-hu-terminar">${ic("listo")} ${T("Terminé el desarrollo")}</button>` : ""}
      </div>`;
    }
    function cambiarEstadoHU(estado) {
      const h = historiaAbierta();
      if (!h || h.estado === estado) return;
      if (estado === "terminada" && h.estado === "en-desarrollo") return terminarHU();
      api.guardarTodo();
      enviar("historia_estado", { ruta: h.ruta, estado });
      h.estado = estado; api.pintar();
    }
    function terminarHU(h = historiaAbierta()) {
      if (!h) return;
      ui.confirmar({ titulo: "¿Terminaste «{x}»?", valores: { x: h.id }, texto: "Tu IA compara lo que se pidió con lo que cambió en el código (commits y archivos, solo leer) y escribe «Cómo quedó». También propone poner al día los demás documentos: tú decides cuáles.",
        si: "Documentar cómo quedó", no: "Todavía no" }).then((si) => {
        if (si) { api.guardarTodo(); pj.esperando = true; pj.trabajo = null; E.panel = "proyecto"; E.sel = null; enviar("historia_cierre", { ruta: h.ruta, idioma: E.idioma }); relojTrabajo(); api.pintar(); }
      });
    }
    /** Las propuestas de «Terminé el desarrollo» se revisan con el mismo flujo de siempre (cada una con «Quitar este cambio»). */
    function abrirPropuestasDe(id, x) {
      if (!x) { pj.pidePropuestas = id; return enviar("trabajo", { id, propuestas: true }); }
      pj.propuestasVistas = { ...(pj.propuestasVistas || {}), [id]: true };
      E.propuestas = armarPropuestas({ tarea: x.tarea || "revisar", propuestas: x.propuestas || [], elementos: x.elementos || [], nota: x.nota || "", descartados: x.descartados || 0 });
      E.panel = "propuestas"; E.sel = null;
      api.pintar();
    }

    // ───────────── Borrar lo que se creó (con su historial y «Deshacer») ─────────────
    /** Qué pasa al borrar `ruta`: "docs" (la documentación: sale de esquema.json, queda en el historial y se puede deshacer),
     *  "papelera" (un .md/.mmd de una carpeta sin documentación de Esquema: a la Papelera del sistema) o null (el código vinculado,
     *  esquema.json y el glosario no se borran desde aquí). */
    function puedeBorrar(ruta) {
      if (!ruta || esCodigo(ruta) || !/\.(md|mmd)$/i.test(ruta)) return null;
      if (E.proyecto && enDocs(ruta)) return [M.GLOSARIO, "esquema.json"].includes(rel(ruta)) ? null : "docs";
      if (vinculado()) return null;
      return "papelera";
    }
    function pedirBorrar(ruta) {
      const modo = puedeBorrar(ruta);
      if (!modo) { toast(esCodigo(ruta) ? "Los archivos del código se borran en tu editor, no desde Esquema" : "Ese archivo lo arma Esquema: no se borra"); return; }
      const nombre = modo === "docs" ? tituloDoc(ruta) : api.nombreDe(ruta);
      E.menu = null;
      const pregunta = modo === "docs"
        ? { titulo: "¿Borrar «{x}»?", texto: "Sale de la documentación y los enlaces a él quedan como texto. Queda en el historial de versiones y lo puedes deshacer.", si: "Borrar" }
        : { titulo: "¿Mandar «{x}» a la Papelera?", texto: "Está en la carpeta de tu proyecto, no en la documentación de Esquema. Va a la Papelera del sistema: desde ahí lo recuperas.", si: "Mandar a la Papelera" };
      ui.confirmar({ ...pregunta, valores: { x: nombre }, peligro: true }).then((si) => {
        if (!si) return;
        api.guardarTodo();
        if (modo === "docs") enviar("borrar", { ruta: rel(ruta), idioma: E.idioma }); else host.enviar("papelera", { ruta });
      });
      api.pintar();
    }
    /** Lo borrado deja de estar en la lista y en el editor. */
    function sacarArchivo(ruta) {
      E.archivos = E.archivos.filter((a) => a.ruta !== ruta);
      delete E.docs[ruta];
      if (E.sel === ruta) { E.sel = null; E.bloque = null; E.panel = E.proyecto ? "proyecto" : null; }
    }
    function alPapelera(r) {
      if (!r.ok) { toast(r.error || "No pude mandarlo a la Papelera"); return api.pintar(); }
      sacarArchivo(r.ruta);
      toast(Tp("«{x}» está en la Papelera: desde ahí lo recuperas", { x: api.nombreDe(r.ruta) }), true);
      enviar("arbol");
      api.pintar();
    }

    // ───────────── Publicar en la wiki de GitHub ─────────────
    function abrirWiki(url) {
      pj.ofrecerWiki = false; E.lateral = false;
      pj.dialogo = { tipo: "wiki", cargando: true };
      api.guardarTodo();
      enviar("wiki_preparar", { idioma: E.idioma, ...(url ? { url } : {}) });
      api.pintar();
    }
    const ESTADO_PAGINA = { nuevo: ["Nueva", "ok"], cambia: ["Cambia", "aviso"], igual: ["Igual", ""], mano: ["Escrita a mano: no la toco", ""], sobra: ["Se quita: ya no está en la documentación", "mal"] };
    function wikiHTML(d) {
      const cab = `<h2 id="t-pj">Publicar en la wiki</h2>`;
      if (d.cargando || d.publicando) return `${cab}<div class="esperando" data-sin-traducir><span class="pz-giro"></span> ${esc(tr(d.publicando ? "Subiendo a la wiki con tu git…" : "Revisando la wiki…"))}</div>`;
      if (d.falta_url) return `${cab}<p data-sin-traducir>${T("¿Cuál es el repositorio de GitHub de este proyecto? Su wiki es otro repositorio que Esquema arma desde tu documentación.")}</p>
        <label for="p-wiki-url">Dirección del repositorio</label><input type="text" id="p-wiki-url" class="p-input" placeholder="https://github.com/ana/mi-app" data-sin-traducir data-autofoco>
        ${d.error && !d.primera ? `<p class="pz-error-texto" data-sin-traducir>${esc(tr(d.error))}</p>` : ""}
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-wiki-url">Seguir</button></div>`;
      if (d.error) return `${cab}<p data-sin-traducir>${esc(tr(d.error))}</p>
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cerrar</button>${d.web ? `<button class="pz-boton" data-enlace="${esc(d.web)}">${ic("github")} Abrir GitHub</button>` : ""}${d.no_existe ? `<button class="pz-boton pz-principal" data-accion="p-wiki">Volver a revisar</button>` : ""}</div>`;
      const elegibles = d.paginas.filter((x) => ["nuevo", "cambia", "sobra"].includes(x.estado)), n = elegibles.filter((x) => x.elegida !== false).length;
      return `${cab}<p>${frase("Esto queda en la wiki de {x}. Uso tu git y tu cuenta: Esquema no guarda claves. Nunca toco las páginas escritas a mano.", { x: d.url })}</p>
        <div class="p-pasar">${d.paginas.map((x, i) => `<div class="p-pasar-fila"><label class="marcar"><input type="checkbox" data-p-wiki-pag="${i}" ${["nuevo", "cambia", "sobra"].includes(x.estado) ? (x.elegida !== false ? "checked" : "") : "disabled"}><span><b data-sin-traducir>${esc(x.pagina === "_Sidebar" ? tr("Índice de la wiki (_Sidebar)") : x.pagina.replace(/-/g, " "))}</b><small data-sin-traducir>${esc(x.ruta || "")}</small></span></label><span class="p-estado ${ESTADO_PAGINA[x.estado][1]}" data-sin-traducir>${esc(tr(ESTADO_PAGINA[x.estado][0]))}</span></div>`).join("")}</div>
        <div class="pz-pie"><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="p-wiki-publicar" ${n ? "" : "disabled"} data-sin-traducir>${n === 1 ? T("Publicar 1 página") : n ? T("Publicar {n} páginas", { n }) : T("La wiki está al día")}</button></div>`;
    }

    // ───────────── El lienzo: enlazar un nodo con un elemento ─────────────
    function enProyecto() { return !!(E.proyecto && E.sel && enDocs(E.sel)); }
    function botonElemento(nodo) {
      if (!enProyecto()) return "";
      const id = M.refsDiagrama(api.textoLienzo())[nodo], el = id && elemento(id);
      // Texto fijo en español: pintarSeleccion lo traduce (traducirDOM).
      return el ? `<button class="pz-boton" data-p-elemento="${esc(el.id)}" title="Ver el elemento">${ic("elemento")} <span data-sin-traducir>${esc(el.nombre)}</span></button>`
        : `<button class="pz-boton" data-accion="p-enlazar" title="Conectar con un elemento del proyecto">${ic("elemento")} Enlazar</button>`;
    }
    function etiquetaElegida() {
      const s = E.elegido, t = api.textoLienzo();
      if (!s) return "";
      if (M.tipoDiagrama(t).tipo === "secuencia") return M.parsearSecuencia(t).idx.get(s.id)?.etiqueta || s.id;
      return M.parsearFlujo(t).nodos.get(s.id)?.etiqueta || s.id;
    }
    function menuElementosHTML() {
      const x = esquema(), et = etiquetaElegida();
      const ya = x.elementos.find((e) => e.nombre.toLowerCase() === et.toLowerCase());
      return `<h4>Enlazar con</h4>${x.elementos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((e) => `<button data-p-enlazar="${esc(e.id)}" data-sin-traducir>${ic("elemento")} ${esc(e.nombre)}</button>`).join("")}
        ${ya ? "" : `<button data-p-enlazar-nuevo="1">${ic("mas")} ${frase("Nuevo elemento «{x}»", { x: et })}</button>`}`;
    }
    function enlazar(id) {
      const s = E.elegido;
      if (!s) return;
      api.ponerTextoLienzo(M.ponerRef(api.textoLienzo(), s.id, id), { origen: "lienzo" });
      E.menu = null; api.pintarMenu();
      toast(Tp("Enlazado con «{x}»", { x: elemento(id)?.nombre || id }), true);
      api.pintar();
    }
    function nuevoElemento(nombre, tipo, descripcion) {
      const x = clon(esquema());
      const el = { id: M.idElemento(nombre, x.elementos.map((e) => e.id)), tipo, nombre: nombre.trim().slice(0, 80) };
      if (descripcion && descripcion.trim()) el.descripcion = descripcion.trim().slice(0, 500);
      if (M.validarElemento(el).length) return null;
      x.elementos.push(el);
      conGlosario(x);
      const g = escribir(glosarioRuta(), M.glosario(x, E.idioma));
      E.proyecto.esquema = x;
      pj.espera = { pendientes: new Set(g !== undefined ? [glosarioRuta()] : []), esquema: false, mensaje: null };
      enviar("guardar", { esquema: x });
      E.proyecto.pendiente = true;
      return el;
    }

    // ───────────── Eventos ─────────────
    function clic(t, d) {
      if (d.pResponder !== undefined) { abrirPreguntas(d.pResponder); return true; }
      if (d.pResp !== undefined && pj.preguntas) { responderPregunta("opcion", Number(d.pResp)); return true; }
      if (d.huEstado !== undefined) { cambiarEstadoHU(d.huEstado); return true; }
      if (d.pCerrarHu !== undefined) { terminarHU((E.proyecto?.historias || []).find((x) => x.ruta === d.pCerrarHu)); return true; }
      if (d.pBorrar !== undefined) { pedirBorrar(d.pBorrar); return true; }
      if (d.pTipoProyecto !== undefined && pj.dialogo?.tipo === "nuevo-proyecto") { const x = pj.dialogo; x.texto = $("#p-pegar")?.value ?? x.texto; x.t = d.pTipoProyecto; api.pintar(); return true; }
      if (d.pContenido !== undefined && pj.dialogo?.tipo === "agregar") { const x = pj.dialogo; x.titulo = $("#p-titulo")?.value ?? x.titulo; x.elegido = d.pContenido; api.pintar(); return true; }
      if (d.pQuitarArchivo !== undefined && pj.dialogo) { const x = pj.dialogo, a = x.archivos.splice(Number(d.pQuitarArchivo), 1)[0]; if (a) pj.datosArchivos = (pj.datosArchivos || []).filter((y) => y.nombre !== a.nombre); api.pintar(); return true; }
      if (d.tDescartar !== undefined) { enviar("continuar", { id: d.tDescartar, descartar: true }); pj.esperan = (pj.esperan || []).filter((x) => x.id !== d.tDescartar); if (pj.trabajo?.id === d.tDescartar) pj.trabajo = { ...pj.trabajo, descartado: true }; toast("Quedan como preguntas abiertas en el documento"); api.pintar(); return true; }
      if (d.tPropuestas !== undefined) { abrirPropuestasDe(d.tPropuestas, pj.propuestasDe?.[d.tPropuestas]); return true; }
      if (d.pFicha !== undefined) { E.lateral = false; pj.ficha = d.pFicha; E.panel = "ficha"; E.sel = null; api.pintar(); return true; }
      if (d.tReintentar !== undefined && pj.trabajo) { if (pj.trabajo.tipo === "documentar" || !pj.trabajo.tipo) enviar("documentar", { reintentar: pj.trabajo.id, ruta: d.tReintentar, idioma: E.idioma }); else enviar("continuar", { id: pj.trabajo.id, reintentar: d.tReintentar, idioma: E.idioma }); const i = pj.trabajo.items.find((x) => x.ruta === d.tReintentar); if (i) { i.estado = "cola"; delete i.error; delete i.error_ia; } if (!corriendo()) { pj.trabajo.estado = "corriendo"; relojTrabajo(); } api.pintar(); return true; }
      if (d.tQuitar !== undefined && pj.trabajo) {
        const i = pj.trabajo.items.find((x) => x.ruta === d.tQuitar);
        const id = pj.trabajo.id;
        ui.confirmar({ titulo: "¿Quitar «{x}»?", valores: { x: i?.titulo || d.tQuitar }, texto: i?.nuevo === false ? "Vuelvo este documento a como estaba antes. Queda en la historia de versiones." : "Era nuevo: lo saco de la documentación. Queda en la historia de versiones.",
          si: "Quitar este cambio", no: "Dejarlo" }).then((si) => { if (si) { api.guardarTodo(); enviar("quitar", { id, ruta: d.tQuitar }); } });
        return true;
      }
      if (d.p) {
        E.lateral = false; E.panel = d.p;
        if (d.p === "versiones") cargarVersiones();
        if (d.p !== "elementos" || movil()) { pj.editar = null; if (movil()) pj.elemento = null; }  // en celular, Elementos abre la lista
        api.pintar(); return true;
      }
      if (d.pDocs !== undefined) {
        // La carpeta «Documentación»: abre lo que tiene y lo que le falta (o, vacía, la invitación a documentar todo).
        E.abiertas["#docs"] = (E.panel === "proyecto" || (sinDocumentacion() && !E.panel)) && !E.sel ? !(E.abiertas["#docs"] ?? true) : true;
        // Sin documentación todavía: el inicio de la carpeta, que invita a hacerla completa.
        E.panel = sinDocumentacion() ? null : "proyecto"; E.sel = null; E.lateral = false; api.pintar(); return true;
      }
      if (d.pReciente !== undefined) { E.lateral = false; pj.pedido = true; host.enviar("abrirProyecto", { indice: Number(d.pReciente) }); return true; }
      if (d.pElemento !== undefined && !d.accion) { E.lateral = false; E.menu = null; pj.elemento = d.pElemento; pj.editar = null; E.panel = "elementos"; api.pintar(); return true; }
      if (d.abrir && d.pBloque !== undefined) { api.abrir(d.abrir); const k = Number(d.pBloque); if (k >= 0) { E.bloque = k; E.lz.ajustar = true; if (movil()) E.vista = "dibujo"; api.pintar(); } return true; }
      if (d.pVer !== undefined) { const p = E.propuestas.lista[Number(d.pVer)]; p.ver = !p.ver; api.pintar(); return true; }
      if (d.pConfirmar !== undefined) { const p = E.propuestas.lista[Number(d.pConfirmar)]; if (!p.error) { p.confirmada = !p.confirmada; p.quitada = false; } api.pintar(); return true; }
      if (d.pQuitar !== undefined) {
        if (d.pQuitar === "el") E.propuestas.elementosQuitados = !E.propuestas.elementosQuitados;
        else { const p = E.propuestas.lista[Number(d.pQuitar)]; if (!p.error) p.quitada = !p.quitada; }
        api.pintar(); return true;
      }
      if (d.pFondo !== undefined) { const x = pj.dialogo; if (x?.aFondo) { x.fondo = !x.fondo; api.pintar(); } return true; }
      if (d.pFila !== undefined) { const f = pj.dialogo?.filas?.[Number(d.pFila)]; if (f) { f.elegido = !f.elegido; f.revisado = true; api.pintar(); } return true; }
      if (d.pReemplazar !== undefined) { const f = pj.dialogo?.filas?.[Number(d.pReemplazar)]; if (f) { f.reemplazar = !f.reemplazar; if (f.reemplazar) f.elegido = true; api.pintar(); } return true; }
      if (d.pVerDif !== undefined) { const x = pj.dialogo; x.abierta = x.abierta === Number(d.pVerDif) ? null : Number(d.pVerDif); api.pintar(); return true; }
      if (d.pVersion !== undefined) { const v = pj.versiones; v.sel = v.sel === d.pVersion ? null : d.pVersion; v.abierto = null; if (v.sel) { if (!v.archivos[v.sel]) enviar("ver", { id: v.sel }); enviar("ver", { id: v.contra }); } api.pintar(); return true; }
      if (d.pDif !== undefined) { const v = pj.versiones; v.abierto = v.abierto === d.pDif ? null : d.pDif; api.pintar(); return true; }
      if (d.pVerCambio !== undefined) { const c = pj.dialogo; c.abierto = c.abierto === Number(d.pVerCambio) ? null : Number(d.pVerCambio); api.pintar(); return true; }
      if (d.pTipo) { const c = pj.dialogo; c.nombre = $("#p-el-nombre")?.value ?? c.nombre; c.descripcion = $("#p-el-desc")?.value ?? c.descripcion; c.tipoEl = d.pTipo; api.pintar(); return true; }
      if (d.pEnlazar) { enlazar(d.pEnlazar); return true; }
      if (d.pEnlazarNuevo) { const s = E.elegido, et = etiquetaElegida(); const el = nuevoElemento(et, s?.tipo === "participante" ? "actor" : "otro"); if (el) enlazar(el.id); return true; }
      const a = d.accion;
      if (!a || !a.startsWith("p-")) return false;
      switch (a) {
        case "p-nuevo":
          E.nuevo = null; E.lateral = false;
          if (E.proyecto && ofrece("acciones", "flujo")) { pj.dialogo = { tipo: "flujo", pedido: "" }; api.pintar(); return true; }
          abrirNuevoProyecto(); return true;
        case "p-nuevo-en": E.lateral = false; E.nuevo = { fuente: "app", categoria: "todas", busqueda: "", elegida: null, nombre: "" }; api.pintar(); return true;
        case "p-historia": abrirAgregar("historia"); return true;
        case "p-agregar-algo": abrirAgregar(); return true;
        case "p-incorporar": abrirAgregar("incorporar"); return true;
        case "p-elegir-archivos": $("#p-archivos")?.click(); return true;
        case "p-detectar": detectar(); return true;
        case "p-volver-entrada": { const x = pj.dialogo; x.paso = "entrada"; x.det = null; api.pintar(); return true; }
        case "p-agregar-enviar": enviarAgregar(); return true;
        case "p-a-libro": { const x = pj.dialogo; pj.dialogo = { tipo: "nuevo-proyecto", t: "libro", paso: "detectado", det: x.det, titulo: $("#p-titulo")?.value || x.titulo, texto: x.texto, archivos: x.archivos, leyendo: 0 }; api.pintar(); return true; }
        case "p-crear-libro": { const x = pj.dialogo, titulo = ($("#p-titulo")?.value || x.titulo || "").trim(); if (!titulo) { toast("Ponle un nombre"); return true; } const carpeta = x.paso === "carpeta"; x.titulo = titulo; x.paso = "creando"; enviar("crear", carpeta ? { desde_carpeta: true, titulo, idioma: E.idioma } : { token: x.det.token, titulo, idioma: E.idioma }); api.pintar(); return true; }
        case "p-vincular": pj.dialogo = null; enviar("vincular"); api.pintar(); return true;
        case "p-elegir-codigo": pj.dialogo = null; pj.pedido = true; host.enviar("elegirCarpeta", { proyecto: true }); api.pintar(); return true;
        case "p-preg-siguiente": responderPregunta("siguiente"); return true;
        case "p-preg-nose": responderPregunta("nose"); return true;
        case "p-preg-saltar": responderPregunta("saltar"); return true;
        case "p-preg-atras": { const q = pj.preguntas, libre = ($("#preg-libre")?.value || "").trim(), t2 = trabajoPorId(q.id), pr = t2?.preguntas[q.k]; if (pr && libre) q.respuestas[pr.id] = { respuesta: libre }; q.k = Math.max(0, q.k - 1); api.pintar(); return true; }
        case "p-hu-terminar": terminarHU(); return true;
        case "p-estudiar": E.lateral = false; pj.esperando = true; pj.trabajo = null; E.panel = "proyecto"; E.sel = null; enviar("estudiar", { idioma: E.idioma }); relojTrabajo(); api.pintar(); return true;
        case "p-incongruencias": E.lateral = false; pj.esperando = true; pj.trabajo = null; E.panel = "proyecto"; E.sel = null; enviar("incongruencias", { idioma: E.idioma }); relojTrabajo(); api.pintar(); return true;
        case "p-seguir-libro": if (pj.trabajo) { if (pj.trabajo.estado === "esperando") abrirPreguntas(pj.trabajo.id); else { enviar("continuar", { id: pj.trabajo.id, idioma: E.idioma }); pj.trabajo.estado = "corriendo"; relojTrabajo(); api.pintar(); } } return true;
        case "p-wiki": abrirWiki(); return true;
        case "p-wiki-no": pj.ofrecerWiki = false; api.pintar(); return true;
        case "p-wiki-url": { const u = ($("#p-wiki-url")?.value || "").trim(); if (!u) return true; pj.dialogo.intento = true; abrirWiki(u); pj.dialogo.intento = true; return true; }
        case "p-wiki-publicar": { const x = pj.dialogo; x.publicando = true; enviar("wiki_publicar", { idioma: E.idioma, paginas: x.paginas.filter((y) => y.elegida !== false && ["nuevo", "cambia", "sobra"].includes(y.estado)).map((y) => y.pagina) }); api.pintar(); return true; }
        case "p-documentar":
          E.nuevo = null; E.lateral = false; E.sel = null;
          if (corriendo()) { E.panel = "proyecto"; api.pintar(); return true; }
          if (E.proyecto) { pedirIA("inicial", { docs: docsDir() }); return true; }
          if (!E.carpeta) { pj.pedido = true; host.enviar("elegirCarpeta", { proyecto: true }); return true; }
          if (vinculado()) { E.panel = "proyecto"; E.encontrado = { cargando: true, docs: "" }; enviar("leer"); api.pintar(); return true; }
          enviar("vincular"); return true;  // la documentación va aparte: después se abre «Lo que encontré»
        case "p-agregar": abrirNuevoProyecto(); return true;
        case "p-mover": enviar("mover"); toast("Copiando la documentación a ~/Esquema…"); return true;
        case "p-pasar": abrirPasar(); return true;
        case "p-pasar-enviar": {
          const d = pj.dialogo, elegidos = d.filas.filter((f) => f.elegido && f.valido !== false);
          if (!elegidos.length) { d.error = "Elige al menos un archivo."; api.pintar(); return true; }
          d.enviando = true; api.guardarTodo(); api.pintar();
          setTimeout(() => enviar("pasar", { archivos: elegidos.map((f) => ({ ruta: f.ruta, destino: f.destino, reemplazar: !!f.reemplazar })) }), 700);
          return true;
        }
        case "p-generar-inicial": {
          if (vinculado()) { pedirIA("inicial", {}); return true; }
          const docs = ($("#p-docs")?.value || "docs/esquema").trim().replace(/^\/+|\/+$/g, "");
          if (!/^[\w][\w.-]*(\/[\w][\w.-]*){0,3}$/.test(docs)) { toast("Esa carpeta para la documentación no sirve. Usa algo como docs/esquema."); return true; }
          E.encontrado.docs = docs;
          pedirIA("inicial", { docs }); return true;
        }
        case "p-enviar": enviarIA(); return true;
        case "p-cancelar": pj.generando = null; toast("Cancelé: si tu IA responde, no aplico nada"); api.pintar(); return true;
        case "p-ocultar": if (pj.generando) pj.generando.oculto = true; api.pintar(); return true;
        case "p-ver-generando": if (pj.generando) pj.generando.oculto = false; api.pintar(); return true;
        case "p-detener":
          ui.confirmar({ titulo: "¿Detener la documentación?", texto: "Lo que ya está escrito se queda guardado. Después puedes seguir donde quedó.", si: "Detener", no: "Seguir documentando" })
            .then((si) => { if (si && pj.trabajo) enviar("detener", { id: pj.trabajo.id }); });
          return true;
        case "p-seguir": if (pj.trabajo) { if (pj.trabajo.tipo === "documentar" || !pj.trabajo.tipo) enviar("documentar", { seguir: pj.trabajo.id, idioma: E.idioma }); else enviar("continuar", { id: pj.trabajo.id, idioma: E.idioma }); pj.trabajo.estado = "corriendo"; pj.trabajo.error = ""; pj.ultimoEvento = Date.now(); relojTrabajo(); E.panel = "proyecto"; api.pintar(); } return true;
        case "p-trabajo-visto": if (pj.trabajo) { pj.trabajo.visto = true; enviar("trabajo", { id: pj.trabajo.id, visto: true }); } api.pintar(); return true;
        case "p-completar": E.lateral = false; pedirIA("completar", { pedido: pedidoCompletar() }); return true;
        case "p-flujo": E.nuevo = null; E.lateral = false; pj.dialogo = { tipo: "flujo", pedido: "" }; api.pintar(); return true;
        case "p-flujo-enviar": {
          const pedido = ($("#p-pedido")?.value || "").trim();
          if (!pedido) { pj.dialogo.error = "Cuéntame qué quieres documentar."; api.pintar(); return true; }
          pedirIA("flujo", { pedido, tipo: api.tipoDelPedido(pedido) }); return true;
        }
        case "p-pedir-enviar": { const x = pj.dialogo; pedirIA(x.tarea, { ...x.datos, archivos: x.elegidas }); return true; }
        case "p-descartar": E.propuestas = null; E.panel = E.proyecto ? "proyecto" : E.encontrado ? "proyecto" : null; toast("No guardé nada"); api.pintar(); return true;
        case "p-aplicar": aplicarPropuestas(); return true;
        case "p-guardar-version": pj.dialogo = { tipo: "version", mensaje: tr("Actualicé la documentación") }; api.pintar(); return true;
        case "p-version-enviar": { const m = ($("#p-mensaje")?.value || "").trim() || tr("Actualicé la documentación"); pj.dialogo = null; api.guardarTodo(); setTimeout(() => enviar("version", { mensaje: m }), 700); toast("Guardando la versión…"); api.pintar(); return true; }
        case "p-deshacer": deshacerUltimo(); return true;
        case "p-revisar": {
          const { docs } = docsProyecto();
          E.proyecto.revision = M.docsAfectados(esquema(), docs, E.proyecto.cambios.commits);
          api.pintar(); return true;
        }
        case "p-revisar-ia": pedirIA("revisar", { documentos: E.proyecto.revision.documentos.map(rel) }); return true;
        case "p-cambios-vistos": E.proyecto.cambiosVistos = true; E.proyecto.revision = null; api.pintar(); return true;
        case "p-elemento-nuevo": pj.dialogo = { tipo: "nuevo-elemento", nombre: pj.buscar.trim(), tipoEl: "otro", descripcion: "" }; api.pintar(); return true;
        case "p-elemento-crear": {
          const c = pj.dialogo, nombre = ($("#p-el-nombre")?.value || "").trim(), desc = $("#p-el-desc")?.value || "";
          if (!nombre) { c.error = "Escribe un nombre."; api.pintar(); return true; }
          const el = nuevoElemento(nombre, c.tipoEl, desc);
          if (!el) { c.error = "Ese nombre no sirve."; api.pintar(); return true; }
          pj.dialogo = null; pj.elemento = el.id; pj.buscar = ""; E.panel = "elementos"; api.pintar(); return true;
        }
        case "p-volver-lista": pj.elemento = null; pj.editar = null; api.pintar(); return true;
        case "p-renombrar": pj.editar = { campo: "nombre", valor: elemento(pj.elemento).nombre }; api.pintar(); return true;
        case "p-describir": pj.editar = { campo: "descripcion", valor: elemento(pj.elemento).descripcion || "" }; api.pintar(); return true;
        case "p-editar-no": pj.editar = null; api.pintar(); return true;
        case "p-ver-cambio": {
          const el = elemento(pj.elemento), v = ($("#p-valor")?.value || "").trim();
          if (pj.editar.campo === "nombre") {
            if (!v || v.length > 80) { pj.editar.error = "Escribe un nombre."; api.pintar(); return true; }
            if (v === el.nombre) { pj.editar = null; api.pintar(); return true; }
            pj.dialogo = { tipo: "cambio", el, cambio: { tipo: "renombrar", nombre: v, tambienSinEnlace: false } };
          } else pj.dialogo = { tipo: "cambio", el, cambio: { tipo: "describir", descripcion: v.slice(0, 500) } };
          pj.editar = null; cargarDocs(); api.pintar(); return true;
        }
        case "p-quitar": pj.dialogo = { tipo: "cambio", el: elemento(pj.elemento), cambio: { tipo: "quitar", reconectar: true } }; cargarDocs(); api.pintar(); return true;
        case "p-aplicar-cambio": aplicarCambio(); return true;
        case "p-comportamiento": {
          const el = elemento(pj.elemento), { docs } = docsProyecto();
          pj.dialogo = { tipo: "comportamiento", el, pedido: "", documentos: M.usosElemento(docs, el).map((u) => rel(u.ruta)) }; api.pintar(); return true;
        }
        case "p-comportamiento-enviar": {
          const c = pj.dialogo, pedido = ($("#p-pedido")?.value || "").trim();
          if (!pedido) { c.error = "Cuéntame qué cambió."; api.pintar(); return true; }
          pedirIA("cambio", { pedido: `«${c.el.nombre}» (${c.el.id}): ${pedido}`, documentos: c.documentos }); return true;
        }
        case "p-restaurar": { const v = pj.versiones; pj.dialogo = { tipo: "restaurar", version: v.lista.find((x) => x.id === v.sel) }; api.pintar(); return true; }
        case "p-restaurar-si": { const id = pj.dialogo.version.id; pj.dialogo = null; api.guardarTodo(); enviar("restaurar", { id }); api.pintar(); return true; }
        case "p-enlazar": api.abrirMenu("elementos", t); return true;
      }
      return false;
    }
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "p-archivos" && t.files?.length) { const x = pj.dialogo; if (x) x.texto = $("#p-pegar")?.value ?? x.texto; leerArchivos(t.files); t.value = ""; return; }
      if (t.dataset?.pAfondo !== undefined && pj.dialogo?.tipo === "agregar") { pj.dialogo.aFondo = t.checked; return; }
      if (t.dataset?.pWikiPag !== undefined && pj.dialogo?.tipo === "wiki") { const x = pj.dialogo.paginas[Number(t.dataset.pWikiPag)]; if (x) x.elegida = t.checked; api.pintar(); return; }
      if (t.id === "p-contra" && pj.versiones) { pj.versiones.contra = t.value; pj.versiones.abierto = null; enviar("ver", { id: t.value }); api.pintar(); }
      if (t.dataset?.pOpcion && pj.dialogo?.tipo === "cambio") { pj.dialogo.cambio[t.dataset.pOpcion] = t.checked; api.pintar(); }
      if (t.dataset?.pElegir !== undefined && pj.dialogo?.tipo === "pedir") { const r = pj.dialogo.rutas[Number(t.dataset.pElegir)]; pj.dialogo.elegidas = t.checked ? [...pj.dialogo.elegidas, r] : pj.dialogo.elegidas.filter((x) => x !== r); api.pintar(); }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "p-buscar") { pj.buscar = e.target.value; const pos = e.target.selectionStart; api.pintar(); const b = $("#p-buscar"); if (b) { b.focus(); b.selectionStart = b.selectionEnd = pos; } }
      if (e.target.id === "p-valor" && pj.editar) pj.editar.valor = e.target.value;
      if (e.target.id === "p-pegar" && pj.dialogo && "texto" in pj.dialogo) pj.dialogo.texto = e.target.value;
      if (e.target.id === "p-titulo" && pj.dialogo) pj.dialogo.titulo = e.target.value;
    });
    // Preguntas con teclado: 1–5 eligen una opción; Enter en «Otra respuesta» sigue (Mayúscula+Enter, salto de línea).
    document.addEventListener("keydown", (e) => {
      if (E.panel !== "preguntas" || !pj.preguntas || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.id === "preg-libre" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); responderPregunta("siguiente"); return; }
      if (/^[1-5]$/.test(e.key) && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
        const b = document.querySelector(`.pregunta [data-p-resp="${Number(e.key) - 1}"]`);
        if (b) { e.preventDefault(); b.click(); }
      }
    });
    // Soltar archivos: en «Agregar» se suman; con un proyecto abierto, abren «Agregar»; sin carpeta, un proyecto nuevo (un libro).
    document.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); document.querySelector("[data-p-soltar]")?.classList.add("encima"); } });
    document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.querySelector("[data-p-soltar]")?.classList.remove("encima"); });
    document.addEventListener("drop", (e) => {
      if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
      e.preventDefault();
      const archivos = e.dataTransfer.files;
      if (!archivos?.length || enBienvenida()) return;
      if (pj.dialogo?.tipo === "agregar" || (pj.dialogo?.tipo === "nuevo-proyecto" && tipoDe(pj.dialogo.t).fuente === "texto")) { pj.dialogo.texto = $("#p-pegar")?.value ?? pj.dialogo.texto; return leerArchivos(archivos); }
      if (pj.dialogo || ui.hayCapa || E.nuevo) return;
      if (E.carpeta && ofrece("acciones", "agregar")) return abrirAgregar(null, archivos);
      if (!E.carpeta) return abrirNuevoProyecto("libro", archivos);
    });
    document.addEventListener("toggle", (e) => { const s = e.target; if (s.tagName === "DETAILS" && pj.dialogo?.tipo === "envio") { const i = [...document.querySelectorAll(".p-envio details")].indexOf(s); if (s.open) pj.dialogo.abierta = i; else if (pj.dialogo.abierta === i) pj.dialogo.abierta = null; } }, true);

    /** Después de cada pintada: las vistas previas de Markdown con sus diagramas y las marcas de lo que cambió en un diagrama. */
    function despuesDePintar() {
      for (const el of document.querySelectorAll("[data-p-md]")) {
        const p = E.propuestas?.lista[Number(el.dataset.pMd)];
        if (!p) continue;
        el.innerHTML = M.markdownHTML(p.texto);
        const bloques = M.bloquesMermaid(p.texto);
        el.querySelectorAll(".md-diagrama").forEach((fig) => { const b = bloques[Number(fig.dataset.bloque)], r = b && api.resultadoBloque(b.contenido, "pp" + fig.dataset.bloque); fig.innerHTML = r && r.partes.length && !r.errores.length ? M.svgCompleto(r, { estilo: "" }) : `<pre><code>${esc(b?.contenido || "")}</code></pre>`; });
      }
      for (const el of document.querySelectorAll("[data-marcar]")) {
        let m; try { m = JSON.parse(el.dataset.marcar); } catch { continue; }
        for (const [clase, ids] of Object.entries(m)) for (const id of ids) for (const n of el.querySelectorAll(`.nodo[data-id="${CSS.escape(id)}"], [data-participante="${CSS.escape(id)}"]`)) n.classList.add("dif-" + clase);
      }
    }
    /** Un enlace a un elemento (elementos.md#el-…) abre su ficha; uno relativo a otro documento del proyecto, ese documento. */
    function enlace(url) {
      const m = /elementos\.md#el-([a-z0-9-]+)$/.exec(url);
      if (m && E.proyecto && elemento(m[1])) { pj.elemento = m[1]; pj.editar = null; E.panel = "elementos"; api.pintar(); return true; }
      if (E.sel && !/^[a-z]+:/i.test(url) && !url.startsWith("#")) {
        const partes = (E.sel.split("/").slice(0, -1).join("/") + "/" + url.split("#")[0]).split("/"), r = [];
        for (const p of partes) { if (!p || p === ".") continue; if (p === "..") r.pop(); else r.push(p); }
        const destino = r.join("/");
        if (E.archivos.some((a) => a.ruta === destino)) { api.abrir(destino); return true; }
      }
      return false;
    }

    // ───────────── Lo que avisa app.js ─────────────
    function alCambiarCarpeta(r) {
      E.proyecto = null; E.encontrado = null; E.vinculo = null; E.codigoDocs = null; E.codigoArbol = null; pj.ofrecerPasar = false;
      pj.trabajo = null; pj.esperando = false; pj.pidioTrabajo = false; pj.ficha = null; E.propuestas = null; pj.versiones = null; pj.elemento = null; pj.ultimo = null; pj.dialogo = null;
      pj.esperan = []; pj.preguntas = null; pj.ofrecerWiki = false; E.tipoProyecto = null;
      if (E.panel) E.panel = null;
      if (r && r.proyecto) { pj.pedido = true; E.panel = "proyecto"; }
      if (E.carpeta) enviar("abrir", { docs: undefined });
    }
    function alAbrirArchivo() { if (E.panel && E.proyecto) api.pintar(); }
    function alGuardarArchivo(ruta, ok) {
      if (!pj.espera) return;
      if (!ok) toast(Tp("No pude guardar {x}", { x: ruta }), true);
      pj.espera.pendientes.delete(ruta);
      revisarEspera();
    }
    function alCambiarArchivos() { if (E.proyecto) cargarDocs(); armarArbol(); }
    function hayDialogo() { return !!(pj.dialogo || (pj.generando && !pj.generando.oculto)); }
    /** Escape o tocar fuera: cierra el diálogo, pero NUNCA cancela lo que hace la IA: su respuesta se muestra igual al llegar. */
    function cerrarDialogo() { pj.dialogo = null; if (pj.generando) pj.generando.oculto = true; }

    /** «Código» se abre solo mientras la IA lo lee (si la persona no lo abrió o cerró a mano): así se ve qué está leyendo. */
    const leyendoCodigo = () => corriendo() && pj.trabajo?.etapa === "explorar";
    /** «Nuevo en <proyecto>»: lo que se crea con la IA según el tipo, arriba de las plantillas (en el diálogo «Nuevo» de app.js). */
    /** Para una carpeta que todavía no tiene documentación (su inicio): lo mismo que el panel de un proyecto. */
    const accionesInicio = () => accionesHTML();
    function nuevoCabHTML() {
      const t = tipoActual(), n = nombreProyecto(), l = [];
      const tarjeta = (accion, icono, titulo, texto) => `<button class="tarjeta-inicio compacta" data-accion="${accion}"><span class="ti-icono">${ic(icono)}</span><span class="ti-txt"><b>${titulo}</b><small>${texto}</small></span></button>`;
      if (t.nuevo.includes("historia")) l.push(tarjeta("p-historia", "persona", "Historia de usuario", "Pégala: tu IA te ayuda a entenderla y la documenta."));
      if (t.nuevo.includes("incorporar")) l.push(tarjeta("p-incorporar", "bandeja", "Agregar información", "Notas, un correo, lo de una reunión… Tu IA lo ordena: crea lo nuevo, completa lo que existe y corrige lo que cambió."));
      if (t.nuevo.includes("agregar")) l.push(tarjeta("p-agregar-algo", "archivo", "Agregar un documento", t.nuevo.includes("incorporar") ? "Un acta, una especificación o un libro, entero y con su resumen. Esquema detecta qué es." : "PDF, Word, EPUB, un acta o un libro: Esquema detecta qué es."));
      if (t.nuevo.includes("diagrama")) l.push(tarjeta("crear-diagrama", "chispa", "Crear diagrama con tu IA", "Dile qué quieres ver y lo dibuja."));
      if (t.acciones.includes("flujo") && E.proyecto) l.push(tarjeta("p-flujo", "flecha", "Documentar un flujo", "Paso a paso, con su diagrama y los elementos conectados."));
      return { titulo: E.carpeta ? frase("Nuevo en {x}", { x: n }) : "Nuevo", tarjetas: l.join(""), readme: t.acciones.includes("readme") };
    }
    /** Dónde queda lo nuevo que se crea desde una plantilla: en su sección de la documentación (si el proyecto ya tiene). */
    function prefijoNuevo(esDiagrama) {
      if (!E.proyecto) return "";
      return completa(esDiagrama ? "diagramas/" : tipoActual().fuente === "texto" ? "notas/" : "documentos/");
    }
    return { progreso, codigoAbierta, leyendoCodigo, lateralHTML, recientesHTML, marcaArchivo, barraDocHTML, puedeBorrar, pedirBorrar, alPapelera, abrirAgregar, abrirNuevoProyecto, nuevoCabHTML, prefijoNuevo, tipoActual, accionesInicio, esProyecto, sinDocumentacion, esDeCodigo, esCodigo, leerCodigo, guardarCodigo, barraHTML, areaHTML, dialogoHTML, menuElementosHTML, botonElemento, clic, respuesta, despuesDePintar, enlace, pedirIA,
      alCambiarCarpeta, alAbrirArchivo, alGuardarArchivo, alCambiarArchivos, hayDialogo, cerrarDialogo, simular, simAbrir,
      _: { armarPropuestas, docsProyecto, cargarDocs, loQueFalta, pedidoCompletar, ordenDocs } };

    // ───────────── Vista previa en el navegador: un proyecto ficticio (ui/demo.json → proyecto) ─────────────
    function simular(d, memoria, DEMO, luego) {
      // Cada proyecto de la vista previa tiene su estado (la carpeta de ejemplo, y los libros que se crean): `act`.
      const A = window.Esquema, act = proyectoSim(DEMO), sim = act.sim, docs = act.docs, pref = docs ? docs + "/" : "";
      if (["detectar", "agregar", "crear", "responder", "continuar", "borrar", "recuperar", "historia_estado", "historia_cierre", "estudiar", "incongruencias", "wiki_preparar", "wiki_publicar"].includes(d.orden)
        || (d.orden === "trabajo" && sim.trabajo && sim.trabajo.tipo !== "documentar")) return simularMas(d, memoria, DEMO, luego, act);
      const responder = (r, ms = 120) => luego(ms, () => A.proyectoRespuesta({ orden: d.orden, ...r }));
      const enDocsSim = () => Object.fromEntries(Object.entries(memoria).filter(([k]) => k.startsWith(pref)).map(([k, v]) => [k.slice(pref.length), v]));
      const leerEsquema = () => { try { return JSON.parse(memoria[pref + "esquema.json"]); } catch { return null; } };
      const recientes = () => recientesSim(DEMO, memoria);
      // El repo del código, para «Pasar al proyecto» (en memoria; ya trae una arquitectura vieja para mostrar «Ya existe»).
      sim.repo = sim.repo || { "docs/arquitectura.md": "# Arquitectura\n\nLa versión que estaba en el repo.\n" };
      const lugar = () => (act.sola ? { vinculado: true, sola: true, ubicacion: act.ubicacion, codigo: "" } : sim.vinculado ? { vinculado: true, ubicacion: "~/Esquema/" + DEMO.carpeta.nombre, codigo: DEMO.carpeta.nombre } : {});
      const pr = DEMO.proyecto;
      switch (d.orden) {
        case "abrir": { const x = leerEsquema(); return responder({ ok: true, existe: !!x, docs, esquema: x, git: { hay: true }, cambios: sim.cambios || null, pendiente: sim.pendiente !== false && !!x && !sim.versiones.length, recientes: recientes(), tipo: act.tipo, historias: historiasSim(memoria, pref), esperan: (sim.trabajos || []).filter((t) => t.estado === "esperando").map(clon), wiki: true, ...lugar() }); }
        case "vincular": sim.vinculado = true; return responder({ ok: true, indice: 0, ubicacion: lugar().ubicacion, recientes: recientes() });
        case "mover": sim.vinculado = true; return responder({ ok: true, indice: 0, desde: docs, ubicacion: lugar().ubicacion, recientes: recientes() });
        case "codigo": {
          if (!sim.vinculado) return responder({ ok: false, error: "Este proyecto no tiene una carpeta de código vinculada." });
          const arch = [...new Set(["README.md", ...Object.keys(sim.repo)])].filter((x) => /\.(md|mmd)$/.test(x)).map((ruta) => ({ ruta, tamano: (sim.repo[ruta] ?? memoria["README.md"] ?? "").length }));
          return responder({ ok: true, nombre: DEMO.carpeta.nombre, ubicacion: "~/" + DEMO.carpeta.nombre, archivos: arch });
        }
        case "codigo_leer": { const t = sim.repo[d.ruta] ?? (!d.ruta.startsWith(pref) ? memoria[d.ruta] : null) ?? null; return responder(t != null ? { ok: true, ruta: d.ruta, texto: t } : { ok: false, ruta: d.ruta, error: tr("No encontré el archivo") }, 20); }
        case "codigo_guardar": sim.repo[d.ruta] = d.texto; return responder({ ok: true, ruta: d.ruta }, 40);
        case "destinos": return responder({ ok: true, codigo: DEMO.carpeta.nombre, estados: Object.fromEntries((d.rutas || []).map((x) => [x, sim.repo[x] != null ? { valido: true, existe: true, texto: sim.repo[x] } : { valido: /^[\w.-]+(\/[\w.-]+)*\.(md|mmd)$/.test(x), existe: false }])) });
        case "pasar": {
          const escritos = [], saltados = [];
          for (const a of d.archivos || []) {
            const t = memoria[pref + a.ruta];
            if (t == null) saltados.push({ ruta: a.ruta, motivo: "no-existe" });
            else if (sim.repo[a.destino] != null && !a.reemplazar) saltados.push({ ruta: a.ruta, destino: a.destino, motivo: "existe" });
            else { sim.repo[a.destino] = t; escritos.push({ ruta: a.ruta, destino: a.destino }); }
          }
          return responder({ ok: true, escritos, saltados, codigo: DEMO.carpeta.nombre });
        }
        case "leer": return responder({ ok: true, encontrado: { ...pr.encontrado, docs: d.docs || docs } }, 300);
        case "preparar": {
          const piezas = [], rechazados = [];
          const pieza = (clave, titulo, texto, ruta) => piezas.push({ clave, titulo, texto, bytes: new TextEncoder().encode(texto).length, ...(ruta ? { ruta } : {}) });
          if (d.pedido) pieza("pedido", "Lo que pides", d.pedido);
          if (d.tarea === "inicial" || d.tarea === "flujo") { pieza("lista", "Lista de archivos del proyecto (solo nombres)", pr.archivos.join("\n")); pieza("archivo", "README.md", memoria["README.md"] || "", "README.md"); }
          if (d.tarea === "inicial") pieza("git", "Historia de git (fecha y mensaje, sin autores)", pr.encontrado.git.commits.map((c) => `${c.fecha} ${c.mensaje}`).join("\n"));
          const x = leerEsquema();
          if (x && d.tarea !== "inicial") { pieza("elementos", "Elementos del proyecto", JSON.stringify(x.elementos, null, 1)); pieza("indice", "Documentos que ya existen", x.documentos.map((y) => `${y.ruta} — ${y.titulo}`).join("\n")); }
          for (const r of d.documentos || []) if (memoria[pref + r] != null) pieza("documento", r, memoria[pref + r], r);
          for (const r of d.archivos || []) { if (pr.codigo[r] != null) pieza("archivo", r, pr.codigo[r], r); else rechazados.push({ ruta: r, motivo: "fuera" }); }
          const aFondo = ["inicial", "flujo", "completar"].includes(d.tarea) ? { a_fondo: { carpeta: "~/" + DEMO.carpeta.nombre, no_leer: [".env", ".env.*", "*.pem", "*.key", ".git/"], puede: true } } : {};
          return responder({ ok: true, tarea: d.tarea, docs, piezas, rechazados, bytes: piezas.reduce((s, p) => s + p.bytes, 0), ...aFondo }, 150);
        }
        case "generar": return luego(600, () => A.proyectoRespuesta({ orden: "generar", ...generarSimulado(d, memoria, docs, pr) }));
        case "arbol": {
          if (act.sola) return responder({ ok: true, nombre: "", ubicacion: "", vinculado: true, sin_codigo: true, archivos: [], omitidos: 0, perfil: null, lecturas: {} }, 40);
          // Todo el código del ejemplo (lo que no es la documentación) y lo que la «IA» leyó en esta sesión.
          const lect = {}; for (const r of sim.trabajo?.vistos || []) lect[r] = { f: sim.trabajo.inicio.slice(0, 19) };
          if (sim.cambiado && lect[sim.cambiado]) lect[sim.cambiado].c = true;
          const arch = pr.arbol.archivos.filter((a) => !a[0].startsWith(pref));
          for (const [r, t] of Object.entries(sim.repo)) if (sim.vinculado && !arch.some((a) => a[0] === r)) arch.push([r, t.length, "d"]);
          return responder({ ok: true, nombre: DEMO.carpeta.nombre, ubicacion: "~/" + DEMO.carpeta.nombre, vinculado: !!sim.vinculado, archivos: arch, omitidos: 0, perfil: pr.arbol.perfil, lecturas: lect }, 80);
        }
        case "documentar": case "trabajo": case "detener": case "quitar": return simularTrabajo(d, memoria, docs, pr, A, sim, luego);
        case "guardar": {
          const e = M.validarEsquema(d.esquema);
          if (e.length) return responder({ ok: false, error: "No guardé esquema.json: " + e.join("; ") });
          memoria[pref + "esquema.json"] = JSON.stringify(d.esquema, null, 2) + "\n";
          sim.pendiente = true;
          return responder({ ok: true, docs, esquema: d.esquema, recientes: recientes() });
        }
        case "version": {
          const archivos = enDocsSim(), ult = sim.versiones[0];
          if (ult && JSON.stringify(ult.archivos) === JSON.stringify(archivos)) return responder({ ok: true, modo: "git", sin_cambios: true });
          const id = Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
          sim.versiones.unshift({ id, fecha: new Date(Date.now() + sim.versiones.length * 1000).toISOString(), mensaje: String(d.mensaje || "").slice(0, 300) || "Actualicé la documentación", archivos });
          sim.pendiente = false;
          return responder({ ok: true, modo: "git", id, mensaje: sim.versiones[0].mensaje });
        }
        case "versiones": { const ult = sim.versiones[0]; return responder({ ok: true, modo: "git", lista: sim.versiones.map(({ id, fecha: f, mensaje }) => ({ id, fecha: f, mensaje })), pendiente: !ult ? !!leerEsquema() : JSON.stringify(ult.archivos) !== JSON.stringify(enDocsSim()) }); }
        case "ver": {
          if (d.id === "actual") return responder({ ok: true, id: "actual", docs, archivos: enDocsSim() });
          const v = sim.versiones.find((x) => x.id === d.id);
          return responder(v ? { ok: true, id: d.id, docs, archivos: v.archivos } : { ok: false, error: "No encontré esa versión." });
        }
        case "restaurar": {
          const v = sim.versiones.find((x) => x.id === d.id);
          if (!v) return responder({ ok: false, error: "No encontré esa versión." });
          const ahora = enDocsSim(), escritos = [];
          for (const [k, t] of Object.entries(v.archivos)) if (ahora[k] !== t) { memoria[pref + k] = t; escritos.push(k); }
          return responder({ ok: true, docs, escritos, sobran: Object.keys(ahora).filter((k) => !(k in v.archivos)) });
        }
      }
    }

    // ───────────── Vista previa: un trabajo de documentar creíble (lee los archivos del ejemplo, escribe 2 a la vez) ─────────────
    // window._simVelocidad (0.1 = 10 veces más rápido) y window._simFallar (una ruta que falla la primera vez) son para las pruebas.
    function simularTrabajo(d, memoria, docs, pr, A, sim, luego) {
      const pref = docs ? docs + "/" : "";
      const g = pr.ia[d.idioma === "en" ? "en" : "es"], v = () => Number(window._simVelocidad) || 1;
      const emitir = (...eventos) => A.proyectoProgreso({ eventos });
      const vista = () => JSON.parse(JSON.stringify(sim.trabajo));
      const estado = () => emitir({ t: "estado", trabajo: vista() });
      const existentes = () => { try { return JSON.parse(memoria[pref + "esquema.json"]).documentos.map((x) => x.ruta); } catch { return []; } };
      if (d.orden === "trabajo") return luego(60, () => A.proyectoRespuesta({ orden: "trabajo", ok: true, trabajo: sim.trabajo ? vista() : null }));
      if (d.orden === "detener") { if (sim.trabajo) sim.detener = true; return luego(60, () => A.proyectoRespuesta({ orden: "detener", ok: true, deteniendo: true, trabajo: vista() })); }
      if (d.orden === "quitar") {
        const t = sim.trabajo, i = t?.items.find((x) => x.ruta === d.ruta);
        if (!i || i.estado !== "listo") return luego(60, () => A.proyectoRespuesta({ orden: "quitar", ok: false, error: tr("Ese documento no se puede quitar.") }));
        const antes = sim.antes[d.ruta];
        if (antes == null) { delete memoria[pref + d.ruta]; try { const x = JSON.parse(memoria[pref + "esquema.json"]); x.documentos = x.documentos.filter((y) => y.ruta !== d.ruta); memoria[pref + "esquema.json"] = JSON.stringify(x, null, 2) + "\n"; } catch { /* sin esquema */ } }
        else memoria[pref + d.ruta] = antes;
        i.estado = "quitado";
        archivosCambiaron(A, memoria, luego);
        return luego(80, () => A.proyectoRespuesta({ orden: "quitar", ok: true, trabajo: vista(), ruta: d.ruta, borrado: antes == null }));
      }
      // documentar: nuevo, seguir o reintentar
      if (d.reintentar && sim.trabajo) {
        const i = sim.trabajo.items.find((x) => x.ruta === d.ruta); if (i) { i.estado = "cola"; delete i.error; delete i.error_ia; }
        if (sim.corriendo) { sim.cola.push(d.ruta); return luego(40, () => A.proyectoRespuesta({ orden: "documentar", ok: true, encolado: true, trabajo: vista() })); }
      } else if (!d.seguir || !sim.trabajo) {
        if (sim.corriendo) return luego(40, () => A.proyectoRespuesta({ orden: "documentar", ok: false, error: tr("Ya estoy documentando este proyecto."), trabajo: vista() }));
        const plan = (d.tarea === "completar" ? g.inicial.filter((p) => !existentes().includes(p.ruta)) : g.inicial).map((p) => ({ ...p, ruta: p.ruta }));
        sim.plan = plan; sim.antes = {}; sim.fallo = window._simFallar || null;
        sim.trabajo = { id: "20261028T120000-" + Math.random().toString(16).slice(2, 8), tipo: "documentar", carpeta: E.carpeta?.ruta, estado: "corriendo", etapa: "inventario", etapas: ["inventario", "explorar", "escribir", "cerrar"],
          hechas: [], inicio: new Date().toISOString(), items: [], leidos: 0, leyendo: "", error: "", ia: nombreIA(), tipo_proyecto: pr.arbol.perfil.tipo, archivos: pr.arbol.archivos.length, partes: 0 };
      }
      const t = sim.trabajo;
      Object.assign(t, { estado: "corriendo", error: "" }); delete t.fin;
      sim.corriendo = true; sim.detener = false; sim.cola = [];
      const etapa = (e) => { if (t.etapa !== e && !t.hechas.includes(t.etapa)) t.hechas.push(t.etapa); t.etapa = e; estado(); };
      const fin = (est) => {
        if (est === "listo" && !t.hechas.includes(t.etapa)) t.hechas.push(t.etapa);
        for (const i of t.items) if (i.estado === "escribiendo") i.estado = "cola";
        Object.assign(t, { estado: est, fin: new Date().toISOString(), leyendo: "" }); sim.corriendo = false;
        if (t.items.some((i) => i.estado === "listo")) { sim.versiones.unshift({ id: Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""), fecha: new Date().toISOString(), mensaje: Tp(est === "detenido" ? "Documentación hecha con {ia} (detenida a medias)" : "Documentación hecha con {ia}", { ia: t.ia }), archivos: Object.fromEntries(Object.entries(memoria).filter(([k]) => k.startsWith(pref)).map(([k, x]) => [k.slice(pref.length), x])) }); sim.pendiente = false; }
        estado(); A.proyectoRespuesta({ orden: "documentar", ok: true, trabajo: vista() });
      };
      const esquemaAlDia = () => {
        let x; try { x = JSON.parse(memoria[pref + "esquema.json"]); } catch { x = null; }
        x = x || { formato: 1, nombre: pr.encontrado.nombre, descripcion: pr.encontrado.readme?.resumen?.slice(0, 1000) || undefined, documentos: [], elementos: [] };
        for (const el of g.elementos) if (!x.elementos.some((y) => y.id === el.id)) x.elementos.push(el);
        for (const i of t.items) if (i.estado === "listo" && !x.documentos.some((y) => y.ruta === i.ruta)) x.documentos.push({ ruta: i.ruta, titulo: i.titulo, tipo: i.tipo });
        if (!x.documentos.some((y) => y.ruta === M.GLOSARIO)) x.documentos.push({ ruta: M.GLOSARIO, titulo: tr("Elementos"), tipo: "glosario" });
        x.documentos.sort(ordenDocs);
        memoria[pref + "esquema.json"] = JSON.stringify(x, null, 2) + "\n";
        memoria[pref + M.GLOSARIO] = M.glosario(x, E.idioma);
        sim.pendiente = true;
      };
      const pasos = [];
      if (!t.hechas.includes("explorar")) {
        pasos.push([300, () => etapa("inventario")], [500, () => etapa("explorar")]);
        for (const r of pr.arbol.archivos.map((a) => a[0]).filter((r) => !r.startsWith("docs/"))) pasos.push([650, () => { if (!t.vistos) t.vistos = []; if (!t.vistos.includes(r)) t.vistos.push(r); t.leidos = t.vistos.length; t.leyendo = r; emitir({ t: "lee", id: t.id, ruta: r, n: t.leidos }); }]);
        pasos.push([400, () => { t.leyendo = ""; for (const p of sim.plan) t.items.push({ ruta: p.ruta, titulo: p.titulo, tipo: p.tipo, estado: "cola", nuevo: memoria[pref + p.ruta] == null }); estado(); }]);
      }
      pasos.push([200, () => { etapa("escribir"); esquemaAlDia(); archivosCambiaron(A, memoria, luego); }]);
      const correr = (k) => {
        if (sim.detener) return fin("detenido");
        if (k < pasos.length) { const [ms, f] = pasos[k]; return luego(ms * v(), () => { if (sim.detener) return fin("detenido"); f(); correr(k + 1); }); }
        escribirDocs();
      };
      // Escribir: 2 a la vez; cada uno queda en la carpeta al terminar.
      const escribirDocs = () => {
        let activos = 0;
        const siguiente = () => {
          if (sim.detener) { if (!activos) fin("detenido"); return; }
          for (const r of sim.cola.splice(0)) { const i = t.items.find((x) => x.ruta === r); if (i) i.estado = "cola"; }
          const i = t.items.find((x) => x.estado === "cola");
          if (!i) { if (!activos) { etapa("cerrar"); luego(500 * v(), () => fin(t.items.some((x) => x.estado === "fallo") ? "con-fallas" : "listo")); } return; }
          activos++; i.estado = "escribiendo"; estado();
          luego(1600 * v(), () => {
            activos--;
            if (sim.detener) { i.estado = "cola"; return siguiente(); }
            if (sim.fallo === i.ruta) { sim.fallo = null; i.estado = "fallo"; i.error_ia = { codigo: "sin_respuesta", plantilla: "{ia} no respondió. Se cortó la conexión.", valores: { ia: t.ia } }; i.error = i.error_ia.plantilla.replace("{ia}", t.ia); }
            else {
              const p = sim.plan.find((x) => x.ruta === i.ruta);
              if (!(i.ruta in sim.antes)) sim.antes[i.ruta] = memoria[pref + i.ruta] ?? null;
              memoria[pref + i.ruta] = p.texto; i.estado = "listo";
              esquemaAlDia(); archivosCambiaron(A, memoria, luego);
            }
            estado(); siguiente();
          });
          if (activos < 2) siguiente();
        };
        siguiente();
      };
      luego(80, () => { estado(); correr(0); });
    }
    // ───────────── Vista previa: varios proyectos (la carpeta de ejemplo y los libros que se crean), cada uno con su memoria ─────────────
    // (Todo lo de aquí abajo son funciones: el módulo ya devolvió su API más arriba, así que nada de `const` a este nivel.)
    function registroSim(DEMO) {
      const REG = registroSim;
      if (!REG.lista) REG.lista = [{ ruta: DEMO.carpeta.ruta, nombre: DEMO.carpeta.nombre, tipo: "software", docs: "docs/esquema", sim: (simular.s = simular.s || { versiones: [] }), archivos: null, ultimo: 0, demo: true }];
      return REG.lista;
    }
    function proyectoSim(DEMO) { const l = registroSim(DEMO); return l.find((x) => x.ruta === (E.carpeta?.ruta || DEMO.carpeta.ruta)) || l[0]; }
    function archivosDe(x, memoria) { return x.ruta === (E.carpeta?.ruta || registroSim.lista[0].ruta) ? memoria : x.archivos || {}; }
    function recientesSim(DEMO, memoria) {
      return registroSim(DEMO).filter((x) => {
        if (!x.demo) return true;
        const a = archivosDe(x, memoria);
        return x.sim.vinculado || a[x.docs + "/esquema.json"] != null;
      }).sort((a, b) => b.ultimo - a.ultimo).map((x) => {
        let nombre = x.nombre; try { nombre = JSON.parse(archivosDe(x, memoria)[(x.docs ? x.docs + "/" : "") + "esquema.json"]).nombre || nombre; } catch { /* sin esquema */ }
        return x.sola ? { nombre, ruta: x.ruta, ubicacion: x.ubicacion, tipo: x.tipo } : { nombre, ruta: x.ruta, ubicacion: "~/Esquema/" + x.nombre, codigo: x.nombre, tipo: x.tipo };
      });
    }
    /** Abre otro proyecto de la vista previa: guarda la memoria del actual y carga la del otro. */
    function simAbrir(indice, memoria, DEMO) {
      const l = recientesSim(DEMO, memoria), destino = typeof indice === "string" ? { ruta: indice } : l[indice];
      if (!destino) return null;
      const reg = registroSim(DEMO), actual = proyectoSim(DEMO), otro = reg.find((x) => x.ruta === destino.ruta);
      if (!otro) return null;
      if (otro !== actual) {
        actual.archivos = { ...memoria };
        for (const k of Object.keys(memoria)) delete memoria[k];
        Object.assign(memoria, otro.archivos || {});
      }
      return { carpeta: { nombre: otro.sola ? otro.slug : otro.nombre, ruta: otro.ruta }, archivos: Object.keys(memoria).filter((r) => /\.(md|mmd)$/.test(r)).map((ruta) => ({ ruta })) };
    }
    /** Las HU del proyecto (lo que lee `abrir` del encabezado de cada historias/*.md). */
    function historiasSim(memoria, pref) {
      return Object.keys(memoria).filter((r) => r.startsWith(pref + "historias/") && r.endsWith(".md")).sort().map((r) => {
        const m = encabezadoSim(memoria[r]), titulo = (/^# (.+)$/m.exec(memoria[r]) || [, r])[1];
        return { ruta: r.slice(pref.length), id: m.id || "", titulo, estado: m.estado || "por-entender", actualizada: m.actualizada || "", rama: "", ...(m.estado === "en-desarrollo" ? { commits: 1 } : {}) };
      });
    }
    function encabezadoSim(t) {
      const m = /^---\n([\s\S]*?)\n---\n?/.exec(t || ""); const x = {};
      if (m) for (const l of m[1].split("\n")) { const k = /^([a-z_]+):\s*(.*)$/.exec(l); if (k) x[k[1]] = k[2].replace(/^"(.*)"$/, "$1"); }
      return x;
    }
    function conEncabezado(meta, cuerpo) {
      const l = ["---"]; for (const k of ["estado", "id", "creada", "actualizada", "rama", "desde", "commit", "enlace"]) if (meta[k]) l.push(`${k}: ${/[:#]/.test(meta[k]) ? JSON.stringify(meta[k]) : meta[k]}`);
      return l.join("\n") + "\n---\n\n" + cuerpo.replace(/^\n+/, "");
    }
    function slugSim(t, n = 50) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n).replace(/-+$/, ""); }
    function rnd(n) { return Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""); }
    /** Lo mismo que contenido.detectar (más corto): historia, libro o documento, con las mismas razones. */
    function detectarSim(texto) {
      const pts = { historia: 0, libro: 0, documento: 1 }, raz = { historia: [], libro: [], documento: [] };
      const suma = (k, n, r) => { pts[k] += n; raz[k].push(r); };
      if (/(^|\n)\W*(como|as an?)\b[\s\S]{0,140}?\b(quiero|necesito|i want|i need)\b/i.test(texto)) suma("historia", 4, "Dice «Como … quiero … para …»");
      if (/criterios? de aceptaci|acceptance criteria/i.test(texto)) suma("historia", 3, "Trae criterios de aceptación");
      if (/\b(HU|US|HDU)[-_ ]?\d{1,6}\b/.test(texto.slice(0, 3000))) suma("historia", 2, "Tiene el número de un ticket");
      const caps = (texto.match(/^\W{0,4}(cap[ií]tulo|chapter)\s+\d+/gim) || []).length;
      if (caps >= 3) suma("libro", 3 + Math.floor(Math.min(caps, 10) / 3), "Tiene capítulos");
      if (texto.length > 80000) suma("libro", 2, "Es un texto largo");
      const tipo = ["historia", "libro", "documento"].reduce((a, b) => (pts[b] > pts[a] ? b : a), "documento");
      if (tipo === "documento") raz.documento.push("Un texto corto o de otro tipo");
      const titulo = ((/^#{1,2}\s+(.+)$/m.exec(texto) || [])[1] || texto.split("\n").find((l) => l.trim() && l.trim().length <= 90) || "").replace(/[*_#`>]/g, "").trim().slice(0, 100);
      return { tipo, razones: raz[tipo].slice(0, 4), titulo };
    }
    function capitulosSim(texto) {
      const partes = texto.split(/^## /m).slice(1);
      return (partes.length ? partes : [texto]).map((p, k) => { const [t, ...resto] = p.split("\n"); const titulo = partes.length ? t.trim().replace(/^\W*(cap[ií]tulo|chapter|parte|part)\s+\w+\s*[:.\-–—]\s*/i, "") : "Parte 1"; return { n: k + 1, titulo, archivo: `${String(k + 1).padStart(2, "0")}-${slugSim(titulo)}.md`, ruta: `capitulos/${String(k + 1).padStart(2, "0")}-${slugSim(titulo)}.md`, texto: resto.join("\n").trim() }; });
    }

    /** Las órdenes nuevas en la vista previa: agregar (HU, documento), proyecto Libro, preguntas, estudio, incongruencias, borrar y la wiki. */
    function simularMas(d, memoria, DEMO, luego, act) {
      const A = window.Esquema, sim = act.sim, docs = act.docs, pref = docs ? docs + "/" : "", v = () => Number(window._simVelocidad) || 1;
      const g = DEMO.agregar[E.idioma === "en" ? "en" : "es"], en = E.idioma === "en";
      sim.trabajos = sim.trabajos || []; sim.entradas = sim.entradas || {}; sim.borrados = sim.borrados || {}; sim.antes = sim.antes || {};
      const responder = (r, ms = 120) => luego(ms * v(), () => A.proyectoRespuesta({ orden: d.orden, ...r }));
      const leerEsq = () => { try { return JSON.parse(memoria[pref + "esquema.json"]); } catch { return null; } };
      const hoy = () => new Date().toISOString().slice(0, 10);
      const emitirT = (t) => A.proyectoProgreso({ eventos: [{ t: "estado", trabajo: clon(t) }] });
      const nuevoT = (tipo, etapas, extra) => { const t = { id: "20261029T1200" + String(sim.trabajos.length).padStart(2, "0") + "-" + rnd(6), tipo, carpeta: E.carpeta?.ruta, estado: "corriendo", etapa: etapas[0], etapas, hechas: [], inicio: new Date().toISOString(), items: [], leidos: 0, leyendo: "", error: "", ia: nombreIA(), ...extra }; sim.trabajos.unshift(t); sim.trabajo = t; sim.antes = {}; return t; };
      const etapaT = (t, e) => { if (t.etapa !== e && !t.hechas.includes(t.etapa)) t.hechas.push(t.etapa); t.etapa = e; emitirT(t); };
      const finT = (t, est, extra = {}) => { if (est === "listo" && !t.hechas.includes(t.etapa)) t.hechas.push(t.etapa); Object.assign(t, { estado: est, fin: new Date().toISOString(), leyendo: "" }); emitirT(t); A.proyectoRespuesta({ orden: d.orden, ok: true, trabajo: clon(t), ...extra }); };
      const escribirSim = (rel, texto) => { if (!(rel in sim.antes)) sim.antes[rel] = memoria[pref + rel] ?? null; memoria[pref + rel] = texto; luego(20, () => A.archivoCambiado({ ruta: pref + rel, texto })); };
      const registrar = (docsN, els = [], quitar = []) => {
        const x = leerEsq() || { formato: 1, nombre: act.nombre, documentos: [], elementos: [] };
        if (act.tipo !== "software" && !x.tipo) x.tipo = act.tipo;
        for (const el of els) { const k = x.elementos.findIndex((y) => y.id === el.id); if (k < 0) x.elementos.push(el); else x.elementos[k] = { ...x.elementos[k], ...el }; }
        x.documentos = x.documentos.filter((y) => !quitar.includes(y.ruta));
        for (const doc of docsN) { const y = x.documentos.find((z) => z.ruta === doc.ruta); if (y) Object.assign(y, doc); else x.documentos.push({ ...doc }); }
        if (!x.documentos.some((y) => y.ruta === M.GLOSARIO)) x.documentos.push({ ruta: M.GLOSARIO, titulo: tr("Elementos"), tipo: "glosario" });
        x.documentos.sort(ordenDocs);
        memoria[pref + "esquema.json"] = JSON.stringify(x, null, 2) + "\n";
        memoria[pref + M.GLOSARIO] = M.glosario(x, E.idioma);
        sim.pendiente = true;
        return x;
      };
      const version = (mensaje) => { sim.versiones.unshift({ id: rnd(40), fecha: new Date(Date.now() + sim.versiones.length * 1000).toISOString(), mensaje, archivos: Object.fromEntries(Object.entries(memoria).filter(([k]) => !docs || k.startsWith(pref)).map(([k, x]) => [k.slice(pref.length), x])) }); sim.pendiente = false; };
      const listos = () => luego(30, () => A.archivos({ archivos: Object.keys(memoria).filter((r) => /\.(md|mmd)$/.test(r)).map((ruta) => ({ ruta })) }));
      const pasos = (lista, fin) => { const correr = (k) => { if (k >= lista.length) return fin && fin(); const [ms, f] = lista[k]; luego(ms * v(), () => { f(); correr(k + 1); }); }; correr(0); };
      const SECC = en ? { abiertas: "Open questions", decisiones: "Decisions", como: "How it turned out", nose: "Not known yet" } : { abiertas: "Preguntas abiertas", decisiones: "Decisiones", como: "Cómo quedó", nose: "No se sabe todavía" };
      const docHU = (t) => {
        const x = t._hu, meta = { estado: x.estado, id: x.id, creada: x.creada, actualizada: hoy() };
        const r = [`# ${x.id} · ${x.titulo}`, "", g.historia.documento.trim(), ""];
        if (x.abiertas.length) r.push(`## ${SECC.abiertas}`, "", ...x.abiertas.map((p) => `- ${p.pregunta}` + (p.porque ? ` _(${p.porque})_` : "")), "");
        if (x.decisiones.length) r.push(`## ${SECC.decisiones}`, "", ...x.decisiones.map((y) => `- **${y.fecha}** · ${y.pregunta} → ${y.respuesta || "_" + SECC.nose + "_"}`), "");
        if (x.como) r.push(`## ${SECC.como}`, "", x.como, "");
        return M.limpiarRefs(conEncabezado(meta, r.join("\n").trimEnd() + "\n"), (leerEsq()?.elementos || []).map((e) => e.id));
      };
      const preguntasDe = (lista, prefijo) => lista.map((p, i) => ({ id: `${prefijo}-${i + 1}`, pregunta: p.pregunta, porque: p.porque || "", opciones: p.opciones || [] }));
      /** «Agregar información» en la vista previa: el mismo plan que arma bin/incorporar.py (crear / completar / modificar, con por qué y
       *  la cita), sobre lo que tenga el proyecto ficticio. `resp`: lo que respondió la persona a la pregunta (si hubo). */
      const planSim = (t, resp) => {
        etapaT(t, "plan");
        const x = g.incorporar, leer = (r) => memoria[pref + r], lista = [];
        const tituloDe = (r) => (leerEsq()?.documentos || []).find((y) => y.ruta === r)?.titulo || (/^# (.+)$/m.exec(leer(r) || "") || [, r])[1];
        const flujo = "flujos/pagar-una-cuenta.md";
        if (resp && resp.startsWith(x.parte) && leer(flujo) != null) lista.push({ ruta: flujo, titulo: tituloDe(flujo), tipo: "flujo", texto: leer(flujo).trimEnd() + "\n\n" + x.seccion.texto + "\n", accion: "completar", porque: x.seccion.porque, cita: x.seccion.cita, cita_exacta: true });
        else lista.push({ ruta: x.crear.ruta, titulo: x.crear.titulo, tipo: "flujo", texto: x.crear.texto, accion: "crear", porque: x.crear.porque, cita: x.crear.cita, cita_exacta: true });
        lista.push({ ruta: `notas/${hoy()}.md`, titulo: `${en ? "Notes from" : "Notas del"} ${hoy()}`, tipo: "otro", texto: `# ${en ? "Notes from" : "Notas del"} ${hoy()}\n\n${x.sin_lugar}\n`, accion: "crear",
          porque: en ? "What didn't fit any document, so it isn't lost." : "Lo que no calzó en ningún documento, para que no se pierda.", cita: "", cita_exacta: false });
        const c = x.completar, readme = leer(c.ruta);
        if (readme != null) { const L = readme.split("\n"), k = L.findIndex((l) => l.includes(c.despues)); L.splice(k >= 0 ? k + 1 : L.length, 0, c.linea); lista.push({ ruta: c.ruta, titulo: tituloDe(c.ruta), tipo: "vision", texto: L.join("\n"), accion: "completar", porque: c.porque, cita: c.cita, cita_exacta: true }); }
        const m = x.modificar, arq = leer(m.ruta);
        if (arq != null) { let nuevo = arq; for (const [a, b] of m.cambios) nuevo = nuevo.split(a).join(b); if (nuevo !== arq) lista.push({ ruta: m.ruta, titulo: tituloDe(m.ruta), tipo: "arquitectura", texto: nuevo, accion: "modificar", porque: m.porque, cita: m.cita, cita_exacta: true }); }
        t._propuestas = { tarea: "incorporar", propuestas: lista, elementos: x.elementos, nota: x.nota, descartados: 0 };
        t.plan = Object.fromEntries(["crear", "completar", "modificar"].map((a) => [a, lista.filter((p) => p.accion === a).length]));
        t.propuestas = lista.length + 1;
        finT(t, "listo", { propuestas: t._propuestas });
      };
      switch (d.orden) {
        case "detectar": {
          const avisos = [], textos = [];
          for (const a of d.archivos || []) {
            if (!/\.(md|markdown|txt)$/i.test(a.nombre)) { avisos.push({ nombre: a.nombre, error: "En la vista previa solo leo .md y .txt; la app lee también PDF, Word y EPUB." }); continue; }
            try { textos.push([a.nombre, new TextDecoder().decode(Uint8Array.from(atob(a.datos), (c) => c.charCodeAt(0)))]); } catch { avisos.push({ nombre: a.nombre, error: "No pude leer ese archivo." }); }
          }
          if ((d.texto || "").trim()) textos.unshift(["", d.texto]);
          if (!textos.length) return responder({ ok: false, avisos, error: avisos[0]?.error || "Pega un texto o elige un archivo." });
          const texto = textos.map((x) => x[1]).join("\n\n"), det = detectarSim(texto), token = rnd(16);
          const caps = det.tipo === "libro" || texto.length > 20000 ? capitulosSim(texto).length : 0;
          sim.entradas[token] = { texto, titulo: det.titulo };
          return responder({ ok: true, token, tipo: det.tipo, subtipo: "", razones: det.razones, titulo: det.titulo, caracteres: texto.length, palabras: texto.split(/\s+/).filter(Boolean).length, capitulos: caps, avisos,
            enlace: "", solo_enlace: /^\s*https?:\/\/\S+\s*$/.test(texto), archivos: textos.filter((x) => x[0]).map((x) => x[0]), sugerir_libro: det.tipo === "libro" && (texto.length > 60000 || caps >= 5) }, 300);
        }
        case "agregar": {
          const e = sim.entradas[d.token];
          if (!e) return responder({ ok: false, error: "Vuelve a agregarlo: no encontré lo que elegiste." });
          if (d.tipo === "incorporar") {
            const titulo = (d.titulo || e.titulo || (en ? "Information" : "Información")).slice(0, 100), fuente = `fuentes/${slugSim(titulo) || "informacion"}.md`;
            const t = nuevoT("incorporar", ["leer", "ordenar", "preguntas", "plan"], { titulo });
            responder({ ok: true, trabajo: clon(t) }, 1);
            memoria[pref + fuente] = e.texto; registrar([{ ruta: fuente, titulo, tipo: "fuente" }]); listos();
            // Si el proyecto ya tiene «Pagar una cuenta», la IA pregunta si las devoluciones van ahí o en un flujo aparte.
            return pasos([[200, () => etapaT(t, "leer")], [300, () => etapaT(t, "ordenar")], [900, () => {}]], () => {
              if (memoria[pref + "flujos/pagar-una-cuenta.md"] == null) return planSim(t, "");
              etapaT(t, "preguntas"); t._pend = preguntasDe([g.incorporar.pregunta], "r1"); t.preguntas = t._pend;
              finT(t, "esperando");
            });
          }
          if (d.tipo === "historia") {
            const m = /\b(?:HU|US|HDU)[-_ ]?(\d{1,6})\b/.exec(e.texto.slice(0, 3000)), id = m ? "HU-" + Number(m[1]) : "HU-" + String(historiasSim(memoria, pref).length + 1).padStart(3, "0");
            const titulo = (d.titulo || e.titulo || id).replace(new RegExp("^\\W*" + id.replace("-", "[-_ ]?") + "\\W*", "i"), "").replace(/^\W*(US|HU)[-_ ]?\d+\W*/i, "").trim() || g.historia.titulo;
            const ruta = `historias/${slugSim(id)}-${slugSim(titulo, 40)}.md`, fuente = `fuentes/${slugSim(id + " " + titulo)}.md`;
            const t = nuevoT("historia", ["contexto", "analizar", "preguntas", "guardar"], { titulo: `${id} · ${titulo}`, ruta, ronda: 1 });
            t._hu = { id, titulo, creada: hoy(), estado: "por-entender", abiertas: [], decisiones: [], ronda: 1 };
            t.items.push({ ruta, titulo: t.titulo, tipo: "historia", estado: "cola", nuevo: true });
            responder({ ok: true, trabajo: clon(t) }, 1);
            memoria[pref + fuente] = e.texto;
            return pasos([[200, () => etapaT(t, "contexto")], [300, () => { etapaT(t, "analizar"); t.items[0].estado = "escribiendo"; emitirT(t); }], [1100, () => {
              const ps = preguntasDe(g.historia.preguntas[0], "r1");
              t._hu.abiertas = ps; escribirSim(ruta, docHU(t));
              registrar([{ ruta, titulo: t.titulo, tipo: "historia" }, { ruta: fuente, titulo: e.titulo || titulo, tipo: "fuente" }]);
              t.items[0].estado = "listo"; version(en ? `Understood ${id} (with questions)` : `Entendí ${id} (con preguntas)`); listos();
              etapaT(t, "preguntas"); t.preguntas = ps; t._pend = ps;
            }]], () => finT(t, "esperando"));
          }
          const titulo = d.titulo || e.titulo || "Documento", ruta = `documentos/${slugSim(titulo) || "documento"}.md`, fuente = `fuentes/${slugSim(titulo) || "documento"}.md`;
          const t = nuevoT("documento", ["leer", "escribir"], { titulo, ruta });
          t.items.push({ ruta, titulo, tipo: "documento", estado: "cola", nuevo: true });
          responder({ ok: true, trabajo: clon(t) }, 1);
          memoria[pref + fuente] = e.texto;
          return pasos([[200, () => etapaT(t, "leer")], [300, () => { etapaT(t, "escribir"); t.items[0].estado = "escribiendo"; emitirT(t); }], [900, () => {
            escribirSim(ruta, `# ${titulo}\n\n${g.documento.documento}`); registrar([{ ruta, titulo, tipo: "documento" }, { ruta: fuente, titulo, tipo: "fuente" }]);
            t.items[0].estado = "listo"; version(en ? `Added «${titulo}»` : `Agregué «${titulo}»`); listos();
          }]], () => finT(t, "listo"));
        }
        case "crear": {
          const e = sim.entradas[d.token];
          if (!e) return responder({ ok: false, error: "Vuelve a agregarlo: no encontré lo que elegiste." });
          const titulo = d.titulo || e.titulo || "Libro", slug = slugSim(titulo) || "libro", reg = registroSim(DEMO);
          const ubicacion = "~/Esquema/" + slug, caps = capitulosSim(e.texto);
          const nuevo = { ruta: ubicacion, nombre: titulo, slug, tipo: "libro", docs: "", sola: true, ubicacion, sim: { versiones: [], trabajos: [], entradas: {}, borrados: {}, antes: {} }, archivos: {}, ultimo: Date.now(), capitulos: caps };
          const x = { formato: 1, tipo: "libro", nombre: titulo, documentos: [{ ruta: `fuentes/${slug}.md`, titulo, tipo: "fuente" }, { ruta: M.GLOSARIO, titulo: tr("Elementos"), tipo: "glosario" }], elementos: [] };
          nuevo.archivos = { [`fuentes/${slug}.md`]: e.texto, "esquema.json": JSON.stringify(x, null, 2) + "\n", [M.GLOSARIO]: M.glosario(x, E.idioma) };
          const t = { id: "20261029T130000-" + rnd(6), tipo: "libro", carpeta: ubicacion, estado: "esperando", etapa: "preguntar", etapas: ["importar", "preguntar", "resumir", "cerrar"], hechas: ["importar"], inicio: new Date().toISOString(), fin: new Date().toISOString(),
            items: caps.map((c) => ({ ruta: c.ruta, titulo: `${c.n}. ${c.titulo}`, tipo: "capitulo", estado: "cola", nuevo: true })), leidos: 0, leyendo: "", error: "", ia: nombreIA(), titulo, capitulos: caps.length, preguntas: preguntasDe(g.libro.preguntas, "libro") };
          nuevo.sim.trabajos = [t]; nuevo.sim.trabajo = t;
          nuevo.sim.versiones.unshift({ id: rnd(40), fecha: new Date().toISOString(), mensaje: en ? `Added the book «${titulo}» (${caps.length} chapters)` : `Agregué el libro «${titulo}» (${caps.length} capítulos)`, archivos: { ...nuevo.archivos } });
          reg.push(nuevo);
          return responder({ ok: true, indice: 0, ubicacion, recientes: recientesSim(DEMO, memoria), trabajo: clon(t) }, 500);
        }
        case "trabajo": {
          const t = d.id ? sim.trabajos.find((x) => x.id === d.id) : sim.trabajo;
          if (t && d.visto) t.visto = true;
          return responder({ ok: true, trabajo: t ? clon(t) : null, esperan: sim.trabajos.filter((x) => x.estado === "esperando").map(clon), ...(d.propuestas && t?._propuestas ? { propuestas: t._propuestas } : {}) }, 60);
        }
        case "responder": {
          const t = sim.trabajos.find((x) => x.id === d.id);
          if (!t || t.estado !== "esperando") return responder({ ok: false, error: "Esas preguntas ya se respondieron." });
          const resp = Object.fromEntries((d.respuestas || []).map((x) => [x.id, x]));
          Object.assign(t, { estado: "corriendo", preguntas: [] }); delete t.fin;
          if (t.tipo === "incorporar") {
            const r0 = resp[t._pend?.[0]?.id]; t._pend = [];
            responder({ ok: true, trabajo: clon(t) }, 1);
            return pasos([[200, () => etapaT(t, "ordenar")], [700, () => {}]], () => planSim(t, r0?.respuesta || ""));
          }
          if (t.tipo === "libro") {
            const caps = act.capitulos || [];
            responder({ ok: true, trabajo: clon(t) }, 1);
            const l = [[200, () => etapaT(t, "resumir")]];
            for (let k = 0; k < caps.length; k += 2) {
              l.push([150, () => { for (const c of caps.slice(k, k + 2)) t.items.find((i) => i.ruta === c.ruta).estado = "escribiendo"; emitirT(t); }]);
              l.push([900, () => {
                for (const c of caps.slice(k, k + 2)) {
                  const resumen = g.libro.capitulos[c.n - 1] || (en ? "What happens in this chapter, in a few lines." : "Lo que pasa en este capítulo, en pocas líneas.");
                  escribirSim(c.ruta, `# ${c.n}. ${c.titulo}\n\n## ${en ? "Summary" : "Resumen"}\n\n${resumen}\n`);
                  registrar([{ ruta: c.ruta, titulo: `${c.n}. ${c.titulo}`, tipo: "capitulo" }], c.n === 1 ? g.libro.elementos : []);
                  t.items.find((i) => i.ruta === c.ruta).estado = "listo";
                }
                listos(); emitirT(t);
              }]);
            }
            l.push([200, () => etapaT(t, "cerrar")], [600, () => {
              const indice = caps.map((c) => `${c.n}. [${c.titulo}](${c.ruta})`).join("\n");
              escribirSim("README.md", `# ${t.titulo}\n\n${g.libro.readme}\n\n## ${en ? "Chapters" : "Capítulos"}\n\n${indice}\n\n${en ? "See also: [Map of ideas](mapa.md) · [Characters and concepts](elementos.md)" : "Mira también: [Mapa de ideas](mapa.md) · [Personajes y conceptos](elementos.md)"}\n`);
              const tm = en ? "Map of ideas" : "Mapa de ideas";
              escribirSim("mapa.md", `# ${tm}\n\n${g.libro.mapa}\n`);
              registrar([{ ruta: "README.md", titulo: t.titulo, tipo: "libro" }, { ruta: "mapa.md", titulo: tm, tipo: "otro" }]);
              t.items.push({ ruta: "README.md", titulo: t.titulo, tipo: "libro", estado: "listo", nuevo: true }, { ruta: "mapa.md", titulo: tm, tipo: "otro", estado: "listo", nuevo: true });
              version(en ? `Book summarized with ${t.ia}` : `Libro resumido con ${t.ia}`); listos();
            }]);
            return pasos(l, () => finT(t, "listo"));
          }
          // Una historia de usuario: lo respondido queda en «Decisiones»; la IA vuelve a mirar y quizás pregunta algo más.
          const x = t._hu, nuevas = [];
          const sigue = x.abiertas.filter((p) => !(t._pend || []).some((q) => q.id === p.id));
          for (const p of t._pend || []) {
            const r = resp[p.id];
            if (r?.respuesta) nuevas.push({ fecha: hoy(), pregunta: p.pregunta, respuesta: r.respuesta });
            else if (r?.nose) { nuevas.push({ fecha: hoy(), pregunta: p.pregunta, respuesta: "" }); sigue.push(p); }
            else sigue.push(p);
          }
          x.decisiones.push(...nuevas); x.abiertas = sigue; t._pend = [];
          responder({ ok: true, trabajo: clon(t) }, 1);
          const otra = nuevas.some((y) => y.respuesta) && x.ronda < 2;
          x.ronda += otra ? 1 : 0; t.ronda = x.ronda;
          return pasos([[200, () => etapaT(t, "analizar")], [900, () => {
            const ps = otra ? preguntasDe(g.historia.preguntas[1], "r" + x.ronda) : [];
            x.abiertas = [...x.abiertas, ...ps];
            if (!x.abiertas.length && x.estado === "por-entender") x.estado = "lista";
            escribirSim(t.ruta, docHU(t)); version(en ? `${x.id}: with your answers` : `${x.id}: con tus respuestas`); listos();
            if (ps.length) { etapaT(t, "preguntas"); t.preguntas = ps; t._pend = ps; } else etapaT(t, "guardar");
          }]], () => finT(t, t._pend?.length ? "esperando" : "listo"));
        }
        case "continuar": {
          const t = sim.trabajos.find((x) => x.id === d.id);
          if (!t) return responder({ ok: false, error: "No encontré ese trabajo." });
          if (d.descartar) { Object.assign(t, { estado: "listo", descartado: true, preguntas: [] }); return responder({ ok: true, trabajo: clon(t) }); }
          return responder({ ok: true, trabajo: clon(t) });
        }
        case "historia_estado": {
          const ruta = pref + d.ruta, texto = memoria[ruta];
          if (texto == null || !ESTADOS_HU.includes(d.estado)) return responder({ ok: false, error: "Esa historia no existe." });
          const meta = encabezadoSim(texto), cuerpo = texto.replace(/^---\n[\s\S]*?\n---\n?/, "");
          Object.assign(meta, { estado: d.estado, actualizada: hoy() });
          if (d.estado === "en-desarrollo" && !meta.desde) Object.assign(meta, { desde: new Date().toISOString().slice(0, 19), commit: "3f2a9c1b7d4e" });
          memoria[ruta] = conEncabezado(meta, cuerpo);
          version(`«${meta.id}» ${en ? "is now" : "pasó a"} ${tr(NOMBRE_ESTADO[d.estado])}`);
          return responder({ ok: true, historia: historiasSim(memoria, pref).find((h) => h.ruta === d.ruta) });
        }
        case "historia_cierre": {
          const ruta = d.ruta, texto = memoria[pref + ruta];
          if (texto == null) return responder({ ok: false, error: "Esa historia no existe." });
          const meta = encabezadoSim(texto);
          const t = nuevoT("historia_cierre", ["cambios", "comparar", "guardar"], { titulo: (/^# (.+)$/m.exec(texto) || [, ruta])[1], ruta, commits: 2, archivos: 3 });
          t.items.push({ ruta, titulo: t.titulo, tipo: "historia", estado: "cola", nuevo: false });
          responder({ ok: true, trabajo: clon(t) }, 1);
          return pasos([[300, () => etapaT(t, "cambios")], [400, () => { for (const r of ["src/web/pagar.js", "src/api/pagos.py", "src/api/correo.py"]) { t.leyendo = r; t.leidos++; A.proyectoProgreso({ eventos: [{ t: "lee", id: t.id, ruta: r, n: t.leidos }] }); } etapaT(t, "comparar"); }],
            [1000, () => {
              etapaT(t, "guardar");
              const cuerpo = texto.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(new RegExp(`\\n## ${SECC.como}[\\s\\S]*$`), "").trimEnd();
              escribirSim(ruta, M.limpiarRefs(conEncabezado({ ...meta, estado: "terminada", actualizada: hoy() }, `${cuerpo}\n\n## ${SECC.como}\n\n${g.historia.como_quedo}\n`), (leerEsq()?.elementos || []).map((e) => e.id)));
              t.items[0].estado = "listo";
              const prop = g.historia.propuesta, actual = memoria[pref + prop.ruta];
              if (actual != null) { const L = actual.split("\n"), k = L.findIndex((l) => l.startsWith("# ")); L.splice(k + 1, 0, "", prop.linea); t._propuestas = { propuestas: [{ ruta: prop.ruta, titulo: (/^# (.+)$/m.exec(actual) || [, prop.ruta])[1], tipo: "flujo", texto: L.join("\n") }], elementos: [], nota: prop.nota }; t.propuestas = 1; }
              version(en ? `${meta.id} finished: how it turned out` : `${meta.id} terminada: cómo quedó`); listos();
            }]], () => finT(t, "listo", t._propuestas ? { propuestas: t._propuestas } : {}));
        }
        case "estudiar": {
          const caps = act.capitulos || [];
          if (!caps.length) return responder({ ok: false, error: "No encontré el texto del libro en fuentes/." });
          const t = nuevoT("estudio", ["preparar", "escribir", "cerrar"], { titulo: en ? "Study material" : "Material de estudio" });
          for (const c of caps) t.items.push({ ruta: "estudio/" + c.archivo, titulo: `${c.n}. ${c.titulo}`, tipo: "estudio", estado: "cola", nuevo: true });
          responder({ ok: true, trabajo: clon(t) }, 1);
          const l = [[200, () => etapaT(t, "preparar")], [200, () => etapaT(t, "escribir")]];
          for (let k = 0; k < caps.length; k += 2) l.push([700, () => {
            for (const c of caps.slice(k, k + 2)) {
              const resumen = (g.libro.capitulos[c.n - 1] || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
              escribirSim("estudio/" + c.archivo, `# ${c.n}. ${c.titulo}\n\n` + g.libro.estudio.split("{titulo}").join(c.titulo).split("{resumen}").join(resumen));
              registrar([{ ruta: "estudio/" + c.archivo, titulo: `${c.n}. ${c.titulo}`, tipo: "estudio" }]);
              t.items.find((i) => i.ruta === "estudio/" + c.archivo).estado = "listo";
            }
            emitirT(t); listos();
          }]);
          l.push([200, () => etapaT(t, "cerrar")], [300, () => {
            const titulo = en ? "Study material" : "Para estudiar";
            escribirSim("estudio/README.md", `# ${titulo}\n\n${en ? "Each chapter has its outline, review questions with answers and flashcards." : "Cada capítulo tiene su esquema, preguntas de repaso con respuesta y tarjetas."}\n\n` + caps.map((c) => `${c.n}. [${c.titulo}](${c.archivo})`).join("\n") + "\n");
            registrar([{ ruta: "estudio/README.md", titulo, tipo: "estudio" }]);
            version(en ? `Study material made with ${t.ia}` : `Material de estudio hecho con ${t.ia}`); listos();
          }]);
          return pasos(l, () => finT(t, "listo"));
        }
        case "incongruencias": {
          const caps = act.capitulos || [];
          if (!caps.length) return responder({ ok: false, error: "No encontré el texto del libro en fuentes/." });
          const t = nuevoT("incongruencias", ["leer", "comparar", "escribir"], { titulo: en ? "Check inconsistencies" : "Revisar incongruencias" });
          for (const c of caps) t.items.push({ ruta: c.ruta, titulo: `${c.n}. ${c.titulo}`, tipo: "lectura", estado: "cola", quitable: false });
          responder({ ok: true, trabajo: clon(t) }, 1);
          const l = [[200, () => etapaT(t, "leer")]];
          for (let k = 0; k < caps.length; k += 2) l.push([600, () => { for (const c of caps.slice(k, k + 2)) t.items.find((i) => i.ruta === c.ruta).estado = "listo"; emitirT(t); }]);
          l.push([300, () => etapaT(t, "comparar")], [700, () => {
            etapaT(t, "escribir");
            const norm = (x) => String(x).toLowerCase().replace(/\s+/g, " ").trim();
            const h = g.libro.hallazgos.map((x) => ({ ...x, citas: x.citas.map((c) => ({ ...c, seccion: "", exacta: norm(caps[c.capitulo - 1]?.texto || "").includes(norm(c.cita)) })) }));
            const nombres = { contradiccion: en ? "Contradictions" : "Contradicciones", nombre: en ? "Names that don't match" : "Nombres que no calzan", fecha: en ? "Dates and ages" : "Fechas y edades", dato: en ? "Data and figures" : "Datos y cifras", "cabo-suelto": en ? "Loose ends" : "Cabos sueltos" };
            const r = [`# ${en ? "Inconsistencies" : "Incongruencias"}`, "", (en ? `${h.length} findings in «${t.titulo === "Check inconsistencies" ? act.nombre : act.nombre}», the most important first. Each one says where it is: open the chapter to see it in context.` : `${h.length} hallazgos en «${act.nombre}», los más importantes primero. Cada uno dice dónde está: abre el capítulo para verlo en su contexto.`), ""];
            let k = 0;
            for (const tipo of ["contradiccion", "nombre", "fecha", "dato", "cabo-suelto"]) {
              const gr = h.filter((x) => x.tipo === tipo); if (!gr.length) continue;
              r.push(`## ${nombres[tipo]}`, "");
              for (const x of gr) { k++; r.push(`### ${k}. ${x.descripcion}`, "", `${en ? "Severity" : "Gravedad"}: **${{ alta: en ? "high" : "alta", media: en ? "medium" : "media", baja: en ? "low" : "baja" }[x.gravedad]}**`, ""); x.citas.forEach((c, i) => { const cap = caps[c.capitulo - 1]; r.push(`> «${c.cita}» — [${en ? "Ch." : "Cap."} ${cap.n}: ${cap.titulo}](${cap.ruta})${c.exacta ? "" : en ? " _(not found word for word: check it)_" : " _(no está tal cual en el texto: revísala)_"}`); if (i < x.citas.length - 1) r.push(">"); }); r.push(""); }
            }
            const titulo = en ? "Inconsistencies" : "Incongruencias";
            escribirSim("incongruencias.md", r.join("\n"));
            registrar([{ ruta: "incongruencias.md", titulo, tipo: "revision" }]);
            t.items.push({ ruta: "incongruencias.md", titulo, tipo: "revision", estado: "listo", nuevo: true });
            t.hallazgos = h.length;
            version(en ? `Checked inconsistencies with ${t.ia}` : `Revisé las incongruencias con ${t.ia}`); listos();
          }]);
          return pasos(l, () => finT(t, "listo"));
        }
        case "borrar": {
          const rel = d.ruta, texto = memoria[pref + rel];
          if (texto == null || [M.GLOSARIO, "esquema.json"].includes(rel)) return responder({ ok: false, error: "Ese documento no se puede borrar." });
          const x = leerEsq(), doc = x?.documentos.find((y) => y.ruta === rel) || null, cambios = {};
          for (const [k, t] of Object.entries(memoria)) {
            if (!k.startsWith(pref) || !k.endsWith(".md") || k === pref + rel || k === pref + M.GLOSARIO) continue;
            const desde = k.slice(pref.length).split("/").slice(0, -1);
            const nuevo = t.replace(/(!?)\[([^\]\n]*)\]\(([^)\s#]+)(#[^)\s]*)?\)/g, (m, img, txt, dest) => { if (img || /^[a-z]+:/.test(dest)) return m; const partes = []; for (const p of [...desde, ...dest.split("/")]) { if (p === "..") partes.pop(); else if (p && p !== ".") partes.push(p); } return partes.join("/") === rel ? txt : m; });
            if (nuevo !== t) { cambios[k.slice(pref.length)] = [t, nuevo]; memoria[k] = nuevo; luego(20, () => A.archivoCambiado({ ruta: k, texto: nuevo })); }
          }
          const id = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "-" + rnd(6);
          sim.borrados[id] = { ruta: rel, texto, doc, cambios };
          delete memoria[pref + rel];
          if (doc) registrar([], [], [rel]);
          version(en ? `Deleted «${doc?.titulo || rel}»` : `Borré «${doc?.titulo || rel}»`); listos();
          return responder({ ok: true, id, ruta: rel, titulo: doc?.titulo || rel, cambiados: Object.keys(cambios) });
        }
        case "recuperar": {
          const b = sim.borrados[d.id];
          if (!b) return responder({ ok: false, error: "No encontré eso para recuperarlo." });
          if (memoria[pref + b.ruta] != null) return responder({ ok: false, error: "Ya hay un documento con ese nombre: no lo piso." });
          memoria[pref + b.ruta] = b.texto;
          const cambiados = [];
          for (const [k, [antes, despues]] of Object.entries(b.cambios)) if (memoria[pref + k] === despues) { memoria[pref + k] = antes; cambiados.push(k); luego(20, () => A.archivoCambiado({ ruta: pref + k, texto: antes })); }
          if (b.doc) registrar([b.doc]);
          delete sim.borrados[d.id];
          version(en ? `Restored «${b.doc?.titulo || b.ruta}»` : `Recuperé «${b.doc?.titulo || b.ruta}»`); listos();
          return responder({ ok: true, ruta: b.ruta, cambiados });
        }
        case "wiki_preparar": case "wiki_publicar": {
          if (d.url) sim.wikiUrl = d.url;
          if (act.sola && !sim.wikiUrl) return responder({ ok: false, falta_url: true, error: "No sé cuál es el repositorio de GitHub de este proyecto. Escribe su dirección." });
          const x = leerEsq(), titulos = Object.fromEntries((x?.documentos || []).map((y) => [y.ruta, y.titulo]));
          const pags = {};
          for (const [k, t] of Object.entries(memoria)) {
            if ((docs && !k.startsWith(pref)) || !k.endsWith(".md")) continue;
            const r = k.slice(pref.length); if (r.startsWith("fuentes/")) continue;
            const nombre = r === "README.md" ? "Home" : r === M.GLOSARIO ? (en ? "Elements" : "Elementos") : (titulos[r] || r.split("/").pop().replace(/\.md$/, "")).replace(/[\\/:*?"<>|#%[\]{}^~`·]/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "-");
            pags[nombre] = { ruta: r, texto: t };
          }
          sim.wiki = sim.wiki || {};
          const estado = (n) => (n === "Home" ? "mano" : sim.wiki[n] == null ? "nuevo" : sim.wiki[n] === pags[n].texto ? "igual" : "cambia");
          const paginas = [...Object.entries(pags).map(([n, p]) => ({ pagina: n, ruta: p.ruta, estado: estado(n) })), { pagina: "_Sidebar", ruta: "", estado: sim.wiki._Sidebar ? "igual" : "nuevo" },
            ...Object.keys(sim.wiki).filter((n) => n !== "_Sidebar" && !pags[n]).map((n) => ({ pagina: n, ruta: "", estado: "sobra" }))];
          const web = "https://github.com/banco-ejemplo/" + slugSim(act.nombre) + "/wiki";
          if (d.orden === "wiki_preparar") return responder({ ok: true, url: sim.wikiUrl || "https://github.com/banco-ejemplo/" + slugSim(act.nombre) + ".wiki.git", paginas, web }, 500);
          const elegidas = new Set(d.paginas || []), escritas = [], quitadas = [];
          for (const p of paginas) {
            if (!elegidas.has(p.pagina)) continue;
            if (p.estado === "sobra") { delete sim.wiki[p.pagina]; quitadas.push(p.pagina); } else if (["nuevo", "cambia"].includes(p.estado)) { sim.wiki[p.pagina] = p.pagina === "_Sidebar" ? "x" : pags[p.pagina].texto; escritas.push(p.pagina); }
          }
          return responder(escritas.length || quitadas.length ? { ok: true, escritas, quitadas, a_mano: ["Home"], web } : { ok: true, sin_cambios: true, a_mano: ["Home"], web }, 700);
        }
      }
    }
    function archivosCambiaron(A, memoria, luego) { luego(30, () => A.archivos({ archivos: Object.keys(memoria).filter((r) => /\.(md|mmd)$/.test(r)).map((ruta) => ({ ruta })) })); }

    /** La «IA» de la vista previa: documentos ficticios del proyecto de ejemplo, con elementos conectados. */
    function generarSimulado(d, memoria, docs, pr) {
      const pref = docs ? docs + "/" : "";
      const en = d.idioma === "en", g = pr.ia[en ? "en" : "es"];
      if (d.tarea === "inicial") return { ok: true, tarea: "inicial", docs, propuestas: g.inicial, elementos: g.elementos, pide: [], nota: g.nota };
      if (d.tarea === "flujo") {
        if (!(d.archivos || []).length) return { ok: true, tarea: "flujo", docs, propuestas: [], elementos: [], pide: g.pide, nota: g.notaPide };
        const nombre = M.idElemento(d.pedido).split("-").slice(0, 5).join("-");
        const texto = g.flujo.texto.split("{titulo}").join(d.pedido.replace(/[\n#]/g, " ").slice(0, 80));
        return { ok: true, tarea: "flujo", docs, propuestas: [{ ruta: `${d.forma === "diagrama" ? "diagramas" : "flujos"}/${nombre}.md`, titulo: d.pedido.slice(0, 80), tipo: "flujo", texto }], elementos: g.flujo.elementos, pide: [], nota: g.flujo.nota };
      }
      if (d.tarea === "completar") {
        // Solo lo que todavía no existe.
        const propuestas = g.inicial.filter((p) => memoria[pref + p.ruta] == null);
        return { ok: true, tarea: "completar", docs, propuestas, elementos: g.elementos, pide: [], nota: g.nota };
      }
      // cambio o revisar: agrega lo pedido como una nota al comienzo de cada documento.
      const propuestas = (d.documentos || []).filter((r) => memoria[pref + r] != null).map((r) => {
        const t = memoria[pref + r], nota = `> ${en ? "Updated" : "Actualizado"}: ${String(d.pedido || (en ? "the code changed" : "cambió el código")).replace(/\n/g, " ").slice(0, 200)}`;
        const L = t.split("\n"), k = L.findIndex((l) => l.startsWith("# "));
        L.splice(k + 1, 0, "", nota);
        return { ruta: r, titulo: r, tipo: "otro", texto: L.join("\n") };
      });
      return { ok: true, tarea: d.tarea, docs, propuestas, elementos: [], pide: [], nota: en ? "I added a note at the top of each document." : "Agregué una nota al comienzo de cada documento." };
    }
  };
})();
