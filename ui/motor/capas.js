// Motor de Esquema · acomodo por capas (estilo Sugiyama) de un grafo dirigido, de arriba hacia abajo.
// 1) quita ciclos (da vuelta las flechas que vuelven), 2) asigna capas (camino más largo y fuentes cerca de sus destinos),
// 3) agrega puntos de paso para flechas largas y para sus etiquetas (así una etiqueta nunca pisa un nodo), 4) ordena cada capa con
// el baricentro y trasposiciones para cruzar lo menos posible, 5) coordenadas: cada nodo lo más cerca posible de sus vecinos sin
// solaparse (regresión isotónica, óptima para un orden fijo). Sin dependencias; arreglos planos para que 1000 nodos tomen pocos ms.
(function (M) {
  "use strict";

  /** Cuenta cruces entre dos capas: aristas (i en la de arriba, j en la de abajo) → inversiones de j ordenando por i (Fenwick). */
  function cruces(pares, n) {
    if (pares.length < 2) return 0;
    pares.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const arbol = new Int32Array(n + 1);
    let total = 0, vistos = 0;
    for (const [, j] of pares) {
      let s = 0;
      for (let k = j + 1; k > 0; k -= k & -k) s += arbol[k];
      total += vistos - s;
      for (let k = j + 1; k <= n; k += k & -k) arbol[k]++;
      vistos++;
    }
    return total;
  }

  /** Regresión isotónica con pesos (pool adjacent violators): y no decreciente, lo más cerca posible de t. */
  function isotonica(t, w) {
    const n = t.length, suma = [], peso = [], cuenta = [];
    for (let i = 0; i < n; i++) {
      suma.push(t[i] * w[i]); peso.push(w[i]); cuenta.push(1);
      while (suma.length > 1 && suma[suma.length - 2] / peso[peso.length - 2] > suma[suma.length - 1] / peso[peso.length - 1]) {
        const s = suma.pop(), p = peso.pop(), c = cuenta.pop();
        suma[suma.length - 1] += s; peso[peso.length - 1] += p; cuenta[cuenta.length - 1] += c;
      }
    }
    const y = new Float64Array(n);
    let k = 0;
    for (let b = 0; b < suma.length; b++) { const v = suma[b] / peso[b]; for (let c = 0; c < cuenta[b]; c++) y[k++] = v; }
    return y;
  }

  /**
   * grafo: {nodos: [{id, w, h}], aristas: [{id, de, a, minlen?, etq?: {w, h}}]}
   * opciones: {sepNodos, sepCapas}
   * Devuelve {pos: Map id → {x, y}, aristas: Map id → {puntos: [{x, y}], etq: {x, y} | null, invertida}, bucles: [ids], ancho, alto}
   */
  M.capas = function (grafo, opciones = {}) {
    const sepNodos = opciones.sepNodos ?? 40, sepCapasBase = opciones.sepCapas ?? 56;
    const N0 = grafo.nodos.length;
    const idx = new Map();
    grafo.nodos.forEach((n, i) => idx.set(n.id, i));
    // Vértices: reales primero, después los puntos de paso (dummies).
    const W = [], H = [], esReal = [];
    for (const n of grafo.nodos) { W.push(n.w); H.push(n.h); esReal.push(true); }
    const bucles = [];
    const aristas = [];
    const conEtiqueta = grafo.aristas.some((e) => e.etq);
    const factor = conEtiqueta ? 2 : 1;
    for (const e of grafo.aristas) {
      const u = idx.get(e.de), v = idx.get(e.a);
      if (u === undefined || v === undefined) continue;
      if (u === v) { bucles.push(e.id); continue; }
      aristas.push({ id: e.id, u, v, minlen: Math.max(1, e.minlen || 1) * factor, etq: e.etq || null, invertida: false });
    }
    // 1) Ciclos: DFS iterativo en el orden en que se escribieron los nodos; lo que vuelve a la pila se da vuelta.
    const salida = Array.from({ length: N0 }, () => []);
    aristas.forEach((e, k) => salida[e.u].push(k));
    const estado = new Uint8Array(N0);
    for (let r = 0; r < N0; r++) {
      if (estado[r]) continue;
      const pila = [[r, 0]]; estado[r] = 1;
      while (pila.length) {
        const tope = pila[pila.length - 1], [u, i] = tope;
        if (i < salida[u].length) {
          tope[1]++;
          const e = aristas[salida[u][i]], v = e.v;
          if (estado[v] === 1) e.invertida = true;
          else if (estado[v] === 0) { estado[v] = 1; pila.push([v, 0]); }
        } else { estado[u] = 2; pila.pop(); }
      }
    }
    for (const e of aristas) if (e.invertida) { const t = e.u; e.u = e.v; e.v = t; }
    // 2) Capas: camino más largo (Kahn) y después cada fuente baja hasta quedar justo arriba de su destino más cercano.
    const sal = Array.from({ length: N0 }, () => []), ent = Array.from({ length: N0 }, () => []);
    aristas.forEach((e, k) => { sal[e.u].push(k); ent[e.v].push(k); });
    const grado = ent.map((l) => l.length), capa = new Int32Array(N0), topo = [];
    const cola = [];
    for (let i = 0; i < N0; i++) if (!grado[i]) cola.push(i);
    for (let q = 0; q < cola.length; q++) {
      const u = cola[q]; topo.push(u);
      for (const k of sal[u]) { const e = aristas[k]; capa[e.v] = Math.max(capa[e.v], capa[u] + e.minlen); if (--grado[e.v] === 0) cola.push(e.v); }
    }
    for (let q = topo.length - 1; q >= 0; q--) {
      const u = topo[q];
      if (ent[u].length || !sal[u].length) continue;
      let m = Infinity;
      for (const k of sal[u]) m = Math.min(m, capa[aristas[k].v] - aristas[k].minlen);
      if (m !== Infinity && m > capa[u]) capa[u] = m;
    }
    // Puertos de un grupo (por donde una flecha entra o sale de él): al principio o al final de todo.
    const extremo = grafo.nodos.map((n) => n.extremo || null);
    if (extremo.some(Boolean)) {
      let maxC = 0;
      for (let i = 0; i < N0; i++) if (!extremo[i]) maxC = Math.max(maxC, capa[i]);
      for (let i = 0; i < N0; i++) if (extremo[i] === "fin") { let c = maxC; for (const k of ent[i]) c = Math.max(c, capa[aristas[k].u] + aristas[k].minlen); capa[i] = c; }
      let minC = 0;
      for (let i = 0; i < N0; i++) if (extremo[i] === "inicio") { let c = 0; for (const k of sal[i]) c = Math.min(c, capa[aristas[k].v] - aristas[k].minlen); capa[i] = c; minC = Math.min(minC, c); }
      if (minC < 0) for (let i = 0; i < N0; i++) capa[i] -= minC;
    }
    // 3) Puntos de paso: una cadena por arista larga; la etiqueta va en el del medio con su tamaño.
    const capaDe = Array.from(capa);
    const cadenas = [];  // por arista: [u, d1, d2, …, v]
    const etqVert = [];
    for (const e of aristas) {
      const cad = [e.u];
      const ini = capaDe[e.u], fin = capaDe[e.v];
      const medio = e.etq ? ini + Math.max(1, Math.floor((fin - ini) / 2)) : -1;
      let etq = -1;
      for (let c = ini + 1; c < fin; c++) {
        const d = W.length;
        const esEtq = c === medio;
        W.push(esEtq ? e.etq.w : 0); H.push(esEtq ? e.etq.h : 0); esReal.push(false); capaDe.push(c);
        if (esEtq) etq = d;
        cad.push(d);
      }
      cad.push(e.v);
      cadenas.push(cad); etqVert.push(etq);
    }
    const V = W.length;
    const arriba = Array.from({ length: V }, () => []), abajo = Array.from({ length: V }, () => []);
    for (const cad of cadenas) for (let i = 0; i + 1 < cad.length; i++) { abajo[cad[i]].push(cad[i + 1]); arriba[cad[i + 1]].push(cad[i]); }
    let nCapas = 0;
    for (let i = 0; i < V; i++) nCapas = Math.max(nCapas, capaDe[i] + 1);
    let capas = Array.from({ length: nCapas }, () => []);
    // Orden inicial: recorrido en profundidad desde las fuentes, en el orden escrito (lo que se escribe junto queda junto).
    const visto = new Uint8Array(V);
    const visitar = (r) => {
      const pila = [r];
      while (pila.length) {
        const u = pila.pop();
        if (visto[u]) continue;
        visto[u] = 1; capas[capaDe[u]].push(u);
        for (let k = abajo[u].length - 1; k >= 0; k--) if (!visto[abajo[u][k]]) pila.push(abajo[u][k]);
      }
    };
    for (let i = 0; i < N0; i++) if (!arriba[i].length) visitar(i);
    for (let i = 0; i < V; i++) if (!visto[i]) visitar(i);
    const pos = new Float64Array(V);
    const fijarPos = () => { for (const L of capas) L.forEach((v, i) => { pos[v] = i; }); };
    fijarPos();
    // 4) Cruces: barrido de baricentros hacia abajo y hacia arriba; se guarda el mejor orden.
    const crucesTotal = () => {
      let t = 0;
      for (let c = 0; c + 1 < nCapas; c++) {
        const pares = [];
        for (const u of capas[c]) for (const v of abajo[u]) pares.push([pos[u], pos[v]]);
        t += cruces(pares, capas[c + 1].length);
      }
      return t;
    };
    const barrer = (c, vecinos) => {
      const L = capas[c];
      const bc = new Map();
      for (const v of L) {
        const vs = vecinos[v];
        if (!vs.length) { bc.set(v, pos[v]); continue; }
        let s = 0; for (const u of vs) s += pos[u];
        bc.set(v, s / vs.length);
      }
      L.sort((a, b) => bc.get(a) - bc.get(b) || pos[a] - pos[b]);
      L.forEach((v, i) => { pos[v] = i; });
    };
    // Trasposición: cambia vecinos de capa si así se cruzan menos (solo en grafos chicos: es lo más caro).
    const crucesPar = (u, v) => {
      let c = 0;
      for (const vec of [arriba, abajo]) for (const a of vec[u]) for (const b of vec[v]) if (pos[a] > pos[b]) c++;
      return c;
    };
    const trasponer = () => {
      let mejoro = true, vueltas = 0;
      while (mejoro && vueltas++ < 4) {
        mejoro = false;
        for (const L of capas) for (let i = 0; i + 1 < L.length; i++) {
          const u = L[i], v = L[i + 1];
          if (crucesPar(u, v) > crucesPar(v, u)) { L[i] = v; L[i + 1] = u; pos[v] = i; pos[u] = i + 1; mejoro = true; }
        }
      }
    };
    let mejor = crucesTotal(), mejorOrden = capas.map((L) => L.slice());
    const iter = V < 600 ? 24 : V < 4000 ? 8 : 3;
    let sinMejora = 0;
    for (let it = 0; it < iter && mejor > 0 && sinMejora < 5; it++) {
      if (it % 2 === 0) for (let c = 1; c < nCapas; c++) barrer(c, arriba);
      else for (let c = nCapas - 2; c >= 0; c--) barrer(c, abajo);
      if (V < 400) trasponer();
      const t = crucesTotal();
      if (t < mejor) { mejor = t; mejorOrden = capas.map((L) => L.slice()); sinMejora = 0; } else sinMejora++;
    }
    capas = mejorOrden; fijarPos();
    // 5) Coordenadas x: cada vértice cerca del promedio de sus vecinos, sin solaparse, respetando el orden.
    const x = new Float64Array(V);
    const sep = (a, b) => (esReal[a] && esReal[b] ? sepNodos : esReal[a] || esReal[b] ? sepNodos / 2 : 10) + (W[a] + W[b]) / 2;
    for (const L of capas) { let acc = 0; L.forEach((v, i) => { if (i) acc += sep(L[i - 1], v); x[v] = acc; }); const m = acc / 2; for (const v of L) x[v] -= m; }
    // Peso de cada tramo: los tramos entre puntos de paso pesan más (así las flechas largas quedan rectas).
    const pesoTramo = (a, b) => (!esReal[a] && !esReal[b] ? 8 : !esReal[a] || !esReal[b] ? 2 : 1);
    const ubicar = (L, refs) => {
      if (!L.length) return;
      const n = L.length, t = new Float64Array(n), w = new Float64Array(n), off = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const v = L[i];
        if (i) off[i] = off[i - 1] + sep(L[i - 1], v);
        let s = 0, p = 0;
        for (const vec of refs) for (const u of vec[v]) { const pw = pesoTramo(u, v); s += x[u] * pw; p += pw; }
        if (p) { t[i] = s / p - off[i]; w[i] = p; } else { t[i] = x[v] - off[i]; w[i] = 0.05; }
      }
      const y = isotonica(t, w);
      for (let i = 0; i < n; i++) x[L[i]] = y[i] + off[i];
    };
    const vueltas = V < 3000 ? 6 : 3;
    for (let r = 0; r < vueltas; r++) {
      for (let c = 1; c < nCapas; c++) ubicar(capas[c], [arriba]);
      for (let c = nCapas - 2; c >= 0; c--) ubicar(capas[c], [abajo]);
    }
    for (let c = 0; c < nCapas; c++) ubicar(capas[c], [arriba, abajo]);
    // y por capa: cada capa tan alta como su vértice más alto.
    const sepCapas = conEtiqueta ? sepCapasBase / 2 : sepCapasBase;
    const altoCapa = capas.map((L) => L.reduce((m, v) => Math.max(m, H[v]), 0));
    const yCapa = new Float64Array(nCapas);
    let acc = 0;
    for (let c = 0; c < nCapas; c++) { const h = altoCapa[c]; yCapa[c] = acc + h / 2; acc += h + (h > 4 || c + 1 === nCapas ? sepCapas : sepCapas / 2); }
    let minX = Infinity, maxX = -Infinity;
    for (let v = 0; v < V; v++) { minX = Math.min(minX, x[v] - W[v] / 2); maxX = Math.max(maxX, x[v] + W[v] / 2); }
    if (!V) { minX = 0; maxX = 0; }
    const P = (v) => ({ x: x[v] - minX, y: yCapa[capaDe[v]] });
    const res = { pos: new Map(), aristas: new Map(), bucles, ancho: maxX - minX, alto: nCapas ? yCapa[nCapas - 1] + altoCapa[nCapas - 1] / 2 : 0, cruces: mejor };
    grafo.nodos.forEach((n, i) => res.pos.set(n.id, P(i)));
    aristas.forEach((e, k) => {
      let pts = cadenas[k].slice(1, -1).map(P);
      if (e.invertida) pts = pts.reverse();
      res.aristas.set(e.id, { puntos: pts, etq: etqVert[k] >= 0 ? P(etqVert[k]) : null, invertida: e.invertida });
    });
    return res;
  };
  M._cruces = cruces;
  M._isotonica = isotonica;
})(globalThis.EsquemaMotor = globalThis.EsquemaMotor || {});
