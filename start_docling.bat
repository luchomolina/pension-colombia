@echo off
chcp 65001 >nul
echo.
echo ============================================================
echo   Servidor Docling + RapidOCR + IA — Pension Colombia v2.1
echo ============================================================
echo.

:: Verificar Python
python --version 2>nul
if errorlevel 1 (
    echo [ERROR] Python no encontrado.
    echo Instala Python 3.10+ desde https://python.org
    pause
    exit /b 1
)

:: Instalar / verificar dependencias
echo Verificando dependencias...
python -c "import docling" 2>nul
if errorlevel 1 (
    echo Instalando Docling y dependencias...
    pip install docling rapidocr flask flask-cors requests python-dotenv
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion. Ejecuta manualmente:
        echo   pip install docling rapidocr flask flask-cors requests python-dotenv
        pause
        exit /b 1
    )
) else (
    python -c "import flask, flask_cors, rapidocr, dotenv" 2>nul
    if errorlevel 1 (
        echo Instalando dependencias faltantes...
        pip install flask flask-cors rapidocr requests python-dotenv
    )
)

:: Comprobar si existe .env con clave IA
if not exist "%~dp0.env" (
    echo.
    echo [INFO] No se encontro archivo .env — el analisis con IA estara desactivado.
    echo        Copia .env.example como .env y agrega tu OPENROUTER_API_KEY para habilitarlo.
    echo        Registro gratuito: https://openrouter.ai
    echo.
) else (
    echo [OK] Archivo .env encontrado — analizando configuracion IA...
)

echo.
echo Iniciando servidor en http://localhost:5050 ...
echo Deja esta ventana abierta mientras usas index.html
echo Presiona Ctrl+C para detener.
echo.

python "%~dp0server.py"
pause
