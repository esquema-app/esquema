import AppKit
import PiezaActualizaciones
import PiezaCatalogo
import PiezaHost
import PiezaTrabajos

/// Esquema para Mac, sobre la pieza «host-mac» (target `PiezaHost`): la ventana con la interfaz de ui/, el puente con sus guardas
/// (solo el marco principal con un archivo de ui/; la ventana nunca sale de ui/ y un enlace https va al navegador), config e
/// idioma desde app.json, menús en el idioma elegido, apariencia que sigue config.tema, guardar al salir, las actualizaciones
/// (`p.actualizaciones`), la carpeta de la persona con su marcador (`CarpetaElegida`) y su vigilante (`Vigilante`, FSEvents), y las
/// acciones declaradas en acciones.json (proyecto, dibujar, crearReadme, estructura, abrirArchivo, guardarArchivo, probarIA: solo
/// corren un script, con sus datos validados y su límite de tiempo; abrir y guardar con «vigilar», así un guardado propio no se
/// avisa como un cambio de afuera). Aquí queda lo propio de Esquema: elegir la carpeta o un proyecto reciente, volver a listar
/// cuando la carpeta cambia, la Papelera, exportar, el catálogo de plantillas y los menús.
@main
enum EsquemaApp {
    static let maximoExportar = 50 * 1024 * 1024
    static let extensiones = [".md", ".mmd"]
    /// Las rutas del último listado: si cambian (archivo nuevo, borrado o renombrado), la interfaz recibe `archivos`.
    @MainActor static var lista: [String] = []

    @MainActor static func main() {
        Host.arrancar(.init(sitio: "https://esquema-app.github.io/esquema/", codigo: "https://github.com/esquema-app/esquema")) { p in
            // Pieza «trabajos»: las órdenes largas de proyecto.py cuentan cómo van (ESQUEMA_PROGRESO → proyectoProgreso cada 0,5 s).
            Procesador.lectorProgreso = { aviso in
                let l = LectorProgreso(prefijo: Host.id, aviso: aviso)
                return (l.url.path, l.empezar, l.terminar)
            }
            // La carpeta de la persona: el mismo marcador («carpeta.marcador» en UserDefaults) y la misma clave (config.carpeta,
            // "interfaz": false en app.json) que antes, así quien ya la tenía elegida la sigue teniendo. El vigilante avisa
            // `archivoCambiado` si un archivo abierto cambia en el disco (VS Code, git pull…); si cambia la lista, se vuelve a listar.
            p.vigilante = Vigilante(extensiones: extensiones)
            p.vigilante?.alCambiar = { base in relistar(base) }
            p.carpeta = CarpetaElegida()
            // `carpeta` de las acciones declaradas: siempre la actual, nunca la de la interfaz. Sin carpeta abierta, "" (bin/proyecto.py
            // decide: crear un proyecto Libro no la necesita; lo demás, y bin/carpeta.py, responden «Elige una carpeta primero»).
            p.inyectores["carpetaActual"] = { _ -> Any? in p.carpeta?.actual()?.path ?? "" }
            p.estado = { base, listo in estado(base, listo) }
            p.menus = { m in menus(m) }

            // Pieza «actualizaciones»: solo los Releases de este repo, con su .sha256. Instalación de desarrollo: build.sh deja la
            // ruta del checkout en la carpeta de Esquema y empaquetar.sh escribe su avance donde diga ESQUEMA_PROGRESO. El host
            // atiende buscarActualizacion y actualizar (nunca con un guardado o un script en curso), revisa cada 6 h con el idioma
            // elegido y suma `actualizacion` al estado.
            Actualizaciones.configurar(.init(repo: "esquema-app/esquema", nombre: "Esquema",
                archivoDesarrollo: Host.datos.appendingPathComponent("desarrollo"), variableProgreso: Host.prefijo + "PROGRESO"))
            p.actualizaciones = .init(revisar: Actualizaciones.revisar, revisarCadaRato: Actualizaciones.revisarCadaRato,
                seguir: Actualizaciones.seguir, instalar: Actualizaciones.instalar, aviso: Actualizaciones.aviso,
                disponible: { Actualizaciones.disponible })

            // Pieza «catálogo»: repo y tipos salen de app.json (sección «catalogo»); los scripts los corre el Procesador del host.
            Catalogo.configurar(appJSON: Host.recursos.appendingPathComponent("app.json"), agente: "Esquema/\(Host.version)") { s, a, d, fin in
                Procesador.conEntrada(s, a, d, fin: fin)
            }
            p.registrar("catalogoPlantillas") { _ in Catalogo.listar("plantillas") { p.llamar("catalogoListo", $0) } }
            p.registrar("descargarPlantilla") { d in
                Catalogo.descargar("plantillas", String((d["id"] as? String ?? "").prefix(60))) { p.llamar("plantillaDescargada", $0) }
            }

            p.registrar("elegirCarpeta") { d in elegirCarpeta(proyecto: Texto.esBool(d["proyecto"]) && d["proyecto"] as? Bool == true) }
            p.registrar("abrirProyecto") { d in abrirProyecto(Texto.entero(d["indice"]) ?? -1) }
            p.registrar("papelera") { d in papelera(d) }
            p.registrar("exportar") { d in exportar(d) }
        }
    }

    // MARK: Estado y menús

    /// Lo del host (bin/estado.py, versión, idioma, config, la actualización disponible) + la carpeta y sus archivos.
    @MainActor static func estado(_ base: [String: Any], _ listo: @escaping @MainActor ([String: Any]) -> Void) {
        var e = base
        e["carpeta"] = NSNull(); e["archivos"] = [Any]()
        guard let c = Puente.shared.carpeta?.actual() else {
            Puente.shared.vigilante?.detener()
            return listo(e)
        }
        let sinCarpeta = e
        Procesador.correrJSON("carpeta.py", ["listar", c.path]) { r in
            var x = sinCarpeta
            if r["ok"] as? Bool == true {
                x["carpeta"] = r["carpeta"] ?? NSNull()
                x["archivos"] = r["archivos"] ?? [Any]()
                recordar(r)
                Puente.shared.vigilante?.empezar(c)
            }
            listo(x)
        }
    }

    /// Archivo, Edición (deshacer y rehacer de Esquema) y Ver; el de la app (Acerca de, Ajustes, Salir), Ventana y Ayuda los pone
    /// el host. Lo que es de Esquema lo hace la interfaz (window.Esquema.menu); nada antes de elegir el idioma.
    @MainActor static func menus(_ m: Menus) -> [NSMenuItem] {
        let mayus: NSEvent.ModifierFlags = [.command, .shift]
        return [
            m.archivo([
                m.item("Nuevo…", "nuevo", "n"),
                m.nativo("Abrir carpeta…", "o") {
                    guard Idioma.elegido else { return }
                    Puente.shared.mostrar()
                    elegirCarpeta()
                },
                m.nativo("Mostrar la carpeta en el Finder") { if let c = Puente.shared.carpeta?.actual() { Puente.shared.mostrarEnFinder(c) } },
                .separator(),
                m.item("Guardar", "guardar", "s"),
            ]),
            m.edicion(deshacer: m.item("Deshacer", "deshacer", "z"), rehacer: m.item("Rehacer", "rehacer", "z", mayus)),
            m.ver([
                m.item("Acercar", "acercar", "+"),
                m.item("Alejar", "alejar", "-"),
                m.item("Ajustar a la ventana", "ajustar", "0"),
                .separator(),
                m.item("Solo texto", "texto", "1"),
                m.item("Texto y dibujo", "ambos", "2"),
                m.item("Solo dibujo", "dibujo", "3"),
            ]),
        ]
    }

    // MARK: La carpeta

    @MainActor static func recordar(_ listado: [String: Any]) {
        lista = (listado["archivos"] as? [[String: Any]] ?? []).compactMap { $0["ruta"] as? String }
    }

    /// Algo cambió en la carpeta vigilada: se vuelve a listar y, si la lista cambió, la interfaz recibe `archivos`.
    @MainActor static func relistar(_ base: URL) {
        Procesador.correrJSON("carpeta.py", ["listar", base.path]) { r in
            guard r["ok"] as? Bool == true, Puente.shared.vigilante?.base == base else { return }
            let archivos = r["archivos"] as? [[String: Any]] ?? []
            let rutas = archivos.compactMap { $0["ruta"] as? String }
            guard rutas != lista else { return }
            lista = rutas
            Puente.shared.llamar("archivos", ["archivos": archivos])
        }
    }

    @MainActor static func elegirCarpeta(proyecto: Bool = false) {
        Puente.shared.carpeta?.elegir(mensaje: "Elige la carpeta con tus documentos y diagramas (la de tu proyecto, por ejemplo). Esquema no los mueve ni los copia.",
                                      boton: "Usar esta carpeta") { u in
            guard let u else { return Puente.shared.llamar("carpetaElegida", ["ok": false]) }
            listarYResponder(u, proyecto: proyecto)
        }
    }

    /// Lista la carpeta y responde carpetaElegida (con proyecto: true si viene de «Documentar un proyecto» o de un reciente). El
    /// vigilante ya la sigue (`CarpetaElegida.usar` lo mueve).
    @MainActor static func listarYResponder(_ u: URL, proyecto: Bool) {
        Procesador.correrJSON("carpeta.py", ["listar", u.path]) { r in
            guard r["ok"] as? Bool == true else {
                return Puente.shared.llamar("carpetaElegida", ["ok": false, "error": Idioma.t(r["error"] as? String ?? "No pude abrir esa carpeta.")])
            }
            recordar(r)
            var x: [String: Any] = ["ok": true, "carpeta": r["carpeta"] ?? NSNull(), "archivos": r["archivos"] ?? [Any]()]
            if proyecto { x["proyecto"] = true }
            Puente.shared.llamar("carpetaElegida", x)
        }
    }

    /// Un proyecto reciente: la ruta sale de <carpeta de Esquema>/proyectos.json (lo escribe bin/proyecto.py), nunca de la interfaz.
    @MainActor static func abrirProyecto(_ indice: Int) {
        let todos = Archivos.leerJSON(Host.datos.appendingPathComponent("proyectos.json"))["recientes"] as? [[String: Any]] ?? []
        let recientes = Array(todos.filter { ($0["ruta"] as? String)?.hasPrefix("/") == true && $0["nombre"] is String }.prefix(30))
        var dir: ObjCBool = false
        guard indice >= 0, indice < recientes.count, let ruta = recientes[indice]["ruta"] as? String,
              FileManager.default.fileExists(atPath: ruta, isDirectory: &dir), dir.boolValue, let c = Puente.shared.carpeta else {
            return Puente.shared.llamar("carpetaElegida", ["ok": false, "error": Idioma.t("No encontré ese proyecto. ¿Lo moviste?")])
        }
        listarYResponder(c.usar(URL(fileURLWithPath: ruta)), proyecto: true)
    }

    /// Un .md/.mmd de la carpeta abierta (que no es documentación de Esquema) va a la Papelera del sistema, donde se puede recuperar.
    /// La documentación se borra con la orden `borrar` (queda en el historial); el código vinculado, nunca. Abrir y guardar están
    /// declarados en app.json (bin/carpeta.py, con «vigilar»).
    @MainActor static func papelera(_ d: [String: Any]) {
        let p = Puente.shared
        let ruta = d["ruta"] as? String ?? ""
        guard let base = p.carpeta?.actual(), let u = Enchufe.dentro(base, ruta, extensiones: extensiones) else {
            return p.llamar("enPapelera", ["ok": false, "ruta": ruta, "error": Idioma.t("Ese archivo no se puede borrar.")])
        }
        if p.papelera(u) {
            p.vigilante?.olvidar(ruta)
            p.llamar("enPapelera", ["ok": true, "ruta": ruta])
        } else {
            p.llamar("enPapelera", ["ok": false, "ruta": ruta, "error": Idioma.t("No pude mandarlo a la Papelera.")])
        }
    }

    /// Una ruta para mostrar: con «~» en vez de la carpeta personal.
    static func corta(_ u: URL) -> String {
        let casa = FileManager.default.homeDirectoryForCurrentUser.path
        return u.path.hasPrefix(casa + "/") ? "~" + String(u.path.dropFirst(casa.count)) : u.path
    }

    /// «Guardar como» del sistema: SVG o Markdown (texto) o PNG (base64), donde la persona elija.
    @MainActor static func exportar(_ d: [String: Any]) {
        let p = Puente.shared
        let formato = d["formato"] as? String ?? ""
        guard ["svg", "png", "md"].contains(formato) else { return p.llamar("exportado", ["ok": false]) }
        let datos: Data? = formato == "png" ? (d["base64"] as? String).flatMap { Data(base64Encoded: $0) } : (d["texto"] as? String)?.data(using: .utf8)
        guard let datos, !datos.isEmpty, datos.count <= maximoExportar else {
            return p.llamar("exportado", ["ok": false, "error": Idioma.t("No pude crear el archivo.")])
        }
        let nombre = (d["nombre"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "esquema"
        p.guardarComo(nombre: nombre, extension: formato, datos: datos, desde: p.carpeta?.actual(), maximo: maximoExportar) { u in
            let r: [String: Any] = u.map { ["ok": true, "ruta": corta($0)] } ?? ["ok": false]
            p.llamar("exportado", r)
        }
    }
}
