// swift-tools-version:5.10
import PackageDescription

// Esquema para Mac: una ventana con la interfaz de ui/ (WKWebView) y un puente a los scripts de bin/ (Python portátil adentro).
let package = Package(
    name: "Esquema",
    platforms: [.macOS("15.0")],
    targets: [
        .executableTarget(name: "Esquema", path: "Sources/Esquema"),
    ]
)
