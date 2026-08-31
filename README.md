# ¿Colpensiones o AFP? · Herramienta de orientación pensional

App web que compara los regímenes pensionales colombianos (RPM y RAIS) —vejez, invalidez y sobrevivientes—, emite una recomendación personalizada y ayuda a interpretar documentos (historia laboral, CETIL, resoluciones). El cálculo corre en el navegador — sin backend, sin registro, sin guardar datos. El análisis de documentos con IA es opcional y requiere backend (ver abajo).

## Documentación

| Doc | Contenido |
|---|---|
| [Producto](docs/producto.md) | Problema, propuesta de valor, usuarios, principios |
| [Algoritmo y base teórica](docs/algoritmo.md) | Base legal, supuestos, fórmulas, limitaciones conocidas |
| [Flujo de usuario](docs/flujo.md) | Pasos del formulario, validación, pantalla de resultados |
| [Sistema de diseño](docs/diseno.md) | Colores, tipografía, componentes, principios de UX |
| [docs/index.html](docs/index.html) | Guías legales y de trámites (derechos de petición, tutela, traslado de régimen) |

## Tecnología

| Capa | Detalle |
|---|---|
| Frontend | `index.html` — HTML + CSS + JavaScript vanilla (sin frameworks) |
| Backend IA (producción) | Netlify Function (`netlify/functions/analyze.js`) → Anthropic API, vía `/api/analyze` |
| Backend de extracción (local, opcional) | `server.py` — Docling + RapidOCR para extraer texto de PDFs, con análisis IA vía OpenRouter/OpenAI |
| Hosting | Netlify (configurado en `netlify.toml`) |

El algoritmo de comparación corre íntegramente en el navegador; la documentación detallada está en [docs/algoritmo.md](docs/algoritmo.md).

## Estructura

```
pension-colombia/
├── index.html                  # App principal: UI + algoritmo (SPA)
├── netlify.toml                # Configuración de build y redirect /api/analyze
├── netlify/functions/analyze.js  # Serverless function que llama a la Anthropic API
├── test/algoritmo.test.js      # Tests del algoritmo (Node, sin dependencias)
├── docs/                       # Documentación de producto, algoritmo, diseño y guías legales
├── server.py                   # Servidor local opcional: Docling + RapidOCR + IA
├── start_docling.bat           # Lanzador Windows para server.py
├── requirements.txt            # Dependencias Python de server.py
├── .env.example                # Plantilla de variables (Netlify y server.py)
├── benchmark/                  # OCR Workbench: comparativa de motores OCR
└── legacy/                     # Versión anterior de index.html, guardada como referencia
```

## Desarrollo local

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Crear archivo de variables locales
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# Levantar servidor local con funciones
netlify dev
```

La herramienta abre en `http://localhost:8888`. Sin la variable de entorno, el análisis IA muestra un error pero el algoritmo de comparación funciona igual.

### Extracción de documentos con Docling (opcional)

Para mejorar la extracción de texto de PDFs escaneados (historia laboral, CETIL) con OCR local:

```
1. Instala Python 3.10+  →  https://python.org
2. Doble clic en start_docling.bat
3. Abre index.html en tu navegador — detecta automáticamente el servidor en localhost:5050
```

Para habilitar el análisis con IA en el servidor local (independiente de la función de Netlify):

```
1. Copia .env.example → .env
2. Agrega tu OPENROUTER_API_KEY (gratis en https://openrouter.ai)
3. Reinicia start_docling.bat
```

### Benchmark de motores OCR

```bat
cd benchmark
run_ocr_experiments.bat -e docling -a cpu
run_ocr_experiments.bat -e marker  -a cpu
```

Coloca los PDFs en `benchmark/data/input/`; los resultados en Markdown quedan en `benchmark/data/output/<motor>/`. Requiere [uv](https://astral.sh/uv).

## Despliegue en Netlify

1. Conectar el repositorio en [app.netlify.com](https://app.netlify.com)
2. En **Site settings → Environment variables**, agregar:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Netlify detecta automáticamente `netlify.toml` — no se requiere configuración adicional.

El endpoint `/api/analyze` se redirige a `/.netlify/functions/analyze` según `netlify.toml`.

## Tests

El algoritmo (proyección de semanas, escenarios Colpensiones/AFP, invalidez, sobrevivientes, puntuación, régimen de transición) tiene una suite de tests sin dependencias. El test carga el `<script>` real de `index.html` (identificando el bloque del algoritmo por su estado `const S = {`) y lo evalúa en un sandbox de Node, así que siempre corre contra el código de producción.

```bash
node --test
```

Requiere Node 18+ (usa el runner integrado `node:test`). No hay paso de build ni `package.json`.

---

> **Aviso:** Esta herramienta es orientativa. Los cálculos son aproximaciones y no reemplazan la consulta oficial con Colpensiones, la AFP, ni un asesor pensional certificado. Ver [limitaciones conocidas](docs/algoritmo.md#qué-no-tiene-en-cuenta-el-modelo).
