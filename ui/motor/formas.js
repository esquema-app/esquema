// Motor de Esquema · formas de los nodos e íconos propios (trazos simples, se ven bien en claro y oscuro porque usan currentColor).
(function (M) {
  "use strict";
  const f = (n) => Math.round(n * 10) / 10;

  /** Tamaño de un nodo para un texto de tw × th (px). */
  M.tamanoForma = function (forma, tw, th) {
    let w = tw + 32, h = th + 20;
    switch (forma) {
      case "rombo": w = tw / 0.6 + 18; h = Math.max(48, th / 0.42 + 6); break;
      case "circulo": w = h = Math.max(44, Math.hypot(tw, th) + 16); break;
      case "doble-circulo": w = h = Math.max(52, Math.hypot(tw, th) + 26); break;
      case "hexagono": w = tw + h / 2 + 30; break;
      case "paralelogramo": case "paralelogramo-inv": case "trapecio": case "trapecio-inv": w = tw + h * 0.7 + 30; break;
      case "asimetrico": w = tw + h / 2 + 30; break;
      case "estadio": w = tw + h + 6; break;
      case "cilindro": h = th + 40; break;
      case "cilindro-h": w = tw + 52; break;
      case "documento": h = th + 30; break;
      case "nube": w = tw * 1.25 + 40; h = th * 1.4 + 30; break;
      case "inicio": w = h = 20; break;
      case "fin": w = h = 24; break;
    }
    return { w: Math.max(w, forma === "inicio" || forma === "fin" ? w : 56), h: Math.max(h, forma === "inicio" || forma === "fin" ? h : 40) };
  };
  /** Las formas sin texto adentro (el punto de inicio y el de fin). */
  M.sinTexto = (forma) => forma === "inicio" || forma === "fin";

  /** Medio alto de la forma a una distancia `off` del centro, en el eje cruzado (para que las flechas lleguen justo al borde). */
  M.medioAlto = function (forma, a, l, off) {
    // a: ancho en el eje cruzado, l: largo en el eje de la flecha
    const o = Math.min(Math.abs(off), a / 2);
    switch (forma) {
      case "rombo": return (l / 2) * (1 - o / (a / 2));
      case "circulo": case "doble-circulo": case "inicio": case "fin": { const r = a / 2; return Math.sqrt(Math.max(0, r * r - o * o)); }
      case "nube": return (l / 2) * 0.86 * Math.sqrt(Math.max(0, 1 - (o / (a / 2)) ** 2 * 0.6));
      default: return l / 2;
    }
  };

  /** El SVG de la forma, centrada en 0,0. `estilo` ya viene validado y escapado. */
  M.dibujarForma = function (forma, w, h, estilo = "") {
    const x = -w / 2, y = -h / 2, st = estilo ? ` style="${estilo}"` : "";
    const poli = (pts) => `<polygon class="forma" points="${pts.map((p) => p.map(f).join(",")).join(" ")}"${st}/>`;
    const k = h * 0.35;
    switch (forma) {
      case "redondeado": return `<rect class="forma" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="12"${st}/>`;
      case "estadio": return `<rect class="forma" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}"${st}/>`;
      case "subrutina": return `<rect class="forma" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="3"${st}/><path class="linea" d="M${f(x + 8)},${f(y)}V${f(-y)}M${f(-x - 8)},${f(y)}V${f(-y)}"${st}/>`;
      case "cilindro": {
        const ry = Math.min(9, h * 0.14);
        return `<path class="forma" d="M${f(x)},${f(y + ry)}A${f(w / 2)},${f(ry)} 0 0 1 ${f(-x)},${f(y + ry)}V${f(-y - ry)}A${f(w / 2)},${f(ry)} 0 0 1 ${f(x)},${f(-y - ry)}Z"${st}/><path class="linea" d="M${f(x)},${f(y + ry)}A${f(w / 2)},${f(ry)} 0 0 0 ${f(-x)},${f(y + ry)}"${st}/>`;
      }
      case "cilindro-h": {
        const rx = Math.min(10, w * 0.12);
        return `<path class="forma" d="M${f(x + rx)},${f(y)}H${f(-x - rx)}A${f(rx)},${f(h / 2)} 0 0 1 ${f(-x - rx)},${f(-y)}H${f(x + rx)}A${f(rx)},${f(h / 2)} 0 0 1 ${f(x + rx)},${f(y)}Z"${st}/><path class="linea" d="M${f(-x - rx)},${f(y)}A${f(rx)},${f(h / 2)} 0 0 0 ${f(-x - rx)},${f(-y)}"${st}/>`;
      }
      case "circulo": return `<circle class="forma" r="${f(w / 2)}"${st}/>`;
      case "doble-circulo": return `<circle class="forma" r="${f(w / 2)}"${st}/><circle class="linea" r="${f(w / 2 - 5)}"${st}/>`;
      case "inicio": return `<circle class="forma lleno" r="${f(w / 2)}"${st}/>`;
      case "fin": return `<circle class="forma" r="${f(w / 2)}"${st}/><circle class="forma lleno" r="${f(w / 2 - 5)}"${st}/>`;
      case "rombo": return poli([[0, y], [-x, 0], [0, -y], [x, 0]]);
      case "hexagono": { const e = h / 4; return poli([[x + e, y], [-x - e, y], [-x, 0], [-x - e, -y], [x + e, -y], [x, 0]]); }
      case "paralelogramo": return poli([[x + k, y], [-x, y], [-x - k, -y], [x, -y]]);
      case "paralelogramo-inv": return poli([[x, y], [-x - k, y], [-x, -y], [x + k, -y]]);
      case "trapecio": return poli([[x + k, y], [-x - k, y], [-x, -y], [x, -y]]);
      case "trapecio-inv": return poli([[x, y], [-x, y], [-x - k, -y], [x + k, -y]]);
      case "asimetrico": return poli([[x, y], [-x, y], [-x, -y], [x, -y], [x + h / 2.6, 0]]);
      case "documento": {
        const o = 7;
        return `<path class="forma" d="M${f(x)},${f(y)}H${f(-x)}V${f(-y - o)}C${f(-x - w / 4)},${f(-y - o * 2.4)} ${f(w / 4)},${f(-y + o * 1.6)} 0,${f(-y - o)}S${f(x + w / 4)},${f(-y + o * 0.4)} ${f(x)},${f(-y - o)}Z"${st}/>`;
      }
      case "nube": {
        const a = w / 2, b = h / 2;
        return `<path class="forma" d="M${f(-a * 0.62)},${f(b * 0.72)}C${f(-a * 1.08)},${f(b * 0.72)} ${f(-a * 1.08)},${f(-b * 0.12)} ${f(-a * 0.7)},${f(-b * 0.2)}C${f(-a * 0.7)},${f(-b * 0.95)} ${f(-a * 0.08)},${f(-b * 1.05)} ${f(a * 0.08)},${f(-b * 0.6)}C${f(a * 0.3)},${f(-b * 1.05)} ${f(a * 0.95)},${f(-b * 0.85)} ${f(a * 0.78)},${f(-b * 0.15)}C${f(a * 1.1)},${f(-b * 0.05)} ${f(a * 1.08)},${f(b * 0.72)} ${f(a * 0.62)},${f(b * 0.72)}Z"${st}/>`;
      }
      default: return `<rect class="forma" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="5"${st}/>`;
    }
  };

  // Íconos de arquitectura (16×16, trazo). Propios y simples: se leen a cualquier tamaño.
  const ICONOS = {
    servidor: "M2.5 2.5h11v4.5h-11zM2.5 9h11v4.5h-11zM5 4.75h.01M5 11.25h.01",
    "base-de-datos": "M2.5 3.5c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2v9c0 1.1-2.5 2-5.5 2s-5.5-.9-5.5-2zM2.5 3.5c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2",
    cola: "M1.5 4.5h13v7h-13zM5 4.5v7M8.5 4.5v7M12 4.5v7",
    persona: "M8 7.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5",
    nube: "M4.5 12.5h7.5a3 3 0 0 0 .3-6 4.3 4.3 0 0 0-8.3.9A2.6 2.6 0 0 0 4.5 12.5z",
    navegador: "M1.5 2.5h13v11h-13zM1.5 5.5h13M3.5 4h.01M5.5 4h.01",
    movil: "M4.5 1.5h7v13h-7zM7 12.5h2",
    funcion: "M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z",
    almacenamiento: "M1.5 4.5 3 2h10l1.5 2.5v9h-13zM1.5 4.5h13M6 8h4",
    candado: "M3.5 7h9v7h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2",
    balanceador: "M8 2v12M3 5h10M3 5 1.5 9h3zM13 5l-1.5 4h3zM5.5 14h5",
    correo: "M1.5 3.5h13v9h-13zM1.5 3.5 8 9l6.5-5.5",
    reloj: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5",
    engranaje: "M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
    api: "M5 4 1.5 8 5 12M11 4l3.5 4L11 12M9.5 2.5l-3 11",
    red: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM1.5 8h13M8 1.5c-2.2 2-2.2 11 0 13M8 1.5c2.2 2 2.2 11 0 13",
  };
  M.ICONOS = Object.keys(ICONOS);
  M.dibujarIcono = function (nombre, x, y, tam = 16) {
    const d = ICONOS[nombre];
    if (!d) return "";
    const e = tam / 16;
    return `<path class="icono" transform="translate(${f(x)},${f(y)}) scale(${f(e)})" d="${d}"/>`;
  };
  /** Ícono suelto (para botones de la interfaz): SVG completo de 16×16. */
  M.iconoSVG = (nombre) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" class="ic">${M.dibujarIcono(nombre, 0, 0)}</svg>`;
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
