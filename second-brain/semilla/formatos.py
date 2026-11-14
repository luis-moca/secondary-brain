"""Escritores mínimos de archivos, solo con la librería estándar de Python.

Cada uno deja un archivo que abre en Finder, Vista Rápida, Word, Excel o el navegador, y que scan.py sabe leer:
secciones de Markdown, párrafos de Word, hojas de Excel y páginas de PDF.
"""
import html
import json
import struct
import zipfile
import zlib
from xml.sax.saxutils import escape


def md(path, titulo, secciones):
    out = ["# " + titulo, ""]
    for h, parrafos in secciones:
        out += ["## " + h, ""]
        for p in parrafos:
            out += [p, ""]
    path.write_text("\n".join(out), "utf-8")


def txt(path, titulo, secciones):
    out = [titulo, "=" * len(titulo), ""]
    for h, parrafos in secciones:
        out += [h.upper(), ""] + [p + "\n" for p in parrafos]
    path.write_text("\n".join(out), "utf-8")


def json_(path, titulo, secciones):
    data = {"titulo": titulo, "secciones": [{"titulo": h, "texto": "\n\n".join(ps)} for h, ps in secciones]}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


CSS = """body{margin:0;font:16px/1.55 -apple-system,Segoe UI,sans-serif;background:#0d0c0a;color:#efe9df}
main{max-width:760px;margin:0 auto;padding:56px 28px}h1{font-size:34px;margin:0 0 6px;color:#ffc46a}
.sub{color:#a59c8c;margin-bottom:32px}h2{font-size:20px;margin:34px 0 8px;color:#fff0d6}
section{border-left:3px solid #ffc46a;padding-left:16px}p{color:#d8d0c2}"""


def html_(path, titulo, secciones, sub=""):
    # cada bloque en su renglón con línea en blanco: así scan.py cuenta cada párrafo como una pieza
    cuerpo = "\n\n".join("<section><h2>%s</h2>\n\n%s</section>" % (html.escape(h), "\n\n".join("<p>%s</p>" % html.escape(p) for p in ps))
                         for h, ps in secciones)
    path.write_text("<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>%s</title><style>%s</style></head>"
                    "<body><main><h1>%s</h1><div class=\"sub\">%s</div>%s</main></body></html>"
                    % (html.escape(titulo), CSS, html.escape(titulo), html.escape(sub), cuerpo), "utf-8")


# ---------- Word (.docx) ----------
DOCX_TIPOS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/>'
              '<Override PartName="/word/document.xml" '
              'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
DOCX_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
             '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
             'Target="word/document.xml"/></Relationships>')


def _wp(texto, tam=None, negrita=False):
    props = ""
    if tam or negrita:
        props = "<w:rPr>%s%s</w:rPr>" % ("<w:b/>" if negrita else "", '<w:sz w:val="%d"/>' % tam if tam else "")
    return '<w:p><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p>' % (props, escape(texto))


def docx(path, titulo, secciones):
    cuerpo = [_wp(titulo, 40, True)]
    for h, ps in secciones:
        cuerpo.append(_wp(h, 28, True))
        cuerpo += [_wp(p) for p in ps]
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s'
           '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/>'
           '</w:sectPr></w:body></w:document>' % "".join(cuerpo))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", DOCX_TIPOS)
        z.writestr("_rels/.rels", DOCX_RELS)
        z.writestr("word/document.xml", doc)


# ---------- Excel (.xlsx) ----------
def _col(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def xlsx(path, hojas):
    """hojas: lista de (nombre, filas). Cada fila es una lista de textos o números."""
    textos, idx = [], {}

    def si(t):
        if t not in idx:
            idx[t] = len(textos)
            textos.append(t)
        return idx[t]

    sheets_xml = []
    for _, filas in hojas:
        rows = []
        for r, fila in enumerate(filas, 1):
            celdas = []
            for c, v in enumerate(fila):
                ref = "%s%d" % (_col(c), r)
                if isinstance(v, (int, float)):
                    celdas.append('<c r="%s"><v>%s</v></c>' % (ref, v))
                else:
                    celdas.append('<c r="%s" t="s"><v>%d</v></c>' % (ref, si(str(v))))
            rows.append('<row r="%d">%s</row>' % (r, "".join(celdas)))
        sheets_xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                          '<sheetData>%s</sheetData></worksheet>' % "".join(rows))
    n = len(hojas)
    tipos = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
             '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
             + "".join('<Override PartName="/xl/worksheets/sheet%d.xml" '
                       'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % (i + 1) for i in range(n))
             + "</Types>")
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/></Relationships>')
    wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>%s</sheets></workbook>'
          % "".join('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (escape(nombre), i + 1, i + 1) for i, (nombre, _) in enumerate(hojas)))
    wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">%s'
               '<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" '
               'Target="sharedStrings.xml"/></Relationships>'
               % ("".join('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
                          'Target="worksheets/sheet%d.xml"/>' % (i + 1, i + 1) for i in range(n)), n + 1))
    ss = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">%s</sst>'
          % (len(textos), len(textos), "".join('<si><t xml:space="preserve">%s</t></si>' % escape(t) for t in textos)))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", tipos)
        z.writestr("_rels/.rels", rels)
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/sharedStrings.xml", ss)
        for i, x in enumerate(sheets_xml):
            z.writestr("xl/worksheets/sheet%d.xml" % (i + 1), x)


# ---------- PDF ----------
def _pdf_txt(s):
    s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return s.encode("cp1252", "replace")


def _partir(texto, ancho=88):
    lineas, actual = [], ""
    for palabra in texto.split():
        if len(actual) + len(palabra) + 1 > ancho:
            lineas.append(actual)
            actual = palabra
        else:
            actual = (actual + " " + palabra).strip()
    if actual:
        lineas.append(actual)
    return lineas


def pdf(path, titulo, paginas):
    """paginas: lista de (encabezado, [párrafos]). Una página por elemento."""
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", None,
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]
    kids = []
    for n, (h, ps) in enumerate(paginas):
        ops = [b"BT /F2 20 Tf 56 740 Td (" + _pdf_txt(titulo if n == 0 else h) + b") Tj ET"]
        y = 706
        if n == 0:
            ops.append(b"BT /F2 14 Tf 56 %d Td (" % y + _pdf_txt(h) + b") Tj ET")
            y -= 28
        for p in ps:
            for linea in _partir(p):
                if y < 60:
                    break
                ops.append(b"BT /F1 11 Tf 56 %d Td (" % y + _pdf_txt(linea) + b") Tj ET")
                y -= 16
            y -= 10
        stream = b"\n".join(ops)
        objs.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        contenido = len(objs)
        objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                    b"/Contents %d 0 R >>" % contenido)
        kids.append(len(objs))
    objs[1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % k for k in kids), len(kids))
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    path.write_bytes(bytes(out))


# ---------- PNG ----------
def png(path, ancho, alto, color_a, color_b, figuras):
    """Degradado entre dos colores con círculos suaves encima. figuras: lista de (x, y, radio, color)."""
    filas = []
    for y in range(alto):
        fila = bytearray(b"\x00")
        for x in range(ancho):
            t = (x / ancho * 0.6 + y / alto * 0.4)
            r = color_a[0] + (color_b[0] - color_a[0]) * t
            g = color_a[1] + (color_b[1] - color_a[1]) * t
            b = color_a[2] + (color_b[2] - color_a[2]) * t
            for fx, fy, fr, fc in figuras:
                d2 = (x - fx) ** 2 + (y - fy) ** 2
                if d2 < fr * fr:
                    k = 0.55 * (1 - d2 / (fr * fr))
                    r, g, b = r + (fc[0] - r) * k, g + (fc[1] - g) * k, b + (fc[2] - b) * k
            fila += bytes((int(r), int(g), int(b)))
        filas.append(bytes(fila))
    crudo = zlib.compress(b"".join(filas), 9)

    def bloque(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)

    path.write_bytes(b"\x89PNG\r\n\x1a\n" + bloque(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
                     + bloque(b"IDAT", crudo) + bloque(b"IEND", b""))
