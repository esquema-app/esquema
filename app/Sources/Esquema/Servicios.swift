import AppKit

// MARK: - Rutas (las mismas que bin/comun.py)

enum Rutas {
    /// Configuración de Esquema (nunca dentro de la carpeta de la persona): la misma que `comun.carpeta_app()` en Mac.
    static var datos: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Esquema")
    }
    static var config: URL { datos.appendingPathComponent("config.json") }
    /// Código (bin/, ui/, plantillas/): dentro de Esquema.app.
    static var recursos: URL { Bundle.main.resourceURL!.appendingPathComponent("esquema") }
    static var python: URL { Bundle.main.resourceURL!.appendingPathComponent("python/bin/python3") }

    /// La carpeta de Esquema queda solo para la persona (0700), igual que `comun.carpeta_privada`.
    static func prepararDatos() {
        try? FileManager.default.createDirectory(at: datos, withIntermediateDirectories: true)
        try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: datos.path)
    }

    /// Una ruta para mostrar: con «~» en vez de la carpeta personal.
    static func corta(_ u: URL) -> String {
        let casa = FileManager.default.homeDirectoryForCurrentUser.path
        return u.path.hasPrefix(casa + "/") ? "~" + String(u.path.dropFirst(casa.count)) : u.path
    }
}

enum Archivos {
    static func leerJSON(_ url: URL) -> [String: Any] {
        guard let d = try? Data(contentsOf: url), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        return j
    }

    /// JSON con claves ordenadas, escrito de una vez y solo legible por la persona (0600).
    static func escribirJSON(_ url: URL, _ valor: Any, privado: Bool = true) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard let d = try? JSONSerialization.data(withJSONObject: valor, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? d.write(to: url, options: .atomic)
        if privado { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path) }
    }
}

// MARK: - Configuración (config.json en la carpeta de Esquema, compartida con bin/comun.py)

enum Config {
    static func leer() -> [String: Any] { Archivos.leerJSON(Rutas.config) }

    static let ias: Set<String> = ["claude", "codex", "gemini"]
    static let temas: Set<String> = ["sistema", "claro", "oscuro"]

    /// Solo claves y valores conocidos: lo que manda la interfaz no puede escribir cualquier cosa. `carpeta` nunca llega por
    /// aquí: solo la cambia el selector de carpetas del sistema (guardarCarpeta).
    static func guardar(_ cambios: [String: Any]) {
        var d = leer()
        for (k, v) in cambios {
            switch k {
            case "ia": if let s = v as? String, ias.contains(s) { d[k] = s }
            case "idioma_ui": if let s = v as? String, s == "es" || s == "en" { d[k] = s }
            case "tema": if let s = v as? String, temas.contains(s) { d[k] = s }
            case "bienvenida": if let b = v as? Bool { d[k] = b }
            default: break
            }
        }
        Rutas.prepararDatos()
        Archivos.escribirJSON(Rutas.config, d)
    }

    static func guardarCarpeta(_ ruta: String) {
        var d = leer()
        d["carpeta"] = ruta
        Rutas.prepararDatos()
        Archivos.escribirJSON(Rutas.config, d)
    }

    static func texto(_ clave: String) -> String { (leer()[clave] as? String) ?? "" }
}

// MARK: - Idioma (las claves son el texto en español, igual que en ui/idiomas)

enum Idioma {
    nonisolated(unsafe) private static var cache: (codigo: String, textos: [String: String])?

    /// Solo «es» o «en» (el archivo de traducciones se busca con este código: nunca otra cosa).
    static var codigo: String {
        let elegido = Config.texto("idioma_ui")
        if elegido == "es" || elegido == "en" { return elegido }
        return Locale.preferredLanguages.first?.hasPrefix("es") == true ? "es" : "en"
    }

    /// Ya hay idioma: lo eligió (bienvenida o Ajustes) o terminó la bienvenida (no se le vuelve a preguntar).
    static var elegido: Bool { !Config.texto("idioma_ui").isEmpty || Config.leer()["bienvenida"] as? Bool == true }

    static func t(_ texto: String) -> String {
        let c = codigo
        guard c != "es" else { return texto }
        if cache?.codigo != c {
            let j = Archivos.leerJSON(Rutas.recursos.appendingPathComponent("ui/idiomas/\(c).json"))
            cache = (c, j["textos"] as? [String: String] ?? [:])
        }
        return cache?.textos[texto] ?? texto
    }

    /// Una frase con marcadores ({x}, {n}…): se traduce entera y después se ponen los valores.
    static func f(_ plantilla: String, _ valores: [String: String]) -> String {
        var t = self.t(plantilla)
        for (k, v) in valores { t = t.replacingOccurrences(of: "{\(k)}", with: v) }
        return t
    }
}

// MARK: - Scripts de bin/ (contrato: el último argumento es la ruta del JSON de salida)

@MainActor
enum Procesador {
    /// Cuántos scripts están corriendo (para no actualizar en medio de uno).
    private(set) static var enCurso = 0

    /// `progreso`: para los trabajos largos (documentar un proyecto). El script escribe sus eventos (una línea JSON cada uno) en el
    /// archivo de ESQUEMA_PROGRESO; cada 0,5 s se leen las líneas nuevas y se pasan juntas a `progreso`.
    static func correrJSON(_ script: String, _ args: [String], progreso: (@MainActor ([[String: Any]]) -> Void)? = nil,
                           fin: @escaping @MainActor ([String: Any]) -> Void) {
        let salida = FileManager.default.temporaryDirectory.appendingPathComponent("esquema-\(UUID().uuidString).json")
        let p = Process()
        p.executableURL = Rutas.python
        p.arguments = [Rutas.recursos.appendingPathComponent("bin/\(script)").path] + args + [salida.path]
        // Nada del entorno con nombre ESQUEMA_* (p. ej. otra carpeta de datos puesta por otro programa) llega a los scripts:
        // solo las rutas de la app. (bin/ia.py además se las quita a la IA.)
        var env = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("ESQUEMA_") }
        env["ESQUEMA_RECURSOS"] = Rutas.recursos.path
        env["ESQUEMA_DATOS"] = Rutas.datos.path
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONDONTWRITEBYTECODE"] = "1"  // no escribir __pycache__ dentro de la app (rompería su firma)
        var lector: LectorProgreso? = nil
        if let progreso {
            let l = LectorProgreso(aviso: progreso)
            env["ESQUEMA_PROGRESO"] = l.url.path
            lector = l
        }
        p.environment = env
        p.currentDirectoryURL = FileManager.default.temporaryDirectory
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        let lectorFinal = lector
        p.terminationHandler = { _ in
            Task { @MainActor in
                enCurso -= 1
                lectorFinal?.terminar()
                let r = Archivos.leerJSON(salida)
                try? FileManager.default.removeItem(at: salida)
                fin(r.isEmpty ? ["ok": false, "error": Idioma.t("No pude terminar. Intenta de nuevo.")] : r)
            }
        }
        enCurso += 1
        do { try p.run() } catch { enCurso -= 1; lectorFinal?.terminar(); fin(["ok": false, "error": error.localizedDescription]); return }
        lectorFinal?.empezar()
    }

    /// Igual que correrJSON, pero lo que manda la interfaz va en un archivo de entrada (nunca como argumento: se vería en la
    /// lista de procesos y podría parecer una opción).
    static func conEntrada(_ script: String, _ accion: String, _ datos: [String: Any], progreso: (@MainActor ([[String: Any]]) -> Void)? = nil,
                           fin: @escaping @MainActor ([String: Any]) -> Void) {
        let entrada = FileManager.default.temporaryDirectory.appendingPathComponent("esquema-entrada-\(UUID().uuidString).json")
        Archivos.escribirJSON(entrada, datos)
        correrJSON(script, [accion, entrada.path], progreso: progreso) { r in
            try? FileManager.default.removeItem(at: entrada)
            fin(r)
        }
    }
}

/// Lee el archivo de progreso de un script (JSONL) cada 0,5 s y pasa las líneas nuevas, ya leídas como JSON, a `aviso`.
@MainActor
final class LectorProgreso {
    let url: URL
    private let aviso: @MainActor ([[String: Any]]) -> Void
    private var desde: UInt64 = 0
    private var resto = Data()
    private var reloj: Timer?

    init(aviso: @escaping @MainActor ([[String: Any]]) -> Void) {
        url = FileManager.default.temporaryDirectory.appendingPathComponent("esquema-progreso-\(UUID().uuidString).jsonl")
        self.aviso = aviso
        FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.posixPermissions: 0o600])
    }

    func empezar() {
        // El reloj corre en el hilo principal (el de la interfaz): ahí se lee el archivo.
        reloj = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            MainActor.assumeIsolated { self.leer() }
        }
    }

    func leer() {
        guard let h = try? FileHandle(forReadingFrom: url) else { return }
        defer { try? h.close() }
        guard (try? h.seek(toOffset: desde)) != nil, let d = try? h.readToEnd(), !d.isEmpty else { return }
        desde += UInt64(d.count)
        resto.append(d)
        var eventos: [[String: Any]] = []
        while let i = resto.firstIndex(of: 0x0A) {
            let linea = resto.subdata(in: resto.startIndex..<i)
            resto = resto.subdata(in: resto.index(after: i)..<resto.endIndex)
            if let j = try? JSONSerialization.jsonObject(with: linea) as? [String: Any] { eventos.append(j) }
        }
        if !eventos.isEmpty { aviso(eventos) }
    }

    /// Al terminar el script: lo último que haya quedado y se borra el archivo.
    func terminar() {
        reloj?.invalidate()
        reloj = nil
        leer()
        try? FileManager.default.removeItem(at: url)
    }
}

/// Los guardados corren de a uno y en el orden en que llegaron: así el último texto escrito es el que queda en el disco.
@MainActor
enum EnOrden {
    typealias Tarea = @MainActor (@escaping @MainActor () -> Void) -> Void
    private static var cola: [Tarea] = []
    private static var ocupado = false

    static var pendientes: Int { cola.count + (ocupado ? 1 : 0) }

    static func agregar(_ tarea: @escaping Tarea) {
        cola.append(tarea)
        siguiente()
    }

    private static func siguiente() {
        guard !ocupado, !cola.isEmpty else { return }
        ocupado = true
        let t = cola.removeFirst()
        t {
            ocupado = false
            siguiente()
        }
    }
}
