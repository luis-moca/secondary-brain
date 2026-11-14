#!/usr/bin/env python3
"""Puesta al día diaria del panel (pensada para correr sola a las 7:00).

Qué actualiza:
  1. Las fechas del ESTADO.md de ejemplo: los pendientes y el calendario del demo se recorren a partir de hoy.
     Solo si el archivo trae la marca de ejemplo; tu ESTADO.md real nunca se toca.
  2. La rutina de ejemplo con fecha única: si ya pasó, se mueve 14 días adelante (solo la de ejemplo).
  3. La copia de tu Knowledge y el escaneo: fecha de «Escaneado», edad de cada archivo, miniaturas nuevas,
     pendientes y uso de tokens de los últimos 7 días. Si el panel está abierto, se pone al día solo.

Uso:
    python3 actualizar_diario.py              # actualizar ahora
    python3 actualizar_diario.py --instalar   # programarlo diario a las 7:00 (launchd en Mac, cron en Linux)
    python3 actualizar_diario.py --quitar     # quitar la programación
    python3 actualizar_diario.py --hora 6:30 --instalar
"""
import argparse
import json
import os
import random
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
KNOWLEDGE = Path(os.environ.get("MOCA_KNOWLEDGE") or ROOT.parent / "Knowledge").expanduser()
PORT = int(os.environ.get("MOCA_PORT", "8765"))
LOG = ROOT / ".cache" / "diario.log"
ETIQUETA = "com.moca.actualizar-diario"
PLIST = Path.home() / "Library" / "LaunchAgents" / (ETIQUETA + ".plist")
RUTINA_EJEMPLO = "recordatorio-ejemplo"

sys.path.insert(0, str(ROOT / "semilla"))


def log(msg):
    linea = "%s  %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(linea)
    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(linea + "\n")


# ---------- 1. fechas del ejemplo ----------
def fechas_de_ejemplo():
    import generar
    catalogo = json.loads((ROOT / "catalogo.json").read_text("utf-8"))
    estado = KNOWLEDGE / (catalogo.get("pendientes_archivo") or "Proyectos/ESTADO.md")
    try:
        texto = estado.read_text("utf-8")
    except OSError:
        return "Sin ESTADO.md de ejemplo."
    if generar.ESTADO_MARCA not in texto:
        return "Tu ESTADO.md es tuyo: no se toca."
    semilla = generar.Semilla(KNOWLEDGE, random.Random(date.today().toordinal()))
    semilla.estado(estado)
    return "Fechas del ejemplo recorridas a partir de hoy."


# ---------- 2. rutina de ejemplo ----------
def rutina_de_ejemplo():
    f = ROOT / "catalogo.json"
    cat = json.loads(f.read_text("utf-8"))
    for r in cat.get("rutinas", {}).get("items", []):
        if r.get("id") == RUTINA_EJEMPLO and r.get("unica"):
            cuando = datetime.fromisoformat(r["unica"])
            if cuando.date() < date.today():
                r["unica"] = (datetime.combine(date.today() + timedelta(days=14), cuando.time())).strftime("%Y-%m-%dT%H:%M")
                f.write_text(json.dumps(cat, ensure_ascii=False, indent=1), "utf-8")
                return "Rutina de ejemplo movida al %s." % r["unica"][:10]
            return "Rutina de ejemplo vigente."
    return "Sin rutina de ejemplo."


# ---------- 3. copia y escaneo ----------
def panel_abierto():
    """Si el panel corre, que él haga la actualización: así la página abierta se pone al día sola."""
    url = "http://localhost:%d/api/rescan" % PORT
    req = urllib.request.Request(url, data=b"{}", method="POST", headers={
        "Content-Type": "application/json", "X-MOCA": "1", "Origin": "http://localhost:%d" % PORT,
        "Sec-Fetch-Site": "same-origin"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            d = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        return None
    return "Panel abierto: %s" % ((d.get("log") or ["actualizado"])[0] if d.get("ok") else d.get("error", "falló"))


def copiar_y_escanear():
    env = dict(os.environ, PATH=str(Path.home() / ".local" / "node" / "bin") + os.pathsep + os.environ.get("PATH", ""))
    for paso in (["server.py", "--copiar"], ["scan.py"]):
        r = subprocess.run([sys.executable, *paso], cwd=ROOT, env=env, capture_output=True, text=True, timeout=1800)
        if r.returncode:
            return "Falló %s: %s" % (paso[0], (r.stderr or r.stdout).strip()[-300:])
    return "Copia y escaneo al día."


def actualizar():
    for paso in (fechas_de_ejemplo, rutina_de_ejemplo):
        try:
            log(paso())
        except Exception as e:  # una falla aquí no debe frenar el escaneo
            log("%s falló: %s" % (paso.__name__, e))
    log(panel_abierto() or copiar_y_escanear())


# ---------- programación diaria ----------
def plist(hora, minuto):
    return """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key><array><string>%s</string><string>%s</string></array>
  <key>WorkingDirectory</key><string>%s</string>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>%d</integer><key>Minute</key><integer>%d</integer></dict>
  <key>StandardOutPath</key><string>%s</string>
  <key>StandardErrorPath</key><string>%s</string>
</dict></plist>
""" % (ETIQUETA, sys.executable, ROOT / "actualizar_diario.py", ROOT, hora, minuto, LOG, LOG)


def instalar(hora, minuto):
    if sys.platform == "darwin":
        PLIST.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["launchctl", "bootout", "gui/%d" % os.getuid(), str(PLIST)], capture_output=True)
        PLIST.write_text(plist(hora, minuto), "utf-8")
        r = subprocess.run(["launchctl", "bootstrap", "gui/%d" % os.getuid(), str(PLIST)], capture_output=True, text=True)
        if r.returncode:
            sys.exit("No pude programarlo: %s" % r.stderr.strip())
        print("Programado diario a las %02d:%02d (launchd). Si la Mac está dormida, corre al despertar." % (hora, minuto))
        print("Registro: %s · Quitar: python3 actualizar_diario.py --quitar" % LOG)
        return
    linea = "%d %d * * * cd '%s' && '%s' actualizar_diario.py >> '%s' 2>&1  # %s" % (
        minuto, hora, ROOT, sys.executable, LOG, ETIQUETA)
    actual = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
    nuevo = "".join(l + "\n" for l in actual.splitlines() if ETIQUETA not in l) + linea + "\n"
    subprocess.run(["crontab", "-"], input=nuevo, text=True, check=True)
    print("Programado diario a las %02d:%02d (cron)." % (hora, minuto))


def quitar():
    if sys.platform == "darwin":
        subprocess.run(["launchctl", "bootout", "gui/%d" % os.getuid(), str(PLIST)], capture_output=True)
        if PLIST.exists():
            PLIST.unlink()
    else:
        actual = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
        subprocess.run(["crontab", "-"], input="".join(l + "\n" for l in actual.splitlines() if ETIQUETA not in l), text=True)
    print("Listo: ya no se actualiza solo.")


def main():
    ap = argparse.ArgumentParser(description="Puesta al día diaria de MOCA")
    ap.add_argument("--instalar", action="store_true")
    ap.add_argument("--quitar", action="store_true")
    ap.add_argument("--hora", default="7:00", help="HH:MM, por defecto 7:00")
    a = ap.parse_args()
    hora, minuto = (int(x) for x in a.hora.split(":"))
    if a.quitar:
        return quitar()
    if a.instalar:
        return instalar(hora, minuto)
    actualizar()


if __name__ == "__main__":
    main()
