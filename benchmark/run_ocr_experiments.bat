@echo off
chcp 65001 >nul
echo.
echo ============================================================
echo   OCR Workbench — Benchmark de motores OCR
echo   (version Windows, requiere uv: https://astral.sh/uv)
echo ============================================================
echo.

:: Uso: run_ocr_experiments.bat -e <entorno> -a <acelerador> [-i <archivo.pdf>]
::  Entornos: docling, marker, mineru, docint
::  Aceleradores: cpu, cuda

set ENVIRONMENT=
set ACCELERATOR=cpu
set INPUT_FILE=

:parse
if "%~1"=="" goto validate
if /i "%~1"=="-e" (set ENVIRONMENT=%~2& shift & shift & goto parse)
if /i "%~1"=="-a" (set ACCELERATOR=%~2& shift & shift & goto parse)
if /i "%~1"=="-i" (set INPUT_FILE=%~2& shift & shift & goto parse)
shift
goto parse

:validate
if "%ENVIRONMENT%"=="" (
    echo [ERROR] Debes indicar el entorno con -e ^<nombre^>
    echo Uso: run_ocr_experiments.bat -e docling -a cpu
    echo Entornos disponibles: docling, marker, mineru, docint
    pause
    exit /b 1
)

set ENV_DIR=%~dp0%ENVIRONMENT%_environment
if not exist "%ENV_DIR%" (
    echo [ERROR] No existe el directorio: %ENV_DIR%
    pause
    exit /b 1
)

:: Verificar uv
uv --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 'uv' no encontrado. Instala desde https://astral.sh/uv
    pause
    exit /b 1
)

echo Configurando entorno %ENVIRONMENT% con uv...
cd "%ENV_DIR%"
uv sync
if errorlevel 1 (
    echo [ERROR] Fallo uv sync. Revisa pyproject.toml del entorno.
    pause
    exit /b 1
)

echo.
echo Ejecutando benchmark con motor: %ENVIRONMENT%, acelerador: %ACCELERATOR%
echo Resultados en: ..\data\output\%ENVIRONMENT%\
echo.

if "%INPUT_FILE%"=="" (
    uv run python run_experiment.py --input-file ..\data\input\*.pdf --output-dir ..\data\output\%ENVIRONMENT% --accelerator-device %ACCELERATOR%
) else (
    uv run python run_experiment.py --input-file "%INPUT_FILE%" --output-dir ..\data\output\%ENVIRONMENT% --accelerator-device %ACCELERATOR%
)

cd "%~dp0"
echo.
echo Benchmark finalizado. Resultados en benchmark\data\output\%ENVIRONMENT%\
pause
