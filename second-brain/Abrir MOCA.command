#!/bin/bash
# Doble clic para abrir MOCA Agentic OS en tu navegador.
# 1. Abre el panel al instante con los datos que ya tiene.
# 2. Por detrás trae lo nuevo de tu carpeta Knowledge (junto a second-brain, o la de MOCA_KNOWLEDGE) y reescanea.
#    Si Knowledge está vacía, la primera vez la llena con archivos de ejemplo (semilla/generar.py --borrar los quita).
#    Cuando termina, la página se pone al día sola. Tu Knowledge original solo se lee.
# Para apagarlo: cierra esta ventana de Terminal.
cd "$(dirname "$0")" || exit 1
PORT=8765
URL="http://localhost:$PORT/"
export PATH="$HOME/.local/node/bin:$PATH"

actualizar() {
  echo "Actualizando tu Knowledge por detrás…"
  curl -s --max-time 900 -X POST -H "Content-Type: application/json" -H "X-MOCA: 1" \
       -H "Origin: http://localhost:$PORT" -H "Sec-Fetch-Site: same-origin" -d "{}" "${URL}api/rescan" \
  | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except ValueError:
    print("No pude actualizar: se quedan los datos anteriores."); sys.exit()
if d.get("ok"):
    print("Listo en %s s. %s" % (d.get("seconds"), (d.get("log") or [""])[0]))
else:
    print(d.get("error") or "La actualización falló: se quedan los datos anteriores.")'
}

# Si el panel ya está corriendo, solo abre la página y actualiza por detrás.
OLD=$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -1)
if [ -n "$OLD" ]; then
  if ps -p "$OLD" -o command= | grep -q "server.py"; then
    open "$URL"
    echo "MOCA ya estaba corriendo. Abierto en el navegador."
    actualizar
    exit 0
  fi
  echo "El puerto $PORT lo está usando otro programa. Ciérralo y vuelve a abrir."
  exit 1
fi

# Primera vez, sin datos: hay que prepararlos antes de abrir.
if [ ! -f js/data.js ]; then
  python3 semilla/generar.py   # solo agrega ejemplos si tu carpeta Knowledge está vacía
  echo "Primera vez: copiando tu Knowledge y preparando los datos (puede tardar unos minutos)…"
  python3 server.py --copiar   # la misma copia y el mismo candado que el panel: una carpeta vacía no vacía la copia
  python3 scan.py || echo "El escaneo falló."
fi

python3 server.py &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 60); do curl -s --max-time 1 "${URL}api/health" | grep -q '"ok": true' && break; sleep 0.25; done
open "$URL"
echo "MOCA abierto en el navegador."
actualizar
echo "Para apagar MOCA, cierra esta ventana."
wait $SRV
