# Cambios · Changelog

Lo que cambia para quien usa Esquema, en palabras simples. Las versiones anteriores a este archivo están en
[Releases](https://github.com/esquema-app/esquema/releases).
*What changes for people using Esquema, in plain words. Earlier versions are listed in Releases.*

## Sin publicar · Unreleased
- **Más avisos en tu idioma y archivos más seguros:** si una plantilla de la comunidad no se puede descargar o un archivo que
  agregas no se puede leer, el aviso sale en el idioma que elegiste. Los Word, EPUB y PDF que agregas se leen con topes más
  estrictos (contados al abrirlos), así un archivo armado para llenar la memoria no la llena. · *More notices in your language and
  safer files: if a community template can't be downloaded or a file you add can't be read, the notice shows in the language you
  chose. Word, EPUB and PDF files you add are read with stricter limits (counted while opening them), so a file built to fill up
  memory can't.*
- **Enviar comentarios desde la app:** en Ajustes → Acerca de, «Enviar comentarios» abre GitHub con tu mensaje listo (algo falla,
  una idea u otro); lo revisas y lo publicas tú. «Acerca de» vuelve a tener el enlace al catálogo de plantillas. Los avisos con
  botón («Deshacer», «Revisar», «Responder») se ven igual que los demás, y si un archivo cambió en el disco, Esc ya no elige por
  ti. · *Send feedback from the app: in Settings → About, «Send feedback» opens GitHub with your message ready (something's wrong,
  an idea or other); you review and post it yourself. «About» links to the template catalog again. Notices with a button (Undo,
  Review, Answer) look like the rest, and if a file changed on disk, Esc no longer chooses for you.*
- **Diálogos más cómodos con el teclado:** el foco entra al diálogo, Tab no se escapa, Esc o un clic fuera lo cierran y el foco
  vuelve a donde estabas. Los avisos esperan su turno en vez de taparse. En Ajustes, una IA queda elegida recién cuando su prueba
  sale bien, la actualización muestra su avance con una barra y «Acerca de» suma «Cómo aportar». · *Friendlier dialogs from the
  keyboard: focus moves into the dialog, Tab stays inside, Esc or a click outside closes it and focus goes back to where you were.
  Notices wait their turn instead of covering each other. In Settings, an AI is chosen only once its test passes, updates show
  their progress with a bar and «About» adds «How to contribute».*
- **Agregar información:** pega notas, un correo o lo que salió de una reunión y tu IA lo ordena en la documentación: crea lo
  nuevo, completa lo que ya existe y corrige lo que cambió. Antes de guardar ves cada cambio agrupado (Nuevo, Se completa, Se
  modifica), con el porqué y la frase de donde salió; lo que cambia algo que ya estaba solo se guarda si lo confirmas. Si tu IA no
  sabe dónde va algo, te pregunta, y lo que no calza en ningún lado queda en Notas en vez de perderse. «Agregar archivo o texto»
  ahora se llama «Agregar un documento»: es para guardar un texto entero, con su resumen. · *Add information: paste notes, an email
  or what came out of a meeting and your AI sorts it into the documentation: it creates what's new, completes what exists and fixes
  what changed. Before saving you see each change grouped (New, Gets completed, Gets changed), with the reason and the sentence it
  came from; anything that changes what was already there is only saved if you confirm it. If your AI doesn't know where something
  goes, it asks, and what fits nowhere goes to Notes instead of getting lost. «Add a file or text» is now «Add a document»: it's
  for keeping a whole text, with its summary.*
- **Agrega lo que tengas:** «Agregar» recibe una historia de usuario, un acta, una especificación o un libro (pegado, un archivo
  o soltándolo). Esquema adivina qué es, te dice por qué y puedes cambiarlo antes de que entre. El original queda guardado tal cual.
  · *Add what you have: «Add» takes a user story, minutes, a spec or a book (pasted, a file or dropped). Esquema guesses what it is,
  tells you why and lets you change it before it goes in. The original is kept as is.*
- **Historias de usuario que se entienden:** tu IA la lee con tu documentación, te pregunta lo que falta (una pregunta a la vez; puedes
  responder después, aunque cierres Esquema) y la deja documentada con criterios, partes que toca y un diagrama. Tu IA no programa.
  Cada historia pasa por Por entender → Lista → En desarrollo → Terminada, y «Terminé el desarrollo» cuenta cómo quedó según los
  commits y propone poner al día los demás documentos. · *User stories you understand: your AI reads it with your docs, asks what's
  missing (one question at a time; answer later, even after closing Esquema) and documents it with criteria, affected parts and a
  diagram. Your AI doesn't code. Each story goes To understand → Ready → In development → Done, and «I finished the development»
  tells how it turned out from the commits and proposes updates to the other documents.*
- **Proyectos de tipo Libro:** «Agregar proyecto» pregunta qué es: Software o Libro. Un libro se parte en capítulos, con un resumen
  por capítulo, el mapa de ideas, personajes y conceptos, la línea de tiempo, material de estudio (esquema, preguntas y tarjetas) y
  «Revisar incongruencias», con la cita y dónde está. · *Book projects: «Add project» asks what it is: Software or Book. A book is
  split into chapters, with a summary per chapter, the map of ideas, characters and concepts, the timeline, study material (outline,
  questions and flashcards) and «Check inconsistencies», with the quote and where it is.*
- **Borrar sin miedo:** borra un documento, un diagrama, una historia o un capítulo desde la lista (clic derecho o Supr) o desde el
  documento abierto. Los enlaces a él quedan como texto, se guarda una versión y tienes «Deshacer». Lo de tu carpeta de código nunca
  se borra así: va a la papelera del sistema. · *Delete without fear: from the list (right click or Delete) or from the open
  document. Links to it become plain text, a version is saved and you get «Undo». Files in your code folder are never deleted this
  way: they go to the system Trash.*
- **Publícala en la wiki de GitHub:** Esquema te muestra qué páginas son nuevas, cuáles cambian y cuáles quedan igual, y las sube con
  tu git. Nunca toca las páginas que escribiste a mano. · *Publish it to the GitHub wiki: Esquema shows which pages are new, which
  change and which stay the same, and pushes them with your git. It never touches pages you wrote by hand.*
- **Más claro:** «Agregar proyecto» arriba de la lista de proyectos y «Nuevo en <proyecto>» dentro de cada uno, para que se entienda
  dónde va lo nuevo. · *Clearer: «Add project» above the project list and «New in <project>» inside each one, so it's clear where new
  things go.*
- **Documentar ya no se pierde ni te deja esperando a ciegas:** tu IA trabaja por etapas (revisa los archivos, lee el código y arma
  un plan, escribe cada documento y guarda una versión) y ves en vivo qué archivo está leyendo, cuántos lleva, cuánto tiempo va y
  cómo va cada documento. Cada documento queda guardado apenas está listo, aunque cierres la ventana; puedes seguir usando Esquema
  mientras tanto, y si algo falla se reintenta solo ese documento. Escape ya no cancela nada: para eso está «Detener», y después
  «Seguir donde quedó». · *Documenting no longer gets lost or leaves you waiting blind: your AI works in stages and you see live which
  file it's reading, how many so far, the time and how each document is going. Each document is saved as soon as it's ready, even
  if you close the window; you can keep working meanwhile, and a failed document is retried on its own. Escape no longer cancels
  anything: use «Stop», then «Pick up where it left off».*
- **«Código» muestra todo tu código:** todos los archivos del proyecto, ordenados y con su ícono (código, configuración, imágenes,
  datos…), con una marca en lo que tu IA leyó, lo que está leyendo ahora y lo que cambió desde que lo leyó. Los archivos de código no
  se abren: tocarlos muestra cuándo los leyó tu IA y en qué documentos y elementos aparecen. · *«Code» shows all your code: every
  file, sorted and with its icon, marking what your AI read, what it's reading now and what changed since. Code files don't open:
  tapping one shows when your AI read it and where it appears.*
- **Ordenada según tu proyecto:** Esquema detecta si es una app, una biblioteca, un sitio, un proyecto con varias partes o
  documentos y escritos, y la documentación y «Lo que falta» se ajustan a eso (visión, arquitectura, una página por parte, flujos…).
  · *Organized for your project: Esquema detects whether it's an app, a library, a site, a project with several parts or writing,
  and the documentation and «What's missing» adapt to it.*
- **Primer uso con teclado:** en la pantalla del idioma ahora eliges con 1 o 2 (o con las flechas), y los dos idiomas se ven lado a
  lado. Las actualizaciones usan la pieza compartida de la familia: siguen bajando solo de nuestros Releases, con su huella, y sus
  avisos se ven en tu idioma. · *First run with the keyboard: on the language screen you can now pick with 1 or 2 (or the arrow
  keys), with both languages side by side. Updates use the family's shared piece: they still download only from our Releases,
  with their checksum, and their messages show in your language.*
- **Por dentro, piezas de Pieza:** tu IA, la configuración y los idiomas ahora usan las piezas compartidas de la familia
  (`nucleo`, `ia`, `i18n`). Tu IA siempre trabaja en una carpeta temporal, también al revisar tu código a fondo (solo lo lee),
  así nunca carga la configuración de ese repo. · *Under the hood, Pieza pieces: your AI, settings and languages now use the
  family's shared pieces (`nucleo`, `ia`, `i18n`). Your AI always works in a temporary folder, also when reviewing your code in
  depth (it only reads it), so it never loads that repo's configuration.*
- **Revisión a fondo:** al documentar tu proyecto, tu IA puede leer (solo leer) toda la carpeta del código para que no se le escape
  nada; nunca abre tus `.env`, llaves ni la carpeta `.git`, y puedes desmarcarla. · *Thorough review: when documenting your
  project, your AI can read (only read) the whole code folder so nothing slips through; it never opens your `.env`, keys or the
  `.git` folder, and you can turn it off.*
- **Cada proyecto, una carpeta:** a la izquierda, cada proyecto con su **Código** y su **Documentación**. Al abrir la documentación
  ves qué le falta (visión, arquitectura, flujos, elementos…) y la completas con un botón. · *Each project, one folder: on the left,
  each project with its Code and its Documentation. Opening the documentation shows what it's missing (overview, architecture,
  flows, elements…) and one button completes it.*
- **Varios proyectos, con la documentación aparte:** agrega los proyectos que quieras; la documentación de cada uno vive en
  `~/Esquema/<proyecto>/`, con su propio historial, y tu repo no cambia. Con «Pasar al proyecto» eliges qué documentos copiar al
  repo y si reemplazas los que ya existen, viendo la diferencia. Los proyectos de antes se pueden mover aparte sin borrar nada.
  · *Several projects, with documentation kept apart: each project's docs live in `~/Esquema/<project>/` with their own history,
  and your repo doesn't change. “Copy to project” lets you choose what goes into the repo and whether to replace what exists.*
- **Tu IA dibuja tu proyecto, no otros:** si pides algo sobre «este proyecto», Esquema le muestra el proyecto a tu IA (antes ves qué
  se envía), y Claude ya no usa tu memoria personal ni tus notas, que lo llevaban a dibujar otros proyectos tuyos. · *Your AI draws
  your project, not others: asking about “this project” sends it the project (you see what goes first), and Claude no longer uses
  your personal memory or notes, which made it draw other projects of yours.*
- **Tu carpeta, de un vistazo:** a la izquierda, la carpeta entera como árbol, y al elegirla un **Inicio** con lo que puedes hacer:
  crear un diagrama, la documentación completa, documentar un flujo o escribir un documento. · *Your folder at a glance: the whole
  folder as a tree, and a Home screen with what you can do: create a diagram, full documentation, document a flow or write a
  document.*
- **Pídele a tu IA «el flujo de…» o «la secuencia de…»:** el tipo de diagrama sale de cómo lo pides, y «Crear diagrama» puede leer
  el código de la carpeta (ves antes exactamente qué se envía). Si cierras «Dibújame» mientras tu IA dibuja, el diagrama igual
  aparece. · *Ask your AI for “the flow of…” or “the sequence of…”: the diagram type follows how you ask, and “Create a diagram” can
  read the folder's code. If you close “Draw it” while your AI is drawing, the diagram still shows up.*
- **Documentar un proyecto:** elige la carpeta de un repositorio y Esquema te muestra lo que encontró (README, guías, lenguajes,
  git); tu IA escribe la visión general, la arquitectura y los flujos en `docs/esquema/`, y tú revisas cada documento antes de
  guardarlo. Ves exactamente qué se le manda antes de cada envío. · *Document a project: pick a repository and your AI writes the
  overview, architecture and flows in `docs/esquema/`; you review every document and see exactly what gets sent.*
- **Elementos conectados:** renombra o quita un botón o una pantalla y cambia en todos los documentos y diagramas a la vez, con una
  vista previa por archivo y «Deshacer este cambio». · *Connected elements: rename or remove a button or screen and it changes in
  every document and diagram at once, with a per-file preview and undo.*
- **Versiones de la documentación:** cada versión es un commit de git solo de esa carpeta (o una copia si no usas git); compara
  texto y diagramas y restaura cualquiera. Esquema te avisa si el código cambió desde tu última versión. · *Documentation
  versions: each one is a git commit of only that folder; compare text and diagrams, restore any version, and get told when the
  code changed since.*
