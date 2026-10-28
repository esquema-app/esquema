# Esquema — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Esquema es una app para hacer **diagramas y documentación**. Lee y escribe **Mermaid** (lo que GitHub ya muestra), pero se edita de
dos formas que se mantienen al día: escribiendo el texto (con autocompletar y errores claros) o dibujando en el lienzo (crear,
conectar arrastrando, renombrar, mover, borrar, deshacer). Dibuja con un **motor propio** sin dependencias, decenas de veces más rápido
que Mermaid. Los documentos son Markdown con diagramas incrustados que se editan en el lugar. La IA del usuario (Claude Code, Codex o
Gemini, con su propia cuenta) dibuja lo que se le pide («Dibújame») y escribe el README para GitHub; cada cambio suyo se puede quitar.
Interfaz web única (`ui/`); app de Mac, Windows y Linux en la fase siguiente.

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
| `bin/` | Python **solo biblioteca estándar**, lo que corren las apps: `comun.py` (versión, carpeta de Esquema, config, escritura atómica, `ruta_en`, `.gitignore`, secretos, `recorrer`), `carpeta.py` (listar, leer, guardar, estructura para el README), `ia.py` (la IA del usuario, sin herramientas; `probar`), `asistente.py` (README y Dibújame: prompts y limpieza de la respuesta), `plantilla_formato.py` (formato de una plantilla; el MISMO archivo que en el catálogo), `plantillas.py` (incluidas + descargadas, validar, índice del catálogo), `estado.py` (lo que pide la interfaz al abrir; guardar config). El último argumento siempre es el JSON de salida; lo de la persona llega en un JSON de entrada. |
| `plantillas/` | Plantillas incluidas (`<categoria>/<id>.json`) y `README.md` con el formato. |
| `ejemplos/` | `proyecto-ejemplo/` (la carpeta ficticia de la demo) y scripts para construir encima del formato (`listar_diagramas.py`). |
| `pruebas/` | `correr.sh` (todo), `motor.mjs` (motor en Node), `interfaz.mjs` (Playwright), `test_python.py`, `contrato.py` + `puente.json` (contrato del puente), `casos.json` (casos compartidos), `compat/` (ejemplos Mermaid que se leen y se escriben igual; `variantes/`: formas no canónicas), `ia_falsa.py`. |
| `herramientas/` | `revisar_privacidad.sh`, `generar_demo.py`, `comparar_mermaid.mjs` (rendimiento y compatibilidad contra Mermaid real, instalado aparte). |
| `docs/` | Capturas (`docs/img/`) y, más adelante, la página pública. |

## Formato de los archivos
- **Documento** `.md`: Markdown de GitHub. Cada diagrama es un bloque ```` ```mermaid ````. GitHub lo muestra igual que Esquema.
- **Diagrama** `.mmd`: solo el texto Mermaid (lo que va dentro del bloque).
- **Línea de Esquema** (opcional, al final del diagrama): `%% esquema: {"aristas": "recta" | "ortogonal", "iconos": {"id": "servidor"},
  "pos": {"id": [x, y]}}`. Una sola línea JSON, claves ordenadas (diffs chicos). `pos` son centros fijados a mano en coordenadas del
  acomodo; `iconos`, de `M.ICONOS`. Se valida campo por campo (`M.leerMeta`); lo desconocido se descarta. Sin `pos`, todo se acomoda solo.
- Nada más se guarda: ni base de datos, ni archivos ocultos en la carpeta de la persona. La config de la app va en la carpeta de
  Esquema del sistema (`comun.carpeta_app()`: `~/Library/Application Support/Esquema`, `%APPDATA%\Esquema` o `~/.config/esquema`).

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
- **Exportar:** SVG independiente (colores adentro, `M.svgCompleto` + `M.estiloSVG`), PNG (ese SVG en un canvas al doble, fondo
  blanco), Markdown con el bloque mermaid y «Copiar para GitHub».
- **Diseño:** base neutra, un color de acción (azul tinta `--acento`), rojo solo para errores, verde solo para «lista». Claro/oscuro
  (sistema o elegido). A 760 px o menos: lista de archivos como cajón, una vista a la vez (Texto | Dibujo), herramientas de 44 px,
  diálogos desde abajo. `pruebas/interfaz.mjs` revisa contraste AA, desborde a 390 px, CSP y textos sin traducir.
- **Primer uso:** lo primero es el idioma (`pasoIdioma`, título bilingüe fijo, el del sistema sugerido y enfocado; nada más se muestra
  ni se pide antes); al elegir se guarda por `config` igual que en Ajustes y sigue la bienvenida traducida: hola → carpeta → IA.

## Puente interfaz ↔ app (contrato en `pruebas/puente.json`)
La UI llama `host.enviar(accion, datos)` y la app responde con `window.Esquema.<funcion>(json)`. En el navegador responde `simular()`
con `ui/demo.json` (la carpeta vive en memoria). Acciones: `listo, config, elegirCarpeta, abrirArchivo, guardarArchivo, probarIA,
estructura, crearReadme, dibujar, exportar, copiar, abrirEnlace`. Respuestas: `estado, carpetaElegida, archivoAbierto,
archivoGuardado, archivoCambiado, archivos, iaProbada, estructuraLista, readmeListo, dibujoListo, exportado, copiado`.
`puente.json` dice qué script corre cada acción. `pruebas/contrato.py` revisa que interfaz, contrato y simulación coincidan, que
existan los scripts y, cuando existan, que `app/Sources/Esquema/Ventana.swift` (un `case` por acción) y `escritorio/src/main.js`
(objeto `ACCIONES`) atiendan todo y solo llamen funciones que la interfaz tiene. Una acción nueva va en `ui/app.js`, `simular()`,
`puente.json` y en las apps.

## Lo que viene (fase siguiente y planificado)
**Apps (siguiente fase, skill «app-escritorio-multiplataforma»):** Mac (SwiftPM, WKWebView, puente con `case` por acción, Python
portátil verificado por SHA-256, `NSOpenPanel` para la carpeta con marcador de seguridad, `FSEvents` → `archivoCambiado`/`archivos`,
`NSSavePanel` para exportar, `NSPasteboard`) y Electron para Windows/Linux (`ACCIONES`, `dialog`, `fs.watch`, `clipboard`). La ventana
solo carga `ui/`, el puente solo atiende al marco principal, y nada se pide ni se muestra antes del idioma. Actualizaciones dentro de
la app. Persistir `cambiosIA` en la carpeta de Esquema (no en la de la persona).

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

**Catálogo comunitario** `esquema-app/esquema-catalogo`: `plantillas/<categoria>/<id>.json` + `index.json` (`bin/plantillas.py
indice`, con SHA-256 y tamaño). La app lo baja solo de `raw.githubusercontent.com/esquema-app/esquema-catalogo`, sin redirecciones,
con tamaño máximo y huella, y valida con `plantilla_formato.py` antes de guardarlo en la carpeta de Esquema (`plantillas/`). Votos =
reacciones en un issue por plantilla; propuestas = issue con el JSON o descrita en palabras (la IA de quien mantiene la arma).

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
