"""Servicio de correo (ficticio): toma los avisos de la cola y manda el comprobante."""
COLA = []


def avisar(cuenta):
    COLA.append({"cuenta": cuenta, "tipo": "comprobante"})
