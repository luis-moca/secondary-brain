# MOCA Agentic OS

Panel local para tu segundo cerebro: tus archivos como una esfera 3D, con buscador, visor, calendario, pendientes, rutinas y skills de Claude, y uso de tokens. Todo corre en tu compu: nada se sube a internet.

## Arrancar (macOS)

1. Clona el repo.
2. Doble clic en `second-brain/Abrir MOCA.command` (o `python3 second-brain/server.py`).
3. Se abre `http://localhost:8765`.

La primera vez, si `Knowledge/` está vacía, se llena con 589 archivos de ejemplo (notas, Word, Excel, PDF, imágenes y páginas) para que veas todo funcionando.

Requisitos: Python 3.9 o más nuevo y `rsync` (los dos vienen en macOS). Opcional: Claude Code para correr skills desde el panel, y Node/FFmpeg en `~/.local/node/bin` para miniaturas de video.

## Meter tus archivos

```bash
python3 second-brain/semilla/generar.py --borrar
```

Quita solo los ejemplos. Luego copia tus archivos a `Knowledge/` y dale al botón de actualizar. Cada carpeta de primer nivel sale como una zona de la esfera.

¿Ya tienes tu carpeta en otro lado? Arranca con `MOCA_KNOWLEDGE=/ruta/a/tu/carpeta`. El panel solo lee tus originales: trabaja sobre una copia en `second-brain/vault/`.

## Personalizar

- `second-brain/catalogo.json`: tu nombre y rol, rutinas, conectores, citas fijas, accesos y la lista del modo mayordomo.
- `Knowledge/Proyectos/ESTADO.md`: tus pendientes en tablas (Qué | Cuándo | Quién). Las fechas tipo «17 nov» salen en el calendario. La ruta se cambia en `catalogo.json` (`pendientes_archivo`).

## Actualización diaria

```bash
python3 second-brain/actualizar_diario.py --instalar
```

Lo programa diario a las 7:00 (launchd en Mac, cron en Linux; `--hora 6:30` para otra hora, `--quitar` para apagarlo). Cada mañana:

- Recorre las fechas del ESTADO.md de ejemplo para que el demo nunca se vea vencido. Tu ESTADO.md real no se toca.
- Mueve la rutina de ejemplo si su fecha ya pasó.
- Copia lo nuevo de `Knowledge/` y reescanea: fecha de escaneo, edad de cada archivo, miniaturas, pendientes y uso de tokens de 7 días. Si el panel está abierto, se pone al día solo.

## Qué hay adentro

| Archivo | Qué hace |
|---|---|
| `server.py` | Servidor local (puertos 8765 y 8766). Copia `Knowledge/` con rsync, abre archivos y corre skills de Claude en modo solo lectura |
| `scan.py` | Lee la copia y `~/.claude`, y escribe `js/data.js` con nodos, piezas, conexiones, rutinas, skills y pendientes |
| `uso.py` | Tokens y costo por día, leídos de tus sesiones de Claude Code |
| `thumbs.py` | Miniaturas de páginas, documentos, imágenes y videos |
| `actualizar_diario.py` | La puesta al día de las 7:00 |
| `semilla/` | Los archivos de ejemplo: generador, formatos (docx, xlsx, pdf y png con pura librería estándar) y banco de textos |
| `js/`, `css/` | La interfaz: esfera en Three.js, vistas y visor |

## Privacidad

`Knowledge/`, `vault/`, `memoria/`, `thumbs/` y `js/data.js` están en `.gitignore`: si haces fork, tus datos no se suben. Si cambias eso, revisa antes de hacer push.
