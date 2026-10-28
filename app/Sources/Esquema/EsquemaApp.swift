import AppKit

/// Esquema para Mac: una ventana con la interfaz web de ui/ y un puente a los scripts de bin/ (el Python portátil viene dentro de la
/// app). Los documentos y diagramas viven en la carpeta que elige la persona; la configuración, en ~/Library/Application Support/Esquema.
@main
@MainActor
final class EsquemaApp: NSObject, NSApplicationDelegate {
    static func main() {
        let app = NSApplication.shared
        let delegado = EsquemaApp()
        app.delegate = delegado
        app.setActivationPolicy(.regular)
        app.run()
    }

    private static var tareasIniciadas = false

    func applicationDidFinishLaunching(_ aviso: Notification) {
        Rutas.prepararDatos()
        Menu.instalar()
        Ventana.shared.mostrar()
        // En el primer uso lo primero es elegir el idioma: lo que corre solo y puede mostrar algo (actualizaciones) espera a que
        // esté elegido. Ventana lo llama al guardarse idioma_ui.
        if Idioma.elegido { EsquemaApp.iniciarTareas() }
    }

    /// Lo que corre solo: revisar actualizaciones al abrir y cada 6 horas. Una sola vez.
    static func iniciarTareas() {
        guard !tareasIniciadas else { return }
        tareasIniciadas = true
        Actualizaciones.revisarCadaRato()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        Ventana.shared.mostrar()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// Antes de cerrar: la interfaz guarda lo que tenga pendiente (guarda 650 ms después de la última tecla) y se espera a que
    /// terminen los guardados en curso, como mucho 3 segundos.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Ventana.shared.guardarTodo()
        EsquemaApp.esperarGuardados(hasta: Date().addingTimeInterval(3))
        return .terminateLater
    }

    private static func esperarGuardados(hasta limite: Date) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            Task { @MainActor in
                if Ventana.shared.guardando > 0, Date() < limite { esperarGuardados(hasta: limite) } else { NSApp.reply(toApplicationShouldTerminate: true) }
            }
        }
    }

    func applicationWillTerminate(_ aviso: Notification) {
        Vigilante.detener()
    }
}

/// Barra de menú: la app (Acerca de, Ajustes, Salir), Archivo, Edición (con deshacer de Esquema), Ver (zoom del lienzo y vistas)
/// y Ventana. Lo que es de Esquema lo hace la interfaz (window.Esquema.menu); cortar, copiar y pegar son los del sistema.
@MainActor
enum Menu {
    private static func item(_ titulo: String, _ accion: Selector, _ tecla: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let i = NSMenuItem(title: Idioma.t(titulo), action: accion, keyEquivalent: tecla)
        i.keyEquivalentModifierMask = mods
        i.target = Ventana.shared
        return i
    }

    static func instalar() {
        let principal = NSMenu()

        let app = NSMenuItem()
        let menuApp = NSMenu()
        menuApp.addItem(withTitle: Idioma.t("Acerca de Esquema"), action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        menuApp.addItem(.separator())
        menuApp.addItem(item("Ajustes…", #selector(Ventana.menuAjustes), ","))
        menuApp.addItem(.separator())
        menuApp.addItem(withTitle: Idioma.t("Ocultar Esquema"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        menuApp.addItem(withTitle: Idioma.t("Salir de Esquema"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = menuApp
        principal.addItem(app)

        let archivo = NSMenuItem()
        let menuArchivo = NSMenu(title: Idioma.t("Archivo"))
        menuArchivo.addItem(item("Nuevo…", #selector(Ventana.menuNuevo), "n"))
        menuArchivo.addItem(item("Abrir carpeta…", #selector(Ventana.menuAbrirCarpeta), "o"))
        menuArchivo.addItem(item("Mostrar la carpeta en el Finder", #selector(Ventana.menuMostrarCarpeta)))
        menuArchivo.addItem(.separator())
        menuArchivo.addItem(item("Guardar", #selector(Ventana.menuGuardar), "s"))
        menuArchivo.addItem(.separator())
        menuArchivo.addItem(withTitle: Idioma.t("Cerrar ventana"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        archivo.submenu = menuArchivo
        principal.addItem(archivo)

        let edicion = NSMenuItem()
        let menuEdicion = NSMenu(title: Idioma.t("Edición"))
        menuEdicion.addItem(item("Deshacer", #selector(Ventana.menuDeshacer), "z"))
        menuEdicion.addItem(item("Rehacer", #selector(Ventana.menuRehacer), "z", [.command, .shift]))
        menuEdicion.addItem(.separator())
        menuEdicion.addItem(withTitle: Idioma.t("Cortar"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        menuEdicion.addItem(withTitle: Idioma.t("Copiar"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        menuEdicion.addItem(withTitle: Idioma.t("Pegar"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        menuEdicion.addItem(withTitle: Idioma.t("Seleccionar todo"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edicion.submenu = menuEdicion
        principal.addItem(edicion)

        let ver = NSMenuItem()
        let menuVer = NSMenu(title: Idioma.t("Ver"))
        menuVer.addItem(item("Acercar", #selector(Ventana.menuAcercar), "+"))
        menuVer.addItem(item("Alejar", #selector(Ventana.menuAlejar), "-"))
        menuVer.addItem(item("Ajustar a la ventana", #selector(Ventana.menuAjustar), "0"))
        menuVer.addItem(.separator())
        menuVer.addItem(item("Solo texto", #selector(Ventana.menuVistaTexto), "1"))
        menuVer.addItem(item("Texto y dibujo", #selector(Ventana.menuVistaAmbos), "2"))
        menuVer.addItem(item("Solo dibujo", #selector(Ventana.menuVistaDibujo), "3"))
        menuVer.addItem(.separator())
        let completa = NSMenuItem(title: Idioma.t("Pantalla completa"), action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        completa.keyEquivalentModifierMask = [.command, .control]
        menuVer.addItem(completa)
        ver.submenu = menuVer
        principal.addItem(ver)

        let ventana = NSMenuItem()
        let menuVentana = NSMenu(title: Idioma.t("Ventana"))
        menuVentana.addItem(withTitle: Idioma.t("Minimizar"), action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        menuVentana.addItem(withTitle: Idioma.t("Zoom"), action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        ventana.submenu = menuVentana
        principal.addItem(ventana)
        NSApp.windowsMenu = menuVentana
        NSApp.mainMenu = principal
    }
}
