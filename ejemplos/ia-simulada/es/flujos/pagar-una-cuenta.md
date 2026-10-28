# Pagar una cuenta

La persona elige qué pagar en la [Pantalla de pago](../elementos.md#el-pantalla-pago) y toca [Pagar](../elementos.md#el-boton-pagar). La [API de pagos](../elementos.md#el-api-pagos) pide la autorización y responde en menos de un segundo.

```mermaid
sequenceDiagram
    actor P as Persona
    participant W as Pantalla de pago
    participant A as API de pagos
    participant B as Banco Ejemplo
    P->>W: Toca Pagar
    W->>+A: POST /pagos
    A->>B: Autoriza la tarjeta
    B-->>A: Aprobado
    A-->>-W: 201 Creado
    W-->>P: ¡Listo!
%% esquema: {"refs":{"A":"api-pagos","B":"banco-ejemplo","P":"persona","W":"pantalla-pago"}}
```
