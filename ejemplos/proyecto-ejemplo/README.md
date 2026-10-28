# Pagos de Banco Ejemplo

Servicio ficticio de pagos que usa la demo de Esquema. Lo mantiene Ana Pérez, junto a Matías Soto.

> [!NOTE]
> Todo en esta carpeta es inventado: sirve para probar Esquema sin tocar tus archivos.

## Cómo funciona

Una persona paga desde la app; la API lo registra y avisa por correo.

```mermaid
flowchart LR
    P([Persona]) --> W[App web]
    W -->|HTTPS| A{{API de pagos}}
    A --> D[(Base de datos)]
    A -.->|pago aprobado| Q[Cola de correos]
    Q --> C[Servicio de correo]
%% esquema: {"iconos":{"A":"api","C":"correo","P":"persona","Q":"cola","W":"navegador"}}
```

## Un pago, paso a paso

```mermaid
sequenceDiagram
    actor P as Ana Pérez
    participant W as App web
    participant A as API
    participant B as Banco Ejemplo
    P->>W: Paga $12.990
    W->>+A: POST /pagos
    A->>B: Autoriza la tarjeta
    B-->>A: Aprobado
    A-->>-W: 201 Creado
    W-->>P: ¡Listo!
```

## Documentos

- [Arquitectura](docs/arquitectura.mmd)
- [Flujo de un pago](docs/pago.mmd)
- [Decisión: usar una cola para los correos](docs/decisiones/0001-usar-cola.md)

## Licencia

AGPL-3.0
