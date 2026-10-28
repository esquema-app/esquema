"""API de pagos (ficticia): valida el pedido, pide la autorización a Banco Ejemplo y deja el aviso del comprobante en la cola."""
from correo import avisar


def pagar(pedido, banco, base):
    if not pedido.get("cuenta") or not pedido.get("monto"):
        return {"error": "Faltan datos"}, 400
    aprobado = banco.autorizar(pedido["cuenta"], pedido["monto"])
    base.guardar(pedido, aprobado)
    if aprobado:
        avisar(pedido["cuenta"])
    return {"aprobado": aprobado}, 201
