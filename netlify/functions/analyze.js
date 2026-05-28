// Función de análisis con IA (Claude Haiku).
// Acepta { prompt } (una sola pregunta) o { messages } (conversación, para
// preguntas de seguimiento). Incluye límites de tamaño y un rate limit
// best-effort por IP para acotar costo/abuso (el tool se comparte por WhatsApp).

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
