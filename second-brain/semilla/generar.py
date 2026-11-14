#!/usr/bin/env python3
"""Llena la carpeta Knowledge con 589 archivos de ejemplo para ver el panel completo desde el primer día.

Los archivos son inventados: nombres genéricos (Nota 12, Documento 105, Hoja 33) y personas solo con nombre de pila.
Imitan un Knowledge real: siete zonas, Markdown, Word, Excel, PDF, imágenes y páginas web, con menciones
entre archivos y personas para que la esfera tenga conexiones.

Uso:
    python3 semilla/generar.py              # crea los ejemplos si Knowledge está vacía
    python3 semilla/generar.py --borrar     # quita solo los ejemplos; lo tuyo no se toca
    python3 semilla/generar.py --destino /otra/carpeta
"""
import argparse
import json
import os
import random
import shutil
import sys
import time
from datetime import date, timedelta
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import formatos as F  # noqa: E402
import vocabulario as V  # noqa: E402
from textos_1 import PARRAFOS as P1  # noqa: E402
from textos_2 import PARRAFOS as P2  # noqa: E402
from textos_3 import PARRAFOS as P3  # noqa: E402

PARRAFOS = P1 + P2 + P3
PANEL = AQUI.parent
DESTINO = Path(os.environ.get("MOCA_KNOWLEDGE") or PANEL.parent / "Knowledge").expanduser()
MARCA = ".moca-ejemplos.json"   # lista de lo que se creó; empieza con punto para que el panel no la muestre
ESTADO_MARCA = "<!-- ejemplo de MOCA: actualizar_diario.py recorre estas fechas cada día -->"
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

# (carpeta, subcarpetas, cuántos archivos de cada tipo). Total: 589.
PLAN = [
    ("Proyectos", V.PROYECTOS, {"md": 39, "html": 22, "txt": 19, "png": 9, "pdf": 7, "xlsx": 6, "docx": 2}),
    ("Sesiones", ["Llamadas", "Talleres", "Capturas", "Exportaciones"],
     {"md": 66, "png": 44, "txt": 25, "json": 24, "xlsx": 21, "docx": 15, "pdf": 10, "html": 1}),
    ("Notas", ["Ideas", "Lecturas"], {"docx": 19, "pdf": 4, "png": 3}),
    ("Producto", ["Guías", "Fichas", "Soporte"], {"docx": 48, "txt": 3, "png": 3, "pdf": 1}),
    ("Mercado", ["Investigación", "Competencia", "Clientes"], {"docx": 51}),
    ("Indice", ["temas", "glosario"], {"md": 119, "txt": 3}),
    ("", [], {"pdf": 5, "md": 1, "xlsx": 1, "png": 1}),
]
NOMBRE = {"md": "Nota", "docx": "Documento", "pdf": "Documento", "txt": "Archivo", "json": "Archivo",
          "xlsx": "Hoja", "png": "Imagen", "html": "Página"}
DOCS = {"docx", "pdf", "xlsx"}   # en Proyectos van a entregables/: así salen en la bandeja del panel
# Piezas promedio por zona y tipo (secciones, párrafos, hojas o páginas), medidas en un Knowledge real de ~600
# archivos. Con esto la esfera sale igual de densa: unas 7,800 piezas alrededor de los archivos.
PIEZAS = {
    ("Proyectos", "md"): 8, ("Proyectos", "html"): 24, ("Proyectos", "txt"): 20, ("Proyectos", "pdf"): 21,
    ("Proyectos", "xlsx"): 4, ("Proyectos", "docx"): 24,
    ("Sesiones", "md"): 7, ("Sesiones", "txt"): 21, ("Sesiones", "json"): 1, ("Sesiones", "xlsx"): 4,
    ("Sesiones", "docx"): 18, ("Sesiones", "pdf"): 16, ("Sesiones", "html"): 24,
    ("Notas", "docx"): 23, ("Notas", "pdf"): 8, ("Producto", "docx"): 24, ("Producto", "txt"): 3, ("Producto", "pdf"): 24,
    ("Mercado", "docx"): 24, ("Indice", "md"): 14, ("Indice", "txt"): 2, ("", "pdf"): 15, ("", "xlsx"): 10, ("", "md"): 2,
}


def dueno():
    try:
        return json.loads((PANEL / "catalogo.json").read_text("utf-8"))["owner"]["nombre"] or "Alex"
    except (OSError, ValueError, KeyError):
        return "Alex"


def fecha_corta(d):
    return "%d %s" % (d.day, MESES[d.month - 1])


class Semilla:
    def __init__(self, destino, r):
        self.destino, self.r, self.n = destino, r, 0
        self.planes = []      # (ruta relativa, ext, título)
        self.creados = []

    # ---------- qué archivos van y cómo se llaman ----------
    def planear(self):
        sitios = set()
        for carpeta, subs, tipos in PLAN:
            for ext, cuantos in tipos.items():
                for _ in range(cuantos):
                    self.n += 1
                    sub = self.r.choice(subs) if subs else ""
                    if carpeta == "Sesiones" and ext == "md":
                        p = self.r.choice(V.PERSONAS)
                        titulo = "Sesión con %s %d" % (p, self.n)
                    elif carpeta == "Proyectos" and ext == "html" and sub not in sitios:
                        sitios.add(sub)
                        titulo = "index"
                        sub = sub + "/sitio"
                    else:
                        titulo = "%s %d" % (NOMBRE[ext], self.n)
                    if carpeta == "Proyectos" and ext in DOCS:
                        sub = sub + "/entregables"
                    if carpeta == "Sesiones" and ext == "png":
                        sub = "Capturas"
                    rel = "/".join(x for x in (carpeta, sub, "%s.%s" % (titulo, ext)) if x)
                    self.planes.append((rel, ext, titulo))
        for p in V.PERSONAS:
            self.planes.append(("Indice/personas/%s.md" % p.lower(), "md", p))
        self.planes.append(("Proyectos/ESTADO.md", "estado", "Estado de proyectos"))

    # ---------- contenido ----------
    def menciones(self, propio):
        otros = [x for x in self.planes if x[0] != propio and x[1] != "estado"]
        # Calibrado para ~2,200 conexiones en 589 archivos, como un Knowledge real: más líneas saturan la esfera
        nombres = [Path(x[0]).name for x in self.r.sample(otros, self.r.randint(1, 3))]
        texto = "Relacionado: %s." % ", ".join(nombres)
        if self.r.random() < 0.45:
            texto += " Participó %s." % self.r.choice(V.PERSONAS)
        return texto

    def piezas(self, rel, ext):
        zona = rel.split("/")[0] if "/" in rel else ""
        media = PIEZAS.get((zona, ext), 5)
        if media >= 23:
            return self.r.randint(24, 30)   # los que en un Knowledge real llegan al tope de 24
        return max(1, round(self.r.gauss(media, media * 0.35)))

    def encabezados(self, k):
        if k <= len(V.SECCIONES):
            return self.r.sample(V.SECCIONES, k)
        return [self.r.choice(V.SECCIONES) + " %d" % (i + 1) for i in range(k)]

    def secciones(self, rel, cuantas, por=(1, 3)):
        out = [(h, self.r.sample(PARRAFOS, self.r.randint(*por))) for h in self.encabezados(max(1, cuantas))]
        out[-1][1].append(self.menciones(rel))
        return out

    def titulo_legible(self, titulo):
        return titulo if titulo != "index" else "Sitio · " + self.r.choice(V.TEMAS)

    def escribir(self, rel, ext, titulo):
        r, path = self.r, self.destino / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        tema = r.choice(V.TEMAS)
        if ext == "estado":
            self.estado(path)
        elif ext == "md" and rel.startswith("Indice/personas/"):
            secc = [("Quién es", ["%s trabaja en %s. Se le busca para temas de %s." % (titulo, V.ROLES[titulo], r.choice(V.TEMAS).lower())]),
                    ("Temas en común", r.sample(PARRAFOS, 2)), ("Pendientes con %s" % titulo, [r.choice(V.TAREAS) + "."])]
            F.md(path, titulo, secc)
        elif ext in ("md", "txt", "json", "html", "docx", "pdf", "xlsx"):
            k, nombre = self.piezas(rel, ext), "%s · %s" % (titulo, tema)
            if ext == "md":        # pieza = cada encabezado, el título incluido
                F.md(path, nombre, self.secciones(rel, k - 1, (1, 2)))
            elif ext == "txt":     # pieza = cada párrafo largo
                F.txt(path, nombre, self.secciones(rel, (k + 1) // 2, (2, 2)))
            elif ext == "json":
                F.json_(path, nombre, self.secciones(rel, r.randint(2, 4)))
            elif ext == "html":
                F.html_(path, self.titulo_legible(titulo), self.secciones(rel, (k + 1) // 2, (2, 2)), sub=tema)
            elif ext == "docx":    # pieza = cada renglón corto: título, encabezados y tareas
                secc = [(h, [r.choice(V.TAREAS) + ".", r.choice(PARRAFOS)]) for h in self.encabezados(max(1, k // 2))]
                secc[-1][1].append(self.menciones(rel))
                F.docx(path, nombre, secc)
            elif ext == "pdf":     # pieza = cada página
                F.pdf(path, nombre, self.secciones(rel, k, (1, 2)))
            elif ext == "xlsx":    # pieza = cada hoja
                F.xlsx(path, [(h, self.filas(h)) for h in r.sample(V.HOJAS, min(k, len(V.HOJAS)))])
        elif ext == "png":
            a, b = r.sample(V.COLORES, 2)
            figs = [(r.randint(0, 240), r.randint(0, 150), r.randint(20, 70), r.choice(V.COLORES)) for _ in range(r.randint(2, 4))]
            F.png(path, 240, 150, a, b, figs)
        self.fechar(path)
        self.creados.append(rel)

    def filas(self, hoja):
        r = self.r
        filas = [["Semana", "Responsable", "Casos", "Meta", "Avance %"]]
        for s in range(1, r.randint(6, 14)):
            casos = r.randint(8, 120)
            meta = casos + r.randint(-15, 25)
            filas.append(["Semana %d" % s, r.choice(V.PERSONAS), casos, meta, round(100 * casos / max(meta, 1), 1)])
        return filas

    def estado(self, path):
        hoy, yo, r = date.today(), dueno(), self.r
        filas = lambda items: ["| Qué | Cuándo | Quién |", "|---|---|---|"] + ["| %s | %s | %s |" % x for x in items]
        semana = [(t, fecha_corta(hoy + timedelta(days=d)), q) for t, d, q in [
            (V.TAREAS[0], 1, yo), (V.TAREAS[1], 2, yo), ("Sesión con Diego", 2, "Diego y " + yo), (V.TAREAS[3], 3, "Sofia"),
            ("Junta de seguimiento", 4, "Equipo"), (V.TAREAS[5], 5, yo), ("Sesión con Maria", 6, "Maria")]]
        mes = [(t, fecha_corta(hoy + timedelta(days=d)), q) for t, d, q in [
            (V.TAREAS[6], 9, yo), (V.TAREAS[7], 12, "Andrea"), (V.TAREAS[8], 15, yo), ("Taller con clientes", 18, "Paula"),
            (V.TAREAS[10], 22, "Hugo"), (V.TAREAS[11], 27, yo)]]
        fijas = [("Revisar pendientes", "cada lunes", yo), ("Cerrar la semana", "cada viernes", yo)]
        out = ["# Estado de proyectos", "", "Lista de ejemplo. El panel lee las tablas de las secciones que dicen «pendiente».", "",
               "## Pendientes de esta semana", ""] + filas(semana) + ["", "## Pendientes del mes", ""] + filas(mes) + \
              ["", "## Pendientes que se repiten", ""] + filas(fijas) + \
              ["", "## Hecho", "", "- %s (%s)" % (r.choice(V.TAREAS), fecha_corta(hoy - timedelta(days=3))), "", ESTADO_MARCA, ""]
        path.write_text("\n".join(out), "utf-8")

    def fechar(self, path):
        # lo que sale en la bandeja (páginas y entregables) es reciente, como en un Knowledge que se usa; lo demás, de todo el año
        reciente = path.suffix == ".html" or "/entregables/" in path.as_posix()
        dias = int((40 if reciente else 330) * self.r.random() ** 1.8)
        t = time.time() - dias * 86400 - self.r.randint(0, 86000)
        os.utime(path, (t, t))

    def correr(self):
        self.planear()
        for rel, ext, titulo in self.planes:
            self.escribir(rel, ext, titulo)
        (self.destino / MARCA).write_text(json.dumps(sorted(self.creados), ensure_ascii=False, indent=0), "utf-8")
        return len(self.creados)


def visibles(carpeta):
    return [p for p in carpeta.iterdir() if not p.name.startswith(".")] if carpeta.exists() else []


def borrar(destino):
    marca = destino / MARCA
    if not marca.exists():
        print("No hay ejemplos que quitar en %s." % destino)
        return
    quitados = 0
    for rel in json.loads(marca.read_text("utf-8")):
        p = destino / rel
        if p.is_file():
            p.unlink()
            quitados += 1
    for d in sorted((p for p in destino.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        if not any(d.iterdir()):
            d.rmdir()
    marca.unlink()
    print("Listo: quité %d archivos de ejemplo. Lo tuyo sigue igual." % quitados)


def main():
    ap = argparse.ArgumentParser(description="Archivos de ejemplo para MOCA")
    ap.add_argument("--destino", default=str(DESTINO))
    ap.add_argument("--borrar", action="store_true", help="quita solo los archivos de ejemplo")
    ap.add_argument("--forzar", action="store_true", help="crea los ejemplos aunque la carpeta ya tenga archivos")
    a = ap.parse_args()
    destino = Path(a.destino).expanduser()
    if a.borrar:
        return borrar(destino)
    if (destino / MARCA).exists():
        print("Los ejemplos ya están en %s." % destino)
        return
    if visibles(destino) and not a.forzar:
        print("%s ya tiene tus archivos: no agrego ejemplos (usa --forzar si los quieres)." % destino)
        return
    destino.mkdir(parents=True, exist_ok=True)
    t = time.time()
    n = Semilla(destino, random.Random(589)).correr()
    print("Listo: %d archivos de ejemplo en %s (%.1f s)." % (n, destino, time.time() - t))


if __name__ == "__main__":
    main()
