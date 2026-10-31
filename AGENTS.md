# Esquema — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Esquema es una app para hacer **diagramas y documentación**. Lee y escribe **Mermaid** (lo que GitHub ya muestra), pero se edita de
dos formas que se mantienen al día: escribiendo el texto (con autocompletar y errores claros) o dibujando en el lienzo (crear,
conectar arrastrando, renombrar, mover, borrar, deshacer). Dibuja con un **motor propio** sin dependencias, decenas de veces más rápido
que Mermaid. Los documentos son Markdown con diagramas incrustados que se editan en el lugar. La IA del usuario (Claude Code, Codex o
Gemini, con su propia cuenta) dibuja lo que se le pide («Dibújame») y escribe el README para GitHub; cada cambio suyo se puede quitar.
**Proyectos:** documenta un repositorio entero dentro del mismo repo (`docs/esquema/`), con **elementos** (pantallas, botones,
servicios…) conectados en todos los documentos y diagramas, cambios en todas partes de una vez y **versiones** (commits de git solo
de esa carpeta). Interfaz web única (`ui/`) en la app de Mac (`app/`, nativa) y en la de Windows y Linux (`escritorio/`, Electron).

**Principios que no se negocian**
1. **Los archivos son de la persona.** Viven en la carpeta que elige, en formato abierto: `.md` con bloques ```` ```mermaid ```` y
   diagramas sueltos `.mmd`. Esquema no los mueve, no los copia y no los manda a ninguna parte. Sin servidores propios ni telemetría.
2. **Mermaid de verdad.** Lo que Esquema escribe es Mermaid que GitHub muestra tal cual. Lo propio (posiciones fijadas, íconos, estilo
   de las flechas) va en una línea de comentario `%% esquema: {...}` que Mermaid ignora. Editar en el lienzo cambia **solo** las líneas
   necesarias: comentarios, sangrías y el estilo de quien escribió quedan igual.
3. **La IA es la del usuario** y ve lo mínimo: el pedido, el diagrama abierto si se pide cambiarlo y, para el README, solo nombres de
   archivos (respetando `.gitignore`, sin secretos). Corre sin herramientas y **sin la memoria de la persona** (Claude Code con
   `--safe-mode` si lo conoce, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` y `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; todos los prompts dicen
   `asistente.SOLO_ESTO`): sin eso rellenaba con otros proyectos suyos. Su respuesta se valida con el motor y **nunca se aplica
   sola de forma definitiva**: queda como un cambio con «Quitar este cambio» (un documento que escribe un trabajo de «Documentar»
   queda en el disco al tiro, pero con «Quitar este cambio», que lo vuelve a como estaba en la versión anterior o lo borra si era
   nuevo, y guarda otra versión; ver «Trabajos»). Para documentar un proyecto ve el README, las guías
   (AGENTS/CONTRIBUTING…), la lista de archivos, los manifiestos y los mensajes de git (sin autores), y solo los archivos de código
   que la persona aprueba; antes de cada envío se muestra exactamente lo que va («Ver lo que se envía»), y lo que parece un secreto
   se oculta (`proyecto.ocultar_secretos`). **Revisión a fondo** (`a_fondo`, casilla del diálogo de envío, marcada de partida en
   las tareas de `proyecto.A_FONDO`: `inicial`, `flujo`, `completar`; se puede desmarcar): además, la IA puede **leer** la carpeta del
   código por su cuenta para revisarla entera. Solo leer: Claude con `--add-dir <código> --allowedTools Read,Glob,Grep` y
   `--disallowedTools` de todo lo que escribe, ejecuta o sale a internet, más `Read(**/<patrón>)` de `proyecto.NO_LEER` (`.env*`,
   llaves, credenciales, `.git/`); Codex `-s read-only`; Gemini solo con Antigravity (`ia.puede_leer`). La IA siempre corre en una carpeta temporal
   (nunca dentro del código: su CLI cargaría la configuración y los hooks de ese repo) y el pedido le dice dónde leer. El diálogo dice
   qué carpeta y qué no abre. Nunca escribe en la carpeta del código. «Documentar» (y «Completar lo que falta») son un **trabajo por
   etapas** (`bin/documentar.py`): explorar usa esta lectura a fondo y pide **solo un plan**; cada documento después va en su propia
   llamada **sin herramientas**, con sus archivos clave adentro (solo si la revisión a fondo está marcada). Los trabajos largos usan
   `bin/ia_vivo.py` (propio de Esquema, sobre la pieza «ia»: mismas protecciones, más el avance en vivo y «Detener»).
4. **Plantillas = solo datos.** Todo lo que viene de afuera (plantillas, traducciones, respuestas de la IA, el texto de un diagrama)
   se valida antes de usarse y se escapa antes de mostrarse.
5. **Rápido y liviano.** El motor y la interfaz no tienen dependencias (ni npm ni CDN); Python solo con biblioteca estándar.
6. **Gratis y abierto** (AGPL-3.0). Sin cuentas, sin publicidad.
7. **Nada personal en el código.** Ejemplos, pruebas y `ui/demo.json` solo con datos ficticios (Ana Pérez, Matías Soto, Banco Ejemplo).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `ui/motor/` | El motor, JS sin dependencias; cada archivo se suma a `globalThis.EsquemaMotor` (igual en el navegador y en Node). `texto.js` (medir con caché, partir etiquetas, escapar, errores con marcadores, línea `%% esquema:`), `flujo.js` (leer/escribir/editar flowchart conservando el texto), `secuencia.js` (leer/acomodar/dibujar/editar sequenceDiagram), `capas.js` (acomodo por capas), `formas.js` (formas e íconos propios), `dibujo.js` (elige el tipo, acomoda con caché, SVG por partes con clave, SVG independiente para exportar), `markdown.js` (bloques de un `.md` y Markdown → HTML seguro). |
| `ui/` | Interfaz única (`index.html` con CSP, `app.js`, `i18n.js` (pieza «i18n»: `T`, `Tp`, `tr`, `traducirDOM`, paquetes de idioma validados), `host.js`, `tema.css`/`tema.js`, `componentes.css`/`componentes.js` y `bienvenida.*` (piezas, ver «Piezas»), `proyectos.js` (proyectos: paneles, diálogos, el trabajo «Documentar», el árbol «Código» y su simulación), `app.css`, `favicon.svg`), `demo.json` (ficticio, sale de `herramientas/generar_demo.py`) e `idiomas/en.json`. `motor/proyecto.js`: lógica pura de proyectos (validar `esquema.json`, refs, usos, cambiar en todas partes, glosario, comparar, documentos afectados). |
| `bin/` | Python **solo biblioteca estándar**, lo que corren las apps: `nucleo.py` (pieza «nucleo»: `app.json`, carpeta de datos, config validada, escritura atómica, contrato de scripts), `comun.py` (lo propio de Esquema sobre `nucleo`: versión, `ruta_en` de documentos con sus mensajes, `.gitignore`, secretos, `recorrer`), `carpeta.py` (listar, leer, guardar, estructura para el README), `ia.py` (pieza «ia»: la IA del usuario, sin herramientas, siempre en una carpeta temporal, revisión a fondo de solo lectura; `probar`; errores como `{codigo, valores}` que `ia.frase()` pasa a texto), `asistente.py` (README y Dibújame: prompts y limpieza de la respuesta), `plantilla_formato.py` (formato de una plantilla y del índice del catálogo: `validar`, `indice`, `validar_indice`; el MISMO archivo que `herramientas/plantilla_formato.py` del catálogo), `plantillas.py` (incluidas + descargadas, validar, índice, `catalogo` e `instalar` para lo que baja la app), `estado.py` (lo que pide la interfaz al abrir; guardar config), `proyecto.py` (proyectos: abrir, leer el repo sin IA, lo que va a la IA, generar, `esquema.json`, versiones con git o copias, ver y restaurar; recientes en la carpeta de Esquema), `ia_vivo.py` (propio de Esquema, sobre la pieza «ia»: `preguntar_vivo` cuenta lo que la IA lee mientras trabaja —stream-json en Claude, `--json` en Codex— y se puede detener; mismas protecciones y errores `{codigo, plantilla, valores}`), `inventario.py` (todo el código sin IA: clase de cada archivo, lenguajes, partes con manifiesto, tipo de proyecto; lo que leyó la IA en `lecturas.json`), `trabajos.py` (el motor de trabajos largos: estado en disco, eventos de progreso, latido, detener, esperar respuestas), `documentar.py` (el trabajo «Documentar»: inventario → explorar → escribir → cerrar), `tipos.py` (tipos de proyecto: validar y leer `tipos/`), `contenido.py` (leer lo que se agrega: md, txt, pdf, docx, odt, epub, html; adivinar qué es; partir en capítulos), `agregar.py` (Agregar, crear un proyecto Libro, responder, seguir, borrar y recuperar), `historias.py` (historias de usuario y «Terminé el desarrollo»), `incorporar.py` («Agregar información»: un plan de cambios que la persona revisa), `libros.py` (libros, material de estudio, incongruencias y documentos), `wiki.py` (publicar en la wiki de GitHub). El último argumento siempre es el JSON de salida; lo de la persona llega en un JSON de entrada. |
| `tipos/` | Tipos de proyecto incluidos (`software.json`, `libro.json`; ver «Tipos de proyecto»). |
| `app.json`, `piezas.json` | **Pieza** (ver «Piezas» abajo): `app.json` describe la app para las piezas (id, nombre, datos, plataformas, claves de config); `piezas.json` lo escribe `pieza.py` (versión y huella de cada archivo copiado). |
| `plantillas/` | Plantillas incluidas (`<categoria>/<id>.json`) y `README.md` con el formato. |
| `ejemplos/` | `proyecto-ejemplo/` (la carpeta ficticia de la demo, con un poco de «código» para «Documentar un proyecto»), `ia-simulada/` (lo que responde la IA en la vista previa del navegador), `agregar/` (una historia de usuario, un libro y unas notas de reunión ficticios, en es y en, para probar «Agregar» y los proyectos Libro), `catalogo-ejemplo/` (copia de las plantillas del catálogo de la comunidad: «Comunidad» en la demo y las pruebas) y scripts para construir encima del formato (`listar_diagramas.py`). |
| `pruebas/` | `correr.sh` (todo), `motor.mjs` (motor en Node), `interfaz.mjs` (Playwright; `window._simVelocidad` y `window._simFallar` aceleran el trabajo simulado o hacen fallar un documento), `test_python.py`, `contrato.py` + `puente.json` (contrato del puente), `casos.json` (casos compartidos), `compat/` (ejemplos Mermaid que se leen y se escriben igual; `variantes/`: formas no canónicas), `ia_falsa.py` (responde planes y documentos, con stream-json si se lo piden; `IA_FALSA_FALLA_DOC`, `IA_FALSA_LENTO`, `IA_FALSA_MODO=plan-basura`; también rondas de preguntas de una HU, su cierre, capítulos, estudio e incongruencias). |
| `herramientas/` | `revisar_privacidad.sh`, `generar_demo.py`, `comparar_mermaid.mjs` (rendimiento y compatibilidad contra Mermaid real, instalado aparte), `empaquetar.sh` (arma `dist/Esquema.app` + zip + `.sha256`, en un Mac), `generar_icono.mjs` (íconos de las apps desde `ui/favicon.svg`), `pagina_capturas.mjs` (sirve la página como en GitHub Pages, arma `compartir.png` y `apple-touch-icon.png` y revisa la página en los dos idiomas). |
| `app/` | App de Mac (SwiftPM, macOS 15, sin proyecto de Xcode): `EsquemaApp.swift` (arranque, menús), `Ventana.swift` (WKWebView + puente: un `case` por acción), `Carpeta.swift` (elegir la carpeta con marcador, rutas, `Vigilante` con FSEvents), `Servicios.swift` (rutas, config, idioma, `Procesador`, `EnOrden`), `Catalogo.swift` (plantillas de la comunidad); `Sources/PiezaActualizaciones/` (pieza «actualizaciones», su propio target); `Info.plist`, `Esquema.icns`. Ver «App de Mac». |
| `escritorio/` | App de Windows y Linux (Electron): `src/main.js` (ventana, puente `ACCIONES`, menú, protocolo `esquema://ui/`), `src/preload.js`, `src/rutas.js`, `src/servicios.js`, `src/vigilante.js` (`fs.watch`), `src/catalogo.js` (plantillas de la comunidad), `src/actualizaciones.js` (pieza «actualizaciones»); `herramientas/` (Python portátil, instalador NSIS), `pruebas/` (`arranque.mjs` con Xvfb, `vigilante.mjs`, `catalogo.mjs`), `iconos/`. Ver «Windows y Linux». |
| `build.sh`, `instalar.sh`, `instalar.ps1` | Compilar e instalar en el Mac de desarrollo; instaladores de un comando (Mac/Linux y Windows) que verifican la huella. |
| `docs/` | La página pública (GitHub Pages, `pagina.yml` la publica con `ui/` en `/demo/`): `index.html` bilingüe (es/en), `pagina.css`, `pagina.js`, `sitemap.xml`, `apple-touch-icon.png`, `favicon.svg` e `img/` (capturas y `compartir.png`). Ver «Página pública». |
| `CHANGELOG.md` | Lo que cambia para quien usa la app, en palabras simples (ver «Lo que rodea a un cambio»). |

## Piezas (de [Pieza](https://github.com/pieza-app/pieza))
Esquema usa piezas de Pieza, la base de la familia de apps: código probado que se copia a la app (modelo «copiar y adueñarse»).

| Pieza | Archivos | Qué usa Esquema |
|---|---|---|
| `nucleo` | `bin/nucleo.py` | `app.json`, carpeta de datos (`ESQUEMA_DATOS`), config validada por `app.json`, `escribir_atomico`, `ruta_en`, `responder`. `comun.py` lo envuelve con lo propio de Esquema. |
| `ia` | `bin/ia.py` | La IA de la persona (`preguntar`, `probar`, `lista`, `puede_leer`, `frase`). Lo propio de Esquema (prompts, `SOLO_ESTO`, `NO_LEER`) sigue en `asistente.py` y `proyecto.py`. `ia.py probar <entrada {ia}> <salida>`. |
| `i18n` | `ui/i18n.js` | `T`, `Tp`, `tr`, `frase`, `traducirDOM` (`app.js` crea la instancia con `noTraducir: ".md"`). `ui/idiomas/en.json` lleva `codigo`. |
| `bienvenida` | `ui/bienvenida.js`, `ui/bienvenida.css` | El paso del idioma (`data-bv-idioma`, `.opciones-idioma`, teclas 1/2, el del sistema sugerido y enfocado, avisos que esperan con `retener`) y el mecanismo de pasos. Los pasos de Esquema (hola → carpeta → IA) se suman en `app.js` con `sumarPaso` (`listo: false`: la IA es el último y dice «Empezar»; hola y carpeta con `saltable: false`). Sus colores, `--bv-*`, los conecta la pieza `tema`. Sus botones todavía usan `.boton`/`.pie-dialogo`: `app.css` los dibuja igual que `.pz-boton`/`.pz-pie`, solo dentro de `.pieza-bv`. |
| `host-ui` | `ui/host.js` | El puente: `PiezaHost.crearHost({nombre: "esquema", global: "Esquema", simular})` en `app.js`; `host.enviar(accion, datos)` y `host.responder({…})` (las respuestas quedan en `window.Esquema`; `_pruebas` se asigna aparte porque `responder` solo suma funciones). `HOST = host.plataforma` y `<html data-host>`. `simular(accion, d, c)` es la vista previa (modo función); `probarIA`, `buscarActualizacion` y `actualizar` salen de `PiezaHost.simulacionesComunes()`. |
| `tema` | `ui/tema.css`, `ui/tema.js` | Los tokens (`--fondo`, `--panel`, `--panel-2`, `--linea`, `--texto`, `--texto-suave`, `--acento`, `--rojo`, `--verde`, `--sombra`, derivados `--hover`, `--acento-suave`, `--rojo-suave`) con `light-dark()`. `app.css` solo redefine los pares que Esquema cambia, `--sombra` (la de la pieza no sirve en Chromium) y lo propio con `light-dark()`: `--lienzo`, `--punto`, `--d-*`. `tema.aplicar(tema.elegir({config}))` al llegar el estado (`?tema=` gana); «Apariencia» en Ajustes es `tema.selectorHTML()`. El SVG exportado no usa estos tokens (`M.COLORES`). |
| `componentes` | `ui/componentes.js`, `ui/componentes.css` | `ui = PiezaComponentes.crear({i18n, host, app, pintar, cerrar: cerrarDialogo, retener, elegirIA})`. Clases `pz-` (`.pz-boton`, `.pz-principal`, `.pz-plano`, `.pz-peligro`, `.pz-pie`, `.pz-fila`, `.pz-seg`, `.pz-chip(s)`, `.pz-giro`, `.pz-error-texto`, `.pz-capa`/`.pz-dialogo`, `.pz-ancho`). Los diálogos de Esquema traen su `<h2 id>` y su pie: los envuelve `capa(id, html, clase, {fijo, fondo})` con el marcado de la pieza, y `ui.capas()` + `ui.despuesDePintar()` en `pintar()`; `ui.manejarClic`/`ui.manejarTecla` (foco adentro, Tab, Esc y velo; la bienvenida va con `fijo`). `await ui.confirmar({titulo, valores, texto, si, no, peligro})` (frases en español; `[data-pz-confirmar]`). `ui.aviso` detrás de `toast()`; un aviso con botón («Deshacer», `toast(t, traducido, {texto, f})`) lo pinta Esquema en el mismo `#toast`. «Tu IA» (`ui.filasIA`: la IA se elige recién cuando la prueba sale bien), actualizaciones (`ui.filaActualizacion`; antes de instalar, `guardarTodo()`) y «Acerca de» (`ui.acercaDe`). |
| `actualizaciones` | `app/Sources/PiezaActualizaciones/Actualizaciones.swift`, `escritorio/src/actualizaciones.js` | Mac: target propio en `app/Package.swift`, configurado en `EsquemaApp.swift` (`Actualizaciones.configurar(.init(repo:nombre:archivoDesarrollo:variableProgreso:))`). Electron: `crear({app, net, repo, nombre})` en `main.js`. Lo que llega a la interfaz trae `texto` (español, con marcadores) y `valores`; la fila de Ajustes es de la pieza `componentes` (`ui.filaActualizacion`, que lo traduce con `T`). El aviso propio «espera a que termine de guardar» va con la misma forma (`codigo: "ocupada"`). |

- **No edites a mano los archivos de una pieza.** Se actualizan con «Pieza al día» (`.github/workflows/pieza-al-dia.yml`, una vez por
  semana abre un PR o un issue) o con `python3 <pieza>/herramientas/pieza.py actualizar .`. Si hay que cambiar algo, el cambio va
  primero a Pieza (`pieza.py diferencias . <pieza>` lo muestra) y vuelve desde allá; `pieza.py estado .` dice si algo quedó distinto.
- `app.json` va dentro de las apps (`herramientas/empaquetar.sh` y `extraResources` de `escritorio/package.json`): `bin/nucleo.py`
  lo busca junto a `bin/`. Las claves de config que aceptan las apps (Swift y Electron) son las de `app.json`; `carpeta` solo la
  escribe el selector de carpetas, nunca `config` (`comun.guardar_config` la descarta).
- `.gitignore` es una lista blanca: `app.json` y `piezas.json` están en ella.
- En las pruebas, la bienvenida se maneja con `window.Esquema._pruebas.bienvenida` (`abrir`, `ir`, `terminar`), no con el estado.

## Formato de los archivos
- **Documento** `.md`: Markdown de GitHub. Cada diagrama es un bloque ```` ```mermaid ````. GitHub lo muestra igual que Esquema.
- **Diagrama** `.mmd`: solo el texto Mermaid (lo que va dentro del bloque).
- **Línea de Esquema** (opcional, al final del diagrama): `%% esquema: {"aristas": "recta" | "ortogonal", "iconos": {"id": "servidor"},
  "pos": {"id": [x, y]}, "refs": {"id": "id-del-elemento"}}`. `refs` conecta un nodo o participante con un elemento del proyecto. Una sola línea JSON, claves ordenadas (diffs chicos). `pos` son centros fijados a mano en coordenadas del
  acomodo; `iconos`, de `M.ICONOS`. Se valida campo por campo (`M.leerMeta`); lo desconocido se descarta. Sin `pos`, todo se acomoda solo.
- Nada más se guarda: ni base de datos, ni archivos ocultos en la carpeta de la persona (salvo lo de un proyecto, abajo, que la
  persona pide). La config de la app va en la carpeta de Esquema del sistema (`comun.carpeta_app()`: `~/Library/Application
  Support/Esquema`, `%APPDATA%\Esquema` o `~/.config/esquema`, 0700; las apps se la pasan a los scripts en `ESQUEMA_DATOS`):
  `config.json` (`idioma_ui`, `ia`, `tema`, `bienvenida`, `carpeta`) y `proyectos.json` (`{"recientes": [{ruta, nombre, docs,
  codigo?, sola?, tipo?, wiki?}]}`, hasta 30; lo escribe `bin/proyecto.py`), `trabajos/<id>.json` (+ `.antes.json`, `.detener`, `.reintentar`: ver
  «Trabajos»), `entradas/<token>/` (lo que se va a agregar, hasta confirmar; se borra a los 2 días), `wikis/<id>/` (el clon de la wiki) y `proyectos/<id>/` (`lecturas.json`: qué archivos del código leyó la IA y cuándo, con huella; `perfil.json`: el tipo de
  proyecto y sus partes; `capitulos.json` y `preferencias.json` de un libro; `borrados/` para «Deshacer» un borrado; `<id>` = sha1 de la carpeta abierta, 16 hex). La documentación de los proyectos va en `~/Esquema/<proyecto>/` (abajo).

### Proyectos: la documentación aparte, en `~/Esquema/<proyecto>/`
- **Aparte del código:** cada proyecto tiene su documentación en `~/Esquema/<proyecto>/` (`proyecto.biblioteca()`), con **su propio
  git** (`git init` al vincular; las versiones nunca tocan el git del código). El vínculo con la carpeta del código vive en
  `proyectos.json` de la carpeta de Esquema (`{ruta: <la documentación>, nombre, docs: "", codigo: <la carpeta del código>}`, hasta
  30), nunca en la carpeta de la persona ni en lo que manda la interfaz. La carpeta abierta en la app es la de documentación;
  `proyecto.lugares` resuelve dónde está el código (`vinculo`) y lo que se lee para la IA sale de ahí. `vincular` (la carpeta actual
  es el código; abrir la carpeta del código de un proyecto vinculado lleva a su documentación con `vinculado_en`), `mover` (copia
  la documentación de antes, `<repo>/docs/esquema`, sin borrar nada del repo, y guarda una versión) y **«Pasar al proyecto»**:
  `destinos` (qué rutas del repo ya existen, con su texto) y `pasar` (copia al repo solo los `.md`/`.mmd` elegidos, dentro de la
  carpeta del código, sin carpetas ocultas; lo que existe solo con `reemplazar`). En la interfaz: «Agregar proyecto» (`p-agregar`),
  la lista de proyectos en el lateral, «Moverla aparte» (`p-mover`) y el diálogo `pasar` (casilla, destino `docs/<ruta>`, estado
  Nuevo/Igual/Ya existe, «Ver diferencia» con `difHTML`, «Reemplazar»). `docsDir()` es `""` en un proyecto vinculado.
  Cambios del código desde la última versión: por fecha (`cambios_vinculado`), porque son dos repos. **«Código» en el lateral
  muestra TODOS los archivos del código** (orden `arbol`: `[[ruta, tamaño, clase]]` con clase `c` código, `f` configuración, `d`
  documento, `i` imagen, `t` datos, `m` audio o video, `s` secreto, `o` otro; más `perfil` y `lecturas`), carpetas primero, con ícono
  por clase, una marca para «leído», otra para «cambió desde que la IA lo leyó» y una animación para «leyendo ahora». Solo los
  `.md`/`.mmd` se abren (con el prefijo `@codigo/` en uno vinculado, por `codigo_leer`/`codigo_guardar`); los demás muestran una
  **ficha** (panel `ficha`: ruta, tipo, tamaño, si la IA lo leyó y cuándo, qué elementos lo usan por `elementos[].codigo` y qué
  documentos lo nombran), **nunca su contenido**. El árbol se arma una vez por `arbol` (y cuando cambia `E.archivos`) y solo pinta
  carpetas abiertas (`#c:<ruta>` en `E.abiertas`); un evento de progreso solo toca la fila que cambió (`marcarLectura`).
- **Los de antes (`docs/esquema/` dentro del repo)** siguen funcionando igual y muestran «Moverla aparte».
- **Carpeta (los de antes):** `docs/esquema/` por defecto (se elige al documentar: relativa, sin `..` ni carpetas ocultas, hasta 4 niveles). Adentro,
  Markdown y diagramas que GitHub muestra tal cual: `README.md` (visión general; GitHub lo muestra al abrir la carpeta),
  `arquitectura.md`, `flujos/<nombre>.md`, lo que la persona agregue, y dos archivos de Esquema:
  - `esquema.json` (formato abierto, versionado con la documentación; claves en este orden para diffs chicos):
    ```json
    {"formato": 1, "nombre": "Minuta", "descripcion": "…",
     "tipo": "software",
     "documentos": [{"ruta": "flujos/grabar.md", "titulo": "Grabar una reunión", "tipo": "vision|arquitectura|flujo|glosario|historia|libro|capitulo|documento|fuente|estudio|revision|otro"}],
     "elementos": [{"id": "boton-grabar", "tipo": "pantalla|boton|accion|servicio|modulo|dato|actor|personaje|concepto|lugar|otro", "nombre": "Grabar",
                    "descripcion": "…", "codigo": ["Sources/Grabar.swift"]}],
     "fuentes": {"leido": "2026-10-28", "archivos": ["README.md", "AGENTS.md"]}}
    ```
    `tipo` es el id de un tipo de proyecto (sin él, `software`). `documentos[].ruta` es relativa a la carpeta de docs (`.md`/`.mmd`, hasta dos subcarpetas; en `fuentes/` también el original: `.pdf`, `.docx`, `.odt`, `.epub`, `.txt`, `.html`); `id` de un elemento: minúsculas,
    números y guiones (`M.ID_ELEMENTO`), estable; `codigo`: rutas del repo (relativas, sin `..`). Se valida igual en
    `bin/proyecto.py` (`validar_esquema`) y en `ui/motor/proyecto.js` (`M.validarEsquema`), con los casos `proyecto_esquema` y
    `proyecto_elemento` de `pruebas/casos.json`. Lo desconocido no se guarda.
  - `elementos.md` (el glosario): lo escribe Esquema desde `esquema.json` (`M.glosario`), un ancla invisible por elemento
    (`<a id="el-boton-grabar"></a>` antes de su `### Nombre`). No se edita a mano.
- **Referencias (todo conectado, sin ensuciar lo que se lee en GitHub):**
  - En un diagrama, la línea de Esquema dice qué nodo o participante es cada elemento: `%% esquema: {"refs": {"G": "boton-grabar"}}`
    (`M.leerMeta`/`M.escribirMeta` la conservan; borrar un nodo o participante quita su ref).
  - En el texto, un enlace normal al glosario: `[Grabar](elementos.md#el-boton-grabar)` (con `../` desde una subcarpeta,
    `M.enlaceElemento`). En GitHub es un enlace que lleva a la ficha; Esquema lo reconoce por `elementos.md#el-<id>` (fuera de los
    bloques de código) y en la vista del documento abre la ficha del elemento.
- **Versiones:** con git, «Guardar versión» hace `git add -A -- <docs>` y `git commit --only -- <docs>`: entra **solo** la carpeta de
  docs; lo que la persona tenga preparado de otros archivos queda igual. Nunca empuja. Sin hooks (`core.hooksPath` a /dev/null,
  `--no-verify`), sin `core.fsmonitor`, sin preguntar por la terminal (`GIT_TERMINAL_PROMPT=0`) y sin variables `GIT_*` heredadas;
  si git no tiene nombre configurado, ese commit va a nombre de «Esquema». La historia es `git log -- <docs>`; ver una versión,
  `git ls-tree`/`git show <id>:./<ruta>` (ids hexadecimales, nada más). Sin git (o en un Mac sin las herramientas de desarrollo, para
  no abrir el diálogo de instalarlas): copias comprimidas en `<docs>/.versiones/AAAAMMDDTHHMMSSmmm-xxxx.json.gz` (`{formato, fecha,
  mensaje, archivos: {ruta: texto}}`), hasta 100. Restaurar escribe los archivos de esa versión encima (no borra nada: lo que no
  estaba queda y se avisa) y guarda una versión nueva «Restauré la versión del …».
- **Cambios del código:** al abrir un proyecto con git, los commits que tocaron algo fuera de `<docs>` desde el último commit de
  `<docs>` (`cambios_codigo`). `M.docsAfectados` cruza sus archivos con `codigo` de cada elemento y sus mensajes con los nombres.

## Trabajos (lo largo, en segundo plano y sin perder nada)
Lo que tarda minutos (documentar un proyecto entero) **no** es una llamada gigante con un diálogo de espera: es un **trabajo**
(`bin/trabajos.py`) que corre por etapas, deja todo en disco a medida que avanza y cuenta cómo va. Encima corren
«Documentar», las historias de usuario, los libros, el material de estudio y la revisión de incongruencias.
- **Estado** en `<carpeta de Esquema>/trabajos/<id>.json` (id `AAAAMMDDTHHMMSS-xxxxxx`; hasta 40): `{formato, id, tipo, proyecto
  (la carpeta abierta, absoluta), estado, etapa, etapas, hechas, inicio, fin, latido, datos (lo propio del tipo), items: [{ruta,
  titulo, tipo, estado: cola | escribiendo | listo | fallo | quitado, error?, nuevo}], leidos, leyendo, vistos, publico}`. Se
  escribe de una vez en cada cambio. `vista()` es lo que ve la interfaz (sin `datos`, con `publico` aplanado: `ia`, `tipo_proyecto`,
  `archivos`, `partes`, `resumen`, `aviso`, `version`, `visto`).
- **Estados:** `corriendo` → `listo` | `con-fallas` (alguno falló: «Reintentar») | `detenido` | `error` | `esperando` (preguntó algo
  a la persona: ver «Trabajos que preguntan»). Un `corriendo` sin
  **latido** (cada 5 s) por más de 45 s es `interrumpido` (se cerró la app): «Seguir donde quedó» (`documentar {seguir: id}`)
  retoma; lo hecho no se repite y lo que quedó «escribiendo» vuelve a la cola.
- **Progreso:** la app corre la orden con `ESQUEMA_PROGRESO=<archivo temporal>`; el script agrega líneas JSON (`trabajos.emitir`):
  `{t: "estado", trabajo: vista}` en cada cambio, `{t: "lee", id, ruta, n}` por cada archivo que lee la IA (relativo al código) y
  `{t: "busca", id, patron}`. Mac (`LectorProgreso` en `Servicios.swift`) y Windows/Linux (`lectorProgreso` en `servicios.js`) leen
  las líneas nuevas cada 0,5 s y llaman `window.Esquema.proyectoProgreso({eventos})`. Solo las órdenes de `ordenesConProgreso`
  (Swift) / `ORDENES_CON_PROGRESO` (main.js) lo reciben. La respuesta final llega como siempre (`proyectoRespuesta {trabajo}`).
  Si la ventana se cerró y se vuelve a abrir, la interfaz pide `trabajo` (el último del proyecto) y, mientras corra sin eventos,
  vuelve a preguntar cada 6 s.
- **La IA en vivo** (`ia_vivo.preguntar_vivo`, en `bin/ia_vivo.py`, propio de Esquema sobre la pieza «ia»: arma el comando con las
  mismas protecciones que `ia.ejecutar` —carpeta temporal, sin MCP ni memoria, solo leer, `--tools`, `--setting-sources user`, pide
  actualizar si falta una protección— y usa sus funciones; `bin/ia.py` no se toca): Claude con `--output-format stream-json
  --verbose` (`_evento_claude`: `tool_use` Read → `lee`, Glob/Grep → `busca`; la línea `{"type": "result"}` trae la respuesta y
  `is_error`); Codex con `exec --json` si `codex exec --help` lo conoce (`_evento_codex`: de un comando de lectura se deduce el
  archivo); Gemini/agy, solo etapas. `detener()` corta el proceso. Los errores tienen la forma de la pieza (`{codigo, plantilla,
  valores}`; `demora`, `sin_respuesta`… y el propio `detenido`, que no es una falla: `ia_vivo.detenido(error)`); `t.terminar` y
  `t.poner_item` guardan su frase en `error` y el error entero en `error_ia`, y la interfaz lo traduce con su plantilla
  (`errorTrabajo` en `proyectos.js`). `ia.preguntar` sigue para todo lo demás.
- **Detener:** `detener {id}` deja `trabajos/<id>.detener`; el trabajo lo ve, corta la IA y queda `detenido` (con una versión de
  lo que alcanzó). En la interfaz, «Detener» con confirmación; **Escape o tocar fuera nunca cancelan un trabajo**.
- **Documentar** (`bin/documentar.py`, órdenes `documentar`, `trabajo`, `detener`, `quitar` de `proyecto.py`):
  1. `inventario` (sin IA): `inventario.inventario` → `perfil` (tipo `app | biblioteca | sitio | monorepo | escritos | mezcla`, partes).
  2. `explorar`: la IA lee (como la revisión a fondo, con un tope orientativo de archivos según el tamaño) y devuelve **solo un plan**
     en JSON (`FORMATO_PLAN`: tipo, resumen, componentes, elementos, documentos con `ruta, titulo, tipo, que, archivos`).
     `validar_plan` lo limpia y **ordena**: nombres en minúsculas con guiones, `README.md` para la visión, `arquitectura.md`, los
     flujos en `flujos/`, cada parte en `componentes/`, nunca `elementos.md`; `orden_doc` (visión, arquitectura, raíz, componentes,
     flujos, secciones, diagramas; igual que `ordenDocs` en la interfaz). Si no sirve, `plan_por_defecto` con el inventario.
  3. `escribir`: un documento por llamada (`prompt_documento`, sin herramientas, con sus archivos clave), **2 a la vez**. Cada uno se
     escribe al tiro en la carpeta de la documentación (antes, lo que había queda en `trabajos/<id>.antes.json`) y `esquema.json` y
     `elementos.md` se ponen al día. Uno que falla queda `fallo` con «Reintentar» (`documentar {reintentar: id, ruta}`; si el
     trabajo sigue corriendo, va a `trabajos/<id>.reintentar` y entra a la cola).
  4. `cerrar`: `esquema.json`, el glosario y **una** versión «Documentación hecha con <IA>».
  `quitar {id, ruta}` («Quitar este cambio» de un documento listo): lo vuelve a como estaba antes del trabajo, o lo borra (y lo saca
  de `esquema.json`) si era nuevo, y guarda otra versión. Tiempos: explorar 20 min, cada documento 8 min.
- **Agregar un tipo de trabajo nuevo** (p. ej. «Historias de usuario»): (1) un módulo en `bin/` con sus `ETAPAS` y una función
  `correr(e, t)` que avanza con `t.etapa(nombre)`, `t.poner_item(ruta, titulo=…, estado=…)`, `t.leyo(ruta)`, `t.detenido()` y
  termina con `t.terminar(estado, error)` (escribe en disco en cada paso; lo que la persona puede deshacer, como `.antes.json`);
  (2) sus órdenes en `ORDENES` de `proyecto.py` (y en `Ventana.ordenesProyecto` y `ORDENES_PROYECTO`; las que corren largo, también
  en `ordenesConProgreso` / `ORDENES_CON_PROGRESO`); (3) en la interfaz, el mismo `trabajoHTML` muestra etapas e ítems: agrega el
  nombre de sus etapas a `NOMBRE_ETAPA` y, si el trabajo **pregunta algo** a la persona, usa
  `t.esperar(preguntas)` (ver «Trabajos que preguntan»);
  (4) su simulación en `simularTrabajo` y pruebas en `test_python.py` (clase `Documentar` como modelo) e `interfaz.mjs`.

### Trabajos que preguntan (`esperando`)
- `t.esperar(preguntas, **publico)` deja el trabajo `esperando` con `publico.preguntas` (`trabajos.limpiar_preguntas`: hasta 5, cada
  una `{id, texto, por_que?, opciones?: [hasta 5]}`) y **termina el proceso**: todo queda en disco y nada corre mientras se espera. La
  persona responde cuando quiera, aunque cierre la app: orden `responder {id, respuestas}` (`limpiar_respuestas`; cada respuesta es
  un texto, «No sé todavía» o «Saltar») → `t.seguir()` y el trabajo vuelve a correr desde donde quedó. `continuar {id, descartar}`
  deja de esperar. `abrir` devuelve `esperan` (los trabajos `esperando` del proyecto: un punto en el lateral y una fila «espera N
  respuestas» en el panel). `limpiar_viejos` nunca borra uno que espera.
- En la interfaz, **una pregunta a la vez** (`E.panel = "preguntas"`): opciones con número (teclas 1–5), «Otra respuesta» (Enter
  para seguir), «No sé todavía», «Saltar», «Responder después» (vuelve al panel; las preguntas siguen ahí).

## Tipos de proyecto (`tipos/`)
Un proyecto es de un tipo: **Software** (el código en una carpeta aparte, que se lee y nunca se toca) o **Libro** (un texto largo,
sin carpeta de código). El tipo va en `esquema.json` (`tipo`) y en `proyectos.json`; sin él, `software`.
- **Formato** (`tipos/<id>.json`, validado igual en `bin/tipos.py` (`validar`) y en `ui/motor/proyecto.js` (`M.validarTipo`), con los
  casos `tipos` de `pruebas/casos.json`):
  ```json
  {"formato": 1, "id": "libro", "icono": "libro", "nombre": {"es": "Libro", "en": "Book"}, "descripcion": {"es": "…", "en": "…"},
   "fuente": "carpeta | texto", "elementos": ["personaje", "concepto", "lugar", "otro"],
   "secciones": [{"id": "capitulos", "nombre": {"es": "Capítulos", "en": "Chapters"}, "icono": "doc", "carpetas": ["capitulos"], "tipos": ["capitulo"]},
                 {"id": "elementos", "nombre": {…}}, {"id": "versiones", "nombre": {…}}],
   "falta": ["capitulos", "resumenes", …], "acciones": ["estudiar", …], "nuevo": ["incorporar", "documento", "diagrama", "agregar"], "agregar": ["incorporar", "documento"]}
  ```
  `fuente`: de dónde sale lo que se documenta (`carpeta`: una carpeta de código, con «Código» en el lateral; `texto`: lo que se
  agrega). `secciones`: cómo se agrupan los documentos en el panel (por carpeta y/o por tipo de documento; la primera que calza gana;
  `elementos` y `versiones` son especiales). `icono`, de `tipos.ICONOS`. `falta`, `acciones`, `nuevo` y `agregar` solo aceptan ids
  que Esquema sabe hacer (`tipos.FALTA`, `ACCIONES`, `NUEVO`, `AGREGAR`): un tipo **ordena y elige**, no agrega código.
- **Agregar un tipo:** (1) `tipos/<id>.json` con ese formato (`python3 bin/tipos.py validar` lo revisa); (2) `nombre` y
  `descripcion` ya vienen en los dos idiomas; (3) si necesita algo nuevo (una acción, un «Lo que falta», un tipo de elemento),
  primero se agrega a Esquema (`tipos.py`, `M.validarTipo`, `loQueFalta`/`accionesHTML` en `proyectos.js`) con sus pruebas; (4) un
  caso en `pruebas/casos.json → tipos`. `estado.py` manda la lista a la interfaz (`E.tipos`); la demo, `demo.json → tipos`
  (`herramientas/generar_demo.py`). Las apps empaquetan `tipos/` junto a `bin/`, `ui/` y `plantillas/`.
- **«Agregar proyecto»** (global, en la cabecera «Proyectos» del lateral) pregunta primero el tipo: Software elige la carpeta del
  código; Libro pide el archivo o el texto (o, si la carpeta abierta tiene escritos, `crear {desde_carpeta}` la toma).
  **«Nuevo en <proyecto>»** (en la fila del proyecto y arriba del panel) es lo del proyecto abierto.

## Agregar al proyecto (`bin/agregar.py`, `bin/contenido.py`)
- «Agregar» (pegar texto, un enlace, elegir o soltar archivos) → `detectar` (lee y adivina; guarda aparte en `entradas/<token>/`,
  **nada en el proyecto**) → la persona ve el tipo propuesto con sus razones y puede cambiarlo → `agregar {token, tipo}`. El
  original queda en `fuentes/` tal cual (y su texto en `fuentes/<nombre>.md`); el tipo decide el trabajo: **Historia de usuario**
  (`historia`), **Documento** (`documento`) o, en un proyecto Software, un **libro** grande: se sugiere «Crear un proyecto Libro»
  y, si se agrega igual, queda como documento de referencia en `documentos/`.
- `contenido.extraer` lee solo con la biblioteca estándar (PDF: texto de flujos sin comprimir o Flate; uno escaneado no se puede y
  se dice); `detectar` da `{tipo, razones, titulo}` por señales (Como/Quiero/Para, criterios, ids HU/Jira/#n, capítulos, tamaño).
  Un enlace solo (`solo_enlace`) se guarda como enlace del ticket: **Esquema no lo abre**. La vista previa del diálogo lee solo
  `.md`/`.txt` en la interfaz; lo demás lo lee Python.

## Agregar información (`bin/incorporar.py`, trabajo `incorporar`)
- **Qué es:** notas, un correo, lo que salió de una reunión… sin clasificar. Tu IA lo **reparte** en la documentación. Se distingue
  de «Agregar un documento» (`p-agregar-algo`, que guarda el texto entero como un documento propio, con su resumen): en el panel
  está «Agregar información» (`p-incorporar`, ícono `bandeja`) y en «Nuevo en <proyecto>» las dos. Entra por la misma orden
  `agregar {token, tipo: "incorporar"}` (sin orden nueva en el puente ni en las apps); en el diálogo no hay paso «¿Qué es?».
- **Etapas:** `leer` (sin IA: índice, elementos, las `secciones` del tipo de proyecto y hasta 8 documentos que se parecen a la
  información, por palabras en común) → `ordenar` (la IA responde `PLAN` (JSON: `accion` crear | completar | modificar, `ruta`,
  `titulo`, `tipo`, `porque`, `cita`), un `ARCHIVO` completo por cambio, `ELEMENTOS`, `SIN_LUGAR`, `PREGUNTAS`, `NOTA`) →
  `preguntas` (si no sabe dónde va algo, pregunta y no manda plan: `t.esperar`, hasta 2 rondas; `responder` → `seguir`) → `plan`.
- **Lo que revisa Esquema** (`plan()`): nada en `fuentes/` ni `elementos.md`; `crear` sobre algo que existe y `completar` se
  recalculan con `solo_agrega` (si quita o reordena una línea, es `modificar`); un documento que existe conserva su título y tipo;
  una historia conserva su encabezado (solo cambia `actualizada`) y una HU nueva no se crea aquí; la cita se busca en la
  información (`cita_exacta`); `SIN_LUGAR` (o, si no salió nada, la información entera) va a `notas/<fecha>.md` (se completa si
  ya existe). **Nada se escribe**: el plan queda en `datos.propuestas` (`{tarea: "incorporar", propuestas, elementos, nota,
  descartados}`) y vuelve con la respuesta de `agregar`/`responder` (y con `trabajo {id, propuestas: true}`). El original va a
  `fuentes/` y a `esquema.json` al empezar, como en «Agregar».
- **Revisión** (`incorporarHTML` en `proyectos.js`, panel `propuestas`): se abre sola si la persona está en el panel del proyecto
  (si no, un aviso con «Revisar»). Agrupada: **Nuevo** / **Se completa** / **Se modifica**, cada cambio con su porqué y su cita
  (marcada si no está tal cual). Lo que se modifica se muestra abierto con antes y después y **no se guarda hasta «Aplicar este
  cambio»** (`confirmar`/`confirmada`); lo demás tiene «Quitar este cambio». Guardar es `aplicarPropuestas`: una versión
  «Información incorporada con <IA>» y cada documento que existía queda en `cambiosIA` con «Quitar este cambio».
- Pruebas: `test_python.py → Incorporar` (`IA_FALSA_MODO=incorporar-pregunta`), `interfaz.mjs` sección 17; demo:
  `ejemplos/agregar/<idioma>/informacion.md` y `ia-simulada/<idioma>/agregar.json → incorporar` (`planSim`).

## Historias de usuario (`bin/historias.py`)
- `historias/<id>-<nombre>.md` con encabezado YAML (`estado`, `id`, `creada`, `actualizada`, `rama?`, `desde?`, `commit?`,
  `enlace?`). Estados: **Por entender** (`por-entender`) → **Lista para desarrollar** (`lista`) → **En desarrollo**
  (`en-desarrollo`: guarda `desde` y el `commit` del código en ese momento) → **Terminada** (`terminada`). Se cambian en la barra
  del documento (`barraDocHTML`, orden `historia_estado`) y se ven como un punto en el lateral (`hu-punto[data-estado]`). La rama
  solo se escribe a mano en el encabezado.
- El trabajo `historia`: la IA lee la HU y el contexto (nunca programa: `asistente.NO_PROGRAMAR`) y responde en bloques
  (`TIPO`/`TITULO`/`DOCUMENTO`/`PREGUNTAS`); si pregunta, el trabajo espera (hasta 3 rondas). «Preguntas abiertas», «Decisiones»
  (cada respuesta con su fecha) y «Cómo quedó» las escribe Esquema.
- **«Terminé el desarrollo»** (`historia_cierre`): los commits desde `desde` (su diferencia, acotada a 60 KB y 12 archivos), «Cómo
  quedó» en la HU, estado `terminada` y **propuestas** para los demás documentos (el flujo de propuestas de siempre; nunca sobre
  `historias/`). El panel avisa cuántos commits tiene una HU en desarrollo.

## Libros (`bin/libros.py`)
Un proyecto Libro vive en `~/Esquema/<titulo>/` sin carpeta de código (`sola` en `proyectos.json`; `lugares` da `codigo: None` y
todo lo que lee código se salta). `crear` importa el original, lo parte en capítulos (`contenido.partir_capitulos`: «Capítulo N» /
«Chapter N», títulos Markdown o por tamaño; el índice se salta) y **pregunta sin IA** para qué es y qué tan a fondo (preguntas
fijas, `PREGUNTAS_LIBRO`); con eso resume cada capítulo (2 a la vez, cada uno al disco al terminar) y cierra con `README.md`,
`mapa.md` y `linea-de-tiempo.md`. Personajes, conceptos y lugares son elementos (glosario). Acciones: **Material de estudio**
(`estudiar`: esquema, preguntas con respuesta y tarjetas por capítulo) y **Revisar incongruencias** (`incongruencias`: hechos por
capítulo → comparar → `incongruencias.md` con cada hallazgo, la cita y dónde está; cada cita se busca en el texto y se marca si no
está tal cual).

## Borrar (`borrar`, `recuperar`, `papelera`)
- Lo que creó Esquema (documentos, diagramas, HU, capítulos, originales de `fuentes/`) se borra desde el lateral (clic derecho o
  tecla Supr) o desde la barra del documento abierto (ícono de papelera), con una confirmación que dice qué pasa. `borrar {ruta}`
  guarda una copia en `<carpeta de Esquema>/proyectos/<id>/borrados/` (hasta 30), lo saca de `esquema.json`, deja como texto los
  enlaces que apuntaban ahí, descarta las preguntas de una HU que esperaba y guarda una versión. El aviso trae **«Deshacer»**
  (`recuperar {id}`: vuelven el archivo, su entrada y los enlaces, con otra versión). `esquema.json` y `elementos.md` no se borran.
- **Con `borrar` nunca se toca la carpeta del código.** Un `.md`/`.mmd` de la carpeta abierta que no es de una documentación de
  Esquema (un proyecto «de antes» o una carpeta suelta) va a la **papelera del sistema** con la acción del puente `papelera {ruta}`
  (`FileManager.trashItem` en el Mac, `shell.trashItem` en Windows/Linux) → `enPapelera`, y se recupera desde ahí. En un proyecto
  vinculado, «Código» nunca ofrece borrar.

## Wiki de GitHub (`bin/wiki.py`)
- `wiki_preparar`: la URL sale del `origin` del código (o la que escribe la persona, guardada como `wiki` en `proyectos.json`; solo
  `https://github.com/…` o `git@github.com:…`) → `derivar` → `<repo>.wiki.git`; clona o pone al día en `<carpeta de
  Esquema>/wikis/<id>/` y devuelve cada página `nueva | cambia | igual` y las **de la persona**. Si la wiki no existe, `NO_EXISTE`
  explica cómo crearla en GitHub.
- Transformación: `README.md` → `Home.md`, cada documento → una página con nombre plano por su título, enlaces sin `.md`, los
  elementos a la página «Elementos», el encabezado de una HU como una línea legible, Mermaid tal cual, `_Sidebar.md` con el orden
  del proyecto; `fuentes/` no se publica. Cada página lleva `MARCA` (un comentario HTML): **una página sin la marca es de la persona
  y nunca se pisa ni se borra**; una con la marca que ya no corresponde se quita.
- `wiki_publicar`: commit y `push` con el git y las credenciales de la persona (sin preguntar por la terminal). Se ofrece en el panel
  y después de guardar una versión. Pruebas: `test_python.py → Wiki`, con una wiki falsa en un repo git local.

## Subconjunto de Mermaid
Lo que Esquema lee, dibuja y escribe (probado en `pruebas/compat/` contra Mermaid real con `herramientas/comparar_mermaid.mjs`):

**Flujo** (`flowchart` o `graph` + `TD`/`TB`/`BT`/`LR`/`RL`)
- Nodos: `A[rect]`, `A(redondeado)`, `A([estadio])`, `A[[subrutina]]`, `A[(cilindro)]`, `A((círculo))`, `A(((doble círculo)))`,
  `A>asimétrico]`, `A{rombo}`, `A{{hexágono}}`, `A[/paralelogramo/]`, `A[\paralelogramo\]`, `A[/trapecio\]`, `A[\trapecio/]`; texto
  entre comillas para signos (`A["Con (paréntesis)"]`), entidades `#quot;`/`#35;`, `<br>` para saltos. Sintaxis nueva
  `A@{ shape: cyl, label: "…" }` con las formas de `ARROBA` en `flujo.js` (incluye `doc`, `cloud`, `h-cyl`, `sm-circ`, `fr-circ`).
- Flechas: `-->`, `---`, `-.->`, `-.-`, `==>`, `===`, `~~~`, `--o`, `--x`, `<-->`, `o--o`, `x--x`, más largas (`--->`, `-..->`), con
  texto `-->|texto|` o `-- texto -->` (`-. texto .->`, `== texto ==>`). Cadenas `A --> B --> C` y grupos `A & B --> C & D`.
- `subgraph id [Título]` / `subgraph Título` / `subgraph "Título"` … `end`, anidados, con `direction` propia; flechas a un subgrafo.
- `classDef`, `class`, `:::clase`, `style`, `linkStyle` (solo `fill`, `stroke`, `stroke-width`, `stroke-dasharray`, `color`,
  `font-weight`, `font-style`, `opacity`, sin `url()`), comentarios `%%`, front matter `---\ntitle: …\n---`, `accTitle`.
- Se conservan en el texto pero no se ejecutan: `click`, `%%{init}%%` (aviso amable).
**Secuencia** (`sequenceDiagram`)
- `participant A`, `participant A as Nombre`, `actor A as Nombre`, `autonumber`, `title`.
- Mensajes `->`, `-->`, `->>`, `-->>`, `-x`, `--x`, `-)`, `--)`, `<<->>`, `<<-->>`, con `+`/`-` para activar/desactivar;
  `activate`/`deactivate`.
- `Note left of|right of|over A[,B]: texto`; bloques `loop`, `alt`/`else`, `opt`, `par`/`and`, `critical`/`option`, `break`,
  `rect <color>` … `end`. Texto con `#59;` para `;`.
- Se conservan pero aún no se dibujan: `box`, `create`, `destroy`, `link(s)`, `properties`, `details` (aviso).
**Otros tipos de Mermaid** (`classDiagram`, `stateDiagram`, `erDiagram`, `gantt`, `mindmap`, `pie`…): se reconocen, se dejan tal
cual y la vista avisa «Esquema todavía no dibuja X; GitHub sí». Ver «Lo que viene».

**Errores claros:** cada problema es `{linea, columna, plantilla, valores, sugerencia}` (`M.problema`). La frase está en español con
marcadores y la interfaz la traduce entera (`ui/idiomas`); `pruebas/motor.mjs` exige la traducción de cada frase del motor. Con un
error, el lienzo sigue mostrando el último dibujo bueno (atenuado) y la línea queda marcada; una sentencia mala no tumba a las demás.

## Cómo funciona el motor
- **Leer conservando el texto:** el modelo guarda dónde está cada cosa (línea y columnas de cada etiqueta, cada nodo y cada flecha,
  y las sentencias de cada línea, incluidos comentarios). `serializarFlujo`/`serializarSecuencia` dan la forma canónica (respetan el
  texto crudo de las etiquetas y la palabra `graph`/`flowchart`): **escribir(leer(x)) === x** para los ejemplos de `pruebas/compat/`.
- **Editar** (cada función recibe el texto y devuelve el texto nuevo; casos en `pruebas/casos.json`): `renombrarNodo` (solo el
  contenido de la etiqueta; agrega comillas si hace falta), `cambiarForma` (+ ícono en `%% esquema`), `agregarNodo`, `conectar`,
  `conectarNuevo`, `borrarNodo` (rehace solo las sentencias que lo nombran; una cadena rota queda en líneas separadas), `borrarArista`
  (con `A & B --> C`, escribe cada flecha por separado menos la borrada), `renombrarArista`, `fijar`/`desfijar`, `estiloAristas`,
  `cambiarDireccion` (suelta lo fijado); en secuencia `renombrarParticipante`, `cambiarTextoEvento`, `borrarLinea`, `agregarMensaje`,
  `agregarParticipante`; en documentos `bloquesMermaid`, `reemplazarBloque`, `insertarBloque`.
- **Acomodo** (`capas.js`): ciclos (DFS en el orden escrito; lo que vuelve se da vuelta), capas (camino más largo; las fuentes bajan
  junto a su destino), puntos de paso para flechas largas y para **etiquetas** (si hay etiquetas, cada flecha ocupa dos capas y la
  etiqueta es un punto de paso con su tamaño: nunca pisa un nodo), orden por baricentro hacia abajo y hacia arriba + trasposiciones
  (grafos chicos), cruces contados con Fenwick, y coordenadas con **regresión isotónica** (cada vértice lo más cerca de sus vecinos sin
  solaparse, óptimo para un orden fijo; los tramos entre puntos de paso pesan más para que las flechas largas queden rectas).
- **Subgrafos:** cada grupo se acomoda por dentro (con su propia dirección) y afuera es un solo bloque, así nunca se solapan. Una
  flecha que sale o entra de un grupo usa un **puerto** que el grupo reserva en su borde (`extremo: "fin" | "inicio"`), y por dentro
  esquiva a los demás nodos.
- **Dibujar:** las flechas salen y llegan al borde de la forma (`medioAlto`), repartidas a lo largo del lado; curva B-spline con un
  tramo recto en cada punta (o recta, u ortogonal con esquinas redondeadas). Lo fijado a mano gana; sus flechas van directas y los
  grupos crecen para abrazarlo.
- **Incremental:** medir texto tiene caché; el acomodo se guarda con una clave de todo lo que cambia posiciones (`_cacheAcomodo`): si
  solo cambia un texto que no cambia tamaños, o se mueve un nodo, no se vuelve a acomodar (`M.estadisticas`). El SVG sale en partes con
  clave (`g:` grupos, `a:` flechas, `n:` nodos, `e:` etiquetas, `p:`/`m:`/`n:`/`b:` en secuencias) y la interfaz reemplaza solo las
  que cambiaron.
- **Rendimiento** (Chromium, Mermaid 12.2.0, `herramientas/comparar_mermaid.mjs`): ver la tabla del README. Si tocas el acomodo,
  vuelve a medir y actualiza la tabla.

## Interfaz
- Estado `E` + `pintar()` (pantalla entera, conserva cursor y scroll) y `refrescar()` (solo lo que depende del texto: lienzo,
  números de línea, problemas, vista del documento). Escribir nunca vuelve a armar la pantalla.
- **Texto es la fuente de verdad:** `cambiarTexto(nuevo, {origen, agrupar})` guarda para deshacer (agrupa lo escrito seguido),
  programa el guardado (`guardarArchivo`, 650 ms) y refresca. Deshacer/rehacer (⌘Z, ⇧⌘Z) por archivo, también lo del lienzo y la IA.
- **Lienzo** (`#lienzo`): `textoLienzo()`/`ponerTextoLienzo()` (el `.mmd` entero o el bloque `E.bloque` del `.md`). Gestos con puntero
  (mouse, toque, lápiz): elegir, mover (fija al soltar; mientras arrastra solo se dibuja, sin tocar el texto), conectar arrastrando
  desde el asa (soltar en vacío crea un nodo conectado), arrastrar de un participante a otro (mensaje nuevo donde se suelta), desplazar,
  pellizcar, rueda (+ ⌘/Ctrl para zoom). Doble clic: renombrar en el lugar o crear. Teclado: flechas para moverse entre nodos, Enter/F2
  renombrar, Supr borrar, N nodo nuevo, +/−/0 zoom. Barra del elegido (Renombrar, Forma, Soltar, Borrar), minimapa opcional. Con
  errores, el último dibujo bueno atenuado. Lo recién creado queda a la vista.
- **Formas** (menú): básicas, arquitectura (forma clásica + ícono en `%% esquema`) y procesos (BPMN básico). Íconos propios de 16 px.
- **Autocompletar** (fila de sugerencias, Tab): palabras clave, nombres de nodos y participantes, flechas después de un nodo, formas
  para un nodo nuevo; en un `.md`, dentro de los bloques mermaid.
- **Documento:** texto | vista con los diagramas dibujados (`resultadoBloque` con caché); «Editar» abre el bloque en el lienzo en el
  lugar (el texto sigue siendo el del documento); los enlaces nunca navegan (https → navegador; relativos → abre ese archivo).
- **Lateral de un proyecto** (`P.lateralHTML`: toda carpeta abierta se ve como proyecto): «Proyectos» con una carpeta por proyecto; el
  abierto trae **Código** (los `.md`/`.mmd` del repo: `E.codigoDocs` en uno vinculado, o lo que queda fuera de `docsDir()` en uno de
  antes; todo, si aún no tiene documentación) y **Documentación** (Elementos, Versiones y sus documentos). Tocar «Documentación»
  (`data-p-docs`) abre su panel: vacía (`P.sinDocumentacion()`), el inicio de la carpeta con «Hacer la documentación completa»; con algo, **Lo que falta** (`loQueFalta`: visión, arquitectura, flujos,
  elementos, elementos que ningún documento nombra y commits nuevos, según el **tipo de proyecto** del inventario: escritos →
  «Cómo se organiza» sin arquitectura ni flujos; biblioteca → «Cómo se usa»; sitio → «Páginas y publicación»; monorepo → «Cada
  parte», un `componentes/<nombre>.md` por parte) con «Completar lo que falta» (tarea `completar`, con el pedido
  armado por `pedidoCompletar`: la IA escribe solo lo que falta). Claves de `E.abiertas`: `#p`, `#codigo`, `#docs`.
- **Lateral e inicio:** la carpeta como árbol (`arbolDe`/`arbolHTML`; `E.abiertas` guarda lo que la persona abrió o cerró y, si no
  tocó nada, `arbolAbierta` abre todo con ≤ 20 archivos, la carpeta del archivo abierto y la de la documentación). Una carpeta recién
  elegida abre en su **Inicio** (`inicioHTML`, también arriba del panel de un proyecto): «Crear diagrama» (`crear-diagrama`),
  «Documentación completa» (`p-documentar`: sin proyecto, «Lo que encontré»; con proyecto, la IA la vuelve a escribir y se revisa
  como propuestas), «Documentar un flujo» (`p-flujo`) y «Escribir un documento» (`nuevo`).
- **Pedidos sobre «este proyecto»** (`hablaDelProyecto`: «este proyecto», «la app», «el repo», «mi código»…) marcan «Que lea el
  código» en «Dibújame» y «Crear diagrama» mientras se escribe (si la persona no lo tocó a mano); con eso van por la tarea `flujo` de
  proyectos (ver lo que se envía, la IA puede pedir archivos) y no por `dibujar`, que solo manda el pedido.
- **Tipo de diagrama por cómo se pide:** `tipoDelPedido` («el flujo de…» → flujo, «la secuencia de…» → secuencia, «la arquitectura
  de…» → arquitectura; marca el tipo mientras se escribe si la persona no lo eligió a mano) va en `dibujar` y en la tarea `flujo` de
  `proyecto`; en Python, `asistente.tipo_diagrama` arma la misma frase para los dos prompts («auto»: la IA lo deduce con esa regla).
- **IA:** «Dibújame» (`dibujar` → `dibujoListo`): se valida con el motor; con errores no se aplica y se explica. Sin archivo abierto
  o desde «Crear diagrama» crea `diagramas/<nombre>.mmd` (`nombreDesde`: sin artículos ni preposiciones). «Crear diagrama» con «Que
  lea el código» va por la tarea `flujo` de proyectos con `forma: "diagrama"` (un documento corto en `<docs>/diagramas/`). Si el
  diálogo se cierra mientras la IA dibuja, la respuesta igual se aplica (`pendienteDibujo`); si ya no está abierto lo que iba a
  cambiar, queda en un archivo nuevo. Aplicado, queda en
  `E.cambiosIA` y en una tarjeta del lienzo con «Quitar este cambio» (si se editó después, pregunta; se puede deshacer). En la vista
  previa del navegador, `dibujoSimulado` arma un diagrama con las partes del pedido. **README para GitHub** (`crearReadme` →
  `readmeListo`): describe, «Ver lo que se envía» (`estructura`, la misma lista que verá la IA), vista previa con diagramas, «Pedir
  cambios», guardar (o reemplazar, queda como cambio de la IA).
- **Plantillas** (diálogo «Nuevo»): búsqueda, categorías, en blanco, README con IA; sin resultados → «Pídesela a tu IA».
  Nombre sugerido en el idioma elegido, validado (`validarNombre`: relativo, sin `..`, `.md`/`.mmd`, que no exista).
  **Comunidad** (mismo diálogo, `E.nuevo.fuente`): pide `catalogoPlantillas` → `catalogoListo` (vista previa dibujada por el motor;
  la interfaz vuelve a validar cada una con `validarPlantilla`); tocar una la descarga (`descargarPlantilla` → `plantillaDescargada`),
  queda en «Plantillas» y elegida. «¿Hiciste una buena?» abre el formulario de propuesta del catálogo.
- **Exportar:** SVG independiente (colores adentro, `M.svgCompleto` + `M.estiloSVG`), PNG (ese SVG en un canvas al doble, fondo
  blanco), Markdown con el bloque mermaid y «Copiar para GitHub».
- **Diseño:** base neutra, un color de acción (azul tinta `--acento`), rojo solo para errores, verde solo para «lista». Claro/oscuro
  (sistema o elegido; piezas «tema» y «componentes», ver «Piezas»). A 760 px o menos: lista de archivos como cajón, una vista a la vez (Texto | Dibujo), herramientas de 44 px,
  diálogos desde abajo. `pruebas/interfaz.mjs` revisa contraste AA, desborde a 390 px, CSP y textos sin traducir.
- **Archivo cambiado afuera** (`archivoCambiado`): sin cambios sin guardar se recarga solo (se puede deshacer); con cambios, diálogo
  «¿Con cuál versión te quedas?» («Usar la del disco» / «Quedarme con la mía», que se guarda encima). Si el texto es el mismo, nada.
- **Menús de la app** (`window.Esquema.menu({accion})`): guardar, deshacer, rehacer, acercar, alejar, ajustar, texto, ambos, dibujo,
  nuevo, ajustes. Nada antes del idioma; en la bienvenida no se abren otros diálogos.
- **Actualizaciones** (Ajustes → Actualizaciones, `ui.filaActualizacion` de la pieza «componentes»): buscar, «Hay una versión
  nueva» con sus notas, «Actualizar ahora» (guarda todo antes) y el avance «Paso n de 3» con su barra. Lo de la app llega como
  `{texto, valores, notas}` (pieza «actualizaciones») y se traduce al pintar; las notas del Release van tal cual. Un aviso corto la primera vez que el estado trae una versión nueva.
- **Lateral:** cabecera «Proyectos» con «Agregar» (un proyecto nuevo, global); en cada proyecto, «Nuevo en <proyecto>» (lo del
  proyecto; también arriba del panel), «Código» solo si el tipo tiene `fuente: "carpeta"`, ícono por tipo y un punto en lo que
  espera respuestas y en cada HU. El panel agrupa los documentos por las `secciones` del tipo y muestra hasta 4 tarjetas de acciones.
  No hay un «Nuevo» global.
- **Proyectos** (`ui/proyectos.js`, `E.proyecto`, `E.panel`, `E.pj`): «Agregar proyecto» → Software (o el vacío «Agregar
  proyecto») elige la carpeta del repo (`elegirCarpeta {proyecto: true}`) → `proyecto {orden: "abrir"}`; si no hay documentación,
  «Lo que encontré» (`leer`, sin IA: README, guías, lenguajes, carpetas, manifiestos, workflows, git, y el `perfil` del inventario) y la carpeta de docs. Todo
  pedido a la IA pasa primero por **lo que se envía** (`preparar`: la lista exacta de piezas con su texto y tamaño, y lo que no se
  manda y por qué). **Documentar todo** (`inicial`) y **Completar lo que falta** (`completar`) van por el trabajo «Documentar»
  (`TAREAS_TRABAJO`, ver «Trabajos»): una tarjeta en el panel (`trabajoHTML`), sin diálogo que bloquee. Lo demás → `generar` → **propuestas**: una tarjeta por documento (vista previa o antes/después) con «Quitar este cambio»,
  los elementos aparte; cada diagrama se valida con el motor (con errores no se agrega) y los enlaces/refs a elementos que no
  existen se quitan (`M.limpiarRefs`). «Guardar N cambios» escribe los documentos (los que ya existían quedan además en
  `E.cambiosIA`), `esquema.json` y el glosario, espera a que todo se guarde (`pj.espera`) y guarda **una** versión. Mientras
  `generar` espera, el diálogo dice que puede tardar varios minutos y tiene «Seguir usando Esquema»: Escape o tocar fuera solo lo
  esconden (`pj.generando.oculto`, un aviso en el panel), **nunca descartan la respuesta**; solo «Cancelar» lo hace. «Documentar un
  flujo»: la IA puede pedir archivos (`PIDE`); la persona elige cuáles y vuelve a ver lo que se envía. **Elementos**: lista por tipo
  con búsqueda, ficha con «Dónde se usa» (`M.usosElemento`), Renombrar / Cambiar descripción / Quitar con vista previa por archivo
  (`M.cambiarElemento`: nodos y participantes renombrados, enlaces, menciones sin enlace opcionales, al quitar «unir lo de antes con
  lo de después» o lo que queda suelto, frases que lo nombran) aplicado como una versión con «Deshacer este cambio», y «Cambió cómo
  funciona» (la IA propone el cambio en cada documento que lo usa: tarea `cambio`). En el lienzo, un nodo enlazado muestra su
  elemento en la barra y uno sin enlace se puede «Enlazar» (o crear el elemento con su nombre). **Versiones**: línea de tiempo,
  comparar con «Ahora» u otra versión (`M.difVersiones`, `M.difLineas` y `M.difDiagrama`: nodos nuevos, quitados y con otro texto
  marcados en los dos dibujos) y restaurar. Al abrir: «Cambió el proyecto desde tu última versión: N commits» → «Revisar qué
  documentos afecta» → la IA los pone al día (tarea `revisar`). En el navegador, `P.simular` usa `demo.json → proyecto` (el trabajo
  «Documentar» con `simularTrabajo`: lee los archivos del ejemplo y escribe de a 2; el árbol con `proyecto.arbol`; git
  ficticio, IA simulada desde `ejemplos/ia-simulada/`, versiones en memoria).
- **Primer uso** (pieza «bienvenida», `bv` en `app.js`): lo primero es el idioma (título bilingüe fijo, el del sistema sugerido y
  enfocado, teclas 1/2; nada más se muestra ni se pide antes y los avisos esperan); al elegir se guarda por `config` igual que en
  Ajustes y sigue la bienvenida traducida: hola → carpeta → IA. Se decide con el primer estado (`bv.abrir`).

## Puente interfaz ↔ app (contrato en `pruebas/puente.json`)
La UI llama `host.enviar(accion, datos)` y la app responde con `window.Esquema.<funcion>(json)`. En el navegador responde `simular()`
con `ui/demo.json` (la carpeta vive en memoria). Acciones: `listo, config, elegirCarpeta, abrirProyecto, abrirArchivo, guardarArchivo,
probarIA, estructura, crearReadme, dibujar, proyecto, exportar, copiar, abrirEnlace, catalogoPlantillas, descargarPlantilla,
buscarActualizacion, actualizar, papelera`. Respuestas: `estado, carpetaElegida, archivoAbierto, archivoGuardado, archivoCambiado, archivos,
iaProbada, estructuraLista, readmeListo, dibujoListo, proyectoRespuesta, exportado, copiado, catalogoListo, plantillaDescargada,
actualizacionRevisada, actualizacionProgreso, enPapelera`, `proyectoProgreso` (ver «Trabajos») y `menu` (los menús nativos).
`proyecto {orden, …}` es una sola acción para todo lo de `bin/proyecto.py`: la app solo acepta las órdenes de `ORDENES` (la misma
lista en `Ventana.ordenesProyecto` y en `ORDENES_PROYECTO` de `main.js`; el contrato lo revisa), le agrega la carpeta actual (salvo las de `ordenesSinCarpeta` / `ORDENES_SIN_CARPETA`: `detectar` y `crear`, que no dependen de
ella) y responde `proyectoRespuesta {orden, …}`. Para elegir archivos en «Agregar», la interfaz usa un `<input type=file>`: el Mac lo
atiende con `WKUIDelegate.runOpenPanelWith` (solo el marco principal y `file://`). `abrirProyecto {indice}` abre un reciente por su posición en `proyectos.json`: la ruta la
lee la app, nunca la manda la interfaz. `puente.json` dice qué script corre
cada acción. `pruebas/contrato.py` revisa que interfaz, contrato y simulación coincidan, que existan los scripts, que
`app/Sources/Esquema/Ventana.swift` (un `case` por acción) y `escritorio/src/main.js` (objeto `ACCIONES`) atiendan todo, manden
todas las respuestas y solo llamen funciones que la interfaz tiene, y la seguridad de las dos apps (abajo). Una acción nueva va en
`ui/app.js`, `simular()`, `puente.json`, `Ventana.swift` y `ACCIONES`.

**Lo que las apps nunca hacen con lo que manda la interfaz:** armar comandos (todo va en un JSON de entrada), aceptar rutas absolutas
o con `..` (cada ruta se revisa como `comun.ruta_en` antes de llamar a bin/, que la vuelve a revisar), cambiar `carpeta` por
`config` (solo la cambia el selector del sistema o un proyecto reciente leído de `proyectos.json`), guardar claves o valores
desconocidos en `config.json`, abrir algo que no sea https, pasar a `bin/proyecto.py` una orden que no conoce o otra carpeta.

## App de Mac (`app/`)
- SwiftPM, macOS 15, Apple Silicon. Ventana normal con un `WKWebView` que carga `ui/` desde la app (`Contents/Resources/esquema`,
  con `bin/` y `plantillas/`) y Python portátil verificado por SHA-256 (`herramientas/empaquetar.sh`; misma versión y huella que
  Corta/Alcancía/Graba/Minuta). Firma ad hoc con requisito por identificador `app.esquema.mac` (el permiso de la carpeta sobrevive a
  cada actualización). `ui/demo.json` no va en la app.
- **Puente:** `WKScriptMessageHandler` «esquema», solo para el marco principal con origen `file`; `decidePolicyFor` solo deja navegar
  dentro de `ui/` y abre https en el navegador. `window.ESQUEMA_HOST = "mac"`.
- **Carpeta:** `NSOpenPanel` → marcador (`bookmarkData`, en `UserDefaults`, la sigue aunque la muevan; la app no está en sandbox,
  así que no hace falta un marcador «security-scoped») + `config.carpeta` para los scripts.
- **Vigilar la carpeta** (`Vigilante`, FSEvents con eventos por archivo): solo cuenta un `.md`/`.mmd` o una carpeta, fuera de `.git`,
  `node_modules` y las demás pesadas; espera 0,35 s de calma, relee los archivos abiertos (`conocidos`: el último texto que Esquema
  leyó o guardó; un guardado propio queda como conocido **antes** de escribirse, así no se avisa) → `archivoCambiado`, y vuelve a
  listar con `carpeta.py listar` → `archivos` si la lista cambió.
- **Guardar:** de a uno y en orden (`EnOrden`), atómico (`comun.escribir_atomico`). Al salir (⌘Q, o el actualizador) la interfaz
  guarda lo pendiente y la app espera los guardados (hasta 3 s); cerrar la ventana también guarda.
- **Exportar:** `NSSavePanel` (SVG, PNG desde base64, Markdown), escritura atómica. **Copiar:** `NSPasteboard`.
- **Menús** (en el idioma elegido, se rearman al cambiarlo): Esquema (Acerca de, Ajustes ⌘,, Salir), Archivo (Nuevo ⌘N, Abrir
  carpeta ⌘O, Mostrar la carpeta en el Finder, Guardar ⌘S, Cerrar ventana), Edición (Deshacer ⌘Z y Rehacer ⇧⌘Z de Esquema; cortar,
  copiar, pegar y seleccionar todo del sistema), Ver (Acercar ⌘+, Alejar ⌘−, Ajustar ⌘0, Solo texto ⌘1, Texto y dibujo ⌘2, Solo
  dibujo ⌘3, Pantalla completa), Ventana.
- **IA:** la corre `bin/ia.py` (sin herramientas ni MCP); la app no llama a ninguna IA por su cuenta.
- **Arranque:** menús y ventana de inmediato (en el idioma del sistema hasta que la persona elija); lo que corre solo
  (actualizaciones al abrir y cada 6 h) parte en `EsquemaApp.iniciarTareas()` recién con `Idioma.elegido`. Un aviso automático solo
  llega a la interfaz si hay versión nueva (nunca se vuelve a mandar el estado: no interrumpe la bienvenida).
- **Actualizaciones** (pieza «actualizaciones», target `PiezaActualizaciones`): `Esquema-macOS.zip` + `.sha256` solo desde
  `https://github.com/esquema-app/esquema/releases/download/…` (`esDescargaNuestra`), con `curl --proto '=https' --proto-redir '=https'`
  y huella de 64 hex obligatoria; un guion (todo lo variable con `comillas()`) espera a que la app se cierre, la
  reemplaza (deja `.anterior` si falla) y la abre. Instalación de desarrollo (`build.sh` deja la ruta del checkout en
  `~/Library/Application Support/Esquema/desarrollo`): `git pull --ff-only` + `empaquetar.sh`. Nunca con un guardado o la IA en curso.
- Desarrollo: checkout en `~/Developer/esquema`; `bash build.sh` (se niega si la IA está respondiendo) instala en
  `~/Applications/Esquema.app`. Compilar solo: `cd app && swift build -c release`. **Swift solo compila en un Mac** (o en el job `mac`).

## Windows y Linux (`escritorio/`)
- Electron (versión exacta, **44.9.1 o más nueva**: trae el arreglo de certificados eMudhra), `package-lock.json`, `.npmrc` con
  `ignore-scripts=true` (el binario de Electron se baja con `node node_modules/electron/install.js`). Dependabot propone las
  actualizaciones con `cooldown`.
- **Ventana:** `contextIsolation`, `sandbox`, sin `nodeIntegration` ni `webview`; la interfaz se sirve por `esquema://ui/…` (solo
  archivos de `ui/`); `will-navigate`, `will-redirect` y `setWindowOpenHandler` no dejan salir de ahí (https → navegador); todos los
  permisos del navegador se niegan. `preload.js` solo expone `ESQUEMA_HOST` y `esquemaEscritorio.enviar`; `ipcMain` solo atiende al
  marco principal de la ventana propia con origen `esquema://ui/`. Lo de Chromium va en `<carpeta de Esquema>/electron`.
- **Igual que en Mac:** mismas acciones (`ACCIONES`), mismos scripts con el Python portátil (`herramientas/preparar.sh`, huella fija),
  misma config validada, guardados en orden, guardar al cerrar (cerrar la ventana cierra la app), menú (Archivo, Edición, Ver,
  Ayuda; deshacer/rehacer con `registerAccelerator: false` porque el atajo lo atiende la interfaz), exportar con `dialog`, copiar
  con `clipboard`.
- **Vigilar la carpeta** (`src/vigilante.js`, sin Electron, probado con `pruebas/vigilante.mjs`): Windows con `fs.watch` recursivo;
  Linux con un `fs.watch` por carpeta (inotify), sin entrar a `.git`, `node_modules`, etc. (las de `comun.SIEMPRE_FUERA`), hasta
  3.000 carpetas y 8 niveles, resincronizadas en cada revisión. Misma lógica de `conocidos` que en Mac.
- **Empaquetar** (desde Linux, sin Wine): `npx electron-builder --linux AppImage tar.gz deb`; `npx electron-builder --win dir &&
  bash herramientas/instalador-windows.sh` (NSIS propio por usuario en `%LOCALAPPDATA%\Programs\Esquema`, `/S` silencioso; al
  actualizar primero le pide cerrar a la app para que guarde). Linux con `instalar.sh` en `~/.local/share/Esquema` + lanzador
  `~/.local/bin/esquema` (agrega `--no-sandbox` si el sistema restringe user namespaces), o AppImage, o .deb (no se actualiza solo).
- **Actualizaciones** (`src/actualizaciones.js`, pieza «actualizaciones»): instalador de Windows, AppImage o tar.gz según cómo se
  instaló, solo desde los Releases de este repo y verificados con su `.sha256`; sin empaquetar no busca. Al abrir (15 s después) y
  cada 6 h con `revisarCadaRato`, recién con el idioma elegido.
- **Pruebas:** `pruebas/arranque.mjs` abre la app de verdad con Xvfb (HOME temporal, carpeta e IA ficticias): idioma primero,
  config, abrir/guardar, cambio de afuera, conflicto, archivo nuevo, rutas fuera de la carpeta, IA sin herramientas, menú,
  navegación y protocolo; con `ELECTRON=dist/linux-unpacked/esquema APP=1` prueba la empaquetada. **Windows no se puede probar
  aquí:** pídelo a la comunidad con un issue `probar`.

## Catálogo de la comunidad (`esquema-app/esquema-catalogo`)
- **Solo datos** (CC0 1.0): `plantillas/<categoria>/<id>.json` + `index.json` en la raíz (`{formato, plantillas: [{…plantilla, ruta,
  sha256, tamano}]}`), que arma `herramientas/generar_indice.py` con `plantilla_formato.indice` (aquí: `bin/plantillas.py indice <raíz>`).
  `herramientas/plantilla_formato.py` es **idéntico** a `bin/plantilla_formato.py` (`test_python.py` lo revisa si el catálogo está al
  lado; el workflow del catálogo lo compara con `main` de este repo y dibuja cada diagrama con este motor). Un cambio de formato entra
  primero aquí, se publica una versión y después se copia allá.
- **La app** (`Catalogo.swift`, `escritorio/src/catalogo.js`, iguales): baja `index.json` solo de
  `https://raw.githubusercontent.com/esquema-app/esquema-catalogo/main/`, sin seguir redirecciones, hasta 1 MB; `plantillas.py
  catalogo` lo valida (`validar_indice`: solo entradas válidas, ruta `plantillas/<categoria>/<id>.json` que calza con su id y
  categoría, huella de 64 hex, tamaño ≤ 100 KB, sin ids repetidos). Para descargar usa **solo** ese índice validado (el id que manda
  la interfaz se busca ahí), baja la ruta del mismo dominio, compara tamaño y SHA-256 y `plantillas.py instalar` la vuelve a validar y
  la guarda en `<carpeta de Esquema>/plantillas/<id>.json` (0600). Nunca toca la carpeta de la persona. `contrato.py` revisa todo esto
  en las dos apps; `escritorio/pruebas/catalogo.mjs` lo prueba con un servidor falso.
- **Propuestas:** issue con el formulario `plantilla.yml` del catálogo (descrita en palabras o con el JSON); quien mantiene arma el
  JSON, corre `generar_indice.py` y abre el pull request. `ejemplos/catalogo-ejemplo/` es una copia para la demo y las pruebas.

## Página pública (`docs/`, https://esquema-app.github.io/esquema/)
- Una sola página bilingüe (`index.html`; el inglés con `?lang=en` o el idioma del navegador, `pagina.js`), sin dependencias ni
  scripts en línea (CSP con `script-src 'self'`). Descarga según el sistema (`pagina.js` detecta Mac, Windows o Linux) con los
  nombres fijos de `publicar.yml` (`releases/latest/download/Esquema-…`). La demo en vivo es `ui/` con `simular()` en `/demo/`.
- SEO: title y description con lo que la gente busca, canonical, `hreflang`, Open Graph/Twitter con `img/compartir.png` (1200×630,
  captura real con datos ficticios), JSON-LD `SoftwareApplication` + `FAQPage` (las mismas preguntas que se ven), `sitemap.xml`.
  `robots.txt` va en el repo `esquema-app.github.io`.
- Nada inventado: la cifra de rendimiento sale de la tabla del README; la comparación solo dice lo comprobado. Si cambia la tabla,
  cambia la página. `herramientas/pagina_capturas.mjs` arma `img/compartir.png` y las capturas de la página.

## Publicar una versión
1. Sube la versión en `app/Info.plist` y `escritorio/package.json` (iguales; el contrato lo revisa) y haz push a `main`.
2. `publicar.yml` corre las pruebas rápidas, compila Mac (macos-15), Linux y Windows (ubuntu, con la app de Linux empaquetada
   abierta en Xvfb) y crea el Release `vX.Y.Z` con nombres fijos: `Esquema-macOS.zip`, `Esquema-Windows.exe`,
   `Esquema-Linux.AppImage`, `Esquema-Linux.tar.gz`, `Esquema-Linux.deb`, cada uno con su `.sha256`. Si la versión ya existe, nada.
3. Las apps lo ven al abrir o cada 6 h (aviso dentro de la app, nunca una alerta del sistema).

## Lo que viene (planificado)
**Apps:** persistir `cambiosIA` en la carpeta de Esquema (no en la de la persona); abrir un `.md`/`.mmd` suelto desde el Finder o el
explorador; varias carpetas recientes; firma y notarización si algún día hay certificados.

**Tipos de diagrama** (siempre con la sintaxis de Mermaid; lo propio en `%% esquema:`):
- **Arquitectura** (hecho, primer paso): flowchart con formas clásicas + `"iconos"`; grupos = subgrafos (nube, red, servicio). No se
  usa `architecture-beta` de Mermaid porque GitHub no lo muestra igual en todas partes y necesita paquetes de íconos; si Mermaid lo
  estabiliza, se lee y se dibuja con el mismo motor.
- **BPMN:** flowchart con convenciones: evento de inicio `((…))`, de fin `(((…)))`, intermedio con ícono (`reloj`, `correo`), tareas
  `(…)`, compuertas `{…}` con su tipo en `%% esquema: {"compuertas": {"R": "exclusiva" | "paralela" | "inclusiva"}}` (se dibuja ×, + u
  ○ adentro), carriles = subgrafos de primer nivel con `%% esquema: {"carriles": "horizontal"}` (bandas a lo ancho, título girado a
  la izquierda; el acomodo fija cada carril a su banda), flujo de mensajes `-.->`. GitHub lo ve como un flujo normal.
- **Estados** (`stateDiagram-v2`): `[*]`, `A --> B : evento`, `state X { … }` (= subgrafo), `<<choice>>`, `<<fork>>`/`<<join>>`, notas.
  Se traduce al mismo modelo de flujo (formas `inicio`/`fin`, `redondeado`, `rombo`) y se acomoda con `capas.js`.
- **ER** (`erDiagram`): entidades con atributos (`string nombre PK`), relaciones `||--o{` con texto. Entidades como tablas (alto por
  atributos), acomodo con `capas.js` en LR, puntas de pata de gallo (`marker` nuevos).
- **Gantt** (`gantt`): `dateFormat`, `title`, `section`, tareas `:id, 2026-01-05, 3d`, `after id`, `done`/`active`/`crit`, `milestone`.
  Acomodo propio de línea de tiempo (escala por días, filas por sección), arrastrar el borde de una tarea cambia su duración en el texto.
- **Mapa mental** (`mindmap`): por sangría, formas de nodo de Mermaid (`[ ]`, `( )`, `(( ))`, `)) ((`), `::icon()` ignorado.
  Acomodo de árbol ordenado (raíz al centro, ramas a los dos lados); Tab/Enter en el lienzo crean hijo/hermano.
- Después: clases (`classDiagram`), C4. Cada tipo nuevo: casos en `pruebas/casos.json`, ejemplos en `pruebas/compat/` validados con
  Mermaid real, plantillas y su fila en la tabla de rendimiento.

**Catálogo:** votos = reacciones en un issue por plantilla.

## Reglas al cambiar cosas
- Código, comentarios, commits y textos en **español** (de Chile neutro). Todo texto nuevo visible va con su traducción en
  `ui/idiomas/en.json` en el mismo cambio, como frase completa con marcadores (`T("Diagrama {n} de {x}", {n, x})`), nunca pedazos
  pegados. Contenido de la persona con `esc()` y `data-sin-traducir`.
- No cambies el formato de los archivos sin compatibilidad: lo que Esquema escribe tiene que seguir siendo Mermaid que GitHub muestra.
- Si cambias cómo se lee o escribe Mermaid: un caso en `pruebas/casos.json` y, si es sintaxis nueva, un ejemplo en `pruebas/compat/`
  revisado con `node herramientas/comparar_mermaid.mjs`.
- Archivos de piezas (`bin/nucleo.py`, `bin/ia.py`, `ui/i18n.js`, `ui/bienvenida.*`, `ui/host.js`, `ui/tema.*`, `ui/componentes.*`): no se
  editan aquí; ver «Piezas». Colores con los tokens de «tema» (nunca un color fijo en `app.css` si hay token) y botones, diálogos y
  filas con las clases `pz-` de «componentes».
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`, `?vacio`, `window.Esquema._probar(E => …)`), también a 390 px y en claro y oscuro.
- Seguridad (detalle en `SECURITY.md`): CSP de `ui/index.html` sin scripts ni manejadores en línea; todo dato externo validado y
  escapado; los scripts solo tocan `.md`/`.mmd` dentro de la carpeta (`comun.ruta_en`; `bin/proyecto.py` además escribe
  `esquema.json` y `.versiones/` dentro de la carpeta de docs, y llama a git con argumentos fijos; los trabajos escriben solo en la
  carpeta de la documentación y en la de Esquema); la IA sin herramientas ni MCP
  (`claude --disallowedTools "*" --strict-mcp-config`, `codex -s read-only`) ni variables `ESQUEMA_*`. Workflows: actions fijadas
  por SHA con su versión en un comentario (Dependabot con `cooldown`), `permissions` mínimos, `persist-credentials: false`, nunca
  `pull_request_target` ni `${{ github.event.* }}` dentro de `run:`.
- Privacidad: `bash herramientas/revisar_privacidad.sh` antes de cada commit (usa `.terminos-privados`, local y nunca versionado).
  Jamás subas un documento o diagrama real, ni siquiera "para probar".
- Commits con autor `@users.noreply.github.com`. El repo es público: cada commit se ve al tiro.

## Lo que rodea a un cambio
Un cambio está listo cuando la app **y lo que la cuenta** dicen lo mismo. Antes de empezar, anota qué tipo de cambio es; al terminar,
revisa cada fila ("no aplica" se decide, no se supone):

| Si el cambio… | Deja al día |
|---|---|
| agrega o cambia una función | la página (`docs/`: funciones, «cómo funciona», comparación, preguntas frecuentes), el README y la guía si la hay |
| cambia lo que se ve | capturas de la página y del README (datos ficticios, español e inglés, normal y celular) e imagen para compartir si sale esa vista |
| cambia un flujo o un paso | instrucciones paso a paso, preguntas frecuentes, textos de la bienvenida e instalación si la toca |
| quita algo | bórralo de la página, el README y las guías: nada que prometa lo que ya no hace |
| cambia el formato de datos o el puente | la documentación del formato, `ejemplos/` si existe y esta guía |
| cambia carpetas, reglas o pruebas | esta guía (`AGENTS.md`) y `CONTRIBUTING.md` |
| actualiza o agrega una pieza | `piezas.json` (lo escribe `pieza.py`), la tabla «Piezas» de esta guía y `app.json` si pide config |
| resuelve un issue | ciérralo con «Resuelto en …» dando crédito y abre issues para lo que quedó pendiente |
| lo nota quien usa Esquema | `CHANGELOG.md`: una línea en «Sin publicar», en lenguaje de persona («Ahora puedes…»), en español e inglés |

Todo texto nuevo de la página y del README va en los dos idiomas, sin nada inventado. Antes de cerrar, busca con `grep` en `docs/` y el
README el nombre o el texto viejo de lo que cambió. Al publicar una versión, las líneas de «Sin publicar» pasan a su número.
Los issues que abrimos para una tarea traen una sección «Qué actualizar alrededor» con las filas de esta tabla que le tocan.

## Revisar aportes
Todo entra por pull request y lo junta quien mantiene el proyecto, solo con su aprobación. Leer todo el diff antes de correr nada
(alerta roja: workflows, la CSP, `innerHTML` sin `esc()`, red nueva, dependencias, cómo se arma el comando o el prompt de la IA). Las
plantillas se validan con `bin/plantillas.py validar`. Agentes: `.claude/agents/esquema-revisor.md` y `esquema-privacidad.md`.
Detalle en `CONTRIBUTING.md`.
