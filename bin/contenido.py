"""Lo que la persona agrega a un proyecto (texto pegado o archivos): leerlo, saber qué es y partirlo. Solo biblioteca estándar.

- `extraer(nombre, datos)`: el texto de un .md, .txt, .pdf (con texto), .docx, .odt, .epub o .html, como Markdown sencillo
  (los títulos con #). Lo que no se puede leer sin programas extra (.doc, .pages, .rtf, un PDF escaneado) da un aviso claro: «pega el
  texto». Los archivos son de afuera: tamaño máximo, zip con tope, XML sin entidades, y nada se ejecuta.
- `detectar(texto, nombre)`: historia de usuario, libro o documento (acta, especificación, artículo, apunte…), con las razones.
  Es una heurística barata; la IA lo confirma o lo corrige en su primera respuesta.
- `partir_capitulos(texto)`: los capítulos de un libro sin IA (encabezados, «Capítulo N», partes), saltándose el índice.
- `id_historia(texto, existentes)`: «HU-123», «PROJ-12», «#45» (issue de GitHub) o el siguiente «HU-001».
"""
import html
import html.parser
import io
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
import zlib

MAX_ARCHIVO = 25 * 1024 * 1024     # por archivo que se agrega
MAX_TEXTO = 3_000_000              # caracteres de texto que se guardan (un libro largo cabe)
MAX_ZIP = 80 * 1024 * 1024         # lo que puede descomprimirse de un .docx / .epub / .odt
LEE = (".md", ".markdown", ".txt", ".text", ".pdf", ".docx", ".odt", ".epub", ".html", ".htm")
NO_LEE = {".doc": "Word antiguo (.doc)", ".pages": "Pages", ".rtf": "RTF", ".mobi": "Mobi", ".azw": "Kindle", ".azw3": "Kindle", ".odp": "una presentación",
          ".pptx": "una presentación", ".key": "una presentación de Keynote", ".xlsx": "una planilla", ".xls": "una planilla"}


def slug(t, maximo=60):
    s = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode().lower()).strip("-")
    return s[:maximo].strip("-")


def extension(nombre):
    n = str(nombre or "").lower()
    i = n.rfind(".")
    return n[i:] if i > 0 else ""


class NoSePuede(ValueError):
    """Un archivo que Esquema no sabe leer sin dependencias: el mensaje dice qué hacer."""


# ───────────── Leer cada formato ─────────────
def _decodificar(datos):
    for c in ("utf-8-sig", "utf-16") if datos[:2] in (b"\xff\xfe", b"\xfe\xff") else ("utf-8-sig",):
        try:
            return datos.decode(c)
        except UnicodeDecodeError:
            pass
    return datos.decode("cp1252", "replace")


def _limpiar(t):
    t = t.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    t = re.sub(r"[ \t ]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip() + "\n" if t.strip() else ""


def _xml(datos):
    """XML de un archivo de afuera: sin DOCTYPE ni entidades (nada de «mil millones de risas»)."""
    if b"<!DOCTYPE" in datos[:4096].upper() and b"<!ENTITY" in datos.upper():
        raise NoSePuede("Ese archivo trae algo raro adentro y no lo abro.")
    return ET.fromstring(datos)


def _zip(datos):
    try:
        z = zipfile.ZipFile(io.BytesIO(datos))
    except zipfile.BadZipFile:
        raise NoSePuede("Ese archivo está dañado o no es lo que dice su nombre.") from None
    if sum(i.file_size for i in z.infolist()) > MAX_ZIP:
        raise NoSePuede("Ese archivo es demasiado grande por dentro.")
    return z


class _HTML(html.parser.HTMLParser):
    """HTML → Markdown sencillo: títulos con #, párrafos y listas; sin scripts ni estilos."""
    BLOQUES = {"p", "div", "section", "article", "br", "li", "tr", "blockquote", "pre", "dd", "dt", "figcaption"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes, self.saltar, self.titulo = [], 0, ""
        self._en_titulo = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head", "nav"):
            self.saltar += 1
        elif tag == "title":
            self._en_titulo = True
        elif re.fullmatch(r"h[1-6]", tag):
            self.partes.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "li":
            self.partes.append("\n- ")
        elif tag in self.BLOQUES:
            self.partes.append("\n\n" if tag != "br" else "\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head", "nav"):
            self.saltar = max(0, self.saltar - 1)
        elif tag == "title":
            self._en_titulo = False
        elif re.fullmatch(r"h[1-6]", tag) or tag in self.BLOQUES:
            self.partes.append("\n\n" if tag != "li" else "")

    def handle_data(self, data):
        if self._en_titulo:
            self.titulo += data
        elif not self.saltar:
            self.partes.append(re.sub(r"\s+", " ", data))

    def texto(self):
        t = "".join(self.partes)
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n[ \t]+", "\n", t)
        t = re.sub(r"(#+ )\s*\n+", r"\1", t)
        return _limpiar(t)


def _html(datos):
    p = _HTML()
    p.feed(_decodificar(datos))
    p.close()
    return p.texto(), re.sub(r"\s+", " ", p.titulo).strip()


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _docx(datos):
    z = _zip(datos)
    try:
        raiz = _xml(z.read("word/document.xml"))
    except KeyError:
        raise NoSePuede("Ese .docx no tiene texto que pueda leer.") from None
    titulo = ""
    try:
        core = _xml(z.read("docProps/core.xml"))
        titulo = next((x.text or "" for x in core.iter() if x.tag.endswith("}title")), "").strip()
    except (KeyError, ET.ParseError):
        pass
    lineas = []
    cuerpo = raiz.find(W + "body")
    for el in (cuerpo if cuerpo is not None else []):
        if el.tag == W + "p":
            lineas.append(_docx_parrafo(el))
        elif el.tag == W + "tbl":
            for fila in el.iter(W + "tr"):
                celdas = [" ".join(_docx_parrafo(p) for p in c.iter(W + "p")).strip() for c in fila.iter(W + "tc")]
                lineas.append("| " + " | ".join(celdas) + " |")
    return _limpiar("\n\n".join(l for l in lineas if l.strip())), titulo


def _docx_parrafo(p):
    estilo = ""
    ppr = p.find(W + "pPr")
    if ppr is not None:
        s = ppr.find(W + "pStyle")
        estilo = (s.get(W + "val") or "") if s is not None else ""
    partes = []
    for x in p.iter():
        if x.tag == W + "t":
            partes.append(x.text or "")
        elif x.tag == W + "tab":
            partes.append("\t")
        elif x.tag in (W + "br", W + "cr"):
            partes.append("\n")
    t = "".join(partes).strip()
    if not t:
        return ""
    m = re.search(r"(?:heading|ttulo|titulo|título|überschrift)\s*(\d)", estilo, re.I)
    if m:
        return "#" * min(6, int(m.group(1))) + " " + t
    if re.fullmatch(r"(?i)title|ttulo|titulo", estilo):
        return "# " + t
    if ppr is not None and ppr.find(W + "numPr") is not None:
        return "- " + t
    return t


def _odt(datos):
    z = _zip(datos)
    try:
        raiz = _xml(z.read("content.xml"))
    except KeyError:
        raise NoSePuede("Ese .odt no tiene texto que pueda leer.") from None
    T = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
    lineas = []
    for el in raiz.iter():
        if el.tag == T + "h":
            nivel = int(el.get(T + "outline-level") or 1)
            lineas.append("#" * min(6, nivel) + " " + "".join(el.itertext()).strip())
        elif el.tag == T + "p":
            lineas.append("".join(el.itertext()).strip())
    return _limpiar("\n\n".join(l for l in lineas if l)), ""


def _epub(datos):
    z = _zip(datos)
    try:
        cont = _xml(z.read("META-INF/container.xml"))
        opf_ruta = next(x.get("full-path") for x in cont.iter() if x.tag.endswith("rootfile"))
        opf = _xml(z.read(opf_ruta))
    except (KeyError, StopIteration, ET.ParseError):
        raise NoSePuede("Ese EPUB está dañado: no encuentro su índice.") from None
    base = opf_ruta.rsplit("/", 1)[0] + "/" if "/" in opf_ruta else ""
    titulo = next(("".join(x.itertext()).strip() for x in opf.iter() if x.tag.endswith("}title")), "")
    manifiesto = {x.get("id"): x.get("href") for x in opf.iter() if x.tag.endswith("}item")}
    partes = []
    for ref in (x for x in opf.iter() if x.tag.endswith("}itemref")):
        href = manifiesto.get(ref.get("idref"))
        if not href:
            continue
        ruta = _normalizar(base + href.split("#")[0])
        try:
            t, _ = _html(z.read(ruta))
        except KeyError:
            continue
        if t.strip():
            partes.append(t)
    return _limpiar("\n\n".join(partes)), titulo


def _normalizar(r):
    salida = []
    for p in r.split("/"):
        if p == "..":
            if salida:
                salida.pop()
        elif p and p != ".":
            salida.append(p)
    return "/".join(salida)


# PDF: solo los que tienen texto (no escaneados). Se leen los flujos de contenido (FlateDecode con zlib) y los operadores de texto.
_PDF_FLUJO = re.compile(rb"<<(.{0,2000}?)>>\s*stream\r?\n", re.S)
_PDF_TOKEN = re.compile(rb"\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)|<[0-9A-Fa-f\s]*>|\[|\]|-?\d*\.?\d+|/[^\s/\[\]()<>]+|[A-Za-z'\"*]+")


def _pdf_cadena(tok):
    if tok.startswith(b"<"):
        h = re.sub(rb"\s", b"", tok[1:-1])
        if len(h) % 2:
            h += b"0"
        b = bytes.fromhex(h.decode())
        if len(b) >= 2 and len(b) % 2 == 0 and all(b[i] == 0 for i in range(0, len(b), 2)):
            return b.decode("utf-16-be", "replace")
        return b.decode("latin-1")
    s, r, i = tok[1:-1], bytearray(), 0
    escapes = {ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12, ord("("): 40, ord(")"): 41, ord("\\"): 92}
    while i < len(s):
        c = s[i]
        if c == 92 and i + 1 < len(s):
            n = s[i + 1]
            if n in escapes:
                r.append(escapes[n])
                i += 2
            elif 48 <= n <= 55:
                m = re.match(rb"[0-7]{1,3}", s[i + 1:])
                r.append(int(m.group(0), 8) & 255)
                i += 1 + len(m.group(0))
            elif n in (10, 13):
                i += 2
            else:
                r.append(n)
                i += 2
        else:
            r.append(c)
            i += 1
    if r.startswith(b"\xfe\xff"):
        return bytes(r[2:]).decode("utf-16-be", "replace")
    return bytes(r).decode("cp1252", "replace")


def _pdf_texto_flujo(cont):
    salida, pila, en_bt = [], [], False
    for m in _PDF_TOKEN.finditer(cont):
        t = m.group(0)
        if t == b"BT":
            en_bt = True
            pila = []
        elif t == b"ET":
            en_bt = False
            salida.append("\n")
        elif not en_bt:
            continue
        elif t in (b"Tj", b"'", b'"'):
            if t != b"Tj":
                salida.append("\n")
            cad = next((x for x in reversed(pila) if isinstance(x, str)), "")
            salida.append(cad)
            pila = []
        elif t == b"TJ":
            for x in pila:
                if isinstance(x, str):
                    salida.append(x)
                elif isinstance(x, float) and x < -180:
                    salida.append(" ")
            pila = []
        elif t in (b"Td", b"TD", b"T*"):
            # Un salto hacia abajo es otra línea; uno hacia el lado, otra palabra.
            ys = [x for x in pila if isinstance(x, float)]
            salida.append("\n" if t == b"T*" or (len(ys) >= 2 and abs(ys[-1]) > 1) else " ")
            pila = []
        elif t == b"Tm":
            salida.append("\n")
            pila = []
        elif t.startswith((b"(", b"<")) and not t.startswith(b"<<"):
            pila.append(_pdf_cadena(t))
        elif t in (b"[", b"]") or t.startswith(b"/"):
            continue
        else:
            try:
                pila.append(float(t))
            except ValueError:
                pila = [] if t.isalpha() else pila
    return "".join(salida)


def _pdf(datos):
    if not datos.startswith(b"%PDF"):
        raise NoSePuede("Ese archivo no es un PDF.")
    if b"/Encrypt" in datos:
        raise NoSePuede("Ese PDF tiene clave. Ábrelo, copia el texto y pégalo aquí.")
    textos = []
    for m in _PDF_FLUJO.finditer(datos):
        dic = m.group(1)
        if any(x in dic for x in (b"/Image", b"/XObject", b"/FontFile", b"/Metadata", b"/XRef", b"/ObjStm")):
            continue
        ini = m.end()
        fin = datos.find(b"endstream", ini)
        if fin < 0:
            continue
        crudo = datos[ini:fin].rstrip(b"\r\n")
        if b"/FlateDecode" in dic:
            try:
                crudo = zlib.decompressobj().decompress(crudo, 20 * 1024 * 1024)
            except zlib.error:
                continue
        elif b"/Filter" in dic:
            continue  # otros filtros (imágenes, LZW…): no son texto que sepamos leer
        if b"BT" in crudo and (b"Tj" in crudo or b"TJ" in crudo):
            textos.append(_pdf_texto_flujo(crudo))
    t = _limpiar("\n".join(textos))
    letras = sum(1 for c in t if c.isalpha() or c.isspace())
    if len(t) < 40 or letras / max(1, len(t)) < 0.75:
        raise NoSePuede("No pude leer el texto de este PDF (puede ser escaneado o usar letras especiales). Ábrelo, copia el texto y pégalo aquí.")
    # Párrafos: las líneas cortadas por el ancho de la página se juntan.
    return re.sub(r"(?<=[a-záéíóúñ,;])\n(?=[a-záéíóúñ])", " ", t), ""


def extraer(nombre, datos):
    """{texto, titulo, formato}. NoSePuede con un mensaje claro si no se puede leer sin programas extra."""
    ext = extension(nombre)
    if len(datos) > MAX_ARCHIVO:
        raise NoSePuede("Ese archivo es muy grande (más de 25 MB). Divídelo o pega el texto.")
    if ext in NO_LEE:
        # (Una frase fija, para que se traduzca entera; el nombre del archivo ya va al lado.)
        raise NoSePuede("Esquema no lee ese formato sin programas extra. Guárdalo como .docx, PDF o texto, o copia el texto y pégalo aquí.")
    if ext in (".pdf",):
        texto, titulo = _pdf(datos)
    elif ext == ".docx":
        texto, titulo = _docx(datos)
    elif ext == ".odt":
        texto, titulo = _odt(datos)
    elif ext == ".epub":
        texto, titulo = _epub(datos)
    elif ext in (".html", ".htm"):
        texto, titulo = _html(datos)
    elif ext in (".md", ".markdown", ".txt", ".text", "") and b"\x00" not in datos[:4096].replace(b"\x00\x00", b""):
        texto, titulo = _limpiar(_decodificar(datos)), ""
    else:
        raise NoSePuede("No sé leer ese tipo de archivo. Copia el texto y pégalo aquí.")
    if not texto.strip():
        raise NoSePuede("Ese archivo no tiene texto que pueda leer. Copia el texto y pégalo aquí.")
    return {"texto": texto[:MAX_TEXTO], "recortado": len(texto) > MAX_TEXTO, "titulo": titulo[:120], "formato": ext.lstrip(".") or "txt"}


# ───────────── ¿Qué es? ─────────────
RE_COMO = re.compile(r"(?im)^\W*(como|en mi rol de)\s+(un|una|el|la)?\s*\S.{0,120}?\b(quiero|necesito|deseo)\b.{2,300}?\b(para|de modo que|con el fin de|así)\b")
RE_AS_A = re.compile(r"(?im)^\W*as\s+an?\s+\S.{0,120}?\bi\s+(want|need|would like)\b.{2,300}?\bso\s+that\b")
RE_CRITERIOS = re.compile(r"(?im)^\W*(criterios? de aceptaci[oó]n|acceptance criteria|definition of done|definici[oó]n de (hecho|terminado))\b")
RE_GWT = re.compile(r"(?im)^\W*(dado|given)\b.{3,}\n(?:.*\n){0,3}\W*(cuando|when)\b")
RE_HU = re.compile(r"\b(HU|US|HDU)[-_ ]?(\d{1,6})\b")
RE_JIRA_URL = re.compile(r"https?://[\w.-]+/browse/([A-Z][A-Z0-9]{1,9}-\d{1,6})\b")
RE_GH_ISSUE = re.compile(r"https?://github\.com/([\w.-]+)/([\w.-]+)/(issues|pull)/(\d{1,7})\b")
RE_JIRA = re.compile(r"\b([A-Z][A-Z]{1,9}-\d{1,6})\b")
RE_CAPITULO = re.compile(r"(?im)^\W{0,4}(cap[ií]tulo|chapter|parte|part|libro|book)\s+([0-9]{1,3}|[ivxlc]{1,8}|primer[oa]?|segund[oa]|tercer[oa]?|uno|dos|tres|one|two|three)\b.*$")
RE_INDICE = re.compile(r"(?im)^\W{0,4}(índice|indice|tabla de contenidos?|contenidos?|table of contents|contents)\s*$")
RE_ISBN = re.compile(r"(?i)\bISBN(?:-1[03])?:?\s*[0-9][0-9 -]{8,16}[0-9Xx]\b")
SUBTIPOS = (
    ("acta", re.compile(r"(?im)\b(acta|minuta de reuni[oó]n|asistentes|participantes|acuerdos|meeting notes|attendees|action items)\b")),
    ("especificacion", re.compile(r"(?im)\b(especificaci[oó]n|requisitos? (funcionales|no funcionales)|requirements?|alcance|scope|RF-\d+)\b")),
    ("articulo", re.compile(r"(?im)\b(resumen|abstract|introducci[oó]n|conclusi[oó]n|referencias|bibliograf[ií]a)\b")),
)


def detectar(texto, nombre="", formato=""):
    """{tipo: historia | libro | documento, subtipo, razones: [...], titulo}. Las razones son frases cortas para la persona."""
    t = texto or ""
    cabeza = t[:20_000]
    puntos = {"historia": 0, "libro": 0, "documento": 1}
    razones = {"historia": [], "libro": [], "documento": []}

    def suma(tipo, n, razon):
        puntos[tipo] += n
        if razon not in razones[tipo]:
            razones[tipo].append(razon)

    if RE_COMO.search(cabeza) or RE_AS_A.search(cabeza):
        suma("historia", 4, "Dice «Como … quiero … para …»")
    if RE_CRITERIOS.search(cabeza):
        suma("historia", 3, "Trae criterios de aceptación")
    if RE_GWT.search(cabeza):
        suma("historia", 2, "Tiene escenarios Dado / Cuando / Entonces")
    if RE_HU.search(cabeza[:3000]) or RE_JIRA_URL.search(cabeza):
        suma("historia", 2, "Tiene el número de un ticket")
    if RE_GH_ISSUE.search(cabeza):
        suma("historia", 2, "Es un issue de GitHub")
    capitulos = len({m.group(0).strip().lower() for m in RE_CAPITULO.finditer(t)})
    if capitulos >= 3:
        suma("libro", 3 + min(capitulos, 10) // 3, "Tiene capítulos")
    if RE_INDICE.search(cabeza):
        suma("libro", 2, "Tiene un índice")
    if RE_ISBN.search(t[:60_000]):
        suma("libro", 4, "Tiene ISBN")
    if formato == "epub":
        suma("libro", 5, "Es un libro electrónico (EPUB)")
    if len(t) > 80_000:
        suma("libro", 3 if len(t) > 200_000 else 2, "Es un texto largo")
    if len(t) < 6_000 and capitulos < 3 and puntos["libro"] < 5:
        puntos["libro"] = min(puntos["libro"], 1)
    subtipo = ""
    for nombre_sub, rx in SUBTIPOS:
        n = len(rx.findall(cabeza))
        if n >= 2:
            subtipo = nombre_sub
            suma("documento", 1, {"acta": "Parece un acta de reunión", "especificacion": "Parece una especificación", "articulo": "Parece un artículo o apunte"}[nombre_sub])
            break
    tipo = max(("historia", "libro", "documento"), key=lambda k: (puntos[k], k == "documento"))
    if tipo == "documento" and not razones["documento"]:
        razones["documento"].append("Un texto corto o de otro tipo")
    return {"tipo": tipo, "subtipo": subtipo if tipo == "documento" else "", "razones": razones[tipo][:4], "puntos": puntos,
            "titulo": titulo_de(t, nombre)}


def titulo_de(texto, nombre=""):
    """El título: el primer «# …», si no, «Como … quiero …» acortado o la primera línea corta; si no, el nombre del archivo."""
    for l in (texto or "").split("\n")[:60]:
        m = re.match(r"^#{1,2}\s+(.+?)\s*#*\s*$", l)
        if m:
            return _corto(m.group(1))
    for l in (texto or "").split("\n")[:20]:
        l = l.strip().strip("*_ ")
        if 3 <= len(l) <= 90 and not l.lower().startswith(("http://", "https://")):
            return _corto(l)
    base = str(nombre or "").rsplit("/", 1)[-1]
    return _corto(base.rsplit(".", 1)[0].replace("-", " ").replace("_", " ")) if base else ""


def _corto(t):
    t = re.sub(r"\s+", " ", re.sub(r"[*_`#>]", "", t)).strip()
    return t[:100].rstrip(" ,.;:") or ""


def id_historia(texto, existentes=()):
    """El id de una historia: el que trae (HU-12, PROJ-7, #45 de GitHub) o el siguiente HU-001."""
    cabeza = (texto or "")[:3000]
    for rx, f in ((RE_HU, lambda m: f"HU-{int(m.group(2))}"), (RE_JIRA_URL, lambda m: m.group(1)), (RE_GH_ISSUE, lambda m: f"#{m.group(4)}")):
        m = rx.search(cabeza)
        if m:
            return f(m)
    primera = next((l for l in cabeza.split("\n") if l.strip()), "")
    m = RE_JIRA.search(primera)
    if m and not re.fullmatch(r"(UTF|ISO|RFC|SHA|AES|TLS|COVID|MP|HTTP)-\d+", m.group(1)):
        return m.group(1)
    usados = {int(m.group(1)) for x in existentes for m in [re.match(r"hu-(\d+)", str(x).lower())] if m}
    return f"HU-{(max(usados) + 1) if usados else 1:03d}"


def enlace_ticket(texto):
    """La URL del ticket o issue (si la trae), para dejarla en el documento. Esquema no la abre."""
    for rx in (RE_GH_ISSUE, RE_JIRA_URL):
        m = rx.search((texto or "")[:5000])
        if m:
            return m.group(0)
    return ""


def solo_enlace(texto):
    """¿La persona pegó solo un enlace (sin el texto del ticket)?"""
    t = (texto or "").strip()
    return bool(re.fullmatch(r"https?://\S+", t))


# ───────────── Capítulos (sin IA) ─────────────
MIN_CAPITULO = 400        # caracteres: menos que esto se junta con el siguiente (títulos de un índice, portadillas)
MAX_CAPITULOS = 80
TROZO = 18_000            # sin encabezados: partes de este tamaño, cortadas en un párrafo


def partir_capitulos(texto):
    """[{titulo, texto}] en orden. Usa, en este orden: «Capítulo N»/«Chapter N»; los encabezados Markdown del nivel que dé más
    capítulos razonables; y si no hay nada, partes de ~18.000 caracteres cortadas en un párrafo («Parte 1», «Parte 2»…).
    Un índice («Capítulo 1 …… 5» en líneas seguidas) no cuenta como capítulos."""
    t = (texto or "").replace("\r\n", "\n")
    lineas = t.split("\n")
    cortes = _cortes_capitulo(lineas) or _cortes_encabezado(lineas)
    if cortes:
        partes = []
        if cortes[0][0] > 0:
            inicio = "\n".join(lineas[:cortes[0][0]]).strip()
            if len(inicio) >= MIN_CAPITULO:
                partes.append({"titulo": "", "texto": inicio})
        for k, (i, titulo) in enumerate(cortes):
            fin = cortes[k + 1][0] if k + 1 < len(cortes) else len(lineas)
            partes.append({"titulo": titulo, "texto": "\n".join(lineas[i + 1:fin]).strip()})
        partes = _juntar_cortos(partes)
        if len(partes) >= 2:
            return _titulos(partes[:MAX_CAPITULOS] if len(partes) <= MAX_CAPITULOS else _juntar_hasta(partes, MAX_CAPITULOS))
    return _titulos(_por_tamano(t))


def _cortes_capitulo(lineas):
    c = [(i, l.strip().strip("#*_ ").strip()) for i, l in enumerate(lineas) if len(l.strip()) <= 120 and RE_CAPITULO.match(l.strip().lstrip("#").strip())]
    return _sin_indice(c, lineas) if len(c) >= 2 else []


def _cortes_encabezado(lineas):
    en_cerco = False
    por_nivel = {}
    for i, l in enumerate(lineas):
        if re.match(r"^\s*(```|~~~)", l):
            en_cerco = not en_cerco
            continue
        m = None if en_cerco else re.match(r"^(#{1,4})\s+(.+?)\s*#*\s*$", l)
        if m:
            por_nivel.setdefault(len(m.group(1)), []).append((i, m.group(2).strip()))
    for nivel in sorted(por_nivel):
        c = _sin_indice(por_nivel[nivel], lineas)
        # Un solo «# Título del libro» arriba no es un capítulo: se sigue con el nivel de abajo.
        if 2 <= len(c) <= MAX_CAPITULOS * 3:
            return c
    return []


def _sin_indice(cortes, lineas):
    """Saca los cortes que están pegados uno al otro (las líneas de un índice): entre dos capítulos tiene que haber texto."""
    r = []
    for k, (i, titulo) in enumerate(cortes):
        fin = cortes[k + 1][0] if k + 1 < len(cortes) else len(lineas)
        cuerpo = "\n".join(lineas[i + 1:fin]).strip()
        if len(cuerpo) >= 80 or k == len(cortes) - 1:
            r.append((i, titulo))
    return r


def _juntar_cortos(partes):
    r = []
    for p in partes:
        if r and len(r[-1]["texto"]) < MIN_CAPITULO:
            anterior = r.pop()
            p = {"titulo": anterior["titulo"] or p["titulo"], "texto": (anterior["texto"] + "\n\n" + (("## " + p["titulo"] + "\n\n") if anterior["titulo"] and p["titulo"] else "") + p["texto"]).strip()}
        r.append(p)
    if len(r) >= 2 and len(r[-1]["texto"]) < MIN_CAPITULO // 2:
        u = r.pop()
        r[-1]["texto"] += "\n\n" + u["texto"]
    return r


def _juntar_hasta(partes, n):
    tam = -(-len(partes) // n)
    return [{"titulo": g[0]["titulo"], "texto": "\n\n".join(("## " + x["titulo"] + "\n\n" if x["titulo"] else "") + x["texto"] for x in g)}
            for g in (partes[i:i + tam] for i in range(0, len(partes), tam))]


def _por_tamano(t):
    parrafos = re.split(r"\n\s*\n", t.strip())
    partes, actual = [], []
    for p in parrafos:
        actual.append(p)
        if sum(len(x) for x in actual) >= TROZO:
            partes.append("\n\n".join(actual))
            actual = []
    if actual:
        if partes and sum(len(x) for x in actual) < TROZO // 4:
            partes[-1] += "\n\n" + "\n\n".join(actual)
        else:
            partes.append("\n\n".join(actual))
    return [{"titulo": "", "texto": p} for p in partes[:MAX_CAPITULOS]]


def _titulos(partes):
    """Cada parte con título (el suyo o «Parte N») y un nombre de archivo ordenado: «01-el-comienzo.md»."""
    r = []
    ancho = 2 if len(partes) < 100 else 3
    for k, p in enumerate(partes, 1):
        # «Capítulo 3: La tormenta» → «La tormenta» (el número ya va adelante: «3. La tormenta»).
        m = re.match(r"(?i)^\W*(?:cap[ií]tulo|chapter|parte|part)\s+[\w]+\s*[:.\-–—]\s*(.+)$", p["titulo"] or "")
        titulo = _corto(m.group(1) if m else p["titulo"]) or ("Inicio" if k == 1 and len(partes) > 1 and partes[1]["titulo"] else f"Parte {k}")
        r.append({"n": k, "titulo": titulo[:100], "archivo": f"{k:0{ancho}d}-{slug(titulo, 50) or 'parte'}.md", "texto": p["texto"]})
    return r

