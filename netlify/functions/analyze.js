// Función de análisis con IA (Claude Haiku).
// Acepta { prompt } (una sola pregunta) o { messages } (conversación, para
// preguntas de seguimiento). Incluye límites de tamaño y un rate limit
// best-effort por IP para acotar costo/abuso (el tool se comparte por WhatsApp).

// System prompt: reglas del algoritmo para que la IA pueda responder "¿por qué?"
// con precisión, sin re-derivar los cálculos desde cero.
const SYSTEM = `Eres un asesor experto en el sistema pensional colombiano. \
Tienes acceso al resultado detallado del algoritmo de esta herramienta y puedes \
explicar cualquier número con precisión. Cuando el usuario pregunte "¿por qué?" \
usa las siguientes reglas para trazar el cálculo exacto:

COLPENSIONES — cálculo de mesada (Ley 100 arts. 21 y 34):
• IBL = promedio salarial de los 10 años anteriores al retiro.
  Si el usuario para de cotizar con brecha ≥2 años antes de pensionarse:
  IBL_adj = efSal × (10 − brecha_años) / 10.
• Tasa base = 65.5% − 0.5% × IBL (IBL en SMMLV), acotada entre 55% y 65%.
  Bonus = 1.5 pts por cada 50 semanas sobre 1.300; techo global 80%.
• Mesada = IBL × tasa, mínimo 1 SMMLV.
• Semanas mínimas: 1.300 base (−25 mujeres con ≥3 hijos, −50 adicionales con ≥4).

AFP — cálculo de mesada (Ley 100 art. 64):
• Capital = saldo inicial compuesto + aportes mensuales (11.5% × efSal × densidad)
  al 3% real anual + brecha sin aportes hasta edad legal.
  Rango: 1.5% pesimista, 4.5% optimista.
• Mesada = capital ÷ meses_vida_esperada (80 años hombres / 85 mujeres).
• Garantía mínima estatal activa si ≥1.150 semanas y capital < 1 SMMLV.

TRAYECTORIA — los factores que escala el salario declarado:
• A pleno: densidad 0.92, factor IBC 1.00.
• Moderando: densidad 0.65, factor IBC 0.70.
• Bajando: densidad 0.35, factor IBC 0.35.
• efSal = salario_declarado × factor_IBC (base de aportes e IBL proyectado).

RECOMENDACIÓN — puntaje ponderado sobre 5 dimensiones:
• Dimensiones: probabilidad_pensión, mesada, estabilidad, herencia, riesgo.
• Pesos base: pensión 28%, mesada 22%, estabilidad 20%, herencia 10%, riesgo 20%.
• Ajustes por prioridades: "maximizar mesada" +15% mesada; "retirar pronto" +20% pensión −10% mesada; \
"heredar" +20% herencia −10% mesada; "menor riesgo" +15% riesgo +10% estab −15% mesada; \
"garantía estado" +15% estab +5% riesgo −10% mesada.
• Confianza: alta si diferencia de scores >0.15, media 0.07–0.15, baja <0.07.

RÉGIMEN DE TRANSICIÓN (Ley 2381 art. 75) — REGLA ESTRICTA:
• Califica SOLO si al 1-jul-2025 tenía ≥900 semanas (hombre) o ≥750 semanas (mujer).
• Si el prompt dice "Régimen de transición: No", NO menciones la posibilidad de transición \
  en ninguna sección. Decir "podrías optar por régimen de transición" cuando no califica es incorrecto.
• Si el prompt dice "Régimen de transición: Sí", explica el beneficio (reglas Ley 100, \
  sin cotización forzada en Colpensiones).

PENSIÓN ANTICIPADA — cuando AFP gana y el usuario quiere retirarse pronto:
• Si el prompt incluye "Pensión anticipada posible: X años con Y SMMLV" y la prioridad \
  del usuario es retirarse pronto, destaca esa opción como la recomendación concreta, \
  no solo la pensión regular a los 62/57 años.

Ley 2381/2024 está SUSPENDIDA (Auto 841/2025 de la Corte Constitucional). \
Hoy rige la Ley 100. Menciona la reforma solo en condicional, y SOLO si aplica al perfil.`;

const WINDOW_MS = 60_000;      // ventana de 1 minuto
const MAX_HITS = 8;            // máx. peticiones por IP por ventana
const MAX_PROMPT = 8_000;      // caracteres
const MAX_MESSAGES = 12;       // turnos de conversación
const MAX_TOTAL = 20_000;      // caracteres sumados de la conversación

// Estado en memoria: persiste en instancias "tibias" de la función.
// No es global entre instancias, pero frena bucles/abuso ingenuo sin dependencias.
const HITS = new Map();

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const recientes = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recientes.push(now);
  HITS.set(ip, recientes);
  if (HITS.size > 5000) HITS.clear(); // limpieza oportunista
  return recientes.length > MAX_HITS;
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY no configurada en las variables de entorno de Netlify.' });

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || '';
  if (rateLimited(ip)) return json(429, { error: 'Demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.' });

  let body;
  try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Body inválido' }); }

  // Construir y validar los mensajes
  let messages;
  if (Array.isArray(body.messages)) {
    messages = body.messages;
    if (messages.length === 0 || messages.length > MAX_MESSAGES) return json(400, { error: 'Conversación inválida' });
    let total = 0;
    for (const m of messages) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return json(400, { error: 'Mensaje inválido' });
      total += m.content.length;
    }
    if (total > MAX_TOTAL) return json(413, { error: 'Conversación demasiado larga' });
  } else if (typeof body.prompt === 'string') {
    if (body.prompt.length > MAX_PROMPT) return json(413, { error: 'Prompt demasiado largo' });
    messages = [{ role: 'user', content: body.prompt }];
  } else {
    return json(400, { error: 'Falta prompt o messages' });
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: SYSTEM,
      messages
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    return json(resp.status, { error: err });
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text ?? '';
  return json(200, { text });
};
