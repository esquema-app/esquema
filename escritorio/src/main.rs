// Esquema para Mac, Windows y Linux, sobre la pieza «host-tauri» (src/pieza/): la ventana con la interfaz de ui/, el puente con
// sus guardas, config e idioma desde app.json, menús, apariencia, actualizaciones y las acciones declaradas en acciones.json
// (proyecto, dibujar, crearReadme, estructura, abrirArchivo, guardarArchivo, probarIA: solo corren un script), la carpeta de la
// persona (config.carpeta) y su vigilante. Aquí queda lo propio de Esquema: elegir la carpeta o un proyecto reciente, volver a
// listar cuando cambia, la Papelera, exportar, el catálogo de plantillas y el menú. Reemplaza a app/Sources/Esquema (Swift) y
// a escritorio/src/main.js (Electron). El contrato está en pruebas/puente.json y lo revisa pruebas/contrato.py.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod pieza;
#[path = "pieza/progreso.rs"]
mod progreso;
#[path = "pieza/catalogo.rs"]
mod catalogo;
#[path = "pieza/actualizaciones.rs"]
mod actualizaciones;

use pieza::host::{arrancar, item, Host, Inyectado, ItemMenu, MenuPropio, Opciones, OpcionesCarpeta};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const MAXIMO_EXPORTAR: usize = 50 * 1024 * 1024;
/// Esquema solo abre, guarda, vigila y borra documentos y diagramas.
const EXTENSIONES: [&str; 2] = [".md", ".mmd"];

/// Las rutas del último listado: si cambian (archivo nuevo, borrado o renombrado), la interfaz recibe `archivos`.
static LISTA: Mutex<Option<Vec<String>>> = Mutex::new(None);

fn rutas(archivos: &Value) -> Vec<String> {
    archivos.as_array().map(|l| l.iter().filter_map(|a| a["ruta"].as_str().map(String::from)).collect()).unwrap_or_default()
}
fn recordar(archivos: &Value) {
    if let Ok(mut l) = LISTA.lock() {
        *l = Some(rutas(archivos));
    }
}
fn listar(h: &Host, carpeta: &Path) -> Value {
    h.procesador.correr_json("carpeta.py", &["listar".into(), carpeta.to_string_lossy().into_owned()], Default::default())
}

/// Algo cambió en la carpeta vigilada: se vuelve a listar y, si la lista cambió, la interfaz recibe `archivos`.
fn relistar(h: &Host, base: &Path) {
    let r = listar(h, base);
    if r["ok"] != true || h.vigilante().and_then(|v| v.base()).as_deref() != Some(base) {
        return;
    }
    let nuevas = rutas(&r["archivos"]);
    let mut l = LISTA.lock().unwrap_or_else(|e| e.into_inner());
    if l.as_ref() == Some(&nuevas) {
        return;
    }
    *l = Some(nuevas);
    drop(l);
    h.llamar("archivos", json!({"archivos": r["archivos"].as_array().cloned().unwrap_or_default()}), None);
}

/// Deja `c` como la carpeta (el host la guarda y mueve el vigilante), la lista y responde carpetaElegida (con proyecto: true si
/// viene de un proyecto). `c` es una ruta que eligió la persona o que la app leyó de proyectos.json, nunca de la interfaz.
fn usar_carpeta(h: &Host, c: &Path, proyecto: bool) {
    let Some(real) = h.usar_carpeta(c) else {
        return void(h.llamar("carpetaElegida", json!({"ok": false, "error": h.t("No pude abrir esa carpeta.")}), None));
    };
    let l = listar(h, &real);
    if l["ok"] != true {
        let e = l["error"].as_str().unwrap_or("No pude abrir esa carpeta.");
        return void(h.llamar("carpetaElegida", json!({"ok": false, "error": h.t(e)}), None));
    }
    recordar(&l["archivos"]);
    let mut r = json!({"ok": true, "carpeta": l["carpeta"], "archivos": l["archivos"].as_array().cloned().unwrap_or_default()});
    if proyecto {
        r["proyecto"] = json!(true);
    }
    h.llamar("carpetaElegida", r, None);
}
fn void(_: bool) {}

fn elegir_carpeta(h: &Host, proyecto: bool) {
    let titulo = h.t("Elige la carpeta con tus documentos y diagramas (la de tu proyecto, por ejemplo). Esquema no los mueve ni los copia.");
    match h.dialogo_carpeta(Some(titulo), h.carpeta_actual()) {
        Some(c) => usar_carpeta(h, &c, proyecto),
        None => void(h.llamar("carpetaElegida", json!({"ok": false}), None)),
    }
}

/// Un proyecto reciente: la ruta sale de <carpeta de Esquema>/proyectos.json (lo escribe bin/proyecto.py), nunca de la interfaz.
fn abrir_proyecto(h: &Host, indice: i64) {
    let j = pieza::enchufe::leer_json(&h.datos.join("proyectos.json"), 1024 * 1024).unwrap_or(json!({}));
    let lista: Vec<PathBuf> = j["recientes"]
        .as_array()
        .map(|l| {
            l.iter()
                .filter(|p| p["nombre"].is_string())
                .filter_map(|p| p["ruta"].as_str().map(PathBuf::from))
                .filter(|p| p.is_absolute())
                .take(30)
                .collect()
        })
        .unwrap_or_default();
    let c = usize::try_from(indice).ok().and_then(|i| lista.get(i)).filter(|p| p.is_dir()).and_then(|p| std::fs::canonicalize(p).ok());
    match c {
        Some(c) => usar_carpeta(h, &c, true),
        None => void(h.llamar("carpetaElegida", json!({"ok": false, "error": h.t("No encontré ese proyecto. ¿Lo moviste?")}), None)),
    }
}

fn main() {
    let menu = MenuPropio {
        deshacer_propio: true,
        archivo: vec![
            item("Nuevo…", "nuevo", Some("CmdOrCtrl+N")),
            ItemMenu::Nativo {
                etiqueta: "Abrir carpeta…".into(),
                atajo: Some("CmdOrCtrl+O".into()),
                f: Arc::new(|h: &Host| {
                    if h.idioma_elegido() {
                        h.mostrar();
                        elegir_carpeta(h, false);
                    }
                }),
            },
            ItemMenu::Nativo {
                etiqueta: "Mostrar la carpeta".into(),
                atajo: None,
                f: Arc::new(|h: &Host| {
                    if let Some(c) = h.carpeta_actual() {
                        pieza::sistema::mostrar_en_carpeta(&c);
                    }
                }),
            },
            ItemMenu::Separador,
            item("Guardar", "guardar", Some("CmdOrCtrl+S")),
            ItemMenu::Separador,
            item("Ajustes…", "ajustes", Some("CmdOrCtrl+,")),
        ],
        ver: vec![
            item("Acercar", "acercar", Some("CmdOrCtrl+=")),
            item("Alejar", "alejar", Some("CmdOrCtrl+-")),
            item("Ajustar a la ventana", "ajustar", Some("CmdOrCtrl+0")),
            ItemMenu::Separador,
            item("Solo texto", "texto", Some("CmdOrCtrl+1")),
            item("Texto y dibujo", "ambos", Some("CmdOrCtrl+2")),
            item("Solo dibujo", "dibujo", Some("CmdOrCtrl+3")),
        ],
        extra: vec![],
    };
    let op = Opciones {
        global: Some("Esquema".into()),
        sitio: Some("https://esquema-app.github.io/esquema/".into()),
        codigo: Some("https://github.com/esquema-app/esquema".into()),
        // La carpeta de la persona (config.carpeta, "interfaz": false en app.json) y su vigilante: si un archivo abierto cambia
        // en el disco (VS Code, git pull…), la interfaz recibe archivoCambiado; lo que Esquema lee o guarda (abrirArchivo y
        // guardarArchivo, con «vigilar») no se avisa. Si cambia la lista de .md/.mmd, `archivos`.
        carpeta: Some(OpcionesCarpeta::default()),
        vigilar: Some(EXTENSIONES.iter().map(|x| x.to_string()).collect()),
        menu,
        // Pieza «trabajos»: las órdenes largas de proyecto.py cuentan cómo van (proyectoProgreso cada 0,5 s).
        lector_progreso: Some(Arc::new(progreso::Lector)),
        // Pieza «actualizaciones»: solo los Releases de este repo, con su .sha256.
        actualizaciones: actualizaciones::Actualizaciones::nuevas("esquema-app/esquema", "Esquema").ok().map(|a| Arc::new(a) as _),
        ..Default::default()
    };
    arrancar(tauri::generate_context!(), op, |host| {
        // `carpeta` de las acciones declaradas: siempre la actual, nunca la de la interfaz. Sin carpeta abierta, "" (bin/proyecto.py
        // decide: crear un proyecto Libro no la necesita; lo demás, y bin/carpeta.py, responden «Elige una carpeta primero»).
        host.inyector("carpetaActual", |_, h| Inyectado::Valor(json!(h.carpeta_actual().map(|c| c.to_string_lossy().into_owned()).unwrap_or_default())));
        if let Some(v) = host.vigilante() {
            let h = host.clone();
            *v.al_cambiar.lock().expect("vigilante") = Some(Arc::new(move |base: &Path| relistar(&h, base)));
        }
        host.al_estado(|mut e, h| {
            e.insert("carpeta".into(), Value::Null);
            e.insert("archivos".into(), json!([]));
            match h.carpeta_actual() {
                Some(c) => {
                    let r = listar(h, &c);
                    if r["ok"] == true {
                        e.insert("carpeta".into(), r["carpeta"].clone());
                        e.insert("archivos".into(), r["archivos"].clone());
                        recordar(&r["archivos"]);
                        if let Some(v) = h.vigilante() {
                            v.empezar(&c);
                        }
                    }
                }
                None => {
                    if let Some(v) = h.vigilante() {
                        v.detener();
                    }
                }
            }
            e
        });

        host.registrar("elegirCarpeta", |d, h, _| elegir_carpeta(h, d["proyecto"] == true));
        host.registrar("abrirProyecto", |d, h, _| abrir_proyecto(h, d["indice"].as_i64().unwrap_or(-1)));

        // Un .md/.mmd de la carpeta abierta (que no es documentación de Esquema) a la Papelera del sistema.
        host.registrar("papelera", |d, h, _| {
            let ruta = d["ruta"].as_str().unwrap_or("").to_string();
            let abs = h.carpeta_actual().and_then(|b| h.dentro(&b, &ruta, Some(&EXTENSIONES)));
            let Some(abs) = abs else {
                return void(h.llamar("enPapelera", json!({"ok": false, "ruta": ruta, "error": h.t("Ese archivo no se puede borrar.")}), None));
            };
            if pieza::sistema::papelera(&abs) {
                if let Some(v) = h.vigilante() {
                    v.olvidar(&ruta);
                }
                h.llamar("enPapelera", json!({"ok": true, "ruta": ruta}), None);
            } else {
                h.llamar("enPapelera", json!({"ok": false, "ruta": ruta, "error": h.t("No pude mandarlo a la Papelera.")}), None);
            }
        });

        // «Guardar como» del sistema: SVG o Markdown (texto) o PNG (base64), donde la persona elija.
        host.registrar("exportar", |d, h, _| {
            let formato = d["formato"].as_str().filter(|f| ["svg", "png", "md"].contains(f)).unwrap_or("");
            if formato.is_empty() {
                return void(h.llamar("exportado", json!({"ok": false}), None));
            }
            let contenido: Option<Vec<u8>> = if formato == "png" {
                d["base64"].as_str().and_then(base64)
            } else {
                d["texto"].as_str().map(|t| t.as_bytes().to_vec())
            };
            let Some(contenido) = contenido.filter(|c| !c.is_empty() && c.len() <= MAXIMO_EXPORTAR) else {
                return void(h.llamar("exportado", json!({"ok": false, "error": h.t("No pude crear el archivo.")}), None));
            };
            let nombre = d["nombre"].as_str().filter(|n| !n.is_empty()).unwrap_or("esquema");
            match h.guardar_archivo(nombre, formato, &contenido, None) {
                Ok(r) => h.llamar("exportado", json!({"ok": true, "ruta": r.to_string_lossy()}), None),
                Err("cancelado") => h.llamar("exportado", json!({"ok": false}), None),
                Err(_) => h.llamar("exportado", json!({"ok": false, "error": h.t("No pude guardar el archivo.")}), None),
            };
        });

        // Plantillas de la comunidad: pieza «catálogo». Repo y tipos salen de app.json (solo de
        // raw.githubusercontent.com/esquema-app/esquema-catalogo, sin redirecciones, con SHA-256).
        match catalogo::Catalogo::nuevo(&host.app.crudo, &format!("Esquema/{}", host.app.version())) {
            Ok(cat) => {
                let cat = Arc::new(cat);
                let c = cat.clone();
                host.registrar("catalogoPlantillas", move |_, h, _| void(h.llamar("catalogoListo", c.listar(h, "plantillas"), None)));
                host.registrar("descargarPlantilla", move |d, h, _| {
                    let id: String = d["id"].as_str().unwrap_or("").chars().take(60).collect();
                    h.llamar("plantillaDescargada", cat.descargar(h, "plantillas", &id), None);
                });
            }
            Err(e) => eprintln!("Esquema: catálogo: {e}"),
        }
    });
}

/// Base64 estándar a bytes (lo que manda la interfaz al exportar un PNG). None si no es base64.
fn base64(s: &str) -> Option<Vec<u8>> {
    let valor = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let b = s.trim_end_matches('=').as_bytes();
    if s.len() % 4 == 1 || s.len() - b.len() > 2 {
        return None;
    }
    let mut r = Vec::with_capacity(b.len() * 3 / 4);
    for trozo in b.chunks(4) {
        let mut n = 0u32;
        for (i, c) in trozo.iter().enumerate() {
            n |= valor(*c)? << (18 - 6 * i);
        }
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        r.extend_from_slice(&bytes[..trozo.len().saturating_sub(1)]);
    }
    Some(r)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn base64_como_el_navegador() {
        assert_eq!(base64("aG9sYQ==").unwrap(), b"hola");
        assert_eq!(base64("aG9sYSE").unwrap(), b"hola!");
        assert!(base64("a").is_none());
        assert!(base64("a$==").is_none());
    }
}
