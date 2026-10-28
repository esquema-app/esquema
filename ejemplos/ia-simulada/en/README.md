# Banco Ejemplo payments

A made-up service to pay bills on the web. Someone like Ana Pérez opens the [Payment screen](elementos.md#el-pantalla-pago), checks the amount and taps [Pay](elementos.md#el-boton-pagar).

## What it does

- The [Payments API](elementos.md#el-api-pagos) checks the request and asks [Banco Ejemplo](elementos.md#el-banco-ejemplo) to authorize it.
- It saves every payment in the [Payments database](elementos.md#el-base-pagos).
- When the payment is approved, the [Email service](elementos.md#el-servicio-correo) sends the receipt.

## Documents

- [Architecture](arquitectura.md)
- [Pay a bill](flujos/pagar-una-cuenta.md)
- [Get the receipt](flujos/recibir-el-comprobante.md)
- [Elements](elementos.md)
