# Pension Colombia — Proyecto Unificado

Herramienta de análisis pensional para Colombia que combina:

- **App principal** (`pensioncolombia.html`) — SPA para calcular y comparar pensiones (Colpensiones vs AFP), con análisis de documentos (CETIL, historia laboral, resoluciones).
- **Servidor local** (`server.py`) — extracción mejorada de PDFs con Docling + RapidOCR, y análisis con IA.
- **Benchmark** (`benchmark/`) — OCR Workbench para comparar motores OCR en tus propios PDFs.

---

## Instalación rápida (Windows)

```
1. Instala Python 3.10+  →  https://python.org
2. Doble clic en start_docling.bat
3. Abre pensioncolombia.html en tu navegador
```

Para habilitar el análisis con IA:

```
1. Copia .env.example → .env
2. Agrega tu OPENROUTER_API_KEY (gratis en https://openrouter.ai)
3. Reinicia start_docling.bat
```

---

## Estructura

```
pension-colombia/
├── pensioncolombia.html      ← App principal (abrir en navegador)
├── server.py                 ← Servidor Flask: Docling + RapidOCR + IA
├── start_docling.bat         ← Lanzador Windows
├── .env.example              ← Plantilla de configuración
├── requirements.txt          ← Dependencias Python
└── benchmark/                ← OCR Workbench (comparativa de motores)
    ├── run_ocr_experiments.sh      ← Linux/Mac
    ├── run_ocr_experiments.bat     ← Windows
    ├── docling_environment/        ← Config Docling (RapidOCR, SuryaOCR…)
    ├── marker_environment/         ← Config Marker
    ├── mineru_environment/         ← Config MinerU
    ├── docint_environment/         ← Config Azure Document Intelligence
    └── data/
        ├── input/                  ← Coloca aquí los PDFs a comparar
        └── output/                 ← Resultados en Markdown por motor
```

---

## Servidor (`server.py`) — Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/health` | GET | Estado del servidor. `ai: true` si hay API key configurada. |
| `/extract` | POST | Extrae texto de un PDF. Campo `pdf` (multipart). Parámetro `force_ocr=1` para forzar RapidOCR. Devuelve `{ text, pages, engine }`. |
| `/analyze` | POST | Analiza el texto con IA. Body JSON `{ text, tipo }`. Devuelve `{ analysis, model }`. Requiere API key en `.env`. |

**Estrategia de extracción** (basada en OCR Workbench):
1. Extracción nativa Docling — rápida, sin OCR.
2. Si el texto está vacío o ilegible → RapidOCR con `force_full_page_ocr=True` (mejor relación calidad/velocidad para documentos tipográficos).

---

## Benchmark — Uso en Windows

```bat
cd benchmark
run_ocr_experiments.bat -e docling -a cpu
run_ocr_experiments.bat -e marker  -a cpu
```

Coloca los PDFs en `benchmark/data/input/`. Los resultados en Markdown quedan en `benchmark/data/output/<motor>/`.

Requiere [uv](https://astral.sh/uv) para gestión de entornos aislados.

---

## Créditos

- **OCR Workbench** — benchmark de motores OCR (Docling, Marker, MinerU, Azure).
- **Analizador Jurídico IA** — concepto de análisis PDF → AI → explicación (josema-2005).
- **Pension Colombia** — app de análisis pensional colombiana.
