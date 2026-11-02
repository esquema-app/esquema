// swift-tools-version:5.10
import PackageDescription

// Esquema para Mac: la app nativa genérica de Pieza (host-mac) con la interfaz de ui/ y los scripts de bin/ (Python portátil adentro).
let package = Package(
    name: "Esquema",
    platforms: [.macOS("15.0")],
    targets: [
        .executableTarget(name: "Esquema", dependencies: ["PiezaHost", "PiezaActualizaciones", "PiezaCatalogo", "PiezaTrabajos"], path: "Sources/Esquema"),
        // Pieza «host-mac» (de Pieza: no se edita a mano): la ventana, el puente con sus guardas, config e idioma desde app.json,
        // menús, apariencia, actualizaciones, la carpeta con marcador y su vigilante (Carpeta.swift) y las acciones declaradas en
        // acciones.json. Esquema le registra lo suyo en EsquemaApp.swift.
        .target(name: "PiezaHost", path: "Sources/PiezaHost"),
        // Pieza «actualizaciones» (de Pieza: no se edita a mano). Esquema la configura con su repo y su nombre.
        .target(name: "PiezaActualizaciones", path: "Sources/PiezaActualizaciones"),
        // Pieza «catálogo»: bajar plantillas de la comunidad (dominio fijo, sin redirecciones, SHA-256). Se configura con app.json.
        .target(name: "PiezaCatalogo", path: "Sources/PiezaCatalogo"),
        // Pieza «trabajos»: LectorProgreso, el avance en vivo de los trabajos largos.
        .target(name: "PiezaTrabajos", path: "Sources/PiezaTrabajos"),
    ]
)
