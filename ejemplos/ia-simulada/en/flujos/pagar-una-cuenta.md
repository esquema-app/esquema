# Pay a bill

The person picks what to pay on the [Payment screen](../elementos.md#el-pantalla-pago) and taps [Pay](../elementos.md#el-boton-pagar). The [Payments API](../elementos.md#el-api-pagos) asks for the authorization and answers in less than a second.

```mermaid
sequenceDiagram
    actor P as Person
    participant W as Payment screen
    participant A as Payments API
    participant B as Banco Ejemplo
    P->>W: Taps Pay
    W->>+A: POST /pagos
    A->>B: Authorize the card
    B-->>A: Approved
    A-->>-W: 201 Created
    W-->>P: Done!
%% esquema: {"refs":{"A":"api-pagos","B":"banco-ejemplo","P":"persona","W":"pantalla-pago"}}
```
