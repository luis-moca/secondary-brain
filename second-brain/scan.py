#!/usr/bin/env python3
"""Escanea vault/ y la configuración de Claude, y genera js/data.js para el panel.

Solo lee tus originales. Lo único que escribe está dentro de esta carpeta:
js/data.js, memoria/ (foto de memorias y skills), externas/ (accesos directos) y PENDIENTES.md.

Uso:  python3 scan.py
"""
import colorsys
import fnmatch
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

import thumbs
import uso

ROOT = Path(__file__).resolve().parent
VAULT = ROOT / "vault"
HOME = Path.home()
CLAUDE = HOME / ".claude"
KNOWLEDGE = Path(os.environ.get("MOCA_KNOWLEDGE") or ROOT.parent / "Knowledge").expanduser()  # tu carpeta de archivos
CC = Path(os.environ["MOCA_CC"]).expanduser() if os.environ.get("MOCA_CC") else ROOT / ".sin-paginas"  # opcional: otra carpeta de páginas HTML
NODE_BIN = HOME / ".local" / "node" / "bin"
OUT = ROOT / "js" / "data.js"

TEXT_EXT = {".md", ".txt", ".json", ".py", ".csv", ".html"}
MAX_PIECES = 24
MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}

# Zona de la esfera por carpeta de primer nivel. Estas seis guardan su nombre y su color de siempre.
# Cualquier otra carpeta de primer nivel con archivos es su propia zona, con un color que no cambia
# (se guarda en .cache/zonas.json); los archivos sueltos van a RAÍZ y una zona sin archivos no aparece.
CATS = [
    ("Proyectos", "proyectos", "PROYECTOS"),
    ("Sesiones", "sesiones", "SESIONES"),
    ("Notas", "notas", "NOTAS"),
    ("Producto", "saas", "PRODUCTO"),
    ("Mercado", "marketplace", "MERCADO"),
    ("Indice", "kb", "ÍNDICE"),
]
CAT_LABEL = {c[1]: c[2] for c in CATS}
CAT_LABEL["raiz"] = "RAÍZ"
CAT_LABEL["memoria"] = "MEMORIA"
ZONA_CARPETA = {}                                              # zona nueva -> nombre de su carpeta
ZONA_CLAVE = {}                                                # nombre de carpeta -> su zona
# Colores de zonas nuevas: distintos de los seis de siempre y sin naranja (el naranja es la marca).
# El primero es champaña (13 nov): la primera zona nueva fue Videos, hoy la más grande, y debía sumar al dorado.
# Después de estos se generan girando el tono, así dos zonas nunca comparten color.
COLORES_NUEVOS = ["#f2d29b", "#9be15d", "#f06bd6", "#58d26b", "#ffd84d", "#6fb6ff", "#c77dff", "#7ef0e0"]  # solo se agranda al final
# los seis de siempre (como CAT_COLOR en js/shared.js): los generados no se les parecen
COLORES_FIJOS = ["#ff6a2b", "#ffb547", "#3fd0ff", "#4f8cff", "#2fe0c4", "#a98bff"]
ZONA_OLVIDO_DIAS = 30                                           # el color de una carpeta que se fue se libera a los 30 días
ZONAS_GUARDADAS = ROOT / ".cache" / "zonas.json"
AVISOS = ROOT / ".cache" / "avisos.json"                      # los escribe server.py al copiar Knowledge
# Lo que no cuenta en la esfera aunque esté en vault/: igual que la lista "ignorar" del panel portátil.
IGNORAR = [".*", "node_modules", "__pycache__", "venv", "dist", "*.pyc", "*.zip", "*.bin", "*.dmg", "*.pkg", "*.lock", "*.map", "Icon\r", "Thumbs.db"]

# Bandeja de artifacts: las mismas reglas que el panel portátil (allá viven en moca.config.json, sección artifacts).
# Material o código fuente: nada de lo que esté dentro de estas carpetas cuenta (admite * y ?, sin mayúsculas ni acentos).
FUENTE = ["assets", "media", "img", "images", "fonts", "fuentes", "_sin-usar", "sin-usar", "src", "lib", "node_modules",
          "dist", "build", "compositions", "_kit", "_piezas", "sfx", "music", "captura*", "respaldo", "backup",
          "_*", "footage", "raw", "stock", "b-roll", "broll"]
FUENTE_DE_SITIO = ["video", "videos"]                         # material solo cuando cuelga de un sitio
VIDEO_MARCAS = ["hyperframes.json", "compositions", "renders"]  # una carpeta con alguna es un proyecto de video
VIDEO_SALIDAS = {"renders"}                                    # de un proyecto de video solo cuentan sus videos de aquí


# ---------------- utilidades ----------------
def exists(p):
    """Path.exists() que no truena si macOS niega el permiso a la carpeta."""
    try:
        return p.exists()
    except OSError:
        return False


def cat_of(rel):
    parts = rel.split("/")
    if len(parts) == 1:
        return "raiz"
    for folder, key, _ in CATS:
        if parts[0] == folder:
            return key
    if parts[0] in ZONA_CLAVE:
        return ZONA_CLAVE[parts[0]]
    # la clave depende solo del nombre exacto de la carpeta: no cambia aunque aparezcan o se vayan otras parecidas
    key = "z-" + (slug(parts[0]) or "carpeta") + "-" + hashlib.sha1(parts[0].encode("utf-8")).hexdigest()[:6]
    ZONA_CLAVE[parts[0]] = key
    ZONA_CARPETA[key] = parts[0]
    return key


def tono(c):
    r, g, b = (int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hls(r, g, b)[0] * 360


def color_zona(i):
    """Color de la zona nueva número i: primero la paleta; después se generan girando el tono (ángulo áureo),
    saltando rojo, naranja y ámbar (son de la marca y de lo urgente) y lo que quede a menos de 12° de otro color."""
    if i < len(COLORES_NUEVOS):
        return COLORES_NUEVOS[i]
    tonos = [tono(c) for c in COLORES_FIJOS + COLORES_NUEVOS]
    k = aceptados = 0
    while True:
        h = (k * 137.508 + 20) % 360
        k += 1
        if h >= 345 or h <= 55 or min(min(abs(h - u), 360 - abs(h - u)) for u in tonos) < 12:
            continue
        if aceptados == i - len(COLORES_NUEVOS):
            r, g, b = colorsys.hls_to_rgb(h / 360, 0.60 + 0.08 * (aceptados % 3), 0.82)
            return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))
        aceptados += 1


def zonas(cats):
    """Orden, nombres y colores de las zonas que hoy tienen archivos. El color de cada zona nueva se guarda en
    .cache/zonas.json (número de color y último día visto) para que no cambie; el de una carpeta que lleva más de
    ZONA_OLVIDO_DIAS sin aparecer se libera."""
    fijas = [c[1] for c in CATS]
    nuevas = sorted((k for k in cats if k not in fijas and k != "raiz"), key=lambda k: (-cats[k], k))
    orden = [k for k in fijas if cats.get(k)] + nuevas + (["raiz"] if cats.get("raiz") else [])
    hoy = date.today()
    try:
        crudo = json.loads(ZONAS_GUARDADAS.read_text("utf-8"))
        crudo = crudo if isinstance(crudo, dict) else {}
    except (OSError, ValueError):
        crudo = {}
    guardadas = {}
    for k, v in crudo.items():
        try:
            n, visto = (v[0], v[1]) if isinstance(v, list) else (v, hoy.isoformat())
            guardadas[k] = [int(n), str(visto)]
        except (TypeError, ValueError, IndexError):
            continue
    for k in list(guardadas):
        try:
            viejo = (hoy - date.fromisoformat(guardadas[k][1])).days > ZONA_OLVIDO_DIAS
        except ValueError:
            viejo = False
        if viejo and k not in nuevas:
            del guardadas[k]
    for k in nuevas:
        if k not in guardadas:
            antes = "z-" + (slug(ZONA_CARPETA.get(k, "")) or "carpeta")   # clave de antes del 13 nov, sin huella
            if antes in guardadas:
                guardadas[k] = guardadas.pop(antes)
            else:
                usados = {v[0] for v in guardadas.values()}
                i = 0
                while i in usados:
                    i += 1
                guardadas[k] = [i, hoy.isoformat()]
        guardadas[k][1] = hoy.isoformat()
    try:
        ZONAS_GUARDADAS.parent.mkdir(parents=True, exist_ok=True)
        ZONAS_GUARDADAS.write_text(json.dumps(guardadas, ensure_ascii=False, indent=1), "utf-8")
    except OSError:
        pass
    etiquetas = dict(CAT_LABEL)
    usadas = set(etiquetas.values())
    base = {k: legible(ZONA_CARPETA.get(k, k)).upper() for k in nuevas}
    repetidas = {e for e in base.values() if list(base.values()).count(e) > 1 or e in usadas}
    colores = {}
    for k in sorted(nuevas):   # en orden de clave, no de tamaño: los nombres no se intercambian entre escaneos
        carpeta = unicodedata.normalize("NFC", ZONA_CARPETA.get(k, k))
        e = carpeta.upper() if base[k] in repetidas else base[k]   # si se lee igual que otra, va el nombre completo
        if len(e) > 26:
            e = e[:25].rstrip() + "…"
        e0, n = e, 2
        while e in usadas:
            e = "%s %d" % (e0[:23].rstrip(), n)
            n += 1
        etiquetas[k] = e
        usadas.add(e)
        colores[k] = color_zona(guardadas[k][0])
    return orden, etiquetas, colores


def avisos_de_copia():
    try:
        a = json.loads(AVISOS.read_text("utf-8"))
        return [str(x) for x in a] if isinstance(a, list) else []
    except (OSError, ValueError):
        return []


def strip_tags(s):
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(s)


def read_text(p):
    try:
        return p.read_text("utf-8", errors="ignore")
    except OSError:
        return ""


def docx_text(p):
    try:
        with zipfile.ZipFile(p) as z:
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
        out = []
        for para in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
            t = html.unescape("".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", para, flags=re.S))).strip()
            if t:
                out.append(t)
        return out
    except Exception:
        return []


def xlsx_info(p):
    try:
        with zipfile.ZipFile(p) as z:
            wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
            sheets = [html.unescape(s) for s in re.findall(r'<sheet[^>]*name="([^"]+)"', wb)]
            ss = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore") if "xl/sharedStrings.xml" in z.namelist() else ""
            strings = [html.unescape(s) for s in re.findall(r"<t[^>]*>(.*?)</t>", ss, flags=re.S)[:40]]
        return sheets, strings
    except Exception:
        return [], []


def pdf_pages(p):
    try:
        return max(len(re.findall(rb"/Type\s*/Page[^s]", p.read_bytes())), 1)
    except OSError:
        return 1


def pieces_and_text(p, ext):
    """Devuelve (texto para buscar, piezas reales: secciones, párrafos, hojas o páginas)."""
    if ext == ".md":
        t = read_text(p)
        return t, [h.strip()[:80] for h in re.findall(r"^#{1,4}\s+(.+)$", t, flags=re.M)]
    if ext in TEXT_EXT:
        t = read_text(p)
        if ext == ".html":
            t = strip_tags(t)
        paras = [x.strip() for x in re.split(r"\n\s*\n", t) if len(x.strip()) > 40]
        return t, [x[:70] for x in paras]
    if ext == ".docx":
        paras = docx_text(p)
        heads = [x for x in paras if len(x) < 90]
        return "\n".join(paras), [x[:70] for x in (heads or paras)]
    if ext == ".xlsx":
        sheets, strings = xlsx_info(p)
        return " ".join(sheets + strings), ["Hoja: " + s for s in sheets]
    if ext == ".pdf":
        return "", ["Página %d" % (i + 1) for i in range(pdf_pages(p))]
    return "", []


def title_of(p, ext, text):
    if ext == ".md":
        m = re.search(r"^#\s+(.+)$", text, flags=re.M)
        if m:
            return m.group(1).strip()[:90]
    return re.sub(r"\s*\[MX\]\s*", "", p.stem).strip()[:90]


def snippet(text, ext):
    t = text
    if ext == ".md":
        t = re.sub(r"^---.*?---", "", t, flags=re.S)
        t = re.sub(r"[#>*`|_]", " ", t)
    return re.sub(r"\s+", " ", t).strip()[:420]


def iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def tilde(p):
    s, h = str(p), str(HOME)
    return "~" + s[len(h):] if s.lower().startswith(h.lower()) else s


def frontmatter(text):
    """Encabezado YAML sencillo: clave: valor, textos de varias líneas (> y |) y claves anidadas aplanadas."""
    m = re.match(r"^---\s*\n(.*?)\n---", text, flags=re.S)
    fm = {}
    if not m:
        return fm
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        mm = re.match(r"^\s*([A-Za-z_][\w\-]*):\s*(.*)$", lines[i])
        if mm:
            k, v = mm.group(1), mm.group(2).strip()
            if v in (">", "|", ">-", "|-", ">+", "|+"):
                buf, j = [], i + 1
                while j < len(lines) and (lines[j].startswith((" ", "\t")) or not lines[j].strip()):
                    buf.append(lines[j].strip())
                    j += 1
                v = " ".join(x for x in buf if x)
                i = j - 1
            fm[k] = v.strip().strip('"').strip("'")
        i += 1
    return fm


def slug(s):
    plain = unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


def plain(s):
    """Minúsculas y sin acentos, para comparar textos."""
    return unicodedata.normalize("NFD", str(s or "").lower()).encode("ascii", "ignore").decode()


def legible(folder):
    """Nombre de carpeta -> texto legible: sin numeración ni etiquetas entre corchetes, con guiones como espacios."""
    s = re.sub(r"\[[^\]]*\]", " ", folder)
    s = re.sub(r"^[\s_\-]*\d+[.)\-_\s]+", "", s)
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip() or folder
    return (s[:1].upper() + s[1:])[:90]


def installed_plugins():
    """{plugin: carpeta instalada} según ~/.claude/plugins/installed_plugins.json"""
    try:
        data = json.loads((CLAUDE / "plugins" / "installed_plugins.json").read_text("utf-8"))
    except (OSError, ValueError):
        return {}
    out = {}
    for key, installs in (data.get("plugins") or {}).items():
        if installs:
            out[key.split("@")[0]] = Path(installs[-1].get("installPath", ""))
    return out


# ---------------- Knowledge ----------------
def ignorado(rel):
    """True si alguna parte de la ruta es oculta o está en IGNORAR (carpetas de caché, node_modules, .zip…)."""
    return any(fnmatch.fnmatchcase(x, pat) for x in rel.split("/") for pat in IGNORAR)


ESCRITORIO = HOME / "Desktop"
VIDEOS_EXT = {".mp4", ".mov"}
VIDEOS_PANEL = ROOT / "videos"   # la copia propia del panel: sobrevive aunque borres los videos del Escritorio


def videos_del_escritorio():
    """La zona Videos del panel. Knowledge/Videos NO se copia (rsync lo excluye).
    1. Cada video suelto en tu Escritorio se copia una vez a videos/ (clon de APFS: no ocupa doble mientras sigan
       los dos). Si después lo borras del Escritorio, el panel conserva su copia.
    2. vault/Videos/ se rehace con accesos directos a videos/ (rsync borra vault/Videos en cada actualización)."""
    VIDEOS_PANEL.mkdir(exist_ok=True)
    try:
        fuentes = [p for p in ESCRITORIO.iterdir() if p.is_file() and p.suffix.lower() in VIDEOS_EXT and not p.name.startswith(".")]
    except OSError:
        fuentes = []
    for p in fuentes:
        dst = VIDEOS_PANEL / p.name
        try:
            if dst.exists() and dst.stat().st_size == p.stat().st_size:
                continue
            tmp = VIDEOS_PANEL / (".copiando-" + p.name)
            if subprocess.run(["cp", "-c", "-p", str(p), str(tmp)], capture_output=True).returncode != 0:
                shutil.copy2(p, tmp)
            tmp.replace(dst)
        except OSError:
            continue
    dest = VAULT / "Videos"
    if dest.is_symlink() or dest.is_file():
        dest.unlink()
    dest.mkdir(parents=True, exist_ok=True)
    for f in dest.iterdir():
        if f.is_symlink():
            f.unlink()
    n = 0
    for p in sorted(VIDEOS_PANEL.iterdir()):
        if p.is_file() and p.suffix.lower() in VIDEOS_EXT and not p.name.startswith("."):
            try:
                (dest / p.name).symlink_to(p)
                n += 1
            except OSError:
                pass
    if not n and not any(dest.iterdir()):
        dest.rmdir()
    return n


def scan_vault():
    nodes, texts = [], {}
    for p in sorted(VAULT.rglob("*")):
        if not p.is_file() or ignorado(p.relative_to(VAULT).as_posix()):
            continue
        rel = p.relative_to(VAULT).as_posix()
        ext = p.suffix.lower()
        text, pieces = pieces_and_text(p, ext)
        st = p.stat()
        parts = rel.split("/")
        node = {
            "id": "v%d" % len(nodes), "path": rel, "href": "vault/" + rel, "title": title_of(p, ext, text),
            **({"ruta": tilde(p.resolve())} if p.is_symlink() else {}),
            "ext": ext.lstrip(".") or "file", "cat": cat_of(rel), "folder": "/".join(parts[:-1]) or "(raíz)",
            "size": st.st_size, "mtime": iso(st.st_mtime), "words": len(re.findall(r"\w+", text)),
            "snippet": snippet(text, ext), "pieces": pieces[:MAX_PIECES], "nPieces": len(pieces),
        }
        nodes.append(node)
        texts[node["id"]] = text
    return nodes, texts


# ---------------- memoria, skills y rutinas en disco ----------------
def scan_memory():
    """Memoria de Claude: CLAUDE.md, contexto, memorias por proyecto, tus skills, las de plugins y tus rutinas.
    Se copia una foto a memoria/ para poder verlas en el panel; los originales no se tocan."""
    dest = ROOT / "memoria"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir()
    cands = []  # (ruta, origen, nombre de la foto, tipo, título forzado, clave)
    for name in ["CLAUDE.md", "METODO.md", "fuentes-web.md"]:
        cands.append((CLAUDE / name, "Global", name, "contexto", None, None))
    for p in sorted((CLAUDE / "contexto").glob("*.md")):
        cands.append((p, "Contexto", p.name, "contexto", None, None))
    for d in sorted((CLAUDE / "projects").glob("*/memory")):
        proj = d.parent.name
        label = "Sesión temporal" if "scratch" in proj else re.sub(r"^-Users-[^-]+-(Documents-|Desktop-)?", "", proj).replace("-", " ")
        for p in sorted(d.glob("*.md")):
            if p.name != "MEMORY.md":
                cands.append((p, label, p.name, "memoria", None, None))
    for p in sorted((CLAUDE / "skills").glob("*/SKILL.md")):
        n = p.parent.name
        cands.append((p, "Skill tuya", "skill-%s.md" % n, "skill", "/" + n, ("skill", n)))
    for plugin, path in sorted(installed_plugins().items()):
        for p in sorted(path.glob("skills/*/SKILL.md")):
            n = p.parent.name
            cands.append((p, "Plugin " + plugin, "plugin-%s-%s.md" % (plugin, n), "skill", "/%s:%s" % (plugin, n), ("skill", "%s:%s" % (plugin, n))))
    for p in sorted((CLAUDE / "scheduled-tasks").glob("*/SKILL.md")):
        n = p.parent.name
        cands.append((p, "Rutina", "rutina-%s.md" % n, "rutina", None, ("rutina", n)))

    out, seen, origin, index = [], set(), {}, {}
    for p, origen, snap, tipo, forced, key in cands:
        if not exists(p) or snap in seen:
            continue
        seen.add(snap)
        t = read_text(p)
        (dest / snap).write_text(t, "utf-8")
        origin[snap] = str(p)
        fm = frontmatter(t)
        st = p.stat()
        node = {
            "id": "m%d" % len(out), "path": tilde(p), "href": "memoria/" + snap,
            "title": forced or fm.get("name") or p.stem, "desc": fm.get("description", "")[:400],
            "tipo": fm.get("type") or tipo, "origen": origen, "ext": "md", "cat": "memoria",
            "mtime": iso(st.st_mtime), "size": st.st_size, "words": len(re.findall(r"\w+", t)),
            "snippet": snippet(t, ".md"),
            "pieces": [h[:70] for h in re.findall(r"^#{1,3}\s+(.+)$", t, flags=re.M)][:MAX_PIECES],
        }
        node["nPieces"] = len(node["pieces"])
        out.append(node)
        if key:
            index[key] = node
    (dest / "_origen.json").write_text(json.dumps(origin, ensure_ascii=False, indent=1), "utf-8")
    return out, index


def scan_routines(cat, index, usage):
    items = [dict(r) for r in cat["rutinas"]["items"]]
    known = {r["id"] for r in items}
    for (kind, name), node in index.items():
        if kind == "rutina" and name not in known:
            items.append({"id": name, "nombre": node["title"], "activa": False, "sinHorario": True, "icono": "alarm-clock"})
    used = (usage or {}).get("rutinas") or {}
    for r in items:
        node = index.get(("rutina", r["id"]))
        r["path"] = tilde(CLAUDE / "scheduled-tasks" / r["id"] / "SKILL.md")
        if node:
            r["nodo"] = node["id"]
            r["desc"] = node["desc"]
        u = used.get(r["id"])
        if u:
            r["uso"] = u
            if u.get("ultima") and (not r.get("ultima") or u["ultima"] > r["ultima"]):
                r["ultima"] = u["ultima"]
    historicas = [{"id": k, **{x: v[x] for x in ("corridas", "tokens", "costo", "ultima")}} for k, v in used.items() if k not in {r["id"] for r in items}]
    return items, historicas


def scan_skills(cat, index, usage):
    notas = cat.get("skills_notas") or {}
    items = [dict(s) for s in cat["skills"]["items"]]
    known = {s["id"] for s in items}
    for (kind, name), node in sorted(index.items()):
        if kind != "skill" or name in known:
            continue
        plugin = name.split(":")[0] if ":" in name else None
        items.append({"id": name, "grupo": "HyperFrames · video" if plugin == "hyperframes" else ("Plugin " + plugin if plugin else "Tuyas"),
                      "desc": (node["desc"] or "Sin descripción")[:170], "icono": "clapperboard" if plugin else "sparkles"})
        known.add(name)
    used = dict((usage or {}).get("skills") or {})
    for s in items:
        node = index.get(("skill", s["id"]))
        if node:
            s["nodo"] = node["id"]
        if s["id"] in notas:
            s.update(notas[s["id"]])
        u = used.pop(s["id"], None)
        if u:
            s["uso"] = u
    for name, u in sorted(used.items(), key=lambda kv: -kv[1]["usos"]):
        items.append({"id": name, "grupo": "Vistas en tus sesiones", "desc": "La usó Claude en tus sesiones; no está en el catálogo del panel.",
                      "icono": "history", "run": False, "uso": u})
    return items


def scan_apps(cat, usage):
    used = (usage or {}).get("apps") or {}
    items = [dict(a) for a in cat["apps"]["items"]]
    for a in items:
        calls, last, por_dia = 0, None, {}
        for server in a.get("mcp") or []:
            u = used.get(server)
            if u:
                calls += u["llamadas"]
                if u["ultima"] and (not last or u["ultima"] > last):
                    last = u["ultima"]
                for d, n in (u.get("porDia") or {}).items():
                    por_dia[d] = por_dia.get(d, 0) + n
        if a.get("mcp"):
            a["llamadas"], a["ultimaLlamada"] = calls, last
            a["porDia"] = por_dia
    return items


# ---------------- conexiones entre archivos ----------------
# Busca nombres de archivo mencionados en el texto: salta directo a cada ".md", ".pdf"…, y mira hacia atrás hasta
# 120 letras. Así no recorre el texto letra por letra (antes eran 7 s de 10 en el escaneo).
EXT_RE = re.compile(r"\.(?:md|html|docx|xlsx|pdf|txt|json)\b", re.I)
NAME_TAIL = re.compile(r"[\w\-. áéíóúñÁÉÍÓÚÑ()\[\]]{1,120}$")


def mentioned_files(text, by_base):
    found = set()
    for m in EXT_RE.finditer(text):
        tail = NAME_TAIL.search(text[max(0, m.start() - 120):m.start()])
        if not tail:
            continue
        words = (tail.group(0) + m.group(0)).split(" ")
        # "ver el archivo plan-2027.md" → prueba la frase completa y luego quitando palabras del inicio
        for i in range(len(words)):
            cand = Path(" ".join(words[i:]).strip(" `'\"()[]")).name.lower()
            if cand in by_base:
                found.add(cand)
                break
    return found


def build_links(nodes, texts, memory):
    """Conexiones reales: un archivo menciona a otro por nombre, o menciona a una persona de personas/."""
    by_base = {}
    for n in nodes:
        by_base.setdefault(Path(n["path"]).name.lower(), []).append(n["id"])
        by_base.setdefault(Path(n["path"]).stem.lower(), []).append(n["id"])
    people = {}
    for n in nodes:
        if "/personas/" in n["path"]:
            first = Path(n["path"]).stem.split("-")[0]
            if len(first) >= 4:
                people[first.capitalize()] = n["id"]
    people_re = re.compile(r"\b(%s)\b" % "|".join(re.escape(x) for x in sorted(people, key=len, reverse=True))) if people else None
    links = set()
    alltexts = dict(texts)
    for m in memory:
        alltexts[m["id"]] = m["snippet"] + " " + m.get("desc", "")
    for nid, text in alltexts.items():
        if not text:
            continue
        for base in mentioned_files(text[:200000], by_base):
            for tid in by_base.get(base, []):
                if tid != nid:
                    links.add(tuple(sorted((nid, tid))))
        if people_re:
            for name in set(people_re.findall(text)):
                pid = people[name]
                if pid != nid:
                    links.add(tuple(sorted((nid, pid))))
    return [list(l) for l in sorted(links)]


# ---------------- accesos directos y artifacts ----------------
def relink(link, target):
    try:
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(target)
        return True
    except OSError:
        return False


def link_external(items):
    """Accesos directos en externas/ para abrir páginas HTML de tu compu desde el panel. No copian nada."""
    ext = ROOT / "externas"
    ext.mkdir(exist_ok=True)
    for it in items:
        if "ruta" not in it:
            continue
        src = Path(it["ruta"])
        if not exists(src):
            it["href"] = None
            continue
        s = slug(it["nombre"])
        if src.name == "index.html":
            ok = relink(ext / s, src.parent)
            it["href"] = "externas/%s/index.html" % s if ok else None
        else:
            ok = relink(ext / (s + src.suffix), src)
            it["href"] = "externas/%s%s" % (s, src.suffix) if ok else None
    return items


PAGE_EXT = {"html", "htm"}
VIDEO_EXT = {"mp4", "mov"}
INDEX = ("index.html", "index.htm")


class Bandeja:
    """Qué archivo entra a la bandeja de artifacts (mismas reglas que el panel portátil).

    - Material o código fuente (FUENTE): nada de adentro cuenta.
    - Proyecto de video (carpeta con una de VIDEO_MARCAS): sus páginas son código; cuentan solo sus videos dentro
      de VIDEO_SALIDAS, con el nombre del proyecto.
    - Sitio (carpeta con index.html): un solo artifact, su index.html; sus otras páginas no cuentan aparte y las
      carpetas FUENTE_DE_SITIO de adentro son material.
    """

    def __init__(self):
        self._video, self._site = {}, {}

    @staticmethod
    def match(name, patterns):
        n = plain(name)
        return any(fnmatch.fnmatchcase(n, p) for p in patterns)

    def is_video(self, folder):
        if folder not in self._video:
            self._video[folder] = any(exists(folder / m) for m in VIDEO_MARCAS)
        return self._video[folder]

    def is_site(self, folder):
        if folder not in self._site:
            self._site[folder] = any(exists(folder / i) for i in INDEX)
        return self._site[folder]

    def role(self, root, rel):
        """("suelto", None), ("sitio", carpeta del sitio), ("video", carpeta del proyecto) o None si no cuenta."""
        parts = rel.split("/")
        dirs, name = parts[:-1], parts[-1]
        if any(self.match(d, FUENTE) for d in dirs):
            return None
        chain = [root]
        for d in dirs:
            chain.append(chain[-1] / d)
        ext = Path(name).suffix.lower().lstrip(".")
        projects = [k for k, f in enumerate(chain) if self.is_video(f)]
        if projects:
            k = projects[-1]   # el proyecto más cercano al archivo
            if ext in VIDEO_EXT and any(plain(d) in VIDEO_SALIDAS for d in dirs[k:]):
                return ("video", chain[k])
            return None
        sites = [k for k, f in enumerate(chain) if self.is_site(f)]
        if sites:
            k = sites[0]       # el sitio más de afuera: sus subcarpetas son páginas del mismo sitio
            if ext in PAGE_EXT:
                return ("sitio", chain[k]) if k == len(dirs) and name.lower() in INDEX else None
            if any(self.match(d, FUENTE_DE_SITIO) for d in dirs[k:]):
                return None
        return ("suelto", None)


def page_title(p):
    m = re.search(r"<title[^>]*>(.*?)</title>", read_text(p)[:6000], flags=re.S | re.I)
    return html.unescape(re.sub(r"\s+", " ", m.group(1)).strip())[:90] if m and m.group(1).strip() else ""


def walk_files(root, exts, depth=5):
    """Archivos con esas extensiones hasta depth niveles, sin entrar a carpetas ocultas ni de material."""
    out = []
    for base, dirs, files in os.walk(str(root)):
        level = len(Path(base).relative_to(root).parts)
        dirs[:] = [d for d in dirs if not d.startswith(".") and not Bandeja.match(d, FUENTE) and level + 1 < depth]
        out += [Path(base) / f for f in files if not f.startswith(".") and Path(f).suffix.lower() in exts]
    return sorted(out)


def sin_repetidos(items):
    """Mismo título y mismo tipo: queda el más nuevo."""
    best = {}
    for a in items:
        k = (re.sub(r"\s+", " ", plain(a["titulo"])).strip(), a["tipo"])
        if k not in best or a["fecha"] > best[k]["fecha"]:
            best[k] = a
    return list(best.values())


def scan_artifacts(cat, nodes):
    """Bandeja de lo que Claude te ha hecho: entregables del Knowledge, páginas de tu carpeta CC, renders de tus
    videos y artifacts de claude.ai. Lo que es material o código fuente no entra (reglas en la clase Bandeja)."""
    rules, items = Bandeja(), []
    sin_index = lambda t, carpeta: legible(carpeta) if plain(t) in ("index", "index.html", "index.htm") else t
    for n in nodes:
        ext, rel = n["ext"], n["path"]
        doc = ext in ("docx", "xlsx", "pdf", "pptx") and re.search(r"/(entregables|weeklys)/", "/" + rel)
        if not (ext in PAGE_EXT or ext in VIDEO_EXT or doc):
            continue
        role = rules.role(VAULT, rel)
        if not role or (ext in VIDEO_EXT and role[0] != "video"):
            continue   # de Knowledge, los videos que cuentan son los renders de un proyecto de video
        how, folder = role
        a = {"titulo": n["title"], "tipo": ext, "fecha": n["mtime"], "href": n["href"], "node": n["id"],
             "origen": "Knowledge", "ruta": n["path"], "viejo": "/respaldo/" in "/" + n["path"]}
        if ext in PAGE_EXT:
            a["titulo"] = page_title(VAULT / rel) or (legible(folder.name) if how == "sitio" else n["title"])
        elif how == "video":
            a["titulo"], a["sub"] = legible(folder.name), "%.1f MB" % (n["size"] / 1e6)
        a["titulo"] = sin_index(a["titulo"], (VAULT / rel).parent.name)
        items.append(a)
    if exists(CC) and relink(ROOT / "externas" / "cc", CC):
        try:
            files = walk_files(CC, {".html", ".htm", ".mp4", ".mov"})
        except OSError:
            files = []
        for p in files:
            rel, ext = p.relative_to(CC).as_posix(), p.suffix.lower().lstrip(".")
            role = rules.role(CC, rel)
            if not role or (ext in VIDEO_EXT and role[0] != "video"):
                continue
            how, folder = role
            st = p.stat()
            if ext in PAGE_EXT:
                title = page_title(p) or (legible(folder.name) if how == "sitio" else p.stem)
                sub = p.parent.name if p.name.lower() in INDEX else p.stem
            else:
                title, sub = legible(folder.name), "%.1f MB" % (st.st_size / 1e6)
            items.append({"titulo": sin_index(title, p.parent.name)[:90], "tipo": ext, "fecha": iso(st.st_mtime), "href": "externas/cc/" + rel,
                          "origen": "CC", "ruta": tilde(p), "sub": sub})
    videos = ROOT.parent / "videos"
    if exists(videos) and relink(ROOT / "externas" / "videos", videos):
        for p in walk_files(videos, {".mp4", ".mov"}):
            rel = p.relative_to(videos).as_posix()
            role = rules.role(videos, rel)
            if not role or role[0] != "video":
                continue
            st = p.stat()
            items.append({"titulo": legible(role[1].name), "tipo": p.suffix.lower().lstrip("."), "fecha": iso(st.st_mtime),
                          "href": "externas/videos/" + rel, "origen": "Video", "ruta": tilde(p), "sub": "%.1f MB" % (st.st_size / 1e6)})
    for a in (cat.get("artifacts_claude") or {}).get("items", []):
        items.append({"titulo": a["titulo"], "tipo": "claude", "fecha": a["fecha"] + "T12:00:00Z", "url": a["url"], "origen": "claude.ai"})
    items = sin_repetidos(items)
    items.sort(key=lambda x: x["fecha"], reverse=True)
    return items


def scan_thumbs(nodes, artifacts):
    """Miniaturas reales (capturas de páginas, primeras hojas de documentos, imágenes y cuadros de video)."""
    items = [(n["href"], VAULT / n["path"], n["ext"]) for n in nodes]
    items += [(a["href"], ROOT / a["href"], a["tipo"]) for a in artifacts if a.get("href") and not a.get("node")]
    try:
        mapping, info = thumbs.build(items)
    except Exception as e:  # sin miniaturas el panel sigue funcionando
        return {"error": str(e), "total": 0}
    for n in nodes:
        if n["href"] in mapping:
            n["thumb"] = mapping[n["href"]]
    for a in artifacts:
        if a.get("href") in mapping:
            a["thumb"] = mapping[a["href"]]
    return info


# ---------------- pendientes ----------------
def parse_fecha(texto, hoy):
    m = re.search(r"(?:(\d{1,2})\s*-\s*)?(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)", texto.lower())
    if not m:
        return None
    mes, dia = MESES[m.group(3)], int(m.group(2))
    year = hoy.year + (1 if mes < hoy.month - 6 else 0)
    try:
        return date(year, mes, dia).isoformat()
    except ValueError:
        return None


def clean_md(s):
    s = re.sub(r"`([^`]*)`", r"\1", s)
    return re.sub(r"\*\*([^*]*)\*\*", r"\1", s).strip()


def scan_pendientes(cat, nodes):
    """Lee las tablas de pendientes de tu ESTADO.md (ruta en catalogo.json, "pendientes_archivo")."""
    fuente = cat.get("pendientes_archivo") or "Proyectos/ESTADO.md"
    yo = (cat.get("owner") or {}).get("nombre", "").strip().lower()
    f = VAULT / fuente
    tareas, hoy = [], date.today()
    node = next((n for n in nodes if n["path"] == fuente), None)
    if exists(f):
        section, cols = None, None
        for line in read_text(f).splitlines():
            h = re.match(r"^##\s+(.*)$", line)
            if h:
                section = h.group(1).strip() if "pendiente" in h.group(1).lower() else None
                cols = None
                continue
            if not section or not line.strip().startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                continue
            if cols is None:
                cols = [c.lower() for c in cells]
                continue
            row = dict(zip(cols, cells))
            que = clean_md(row.get("qué") or row.get("que") or "")
            if not que:
                continue
            cuando = clean_md(row.get("cuándo") or row.get("cuando") or "")
            quien = clean_md(row.get("quién") or row.get("quien") or row.get("de quién") or row.get("de quien") or "")
            tareas.append({"que": que, "cuando": cuando, "quien": quien, "fecha": parse_fecha(cuando, hoy) if cuando else None,
                           "recurrente": bool(re.search(r"cada ", cuando.lower())), "mio": bool(yo) and yo in quien.lower(), "seccion": section})
    return {"tareas": tareas, "fuente": fuente, "nodo": node["id"] if node else None,
            "actualizado": node["mtime"] if node else None}


def claude_logged_in():
    try:
        r = subprocess.run([str(ROOT / "bin" / "claude"), "auth", "status"], capture_output=True, text=True, timeout=10)
        return bool(json.loads(r.stdout).get("loggedIn"))
    except Exception:
        return False


def scan_sistema(cat):
    """Lista de lo que falta para el modo mayordomo. Lo que se puede comprobar en la compu se comprueba aquí."""
    checks = {
        "node_ffmpeg": exists(NODE_BIN / "node") and exists(NODE_BIN / "ffmpeg"),
        "server": exists(ROOT / "server.py"),
        "claude_login": claude_logged_in(),
        "zshrc": ".local/node/bin" in read_text(HOME / ".zshrc") + read_text(HOME / ".zprofile"),
        "hyperframes": "hyperframes" in installed_plugins(),
    }
    items = [dict(i) for i in cat["pendientes"]["items"]]
    for it in items:
        d = it.pop("detecta", None)
        if d in checks:
            it["auto"] = True
            if checks[d]:
                it["estado"] = "hecho"
            elif it["estado"] == "hecho":
                it["estado"] = "pendiente"
    return items


def write_pendientes_md(sistema):
    orden = ["hecho", "pendiente", "listo para crear", "bloqueado", "por decidir"]
    hechos = sum(1 for i in sistema if i["estado"] == "hecho")
    out = ["# Pendientes para el modo mayordomo", "",
           "Lo que falta para que MOCA esté conectado y automatizado, y tú solo apruebes.",
           "Este archivo se genera solo en cada escaneo. La fuente es `catalogo.json`, sección `pendientes`.", "",
           "**Avance: %d de %d listos.** Actualizado: %s." % (hechos, len(sistema), datetime.now().strftime("%d/%m/%Y %H:%M")), ""]
    areas = []
    for it in sistema:
        if it["area"] not in areas:
            areas.append(it["area"])
    for area in areas:
        out += ["## " + area, "", "| Estado | Qué | Quién | Cómo | Qué desbloquea |", "|---|---|---|---|---|"]
        for it in sorted((i for i in sistema if i["area"] == area), key=lambda i: orden.index(i["estado"]) if i["estado"] in orden else 9):
            out.append("| %s | %s | %s | %s | %s |" % (it["estado"].capitalize(), it["titulo"], it.get("quien", ""),
                                                      (it.get("como") or "").replace("|", "/"), it.get("desbloquea", "")))
        out.append("")
    (ROOT / "PENDIENTES.md").write_text("\n".join(out), "utf-8")


# ---------------- principal ----------------
def main():
    VAULT.mkdir(exist_ok=True)   # sin copia de Knowledge el panel abre sin documentos (y con su aviso), no truena
    cat = json.loads((ROOT / "catalogo.json").read_text("utf-8"))
    try:
        usage = uso.scan_usage()
    except Exception as e:  # el panel debe abrir aunque falle la medición
        usage = {"ok": False, "motivo": "No pude medir el uso: %s" % e}
    n_videos = videos_del_escritorio() if os.environ.get("MOCA_VIDEOS_ESCRITORIO") else 0   # apagado: nada de videos por defecto
    nodes, texts = scan_vault()
    memory, index = scan_memory()
    routines, historicas = scan_routines(cat, index, usage)
    skills = scan_skills(cat, index, usage)
    apps = scan_apps(cat, usage)
    links = build_links(nodes, texts, memory)
    deg = {}
    for a, b in links:
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
    for n in nodes + memory:
        n["deg"] = deg.get(n["id"], 0)
    cats, folders = {}, {}
    for n in nodes:
        cats[n["cat"]] = cats.get(n["cat"], 0) + 1
        folders[n["folder"]] = folders.get(n["folder"], 0) + 1
    cat_order, cat_label, cat_color = zonas(cats)
    micro = link_external([dict(i) for i in cat["microapps_externas"]["items"]])
    artifacts = scan_artifacts(cat, nodes)
    thumb_info = scan_thumbs(nodes, artifacts)
    pend = scan_pendientes(cat, nodes)
    pend["sistema"] = scan_sistema(cat)
    write_pendientes_md(pend["sistema"])
    if usage.get("ok"):
        usage = {k: v for k, v in usage.items() if k not in ("skills", "apps")}
        usage["rutinasHistoricas"] = historicas
        usage.pop("rutinas", None)

    data = {
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "owner": cat["owner"], "knowledgeDir": tilde(KNOWLEDGE), "catLabel": cat_label, "catOrder": cat_order, "catColor": cat_color,
        "cats": cats, "folders": folders, "avisos": avisos_de_copia(),
        "nodes": nodes, "memory": memory, "links": links,
        "routines": routines, "skills": skills, "apps": apps,
        "agenda": cat["agenda"]["items"], "agendaFuente": cat["agenda"]["_fuente"],
        "microExt": micro, "artifacts": artifacts, "pendientes": pend, "usage": usage,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.BRAIN = " + json.dumps(data, ensure_ascii=False) + ";\n", "utf-8")
    total_pieces = sum(len(n["pieces"]) for n in nodes + memory)
    print("Archivos: %d · memorias: %d · conexiones: %d · piezas: %d" % (len(nodes), len(memory), len(links), total_pieces))
    print("Rutinas: %d · skills: %d · artifacts: %d · pendientes: %d · sistema: %d de %d listos" % (
        len(routines), len(skills), len(artifacts), len(pend["tareas"]),
        sum(1 for i in pend["sistema"] if i["estado"] == "hecho"), len(pend["sistema"])))
    if thumb_info.get("error"):
        print("Miniaturas: no se pudieron generar (%s)" % thumb_info["error"])
    else:
        print("Miniaturas: %d listas · %d nuevas en %.0f s%s" % (thumb_info["total"], thumb_info["nuevas"], thumb_info["segundos"],
              " · %d se completan en el siguiente escaneo" % thumb_info["pendientes"] if thumb_info["pendientes"] else ""))
    if usage.get("ok"):
        print("Uso: %.0f M de tokens en 7 días · %d sesiones" % (usage["tokens7d"] / 1e6, usage["nSesiones"]))
    else:
        print("Uso: sin medir (%s)" % usage.get("motivo"))
    print("Escrito:", OUT.relative_to(ROOT), "(%d KB)" % (OUT.stat().st_size // 1024))


if __name__ == "__main__":
    main()
