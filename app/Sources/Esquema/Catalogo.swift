import CryptoKit
import Foundation
import PiezaActualizaciones

/// Plantillas de la comunidad (repo esquema-app/esquema-catalogo). Solo se descarga desde un dominio fijo, sin seguir redirecciones,
/// con tamaño máximo; el índice lo valida bin/plantillas.py (plantilla_formato.py, el mismo archivo que usa el catálogo) y cada
/// plantilla se compara con su tamaño y su huella SHA-256 del índice validado antes de que Python la vuelva a validar y la guarde en
/// ~/Library/Application Support/Esquema/plantillas/ (nunca en la carpeta de la persona). Equivale a escritorio/src/catalogo.js.
@MainActor
enum Catalogo {
    static let host = "raw.githubusercontent.com"
    static let base = "https://raw.githubusercontent.com/esquema-app/esquema-catalogo/main/"
    static let maxIndice = 1024 * 1024
    static let maxArchivo = 100 * 1024
    /// `plantillas/<categoria>/<id>.json` (lo mismo que plantilla_formato.RUTA).
    static let patron = "^plantillas/[a-z-]+/[a-z0-9]+(-[a-z0-9]+)*\\.json$"
    /// Lo último que validó Python: de aquí salen la ruta, el tamaño y la huella de cada descarga (nunca de lo que manda la interfaz).
    private static var indice: [[String: Any]] = []

    /// Pide `ruta` (relativa a `base`) y devuelve los datos solo si es una respuesta 200 del mismo dominio y no pasa del máximo.
    private static func pedir(_ ruta: String, maximo: Int, _ fin: @escaping @MainActor (Data?) -> Void) {
        guard let u = URL(string: base + ruta), u.scheme == "https", u.host == host else { fin(nil); return }
        var pedido = URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        pedido.setValue("Esquema/\(Actualizaciones.version)", forHTTPHeaderField: "User-Agent")
        let dominio = host
        let sesion = URLSession(configuration: .ephemeral, delegate: SinRedirecciones(), delegateQueue: nil)
        sesion.dataTask(with: pedido) { datos, respuesta, _ in
            let r = respuesta as? HTTPURLResponse
            let ok = r?.statusCode == 200 && r?.url?.host == dominio && (datos?.count ?? Int.max) <= maximo
            let d = ok ? datos : nil
            sesion.finishTasksAndInvalidate()
            Task { @MainActor in fin(d) }
        }.resume()
    }

    private static func temporal(_ datos: Data) -> URL {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("esquema-catalogo-\(UUID().uuidString).json")
        try? datos.write(to: u, options: .atomic)
        return u
    }

    /// El índice, validado por Python: {ok, plantillas} o {ok: false, error}.
    static func listar(_ fin: @escaping @MainActor ([String: Any]) -> Void) {
        pedir("index.json", maximo: maxIndice) { datos in
            guard let datos else { return fin(["ok": false, "error": Idioma.t("No pude conectarme. Revisa tu conexión.")]) }
            let archivo = temporal(datos)
            Procesador.correrJSON("plantillas.py", ["catalogo", archivo.path]) { r in
                try? FileManager.default.removeItem(at: archivo)
                guard r["ok"] as? Bool == true, let lista = r["plantillas"] as? [[String: Any]] else {
                    return fin(["ok": false, "error": Idioma.t("No pude leer el catálogo.")])
                }
                indice = lista
                fin(["ok": true, "plantillas": lista])
            }
        }
    }

    /// Descarga una plantilla del índice validado, revisa tamaño y huella, y Python la valida y la guarda.
    static func descargar(_ id: String, _ fin: @escaping @MainActor ([String: Any]) -> Void) {
        let error = { (texto: String) in fin(["ok": false, "id": id, "error": Idioma.t(texto)]) }
        guard let e = indice.first(where: { $0["id"] as? String == id }),
              let ruta = e["ruta"] as? String, ruta.range(of: patron, options: .regularExpression) != nil,
              let huella = e["sha256"] as? String, let tamano = (e["tamano"] as? NSNumber)?.intValue, tamano <= maxArchivo else {
            return error("Esa plantilla no es válida.")
        }
        pedir(ruta, maximo: maxArchivo) { datos in
            guard let datos else { return error("No pude conectarme. Revisa tu conexión.") }
            let calculada = SHA256.hash(data: datos).map { String(format: "%02x", $0) }.joined()
            guard datos.count == tamano, calculada == huella else { return error("La plantilla llegó dañada. Intenta de nuevo.") }
            let archivo = temporal(datos)
            Procesador.conEntrada("plantillas.py", "instalar", ["archivo": archivo.path, "id": id, "sha256": huella]) { r in
                try? FileManager.default.removeItem(at: archivo)
                var x = r
                if r["ok"] as? Bool != true { x["id"] = id; x["error"] = Idioma.t(r["error"] as? String ?? "Esa plantilla no es válida.") }
                fin(x)
            }
        }
    }
}

/// Nunca sigue una redirección: una respuesta 3xx queda como está (y no es 200, así que se descarta).
final class SinRedirecciones: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}
