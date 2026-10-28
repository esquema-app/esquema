# Pagos de Banco Ejemplo

Servicio ficticio para pagar cuentas desde la web. Una persona como Ana Pérez entra a la [Pantalla de pago](elementos.md#el-pantalla-pago), revisa el monto y toca [Pagar](elementos.md#el-boton-pagar).

## Qué hace

- La [API de pagos](elementos.md#el-api-pagos) valida el pedido y pide la autorización a [Banco Ejemplo](elementos.md#el-banco-ejemplo).
- Guarda cada pago en la [Base de pagos](elementos.md#el-base-pagos).
- Si el pago se aprueba, el [Servicio de correo](elementos.md#el-servicio-correo) manda el comprobante.

## Documentos

- [Arquitectura](arquitectura.md)
- [Pagar una cuenta](flujos/pagar-una-cuenta.md)
- [Recibir el comprobante](flujos/recibir-el-comprobante.md)
- [Elementos](elementos.md)
