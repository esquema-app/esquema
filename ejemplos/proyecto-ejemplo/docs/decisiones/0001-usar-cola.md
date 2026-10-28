# 1. Usar una cola para los correos

- **Estado:** aceptada
- **Fecha:** 2026-03-12
- **Quién:** Matías Soto

## Contexto

Cuando el servicio de correo se demora, la API de pagos también se demora y algunas personas pagan dos veces.

## Decisión

La API deja el aviso en una cola y sigue; el servicio de correo lo envía cuando puede.

```mermaid
sequenceDiagram
    participant A as API de pagos
    participant Q as Cola
    participant C as Correo
    A-)Q: Pago aprobado
    Note right of A: La API responde sin esperar
    Q->>C: Enviar comprobante
    C-->>Q: Enviado
```

## Consecuencias

- Los pagos responden en menos de un segundo aunque el correo falle.
- Hay que vigilar que la cola no crezca: alerta si pasa de 1.000 avisos.
