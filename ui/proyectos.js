// Interfaz de Esquema · proyectos: documentar un repositorio (docs/esquema/ dentro del mismo repo), con elementos conectados en todos
// los documentos y versiones (commits de git solo de esa carpeta, o copias en .versiones/ si no hay git).
// app.js lo crea con `window.EsquemaProyectos(api)` y le pasa lo que necesita (estado E, motor M, puente, textos, pintar…).
// Lo que cambia archivos pasa por lo de siempre (guardarArchivo, deshacer por archivo, cambios de la IA con «Quitar este cambio»);
// lo propio del proyecto va por la acción `proyecto` del puente ({orden: abrir | leer | preparar | generar | guardar | version |
// versiones | ver | restaurar}) → `proyectoRespuesta`, que corre bin/proyecto.py.
(() => {
  "use strict";
  window.EsquemaProyectos = function (api) {
    const { E, M, host, $, esc, ic, T, Tp, tr, frase, toast, movil, nombreIA } = api;
    const pj = (E.pj = { dialogo: null, generando: null, versiones: null, elemento: null, buscar: "", editar: null, ultimo: null, espera: null, pedido: false, ultimoEnvio: null });
    const NOMBRE_TIPO = { pantalla: "Pantalla", boton: "Botón", accion: "Acción", servicio: "Servicio", modulo: "Módulo o archivo", dato: "Dato", actor: "Persona o sistema", otro: "Otro" };
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
      pj.generando = { tarea: d.tarea, datos: d.datos };
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
        lista.push({ ruta, titulo: p.titulo, tipo: p.tipo, texto, antes, existe: antes != null || E.archivos.some((a) => a.ruta === ruta), error, quitada: !!error, ver: false });
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
        if (p.quitada) continue;
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
      const mensaje = pr.tarea === "inicial" ? tr("Documentación inicial") : pr.tarea === "flujo" ? Tp("Documenté «{x}»", { x: (pj.ultimoEnvio?.datos?.pedido || "").slice(0, 80) }) : pr.tarea === "revisar" ? tr("Puse al día la documentación con los cambios del código") : Tp("Actualicé la documentación: {x}", { x: (pj.ultimoEnvio?.datos?.pedido || "").slice(0, 80) });
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
          if (r.existe) {
            E.proyecto = { docs: r.docs, esquema: r.esquema, git: r.git || { hay: false }, cambios: r.cambios || null, pendiente: !!r.pendiente,
              vinculado: !!r.vinculado, ubicacion: r.ubicacion || "", codigo: r.codigo || "" };
            E.encontrado = null;
            cargarDocs();
            if (pj.pedido) { pj.pedido = false; E.panel = "proyecto"; }
          } else if (r.vinculado) {
            // Recién vinculado: falta escribir la documentación. Se muestra lo que Esquema encontró en el código.
            E.proyecto = null; pj.pedido = false; E.panel = "proyecto"; E.encontrado = { cargando: true, docs: "" }; enviar("leer");
          } else {
            E.proyecto = null;
            // «Agregar proyecto»: la documentación va aparte, en ~/Esquema, vinculada a esta carpeta.
            if (pj.pedido) { pj.pedido = false; enviar("vincular"); }
          }
          if (vinculado() && !E.codigoDocs) enviar("codigo");
          if (vinculado() && pj.despues) { const x = pj.despues; pj.despues = null; pedirIA(x.tarea, x.datos); }
          return api.pintar();
        }
        case "codigo":
          E.codigoDocs = r.ok ? { nombre: r.nombre, ubicacion: r.ubicacion, archivos: (r.archivos || []).slice().sort((a, b) => a.ruta.localeCompare(b.ruta)) } : { archivos: [] };
          return api.pintar();
        case "codigo_leer": return window.Esquema.archivoAbierto({ ...r, ruta: CODIGO + r.ruta });
        case "codigo_guardar": return window.Esquema.archivoGuardado({ ...r, ruta: CODIGO + r.ruta });
        case "vincular":
        case "mover": {
          if (!r.ok) { pj.despues = null; toast(r.error || "No pude preparar la carpeta de documentación"); return api.pintar(); }
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
          if (n) enviar("codigo");  // el lateral muestra lo que quedó en el código
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
          if (!pj.generando) return;  // se canceló
          const g = pj.generando;
          pj.generando = null;
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

    // ───────────── Barra lateral ─────────────
    // ───────────── Lateral: una carpeta por proyecto, con su código y su documentación ─────────────
    /** Los .md/.mmd del repo del código de un proyecto vinculado se abren con este prefijo (no están en la carpeta abierta). */
    const CODIGO = "@codigo/";
    const esCodigo = (r) => typeof r === "string" && r.startsWith(CODIGO);
    const esProyecto = () => !!(E.proyecto || E.vinculo);
    function leerCodigo(ruta) { enviar("codigo_leer", { ruta: ruta.slice(CODIGO.length) }); }
    function guardarCodigo(ruta, texto) { enviar("codigo_guardar", { ruta: ruta.slice(CODIGO.length), texto }); }
    /** Los documentos del código y de la documentación, cada uno como su propio árbol. */
    function partesProyecto(arbolDe) {
      if (vinculado()) {
        const cod = (E.codigoDocs?.archivos || []).map((a) => ({ ...a, ruta: CODIGO + a.ruta }));
        return { codigo: arbolDe(cod).carpetas.get(CODIGO.slice(0, -1)) || arbolDe([]), nCodigo: cod.length, docs: arbolDe(E.archivos), nDocs: E.archivos.length };
      }
      const d = docsDir(), dentro = (r) => r.startsWith(d + "/");
      const enDocs = E.archivos.filter((a) => dentro(a.ruta)), fuera = E.archivos.filter((a) => !dentro(a.ruta));
      let raiz = arbolDe(enDocs);
      for (const parte of d.split("/")) raiz = raiz.carpetas.get(parte) || { ruta: d, carpetas: new Map(), archivos: [], total: 0 };
      return { codigo: arbolDe(fuera), nCodigo: fuera.length, docs: raiz, nDocs: enDocs.length };
    }
    function lateralHTML({ arbolDe, arbolHTML, arbolAbierta }) {
      if (!esProyecto()) return "";
      const x = esquema(), p = E.panel, partes = partesProyecto(arbolDe);
      const nombre = E.codigoDocs?.nombre || (E.proyecto && !E.proyecto.vinculado ? E.carpeta?.nombre : x?.nombre) || E.carpeta?.nombre || "";
      const carpeta = (clave, nivel, icono, etiqueta, extra = "", attrs = `data-arbol="${clave}"`) => {
        const ab = arbolAbierta(clave);
        return [ab, `<button class="archivo carpeta-arbol" style="--n:${nivel}" ${attrs} aria-expanded="${ab}">${ic(ab ? "abajo" : "derecha")}${ic(icono)}${etiqueta}${extra}</button>`];
      };
      const [abP, filaP] = carpeta("#p", 0, "proyecto", `<span data-sin-traducir>${esc(nombre)}</span>`);
      let html = filaP;
      if (abP) {
        const [abC, filaC] = carpeta("#codigo", 1, "carpeta", `<span>Código</span>`, `<small data-sin-traducir>${vinculado() && !E.codigoDocs ? "…" : partes.nCodigo}</small>`);
        const [abD, filaD] = carpeta("#docs", 1, "carpeta", `<span>Documentación</span>`, `<small data-sin-traducir>${partes.nDocs || esc(tr("vacía"))}</small>`, `data-p-docs aria-current="${p === "proyecto"}"`);
        const extras = E.proyecto ? `<button class="archivo" style="--n:2" data-p="elementos" aria-current="${p === "elementos"}">${ic("elemento")}<span>Elementos</span><small data-sin-traducir>${x.elementos.length}</small></button>
          <button class="archivo" style="--n:2" data-p="versiones" aria-current="${p === "versiones"}">${ic("historia")}<span>Versiones</span>${E.proyecto.pendiente ? `<small>Sin guardar</small>` : ""}</button>` : "";
        html += `<div role="group">${filaC}${abC ? `<div role="group">${arbolHTML(partes.codigo, 2) || `<p class="vacio" style="--n:2">El código no tiene documentos .md ni diagramas.</p>`}</div>` : ""}
          ${filaD}${abD ? `<div role="group">${extras}${arbolHTML(partes.docs, 2)}</div>` : ""}</div>`;
      }
      const actual = E.carpeta?.ruta;
      const otros = E.recientes.map((r, i) => [r, i]).filter(([r]) => r.ruta !== actual);
      return `<h3>Proyectos</h3><div class="arbol">${html}${otros.map(filaReciente).join("")}</div>
        <button class="archivo" data-accion="p-agregar">${ic("mas")}<span>Agregar proyecto</span></button>`;
    }
    const filaReciente = ([p, i]) => `<button class="archivo carpeta-arbol" data-p-reciente="${i}" title="${esc(p.ubicacion || p.ruta)}" data-sin-traducir>${ic("derecha")}${ic("proyecto")}<span>${esc(p.nombre)}</span></button>`;
    function recientesHTML() {
      if (esProyecto()) return "";
      const actual = E.carpeta?.ruta;
      const otros = E.recientes.map((p, i) => [p, i]).filter(([p]) => p.ruta !== actual);
      return `<h3>Proyectos</h3><div class="arbol">${otros.map(filaReciente).join("")}</div>
        <button class="archivo" data-accion="p-agregar">${ic("mas")}<span>Agregar proyecto</span></button>`;
    }

    /** «Lo que falta» en la documentación: lo que una documentación completa trae y esta todavía no. */
    function loQueFalta() {
      const x = esquema(), tipos = x.documentos.map((d) => d.tipo), { docs, listos } = docsProyecto();
      const flujos = tipos.filter((t) => t === "flujo").length;
      const sinUso = listos ? x.elementos.filter((el) => !M.usosElemento(docs, el).length) : [];
      const c = E.proyecto.cambios;
      return [
        { ok: tipos.includes("vision"), titulo: "Visión general", falta: "la visión general (README.md): qué es el proyecto y para quién" },
        { ok: tipos.includes("arquitectura"), titulo: "Arquitectura", falta: "la arquitectura (arquitectura.md): sus componentes y cómo se conectan, con un diagrama" },
        { ok: flujos > 0, titulo: "Flujos principales", n: flujos, falta: "los flujos principales (flujos/<nombre>.md), cada uno con su diagrama" },
        { ok: x.elementos.length > 0, titulo: "Elementos", n: x.elementos.length, falta: "los elementos del proyecto (pantallas, botones, servicios, módulos…)" },
        { ok: !sinUso.length, titulo: "Cada elemento aparece en un documento", n: sinUso.length, nombres: sinUso.map((e) => e.nombre), falta: "documentar los elementos que ningún documento nombra" },
        { ok: !c?.n, titulo: "Al día con el código", n: c?.n || 0, falta: "poner al día lo que cambió en el código desde la última versión" },
      ];
    }
    function faltaHTML() {
      const items = loQueFalta(), faltan = items.filter((i) => !i.ok);
      const fila = (i) => `<li class="${i.ok ? "hecho" : "pendiente"}">${ic(i.ok ? "listo" : "mas")}<span><b data-sin-traducir>${esc(tr(i.titulo))}</b>${i.n != null && (i.ok ? i.n && i.titulo !== "Cada elemento aparece en un documento" && i.titulo !== "Al día con el código" : i.n) ? ` <small data-sin-traducir>${i.n}</small>` : ""}${i.nombres?.length ? `<small data-sin-traducir> · ${esc(i.nombres.slice(0, 4).join(", "))}${i.nombres.length > 4 ? "…" : ""}</small>` : ""}</span></li>`;
      return `<section class="p-tarjeta p-falta">
        <h3>${faltan.length ? (faltan.length === 1 ? frase("Le falta 1 cosa a la documentación") : frase("Le faltan {n} cosas a la documentación", { n: faltan.length })) : "La documentación está completa"}</h3>
        <ul>${items.map(fila).join("")}</ul>
        <div class="p-acciones izq">${faltan.length ? `<button class="boton principal" data-accion="p-completar">${ic("chispa")} Completar lo que falta</button>` : `<button class="boton" data-accion="p-flujo">${ic("chispa")} Documentar otro flujo</button>`}</div>
      </section>`;
    }
    /** El pedido para «Completar lo que falta» (lo ve la persona en «Ver lo que se envía»). */
    function pedidoCompletar() {
      const faltan = loQueFalta().filter((i) => !i.ok);
      return tr("Completa la documentación. Falta:") + "\n" + faltan.map((i) => "- " + tr(i.falta) + (i.nombres?.length ? ": " + i.nombres.join(", ") : "")).join("\n");
    }
    function barraHTML() {
      const titulos = { proyecto: "Proyecto", elementos: "Elementos", versiones: "Versiones", propuestas: "Revisa lo que propone tu IA" };
      return `<header class="barra">
        <button class="boton plano icono solo-movil" data-accion="abrir-lateral" aria-label="Archivos">${ic("menu")}</button>
        ${E.proyecto && E.panel !== "proyecto" && E.panel !== "propuestas" ? `<button class="boton plano solo-movil" data-p="proyecto" aria-label="Proyecto">${ic("volver")}</button>` : ""}
        <span class="titulo">${titulos[E.panel] || "Proyecto"}</span><span class="espacio"></span>
        ${E.proyecto && E.panel !== "propuestas" ? `<button class="boton" data-accion="p-flujo">${ic("chispa")}<span class="solo-escritorio">Documentar un flujo</span></button>` : ""}
      </header>`;
    }

    // ───────────── Paneles ─────────────
    function areaHTML() {
      if (E.panel === "propuestas" && E.propuestas) return `<div class="p-panel" data-sin-traducir>${propuestasHTML()}</div>`;
      if (E.panel === "versiones" && E.proyecto) return `<div class="p-panel">${versionesHTML()}</div>`;
      if (E.panel === "elementos" && E.proyecto) return `<div class="p-panel">${elementosHTML()}</div>`;
      if (E.proyecto) return `<div class="p-panel">${inicioHTML()}</div>`;
      if (E.encontrado) return `<div class="p-panel">${encontradoHTML()}</div>`;
      return `<div class="vacio"><div class="esperando"><span class="giro"></span> Leyendo el proyecto…</div></div>`;
    }

    /** «Lo que encontré»: lo que Esquema leyó del repo, sin IA. */
    function encontradoHTML() {
      const f = E.encontrado;
      if (f.cargando) return `<div class="esperando"><span class="giro"></span> Leyendo el proyecto…</div>`;
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
        <div class="p-acciones"><button class="boton principal" data-accion="p-generar-inicial">${ic("chispa")} ${frase("Documentar con {ia}", { ia: nombreIA() })}</button></div>`;
    }

    function inicioHTML() {
      const x = esquema(), c = E.proyecto.cambios, u = pj.ultimo, { listos } = docsProyecto();
      const docs = x.documentos.slice().sort((a, b) => (a.tipo === "glosario") - (b.tipo === "glosario") || TIPOS_ORDEN.indexOf(a.tipo) - TIPOS_ORDEN.indexOf(b.tipo) || a.ruta.localeCompare(b.ruta));
      const rev = E.proyecto.revision;
      const donde = E.proyecto.vinculado ? E.proyecto.ubicacion + "/" : docsDir() + "/";
      return `<div class="p-cab"><span class="p-icono">${ic("proyecto")}</span><div><h2 data-sin-traducir>${esc(x.nombre)}</h2>${frase("{d} documentos · {e} elementos · en {c}", { d: x.documentos.length, e: x.elementos.length, c: donde }, "p")}${E.proyecto.vinculado && E.proyecto.codigo ? frase("Código: {x}", { x: E.proyecto.codigo }, "p") : ""}</div></div>
        ${!E.proyecto.vinculado ? `<div class="p-aviso"><span>${frase("Esta documentación está dentro del repo ({x}). ¿La paso a una carpeta aparte en ~/Esquema? No borro nada del repo.", { x: docsDir() + "/" })}</span><button class="boton" data-accion="p-mover">Moverla aparte</button></div>` : ""}
        ${E.proyecto.vinculado && pj.ofrecerPasar && !pj.espera ? `<div class="p-aviso"><span>Guardé la versión. ¿Quieres llevar algo de esto al repo del proyecto?</span><button class="boton" data-accion="p-pasar">Pasar al proyecto</button></div>` : ""}
        ${x.documentos.length ? faltaHTML() : ""}
        ${api.accionesInicioHTML()}
        ${pj.espera ? `<div class="p-aviso"><span class="giro"></span> Guardando la versión…</div>` : ""}
        ${u ? `<div class="p-aviso"><span data-sin-traducir>${esc(u.mensaje)}</span>${u.puede ? `<button class="boton" data-accion="p-deshacer">${ic("deshacer")} Deshacer este cambio</button>` : ""}</div>` : ""}
        ${c?.n && !E.proyecto.cambiosVistos ? `<section class="p-tarjeta p-cambios">
          <h3>${frase("Cambió el proyecto desde tu última versión: {n} commits", { n: c.n })}</h3>
          <ul class="p-commits" data-sin-traducir>${c.commits.slice(0, 5).map((k) => `<li><small>${esc(k.fecha)}</small> ${esc(k.mensaje)}</li>`).join("")}</ul>
          ${rev ? revisionHTML(rev) : `<div class="p-acciones izq"><button class="boton principal" data-accion="p-revisar" ${listos ? "" : "disabled"}>Revisar qué documentos afecta</button><button class="boton plano" data-accion="p-cambios-vistos">Ya lo revisé</button></div>`}
        </section>` : ""}
        <section class="p-tarjeta">
          <h3>Documentos</h3>
          <div class="p-lista">${docs.map((d) => `<button class="p-doc" data-abrir="${esc(completa(d.ruta))}"><span class="p-tipo">${ic(d.tipo === "glosario" ? "elemento" : /\.mmd$/.test(d.ruta) ? "diagrama" : "doc")}</span><span class="p-txt"><b data-sin-traducir>${esc(d.titulo)}</b><small data-sin-traducir>${esc(d.ruta)}</small></span></button>`).join("") || `<p class="p-ayuda">Todavía no hay documentos.</p>`}</div>
        </section>
        <div class="p-acciones izq">
          ${E.proyecto.vinculado ? `<button class="boton" data-accion="p-pasar">${ic("exportar")} Pasar al proyecto</button>` : ""}
          <button class="boton" data-p="elementos">${ic("elemento")} Elementos</button>
          <button class="boton" data-p="versiones">${ic("historia")} Versiones</button>
        </div>`;
    }
    const TIPOS_ORDEN = ["vision", "arquitectura", "flujo", "otro", "glosario"];
    function revisionHTML(rev) {
      if (!rev.documentos.length) return `<p class="p-ayuda">Ningún documento nombra lo que tocaron esos commits.</p><div class="p-acciones izq"><button class="boton" data-accion="p-cambios-vistos">Listo</button></div>`;
      return `<p class="p-ayuda">${rev.documentos.length === 1 ? frase("Puede estar desactualizado 1 documento, por:") : frase("Pueden estar desactualizados {n} documentos, por:", { n: rev.documentos.length })} <span data-sin-traducir>${rev.elementos.map((e) => esc(e.nombre)).join(", ")}</span></p>
        <ul class="p-commits" data-sin-traducir>${rev.documentos.map((r) => `<li>${esc(tituloDoc(r))} <small>${esc(rel(r))}</small></li>`).join("")}</ul>
        <div class="p-acciones izq"><button class="boton principal" data-accion="p-revisar-ia">${ic("chispa")} ${frase("Pedir a {ia} que los ponga al día", { ia: nombreIA() })}</button><button class="boton plano" data-accion="p-cambios-vistos">Ya lo revisé</button></div>`;
    }

    // Propuestas de la IA: una tarjeta por archivo, con «Quitar este cambio».
    function propuestasHTML() {
      const pr = E.propuestas, n = pr.lista.filter((p) => !p.quitada).length + (pr.elementos.length && !pr.elementosQuitados ? 1 : 0);
      const tarjeta = (p, i) => `<article class="p-prop ${p.quitada ? "quitada" : ""}">
          <div class="p-prop-cab"><span class="p-tipo">${ic(p.existe ? "lapiz" : "doc")}</span><span class="p-txt"><b>${esc(p.titulo)}</b><small>${esc(rel(p.ruta))} · ${T(p.existe ? "Cambia" : "Nuevo")}</small></span>
            <span class="p-prop-acc">${p.error ? "" : `<button class="boton plano" data-p-ver="${i}">${T(p.ver ? "Ocultar" : "Ver")}</button><button class="boton" data-p-quitar="${i}">${p.quitada ? ic("mas") + " " + T("Volver a agregar") : ic("deshacer") + " " + T("Quitar este cambio")}</button>`}</span></div>
          ${p.error ? `<p class="mal-txt">${T("Un diagrama tiene un error (línea {n}: {x}). No lo agrego; pídelo de nuevo.", { n: p.error.linea, x: p.error.frase })}</p>` : ""}
          ${p.ver ? (p.existe ? difHTML(p.antes || "", p.texto) : `<div class="p-previa md" data-p-md="${i}"></div>`) : ""}
        </article>`;
      return `<div class="p-cab"><span class="p-icono">${ic("chispa")}</span><div><h2>${T("Revisa lo que propone tu IA")}</h2><p>${T("Nada está guardado todavía. Quita lo que no te sirva y guarda el resto como una sola versión.")}</p></div></div>
        ${pr.nota ? `<div class="p-aviso p-nota"><b>${esc(nombreIA())}:</b> ${esc(pr.nota)}</div>` : ""}
        ${pr.descartados ? `<p class="p-ayuda">${T("Descarté {n} partes de la respuesta que no venían en el formato correcto.", { n: pr.descartados })}</p>` : ""}
        ${pr.lista.map(tarjeta).join("")}
        ${pr.elementos.length ? `<article class="p-prop ${pr.elementosQuitados ? "quitada" : ""}"><div class="p-prop-cab"><span class="p-tipo">${ic("elemento")}</span><span class="p-txt"><b>${T("Elementos ({n})", { n: pr.elementos.length })}</b><small>${T("Lo que la documentación nombra y conecta")}</small></span><span class="p-prop-acc"><button class="boton" data-p-quitar="el">${pr.elementosQuitados ? ic("mas") + " " + T("Volver a agregar") : ic("deshacer") + " " + T("Quitar este cambio")}</button></span></div>
          <div class="p-chips">${pr.elementos.map((e) => `<span class="p-chip" title="${esc(e.descripcion || "")}">${esc(e.nombre)} <small>${T(NOMBRE_TIPO[e.tipo])}${e.estado === "cambia" ? " · " + T("cambia") : ""}</small></span>`).join("")}</div></article>` : ""}
        ${!pr.lista.length && !pr.elementos.length ? `<p class="p-ayuda">${T("Tu IA no propuso cambios.")}</p>` : ""}
        <div class="p-acciones p-pie"><button class="boton" data-accion="p-descartar">${T("Descartar todo")}</button><button class="boton principal" data-accion="p-aplicar" ${n ? "" : "disabled"}>${T("Guardar {n} cambios", { n })}</button></div>`;
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
          <div class="buscar-fila"><input type="search" id="p-buscar" placeholder="Buscar elementos" aria-label="Buscar elementos" value="${esc(pj.buscar)}" data-sin-traducir><button class="boton" data-accion="p-elemento-nuevo">${ic("mas")} Nuevo</button></div>
          ${grupos.map(([t, l]) => `<h4>${NOMBRE_TIPO[t]}</h4>${l.map((e) => `<button class="archivo" data-p-elemento="${esc(e.id)}" aria-current="${e.id === pj.elemento}" data-sin-traducir>${ic("elemento")}<span>${esc(e.nombre)}</span></button>`).join("")}`).join("")}
          ${!lista.length ? (q ? `<div class="p-ayuda">${frase("Aún no existe «{x}».", { x: pj.buscar.trim() })} <button class="boton" data-accion="p-elemento-nuevo">${ic("mas")} ${frase("Crear «{x}»", { x: pj.buscar.trim() })}</button></div>` : `<p class="p-ayuda">Todavía no hay elementos. Documenta el proyecto con tu IA o crea uno.</p>`) : ""}
        </div>`;
      return `<div class="p-el">${listaHTML}${el ? fichaHTML(el) : movil() ? "" : `<div class="p-ficha vacio"><p>Elige un elemento para ver dónde se usa y cambiarlo en todos los documentos a la vez.</p></div>`}</div>`;
    }
    function fichaHTML(el) {
      const { docs, listos } = docsProyecto();
      const usos = M.usosElemento(docs, el);
      const ed = pj.editar;
      const editar = ed ? `<div class="p-editar">
          ${ed.campo === "nombre" ? `<label for="p-valor">Nombre nuevo</label><input type="text" id="p-valor" value="${esc(ed.valor)}" data-sin-traducir data-autofoco>` : `<label for="p-valor">Descripción</label><textarea id="p-valor" data-sin-traducir data-autofoco>${esc(ed.valor)}</textarea>`}
          ${ed.error ? `<p class="mal-txt">${esc(tr(ed.error))}</p>` : ""}
          <div class="p-acciones izq"><button class="boton principal" data-accion="p-ver-cambio">${ed.campo === "nombre" ? "Ver qué cambia" : "Guardar"}</button><button class="boton plano" data-accion="p-editar-no">Cancelar</button></div></div>` : "";
      return `<div class="p-ficha">
        ${movil() ? `<button class="boton plano" data-accion="p-volver-lista">${ic("volver")} Elementos</button>` : ""}
        <div class="p-ficha-cab"><span class="p-icono">${ic("elemento")}</span><div><h2 data-sin-traducir>${esc(el.nombre)}</h2><p><span>${NOMBRE_TIPO[el.tipo]}</span> · <code data-sin-traducir>${esc(el.id)}</code></p></div></div>
        ${el.descripcion ? `<p class="p-desc" data-sin-traducir>${esc(el.descripcion)}</p>` : ""}
        ${el.codigo?.length ? `<p class="p-codigo"><span>En el código:</span> <span data-sin-traducir>${el.codigo.map((c) => `<code>${esc(c)}</code>`).join(" ")}</span></p>` : ""}
        ${editar || `<div class="p-acciones izq"><button class="boton" data-accion="p-renombrar">${ic("lapiz")} Renombrar</button><button class="boton" data-accion="p-describir">Cambiar descripción</button><button class="boton" data-accion="p-comportamiento">${ic("chispa")} Cambió cómo funciona</button><button class="boton peligro" data-accion="p-quitar">${ic("borrar")} Quitar</button></div>`}
        <h3>Dónde se usa</h3>
        ${!listos ? `<div class="esperando"><span class="giro"></span> Leyendo los documentos…</div>` : usos.length ? `<div class="p-lista">${usos.map((u) => `<button class="p-doc" data-abrir="${esc(u.ruta)}" ${u.nodos[0] && u.nodos[0].bloque >= 0 ? `data-p-bloque="${u.nodos[0].bloque}"` : ""}><span class="p-tipo">${ic(/\.mmd$/.test(u.ruta) ? "diagrama" : "doc")}</span><span class="p-txt"><b data-sin-traducir>${esc(tituloDoc(u.ruta))}</b>${`<small data-sin-traducir>${esc(resumenUso(u))}</small>`}</span></button>`).join("")}</div>` : `<p class="p-ayuda">Ningún documento lo usa todavía.</p>`}
      </div>`;
    }

    // Versiones: línea de tiempo, ver una, comparar y restaurar.
    function versionesHTML() {
      const v = pj.versiones;
      if (!v || (v.cargando && !v.lista)) return `<div class="esperando"><span class="giro"></span> Leyendo la historia…</div>`;
      if (v.error) return `<p class="mal-txt" data-sin-traducir>${esc(tr(v.error))}</p>`;
      const sel = v.lista.find((x) => x.id === v.sel);
      const linea = `<ol class="p-tiempo">
          ${v.pendiente ? `<li class="pendiente"><span class="p-punto"></span><div><b>Cambios sin guardar como versión</b><button class="boton principal" data-accion="p-guardar-version">${ic("historia")} Guardar versión</button></div></li>` : ""}
          ${v.lista.map((x) => `<li><span class="p-punto"></span><button class="p-version" data-p-version="${esc(x.id)}" aria-current="${x.id === v.sel}"><b data-sin-traducir>${esc(x.mensaje)}</b><small data-sin-traducir>${esc(fecha(x.fecha))}${v.modo === "git" ? " · " + esc(x.id.slice(0, 7)) : ""}</small></button></li>`).join("")}
          ${!v.lista.length ? `<li><p class="p-ayuda">Todavía no hay versiones guardadas.</p></li>` : ""}
        </ol>`;
      let detalle = "";
      if (sel) {
        const A = v.archivos[sel.id], B = v.archivos[v.contra];
        const opciones = [["actual", tr("Ahora")], ...v.lista.filter((x) => x.id !== sel.id).map((x) => [x.id, `${fecha(x.fecha)} · ${x.mensaje.slice(0, 40)}`])];
        let cuerpo = `<div class="esperando"><span class="giro"></span> Comparando…</div>`;
        if (A && B) {
          const lista = M.difVersiones(A, B);
          cuerpo = lista.length ? lista.map((f) => `<div class="p-dif-archivo"><button class="p-doc" data-p-dif="${esc(f.ruta)}" aria-expanded="${v.abierto === f.ruta}"><span class="p-tipo">${ic(f.ruta.endsWith(".mmd") ? "diagrama" : "doc")}</span><span class="p-txt"><b data-sin-traducir>${esc(f.ruta)}</b><small>${{ nuevo: "Nuevo después", quitado: "Ya no está", cambiado: "Cambió" }[f.estado]}</small></span></button>
              ${v.abierto === f.ruta ? `<div data-sin-traducir>${difHTML(A[f.ruta] || "", B[f.ruta] || "")}</div>` : ""}</div>`).join("") : `<p class="p-ayuda">Son iguales.</p>`;
        }
        detalle = `<section class="p-tarjeta p-detalle">
          <h3 data-sin-traducir>${esc(sel.mensaje)}</h3>
          <div class="p-comparar"><label for="p-contra">Comparar con</label><select id="p-contra" data-sin-traducir>${opciones.map(([id, n]) => `<option value="${esc(id)}" ${id === v.contra ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          ${cuerpo}
          <div class="p-acciones izq"><button class="boton" data-accion="p-restaurar">${ic("deshacer")} Restaurar esta versión</button></div>
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
          ${f.existe && !f.igual ? `<span class="p-pasar-acc"><label class="marcar chico"><input type="checkbox" data-p-reemplazar="${i}" ${f.reemplazar ? "checked" : ""}> <span>Reemplazar</span></label><button class="boton plano" data-p-ver-dif="${i}">${d.abierta === i ? "Ocultar" : "Ver diferencia"}</button></span>` : ""}
          ${d.abierta === i ? `<div class="p-dif" data-sin-traducir>${difHTML(f.antes || "", E.docs[completa(f.ruta)]?.texto || "")}</div>` : ""}
        </div>`;
      return `<h2 id="t-pj">Pasar al proyecto</h2>
        ${frase("Elige qué documentos copiar al repo {x}. Lo que ya existe solo se cambia si marcas «Reemplazar».", { x: d.codigo || E.proyecto?.codigo || "" }, "p")}
        ${d.cargando ? `<div class="esperando"><span class="giro"></span> Revisando el repo…</div>` : `<div class="p-pasar">${d.filas.map(fila).join("")}</div>`}
        ${d.error ? `<p class="mal-txt">${esc(tr(d.error))}</p>` : ""}
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-pasar-enviar" ${d.cargando || d.enviando || !n ? "disabled" : ""}>${n === 1 ? "Pasar 1 archivo" : frase("Pasar {n} archivos", { n })}</button></div>`;
    }
    function dialogoHTML(capa) {
      if (pj.generando) return capa("t-pj", `<h2 id="t-pj">${frase("{ia} está escribiendo la documentación…", { ia: nombreIA() })}</h2><div class="esperando"><span class="giro"></span><span>Puede tardar un par de minutos. Nada se guarda hasta que lo revises.</span></div><div class="pie-dialogo"><button class="boton" data-accion="p-cancelar">Cancelar</button></div>`);
      const d = pj.dialogo;
      if (!d) return "";
      if (d.tipo === "error") return capa("t-pj", `<h2 id="t-pj">No resultó</h2><p data-sin-traducir>${esc(tr(d.texto))}</p><div class="pie-dialogo"><button class="boton principal" data-accion="cerrar" data-autofoco>Entendido</button></div>`);
      if (d.tipo === "envio") return capa("t-pj", envioHTML(d), "ancho");
      if (d.tipo === "pasar") return capa("t-pj", pasarHTML(d), "ancho");
      if (d.tipo === "flujo") return capa("t-pj", `<h2 id="t-pj">Documentar un flujo</h2><p>Cuéntale a tu IA qué quieres documentar: «el flujo de…» o «la secuencia de…». Si necesita leer archivos del código, te pregunta antes.</p>
        <textarea id="p-pedido" placeholder="Por ejemplo: cómo se graba una reunión, desde que tocas Grabar hasta que queda guardada" data-autofoco data-sin-traducir>${esc(d.pedido || "")}</textarea>
        ${d.error ? `<p class="mal-txt">${esc(tr(d.error))}</p>` : ""}
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-flujo-enviar">${ic("chispa")} Seguir</button></div>`);
      if (d.tipo === "pedir") return capa("t-pj", `<h2 id="t-pj">${frase("{ia} quiere leer estos archivos", { ia: nombreIA() })}</h2>
        ${d.nota ? `<p data-sin-traducir>${esc(d.nota)}</p>` : ""}<p>Elige cuáles le mandas. Solo van archivos de texto del proyecto, nunca secretos ni lo que ignora .gitignore.</p>
        <div class="p-pedir" data-sin-traducir>${d.rutas.map((r, i) => `<label class="marcar"><input type="checkbox" data-p-elegir="${i}" ${d.elegidas.includes(r) ? "checked" : ""}> <span><code>${esc(r)}</code></span></label>`).join("")}</div>
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">No mandar nada</button><button class="boton principal" data-accion="p-pedir-enviar" ${d.elegidas.length ? "" : "disabled"}>Seguir</button></div>`);
      if (d.tipo === "cambio") return capa("t-pj", cambioHTML(d), "ancho");
      if (d.tipo === "comportamiento") return capa("t-pj", `<h2 id="t-pj">${frase("¿Qué cambió en «{x}»?", { x: d.el.nombre })}</h2><p>Tu IA propone cómo cambiar cada documento que lo usa; tú aceptas o quitas cada cambio.</p>
        <textarea id="p-pedido" placeholder="Por ejemplo: ahora pide confirmación antes de empezar" data-autofoco data-sin-traducir>${esc(d.pedido || "")}</textarea>
        ${frase("Documentos que lo usan: {n}", { n: d.documentos.length }, "p")}
        ${d.error ? `<p class="mal-txt">${esc(tr(d.error))}</p>` : ""}
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-comportamiento-enviar" ${d.documentos.length ? "" : "disabled"}>${ic("chispa")} Seguir</button></div>`);
      if (d.tipo === "version") return capa("t-pj", `<h2 id="t-pj">Guardar versión</h2><p>${E.proyecto?.git?.hay ? "Hago un commit solo con la carpeta de la documentación. No toco otros archivos ni subo nada." : "Guardo una copia de la documentación en .versiones/."}</p>
        <label for="p-mensaje">¿Qué cambió?</label><input type="text" id="p-mensaje" value="${esc(d.mensaje)}" data-sin-traducir data-autofoco>
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-version-enviar">${ic("historia")} Guardar versión</button></div>`);
      if (d.tipo === "nuevo-elemento") return capa("t-pj", `<h2 id="t-pj">Nuevo elemento</h2><p>Algo que la persona reconoce de la app: una pantalla, un botón, un servicio… Después lo enlazas desde los diagramas.</p>
        <label for="p-el-nombre">Nombre</label><input type="text" id="p-el-nombre" value="${esc(d.nombre || "")}" data-sin-traducir data-autofoco>
        <label>Tipo</label><div class="chips">${M.TIPOS_ELEMENTO.map((t) => `<button class="chip" data-p-tipo="${t}" aria-pressed="${d.tipoEl === t}">${NOMBRE_TIPO[t]}</button>`).join("")}</div>
        <label for="p-el-desc">Descripción (opcional)</label><textarea id="p-el-desc" data-sin-traducir>${esc(d.descripcion || "")}</textarea>
        ${d.error ? `<p class="mal-txt">${esc(tr(d.error))}</p>` : ""}
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-elemento-crear">Crear</button></div>`);
      if (d.tipo === "restaurar") return capa("t-pj", `<h2 id="t-pj">¿Restaurar esta versión?</h2>${frase("Vuelvo la documentación a como estaba el {f}. Lo de ahora no se pierde: queda en la historia y puedes volver.", { f: fecha(d.version.fecha) }, "p")}
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-restaurar-si" data-autofoco>Restaurar</button></div>`);
      return "";
    }
    function envioHTML(d) {
      const titulo = d.datos?.forma === "diagrama" ? "Crear diagrama" : { inicial: "Documentar el proyecto", flujo: "Documentar un flujo", cambio: "Actualizar los documentos", revisar: "Poner al día la documentación", completar: "Completar la documentación" }[d.tarea];
      if (d.cargando) return `<h2 id="t-pj">${titulo}</h2><div class="esperando"><span class="giro"></span> Preparando lo que se envía…</div>`;
      if (d.error) return `<h2 id="t-pj">${titulo}</h2><p class="mal-txt" data-sin-traducir>${esc(tr(d.error))}</p><div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cerrar</button></div>`;
      const motivos = { ruta: "ruta no válida", fuera: "no existe, es un secreto o está ignorado", binario: "no es texto", tope: "pasa del tope de tamaño" };
      return `<h2 id="t-pj">${titulo}</h2>
        <p>${frase("Esto es exactamente lo que le mando a {ia} ({b}). Revísalo antes de enviar: nada más sale de tu computador.", { ia: nombreIA(), b: tamano(d.bytes) })}</p>
        <div class="p-envio">${d.piezas.map((p, i) => `<details ${d.abierta === i ? "open" : ""}><summary><span data-sin-traducir>${p.ruta ? `<code>${esc(p.ruta)}</code>` : esc(tr(p.titulo))}</span><small data-sin-traducir>${esc(tamano(p.bytes))}${p.recortado ? " · " + esc(tr("recortado")) : ""}</small></summary><pre data-sin-traducir>${esc(p.texto)}</pre></details>`).join("")}</div>
        ${d.aFondo ? fondoHTML(d) : ""}
        ${d.rechazados.length ? `<p class="p-ayuda">No mando: <span data-sin-traducir>${d.rechazados.map((r) => `<code>${esc(r.ruta)}</code> (${esc(tr(motivos[r.motivo] || r.motivo))})`).join(", ")}</span></p>` : ""}
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-enviar" data-autofoco>${ic("chispa")} ${frase("Enviar a {ia}", { ia: nombreIA() })}</button></div>`;
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
      if (!listos) return `<h2 id="t-pj">Revisando los documentos…</h2><div class="esperando"><span class="giro"></span></div>`;
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
        <div class="p-cambio-lista" data-sin-traducir>${archivos.map((a, i) => `<div class="p-prop"><div class="p-prop-cab"><span class="p-tipo">${ic(/\.mmd$/.test(a.ruta) ? "diagrama" : "doc")}</span><span class="p-txt"><b>${esc(tituloDoc(a.ruta))}</b><small>${esc(rel(a.ruta))}${a.despues === a.antes ? " · " + esc(tr("lo menciona, no cambia")) : ""}</small></span>${a.despues !== a.antes ? `<button class="boton plano" data-p-ver-cambio="${i}">${esc(tr(d.abierto === i ? "Ocultar" : "Antes y después"))}</button>` : ""}</div>
            ${nota(a).length ? `<ul class="p-notas">${nota(a).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
            ${a.notas.frases.length && c.tipo !== "renombrar" ? `<p class="p-ayuda">${esc(tr("Frases que lo mencionan (revísalas después):"))}</p><ul class="p-frases">${a.notas.frases.slice(0, 6).map((f) => `<li><small>${esc(Tp("Línea {n}", { n: f.linea }))}</small> ${esc(f.despues)}</li>`).join("")}</ul>` : ""}
            ${d.abierto === i ? difHTML(a.antes, a.despues) : ""}</div>`).join("")}</div>
        <div class="pie-dialogo"><button class="boton" data-accion="cerrar">Cancelar</button><button class="boton principal" data-accion="p-aplicar-cambio" data-autofoco>${c.tipo === "describir" ? "Guardar" : frase("Aplicar en {n} archivos", { n: cambian.length + 1 })}</button></div>`;
    }

    // ───────────── El lienzo: enlazar un nodo con un elemento ─────────────
    function enProyecto() { return !!(E.proyecto && E.sel && enDocs(E.sel)); }
    function botonElemento(nodo) {
      if (!enProyecto()) return "";
      const id = M.refsDiagrama(api.textoLienzo())[nodo], el = id && elemento(id);
      // Texto fijo en español: pintarSeleccion lo traduce (traducirDOM).
      return el ? `<button class="boton" data-p-elemento="${esc(el.id)}" title="Ver el elemento">${ic("elemento")} <span data-sin-traducir>${esc(el.nombre)}</span></button>`
        : `<button class="boton" data-accion="p-enlazar" title="Conectar con un elemento del proyecto">${ic("elemento")} Enlazar</button>`;
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
      if (d.p) {
        E.lateral = false; E.panel = d.p;
        if (d.p === "versiones") cargarVersiones();
        if (d.p !== "elementos" || movil()) { pj.editar = null; if (movil()) pj.elemento = null; }  // en celular, Elementos abre la lista
        api.pintar(); return true;
      }
      if (d.pDocs !== undefined) {
        // La carpeta «Documentación»: abre lo que tiene y lo que le falta (o, vacía, la invitación a documentar todo).
        E.abiertas["#docs"] = E.panel === "proyecto" && !E.sel ? !(E.abiertas["#docs"] ?? true) : true;
        E.panel = "proyecto"; E.sel = null; E.lateral = false; api.pintar(); return true;
      }
      if (d.pReciente !== undefined) { E.lateral = false; pj.pedido = true; host.enviar("abrirProyecto", { indice: Number(d.pReciente) }); return true; }
      if (d.pElemento !== undefined && !d.accion) { E.lateral = false; E.menu = null; pj.elemento = d.pElemento; pj.editar = null; E.panel = "elementos"; api.pintar(); return true; }
      if (d.abrir && d.pBloque !== undefined) { api.abrir(d.abrir); const k = Number(d.pBloque); if (k >= 0) { E.bloque = k; E.lz.ajustar = true; if (movil()) E.vista = "dibujo"; api.pintar(); } return true; }
      if (d.pVer !== undefined) { const p = E.propuestas.lista[Number(d.pVer)]; p.ver = !p.ver; api.pintar(); return true; }
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
          if (E.proyecto) { pj.dialogo = { tipo: "flujo", pedido: "" }; api.pintar(); return true; }
          pj.pedido = true; host.enviar("elegirCarpeta", { proyecto: true }); return true;
        case "p-documentar":
          E.nuevo = null; E.lateral = false; E.sel = null;
          if (E.proyecto) { pedirIA("inicial", { docs: docsDir() }); return true; }
          if (!E.carpeta) { pj.pedido = true; host.enviar("elegirCarpeta", { proyecto: true }); return true; }
          if (vinculado()) { E.panel = "proyecto"; E.encontrado = { cargando: true, docs: "" }; enviar("leer"); api.pintar(); return true; }
          enviar("vincular"); return true;  // la documentación va aparte: después se abre «Lo que encontré»
        case "p-agregar": E.nuevo = null; E.lateral = false; pj.pedido = true; host.enviar("elegirCarpeta", { proyecto: true }); return true;
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
      if (t.id === "p-contra" && pj.versiones) { pj.versiones.contra = t.value; pj.versiones.abierto = null; enviar("ver", { id: t.value }); api.pintar(); }
      if (t.dataset?.pOpcion && pj.dialogo?.tipo === "cambio") { pj.dialogo.cambio[t.dataset.pOpcion] = t.checked; api.pintar(); }
      if (t.dataset?.pElegir !== undefined && pj.dialogo?.tipo === "pedir") { const r = pj.dialogo.rutas[Number(t.dataset.pElegir)]; pj.dialogo.elegidas = t.checked ? [...pj.dialogo.elegidas, r] : pj.dialogo.elegidas.filter((x) => x !== r); api.pintar(); }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "p-buscar") { pj.buscar = e.target.value; const pos = e.target.selectionStart; api.pintar(); const b = $("#p-buscar"); if (b) { b.focus(); b.selectionStart = b.selectionEnd = pos; } }
      if (e.target.id === "p-valor" && pj.editar) pj.editar.valor = e.target.value;
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
      E.proyecto = null; E.encontrado = null; E.vinculo = null; E.codigoDocs = null; pj.ofrecerPasar = false; E.propuestas = null; pj.versiones = null; pj.elemento = null; pj.ultimo = null; pj.dialogo = null;
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
    function alCambiarArchivos() { if (E.proyecto) cargarDocs(); }
    function hayDialogo() { return !!(pj.dialogo || pj.generando); }
    function cerrarDialogo() { pj.dialogo = null; if (pj.generando) { pj.generando = null; } }

    return { lateralHTML, recientesHTML, esProyecto, esCodigo, leerCodigo, guardarCodigo, barraHTML, areaHTML, dialogoHTML, menuElementosHTML, botonElemento, clic, respuesta, despuesDePintar, enlace, pedirIA,
      alCambiarCarpeta, alAbrirArchivo, alGuardarArchivo, alCambiarArchivos, hayDialogo, cerrarDialogo, simular,
      _: { armarPropuestas, docsProyecto, cargarDocs, loQueFalta, pedidoCompletar } };

    // ───────────── Vista previa en el navegador: un proyecto ficticio (ui/demo.json → proyecto) ─────────────
    function simular(d, memoria, DEMO, luego) {
      const A = window.Esquema, docs = "docs/esquema", sim = (simular.s = simular.s || { versiones: [] });
      const responder = (r, ms = 120) => luego(ms, () => A.proyectoRespuesta({ orden: d.orden, ...r }));
      const enDocsSim = () => Object.fromEntries(Object.entries(memoria).filter(([k]) => k.startsWith(docs + "/")).map(([k, v]) => [k.slice(docs.length + 1), v]));
      const leerEsquema = () => { try { return JSON.parse(memoria[docs + "/esquema.json"]); } catch { return null; } };
      const recientes = () => (leerEsquema() || sim.vinculado ? [{ nombre: leerEsquema()?.nombre || DEMO.carpeta.nombre, ruta: DEMO.carpeta.ruta, ubicacion: "~/Esquema/" + DEMO.carpeta.nombre, codigo: DEMO.carpeta.nombre }] : []);
      // El repo del código, para «Pasar al proyecto» (en memoria; ya trae una arquitectura vieja para mostrar «Ya existe»).
      sim.repo = sim.repo || { "docs/arquitectura.md": "# Arquitectura\n\nLa versión que estaba en el repo.\n" };
      const lugar = () => (sim.vinculado ? { vinculado: true, ubicacion: "~/Esquema/" + DEMO.carpeta.nombre, codigo: DEMO.carpeta.nombre } : {});
      const pr = DEMO.proyecto;
      switch (d.orden) {
        case "abrir": { const x = leerEsquema(); return responder({ ok: true, existe: !!x, docs, esquema: x, git: { hay: true }, cambios: sim.cambios || null, pendiente: sim.pendiente !== false && !!x && !sim.versiones.length, recientes: recientes(), ...lugar() }); }
        case "vincular": sim.vinculado = true; return responder({ ok: true, indice: 0, ubicacion: lugar().ubicacion, recientes: recientes() });
        case "mover": sim.vinculado = true; return responder({ ok: true, indice: 0, desde: docs, ubicacion: lugar().ubicacion, recientes: recientes() });
        case "codigo": {
          if (!sim.vinculado) return responder({ ok: false, error: "Este proyecto no tiene una carpeta de código vinculada." });
          const arch = [...new Set(["README.md", ...Object.keys(sim.repo)])].filter((x) => /\.(md|mmd)$/.test(x)).map((ruta) => ({ ruta, tamano: (sim.repo[ruta] ?? memoria["README.md"] ?? "").length }));
          return responder({ ok: true, nombre: DEMO.carpeta.nombre, ubicacion: "~/" + DEMO.carpeta.nombre, archivos: arch });
        }
        case "codigo_leer": { const t = sim.repo[d.ruta] ?? (d.ruta === "README.md" ? memoria["README.md"] : null); return responder(t != null ? { ok: true, ruta: d.ruta, texto: t } : { ok: false, ruta: d.ruta, error: tr("No encontré el archivo") }, 20); }
        case "codigo_guardar": sim.repo[d.ruta] = d.texto; return responder({ ok: true, ruta: d.ruta }, 40);
        case "destinos": return responder({ ok: true, codigo: DEMO.carpeta.nombre, estados: Object.fromEntries((d.rutas || []).map((x) => [x, sim.repo[x] != null ? { valido: true, existe: true, texto: sim.repo[x] } : { valido: /^[\w.-]+(\/[\w.-]+)*\.(md|mmd)$/.test(x), existe: false }])) });
        case "pasar": {
          const escritos = [], saltados = [];
          for (const a of d.archivos || []) {
            const t = memoria[docs + "/" + a.ruta];
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
          for (const r of d.documentos || []) if (memoria[docs + "/" + r] != null) pieza("documento", r, memoria[docs + "/" + r], r);
          for (const r of d.archivos || []) { if (pr.codigo[r] != null) pieza("archivo", r, pr.codigo[r], r); else rechazados.push({ ruta: r, motivo: "fuera" }); }
          const aFondo = ["inicial", "flujo", "completar"].includes(d.tarea) ? { a_fondo: { carpeta: "~/" + DEMO.carpeta.nombre, no_leer: [".env", ".env.*", "*.pem", "*.key", ".git/"], puede: true } } : {};
          return responder({ ok: true, tarea: d.tarea, docs, piezas, rechazados, bytes: piezas.reduce((s, p) => s + p.bytes, 0), ...aFondo }, 150);
        }
        case "generar": return luego(600, () => A.proyectoRespuesta({ orden: "generar", ...generarSimulado(d, memoria, docs, pr) }));
        case "guardar": {
          const e = M.validarEsquema(d.esquema);
          if (e.length) return responder({ ok: false, error: "No guardé esquema.json: " + e.join("; ") });
          memoria[docs + "/esquema.json"] = JSON.stringify(d.esquema, null, 2) + "\n";
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
          for (const [k, t] of Object.entries(v.archivos)) if (ahora[k] !== t) { memoria[docs + "/" + k] = t; escritos.push(k); }
          return responder({ ok: true, docs, escritos, sobran: Object.keys(ahora).filter((k) => !(k in v.archivos)) });
        }
      }
    }
    /** La «IA» de la vista previa: documentos ficticios del proyecto de ejemplo, con elementos conectados. */
    function generarSimulado(d, memoria, docs, pr) {
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
        const propuestas = g.inicial.filter((p) => memoria[(docs ? docs + "/" : "") + p.ruta] == null);
        return { ok: true, tarea: "completar", docs, propuestas, elementos: g.elementos, pide: [], nota: g.nota };
      }
      // cambio o revisar: agrega lo pedido como una nota al comienzo de cada documento.
      const propuestas = (d.documentos || []).filter((r) => memoria[docs + "/" + r] != null).map((r) => {
        const t = memoria[docs + "/" + r], nota = `> ${en ? "Updated" : "Actualizado"}: ${String(d.pedido || (en ? "the code changed" : "cambió el código")).replace(/\n/g, " ").slice(0, 200)}`;
        const L = t.split("\n"), k = L.findIndex((l) => l.startsWith("# "));
        L.splice(k + 1, 0, "", nota);
        return { ruta: r, titulo: r, tipo: "otro", texto: L.join("\n") };
      });
      return { ok: true, tarea: d.tarea, docs, propuestas, elementos: [], pide: [], nota: en ? "I added a note at the top of each document." : "Agregué una nota al comienzo de cada documento." };
    }
  };
})();
