# Esquema — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Esquema es una app para hacer **diagramas y documentación**. Lee y escribe **Mermaid** (lo que GitHub ya muestra), pero se edita de
dos formas que se mantienen al día: escribiendo el texto (con autocompletar y errores claros) o dibujando en el lienzo (crear,
conectar arrastrando, renombrar, mover, borrar, deshacer). Dibuja con un **motor propio** sin dependencias, decenas de veces más rápido
que Mermaid. Los documentos son Markdown con diagramas incrustados que se editan en el lugar. La IA del usuario (Claude Code, Codex o
Gemini, con su propia cuenta) dibuja lo que se le pide («Dibújame») y escribe el README para GitHub; cada cambio suyo se puede quitar.
Interfaz web única (`ui/`) en la app de Mac (`app/`, nativa) y en la de Windows y Linux (`escritorio/`, Electron).

**Principios que no se negocian**
1. **Los archivos son de la persona.** Viven en la carpeta que elige, en formato abierto: `.md` con bloques ```` ```mermaid ```` y
   diagramas sueltos `.mmd`. Esquema no los mueve, no los copia y no los manda a ninguna parte. Sin servidores propios ni telemetría.
2. **Mermaid de verdad.** Lo que Esquema escribe es Mermaid que GitHub muestra tal cual. Lo propio (posiciones fijadas, íconos, estilo
   de las flechas) va en una línea de comentario `%% esquema: {...}` que Mermaid ignora. Editar en el lienzo cambia **solo** las líneas
   necesarias: comentarios, sangrías y el estilo de quien escribió quedan igual.
3. **La IA es la del usuario** y ve lo mínimo: el pedido, el diagrama abierto si se pide cambiarlo y, para el README, solo nombres de
   archivos (respetando `.gitignore`, sin secretos). Corre sin herramientas. Su respuesta se valida con el motor y **nunca se aplica
   sola de forma definitiva**: queda como un cambio con «Quitar este cambio».
4. **Plantillas = solo datos.** Todo lo que viene de afuera (plantillas, traducciones, respuestas de la IA, el texto de un diagrama)
   se valida antes de usarse y se escapa antes de mostrarse.
5. **Rápido y liviano.** El motor y la interfaz no tienen dependencias (ni npm ni CDN); Python solo con biblioteca estándar.
6. **Gratis y abierto** (AGPL-3.0). Sin cuentas, sin publicidad.
7. **Nada personal en el código.** Ejemplos, pruebas y `ui/demo.json` solo con datos ficticios (Ana Pérez, Matías Soto, Banco Ejemplo).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `ui/motor/` | El motor, JS sin dependencias; cada archivo se suma a `globalThis.EsquemaMotor` (igual en el navegador y en Node). `texto.js` (medir con caché, partir etiquetas, escapar, errores con marcadores, línea `%% esquema:`), `flujo.js` (leer/escribir/editar flowchart conservando el texto), `secuencia.js` (leer/acomodar/dibujar/editar sequenceDiagram), `capas.js` (acomodo por capas), `formas.js` (formas e íconos propios), `dibujo.js` (elige el tipo, acomoda con caché, SVG por partes con clave, SVG independiente para exportar), `markdown.js` (bloques de un `.md` y Markdown → HTML seguro). |
| `ui/` | Interfaz única (`index.html` con CSP, `app.js`, `app.css`, `favicon.svg`), `demo.json` (ficticio, sale de `herramientas/generar_demo.py`) e `idiomas/en.json`. |
| `bin/` | Python **solo biblioteca estándar**, lo que corren las apps: `comun.py` (versión, carpeta de Esquema, config, escritura atómica, `ruta_en`, `.gitignore`, secretos, `recorrer`), `carpeta.py` (listar, leer, guardar, estructura para el README), `ia.py` (la IA del usuario, sin herramientas; `probar`), `asistente.py` (README y Dibújame: prompts y limpieza de la respuesta), `plantilla_formato.py` (formato de una plantilla y del índice del catálogo: `validar`, `indice`, `validar_indice`; el MISMO archivo que `herramientas/plantilla_formato.py` del catálogo), `plantillas.py` (incluidas + descargadas, validar, índice, `catalogo` e `instalar` para lo que baja la app), `estado.py` (lo que pide la interfaz al abrir; guardar config). El último argumento siempre es el JSON de salida; lo de la persona llega en un JSON de entrada. |
| `plantillas/` | Plantillas incluidas (`<categoria>/<id>.json`) y `README.md` con el formato. |
| `ejemplos/` | `proyecto-ejemplo/` (la carpeta ficticia de la demo), `catalogo-ejemplo/` (copia de las plantillas del catálogo de la comunidad: «Comunidad» en la demo y las pruebas) y scripts para construir encima del formato (`listar_diagramas.py`). |
| `pruebas/` | `correr.sh` (todo), `motor.mjs` (motor en Node), `interfaz.mjs` (Playwright), `test_python.py`, `contrato.py` + `puente.json` (contrato del puente), `casos.json` (casos compartidos), `compat/` (ejemplos Mermaid que se leen y se escriben igual; `variantes/`: formas no canónicas), `ia_falsa.py`. |
| `herramientas/` | `revisar_privacidad.sh`, `generar_demo.py`, `comparar_mermaid.mjs` (rendimiento y compatibilidad contra Mermaid real, instalado aparte), `empaquetar.sh` (arma `dist/Esquema.app` + zip + `.sha256`, en un Mac), `generar_icono.mjs` (íconos de las apps desde `ui/favicon.svg`). |
| `app/` | App de Mac (SwiftPM, macOS 15, sin proyecto de Xcode): `EsquemaApp.swift` (arranque, menús), `Ventana.swift` (WKWebView + puente: un `case` por acción), `Carpeta.swift` (elegir la carpeta con marcador, rutas, `Vigilante` con FSEvents), `Servicios.swift` (rutas, config, idioma, `Procesador`, `EnOrden`), `Catalogo.swift` (plantillas de la comunidad), `Actualizaciones.swift`; `Info.plist`, `Esquema.icns`. Ver «App de Mac». |
| `escritorio/` | App de Windows y Linux (Electron): `src/main.js` (ventana, puente `ACCIONES`, menú, protocolo `esquema://ui/`), `src/preload.js`, `src/rutas.js`, `src/servicios.js`, `src/vigilante.js` (`fs.watch`), `src/catalogo.js` (plantillas de la comunidad), `src/actualizaciones.js`; `herramientas/` (Python portátil, instalador NSIS), `pruebas/` (`arranque.mjs` con Xvfb, `vigilante.mjs`, `catalogo.mjs`), `iconos/`. Ver «Windows y Linux». |
| `build.sh`, `instalar.sh`, `instalar.ps1` | Compilar e instalar en el Mac de desarrollo; instaladores de un comando (Mac/Linux y Windows) que verifican la huella. |
| `docs/` | La página pública (GitHub Pages, `pagina.yml` la publica con `ui/` en `/demo/`): `index.html` bilingüe (es/en), `pagina.css`, `pagina.js`, `sitemap.xml`, `apple-touch-icon.png`, `favicon.svg` e `img/` (capturas y `compartir.png`). Ver «Página pública». |

## Formato de los archivos
- **Documento** `.md`: Markdown de GitHub. Cada diagrama es un bloque ```` ```mermaid ````. GitHub lo muestra igual que Esquema.
- **Diagrama** `.mmd`: solo el texto Mermaid (lo que va dentro del bloque).
- **Línea de Esquema** (opcional, al final del diagrama): `%% esquema: {"aristas": "recta" | "ortogonal", "iconos": {"id": "servidor"},
  "pos": {"id": [x, y]}}`. Una sola línea JSON, claves ordenadas (diffs chicos). `pos` son centros fijados a mano en coordenadas del
  acomodo; `iconos`, de `M.ICONOS`. Se valida campo por campo (`M.leerMeta`); lo desconocido se descarta. Sin `pos`, todo se acomoda solo.
- Nada más se guarda: ni base de datos, ni archivos ocultos en la carpeta de la persona. La config de la app va en la carpeta de
  Esquema del sistema (`comun.carpeta_app()`: `~/Library/Application Support/Esquema`, `%APPDATA%\Esquema` o `~/.config/esquema`,
  0700; las apps se la pasan a los scripts en `ESQUEMA_DATOS`): `config.json` (`idioma_ui`, `ia`, `tema`, `bienvenida`, `carpeta`).

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
- **IA:** «Dibújame» (`dibujar` → `dibujoListo`): se valida con el motor; con errores no se aplica y se explica. Aplicado, queda en
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
  ahora» (guarda todo antes) y el avance por pasos. Un aviso corto la primera vez que el estado trae una versión nueva.
- **Primer uso:** lo primero es el idioma (`pasoIdioma`, título bilingüe fijo, el del sistema sugerido y enfocado; nada más se muestra
  ni se pide antes); al elegir se guarda por `config` igual que en Ajustes y sigue la bienvenida traducida: hola → carpeta → IA.

## Puente interfaz ↔ app (contrato en `pruebas/puente.json`)
La UI llama `host.enviar(accion, datos)` y la app responde con `window.Esquema.<funcion>(json)`. En el navegador responde `simular()`
con `ui/demo.json` (la carpeta vive en memoria). Acciones: `listo, config, elegirCarpeta, abrirArchivo, guardarArchivo, probarIA,
estructura, crearReadme, dibujar, exportar, copiar, abrirEnlace, catalogoPlantillas, descargarPlantilla, buscarActualizacion,
actualizar`. Respuestas: `estado, carpetaElegida, archivoAbierto, archivoGuardado, archivoCambiado, archivos, iaProbada,
estructuraLista, readmeListo, dibujoListo, exportado, copiado, catalogoListo, plantillaDescargada, actualizacionRevisada,
actualizacionProgreso` y `menu` (los menús nativos). `puente.json` dice qué script corre
cada acción. `pruebas/contrato.py` revisa que interfaz, contrato y simulación coincidan, que existan los scripts, que
`app/Sources/Esquema/Ventana.swift` (un `case` por acción) y `escritorio/src/main.js` (objeto `ACCIONES`) atiendan todo, manden
todas las respuestas y solo llamen funciones que la interfaz tiene, y la seguridad de las dos apps (abajo). Una acción nueva va en
`ui/app.js`, `simular()`, `puente.json`, `Ventana.swift` y `ACCIONES`.

**Lo que las apps nunca hacen con lo que manda la interfaz:** armar comandos (todo va en un JSON de entrada), aceptar rutas absolutas
o con `..` (cada ruta se revisa como `comun.ruta_en` antes de llamar a bin/, que la vuelve a revisar), cambiar `carpeta` por
`config` (solo la cambia el selector del sistema), guardar claves o valores desconocidos en `config.json`, abrir algo que no sea https.

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
- **Actualizaciones:** `Esquema-macOS.zip` + `.sha256` solo desde `https://github.com/esquema-app/esquema/releases/download/…`
  (`esDescargaNuestra`), con `curl --proto '=https'`; un guion (todo lo variable con `comillas()`) espera a que la app se cierre, la
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
- **Actualizaciones** (`src/actualizaciones.js`): instalador de Windows, AppImage o tar.gz según cómo se instaló, solo desde los
  Releases de este repo y verificados con su `.sha256`; sin empaquetar no busca.
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
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`, `?vacio`, `window.Esquema._probar(E => …)`), también a 390 px y en claro y oscuro.
- Seguridad (detalle en `SECURITY.md`): CSP de `ui/index.html` sin scripts ni manejadores en línea; todo dato externo validado y
  escapado; los scripts solo tocan `.md`/`.mmd` dentro de la carpeta (`comun.ruta_en`); la IA sin herramientas ni MCP
  (`claude --disallowedTools "*" --strict-mcp-config`, `codex -s read-only`) ni variables `ESQUEMA_*`. Workflows: actions fijadas
  por SHA con su versión en un comentario (Dependabot con `cooldown`), `permissions` mínimos, `persist-credentials: false`, nunca
  `pull_request_target` ni `${{ github.event.* }}` dentro de `run:`.
- Privacidad: `bash herramientas/revisar_privacidad.sh` antes de cada commit (usa `.terminos-privados`, local y nunca versionado).
  Jamás subas un documento o diagrama real, ni siquiera "para probar".
- Commits con autor `@users.noreply.github.com`. El repo es público: cada commit se ve al tiro.

## Revisar aportes
Todo entra por pull request y lo junta quien mantiene el proyecto, solo con su aprobación. Leer todo el diff antes de correr nada
(alerta roja: workflows, la CSP, `innerHTML` sin `esc()`, red nueva, dependencias, cómo se arma el comando o el prompt de la IA). Las
plantillas se validan con `bin/plantillas.py validar`. Agentes: `.claude/agents/esquema-revisor.md` y `esquema-privacidad.md`.
Detalle en `CONTRIBUTING.md`.
