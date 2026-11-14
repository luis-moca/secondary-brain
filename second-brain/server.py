#!/usr/bin/env python3
"""Servidor local de MOCA.

Sirve el panel y le da acciones reales: ver archivos completos, abrirlos en tu Mac,
reescanear tu Knowledge y correr skills de Claude en segundo plano.

Seguridad:
- Solo escucha en 127.0.0.1: nadie fuera de tu compu lo ve.
- Las acciones (POST) exigen venir del mismo panel (origen localhost y encabezado X-MOCA).
- Rechaza cualquier petición cuyo encabezado Host no sea localhost (evita que una página web ajena lea tus archivos).
- Dos puertos: el panel y sus acciones viven en 8765; tus archivos (vault/, memoria/, externas/) se sirven en 8766.
  Así un HTML guardado en tu Knowledge no puede llamar las acciones del panel ni leer sus datos.
- Solo abre o lee archivos dentro de esta carpeta (vault/, memoria/, externas/).
- "Abrir en la compu" abre el original; si es un tipo de archivo que podría ejecutarse, solo lo muestra en Finder.
- Claude corre en modo solo lectura: puede leer y buscar en tu Knowledge, no editar ni ejecutar comandos.
  Internet va apagado salvo que lo actives en esa corrida. Máximo 3 corridas a la vez.

Uso:  python3 server.py   (lo arranca "Abrir MOCA.command")
"""
import fnmatch
import html
import json
import os
import posixpath
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("MOCA_PORT", "8765"))
CONTENT_PORT = int(os.environ.get("MOCA_CONTENT_PORT", str(PORT + 1)))
HOME = Path.home()
KNOWLEDGE = Path(os.environ.get("MOCA_KNOWLEDGE") or ROOT.parent / "Knowledge").expanduser()  # o MOCA_KNOWLEDGE=/tu/carpeta
NODE_BIN = HOME / ".local" / "node" / "bin"
RUNS = ROOT / "runs"
RUNS.mkdir(exist_ok=True)
READABLE = ("vault", "memoria", "externas")
TEXT_EXT = {".md", ".txt", ".json", ".py", ".csv", ".html", ".htm", ".js", ".css", ".yml", ".yaml", ".log"}
EMBED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov"}
MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5", "opus": "claude-opus-5-5", "fable": "claude-fable-5-2"}
EFFORTS = {"low", "medium", "high", "xhigh", "max"}
READ_ONLY_TOOLS = "Read,Glob,Grep"
WEB_TOOLS = "WebSearch,WebFetch"
RUN_TIMEOUT = 15 * 60
MAX_RUNNING = 3
OPEN_CMD = os.environ.get("MOCA_OPEN", "open")  # para pruebas se puede cambiar por "echo"
SAFE_OPEN_EXT = {".md", ".txt", ".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt",
                 ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".key", ".numbers", ".pages", ".rtf"}

scan_lock = threading.Lock()
procs = {}
stopping = set()


def exists(p):
    """Path.exists() que no truena si macOS niega el permiso a la carpeta."""
    try:
        return p.exists()
    except OSError:
        return False


def tilde(p):
    s, h = str(p), str(HOME)
    return "~" + s[len(h):] if s.lower().startswith(h.lower()) else s


def claude_bin():
    base = HOME / "Library" / "Application Support" / "Claude" / "claude-code"
    found = sorted(base.glob("*/*/claude.app/Contents/MacOS/claude"), key=lambda p: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", str(p))])
    return str(found[-1]) if found else None


def env_with_node():
    env = dict(os.environ)
    env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "/usr/bin:/bin")
    # que Claude no herede variables de una sesión de escritorio
    for k in list(env):
        if k.startswith("CLAUDE_CODE_") or k in ("CLAUDECODE", "ANTHROPIC_BASE_URL"):
            env.pop(k, None)
    return env


def safe_path(rel):
    """Ruta relativa permitida -> Path absoluto. Bloquea '..' y carpetas fuera de las permitidas."""
    rel = (rel or "").lstrip("/")   # ya llega decodificada (parse_qs o JSON): decodificar otra vez rompe nombres con %XX
    parts = Path(rel).parts
    if not parts or parts[0] not in READABLE or ".." in parts:
        return None
    p = ROOT.joinpath(*parts)
    return p if exists(p) else None


def device_path(rel):
    """El archivo real que se abre en tu Mac: el original de Knowledge o de ~/.claude, no la copia del panel."""
    p = safe_path(rel)
    if not p:
        return None
    parts = Path(rel.lstrip("/")).parts
    if parts[0] == "vault" and p.is_symlink():   # videos del Escritorio: el original es al que apunta el acceso directo
        try:
            return p.resolve()
        except OSError:
            return p
    if parts[0] == "vault":
        orig = KNOWLEDGE.joinpath(*parts[1:])
        if exists(orig):
            return orig
    if parts[0] == "memoria" and len(parts) == 2:
        try:
            orig = Path(json.loads((ROOT / "memoria" / "_origen.json").read_text("utf-8")).get(parts[1], ""))
            if orig.is_absolute() and exists(orig):
                return orig
        except (OSError, ValueError):
            pass
    try:
        return p.resolve()
    except OSError:
        return p


# ---------------- lectura de archivos ----------------
def docx_paragraphs(p):
    with zipfile.ZipFile(p) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    out = []
    for para in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        style = re.search(r'<w:pStyle w:val="([^"]+)"', para)
        t = html.unescape("".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", para, flags=re.S))).strip()
        if t:
            out.append({"t": t, "h": bool(style and re.match(r"(Heading|Title|Ttulo|Titulo)", style.group(1), re.I))})
    return out


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def xlsx_sheets(p, max_rows=80, max_cols=16, max_sheets=8):
    with zipfile.ZipFile(p) as z:
        names = z.namelist()
        wb = z.read("xl/workbook.xml").decode("utf-8", "ignore")
        rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "ignore") if "xl/_rels/workbook.xml.rels" in names else ""
        relmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels)) or {}
        relmap.update({a: b for b, a in re.findall(r'Target="([^"]+)"[^>]*Id="([^"]+)"', rels)})
        shared = []
        if "xl/sharedStrings.xml" in names:
            ss = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
            for si in re.findall(r"<si>(.*?)</si>", ss, flags=re.S):
                shared.append(html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, flags=re.S))))
        sheets = []
        for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb)[:max_sheets]:
            target = relmap.get(rid, "")
            path = "xl/" + target.lstrip("/").replace("xl/", "", 1) if target else ""
            if path not in names:
                continue
            xml = z.read(path).decode("utf-8", "ignore")
            rows = []
            for row in re.findall(r"<row[^>]*>(.*?)</row>", xml, flags=re.S)[:max_rows]:
                cells = [""] * max_cols
                for attrs, inner in re.findall(r"<c ([^>]*?)(?:/>|>(.*?)</c>)", row, flags=re.S):
                    ref = re.search(r'r="([A-Z]+\d+)"', attrs)
                    if not ref:
                        continue
                    ci = col_index(ref.group(1))
                    if ci >= max_cols:
                        continue
                    v = re.search(r"<v>(.*?)</v>", inner or "", flags=re.S)
                    tinline = re.findall(r"<t[^>]*>(.*?)</t>", inner or "", flags=re.S)
                    val = ""
                    if 't="s"' in attrs and v:
                        try:
                            val = shared[int(v.group(1))]
                        except (ValueError, IndexError):
                            val = v.group(1)
                    elif tinline:
                        val = html.unescape("".join(tinline))
                    elif v:
                        val = html.unescape(v.group(1))
                    cells[ci] = val
                while cells and cells[-1] == "":
                    cells.pop()
                if any(cells):
                    rows.append(cells)
            sheets.append({"name": html.unescape(name), "rows": rows})
    return sheets


def falta(p):
    """True solo si el archivo de verdad no está; sin permiso no se puede saber y da False."""
    try:
        p.stat()
        return False
    except (FileNotFoundError, NotADirectoryError):
        return True
    except (OSError, ValueError):
        return False


def file_payload(rel):
    p = safe_path(rel)
    if not p or not p.is_file():
        return 404, {"error": "No encontré ese archivo dentro del panel.", "gone": True}
    ext = p.suffix.lower()
    url = "http://localhost:%d/%s" % (CONTENT_PORT, "/".join(urllib.parse.quote(x) for x in Path(rel.lstrip("/")).parts))
    base = {"path": rel, "url": url, "ext": ext.lstrip("."), "size": p.stat().st_size}
    partes = Path(rel.lstrip("/")).parts
    if partes and partes[0] == "vault" and falta(KNOWLEDGE.joinpath(*partes[1:])) and estado_carpeta(KNOWLEDGE) == "ok":
        base["original"] = False   # ya no está en Knowledge: se ve la última copia hasta la próxima actualización
    try:
        if ext in TEXT_EXT:
            raw = p.read_bytes()[:600_000].decode("utf-8", "ignore")
            kind = "markdown" if ext == ".md" else "html" if ext in (".html", ".htm") else "text"
            return 200, {**base, "kind": kind, "text": raw, "truncated": p.stat().st_size > 600_000}
        if ext == ".docx":
            return 200, {**base, "kind": "docx", "paragraphs": docx_paragraphs(p)[:3000]}
        if ext == ".xlsx":
            return 200, {**base, "kind": "xlsx", "sheets": xlsx_sheets(p)}
        if ext in EMBED_EXT:
            return 200, {**base, "kind": "embed"}
        return 200, {**base, "kind": "binary"}
    except Exception as e:  # archivo dañado o formato raro
        return 200, {**base, "kind": "error", "error": "No pude leer el archivo: %s" % e}


# ---------------- reescaneo ----------------
# Cada actualización trae tu Knowledge completo a vault/ con rsync: solo copia lo que cambió y quita lo que borraste.
# Medido el 13 nov 2026: 1,161 archivos, 0.10 s cuando no cambió nada. Tu carpeta original solo se lee.
# Candado: si Knowledge no está, aparece vacío o macOS no deja leerlo, la copia no se toca y el panel lo avisa.
# Lo que no se copia ni cuenta en la esfera: lo mismo que la lista "ignorar" del panel portátil (y que IGNORAR en scan.py).
# --delete-excluded borra de vault/ lo que ya se había copiado de eso. --no-perms: una carpeta que macOS no deja
# leer no vuelve ilegible la copia que ya existía.
IGNORAR = [".*", "node_modules", "__pycache__", "venv", "dist", "*.pyc", "*.zip", "*.bin", "*.dmg", "*.pkg", "*.lock", "*.map", "Icon\r", "Thumbs.db"]
# Videos/ de Knowledge no se copia: los videos pesan mucho y el panel no los necesita.
RSYNC = ["rsync", "-a", "--no-perms", "--delete", "--delete-excluded", "--exclude", "/Videos/"] + [x for pat in IGNORAR for x in ("--exclude", pat)]
STAMP_COPIA = ROOT / ".cache" / "copia_completa.txt"   # cuándo salió bien la última copia
AVISOS = ROOT / ".cache" / "avisos.json"              # lo que el panel le avisa al dueño; scan.py lo pasa a data.js
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def ultima_copia():
    try:
        return float(STAMP_COPIA.read_text().strip())
    except (OSError, ValueError):
        return 0.0


def ignorado(nombre):
    return any(fnmatch.fnmatchcase(nombre, pat) for pat in IGNORAR)


def estado_carpeta(p):
    """'ok', 'no está', 'sin permiso' o 'vacía'. Vacía = sin un solo archivo que la copia vaya a traer:
    lo oculto y lo de IGNORAR no cuenta, igual que en rsync (si no, un 'Icon' suelto vaciaría la copia)."""
    try:
        if not p.is_dir():
            return "no está"
        with os.scandir(str(p)) as it:
            next(it, None)
    except PermissionError:
        return "sin permiso"
    except OSError:
        return "no está"
    negado = []
    for base, dirs, files in os.walk(str(p), onerror=lambda e: isinstance(e, PermissionError) and negado.append(e)):
        dirs[:] = [d for d in dirs if not ignorado(d)]
        if any(not ignorado(f) for f in files):
            return "ok"
    return "sin permiso" if negado else "vacía"


def guardar_avisos(avisos):
    try:
        AVISOS.parent.mkdir(parents=True, exist_ok=True)
        AVISOS.write_text(json.dumps(avisos, ensure_ascii=False), "utf-8")
    except OSError:
        pass


def aviso_candado(estado):
    """El candado: Knowledge no está, aparece vacía o no se deja leer. La copia no se toca y queda el aviso."""
    que = {"no está": "No encuentro tu carpeta Knowledge", "vacía": "Tu carpeta Knowledge aparece vacía",
           "sin permiso": "macOS no deja leer tu carpeta Knowledge"}[estado]
    if estado_carpeta(ROOT / "vault") == "ok":
        t = ultima_copia()
        cuando = ("del %d %s" % (time.localtime(t).tm_mday, MESES_CORTOS[time.localtime(t).tm_mon - 1])) if t else "anterior"
        msg = ("%s (%s). El panel sigue con la copia %s y no se borró nada. Si la quitaste a propósito, "
               "borra la carpeta second-brain/vault y actualiza." % (que, tilde(KNOWLEDGE), cuando))
    else:
        msg = "%s (%s) y no hay copia anterior: el panel abre sin documentos." % (que, tilde(KNOWLEDGE))
    guardar_avisos([msg])
    return [msg], False


def reparar_permisos(carpeta):
    """Con --no-perms, una carpeta que llegó ilegible se quedaría así en la copia: aquí se le devuelve la lectura.
    Solo toca la copia del panel; tarda milisegundos con un par de miles de entradas."""
    for base, dirs, files in os.walk(str(carpeta)):
        for d in dirs:
            p = os.path.join(base, d)
            try:
                m = os.lstat(p).st_mode
                if not os.path.islink(p) and m & 0o700 != 0o700:
                    os.chmod(p, m | 0o700)
            except OSError:
                pass
        for f in files:
            p = os.path.join(base, f)
            try:
                m = os.lstat(p).st_mode
                if os.path.isfile(p) and not os.path.islink(p) and m & 0o600 != 0o600:
                    os.chmod(p, m | 0o600)
            except OSError:
                pass


def motivo_rsync(r):
    """La causa más útil de un rsync que no terminó limpio: la carpeta que no se pudo leer, si la hay."""
    lineas = [x for x in (r.stderr + "\n" + r.stdout).splitlines() if x.strip()]
    for x in lineas:
        m = re.search(r"(/[^:]+): unreadable directory", x) or re.search(r'opendir "([^"]+)" failed', x)
        if m:
            return tilde(Path(m.group(1)))
    falla = next((x for x in lineas if "rror" in x or "denied" in x), lineas[0] if lineas else "rsync terminó con %d" % r.returncode)
    return falla.replace(str(HOME), "~")[:200]


def copiar_knowledge(vault):
    return subprocess.run(RSYNC + [str(KNOWLEDGE) + "/", str(vault) + "/"], capture_output=True, text=True, timeout=900)


def sync_knowledge():
    """Trae tu Knowledge a vault/. Devuelve (mensajes, si copió)."""
    vault = ROOT / "vault"
    estado = estado_carpeta(KNOWLEDGE)
    if estado != "ok":
        return aviso_candado(estado)
    reparar_permisos(vault)
    r = copiar_knowledge(vault)
    if r.returncode in (23, 24):   # algo cambió o se borró mientras se copiaba (este rsync da 23): antes de otra vuelta,
        estado = estado_carpeta(KNOWLEDGE)   # el candado otra vez; si Knowledge se vació a media copia, no se reintenta
        if estado != "ok":
            return aviso_candado(estado)
        r = copiar_knowledge(vault)
    if r.returncode in (0, 23, 24):
        STAMP_COPIA.parent.mkdir(parents=True, exist_ok=True)
        STAMP_COPIA.write_text(str(time.time()))
    if r.returncode in (0, 24):
        guardar_avisos([])
        return ["Copia de Knowledge al día."], True
    falla = motivo_rsync(r)
    if r.returncode == 23:
        # este rsync, si no puede leer una carpeta, no aplica ningún borrado en esa vuelta: el aviso lo dice tal cual
        msg = ("Copié lo nuevo de tu Knowledge, pero no pude leer %s. Mientras siga así, lo que borres o muevas en "
               "Knowledge puede seguir en el panel." % falla)
        guardar_avisos([msg])
        return [msg], True
    msg = "No pude copiar tu Knowledge (%s). El panel sigue con lo que ya tenía." % falla
    guardar_avisos([msg])
    return [msg], False


def rescan():
    if not scan_lock.acquire(blocking=False):
        return 409, {"error": "Ya hay un escaneo en curso."}
    try:
        t0 = time.time()
        log, copio = sync_knowledge()
        r = subprocess.run([sys.executable, str(ROOT / "scan.py")], capture_output=True, text=True, timeout=900, cwd=str(ROOT))
        log.append(r.stdout.strip() or r.stderr[-600:])
        ok = r.returncode == 0
        return (200 if ok else 500), {"ok": ok, "log": log, "copio": copio, "seconds": round(time.time() - t0, 1)}
    finally:
        scan_lock.release()


# ---------------- skills en segundo plano ----------------
def run_file(rid):
    return RUNS / (rid + ".json")


def save_run(run):
    run_file(run["id"]).write_text(json.dumps(run, ensure_ascii=False, indent=1), "utf-8")


def start_run(body):
    cb = claude_bin()
    if not cb:
        return 503, {"error": "No encontré Claude Code dentro de la app de Claude."}
    skill = (body.get("skill") or "").strip().lstrip("/")
    text = (body.get("prompt") or "").strip()
    if skill and not re.fullmatch(r"[\w:.\-]+", skill):
        return 400, {"error": "Nombre de skill inválido."}
    prompt = ("/" + skill + (" " + text if text else "")) if skill else text
    if not prompt:
        return 400, {"error": "Escribe qué quieres que haga."}
    if len(prompt) > 20000:
        return 400, {"error": "El texto es demasiado largo."}
    if len(procs) >= MAX_RUNNING:
        return 429, {"error": "Ya hay %d corridas en curso. Espera a que termine una." % MAX_RUNNING}
    model = MODELS.get(body.get("model"), MODELS["sonnet"])
    effort = body.get("effort") if body.get("effort") in EFFORTS else "medium"
    cwd = KNOWLEDGE if exists(KNOWLEDGE) else ROOT / "vault"
    web = bool(body.get("web"))
    tools = READ_ONLY_TOOLS + ("," + WEB_TOOLS if web else "")
    rid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    run = {"id": rid, "skill": skill, "prompt": prompt, "model": model, "effort": effort, "web": web, "cwd": str(cwd),
           "status": "corriendo", "started": time.time(), "ended": None, "result": None, "cost": None, "tokens": None}
    cmd = [cb, "-p", prompt, "--output-format", "json", "--model", model, "--effort", effort,
           "--permission-mode", "default", "--allowedTools", tools]
    try:
        proc = subprocess.Popen(cmd, cwd=str(cwd), env=env_with_node(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except OSError as e:
        return 500, {"error": "No pude arrancar Claude: %s" % e}
    run["pid"] = proc.pid
    procs[rid] = proc
    save_run(run)

    def wait():
        try:
            out, err = proc.communicate(timeout=RUN_TIMEOUT)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, err = proc.communicate()
            run["status"], run["result"] = "error", "Se tardó más de 15 minutos y lo detuve."
        else:
            try:
                res = json.loads(out.strip().splitlines()[-1]) if out.strip() else {}
            except (json.JSONDecodeError, IndexError):
                res = {}
            text = res.get("result") or (err or out or "").strip()[-2000:]
            if "Not logged in" in (text or "") or ("/login" in (text or "") and res.get("is_error")):
                run["status"] = "sin sesión"
                run["result"] = "Claude no tiene sesión iniciada fuera de la app. Abre Terminal y corre una vez:\n\n\"%s\"\n\nluego escribe /login y sigue los pasos. Después vuelve a intentar." % str(ROOT / "bin" / "claude")
            elif rid in stopping or proc.returncode in (-9, -15):
                run["status"], run["result"] = "detenida", "La detuviste."
            else:
                run["status"] = "error" if res.get("is_error") or proc.returncode not in (0, None) else "terminada"
                run["result"] = text
            run["cost"] = res.get("total_cost_usd")
            u = res.get("usage") or {}
            run["tokens"] = sum(int(u.get(k) or 0) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")) or None
            run["denied"] = len(res.get("permission_denials") or [])
        run["ended"] = time.time()
        stopping.discard(rid)
        procs.pop(rid, None)
        save_run(run)

    threading.Thread(target=wait, daemon=True).start()
    return 200, run


def list_runs():
    items = []
    for f in sorted(RUNS.glob("*.json"), reverse=True)[:40]:
        try:
            r = json.loads(f.read_text("utf-8"))
            r["result_preview"] = (r.get("result") or "")[:240]
            r.pop("result", None)
            items.append(r)
        except (json.JSONDecodeError, OSError):
            continue
    return items


def stop_run(rid):
    proc = procs.get(rid)
    if not proc:
        return 404, {"error": "Esa ejecución ya no está corriendo."}
    stopping.add(rid)
    proc.kill()
    return 200, {"ok": True}


# ---------------- servidor ----------------
MIME = {**SimpleHTTPRequestHandler.extensions_map, ".md": "text/plain; charset=utf-8",
        ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
        ".txt": "text/plain; charset=utf-8", ".py": "text/plain; charset=utf-8", ".csv": "text/plain; charset=utf-8"}
PRIVATE = ("/runs/", "/.cache/", "/bin/", "/.claude/")
PRIVATE_FILES = ("/server.py", "/scan.py", "/uso.py", "/catalogo.json", "/PENDIENTES.md", "/README.md", "/Abrir MOCA.command")


class Base(SimpleHTTPRequestHandler):
    port = PORT
    extensions_map = MIME

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]).startswith("5"):
            sys.stderr.write("[MOCA] %s\n" % (fmt % args))

    def host_ok(self):
        host, _, port = (self.headers.get("Host") or "").partition(":")
        return host in ("localhost", "127.0.0.1") and port == str(self.port)

    def norm(self):
        """Ruta pedida ya normalizada (sin '..'), igual que la resuelve el servidor de archivos."""
        return posixpath.normpath("/" + urllib.parse.unquote(urllib.parse.urlparse(self.path).path).lstrip("/"))

    def top(self):
        parts = [x for x in self.norm().split("/") if x]
        return parts[0] if parts else ""

    def list_directory(self, path):
        self.send_error(403, "Sin listado de carpetas")
        return None

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class ContentHandler(Base):
    """Solo sirve tus archivos (vault/, memoria/, externas/). Sin acciones."""
    port = CONTENT_PORT

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def allowed(self):
        return self.host_ok() and self.top() in READABLE

    def send_head(self):
        """Igual que el normal, más carga por partes (Range): los videos necesitan esto para reproducirse y adelantarse."""
        m = re.match(r"bytes=(\d*)-(\d*)$", (self.headers.get("Range") or "").strip())
        path = self.translate_path(self.path)
        if not m or not (m.group(1) or m.group(2)) or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        if m.group(1) == "":
            start, end = max(0, size - int(m.group(2))), size - 1
        else:
            start, end = int(m.group(1)), min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "No existe")
            return None
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._range_left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_range_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        self._range_left = None
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)

    def do_GET(self):
        if not self.allowed():
            return self.send_json(403 if not self.host_ok() else 404, {"error": "No existe."})
        return super().do_GET()

    def do_HEAD(self):
        if not self.allowed():
            return self.send_error(404, "No existe")
        return super().do_HEAD()


class Handler(Base):
    """El panel y sus acciones."""

    def end_headers(self):
        # Sin caché vieja: el navegador siempre confirma que tiene la versión actual del panel.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store" if self.path.startswith("/js/data.js") else "no-cache")
        super().end_headers()

    def same_site_ok(self):
        # Los navegadores mandan Sec-Fetch-Site. Solo se acepta lo que pide el propio panel o una visita directa.
        return (self.headers.get("Sec-Fetch-Site") or "none") in ("same-origin", "none")

    def origin_ok(self):
        origin = self.headers.get("Origin") or ""
        return self.headers.get("X-MOCA") == "1" and origin in ("http://localhost:%d" % PORT, "http://127.0.0.1:%d" % PORT)

    def read_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if n <= 0 or n > 100_000:
            return {}
        try:
            obj = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            return obj if isinstance(obj, dict) else {}
        except (ValueError, UnicodeDecodeError):
            return {}

    def guard(self):
        if not self.host_ok():
            self.send_json(403, {"error": "Solo desde esta compu."})
            return False
        if not self.same_site_ok():
            self.send_json(403, {"error": "Solo desde el panel."})
            return False
        return True

    def do_HEAD(self):
        if not self.host_ok() or not self.same_site_ok():
            return self.send_error(403, "Solo desde el panel")
        return super().do_HEAD()

    def do_GET(self):
        if not self.guard():
            return
        u = urllib.parse.urlparse(self.path)
        if self.top() in READABLE:
            host = (self.headers.get("Host") or "localhost").split(":")[0]
            self.send_response(302)
            self.send_header("Location", "http://%s:%d%s" % (host, CONTENT_PORT, self.path))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        upath = self.norm()
        if (upath + "/").startswith(PRIVATE) or upath in PRIVATE_FILES or "/." in upath:
            return self.send_json(404, {"error": "No existe."})
        if not u.path.startswith("/api/"):
            return super().do_GET()
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/api/health":
            return self.send_json(200, {"ok": True, "claude": bool(claude_bin()), "node": exists(NODE_BIN / "node"),
                                        "ffmpeg": exists(NODE_BIN / "ffmpeg"), "knowledge": exists(KNOWLEDGE),
                                        "running": len(procs), "port": PORT, "contentPort": CONTENT_PORT,
                                        "escaneando": scan_lock.locked(), "generado": datos_generados(),
                                        "copia": iso_ts(ultima_copia())})
        if u.path == "/api/file":
            code, obj = file_payload((q.get("path") or [""])[0])
            return self.send_json(code, obj)
        if u.path == "/api/prefs":
            return self.send_json(200, load_prefs())
        if u.path == "/api/correo":
            return self.send_json(200, load_correo())
        if u.path == "/api/runs":
            return self.send_json(200, {"runs": list_runs()})
        m = re.fullmatch(r"/api/runs/([\w\-]+)", u.path)
        if m and run_file(m.group(1)).exists():
            try:
                return self.send_json(200, json.loads(run_file(m.group(1)).read_text("utf-8")))
            except (OSError, ValueError):
                return self.send_json(500, {"error": "No pude leer esa corrida."})
        return self.send_json(404, {"error": "No existe."})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if not (self.host_ok() and self.same_site_ok() and self.origin_ok()):
            return self.send_json(403, {"error": "Acción bloqueada: solo desde el panel."})
        body = self.read_body()
        if u.path == "/api/open":
            p = device_path(str(body.get("path") or ""))
            if not p:
                return self.send_json(404, {"error": "No encontré ese archivo."})
            # si ya no está en Knowledge, device_path da la copia del panel: solo se muestra en Finder y se avisa,
            # porque lo que se edite ahí se borra en la siguiente actualización
            copia = str(p).startswith(str((ROOT / "vault").resolve()) + os.sep)
            reveal = copia or bool(body.get("reveal")) or p.is_dir() or p.suffix.lower() not in SAFE_OPEN_EXT
            args = [OPEN_CMD, "-R", str(p)] if reveal else [OPEN_CMD, str(p)]
            try:
                r = subprocess.run(args, capture_output=True, text=True, timeout=20)
            except (OSError, subprocess.TimeoutExpired) as e:
                return self.send_json(500, {"ok": False, "error": str(e)})
            return self.send_json(200 if r.returncode == 0 else 500,
                                  {"ok": r.returncode == 0, "revealed": reveal, "copia": copia, "path": tilde(p), "error": r.stderr.strip()})
        if u.path == "/api/rescan":
            try:
                code, obj = rescan()
            except (OSError, subprocess.TimeoutExpired) as e:
                code, obj = 500, {"ok": False, "error": "El escaneo falló: %s" % e}
            return self.send_json(code, obj)
        if u.path == "/api/prefs":
            try:
                return self.send_json(200, save_prefs(body))
            except OSError as e:
                return self.send_json(500, {"error": "No pude guardar: %s" % e})
        if u.path == "/api/run":
            code, obj = start_run(body)
            return self.send_json(code, obj)
        m = re.fullmatch(r"/api/runs/([\w\-]+)/stop", u.path)
        if m:
            code, obj = stop_run(m.group(1))
            return self.send_json(code, obj)
        return self.send_json(404, {"error": "No existe."})




def load_correo():
    """Resumen de correo que escribe una rutina de Claude. Si no existe, el panel explica cómo conectarlo."""
    p = ROOT / ".cache" / "correo.json"
    try:
        d = json.loads(p.read_text("utf-8"))
    except OSError:
        return {"ok": False, "archivo": tilde(p)}
    except ValueError:
        return {"ok": False, "archivo": tilde(p), "motivo": "El archivo de correo tiene un error de formato."}
    if not isinstance(d, dict):
        return {"ok": False, "archivo": tilde(p), "motivo": "El archivo de correo no tiene la forma esperada."}
    d["ok"] = True
    d["archivo"] = tilde(p)
    return d


def iso_ts(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts)) if ts else None


def datos_generados():
    """La hora del último escaneo, tal como viene en los datos: la página la compara con la suya para saber si hay algo nuevo."""
    try:
        with open(ROOT / "js" / "data.js", "r", encoding="utf-8") as f:
            m = re.search(r'"generado":\s*"([^"]+)"', f.read(4096))
        return m.group(1) if m else None
    except OSError:
        return None


# ---------- preferencias del panel (modelo por skill, skills archivadas, bandeja) ----------
PREF_KEYS = {"skills": dict, "skills_archivadas": list, "bandeja_ocultos": list}


def prefs_path():
    return ROOT / ".cache" / "preferencias.json"


def load_prefs():
    try:
        d = json.loads(prefs_path().read_text("utf-8"))
        return {k: d.get(k) if isinstance(d.get(k), t) else t() for k, t in PREF_KEYS.items()}
    except (OSError, ValueError):
        return {k: t() for k, t in PREF_KEYS.items()}


def save_prefs(body):
    cur = load_prefs()
    for k, t in PREF_KEYS.items():
        if isinstance(body.get(k), t):
            cur[k] = body[k]
    for sid, v in list(cur["skills"].items()):   # solo modelo y esfuerzo válidos
        if not isinstance(v, dict) or v.get("model") not in MODELS or v.get("effort") not in EFFORTS:
            cur["skills"].pop(sid)
    cur["skills_archivadas"] = [str(x)[:200] for x in cur["skills_archivadas"]][:500]
    cur["bandeja_ocultos"] = [str(x)[:500] for x in cur["bandeja_ocultos"]][:2000]
    p = prefs_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(cur, ensure_ascii=False, indent=1), "utf-8")
    tmp.replace(p)
    return cur

def main():
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer.request_queue_size = 128   # el panel pide decenas de miniaturas a la vez
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        content = ThreadingHTTPServer(("127.0.0.1", CONTENT_PORT), ContentHandler)
    except OSError as e:
        sys.exit("No pude abrir los puertos %d y %d: %s" % (PORT, CONTENT_PORT, e))
    threading.Thread(target=content.serve_forever, daemon=True).start()
    print("MOCA en http://localhost:%d  ·  cierra esta ventana para apagarlo" % PORT, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for proc in list(procs.values()):
            try:
                proc.kill()
            except OSError:
                pass


if __name__ == "__main__":
    if "--copiar" in sys.argv[1:]:   # el lanzador la primera vez: misma copia y mismo candado, sin servidor
        print(sync_knowledge()[0][0])
        sys.exit(0)
    main()
