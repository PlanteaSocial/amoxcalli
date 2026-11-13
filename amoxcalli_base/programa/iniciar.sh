#!/usr/bin/env bash
# =========================================================================
# AMOXCALLI · La Casa de los Libros · Iniciativa Plantea
# Servidor Cultural Comunitario y de Aula (100% Sin Internet)
# =========================================================================
cd "$(dirname "$0")"

PYTHON_CMD=""
for cand in "python3" "python" "runtime/win64/python.exe" "runtime/win32/python.exe" "runtime/win7_32/python.exe"; do
    if command -v "$cand" >/dev/null 2>&1 || [ -f "$cand" ]; then
        if "$cand" -c "import http.server" >/dev/null 2>&1; then
            PYTHON_CMD="$cand"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "========================================================================"
    echo "  AMOXCALLI — La Casa de los Libros · Iniciativa Plantea"
    echo "  Servidor Cultural Comunitario y de Aula (100% Sin Internet)"
    echo "========================================================================"
    echo ""
    echo "[!] Python no está instalado en este equipo Linux/macOS."
    echo "    Instala python3 para activar el servidor de aula."
    echo "[*] Abriendo catálogo local en tu navegador..."
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "index.html" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "index.html" >/dev/null 2>&1 &
    else
        echo "[!] Por favor abre 'programa/index.html' en tu navegador."
    fi
    exit 0
fi

exec "$PYTHON_CMD" servidor.py "$@"
