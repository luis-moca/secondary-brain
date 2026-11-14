#!/usr/bin/env python3
"""Arma la demo en línea del panel: una carpeta estática lista para GitHub Pages.

Corre el panel de verdad (archivos de ejemplo, copia, escaneo, miniaturas) en una carpeta temporal con una casa
vacía, así no entra nada de tu ~/.claude. Luego deja precalculado lo que el servidor contesta (visor de Word,
Excel, PDF y texto) y agrega js/demo.js, que responde en lugar de server.py. El frontend no cambia.

Uso:
    python3 second-brain/publicar_demo.py --salida _site

Lo corre .github/workflows/demo.yml cada día a las 7:00 (hora de CDMX): fechas y pendientes del demo al día.
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

PANEL = Path(__file__).resolve().parent
CASA_REAL = str(Path.home())
REPO = "https://github.com/luis-moca/secondary-brain"
MARCA = ".moca-demo-web"
FUERA = ["vault", "thumbs", "memoria", "runs", ".cache", "videos", "externas", "data.js", "__pycache__", "*.pyc"]
SITIO = ["index.html", "brain.html", "js", "css", "vault", "thumbs", "demo-api"]

SHIM = r"""// Solo en la demo en línea: contesta lo que en tu compu contesta server.py.
(() => {
  const real = window.fetch.bind(window);
  const REPO = '%s';
  const json = (obj, status = 200) => Promise.resolve(new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }));
  const leer = () => { try { return JSON.parse(localStorage.getItem('moca.prefs') || '{}'); } catch { return {}; } };
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const i = url.pathname.indexOf('/api/');
    if (url.origin !== location.origin || i < 0) return real(input, init);
    const ruta = url.pathname.slice(i), metodo = (init.method || 'GET').toUpperCase(), base = location.pathname.replace(/[^/]*$/, '');
    if (metodo === 'GET') {
      if (ruta === '/api/health') return json({ ok: true, demo: true, claude: false, node: false, ffmpeg: false, knowledge: true,
        running: 0, escaneando: false, generado: window.BRAIN && BRAIN.generado, copia: window.BRAIN && BRAIN.generado });
      if (ruta === '/api/prefs') return json(leer());
      if (ruta === '/api/runs') return json({ runs: [] });
      if (ruta === '/api/correo') return real(base + 'demo-api/correo.json');
      if (ruta === '/api/file') {
        const href = url.searchParams.get('path');
        const n = (window.BRAIN ? BRAIN.nodes : []).find(x => x.href === href);
        return n ? real(base + 'demo-api/file/' + n.id + '.json') : json({ error: 'No encontré ese archivo.', gone: true }, 404);
      }
      return json({ error: 'No existe.' }, 404);
    }
    if (ruta === '/api/prefs') { try { localStorage.setItem('moca.prefs', init.body || '{}'); } catch {} return json(JSON.parse(init.body || '{}')); }
    return json({ error: 'en la demo en línea esto no corre. Clona ' + REPO + ' y ábrelo en tu compu' }, 400);
  };
})();
""" % REPO


def correr(cmd, cwd, env):
    r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=1800)
    if r.returncode:
        sys.exit("Falló %s:\n%s" % (" ".join(map(str, cmd)), (r.stderr or r.stdout)[-1500:]))
    return r.stdout.strip()


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def uso_de_ejemplo(rutinas):
    """Uso de tokens inventado con la misma forma que mide uso.py: la vista Uso se ve completa sin datos de nadie."""
    r, ahora = random.Random(7), datetime.now(timezone.utc)
    modelos = {"claude-opus-5-5": 0.55, "claude-sonnet-5-5": 0.35, "claude-haiku-5-5": 0.10}
    dias, tot_m = [], {m: {"t": 0, "out": 0, "msgs": 0} for m in modelos}
    for k in range(21, -1, -1):
        d = (ahora - timedelta(days=k)).date()
        t = 0 if d.weekday() == 6 and r.random() < 0.6 else int(r.uniform(20, 160) * 1e6)
        m = {name: int(t * share * r.uniform(0.7, 1.3)) for name, share in modelos.items()}
        out = int(t * r.uniform(0.002, 0.004))
        dias.append({"d": d.isoformat(), "t": sum(m.values()), "out": out, "m": m})
        for name, v in m.items():
            tot_m[name]["t"] += v
            tot_m[name]["out"] += int(out * modelos[name])
            tot_m[name]["msgs"] += int(v / 4e5)
    titulos = ["Resumen de la junta del lunes", "Propuesta de capacitación", "Limpieza de la carpeta de proyectos",
               "Tablero de métricas del mes", "Investigación de usuarios: hallazgos", "Plan del trimestre",
               "Guía de onboarding v2", "Análisis de cancelaciones", "Checklist de lanzamiento", "Notas de la sesión con Diego"]
    sesiones = []
    for i, tit in enumerate(titulos):
        fin = ahora - timedelta(hours=i * 31 + r.randint(1, 20))
        tok = int(r.uniform(5, 120) * 1e6)
        sesiones.append({"titulo": tit, "inicio": iso(fin - timedelta(minutes=r.randint(20, 240))), "fin": iso(fin), "tokens": tok,
                         "out": int(tok * 0.003), "rutina": None, "carpeta": "~/Proyectos/" + ["atlas", "brujula", "cometa"][i % 3]})
    for rt in rutinas:
        if rt.get("activa"):
            runs = []
            for k in range(6):
                ts = ahora - timedelta(days=k * 3 + 1, hours=r.randint(0, 3))
                tok = int(r.uniform(0.8, 4.5) * 1e6)
                runs.append({"ts": iso(ts), "tokens": tok, "costo": round(tok / 1e6 * 1.9, 2)})
            runs.reverse()
            rt["uso"] = {"corridas": len(runs), "tokens": sum(x["tokens"] for x in runs), "tokens7d": sum(x["tokens"] for x in runs[-2:]),
                         "costo": round(sum(x["costo"] for x in runs), 2), "costo7d": round(sum(x["costo"] for x in runs[-2:]), 2),
                         "ultima": runs[-1]["ts"], "ultimoCosto": runs[-1]["costo"], "runs": runs,
                         "porDia": {x["ts"][:10]: [1, x["tokens"], x["costo"]] for x in runs}}
            rt["ultima"] = runs[-1]["ts"]
    total_t = sum(x["t"] for x in dias)
    return {"ok": True, "archivos": 64, "total": {"in": total_t // 900, "out": sum(x["out"] for x in dias), "cr": int(total_t * 0.93),
                                                   "cw": int(total_t * 0.05), "t": total_t},
            "tokens7d": sum(x["t"] for x in dias[-7:]), "dias": dias, "modelos": tot_m, "sesiones": sesiones, "nSesiones": 64,
            "notaCosto": "Demo: números de ejemplo.", "nota": "Demo en línea: el uso es inventado. En tu compu se lee de tus sesiones de Claude Code.",
            "rutinasHistoricas": []}


def correo_de_ejemplo():
    ahora = datetime.now(timezone.utc)
    return {"ok": True, "total24h": 37, "sincronizado": iso(ahora - timedelta(minutes=12)),
            "marcados": [{"asunto": "¿Confirmas la junta del lunes?", "de": "Diego", "hace": "2 h"},
                         {"asunto": "Propuesta de capacitación: comentarios", "de": "Andrea", "hace": "5 h"},
                         {"asunto": "Números del mes para revisar", "de": "Maria", "hace": "ayer"}],
            "mezcla": {"equipo": 14, "clientes": 9, "avisos": 8, "boletines": 6}}


def armar(salida):
    with tempfile.TemporaryDirectory() as tmp:
        casa = Path(tmp) / "casa"                     # casa vacía: ni tu ~/.claude ni tus rutas entran a la demo
        know, sitio = casa / "Knowledge", casa / "second-brain"
        casa.mkdir()
        shutil.copytree(PANEL, sitio, ignore=shutil.ignore_patterns(*FUERA))
        env = dict(os.environ, HOME=str(casa), MOCA_KNOWLEDGE=str(know), MOCA_OPEN="echo")
        py = sys.executable
        print(correr([py, "semilla/generar.py", "--destino", str(know)], sitio, env))
        print(correr([py, "server.py", "--copiar"], sitio, env))
        print(correr([py, "scan.py"], sitio, env).splitlines()[0])

        f = sitio / "js" / "data.js"
        s = f.read_text("utf-8")
        data = json.loads(s[s.index("{"):s.rindex("}") + 1])
        data["usage"] = uso_de_ejemplo(data["routines"])
        f.write_text("window.BRAIN = " + json.dumps(data, ensure_ascii=False) + ";\n", "utf-8")

        os.environ.update(env)                        # server.py lee su configuración al importarse
        sys.path.insert(0, str(sitio))
        import server
        api = sitio / "demo-api" / "file"
        api.mkdir(parents=True)
        for n in data["nodes"]:
            _, obj = server.file_payload(n["href"])
            obj["url"] = "/".join(urllib.parse.quote(x) for x in n["href"].split("/"))
            obj.pop("original", None)
            (api / ("%s.json" % n["id"])).write_text(json.dumps(obj, ensure_ascii=False), "utf-8")
        (sitio / "demo-api" / "correo.json").write_text(json.dumps(correo_de_ejemplo(), ensure_ascii=False), "utf-8")
        (sitio / "js" / "demo.js").write_text(SHIM, "utf-8")
        for page in ("index.html", "brain.html"):
            p = sitio / page
            h = p.read_text("utf-8")
            p.write_text(h.replace("<head>", '<head>\n<script src="js/demo.js"></script>', 1), "utf-8")

        for fuga in (CASA_REAL, os.environ.get("USER", "") or "\0", tmp):
            if fuga and fuga in f.read_text("utf-8"):
                sys.exit("Alto: data.js trae una ruta de esta compu (%s). No se publica." % fuga)

        if salida.exists():
            if not (salida / MARCA).exists() and any(salida.iterdir()):
                sys.exit("%s ya existe y no es una demo anterior: no la borro." % salida)
            shutil.rmtree(salida)
        salida.mkdir(parents=True)
        for x in SITIO:
            src = sitio / x
            (shutil.copytree if src.is_dir() else shutil.copy2)(src, salida / x)
        video = PANEL.parent / "media" / "demo.mp4"   # el video del producto: un clic y se reproduce en el navegador
        if video.exists():
            shutil.copy2(video, salida / "video.mp4")
        (salida / ".nojekyll").write_text("", "utf-8")
        (salida / MARCA).write_text(datetime.now().isoformat(), "utf-8")
    n = sum(1 for _ in salida.rglob("*") if _.is_file())
    print("Listo: demo en %s (%d archivos)." % (salida, n))


def main():
    ap = argparse.ArgumentParser(description="Demo en línea de MOCA para GitHub Pages")
    ap.add_argument("--salida", default="_site")
    armar(Path(ap.parse_args().salida).resolve())


if __name__ == "__main__":
    main()
