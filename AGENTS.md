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
   sola de forma definitiva**: queda como un cambio con «Quitar este cambio». Para documentar un proyecto ve el README, las guías
   (AGENTS/CONTRIBUTING…), la lista de archivos, los manifiestos y los mensajes de git (sin autores), y solo los archivos de código
   que la persona aprueba; antes de cada envío se muestra exactamente lo que va («Ver lo que se envía»), y lo que parece un secreto
   se oculta (`proyecto.ocultar_secretos`). **Revisión a fondo** (`a_fondo`, casilla del diálogo de envío, marcada de partida en
   las tareas de `proyecto.A_FONDO`: `inicial`, `flujo`, `completar`; se puede desmarcar): además, la IA puede **leer** la carpeta del
   código por su cuenta para revisarla entera. Solo leer: Claude con `--add-dir <código> --allowedTools Read,Glob,Grep` y
   `--disallowedTools` de todo lo que escribe, ejecuta o sale a internet, más `Read(**/<patrón>)` de `proyecto.NO_LEER` (`.env*`,
   llaves, credenciales, `.git/`); Codex `-s read-only`; Gemini solo con Antigravity (`ia.puede_leer`). La IA siempre corre en una carpeta temporal
   (nunca dentro del código: su CLI cargaría la configuración y los hooks de ese repo) y el pedido le dice dónde leer. El diálogo dice
   qué carpeta y qué no abre. Nunca escribe en la carpeta del código.
4. **Plantillas = solo datos.** Todo lo que viene de afuera (plantillas, traducciones, respuestas de la IA, el texto de un diagrama)
   se valida antes de usarse y se escapa antes de mostrarse.
5. **Rápido y liviano.** El motor y la interfaz no tienen dependencias (ni npm ni CDN); Python solo con biblioteca estándar.
6. **Gratis y abierto** (AGPL-3.0). Sin cuentas, sin publicidad.
7. **Nada personal en el código.** Ejemplos, pruebas y `ui/demo.json` solo con datos ficticios (Ana Pérez, Matías Soto, Banco Ejemplo).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `ui/motor/` | El motor, JS sin dependencias; cada archivo se suma a `globalThis.EsquemaMotor` (igual en el navegador y en Node). `texto.js` (medir con caché, partir etiquetas, escapar, errores con marcadores, línea `%% esquema:`), `flujo.js` (leer/escribir/editar flowchart conservando el texto), `secuencia.js` (leer/acomodar/dibujar/editar sequenceDiagram), `capas.js` (acomodo por capas), `formas.js` (formas e íconos propios), `dibujo.js` (elige el tipo, acomoda con caché, SVG por partes con clave, SVG independiente para exportar), `markdown.js` (bloques de un `.md` y Markdown → HTML seguro). |
| `ui/` | Interfaz única (`index.html` con CSP, `app.js`, `i18n.js` (pieza «i18n»: `T`, `Tp`, `tr`, `traducirDOM`, paquetes de idioma validados), `proyectos.js` (proyectos: paneles, diálogos y su simulación), `app.css`, `favicon.svg`), `demo.json` (ficticio, sale de `herramientas/generar_demo.py`) e `idiomas/en.json`. `motor/proyecto.js`: lógica pura de proyectos (validar `esquema.json`, refs, usos, cambiar en todas partes, glosario, comparar, documentos afectados). |
| `bin/` | Python **solo biblioteca estándar**, lo que corren las apps: `nucleo.py` (pieza «nucleo»: `app.json`, carpeta de datos, config validada, escritura atómica, contrato de scripts), `comun.py` (lo propio de Esquema sobre `nucleo`: versión, `ruta_en` de documentos con sus mensajes, `.gitignore`, secretos, `recorrer`), `carpeta.py` (listar, leer, guardar, estructura para el README), `ia.py` (pieza «ia»: la IA del usuario, sin herramientas, siempre en una carpeta temporal, revisión a fondo de solo lectura; `probar`; errores como `{codigo, valores}` que `ia.frase()` pasa a texto), `asistente.py` (README y Dibújame: prompts y limpieza de la respuesta), `plantilla_formato.py` (formato de una plantilla y del índice del catálogo: `validar`, `indice`, `validar_indice`; el MISMO archivo que `herramientas/plantilla_formato.py` del catálogo), `plantillas.py` (incluidas + descargadas, validar, índice, `catalogo` e `instalar` para lo que baja la app), `estado.py` (lo que pide la interfaz al abrir; guardar config), `proyecto.py` (proyectos: abrir, leer el repo sin IA, lo que va a la IA, generar, `esquema.json`, versiones con git o copias, ver y restaurar; recientes en la carpeta de Esquema). El último argumento siempre es el JSON de salida; lo de la persona llega en un JSON de entrada. |
| `app.json`, `piezas.json` | **Pieza** (ver «Piezas» abajo): `app.json` describe la app para las piezas (id, nombre, datos, plataformas, claves de config); `piezas.json` lo escribe `pieza.py` (versión y huella de cada archivo copiado). |
| `plantillas/` | Plantillas incluidas (`<categoria>/<id>.json`) y `README.md` con el formato. |
| `ejemplos/` | `proyecto-ejemplo/` (la carpeta ficticia de la demo, con un poco de «código» para «Documentar un proyecto»), `ia-simulada/` (lo que responde la IA en la vista previa del navegador), `catalogo-ejemplo/` (copia de las plantillas del catálogo de la comunidad: «Comunidad» en la demo y las pruebas) y scripts para construir encima del formato (`listar_diagramas.py`). |
| `pruebas/` | `correr.sh` (todo), `motor.mjs` (motor en Node), `interfaz.mjs` (Playwright), `test_python.py`, `contrato.py` + `puente.json` (contrato del puente), `casos.json` (casos compartidos), `compat/` (ejemplos Mermaid que se leen y se escriben igual; `variantes/`: formas no canónicas), `ia_falsa.py`. |
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
| `bienvenida` | `ui/bienvenida.js`, `ui/bienvenida.css` | El paso del idioma (`data-bv-idioma`, `.opciones-idioma`, teclas 1/2, el del sistema sugerido y enfocado, avisos que esperan con `retener`) y el mecanismo de pasos. Los pasos de Esquema (hola → carpeta → IA) se suman en `app.js` con `sumarPaso` (`listo: false`: la IA es el último y dice «Empezar»; hola y carpeta con `saltable: false`). Sus colores, `--bv-*` en `app.css` con la paleta de Esquema. |
| `actualizaciones` | `app/Sources/PiezaActualizaciones/Actualizaciones.swift`, `escritorio/src/actualizaciones.js` | Mac: target propio en `app/Package.swift`, configurado en `EsquemaApp.swift` (`Actualizaciones.configurar(.init(repo:nombre:archivoDesarrollo:variableProgreso:))`). Electron: `crear({app, net, repo, nombre})` en `main.js`. Lo que llega a la interfaz trae `texto` (español, con marcadores) y `valores`; la interfaz lo traduce con `T` (`frasePieza`). El aviso propio «espera a que termine de guardar» va con la misma forma (`codigo: "ocupada"`). |

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
  codigo?}]}`, hasta 30; lo escribe `bin/proyecto.py`). La documentación de los proyectos va en `~/Esquema/<proyecto>/` (abajo).

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
  Cambios del código desde la última versión: por fecha (`cambios_vinculado`), porque son dos repos. Los `.md`/`.mmd` del repo del
  código se ven y se editan en el lateral (órdenes `codigo`, `codigo_leer`, `codigo_guardar`; en la interfaz, con el prefijo
  `@codigo/`, que `abrir`/`guardar` mandan por `proyecto` en vez de `abrirArchivo`/`guardarArchivo`).
- **Los de antes (`docs/esquema/` dentro del repo)** siguen funcionando igual y muestran «Moverla aparte».
- **Carpeta (los de antes):** `docs/esquema/` por defecto (se elige al documentar: relativa, sin `..` ni carpetas ocultas, hasta 4 niveles). Adentro,
  Markdown y diagramas que GitHub muestra tal cual: `README.md` (visión general; GitHub lo muestra al abrir la carpeta),
  `arquitectura.md`, `flujos/<nombre>.md`, lo que la persona agregue, y dos archivos de Esquema:
  - `esquema.json` (formato abierto, versionado con la documentación; claves en este orden para diffs chicos):
    ```json
    {"formato": 1, "nombre": "Minuta", "descripcion": "…",
     "documentos": [{"ruta": "flujos/grabar.md", "titulo": "Grabar una reunión", "tipo": "vision|arquitectura|flujo|glosario|otro"}],
     "elementos": [{"id": "boton-grabar", "tipo": "pantalla|boton|accion|servicio|modulo|dato|actor|otro", "nombre": "Grabar",
                    "descripcion": "…", "codigo": ["Sources/Grabar.swift"]}],
     "fuentes": {"leido": "2026-10-28", "archivos": ["README.md", "AGENTS.md"]}}
    ```
    `documentos[].ruta` es relativa a la carpeta de docs (`.md`/`.mmd`, hasta dos subcarpetas); `id` de un elemento: minúsculas,
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
  elementos, elementos que ningún documento nombra y commits nuevos) con «Completar lo que falta» (tarea `completar`, con el pedido
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
  (sistema o elegido). A 760 px o menos: lista de archivos como cajón, una vista a la vez (Texto | Dibujo), herramientas de 44 px,
  diálogos desde abajo. `pruebas/interfaz.mjs` revisa contraste AA, desborde a 390 px, CSP y textos sin traducir.
- **Archivo cambiado afuera** (`archivoCambiado`): sin cambios sin guardar se recarga solo (se puede deshacer); con cambios, diálogo
  «¿Con cuál versión te quedas?» («Usar la del disco» / «Quedarme con la mía», que se guarda encima). Si el texto es el mismo, nada.
- **Menús de la app** (`window.Esquema.menu({accion})`): guardar, deshacer, rehacer, acercar, alejar, ajustar, texto, ambos, dibujo,
  nuevo, ajustes. Nada antes del idioma; en la bienvenida no se abren otros diálogos.
- **Actualizaciones** (Ajustes → Actualizaciones, `filaActualizacion`): buscar, «Hay una versión nueva» con sus notas, «Actualizar
  ahora» (guarda todo antes) y el avance por pasos. Lo de la app llega como `{texto, valores}` (pieza «actualizaciones») y se
  traduce al pintar con `frasePieza`; las notas del Release van tal cual. Un aviso corto la primera vez que el estado trae una versión nueva.
- **Proyectos** (`ui/proyectos.js`, `E.proyecto`, `E.panel`, `E.pj`): «Nuevo» → «Documentar un proyecto» (o el vacío «Elige una
  carpeta») elige la carpeta del repo (`elegirCarpeta {proyecto: true}`) → `proyecto {orden: "abrir"}`; si no hay documentación,
  «Lo que encontré» (`leer`, sin IA: README, guías, lenguajes, carpetas, manifiestos, workflows, git) y la carpeta de docs. Todo
  pedido a la IA pasa primero por **lo que se envía** (`preparar`: la lista exacta de piezas con su texto y tamaño, y lo que no se
  manda y por qué) → `generar` → **propuestas**: una tarjeta por documento (vista previa o antes/después) con «Quitar este cambio»,
  los elementos aparte; cada diagrama se valida con el motor (con errores no se agrega) y los enlaces/refs a elementos que no
  existen se quitan (`M.limpiarRefs`). «Guardar N cambios» escribe los documentos (los que ya existían quedan además en
  `E.cambiosIA`), `esquema.json` y el glosario, espera a que todo se guarde (`pj.espera`) y guarda **una** versión. «Documentar un
  flujo»: la IA puede pedir archivos (`PIDE`); la persona elige cuáles y vuelve a ver lo que se envía. **Elementos**: lista por tipo
  con búsqueda, ficha con «Dónde se usa» (`M.usosElemento`), Renombrar / Cambiar descripción / Quitar con vista previa por archivo
  (`M.cambiarElemento`: nodos y participantes renombrados, enlaces, menciones sin enlace opcionales, al quitar «unir lo de antes con
  lo de después» o lo que queda suelto, frases que lo nombran) aplicado como una versión con «Deshacer este cambio», y «Cambió cómo
  funciona» (la IA propone el cambio en cada documento que lo usa: tarea `cambio`). En el lienzo, un nodo enlazado muestra su
  elemento en la barra y uno sin enlace se puede «Enlazar» (o crear el elemento con su nombre). **Versiones**: línea de tiempo,
  comparar con «Ahora» u otra versión (`M.difVersiones`, `M.difLineas` y `M.difDiagrama`: nodos nuevos, quitados y con otro texto
  marcados en los dos dibujos) y restaurar. Al abrir: «Cambió el proyecto desde tu última versión: N commits» → «Revisar qué
  documentos afecta» → la IA los pone al día (tarea `revisar`). En el navegador, `P.simular` usa `demo.json → proyecto` (git
  ficticio, IA simulada desde `ejemplos/ia-simulada/`, versiones en memoria).
- **Primer uso** (pieza «bienvenida», `bv` en `app.js`): lo primero es el idioma (título bilingüe fijo, el del sistema sugerido y
  enfocado, teclas 1/2; nada más se muestra ni se pide antes y los avisos esperan); al elegir se guarda por `config` igual que en
  Ajustes y sigue la bienvenida traducida: hola → carpeta → IA. Se decide con el primer estado (`bv.abrir`).

## Puente interfaz ↔ app (contrato en `pruebas/puente.json`)
La UI llama `host.enviar(accion, datos)` y la app responde con `window.Esquema.<funcion>(json)`. En el navegador responde `simular()`
con `ui/demo.json` (la carpeta vive en memoria). Acciones: `listo, config, elegirCarpeta, abrirProyecto, abrirArchivo, guardarArchivo,
probarIA, estructura, crearReadme, dibujar, proyecto, exportar, copiar, abrirEnlace, catalogoPlantillas, descargarPlantilla,
buscarActualizacion, actualizar`. Respuestas: `estado, carpetaElegida, archivoAbierto, archivoGuardado, archivoCambiado, archivos,
iaProbada, estructuraLista, readmeListo, dibujoListo, proyectoRespuesta, exportado, copiado, catalogoListo, plantillaDescargada,
actualizacionRevisada, actualizacionProgreso` y `menu` (los menús nativos).
`proyecto {orden, …}` es una sola acción para todo lo de `bin/proyecto.py`: la app solo acepta las órdenes de `ORDENES` (la misma
lista en `Ventana.ordenesProyecto` y en `ORDENES_PROYECTO` de `main.js`; el contrato lo revisa), le agrega la carpeta actual y
responde `proyectoRespuesta {orden, …}`. `abrirProyecto {indice}` abre un reciente por su posición en `proyectos.json`: la ruta la
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
- Archivos de piezas (`bin/nucleo.py`, `bin/ia.py`, `ui/i18n.js`): no se editan aquí; ver «Piezas».
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`, `?vacio`, `window.Esquema._probar(E => …)`), también a 390 px y en claro y oscuro.
- Seguridad (detalle en `SECURITY.md`): CSP de `ui/index.html` sin scripts ni manejadores en línea; todo dato externo validado y
  escapado; los scripts solo tocan `.md`/`.mmd` dentro de la carpeta (`comun.ruta_en`; `bin/proyecto.py` además escribe
  `esquema.json` y `.versiones/` dentro de la carpeta de docs, y llama a git con argumentos fijos); la IA sin herramientas ni MCP
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
