# Cambios · Changelog

Lo que cambia para quien usa Esquema, en palabras simples. Las versiones anteriores a este archivo están en
[Releases](https://github.com/esquema-app/esquema/releases).
*What changes for people using Esquema, in plain words. Earlier versions are listed in Releases.*

## Sin publicar · Unreleased
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
