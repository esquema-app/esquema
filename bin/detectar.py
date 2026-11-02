"""Lo propio de Esquema sobre la pieza «contenido»: adivinar qué es lo que la persona agrega. Solo biblioteca estándar.

Leer los formatos (`contenido.extraer`) y partir capítulos (`contenido.partir_capitulos`) son de la pieza «contenido»; aquí queda
lo que solo Esquema necesita:
- `detectar(texto, nombre, formato)`: historia de usuario, libro o documento (acta, especificación, artículo, apunte…), con las
  razones. Es una heurística barata; la IA lo confirma o lo corrige en su primera respuesta.
- `id_historia(texto, existentes)`: «HU-123», «PROJ-12», «#45» (issue de GitHub) o el siguiente «HU-001».
- `enlace_ticket(texto)` y `solo_enlace(texto)`: el enlace del ticket (Esquema nunca lo abre).
"""
import re

import contenido

RE_COMO = re.compile(r"(?im)^\W*(como|en mi rol de)\s+(un|una|el|la)?\s*\S.{0,120}?\b(quiero|necesito|deseo)\b.{2,300}?\b(para|de modo que|con el fin de|así)\b")
RE_AS_A = re.compile(r"(?im)^\W*as\s+an?\s+\S.{0,120}?\bi\s+(want|need|would like)\b.{2,300}?\bso\s+that\b")
RE_CRITERIOS = re.compile(r"(?im)^\W*(criterios? de aceptaci[oó]n|acceptance criteria|definition of done|definici[oó]n de (hecho|terminado))\b")
RE_GWT = re.compile(r"(?im)^\W*(dado|given)\b.{3,}\n(?:.*\n){0,3}\W*(cuando|when)\b")
RE_HU = re.compile(r"\b(HU|US|HDU)[-_ ]?(\d{1,6})\b")
RE_JIRA_URL = re.compile(r"https?://[\w.-]+/browse/([A-Z][A-Z0-9]{1,9}-\d{1,6})\b")
RE_GH_ISSUE = re.compile(r"https?://github\.com/([\w.-]+)/([\w.-]+)/(issues|pull)/(\d{1,7})\b")
RE_JIRA = re.compile(r"\b([A-Z][A-Z]{1,9}-\d{1,6})\b")
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
    capitulos = len({m.group(0).strip().lower() for m in contenido.RE_CAPITULO.finditer(t)})
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
            "titulo": contenido.titulo_de(t, nombre)}



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
