import AppKit
import PiezaActualizaciones
import PiezaCatalogo
import PiezaHost
import PiezaTrabajos

/// Esquema para Mac, sobre la pieza «host-mac» (target `PiezaHost`): la ventana con la interfaz de ui/, el puente con sus guardas
/// (solo el marco principal con un archivo de ui/; la ventana nunca sale de ui/ y un enlace https va al navegador), config e
/// idioma desde app.json, menús en el idioma elegido, apariencia que sigue config.tema, guardar al salir y las acciones declaradas
/// en acciones.json (proyecto, dibujar, crearReadme, estructura, probarIA: solo corren un script, con sus datos validados y su
/// límite de tiempo). Aquí queda lo propio de Esquema: la carpeta de la persona con su marcador y su vigilancia (Carpeta.swift),
/// abrir y guardar sus archivos, la Papelera, exportar, el catálogo de plantillas y las actualizaciones.
@main
enum EsquemaApp {
    static let maximoExportar = 50 * 1024 * 1024

    /// `Puente.llamar` sin su Bool (para `return responder(…)` en un guard).
    @MainActor static func responder(_ funcion: String, _ datos: Any) { _ = Puente.shared.llamar(funcion, datos) }

    @MainActor static func main() {
        Host.arrancar(.init(sitio: "https://esquema-app.github.io/esquema/", codigo: "https://github.com/esquema-app/esquema")) { p in
            // Pieza «trabajos»: las órdenes largas de proyecto.py cuentan cómo van (ESQUEMA_PROGRESO → proyectoProgreso cada 0,5 s).
            Procesador.lectorProgreso = { aviso in
                let l = LectorProgreso(prefijo: Host.id, aviso: aviso)
                return (l.url.path, l.empezar, l.terminar)
            }
            // `carpeta` de las acciones declaradas: siempre la actual, nunca la de la interfaz. Sin carpeta abierta, "" (bin/proyecto.py
            // decide: crear un proyecto Libro no la necesita; lo demás responde «Elige una carpeta primero»).
            p.inyectores["carpetaActual"] = { _ in Carpeta.actual()?.path ?? "" }
            p.estado = { base, listo in estado(base, listo) }
            p.menus = { m in menus(m) }
            p.antesDeSalir = { Vigilante.detener() }

            // Pieza «actualizaciones»: solo los Releases de este repo, con su .sha256. Instalación de desarrollo: build.sh deja la
            // ruta del checkout en la carpeta de Esquema y empaquetar.sh escribe su avance donde diga ESQUEMA_PROGRESO.
            Actualizaciones.configurar(.init(repo: "esquema-app/esquema", nombre: "Esquema",
                archivoDesarrollo: Host.datos.appendingPathComponent("desarrollo"), variableProgreso: Host.prefijo + "PROGRESO"))
            p.tareas = { Actualizaciones.revisarCadaRato { p.llamar("actualizacionRevisada", $0) } }
            p.registrar("buscarActualizacion") { _ in Actualizaciones.revisar { p.llamar("actualizacionRevisada", $0) } }
            // La interfaz guarda todo justo antes de pedirlo: se espera a que esos guardados terminen (hasta 5 segundos).
            p.registrar("actualizar") { _ in actualizarCuandoPueda(hasta: Date().addingTimeInterval(5)) }

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
            p.registrar("abrirArchivo") { d in abrirArchivo(d) }
            p.registrar("guardarArchivo") { d in guardarArchivo(d) }
            p.registrar("exportar") { d in exportar(d) }
        }
    }

    // MARK: Estado y menús

    /// Lo del host (bin/estado.py, versión, idioma, config) + la actualización disponible + la carpeta y sus archivos. Desde aquí
    /// se vigila la carpeta.
    @MainActor static func estado(_ base: [String: Any], _ listo: @escaping @MainActor ([String: Any]) -> Void) {
        var e = base
        e["actualizacion"] = Actualizaciones.disponible
        e["carpeta"] = NSNull(); e["archivos"] = [Any]()
        guard let c = Carpeta.actual() else {
            Vigilante.detener()
            return listo(e)
        }
        let sinCarpeta = e
        Procesador.correrJSON("carpeta.py", ["listar", c.path]) { r in
            var x = sinCarpeta
            if r["ok"] as? Bool == true {
                x["carpeta"] = r["carpeta"] ?? NSNull()
                x["archivos"] = r["archivos"] ?? [Any]()
                vigilar(c, r)
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
                m.nativo("Mostrar la carpeta en el Finder") { if let c = Carpeta.actual() { NSWorkspace.shared.open(c) } },
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

    @MainActor static func vigilar(_ c: URL, _ listado: [String: Any]) {
        Vigilante.empezar(c)
        Vigilante.lista = (listado["archivos"] as? [[String: Any]] ?? []).compactMap { $0["ruta"] as? String }
    }

    @MainActor static func elegirCarpeta(proyecto: Bool = false) {
        Carpeta.elegir(en: Puente.shared.ventana) { u in
            guard let u else { return responder("carpetaElegida", ["ok": false]) }
            listarYResponder(u, proyecto: proyecto)
        }
    }

    /// Lista la carpeta, la vigila y responde carpetaElegida (con proyecto: true si viene de «Documentar un proyecto» o de un reciente).
    @MainActor static func listarYResponder(_ u: URL, proyecto: Bool) {
        Procesador.correrJSON("carpeta.py", ["listar", u.path]) { r in
            guard r["ok"] as? Bool == true else {
                return responder("carpetaElegida", ["ok": false, "error": Idioma.t(r["error"] as? String ?? "No pude abrir esa carpeta.")])
            }
            vigilar(u, r)
            var x: [String: Any] = ["ok": true, "carpeta": r["carpeta"] ?? NSNull(), "archivos": r["archivos"] ?? [Any]()]
            if proyecto { x["proyecto"] = true }
            Puente.shared.llamar("carpetaElegida", x)
        }
    }

    /// Un proyecto reciente: la ruta sale de <carpeta de Esquema>/proyectos.json (lo escribe bin/proyecto.py), nunca de la interfaz.
    @MainActor static func abrirProyecto(_ indice: Int) {
        let todos = Archivos.leerJSON(Host.datos.appendingPathComponent("proyectos.json"))["recientes"] as? [[String: Any]] ?? []
        let lista = Array(todos.filter { ($0["ruta"] as? String)?.hasPrefix("/") == true && $0["nombre"] is String }.prefix(30))
        var dir: ObjCBool = false
        guard indice >= 0, indice < lista.count, let ruta = lista[indice]["ruta"] as? String,
              FileManager.default.fileExists(atPath: ruta, isDirectory: &dir), dir.boolValue else {
            return responder("carpetaElegida", ["ok": false, "error": Idioma.t("No encontré ese proyecto. ¿Lo moviste?")])
        }
        listarYResponder(Carpeta.usar(URL(fileURLWithPath: ruta)), proyecto: true)
    }

    // MARK: Archivos de la carpeta (aquí y no declarados: la vigilancia tiene que conocer el texto que Esquema leyó o guardó)

    /// Un .md/.mmd de la carpeta abierta (que no es documentación de Esquema) va a la Papelera del sistema, donde se puede recuperar.
    /// La documentación se borra con la orden `borrar` (queda en el historial); el código vinculado, nunca.
    @MainActor static func papelera(_ d: [String: Any]) {
        let ruta = d["ruta"] as? String ?? ""
        guard let base = Carpeta.actual(), let u = Carpeta.absoluta(ruta, en: base) else {
            return responder("enPapelera", ["ok": false, "ruta": ruta, "error": Idioma.t("Ese archivo no se puede borrar.")])
        }
        if Puente.shared.papelera(u) {
            Vigilante.conocidos.removeValue(forKey: ruta)
            Puente.shared.llamar("enPapelera", ["ok": true, "ruta": ruta])
        } else {
            Puente.shared.llamar("enPapelera", ["ok": false, "ruta": ruta, "error": Idioma.t("No pude mandarlo a la Papelera.")])
        }
    }

    @MainActor static func abrirArchivo(_ d: [String: Any]) {
        let ruta = d["ruta"] as? String ?? ""
        guard let base = Carpeta.actual(), Carpeta.absoluta(ruta, en: base) != nil else {
            return responder("archivoAbierto", ["ok": false, "ruta": ruta, "error": Idioma.t("Ese nombre de archivo no sirve.")])
        }
        Procesador.conEntrada("carpeta.py", "leer", ["carpeta": base.path, "ruta": ruta]) { r in
            if r["ok"] as? Bool == true, let t = r["texto"] as? String { Vigilante.conocidos[ruta] = t }
            var x = r
            if r["ok"] as? Bool != true { x["ruta"] = ruta; x["error"] = Idioma.t(r["error"] as? String ?? "No pude abrir el archivo.") }
            Puente.shared.llamar("archivoAbierto", x)
        }
    }

    /// De a uno y en orden (la fila del host): el último texto escrito es el que queda en el disco, y salir o actualizar lo espera.
    @MainActor static func guardarArchivo(_ d: [String: Any]) {
        let ruta = d["ruta"] as? String ?? ""
        guard let base = Carpeta.actual(), Carpeta.absoluta(ruta, en: base) != nil, let nuevoTexto = d["texto"] as? String else {
            return responder("archivoGuardado", ["ok": false, "ruta": ruta, "error": Idioma.t("No pude guardar el archivo.")])
        }
        let nuevo = Texto.esBool(d["nuevo"]) && d["nuevo"] as? Bool == true
        Fila.agregar { listo in
            // Lo que Esquema escribe queda como conocido antes de escribirlo: el aviso de la carpeta no lo toma como un cambio de afuera.
            let antes = Vigilante.conocidos[ruta]
            Vigilante.conocidos[ruta] = nuevoTexto
            Procesador.conEntrada("carpeta.py", "guardar", ["carpeta": base.path, "ruta": ruta, "texto": nuevoTexto, "nuevo": nuevo]) { r in
                var x = r
                if r["ok"] as? Bool != true {
                    if let antes { Vigilante.conocidos[ruta] = antes } else { Vigilante.conocidos.removeValue(forKey: ruta) }
                    x["ruta"] = ruta
                    x["error"] = Idioma.t(r["error"] as? String ?? "No pude guardar el archivo.")
                }
                Puente.shared.llamar("archivoGuardado", x)
                listo()
            }
        }
    }

    /// «Guardar como» del sistema: SVG o Markdown (texto) o PNG (base64), donde la persona elija.
    @MainActor static func exportar(_ d: [String: Any]) {
        let formato = d["formato"] as? String ?? ""
        guard ["svg", "png", "md"].contains(formato) else { return responder("exportado", ["ok": false]) }
        let datos: Data? = formato == "png" ? (d["base64"] as? String).flatMap { Data(base64Encoded: $0) } : (d["texto"] as? String)?.data(using: .utf8)
        guard let datos, !datos.isEmpty, datos.count <= maximoExportar else {
            return responder("exportado", ["ok": false, "error": Idioma.t("No pude crear el archivo.")])
        }
        let nombre = (d["nombre"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "esquema"
        Puente.shared.guardarComo(nombre: nombre, extension: formato, datos: datos, desde: Carpeta.actual(), maximo: maximoExportar) { u in
            let r: [String: Any] = u.map { ["ok": true, "ruta": Carpeta.corta($0)] } ?? ["ok": false]
            Puente.shared.llamar("exportado", r)
        }
    }

    // MARK: Actualizaciones

    /// Nunca en medio de un guardado o de un script (la IA escribiendo, un trabajo): cerrar la app los cortaría.
    @MainActor static func actualizarCuandoPueda(hasta limite: Date) {
        let p = Puente.shared
        if p.ocupada {
            guard Date() < limite else {
                // La misma forma que los avisos de la pieza: el texto en español y la interfaz lo traduce.
                return responder("actualizacionProgreso", ["paso": "error", "codigo": "ocupada", "texto": "Espera a que termine de guardar o de responder tu IA y vuelve a intentarlo.", "valores": [String: String](), "total": 3])
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { Task { @MainActor in actualizarCuandoPueda(hasta: limite) } }
            return
        }
        Actualizaciones.seguir { p.llamar("actualizacionProgreso", $0) }
        Actualizaciones.instalar { ok, codigo in
            if !ok { p.llamar("actualizacionProgreso", Actualizaciones.aviso("error", codigo)) }
        }
    }
}
