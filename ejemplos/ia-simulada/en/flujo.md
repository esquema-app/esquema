# {titulo}

What the [Payments API](../elementos.md#el-api-pagos) does with each payment, according to `src/api/pagos.py`.

```mermaid
flowchart TD
    I([A payment arrives]) --> V{Complete data?}
    V -->|No| E[Answers with an error]
    V -->|Yes| A[Payments API]
    A --> B[Banco Ejemplo authorizes]
    B --> G[(Payments database)]
    G --> C{Approved?}
    C -->|Yes| M[Notice to the email queue]
%% esquema: {"refs":{"A":"api-pagos","B":"banco-ejemplo","G":"base-pagos"}}
```

1. If the account or the amount is missing, it answers with an error.
2. It asks [Banco Ejemplo](../elementos.md#el-banco-ejemplo) for the authorization.
3. It saves the result in the [Payments database](../elementos.md#el-base-pagos) and, if approved, leaves the notice for the receipt.
