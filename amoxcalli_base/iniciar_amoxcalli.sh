#!/usr/bin/env bash
# =========================================================================
# AMOXCALLI · La Casa de los Libros · Iniciativa Plantea
# Lanzador Universal para Linux y macOS (100% Sin Internet · Cero Instalación)
# =========================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/programa" || exit 1
exec ./iniciar.sh "$@"
