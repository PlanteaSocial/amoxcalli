@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Amoxcalli — La Casa de los Libros · Iniciativa Plantea (Servidor Local y Aula)
color 0B
cd /d "%~dp0"

if not exist "servidor.py" (
    echo [!] ERROR: No se puede ejecutar directamente desde dentro de un archivo ZIP.
    echo.
    echo     Extrae primero la carpeta completa y haz doble clic en iniciar_amoxcalli.bat
    echo     o en el acceso directo Iniciar Amoxcalli.
    echo.
    pause
    exit /b 1
)

set "RUN_PY="
set "RUNTIME_LABEL="

rem -------------------------------------------------------------------------
rem 1. Nivel 1: Motor Portatil 64 bits integrado en la USB (Windows 8.1/10/11 x64)
rem -------------------------------------------------------------------------
if exist "runtime\win64\python.exe" (
    "runtime\win64\python.exe" -c "import zipfile" >nul 2>&1
    if not errorlevel 1 (
        set "RUN_PY=runtime\win64\python.exe"
        set "RUNTIME_LABEL=Motor Portatil Integrado 64-bit (Python 3.12)"
    )
)

rem -------------------------------------------------------------------------
rem 2. Nivel 2: Motor Portatil 32 bits integrado en la USB (PCs de 32 bits)
rem -------------------------------------------------------------------------
if not defined RUN_PY (
    if exist "runtime\win32\python.exe" (
        "runtime\win32\python.exe" -c "import zipfile" >nul 2>&1
        if not errorlevel 1 (
            set "RUN_PY=runtime\win32\python.exe"
            set "RUNTIME_LABEL=Motor Portatil Integrado 32-bit (Python 3.12)"
        )
    )
)

rem -------------------------------------------------------------------------
rem 3. Nivel 3: Motor Portatil Legacy (Equipos antiguos con Windows 7)
rem -------------------------------------------------------------------------
if not defined RUN_PY (
    if exist "runtime\win7_32\python.exe" (
        "runtime\win7_32\python.exe" -c "import zipfile" >nul 2>&1
        if not errorlevel 1 (
            set "RUN_PY=runtime\win7_32\python.exe"
            set "RUNTIME_LABEL=Motor Portatil Compatible Windows 7 / 32-bit (Python 3.8)"
        )
    )
)

rem -------------------------------------------------------------------------
rem 4. Nivel 4: Respaldo con cualquier Python instalado en la PC
rem -------------------------------------------------------------------------
if not defined RUN_PY (
    where python >nul 2>&1
    if not errorlevel 1 (
        python -c "import zipfile" >nul 2>&1
        if not errorlevel 1 (
            set "RUN_PY=python"
            set "RUNTIME_LABEL=Python del Sistema"
        )
    )
)

if not defined RUN_PY (
    where py >nul 2>&1
    if not errorlevel 1 (
        py -c "import zipfile" >nul 2>&1
        if not errorlevel 1 (
            set "RUN_PY=py"
            set "RUNTIME_LABEL=Python Launcher del Sistema"
        )
    )
)

if not defined RUN_PY (
    echo [!] Aviso: No se pudo iniciar el motor Python. Abriendo catalogo local...
    start "" "index.html"
    pause
    exit /b 0
)

echo [*] %RUNTIME_LABEL% listo.
echo [*] Iniciando servidor de lectura Amoxcalli...
echo.
"%RUN_PY%" servidor.py %*
if errorlevel 1 (
    echo.
    echo [!] El servidor se detuvo con un aviso. Abriendo catalogo en tu navegador...
    start "" "index.html"
    pause
)
