import AppKit
import PiezaActualizaciones
import UniformTypeIdentifiers
import WebKit

/// Ventana principal: la interfaz web (ui/) dentro de un WKWebView. La interfaz llama `host.enviar(accion, datos)` y la app responde
/// con `window.Esquema.<funcion>(json)`. El contrato está en pruebas/puente.json y lo revisa pruebas/contrato.py (un `case` por acción).
@MainActor
final class Ventana: NSObject, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let shared = Ventana()
    private var ventana: NSWindow?
    private var web: WKWebView?
    private var lista = false
    /// Guardados pedidos por la interfaz que aún no terminan (para cerrar o actualizar sin perder nada).
    private(set) var guardando = 0

    static let maximoExportar = 50 * 1024 * 1024
    /// Proyectos: lo que bin/proyecto.py sabe hacer (la interfaz no puede pedir otra cosa).
    static let ordenesProyecto: Set<String> = ["abrir", "leer", "preparar", "generar", "guardar", "version", "versiones", "ver", "restaurar", "vincular", "mover", "destinos", "pasar", "codigo", "codigo_leer", "codigo_guardar", "arbol", "documentar", "trabajo", "detener", "quitar", "detectar", "agregar", "crear", "responder", "continuar", "borrar", "recuperar", "historia_estado", "historia_cierre", "estudiar", "incongruencias", "wiki_preparar", "wiki_publicar"]
    /// Las órdenes largas que cuentan cómo van (bin/trabajos.py): sus eventos llegan a la interfaz como `proyectoProgreso`.
    static let ordenesConProgreso: Set<String> = ["documentar", "agregar", "crear", "responder", "continuar", "historia_cierre", "estudiar", "incongruencias"]
    /// Las que no necesitan una carpeta abierta (crear un proyecto Libro desde cero): no reciben `carpeta`.
    static let ordenesSinCarpeta: Set<String> = ["detectar", "crear"]

    func mostrar() {
        if ventana == nil { crear() }
        ventana?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// ¿Hay algo que se cortaría si la app se cierra (actualizar)? Un guardado o un script (la IA escribiendo, por ejemplo).
    var ocupada: Bool { guardando > 0 || Procesador.enCurso > 0 }

    private func crear() {
        let control = WKUserContentController()
        control.add(self, name: "esquema")
        control.addUserScript(WKUserScript(source: "window.ESQUEMA_HOST = 'mac';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let conf = WKWebViewConfiguration()
        conf.userContentController = control
        // La interfaz lee sus traducciones (ui/idiomas/*.json) y la demo con fetch desde los mismos archivos locales.
        conf.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let w = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800), configuration: conf)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.autoresizingMask = [.width, .height]
        let v = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        v.title = "Esquema"
        v.minSize = NSSize(width: 720, height: 520)
        v.contentView = w
        v.delegate = self
        v.isReleasedWhenClosed = false
        v.setFrameAutosaveName("Esquema")
        if !v.setFrameUsingName("Esquema") { v.center() }
        ventana = v
        web = w
        let ui = Rutas.recursos.appendingPathComponent("ui")
        w.loadFileURL(ui.appendingPathComponent("index.html"), allowingReadAccessTo: ui)
    }

    /// Cerrar la ventana no cierra la app (como en otras apps de Mac), pero sí guarda lo pendiente.
    func windowWillClose(_ notification: Notification) { guardarTodo() }

    func guardarTodo() { llamar("menu", ["accion": "guardar"]) }

    // MARK: Menús (los arma Menu en EsquemaApp.swift). Nada antes de elegir el idioma.

    private func menu(_ accion: String) {
        guard Idioma.elegido else { return }
        mostrar()
        llamar("menu", ["accion": accion])
    }

    @objc func menuAjustes() { menu("ajustes") }
    @objc func menuNuevo() { menu("nuevo") }
    @objc func menuGuardar() { menu("guardar") }
    @objc func menuDeshacer() { menu("deshacer") }
    @objc func menuRehacer() { menu("rehacer") }
    @objc func menuAcercar() { menu("acercar") }
    @objc func menuAlejar() { menu("alejar") }
    @objc func menuAjustar() { menu("ajustar") }
    @objc func menuVistaTexto() { menu("texto") }
    @objc func menuVistaAmbos() { menu("ambos") }
    @objc func menuVistaDibujo() { menu("dibujo") }

    @objc func menuAbrirCarpeta() {
        guard Idioma.elegido else { return }
        mostrar()
        elegirCarpeta()
    }

    @objc func menuMostrarCarpeta() {
        if let c = Carpeta.actual() { NSWorkspace.shared.open(c) }
    }

    // MARK: Hacia la interfaz

    func llamar(_ funcion: String, _ datos: Any) {
        guard let web, let d = try? JSONSerialization.data(withJSONObject: datos), let json = String(data: d, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.Esquema && window.Esquema.\(funcion)(\(json))")
    }

    /// Todo lo que pinta la interfaz al abrir: bin/estado.py + la carpeta (bin/carpeta.py listar) + lo propio de la app.
    /// Desde aquí se vigila la carpeta.
    func enviarEstado() {
        guard lista else { return }
        Procesador.correrJSON("estado.py", []) { datos in
            var base = datos
            base.removeValue(forKey: "ok"); base.removeValue(forKey: "error")
            base["version"] = Actualizaciones.version
            base["actualizacion"] = Actualizaciones.disponible
            if base["config"] == nil { base["config"] = Config.leer() }
            base["carpeta"] = NSNull(); base["archivos"] = [Any]()
            guard let c = Carpeta.actual() else {
                Vigilante.detener()
                return Ventana.shared.llamar("estado", base)
            }
            let sinCarpeta = base
            Procesador.correrJSON("carpeta.py", ["listar", c.path]) { r in
                var e = sinCarpeta
                if r["ok"] as? Bool == true {
                    e["carpeta"] = r["carpeta"] ?? NSNull()
                    e["archivos"] = r["archivos"] ?? [Any]()
                    Ventana.shared.vigilar(c, r)
                }
                Ventana.shared.llamar("estado", e)
            }
        }
    }

    private func vigilar(_ c: URL, _ listado: [String: Any]) {
        Vigilante.empezar(c)
        Vigilante.lista = (listado["archivos"] as? [[String: Any]] ?? []).compactMap { $0["ruta"] as? String }
    }

    private func elegirCarpeta(proyecto: Bool = false) {
        Carpeta.elegir(en: ventana) { u in
            guard let u else { return Ventana.shared.llamar("carpetaElegida", ["ok": false]) }
            Ventana.shared.listarYResponder(u, proyecto: proyecto)
        }
    }

    /// Lista la carpeta, la vigila y responde carpetaElegida (con proyecto: true si viene de «Documentar un proyecto» o de un reciente).
    private func listarYResponder(_ u: URL, proyecto: Bool) {
        Procesador.correrJSON("carpeta.py", ["listar", u.path]) { r in
            guard r["ok"] as? Bool == true else {
                return Ventana.shared.llamar("carpetaElegida", ["ok": false, "error": Idioma.t(r["error"] as? String ?? "No pude abrir esa carpeta.")])
            }
            Ventana.shared.vigilar(u, r)
            var x: [String: Any] = ["ok": true, "carpeta": r["carpeta"] ?? NSNull(), "archivos": r["archivos"] ?? [Any]()]
            if proyecto { x["proyecto"] = true }
            Ventana.shared.llamar("carpetaElegida", x)
        }
    }

    /// Un proyecto reciente: la ruta sale de <carpeta de Esquema>/proyectos.json (lo escribe bin/proyecto.py), nunca de la interfaz.
    private func abrirProyecto(_ indice: Int) {
        let todos = Archivos.leerJSON(Rutas.datos.appendingPathComponent("proyectos.json"))["recientes"] as? [[String: Any]] ?? []
        let lista = Array(todos.filter { ($0["ruta"] as? String)?.hasPrefix("/") == true && $0["nombre"] is String }.prefix(30))
        var dir: ObjCBool = false
        guard indice >= 0, indice < lista.count, let ruta = lista[indice]["ruta"] as? String,
              FileManager.default.fileExists(atPath: ruta, isDirectory: &dir), dir.boolValue else {
            return llamar("carpetaElegida", ["ok": false, "error": Idioma.t("No encontré ese proyecto. ¿Lo moviste?")])
        }
        let u = Carpeta.usar(URL(fileURLWithPath: ruta))
        listarYResponder(u, proyecto: true)
    }

    /// Nombre sugerido para «Guardar como»: solo el nombre (sin carpetas), con la extensión del formato.
    private static func nombreExportar(_ valor: Any?, _ formato: String) -> String {
        var n = ((valor as? String) ?? "esquema").replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: "\u{0}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        n = String(n.prefix(120))
        if n.isEmpty || n.hasPrefix(".") { n = "esquema" + n }
        if !n.lowercased().hasSuffix("." + formato) { n += "." + formato }
        return n
    }

    // MARK: Navegación: la ventana solo muestra la interfaz que viene dentro de la app

    /// Carpeta ui/ dentro de la app (sin enlaces simbólicos), para comparar rutas.
    private var carpetaUI: String { Rutas.recursos.appendingPathComponent("ui").resolvingSymlinksInPath().path + "/" }

    /// Un enlace o una redirección nunca carga una página de internet dentro de la ventana (esa página tendría el puente con la app):
    /// solo se permiten los archivos de ui/. Un enlace https que la persona toca se abre en su navegador.
    func webView(_ webView: WKWebView, decidePolicyFor accion: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let u = accion.request.url else { return .cancel }
        if u.isFileURL, u.resolvingSymlinksInPath().path.hasPrefix(carpetaUI) { return .allow }
        if u.scheme == "https", accion.navigationType == .linkActivated { NSWorkspace.shared.open(u) }
        return .cancel
    }

    /// «Elegir archivos» de la interfaz (un <input type="file">, para «Agregar» al proyecto): el panel del sistema. La interfaz lee lo
    /// elegido con FileReader y lo manda a bin/ (que lo valida); la app no abre ni guarda nada por su cuenta.
    func webView(_ webView: WKWebView, runOpenPanelWith parametros: WKOpenPanelParameters, initiatedByFrame marco: WKFrameInfo) async -> [URL]? {
        guard marco.isMainFrame, marco.securityOrigin.protocol == "file" else { return nil }
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parametros.allowsMultipleSelection
        panel.prompt = Idioma.t("Agregar")
        return panel.runModal() == .OK ? panel.urls : nil
    }

    /// Si el proceso de la página se cae (poca memoria), se vuelve a cargar la interfaz: lo guardado está en el disco.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        lista = false
        let ui = Rutas.recursos.appendingPathComponent("ui")
        webView.loadFileURL(ui.appendingPathComponent("index.html"), allowingReadAccessTo: ui)
    }

    // MARK: Desde la interfaz

    func userContentController(_ c: WKUserContentController, didReceive mensaje: WKScriptMessage) {
        // Solo la interfaz local (el marco principal, un archivo de ui/: la navegación de arriba no deja cargar otra cosa) puede
        // pedirle cosas a la app; una página de internet o un iframe, nunca.
        guard mensaje.frameInfo.isMainFrame, mensaje.frameInfo.securityOrigin.protocol == "file" else { return }
        guard let m = mensaje.body as? [String: Any], let accion = m["accion"] as? String else { return }
        let d = m["datos"] as? [String: Any] ?? [:]
        let texto = { (k: String, max: Int) in String((d[k] as? String ?? "").prefix(max)) }
        let idioma = d["idioma"] as? String == "en" ? "en" : "es"
        switch accion {
        case "listo":
            lista = true
            enviarEstado()
        case "config":
            Config.guardar(d)
            // Los menús se rearman en el idioma nuevo y, en el primer uso, recién ahí parte lo que esperaba (actualizaciones).
            if d["idioma_ui"] != nil { Menu.instalar() }
            if Idioma.elegido { EsquemaApp.iniciarTareas() }
        case "elegirCarpeta":
            elegirCarpeta(proyecto: d["proyecto"] as? Bool == true)
        case "abrirProyecto":
            abrirProyecto((d["indice"] as? NSNumber)?.intValue ?? -1)
        case "proyecto":
            // Solo órdenes conocidas y siempre sobre la carpeta actual; bin/proyecto.py valida el resto (rutas, docs, esquema.json, tamaños).
            let orden = d["orden"] as? String ?? ""
            let base = Carpeta.actual()
            guard Ventana.ordenesProyecto.contains(orden), base != nil || Ventana.ordenesSinCarpeta.contains(orden) else {
                return llamar("proyectoRespuesta", ["orden": String(orden.prefix(20)), "ok": false, "error": Idioma.t("Elige una carpeta primero")])
            }
            var e = d
            e.removeValue(forKey: "orden")
            // La carpeta siempre la pone la app (nunca la interfaz).
            e.removeValue(forKey: "carpeta")
            if let base { e["carpeta"] = base.path }
            var progreso: (@MainActor ([[String: Any]]) -> Void)? = nil
            if Ventana.ordenesConProgreso.contains(orden) {
                progreso = { (eventos: [[String: Any]]) in Ventana.shared.llamar("proyectoProgreso", ["eventos": eventos]) }
            }
            Procesador.conEntrada("proyecto.py", orden, e, progreso: progreso) { r in
                var x = r
                x["orden"] = orden
                Ventana.shared.llamar("proyectoRespuesta", x)
            }
        case "papelera":
            // Un .md/.mmd de la carpeta abierta (que no es documentación de Esquema) va a la Papelera del sistema, donde se puede
            // recuperar. La documentación se borra con la orden `borrar` (queda en el historial); el código vinculado, nunca.
            let ruta = d["ruta"] as? String ?? ""
            guard let base = Carpeta.actual(), let u = Carpeta.absoluta(ruta, en: base) else {
                return llamar("enPapelera", ["ok": false, "ruta": ruta, "error": Idioma.t("Ese archivo no se puede borrar.")])
            }
            do {
                try FileManager.default.trashItem(at: u, resultingItemURL: nil)
                Vigilante.conocidos.removeValue(forKey: ruta)
                llamar("enPapelera", ["ok": true, "ruta": ruta])
            } catch {
                llamar("enPapelera", ["ok": false, "ruta": ruta, "error": Idioma.t("No pude mandarlo a la Papelera.")])
            }
        case "abrirArchivo":
            let ruta = d["ruta"] as? String ?? ""
            guard let base = Carpeta.actual(), Carpeta.absoluta(ruta, en: base) != nil else {
                return llamar("archivoAbierto", ["ok": false, "ruta": ruta, "error": Idioma.t("Ese nombre de archivo no sirve.")])
            }
            Procesador.conEntrada("carpeta.py", "leer", ["carpeta": base.path, "ruta": ruta]) { r in
                if r["ok"] as? Bool == true, let t = r["texto"] as? String { Vigilante.conocidos[ruta] = t }
                var x = r
                if r["ok"] as? Bool != true { x["ruta"] = ruta; x["error"] = Idioma.t(r["error"] as? String ?? "No pude abrir el archivo.") }
                Ventana.shared.llamar("archivoAbierto", x)
            }
        case "guardarArchivo":
            let ruta = d["ruta"] as? String ?? ""
            guard let base = Carpeta.actual(), Carpeta.absoluta(ruta, en: base) != nil, let nuevoTexto = d["texto"] as? String else {
                return llamar("archivoGuardado", ["ok": false, "ruta": ruta, "error": Idioma.t("No pude guardar el archivo.")])
            }
            let nuevo = d["nuevo"] as? Bool == true
            guardando += 1
            EnOrden.agregar { listo in
                // Lo que Esquema escribe queda como conocido antes de escribirlo: el aviso de la carpeta no lo toma como un cambio de afuera.
                let antes = Vigilante.conocidos[ruta]
                Vigilante.conocidos[ruta] = nuevoTexto
                Procesador.conEntrada("carpeta.py", "guardar", ["carpeta": base.path, "ruta": ruta, "texto": nuevoTexto, "nuevo": nuevo]) { r in
                    Ventana.shared.guardando -= 1
                    var x = r
                    if r["ok"] as? Bool != true {
                        if let antes { Vigilante.conocidos[ruta] = antes } else { Vigilante.conocidos.removeValue(forKey: ruta) }
                        x["ruta"] = ruta
                        x["error"] = Idioma.t(r["error"] as? String ?? "No pude guardar el archivo.")
                    }
                    Ventana.shared.llamar("archivoGuardado", x)
                    listo()
                }
            }
        case "probarIA":
            let ia = d["ia"] as? String ?? ""
            guard Config.ias.contains(ia) else { return llamar("iaProbada", ["ia": ia, "ok": false, "error": Idioma.t("No conozco esa IA.")]) }
            Procesador.conEntrada("ia.py", "probar", ["ia": ia]) { r in
                var x = r
                x["ia"] = ia
                Ventana.shared.llamar("iaProbada", x)
            }
        case "estructura":
            guard let base = Carpeta.actual() else { return llamar("estructuraLista", ["ok": false, "error": Idioma.t("Elige una carpeta primero")]) }
            Procesador.correrJSON("carpeta.py", ["estructura", base.path]) { Ventana.shared.llamar("estructuraLista", $0) }
        case "crearReadme":
            // Lo que escribió la persona va en el archivo de entrada; bin/asistente.py arma el prompt y limpia la respuesta.
            var e: [String: Any] = ["descripcion": texto("descripcion", 4000), "estructura": d["estructura"] as? Bool == true, "idioma": idioma,
                                    "anterior": texto("anterior", 200_000), "pedido": texto("pedido", 2000)]
            if let base = Carpeta.actual() { e["carpeta"] = base.path }
            Procesador.conEntrada("asistente.py", "readme", e) { Ventana.shared.llamar("readmeListo", $0) }
        case "dibujar":
            let tipos: Set<String> = ["auto", "flujo", "secuencia", "arquitectura"]
            let pedido = d["tipo"] as? String ?? ""
            let tipo = tipos.contains(pedido) ? pedido : "auto"
            Procesador.conEntrada("asistente.py", "dibujar", ["pedido": texto("pedido", 3000), "tipo": tipo, "actual": texto("actual", 60_000), "idioma": idioma]) {
                Ventana.shared.llamar("dibujoListo", $0)
            }
        case "exportar":
            exportar(d)
        case "copiar":
            let t = d["texto"] as? String ?? ""
            NSPasteboard.general.clearContents()
            let ok = !t.isEmpty && t.utf8.count <= Ventana.maximoExportar && NSPasteboard.general.setString(t, forType: .string)
            llamar("copiado", ["ok": ok])
        case "abrirEnlace":
            if let u = URL(string: d["url"] as? String ?? ""), u.scheme == "https", u.host != nil { NSWorkspace.shared.open(u) }
        case "catalogoPlantillas":
            // Plantillas de la comunidad: el índice se baja de un dominio fijo y lo valida bin/plantillas.py (Catalogo.swift).
            Catalogo.listar { Ventana.shared.llamar("catalogoListo", $0) }
        case "descargarPlantilla":
            let id = texto("id", 60)
            Catalogo.descargar(id) { Ventana.shared.llamar("plantillaDescargada", $0) }
        case "buscarActualizacion":
            Actualizaciones.revisar { Ventana.shared.llamar("actualizacionRevisada", $0) }
        case "actualizar":
            // La interfaz guarda todo justo antes de pedirlo: se espera a que esos guardados terminen (hasta 5 segundos).
            actualizarCuandoPueda(hasta: Date().addingTimeInterval(5))
        default:
            break
        }
    }

    /// Nunca en medio de un guardado o de la IA escribiendo: cerrar la app los cortaría.
    private func actualizarCuandoPueda(hasta limite: Date) {
        if ocupada {
            guard Date() < limite else {
                // La misma forma que los avisos de la pieza: el texto en español y la interfaz lo traduce.
                return llamar("actualizacionProgreso", ["paso": "error", "codigo": "ocupada", "texto": "Espera a que termine de guardar o de responder tu IA y vuelve a intentarlo.", "valores": [String: String](), "total": 3])
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { Task { @MainActor in Ventana.shared.actualizarCuandoPueda(hasta: limite) } }
            return
        }
        Actualizaciones.seguir { Ventana.shared.llamar("actualizacionProgreso", $0) }
        Actualizaciones.instalar { ok, codigo in
            if !ok { Ventana.shared.llamar("actualizacionProgreso", Actualizaciones.aviso("error", codigo)) }
        }
    }

    /// «Guardar como» del sistema: SVG o Markdown (texto) o PNG (base64), donde la persona elija.
    private func exportar(_ d: [String: Any]) {
        let formato = d["formato"] as? String ?? ""
        guard ["svg", "png", "md"].contains(formato), let v = ventana else { return llamar("exportado", ["ok": false]) }
        let datos: Data? = formato == "png" ? (d["base64"] as? String).flatMap { Data(base64Encoded: $0) } : (d["texto"] as? String)?.data(using: .utf8)
        guard let datos, !datos.isEmpty, datos.count <= Ventana.maximoExportar else {
            return llamar("exportado", ["ok": false, "error": Idioma.t("No pude crear el archivo.")])
        }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: formato) ?? .data]
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.nameFieldStringValue = Ventana.nombreExportar(d["nombre"], formato)
        if let c = Carpeta.actual() { panel.directoryURL = c }
        panel.beginSheetModal(for: v) { r in
            Task { @MainActor in
                guard r == .OK, let u = panel.url else { return Ventana.shared.llamar("exportado", ["ok": false]) }
                do {
                    try datos.write(to: u, options: .atomic)
                    Ventana.shared.llamar("exportado", ["ok": true, "ruta": Rutas.corta(u)])
                } catch {
                    Ventana.shared.llamar("exportado", ["ok": false, "error": Idioma.t("No pude guardar el archivo.")])
                }
            }
        }
    }
}
