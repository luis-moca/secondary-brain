#!/usr/bin/env python3
"""Genera miniaturas reales de tus archivos para que el panel tenga imágenes.

- Páginas HTML: captura con el Chrome sin ventana que instaló HyperFrames.
- Word, Excel, PowerPoint y PDF: QuickLook de macOS (qlmanage), lo mismo que usa Finder.
- Imágenes: se reducen con sips. Videos: un cuadro de en medio con FFmpeg.

Solo lee los originales. Escribe JPG de 640 px en thumbs/. Si el archivo no cambió, no se vuelve a generar.
Tiene un tope de tiempo por corrida: lo que falte se completa en el siguiente escaneo.
"""
import hashlib
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "thumbs"
HOME = Path.home()
NODE_BIN = HOME / ".local" / "node" / "bin"
QL_EXT = {"pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "key", "numbers", "pages"}
IMG_EXT = {"png", "jpg", "jpeg", "gif", "webp"}
VID_EXT = {"mp4", "mov"}
HTML_EXT = {"html", "htm"}
WIDTH = 640


def chrome_bin():
    found = sorted((HOME / ".cache" / "hyperframes" / "chrome" / "chrome-headless-shell").glob("*/chrome-headless-shell-*/chrome-headless-shell"))
    return str(found[-1]) if found else None


def name_for(key):
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16] + ".jpg"


def to_jpg(src, dst):
    """Reduce a 640 px de ancho y guarda como JPG (sips viene con macOS)."""
    r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72", "--resampleWidth", str(WIDTH), str(src), "--out", str(dst)],
                       capture_output=True, text=True, timeout=40)
    return r.returncode == 0 and dst.exists() and dst.stat().st_size > 0


def shot_html(chrome, src, dst, tmp):
    png = tmp / "shot.png"
    if png.exists():
        png.unlink()
    try:
        subprocess.run([chrome, "--screenshot=%s" % png, "--window-size=1440,900", "--hide-scrollbars", "--virtual-time-budget=6000",
                        "--force-device-scale-factor=1", "--no-first-run", "--mute-audio", src.resolve().as_uri()],
                       capture_output=True, text=True, timeout=45)
    except (subprocess.TimeoutExpired, OSError):
        return False
    return png.exists() and to_jpg(png, dst)


def shot_quicklook(batch, tmp):
    """batch: [(src, dst)] con nombres de archivo distintos entre sí. Devuelve cuántas salieron."""
    for f in tmp.glob("*.png"):
        f.unlink()
    try:
        subprocess.run(["qlmanage", "-t", "-s", str(WIDTH), "-o", str(tmp)] + [str(s) for s, _ in batch],
                       capture_output=True, text=True, timeout=120)
    except (subprocess.TimeoutExpired, OSError):
        return 0
    ok = 0
    for src, dst in batch:
        png = tmp / (src.name + ".png")
        if png.exists() and to_jpg(png, dst):
            ok += 1
    return ok


def shot_video(src, dst, tmp):
    ffmpeg = NODE_BIN / "ffmpeg"
    if not ffmpeg.exists():
        return shot_quicklook([(src, dst)], tmp) == 1
    png = tmp / "frame.png"
    if png.exists():
        png.unlink()
    for at in ("3", "0.5"):
        try:
            subprocess.run([str(ffmpeg), "-y", "-ss", at, "-i", str(src), "-frames:v", "1", str(png)], capture_output=True, timeout=60)
        except (subprocess.TimeoutExpired, OSError):
            return False
        if png.exists():
            return to_jpg(png, dst)
    return False


def build(items, budget=150):
    """items: [(clave, ruta absoluta, extensión)]. Devuelve {clave: 'thumbs/xxxx.jpg'} de las que existen al terminar."""
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    result, todo = {}, []
    wanted = set()
    for key, src, ext in items:
        ext = ext.lower()
        if ext not in QL_EXT | IMG_EXT | VID_EXT | HTML_EXT:
            continue
        dst = OUT / name_for(key)
        wanted.add(dst.name)
        try:
            fresh = dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime
        except OSError:
            continue
        if fresh:
            result[key] = "thumbs/" + dst.name
        else:
            todo.append((key, src, ext, dst))
    for f in OUT.glob("*.jpg"):          # limpia las de archivos que ya no existen
        if f.name not in wanted:
            f.unlink()
    made = skipped = 0
    if todo:
        chrome = chrome_bin()
        tmp = Path(tempfile.mkdtemp(prefix="moca-thumbs-"))
        try:
            ql = [t for t in todo if t[2] in QL_EXT]
            while ql and time.time() - t0 < budget:
                batch, names, rest = [], set(), []
                for t in ql:
                    if t[1].name not in names and len(batch) < 24:
                        names.add(t[1].name)
                        batch.append(t)
                    else:
                        rest.append(t)
                ql = rest
                shot_quicklook([(t[1], t[3]) for t in batch], tmp)
                for t in batch:
                    if t[3].exists():
                        result[t[0]] = "thumbs/" + t[3].name
                        made += 1
            for key, src, ext, dst in todo:
                if ext in QL_EXT:
                    continue
                if time.time() - t0 > budget:
                    skipped += 1
                    continue
                if ext in IMG_EXT:
                    ok = to_jpg(src, dst)
                elif ext in VID_EXT:
                    ok = shot_video(src, dst, tmp)
                else:
                    ok = bool(chrome) and shot_html(chrome, src, dst, tmp)
                if ok:
                    result[key] = "thumbs/" + dst.name
                    made += 1
            skipped += len(ql)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return result, {"nuevas": made, "pendientes": skipped, "total": len(result), "segundos": round(time.time() - t0, 1)}


if __name__ == "__main__":
    vault = ROOT / "vault"
    items = [("vault/" + p.relative_to(vault).as_posix(), p, p.suffix.lstrip(".")) for p in sorted(vault.rglob("*")) if p.is_file()]
    _, info = build(items)
    print(info)
