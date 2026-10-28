# Architecture

The [Payment screen](elementos.md#el-pantalla-pago) only talks to the [Payments API](elementos.md#el-api-pagos); the API is the only one that talks to [Banco Ejemplo](elementos.md#el-banco-ejemplo) and the database.

```mermaid
flowchart LR
    P([Person]) --> W[Payment screen]
    W -->|HTTPS| A[Payments API]
    A --> B[Banco Ejemplo]
    A --> D[(Payments database)]
    A -.-> C[Email service]
%% esquema: {"iconos":{"A":"servidor","B":"nube","C":"correo","D":"base-de-datos","P":"persona","W":"navegador"},"refs":{"A":"api-pagos","B":"banco-ejemplo","C":"servicio-correo","D":"base-pagos","P":"persona","W":"pantalla-pago"}}
```
