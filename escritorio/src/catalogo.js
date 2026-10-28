// Plantillas de la comunidad (repo esquema-app/esquema-catalogo). Equivale a app/Sources/Esquema/Catalogo.swift.
// Solo se descarga desde un dominio fijo, sin seguir redirecciones, con tamaño máximo; el índice lo valida bin/plantillas.py
// (plantilla_formato.py, el mismo archivo que usa el catálogo) y cada plantilla se compara con su tamaño y su huella SHA-256 del
// índice validado antes de que Python la vuelva a validar y la guarde en <carpeta de Esquema>/plantillas/ (nunca en la carpeta de
// la persona). Sin Electron adentro: main.js le pasa net.fetch y el Procesador (así se prueba con escritorio/pruebas/catalogo.mjs).
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOST = "raw.githubusercontent.com";
const BASE = "https://raw.githubusercontent.com/esquema-app/esquema-catalogo/main/";
const MAX_INDICE = 1024 * 1024;
const MAX_ARCHIVO = 100 * 1024;
/** plantillas/<categoria>/<id>.json (lo mismo que plantilla_formato.RUTA). */
const PATRON = /^plantillas\/[a-z-]+\/[a-z0-9]+(-[a-z0-9]+)*\.json$/;

/** { fetch, procesador, t, version }: fetch como el de Fetch API (net.fetch en la app). */
function crearCatalogo({ fetch, procesador, t, version = "0" }) {
  /** Lo último que validó Python: de aquí salen la ruta, el tamaño y la huella de cada descarga (nunca de lo que manda la interfaz). */
  let indice = [];

  /** Pide `ruta` (relativa a BASE): los datos solo si es un 200 del mismo dominio, sin redirecciones y sin pasar del máximo. */
  async function pedir(ruta, maximo) {
    const u = new URL(BASE + ruta);
    if (u.protocol !== "https:" || u.host !== HOST) return null;
    let r;
    try {
      r = await fetch(u.toString(), { redirect: "error", cache: "no-store", headers: { "User-Agent": `Esquema/${version}` } });
    } catch { return null; }
    try { if (r.status !== 200 || (r.url && new URL(r.url).host !== HOST)) return null; } catch { return null; }
    if (Number(r.headers?.get?.("content-length")) > maximo) return null;
    // Se lee de a pedazos y se corta apenas pasa del máximo (un archivo enorme nunca llega entero a la memoria).
    const partes = [];
    let total = 0;
    if (r.body?.getReader) {
      const lector = r.body.getReader();
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.length;
        if (total > maximo) { try { await lector.cancel(); } catch {} return null; }
        partes.push(Buffer.from(value));
      }
      return Buffer.concat(partes);
    }
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > maximo ? null : b;
  }

  function temporal(datos) {
    const u = path.join(os.tmpdir(), `esquema-catalogo-${crypto.randomUUID()}.json`);
    fs.writeFileSync(u, datos, { mode: 0o600 });
    return u;
  }

  return {
    /** El índice, validado por Python: { ok, plantillas } o { ok: false, error }. */
    async listar() {
      const datos = await pedir("index.json", MAX_INDICE);
      if (!datos) return { ok: false, error: t("No pude conectarme. Revisa tu conexión.") };
      const archivo = temporal(datos);
      try {
        const r = await procesador.correrJSON("plantillas.py", ["catalogo", archivo]);
        if (!r.ok || !Array.isArray(r.plantillas)) return { ok: false, error: t("No pude leer el catálogo.") };
        indice = r.plantillas;
        return { ok: true, plantillas: r.plantillas };
      } finally { try { fs.unlinkSync(archivo); } catch {} }
    },

    /** Descarga una plantilla del índice validado, revisa tamaño y huella, y Python la valida y la guarda. */
    async descargar(id) {
      const error = (texto) => ({ ok: false, id, error: t(texto) });
      const e = indice.find((x) => x && x.id === id);
      if (!e || typeof e.ruta !== "string" || !PATRON.test(e.ruta) || !/^[0-9a-f]{64}$/.test(e.sha256 || "")
          || !Number.isInteger(e.tamano) || e.tamano > MAX_ARCHIVO) return error("Esa plantilla no es válida.");
      const datos = await pedir(e.ruta, MAX_ARCHIVO);
      if (!datos) return error("No pude conectarme. Revisa tu conexión.");
      const huella = crypto.createHash("sha256").update(datos).digest("hex");
      if (datos.length !== e.tamano || huella !== e.sha256) return error("La plantilla llegó dañada. Intenta de nuevo.");
      const archivo = temporal(datos);
      try {
        const r = await procesador.conEntrada("plantillas.py", "instalar", { archivo, id, sha256: huella });
        return r.ok ? r : { ...r, id, error: t(r.error || "Esa plantilla no es válida.") };
      } finally { try { fs.unlinkSync(archivo); } catch {} }
    },
  };
}

module.exports = { crearCatalogo, BASE, HOST, MAX_INDICE, MAX_ARCHIVO, PATRON };
