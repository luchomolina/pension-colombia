#!/usr/bin/env python3
"""
Servidor local Docling + RapidOCR + IA — Pension Colombia
==========================================================
Basado en:
  • OCR Workbench  → estrategia dos-pasos (nativo + RapidOCR forzado)
  • Analizador Jurídico IA → endpoint /analyze: texto → AI API → explicación

Dependencias:
    pip install docling rapidocr flask flask-cors requests python-dotenv

Variables de entorno (opcional, en .env junto a este archivo):
    OPENROUTER_API_KEY=sk-or-...    ← OpenRouter (recomendado, modelos gratuitos disponibles)
    OPENAI_API_KEY=sk-...           ← OpenAI (alternativa)
    AI_MODEL=meta-llama/llama-3.1-8b-instruct:free   ← modelo a usar

Iniciar:
    python server.py   (o usa start_docling.bat)

El servidor escucha en http://localhost:5050
"""

import os
import re
import tempfile
from pathlib import Path

# Cargar .env si existe (sin requerir python-dotenv obligatoriamente)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins="*")

# ── Config IA ─────────────────────────────────────────────────────────────────

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENAI_KEY     = os.environ.get("OPENAI_API_KEY", "")
AI_MODEL       = os.environ.get("AI_MODEL", "meta-llama/llama-3.1-8b-instruct:free")

_ai_available = bool(OPENROUTER_KEY or OPENAI_KEY)

# ── Carga diferida de Docling ─────────────────────────────────────────────────

print("Cargando Docling…")
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

_conv_native: DocumentConverter | None = None
_conv_ocr:    DocumentConverter | None = None


def _get_native() -> DocumentConverter:
    global _conv_native
    if _conv_native is None:
        _conv_native = DocumentConverter()
    return _conv_native


def _get_ocr() -> DocumentConverter:
    """Docling + RapidOCR forzado: mejor relación calidad/velocidad para
    documentos tipográficos (fuente personalizada, tablas CETIL)."""
    global _conv_ocr
    if _conv_ocr is None:
        ocr_opts = RapidOcrOptions(
            backend="onnxruntime",   # funciona en CPU/Windows sin CUDA
            force_full_page_ocr=True,
        )
        pipeline_opts = PdfPipelineOptions(
            do_ocr=True,
            do_table_structure=True,
            ocr_options=ocr_opts,
        )
        _conv_ocr = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_opts)
            }
        )
    return _conv_ocr


# ── Detección de texto ilegible ───────────────────────────────────────────────

_PALABRAS_ES = re.compile(
    r"\b(de|en|la|el|los|las|del|con|por|para|que|una|un|su|sus|se|al|es|son|fue|"
    r"ha|han|año|mes|días?|semanas?|período|entidad|nombre|fecha|total|tipo|"
    r"vinculación|certificación|colpensiones|ministerio|secretaría|gobernación|"
    r"municipio|laborales?|cotizadas?|certificadas?|resolución|pensional|"
    r"historia|reporte|afiliado|titular|cargo|inicio|retiro|acumulado|"
    r"remuneración|salario)\b",
    re.IGNORECASE,
)


def _is_garbled(text: str) -> bool:
    if not text or len(text) < 80:
        return True
    sample = text[:2000].replace("\n", " ")
    if _PALABRAS_ES.search(sample):
        return False
    tokens = [t for t in sample.split() if t]
    if len(tokens) < 20:
        return True
    single_sym = sum(
        1 for t in tokens
        if len(t) == 1 and not re.match(r"[A-Za-záéíóúñÁÉÍÓÚÑ0-9]", t)
    )
    return (single_sym / len(tokens)) > 0.30


# ── IA: llamada a OpenRouter o OpenAI ────────────────────────────────────────

_SYSTEM_PROMPT = """Eres un experto en pensiones colombianas (Ley 100 de 1993, Decreto 758/1990, \
CPACA). Recibes el texto extraído de un documento de Colpensiones y debes:

1. Identificar el tipo de documento (CETIL, Historia Laboral, Resolución de Reconocimiento, \
   Dictamen de Calificación, contrato laboral u otro).
2. Extraer y listar los datos clave relevantes para la pensión: semanas cotizadas, IBL, \
   entidades empleadoras, período certificado, porcentaje de pérdida de capacidad laboral \
   (si aplica), valor de mesada reconocida (si aplica).
3. Señalar alertas o inconsistencias importantes (períodos sin cotización, valores que no \
   cuadran, documentos incompletos).
4. Explicar en términos simples qué significa este documento para el titular y qué pasos \
   puede dar a continuación.

Responde en español, de forma clara y estructurada. Si el texto está incompleto o ilegible, \
indícalo y describe qué parte parece faltar."""


def _call_ai(text: str, tipo: str = "") -> str:
    """Llama a OpenRouter o OpenAI y devuelve la explicación generada."""
    import urllib.request
    import json as _json

    prompt_user = f"Tipo de documento sugerido: {tipo or 'desconocido'}\n\n{text[:6000]}"

    payload = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt_user},
        ],
        "max_tokens": 1200,
        "temperature": 0.3,
    }

    if OPENROUTER_KEY:
        url = "https://openrouter.ai/api/v1/chat/completions"
        api_key = OPENROUTER_KEY
        extra_headers = {
            "HTTP-Referer": "http://localhost:5050",
            "X-Title": "Pension Colombia",
        }
    else:
        url = "https://api.openai.com/v1/chat/completions"
        api_key = OPENAI_KEY
        extra_headers = {}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **extra_headers,
    }

    data = _json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(url, data=data, headers=headers, method="POST")

    with urllib.request.urlopen(req, timeout=60) as resp:
        result = _json.loads(resp.read().decode("utf-8"))

    return result["choices"][0]["message"]["content"].strip()


# ── Rutas ─────────────────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "docling-pension",
        "version": "2.1",
        "ai": _ai_available,
        "ai_model": AI_MODEL if _ai_available else None,
    })


@app.route("/extract", methods=["POST"])
def extract():
    """
    Recibe PDF (campo 'pdf').
    Parámetro opcional: force_ocr=1
    Devuelve: { ok, text, pages, engine }
    """
    if "pdf" not in request.files:
        return jsonify({"ok": False, "error": "No se recibió archivo PDF"}), 400

    file = request.files["pdf"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"ok": False, "error": "El archivo debe ser PDF"}), 400

    force_ocr = request.form.get("force_ocr", "0") == "1"

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        text, engine, pages = "", "native", None

        # Paso 1: extracción nativa
        if not force_ocr:
            try:
                result = _get_native().convert(tmp_path)
                doc    = result.document
                text   = doc.export_to_markdown().strip()
                try:
                    pages = len(list(doc.pages))
                except Exception:
                    pass
            except Exception as exc:
                print(f"[native] error: {exc}")
                text = ""

        # Paso 2: RapidOCR si ilegible
        if _is_garbled(text) or force_ocr:
            print("[server] texto nativo ilegible → activando RapidOCR…")
            try:
                result = _get_ocr().convert(tmp_path)
                doc    = result.document
                text   = doc.export_to_markdown().strip()
                engine = "rapidocr"
                try:
                    pages = len(list(doc.pages))
                except Exception:
                    pass
            except Exception as exc:
                print(f"[rapidocr] error: {exc}")
                if not text:
                    return jsonify({"ok": False, "error": str(exc)}), 500

        return jsonify({"ok": True, "text": text, "pages": pages, "engine": engine})

    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Recibe JSON: { "text": "...", "tipo": "cetil|historia|resolucion|..." }
    Llama a la IA configurada y devuelve: { ok, analysis, model }

    Inspirado en Analizador Jurídico IA (github: josema-2005).
    """
    if not _ai_available:
        return jsonify({
            "ok": False,
            "error": "Sin clave de API configurada. Agrega OPENROUTER_API_KEY al archivo .env junto a server.py."
        }), 503

    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    tipo = (body.get("tipo") or "").strip()

    if not text:
        return jsonify({"ok": False, "error": "Campo 'text' vacío"}), 400
    if len(text) < 50:
        return jsonify({"ok": False, "error": "Texto demasiado corto para analizar"}), 400

    try:
        analysis = _call_ai(text, tipo)
        return jsonify({"ok": True, "analysis": analysis, "model": AI_MODEL})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


# ── Inicio ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print()
    print("=" * 56)
    print("  Docling + RapidOCR + IA — Pension Colombia v2.1")
    print(f"  IA disponible: {'✅ ' + AI_MODEL if _ai_available else '❌  sin clave API'}")
    print("  Escuchando en: http://localhost:5050")
    print("  Ctrl+C para detener")
    print("=" * 56)
    print()
    app.run(host="127.0.0.1", port=5050, debug=False)
