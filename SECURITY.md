# Seguridad

Esquema es gratis y abierto, y tus archivos nunca salen de tu computador. Si encuentras una falla de seguridad, gracias por avisar:
la arreglamos antes de contarla. *(English below.)*

## Cómo reportar una falla (en privado)
**No abras un issue público ni lo cuentes en Discussions.** Usa el reporte privado de GitHub:
[**Reportar una vulnerabilidad**](https://github.com/esquema-app/esquema/security/advisories/new) (pestaña *Security* → *Report a
vulnerability*). Solo lo ven quienes mantienen el proyecto.

Cuéntanos qué pasa, cómo repetirlo (pasos y un diagrama o documento de ejemplo **con datos ficticios**), qué versión o commit usas y
en qué sistema. Nunca mandes documentos reales de tu trabajo.

Qué puedes esperar:
- Respuesta en **7 días** como máximo, diciendo si lo pudimos repetir.
- Mientras lo arreglamos te contamos cómo va. Cuando salga la versión con el arreglo publicamos un aviso (GitHub Security Advisory)
  y, si quieres, te damos el crédito.
- Pedimos no publicar detalles hasta que el arreglo esté disponible (como regla general, 90 días como máximo).

## Qué cuenta
- Que un **diagrama, un documento, una plantilla (incluida o del catálogo) o una respuesta de la IA** logre ejecutar código en la
  interfaz (XSS), leer o escribir archivos fuera de la carpeta elegida o hacer que la app pida algo a internet.
- Que la IA reciba más de lo que se le pide (contenido de archivos, secretos, rutas) o pueda usar herramientas.
- Cualquier cosa que saque un archivo o su contenido del computador sin que la persona lo pida.
- Problemas en los workflows de GitHub o en cómo se arma la app que permitan colar código.

No cuentan: fallas de tu IA (Claude Code, Codex, Gemini; repórtalas a ellos, salvo que Esquema las exponga de más); ataques que ya
necesitan control total del computador; o encabezados que GitHub Pages no deja configurar en la página pública.

## Cómo nos protegemos
- Todo entra por pull request y lo junta quien mantiene el proyecto, después de leer el diff completo ([CONTRIBUTING.md](CONTRIBUTING.md)).
- Las GitHub Actions están fijadas por SHA, con permisos mínimos, `persist-credentials: false` y sin `pull_request_target`; Dependabot
  propone actualizaciones con unos días de espera (`.github/dependabot.yml`).
- El motor y la interfaz no tienen dependencias (ni de npm ni de un CDN); Python solo con biblioteca estándar. Mermaid se usa solo
  para comparar en `herramientas/comparar_mermaid.mjs`, instalado aparte, nunca dentro de la app.
- La interfaz tiene una Content-Security-Policy estricta (`script-src 'self'`, sin `unsafe-eval` ni scripts en línea, sin
  `connect-src` hacia afuera). Todo texto de un diagrama o documento se escapa antes de dibujarse; de los estilos de Mermaid
  (`classDef`, `style`) solo pasan propiedades y valores conocidos (sin `url()`); `click` y `%%{init}%%` se ignoran; la vista del
  documento no carga imágenes ni insignias de internet y del HTML del Markdown solo pasan unas pocas etiquetas sin atributos.
- La línea `%% esquema: {...}` (posiciones e íconos) se valida campo por campo: lo desconocido se descarta.
- Las apps: la ventana solo carga la interfaz que viene dentro (Mac: solo archivos de `ui/`; Windows y Linux: `esquema://ui/`, con
  `sandbox` y `contextIsolation`, sin Node en la página) y el puente solo atiende a su marco principal. Lo que manda la interfaz
  nunca arma comandos (va en un JSON de entrada), sus rutas se revisan antes de llegar a `bin/` (que las vuelve a revisar) y la
  carpeta solo cambia con el selector del sistema. Electron va con versión exacta, `package-lock.json` y sin scripts de
  instalación. Las actualizaciones se bajan solo de los Releases de `esquema-app/esquema` y se instalan si su SHA-256 coincide.
- Los scripts solo abren y guardan `.md` y `.mmd` dentro de la carpeta elegida (rutas relativas, sin `..`, sin seguir enlaces que
  salgan de ella) y escriben de una vez (archivo temporal + reemplazo). Lo que manda la interfaz llega en un JSON de entrada, nunca
  como argumento de un comando.
- La IA corre en una carpeta temporal vacía, sin herramientas ni MCP (`claude --disallowedTools "*" --strict-mcp-config`,
  `codex -s read-only`) y sin las variables de Esquema. Para el README solo ve nombres de archivos (respetando `.gitignore`, sin
  secretos como `.env`, llaves o credenciales) y unos pocos campos de `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`. Su
  respuesta se limpia, se valida con el motor y nunca se aplica sola: queda como un cambio con «Quitar este cambio».
- Las plantillas (incluidas y del catálogo) son solo datos y se validan con el mismo formato en Python y en la interfaz. Las del
  catálogo se bajan solo cuando la persona abre «Comunidad», solo de `raw.githubusercontent.com/esquema-app/esquema-catalogo`, sin
  seguir redirecciones y con tamaño máximo; cada una se compara con el tamaño y la huella SHA-256 del índice ya validado, se vuelve a
  validar y se guarda en la carpeta de Esquema (nunca en la de la persona).
- **Proyectos:** `bin/proyecto.py` solo lee lo que deja `comun.recorrer` (respeta `.gitignore`, sin secretos ni carpetas pesadas),
  nada binario y con tope de tamaño; lo que va a la IA se muestra antes, entero («Ver lo que se envía»), los archivos de código
  solo van si la persona los aprueba, y lo que parece una clave, un token o una contraseña escrita en el texto se oculta. La IA no
  puede pedir rutas fuera del repo ni escribir fuera de la carpeta de la documentación (`docs/esquema/` o la que se elija, relativa
  y sin `..`). git se llama con argumentos fijos, sin shell, sin hooks (`core.hooksPath` a /dev/null y `--no-verify`), sin
  `core.fsmonitor`, sin preguntar nada por la terminal y sin variables `GIT_*` heredadas; un commit incluye **solo** la carpeta de
  la documentación (`git commit --only -- <docs>`) y nunca se empuja. Las apps solo pasan a `bin/proyecto.py` órdenes conocidas y
  la carpeta actual; un proyecto reciente se abre por su posición en `proyectos.json` (la ruta nunca viene de la interfaz).

---

## Security policy (English)
**Please don't open a public issue.** Report vulnerabilities privately through GitHub:
[**Report a vulnerability**](https://github.com/esquema-app/esquema/security/advisories/new). Include what happens, how to reproduce it
(with **fictional data only**), the version or commit and your OS. We reply within **7 days**, keep you posted, publish a GitHub
Security Advisory with the fix and credit you if you want. Please don't disclose details until a fix is out (90 days at most).

In scope: code execution or XSS through diagrams, documents, templates or AI responses; file access outside the chosen folder; the
app reaching the internet on its own; the AI receiving more than it should or getting tools; CI/build issues that let code slip in.
Out of scope: bugs in your own AI CLI, attacks that already require full control of the device, and headers GitHub Pages can't set.
