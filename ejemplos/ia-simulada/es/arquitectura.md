# Arquitectura

La [Pantalla de pago](elementos.md#el-pantalla-pago) habla solo con la [API de pagos](elementos.md#el-api-pagos); la API es la única que conversa con [Banco Ejemplo](elementos.md#el-banco-ejemplo) y con la base.

```mermaid
flowchart LR
    P([Persona]) --> W[Pantalla de pago]
    W -->|HTTPS| A[API de pagos]
    A --> B[Banco Ejemplo]
    A --> D[(Base de pagos)]
    A -.-> C[Servicio de correo]
%% esquema: {"iconos":{"A":"servidor","B":"nube","C":"correo","D":"base-de-datos","P":"persona","W":"navegador"},"refs":{"A":"api-pagos","B":"banco-ejemplo","C":"servicio-correo","D":"base-pagos","P":"persona","W":"pantalla-pago"}}
```
