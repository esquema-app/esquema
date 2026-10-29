# La IA simulada de la vista previa

Lo que «responde» la IA en la vista previa del navegador (sin app ni IA de verdad) cuando se documenta la carpeta de ejemplo
(`ejemplos/proyecto-ejemplo`). `herramientas/generar_demo.py` lo pone en `ui/demo.json` (`proyecto.ia`). Todo es ficticio.

- `<idioma>/*.md` y `<idioma>/flujos/*.md`: la documentación inicial (con enlaces a elementos y `%% esquema: {"refs": …}`).
- `<idioma>/flujo.md`: el flujo que se documenta después de leer `src/api/pagos.py` (`{titulo}` es lo que pidió la persona).
- `<idioma>/ia.json`: los elementos, los títulos de los documentos y las notas.
- `<idioma>/agregar.json`: lo que responde al agregar algo (`ejemplos/agregar/`): una historia de usuario con sus rondas de preguntas
  y «Cómo quedó», un documento, y un libro (resúmenes por capítulo, personajes y conceptos, mapa de ideas, material de estudio e
  incongruencias).
