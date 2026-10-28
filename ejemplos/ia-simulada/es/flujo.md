# {titulo}

Lo que hace la [API de pagos](../elementos.md#el-api-pagos) con cada pago, según `src/api/pagos.py`.

```mermaid
flowchart TD
    I([Llega el pago]) --> V{¿Datos completos?}
    V -->|No| E[Responde con un error]
    V -->|Sí| A[API de pagos]
    A --> B[Banco Ejemplo autoriza]
    B --> G[(Base de pagos)]
    G --> C{¿Aprobado?}
    C -->|Sí| M[Aviso a la cola de correos]
%% esquema: {"refs":{"A":"api-pagos","B":"banco-ejemplo","G":"base-pagos"}}
```

1. Si falta la cuenta o el monto, responde con un error.
2. Pide la autorización a [Banco Ejemplo](../elementos.md#el-banco-ejemplo).
3. Guarda el resultado en la [Base de pagos](../elementos.md#el-base-pagos) y, si se aprobó, deja el aviso para el comprobante.
