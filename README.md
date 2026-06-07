# ¿Colpensiones o AFP? · Herramienta de orientación pensional

Calculadora web que compara los dos regímenes pensionales colombianos (RPM y RAIS) y emite una recomendación personalizada. Todo el cálculo corre en el navegador — sin backend, sin registro, sin guardar datos.

## Documentación

| Doc | Contenido |
|---|---|
| [Producto](docs/producto.md) | Problema, propuesta de valor, usuarios, principios |
| [Algoritmo y base teórica](docs/algoritmo.md) | Base legal, supuestos, fórmulas, limitaciones conocidas |
| [Flujo de usuario](docs/flujo.md) | Pasos del formulario, validación, pantalla de resultados |
| [Sistema de diseño](docs/diseno.md) | Colores, tipografía, componentes, principios de UX |

## Tecnología

| Capa | Detalle |
|---|---|
| Frontend | HTML + CSS + JavaScript vanilla (sin frameworks, sin dependencias) |
| Backend IA | Netlify Function (`netlify/functions/analyze.js`) → Claude Haiku via Anthropic API |
| Hosting | Netlify (configurado en `netlify.toml`) |

El algoritmo de comparación corre íntegramente en el navegador (`index.html`); la documentación detallada está en [docs/algoritmo.md](docs/algoritmo.md).

## Estructura

```
pension-colombia/
├── index.html                  # Toda la UI y lógica del algoritmo (SPA)
├── netlify.toml                # Configuración de build y redirect /api/analyze
├── netlify/
│   └── functions/
│       └── analyze.js          # Serverless function que llama a la Anthropic API
├── test/
│   └── algoritmo.test.js       # Tests del algoritmo (Node, sin dependencias)
└── docs/                       # Documentación de producto, algoritmo y diseño
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

## Despliegue en Netlify

1. Conectar el repositorio en [app.netlify.com](https://app.netlify.com)
2. En **Site settings → Environment variables**, agregar:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Netlify detecta automáticamente `netlify.toml` — no se requiere configuración adicional.

El endpoint `/api/analyze` se redirige a `/.netlify/functions/analyze` según `netlify.toml`.

## Tests

El algoritmo (proyección de semanas, escenarios Colpensiones/AFP, puntuación, régimen de transición) tiene una suite de tests sin dependencias. El test carga el `<script>` real de `index.html` y lo evalúa en un sandbox de Node, así que siempre corre contra el código de producción.

```bash
node --test
```

Requiere Node 18+ (usa el runner integrado `node:test`). No hay paso de build ni `package.json`.

---

> **Aviso:** Esta herramienta es orientativa. Los cálculos son aproximaciones y no reemplazan la consulta oficial con Colpensiones, la AFP, ni un asesor pensional certificado. Ver [limitaciones conocidas](docs/algoritmo.md#qué-no-tiene-en-cuenta-el-modelo).
