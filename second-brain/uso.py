#!/usr/bin/env python3
"""Mide el uso real de Claude leyendo los registros de sesiones en ~/.claude/projects.

Solo lee. Saca, sin inventar nada:
- tokens por sesión, por día y por modelo (cada respuesta se cuenta una sola vez, aunque la sesión se haya bifurcado)
- por rutina: corridas, tokens, y el costo que Claude Code mismo registró en cada corrida
- por skill: cuántas veces se usó, los tokens de los turnos donde se usó y su costo a precio de API (aproximación, se indica en el panel)
- por aplicación conectada: cuántas llamadas hizo Claude
- por día (porDia), para skills, aplicaciones y rutinas: lo mismo, separado por fecha local, para las ventanas de 7 y 30 días

Guarda un caché en .cache/uso.json para no releer registros que no cambiaron.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

PROJECTS = Path.home() / ".claude" / "projects"
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache" / "uso.json"
CACHE_VERSION = 5
WANTED = ('"type":"assistant"', '"type":"user"', '"type":"custom-title"', '"type":"cost-state"')
# nombre real de tarea (ej. update-semanal); así no cuenta el texto de ejemplo "..." que aparece dentro de una conversación
TASK_RE = re.compile(r'<scheduled-task name="([A-Za-z0-9][\w.-]*)"')
CMD_RE = re.compile(r"<command-name>/([^<\s]+)</command-name>")
BUILTIN_CMDS = {"model", "compact", "context", "clear", "help", "config", "cost", "resume", "login", "logout", "mcp",
                "fast", "effort", "output-style", "permissions", "status", "memory", "agents", "hooks", "doctor", "exit"}


# Precio de API en dólares por millón de tokens: entrada, salida, lectura de caché, escritura de caché 5 min y 1 h.
# Fuente: tabla pública de precios de Anthropic (nov 2026). Se comprobó contra el costo que Claude Code anota en cada
# sesión (cost-state): Fable 5.2, Haiku 5.5 y Opus 5 cuadran al centavo; Opus 5.5, Fable 5.1 y Sonnet 5.5 cuadran en
# las sesiones sin modos especiales. Un modelo que no esté aquí se queda sin costo: no se adivina.
PRECIOS = {
    "claude-fable-5-2": (8, 40, 0.20, 10, 16),
    "claude-mythos-5-2": (8, 40, 0.20, 10, 16),
    "claude-fable-5-1": (10, 50, 0.25, 12.5, 20),
    "claude-mythos-5-1": (10, 50, 0.25, 12.5, 20),
    "claude-opus-5-5": (4, 20, 0.20, 5, 8),
    "claude-opus-5": (5, 25, 0.50, 6.25, 10),
    "claude-sonnet-5-5": (2, 10, 0.10, 2.5, 4),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125, 0.20),
}
PRECIO_BUSQUEDA = 0.01   # cada búsqueda web: 10 dólares por mil


def tok(u):
    cc = u.get("cache_creation") if isinstance(u.get("cache_creation"), dict) else {}
    st = u.get("server_tool_use") if isinstance(u.get("server_tool_use"), dict) else {}
    return {"in": int(u.get("input_tokens") or 0), "out": int(u.get("output_tokens") or 0),
            "cr": int(u.get("cache_read_input_tokens") or 0), "cw": int(u.get("cache_creation_input_tokens") or 0),
            "cw1h": int(cc.get("ephemeral_1h_input_tokens") or 0), "ws": int(st.get("web_search_requests") or 0),
            "fast": u.get("speed") == "fast"}


def costo_msg(m):
    """Costo de una respuesta a precio de API. None si el modelo no tiene precio anotado."""
    model = m.get("model") or ""
    key = next((k for k in sorted(PRECIOS, key=len, reverse=True) if model.startswith(k)), None)
    if not key:
        return None
    p = PRECIOS[key]
    cw1h = min(m.get("cw1h", 0), m["cw"])
    usd = (m["in"] * p[0] + m["out"] * p[1] + m["cr"] * p[2] + (m["cw"] - cw1h) * p[3] + cw1h * p[4]) / 1e6
    return usd * (2 if m.get("fast") else 1) + m.get("ws", 0) * PRECIO_BUSQUEDA


def parse_file(path):
    """Devuelve los eventos crudos de un registro, sin deduplicar (eso se hace al juntar)."""
    s = {"file": path.name, "project": path.parent.name, "title": None, "cwd": None, "start": None, "end": None,
         "routine": None, "cost": None, "msgs": [], "skills": [], "tools": [], "first": None}
    turn = 0
    turn_ts = None
    try:
        fh = open(path, errors="ignore")
    except OSError:
        return s
    with fh:
        for line in fh:
            if not any(w in line for w in WANTED):
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            t = o.get("type")
            if t == "custom-title":
                s["title"] = o.get("customTitle") or s["title"]
                continue
            if t == "cost-state":
                s["cost"] = o.get("totalCostUSD")
                continue
            if t not in ("user", "assistant"):
                continue
            ts = o.get("timestamp")
            if ts:
                s["start"] = s["start"] or ts
                s["end"] = ts
            s["cwd"] = s["cwd"] or o.get("cwd")
            m = o.get("message")
            if not isinstance(m, dict):
                continue
            c = m.get("content")
            if t == "user":
                text = None
                if isinstance(c, str):
                    text = c
                elif isinstance(c, list) and not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
                    text = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
                if text is None or not text.strip():
                    continue
                turn += 1
                turn_ts = ts
                if s["first"] is None:
                    s["first"] = re.sub(r"\s+", " ", text)[:160]
                    mt = TASK_RE.search(text)
                    if mt:
                        s["routine"] = mt.group(1)
                for name in CMD_RE.findall(text):
                    if name not in BUILTIN_CMDS:
                        s["skills"].append({"id": o.get("uuid") or "%s:%d" % (path.name, turn), "skill": name, "turn": turn, "ts": ts})
                continue
            # assistant
            mid = m.get("id")
            usage = m.get("usage")
            if mid and isinstance(usage, dict):
                s["msgs"].append({"id": mid, "model": m.get("model") or "?", "ts": ts, "turn": turn, **tok(usage)})
            if isinstance(c, list):
                for b in c:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    name = b.get("name") or ""
                    if name == "Skill":
                        sk = (b.get("input") or {}).get("skill")
                        if sk:
                            s["skills"].append({"id": b.get("id"), "skill": sk, "turn": turn, "ts": ts})
                    elif name.startswith("mcp__"):
                        parts = name.split("__")
                        if len(parts) >= 3:
                            s["tools"].append({"id": b.get("id"), "server": parts[1], "ts": ts})
    return s


def load_cache():
    try:
        c = json.loads(CACHE.read_text("utf-8"))
        return c if c.get("v") == CACHE_VERSION else {"v": CACHE_VERSION, "files": {}}
    except (OSError, ValueError):
        return {"v": CACHE_VERSION, "files": {}}


def local_day(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return None


def scan_usage(now=None):
    now = now or datetime.now(timezone.utc)
    if not PROJECTS.exists():
        return {"ok": False, "motivo": "No encontré ~/.claude/projects"}
    cache = load_cache()
    files = sorted(PROJECTS.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime)
    parsed, fresh = [], {}
    for p in files:
        st = p.stat()
        key = str(p)
        sig = [st.st_size, int(st.st_mtime)]
        hit = cache["files"].get(key)
        if hit and hit.get("sig") == sig:
            data = hit["data"]
        else:
            data = parse_file(p)
        fresh[key] = {"sig": sig, "data": data}
        parsed.append(data)
    try:
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps({"v": CACHE_VERSION, "files": fresh}), "utf-8")
    except OSError:
        pass

    # se procesan en orden de inicio para que la sesión original se quede con sus mensajes y las bifurcaciones solo sumen lo nuevo
    parsed.sort(key=lambda s: s.get("start") or "")
    seen_msg, seen_skill, seen_tool = set(), set(), set()
    days, models, sessions = {}, {}, []
    routines, skills, apps = {}, {}, {}
    total = {"in": 0, "out": 0, "cr": 0, "cw": 0}
    week_ago = now.timestamp() - 7 * 86400

    def ts_epoch(ts):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except (ValueError, AttributeError):
            return 0

    for s in parsed:
        st = {"in": 0, "out": 0, "cr": 0, "cw": 0}
        turn_tokens, turn_cost = {}, {}
        for m in s["msgs"]:
            if m["id"] in seen_msg:
                continue
            seen_msg.add(m["id"])
            n = m["in"] + m["out"] + m["cr"] + m["cw"]
            for k in st:
                st[k] += m[k]
                total[k] += m[k]
            turn_tokens[m["turn"]] = turn_tokens.get(m["turn"], 0) + n
            c = costo_msg(m)
            if c is not None:
                turn_cost[m["turn"]] = turn_cost.get(m["turn"], 0.0) + c
            d = local_day(m["ts"])
            if d:
                dd = days.setdefault(d, {"t": 0, "out": 0, "m": {}})
                dd["t"] += n
                dd["out"] += m["out"]
                # tokens por modelo en ese día: así el panel saca los % del mismo periodo que la cifra grande
                dd["m"][m["model"]] = dd["m"].get(m["model"], 0) + n
            mm = models.setdefault(m["model"], {"t": 0, "out": 0, "msgs": 0})
            mm["t"] += n
            mm["out"] += m["out"]
            mm["msgs"] += 1
        stotal = sum(st.values())
        for ev in s["skills"]:
            if not ev.get("id") or ev["id"] in seen_skill:
                continue
            seen_skill.add(ev["id"])
            sk = skills.setdefault(ev["skill"], {"usos": 0, "tokens": 0, "costo": 0.0, "ultima": None, "porDia": {}, "_turns": set()})
            sk["usos"] += 1
            if ev["ts"] and (not sk["ultima"] or ev["ts"] > sk["ultima"]):
                sk["ultima"] = ev["ts"]
            d = local_day(ev["ts"]) if ev["ts"] else None
            pd = sk["porDia"].setdefault(d, [0, 0, 0.0]) if d else None   # [usos, tokens, costo]
            if pd:
                pd[0] += 1
            tk = (s["file"], ev["turn"])
            if tk not in sk["_turns"]:
                sk["_turns"].add(tk)
                t, c = turn_tokens.get(ev["turn"], 0), turn_cost.get(ev["turn"], 0.0)
                sk["tokens"] += t
                sk["costo"] += c
                if pd:
                    pd[1] += t
                    pd[2] += c
        for ev in s["tools"]:
            if not ev.get("id") or ev["id"] in seen_tool:
                continue
            seen_tool.add(ev["id"])
            a = apps.setdefault(ev["server"], {"llamadas": 0, "ultima": None, "porDia": {}})
            a["llamadas"] += 1
            d = local_day(ev["ts"]) if ev["ts"] else None
            if d:
                a["porDia"][d] = a["porDia"].get(d, 0) + 1
            if ev["ts"] and (not a["ultima"] or ev["ts"] > a["ultima"]):
                a["ultima"] = ev["ts"]
        if s["routine"]:
            r = routines.setdefault(s["routine"], {"corridas": 0, "tokens": 0, "tokens7d": 0, "costo": 0.0, "costo7d": 0.0,
                                                   "ultima": None, "ultimoCosto": None, "runs": [], "porDia": {}})
            r["corridas"] += 1
            r["tokens"] += stotal
            cost = float(s["cost"] or 0)
            r["costo"] += cost
            d = local_day(s["start"]) if s["start"] else None
            if d:
                pd = r["porDia"].setdefault(d, [0, 0, 0.0])   # [corridas, tokens, costo]
                pd[0] += 1
                pd[1] += stotal
                pd[2] += cost
            if ts_epoch(s["start"]) >= week_ago:
                r["tokens7d"] += stotal
                r["costo7d"] += cost
            if s["start"] and (not r["ultima"] or s["start"] > r["ultima"]):
                r["ultima"] = s["start"]
                r["ultimoCosto"] = s["cost"]
            r["runs"].append({"ts": s["start"], "tokens": stotal, "costo": s["cost"]})
        if stotal or s["first"]:
            sessions.append({"titulo": s["title"] or (s["first"] or "")[:60], "inicio": s["start"], "fin": s["end"],
                             "tokens": stotal, "out": st["out"], "rutina": s["routine"],
                             "carpeta": (s["cwd"] or "").replace(str(Path.home()), "~")})

    for sk in skills.values():
        sk.pop("_turns", None)
        sk["costo"] = round(sk["costo"], 4)
        for v in sk["porDia"].values():
            v[2] = round(v[2], 4)
    for r in routines.values():
        r["runs"] = sorted(r["runs"], key=lambda x: x["ts"] or "")[-12:]
        r["costo"] = round(r["costo"], 2)
        r["costo7d"] = round(r["costo7d"], 2)
        for v in r["porDia"].values():
            v[2] = round(v[2], 4)
    last_days = sorted(days)[-30:]
    sessions.sort(key=lambda x: x["tokens"], reverse=True)
    t7 = sum(v["t"] for d, v in days.items() if d >= datetime.fromtimestamp(week_ago).strftime("%Y-%m-%d"))
    return {
        "ok": True,
        "archivos": len(files),
        "total": {**total, "t": sum(total.values())},
        "tokens7d": t7,
        "dias": [{"d": d, **days[d]} for d in last_days],
        "modelos": models,
        "rutinas": routines,
        "skills": skills,
        "apps": apps,
        "sesiones": sessions[:25],
        "nSesiones": len(sessions),
        "notaCosto": "Costo de cada skill: los tokens de los turnos donde se usó, por modelo, a precio público de API (tabla PRECIOS en uso.py). Es una aproximación para comparar, no un cobro.",
        "nota": "Tokens procesados: entrada + salida + lectura y escritura de caché. El costo de cada rutina es el que Claude Code registró en esa corrida, a precio de API; con suscripción no se cobra aparte, pero sí consume tu límite.",
    }


if __name__ == "__main__":
    import time
    t0 = time.time()
    u = scan_usage()
    print("ok" if u.get("ok") else u, "· %.1fs" % (time.time() - t0))
    if u.get("ok"):
        print("registros:", u["archivos"], "· sesiones:", u["nSesiones"], "· tokens totales: %.1f M" % (u["total"]["t"] / 1e6), "· 7 días: %.1f M" % (u["tokens7d"] / 1e6))
        print("rutinas:", {k: (v["corridas"], round(v["tokens"] / 1e6, 2), v["costo"]) for k, v in u["rutinas"].items()})
        print("skills:", sorted(((k, v["usos"], round(v["tokens"] / 1e6, 2)) for k, v in u["skills"].items()), key=lambda x: -x[1])[:12])
        print("apps:", {k[:14]: v["llamadas"] for k, v in u["apps"].items()})
        print("modelos:", {k: round(v["t"] / 1e6, 1) for k, v in u["modelos"].items()})
