# Cómo aportar a Esquema

Esquema es gratis y abierto, y lo hacemos entre todos. Hay lugar para cualquiera, programes o no. *(English below.)*

## Sin programar
- **Crea una plantilla:** un diagrama o un documento que te sirve a ti (arquitectura, secuencia de una API, flujo de usuario,
  proceso de negocio, README, ADR, runbook…). Es un JSON corto con el texto en Mermaid o Markdown (formato en
  [`plantillas/README.md`](plantillas/README.md)). Se comparte en el
  [catálogo de la comunidad](https://github.com/esquema-app/esquema-catalogo): basta con describirla en palabras en el formulario
  [«Proponer una plantilla»](https://github.com/esquema-app/esquema-catalogo/issues/new?template=plantilla.yml) y nosotros armamos
  el JSON. Las del catálogo aparecen en Esquema en «Nuevo» → «Comunidad».
- **Pruébalo con tus diagramas** y cuéntanos qué no se ve bien: un diagrama de Mermaid que Esquema no lea o dibuje distinto es un
  aporte enorme (con datos ficticios). Los issues con la etiqueta [`probar`](https://github.com/esquema-app/esquema/labels/probar) piden justo eso.
- **Conversa:** dudas, ideas o lo que documentaste con Esquema → [Discussions](https://github.com/esquema-app/esquema/discussions).
- **Cuéntanos qué falla o qué te gustaría** en [issues](https://github.com/esquema-app/esquema/issues/new/choose).
- **Traducciones:** revisa o mejora `ui/idiomas/en.json`, o propón otro idioma.

## Programando (con o sin IA)
1. Lee [`AGENTS.md`](AGENTS.md): cómo funciona, reglas y cómo se conectan las piezas. Sirve igual para personas y para tu IA.
2. Haz un fork, una rama y tu cambio. La sección «Desarrollo» del [README](README.md#desarrollo) explica cómo correrlo.
3. Corre `bash pruebas/correr.sh` (lo mismo que revisa GitHub en cada cambio).
4. Si tu cambio se nota (una función nueva, otra forma de hacer algo, otra pantalla), deja al día lo que lo cuenta: el
   README, la página (`docs/`), las capturas y [`CHANGELOG.md`](CHANGELOG.md). Si no sabes bien qué tocar, dilo en el pull
   request y lo completamos nosotros.
5. Abre un pull request contando qué cambia para quien usa Esquema y cómo lo probaste.

Reglas que importan: código, comentarios y textos en español (todo texto nuevo de la interfaz con su traducción en
`ui/idiomas/en.json`); **nunca subas documentos reales ni datos personales**; el motor y la interfaz sin dependencias; Python solo con
biblioteca estándar; lo que Esquema escribe tiene que seguir siendo Mermaid que GitHub muestra (lo propio va en `%% esquema:`).

**Archivos de piezas:** `bin/nucleo.py`, `bin/ia.py` y `ui/i18n.js` vienen de [Pieza](https://github.com/pieza-app/pieza) (están en
`piezas.json`, con el aviso de la MPL-2.0). No los cambies aquí: propón el cambio en Pieza y llega a Esquema con «Pieza al día».

Los aportes entran con la licencia del proyecto, [AGPL-3.0](LICENSE).

## Cómo revisamos
Todo entra por pull request y lo junta alguien que mantiene el proyecto: nadie puede subir cambios directo. Revisamos:
- **Siempre:** que las pruebas de GitHub pasen, que no haya datos personales y que el cambio haga lo que dice. Si es tu primer
  aporte, GitHub espera a que aprobemos correr las pruebas (es normal).
- **Que la documentación diga la verdad:** si el cambio agrega, cambia o quita algo que se nota, revisamos que el
  README, la página, las guías y el `CHANGELOG.md` cuenten la app como queda. Lo que falte lo completamos antes de juntar.
- **Motor:** que la compatibilidad con Mermaid siga (los ejemplos de `pruebas/compat/` se leen y se escriben igual), que no baje el
  rendimiento (`node pruebas/motor.mjs` y, si toca el acomodo, `herramientas/comparar_mermaid.mjs`) y que todo texto se escape.
- **Interfaz:** que funcione con teclado, a 390 px y en claro y oscuro, y que los textos tengan traducción.
- **Plantillas:** que pasen `python3 bin/plantillas.py validar`, que el nombre y la descripción digan lo que son y que no traigan datos
  de nadie.
- **Traducciones:** que una persona que hable el idioma revise el texto.

Si algo falta te lo pedimos con un comentario; casi nunca cerramos un aporte sin conversar.

¿Buscas por dónde empezar? Mira los issues con la etiqueta
[`good first issue`](https://github.com/esquema-app/esquema/labels/good%20first%20issue) (o [`sin programar`](https://github.com/esquema-app/esquema/labels/sin%20programar)) o pregunta en Discussions.

**¿Encontraste una falla de seguridad?** No abras un issue: repórtala en privado como explica [SECURITY.md](SECURITY.md).

Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md).

---

## Contributing (English)
- **No code needed:** create a template (a short JSON file with Mermaid or Markdown text; format in [`plantillas/README.md`](plantillas/README.md)),
  try Esquema with your diagrams and tell us what looks wrong (label `probar`, fictional data only), chat in
  [Discussions](https://github.com/esquema-app/esquema/discussions), report bugs or ideas, and help with translations.
- **Code (with or without AI):** read [`AGENTS.md`](AGENTS.md), fork, branch, run `bash pruebas/correr.sh` and open a pull request.
  Code and comments are in Spanish; UI text needs its English entry in `ui/idiomas/en.json`; never commit real documents or personal data.
  If your change is visible, also update the README, the page (`docs/`), screenshots and `CHANGELOG.md`, or say so in the
  pull request and we'll do it.
- **Piece files:** `bin/nucleo.py`, `bin/ia.py` and `ui/i18n.js` come from [Pieza](https://github.com/pieza-app/pieza) (listed in
  `piezas.json`, MPL-2.0 notice included). Don't change them here: propose the change in Pieza and it arrives through «Pieza al día».
- **Review:** everything goes through a pull request and a maintainer merges it. Contributions are licensed under AGPL-3.0.
  We also check that the README, the page and the docs still describe the app as it is.
- **Security issues:** don't open a public issue; report them privately as explained in [SECURITY.md](SECURITY.md).

## Aportar con los flujos de Pieza

Esta app es parte de la familia de [Pieza](https://github.com/pieza-app/pieza). Instala sus flujos (crear, revisar aportes y las
reglas de seguridad) en tu IA:
- **Claude Code:** `/plugin marketplace add pieza-app/pieza` y `/plugin install pieza@pieza`.
- **Gemini CLI:** `gemini extensions install https://github.com/pieza-app/pieza` (comandos `/pieza:crear` y `/pieza:revisar`).
- **Codex:** clona Pieza y corre `python3 herramientas/pieza.py skills instalar codex` (quedan en `~/.agents/skills`).
- **Otra IA:** sigue `AGENTS.md` y la [tabla de equivalencias](https://github.com/pieza-app/pieza/blob/main/docs/otras-ias.md).

Si mejoras algo que sirve a todas las apps, propónlo en Pieza.
