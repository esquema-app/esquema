# Plantillas de Esquema

Una plantilla es **solo datos**: un JSON con el texto de un diagrama (Mermaid) o de un documento (Markdown), su nombre y su
descripción en cada idioma. Nunca ejecuta nada. Las incluidas viven aquí (`plantillas/<categoria>/<id>.json`); las de la comunidad,
en el [catálogo](https://github.com/esquema-app/esquema-catalogo) `esquema-app/esquema-catalogo` (mismo formato, con un `index.json`
que arma `plantilla_formato.indice`) y se descargan desde «Nuevo» → «Comunidad».

```json
{
  "formato": 1,
  "id": "aplicacion-web",
  "categoria": "arquitectura",
  "tipo": "diagrama",
  "nombre": { "es": "Aplicación web", "en": "Web application" },
  "descripcion": { "es": "Navegador, API y base de datos.", "en": "Browser, API and database." },
  "archivo": { "es": "arquitectura.mmd", "en": "architecture.mmd" },
  "contenido": { "es": "flowchart LR\n    …", "en": "flowchart LR\n    …" },
  "autor": "Ana Pérez",
  "etiquetas": ["web"]
}
```

| Campo | Qué es |
|---|---|
| `formato` | Siempre `1` (si cambia el formato, sube y la app migra). |
| `id` | Minúsculas, números y guiones, hasta 60. El archivo se llama `<id>.json`. |
| `categoria` | `arquitectura`, `secuencia`, `flujo-de-usuario`, `proceso` o `documentacion`; es también la carpeta. |
| `tipo` | `diagrama` (se crea un `.mmd`) o `documento` (un `.md`). |
| `nombre`, `descripcion` | Textos por idioma (`es` obligatorio): hasta 80 y 200 caracteres. |
| `archivo` | Nombre sugerido por idioma: letras, números, `_` y `-`, terminado en `.mmd` o `.md` según el tipo. |
| `contenido` | El texto por idioma, hasta 20.000 caracteres. Mermaid del [subconjunto que Esquema dibuja](../AGENTS.md#subconjunto-de-mermaid). Íconos de arquitectura con `%% esquema: {"iconos": {…}}`. |
| `autor`, `etiquetas` | Opcionales. |

Validar: `python3 bin/plantillas.py validar plantillas/*/*.json`. La misma regla está en `bin/plantilla_formato.py` (que es el mismo
archivo en el catálogo) y en `ui/app.js` (`validarPlantilla`), con casos compartidos en `pruebas/casos.json`.
Usa siempre datos ficticios.
