#!/usr/bin/env python3
"""Arma el banco de párrafos de ejemplo (textos_1.py, textos_2.py, textos_3.py).

Se guarda escrito en archivos para que los ejemplos salgan idénticos en cualquier compu y no dependan del azar.
Solo hace falta volver a correrlo si cambias vocabulario.py:

    python3 semilla/construir_textos.py
"""
import random
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import vocabulario as V  # noqa: E402

POR_ARCHIVO = 230
ARCHIVOS = 3
ANCHO = 92


def minuscula(s):
    return s[0].lower() + s[1:]


def oracion(r):
    s, v, o, c = r.choice(V.SUJETOS), r.choice(V.VERBOS), r.choice(V.OBJETOS), r.choice(V.COMPLEMENTOS)
    tipo = r.random()
    if tipo < 0.40:
        return "%s %s %s %s." % (s, v, o, c)
    if tipo < 0.62:
        return "%s %s %s %s %s." % (r.choice(V.CONECTORES), minuscula(s), v, o, c)
    if tipo < 0.785:
        return "Con este cambio, %s." % r.choice(V.CIFRAS)
    if tipo < 0.80:   # pocas menciones de personas: cada una es una línea en la esfera
        p = r.choice(V.PERSONAS)
        return "%s, de %s, pidió revisar %s %s." % (p, V.ROLES[p], o, c)
    return r.choice(V.CIERRES)


def parrafo(r):
    return " ".join(oracion(r) for _ in range(r.randint(3, 5)))


def renglones(texto):
    out, actual = [], ""
    for palabra in texto.split(" "):
        if actual and len(actual) + len(palabra) + 1 > ANCHO:
            out.append(actual + " ")
            actual = palabra
        else:
            actual = (actual + " " + palabra) if actual else palabra
    out.append(actual)
    return out


def escribir(n, parrafos):
    lineas = ['"""Banco de párrafos de ejemplo, parte %d de %d. Lo arma construir_textos.py."""' % (n, ARCHIVOS), "",
              "PARRAFOS = ("]
    for p in parrafos:
        partes = renglones(p.replace("\\", "\\\\").replace('"', '\\"'))
        for i, linea in enumerate(partes):
            lineas.append('    "%s"%s' % (linea, "," if i == len(partes) - 1 else ""))
    lineas += [")", ""]
    (AQUI / ("textos_%d.py" % n)).write_text("\n".join(lineas), "utf-8")


def main():
    r = random.Random(20261113)
    vistos, todos = set(), []
    while len(todos) < POR_ARCHIVO * ARCHIVOS:
        p = parrafo(r)
        if p not in vistos:
            vistos.add(p)
            todos.append(p)
    for n in range(ARCHIVOS):
        escribir(n + 1, todos[n * POR_ARCHIVO:(n + 1) * POR_ARCHIVO])
    print("Listo: %d párrafos en %d archivos." % (len(todos), ARCHIVOS))


if __name__ == "__main__":
    main()
