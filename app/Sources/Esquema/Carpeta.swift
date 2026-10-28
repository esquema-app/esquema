import AppKit
import CoreServices

// MARK: - La carpeta de la persona (la elige con el selector del sistema; Esquema la sigue con un marcador)

@MainActor
enum Carpeta {
    private static let claveMarcador = "carpeta.marcador"
    static let extensiones = ["md", "mmd"]
    static let maximo = 2 * 1024 * 1024

    /// La carpeta elegida, o nil. Primero el marcador (la sigue aunque la persona la mueva o le cambie el nombre; si cambió, se
    /// actualiza config.carpeta para los scripts); si no hay marcador, config.carpeta.
    static func actual() -> URL? {
        if let d = UserDefaults.standard.data(forKey: claveMarcador) {
            var vieja = false
            if let u = try? URL(resolvingBookmarkData: d, options: [.withoutUI], relativeTo: nil, bookmarkDataIsStale: &vieja) {
                if vieja, let nueva = try? u.bookmarkData() { UserDefaults.standard.set(nueva, forKey: claveMarcador) }
                let real = u.standardizedFileURL.resolvingSymlinksInPath()
                if Config.texto("carpeta") != real.path { Config.guardarCarpeta(real.path) }
                return existe(real) ? real : nil
            }
        }
        let c = Config.texto("carpeta")
        guard c.hasPrefix("/") else { return nil }
        let u = URL(fileURLWithPath: c).standardizedFileURL.resolvingSymlinksInPath()
        return existe(u) ? u : nil
    }

    private static func existe(_ u: URL) -> Bool {
        var dir: ObjCBool = false
        return FileManager.default.fileExists(atPath: u.path, isDirectory: &dir) && dir.boolValue
    }

    /// Selector de carpetas del sistema. `fin(nil)` si la persona cancela.
    static func elegir(en ventana: NSWindow?, _ fin: @escaping @MainActor (URL?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = Idioma.t("Usar esta carpeta")
        panel.message = Idioma.t("Elige la carpeta con tus documentos y diagramas (la de tu proyecto, por ejemplo). Esquema no los mueve ni los copia.")
        if let a = actual() { panel.directoryURL = a }
        let alTerminar: (NSApplication.ModalResponse) -> Void = { r in
            Task { @MainActor in
                guard r == .OK, let u = panel.url else { return fin(nil) }
                let real = u.standardizedFileURL.resolvingSymlinksInPath()
                if let marcador = try? real.bookmarkData() { UserDefaults.standard.set(marcador, forKey: claveMarcador) }
                Config.guardarCarpeta(real.path)
                fin(real)
            }
        }
        if let ventana { panel.beginSheetModal(for: ventana, completionHandler: alTerminar) } else { panel.begin(completionHandler: alTerminar) }
    }

    /// La ruta relativa que manda la interfaz, revisada igual que `comun.ruta_en` (bin/ la vuelve a revisar): relativa, sin «..»,
    /// .md o .mmd y, siguiendo enlaces, dentro de la carpeta. Devuelve la ruta absoluta o nil.
    static func absoluta(_ valor: Any?, en base: URL) -> URL? {
        guard let s = valor as? String, !s.isEmpty, s.count <= 400, !s.contains("\u{0}"), !s.hasPrefix("/"), !s.hasPrefix("\\"),
              s.range(of: "^[A-Za-z]:", options: .regularExpression) == nil else { return nil }
        let partes = s.split(separator: "/", omittingEmptySubsequences: false).flatMap { $0.split(separator: "\\", omittingEmptySubsequences: false) }
        guard partes.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }),
              extensiones.contains((s as NSString).pathExtension.lowercased()) else { return nil }
        let raiz = base.resolvingSymlinksInPath().path
        let real = partes.reduce(base) { $0.appendingPathComponent(String($1)) }.standardizedFileURL.resolvingSymlinksInPath()
        guard real.path.hasPrefix(raiz + "/") else { return nil }
        return real
    }

    /// El texto de un archivo de la carpeta tal como lo lee bin/carpeta.py (UTF-8; lo que no lo es se reemplaza), o nil.
    static func leerTexto(_ u: URL) -> String? {
        guard let a = try? FileManager.default.attributesOfItem(atPath: u.path), (a[.type] as? FileAttributeType) == .typeRegular,
              let tam = a[.size] as? Int, tam <= maximo, let d = try? Data(contentsOf: u) else { return nil }
        return String(decoding: d, as: UTF8.self)
    }
}

// MARK: - Vigilar la carpeta (FSEvents): si un archivo abierto cambia en el disco (VS Code, git pull…), la interfaz se entera

/// Esquema recuerda el último texto que leyó o guardó de cada archivo abierto (`conocidos`). Cuando FSEvents avisa que algo cambió
/// en la carpeta (un .md o .mmd, o una subcarpeta creada, borrada o renombrada), espera a que quede quieta y:
///   1. relee cada archivo conocido; si su texto no es el que Esquema conoce, manda `archivoCambiado {ruta, texto}` (la interfaz
///      lo recarga si no hay cambios sin guardar; si los hay, pregunta con cuál quedarse). Un guardado de la propia app no se
///      avisa: su texto queda como conocido antes de escribirlo.
///   2. vuelve a listar con bin/carpeta.py y, si la lista cambió (archivo nuevo, borrado o renombrado), manda `archivos`.
/// Lo que pasa dentro de .git, node_modules y otras carpetas pesadas no cuenta.
@MainActor
enum Vigilante {
    private static var flujo: FSEventStreamRef?
    private static var carpeta: URL?
    private static var espera: DispatchWorkItem?
    private static var revisando = false
    private static var otraVez = false
    /// ruta relativa → último texto que Esquema leyó o guardó.
    static var conocidos: [String: String] = [:]
    /// Rutas del último listado (para avisar solo si cambió).
    static var lista: [String] = []

    static let fuera: Set<String> = [".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".nuxt", "target",
                                    ".gradle", ".idea", ".terraform", ".cache", "Pods", "DerivedData", ".build"]

    static func empezar(_ u: URL) {
        if carpeta == u, flujo != nil { return }
        detener()
        carpeta = u
        conocidos = [:]
        var contexto = FSEventStreamContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        // Función de C: no puede capturar nada. Junta las rutas que pueden importar y las pasa a la cola principal.
        let alCambiar: FSEventStreamCallback = { _, _, cuantos, rutas, banderas, _ in
            let todas = Unmanaged<CFArray>.fromOpaque(rutas).takeUnretainedValue() as NSArray
            var candidatas: [String] = []
            for i in 0..<cuantos {
                guard let r = todas[i] as? String else { continue }
                let b = Int(banderas[i])
                let ext = (r as NSString).pathExtension.lowercased()
                if ext == "md" || ext == "mmd" || b & kFSEventStreamEventFlagItemIsDir != 0 || b & kFSEventStreamEventFlagMustScanSubDirs != 0 {
                    candidatas.append(r)
                }
            }
            guard !candidatas.isEmpty else { return }
            let cambiadas = candidatas
            Task { @MainActor in Vigilante.cambios(cambiadas) }
        }
        let banderas = FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagNoDefer)
        guard let f = FSEventStreamCreate(kCFAllocatorDefault, alCambiar, &contexto, [u.path] as CFArray,
                                          FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.3, banderas) else { return }
        FSEventStreamSetDispatchQueue(f, DispatchQueue.main)
        FSEventStreamStart(f)
        flujo = f
    }

    static func detener() {
        if let f = flujo {
            FSEventStreamStop(f)
            FSEventStreamInvalidate(f)
            FSEventStreamRelease(f)
        }
        flujo = nil
        carpeta = nil
        espera?.cancel()
    }

    /// Solo cuenta lo que no está dentro de .git, node_modules y otras carpetas pesadas (mirando desde la carpeta elegida).
    static func cambios(_ rutas: [String]) {
        guard let base = carpeta?.path else { return }
        let importa = rutas.contains { r in
            let rel = r.hasPrefix(base + "/") ? String(r.dropFirst(base.count + 1)) : r == base ? "" : r
            return !rel.split(separator: "/").contains { fuera.contains(String($0)) }
        }
        if importa { programar() }
    }

    /// Un editor o git escriben varias veces seguidas: se espera a que la carpeta quede quieta.
    static func programar() {
        espera?.cancel()
        let t = DispatchWorkItem { Task { @MainActor in Vigilante.revisar() } }
        espera = t
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: t)
    }

    private static func revisar() {
        guard let base = carpeta else { return }
        guard !revisando else { otraVez = true; return }
        revisando = true
        for (ruta, conocido) in conocidos {
            guard let u = Carpeta.absoluta(ruta, en: base), let texto = Carpeta.leerTexto(u), texto != conocido else { continue }
            conocidos[ruta] = texto
            Ventana.shared.llamar("archivoCambiado", ["ruta": ruta, "texto": texto])
        }
        Procesador.correrJSON("carpeta.py", ["listar", base.path]) { r in
            revisando = false
            if r["ok"] as? Bool == true, carpeta == base {
                let archivos = r["archivos"] as? [[String: Any]] ?? []
                let rutas = archivos.compactMap { $0["ruta"] as? String }
                if rutas != lista {
                    lista = rutas
                    Ventana.shared.llamar("archivos", ["archivos": archivos])
                }
            }
            if otraVez { otraVez = false; programar() }
        }
    }
}
