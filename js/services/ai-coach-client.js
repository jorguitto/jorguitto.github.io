/**
 * Cliente multi‑proveedor para coach IA (keys proporcionadas por el usuario).
 * Llamadas directas desde el navegador: la clave viaja al proveedor (TLS).
 */

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  /** v1beta: 1.5-flash dejó de exponerse para muchas cuentas; 2.0-flash es estable en AI Studio. */
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-haiku-20241022',
};

/**
 * Google retira o renombra modelos; si el usuario guardó un id antiguo, evitamos 404.
 * @param {string} modelId
 */
function mapDeprecatedGeminiModel(modelId) {
  const s = String(modelId || '').trim().toLowerCase();
  if (!s) return '';
  if (/^gemini-1\.5-flash/.test(s)) return 'gemini-2.0-flash';
  return String(modelId || '').trim();
}

function pickModel(provider, model) {
  const p = String(provider || '').toLowerCase().trim();
  let m = String(model || '').trim();
  if (p === 'gemini' && m) m = mapDeprecatedGeminiModel(m);
  if (m) return m;
  return DEFAULT_MODELS[p] || 'gpt-4o-mini';
}

/** Quita espacios invisibles típicos al copiar/pegar claves. */
function normalizeApiKey(k) {
  return String(k || '')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim();
}

/**
 * Extrae el mensaje legible del JSON de error de Google (si viene).
 * @param {string} rawBody
 */
function extractGoogleApiMessage(rawBody) {
  try {
    const j = JSON.parse(String(rawBody || ''));
    const m = j && j.error && j.error.message;
    return m ? String(m).trim() : '';
  } catch (_) {
    return '';
  }
}

/**
 * Mensajes legibles para errores HTTP de Gemini (cuota, modelo, etc.).
 * 429 no implica solo "plan gratuito": también afecta ritmo (RPM), ráfagas y cuentas de pago si la clave/proyecto no coinciden.
 * @param {number} status
 * @param {string} rawBody
 */
function formatGeminiApiError(status, rawBody) {
  const raw = String(rawBody || '');
  const googleMsg = extractGoogleApiMessage(raw);

  if (status === 429) {
    const mentionsFreeTierMetric = /free_tier|generate_content_free_tier/i.test(raw);
    const limitZero = /limit:\s*0/i.test(raw);

    let out =
      'Gemini: demasiadas peticiones o cuota agotada temporalmente (HTTP 429). ' +
      'Con facturación activa sigue siendo posible: límites por minuto/día (RPM/RPD), ráfagas, congestión o que la clave sea de otro proyecto distinto al que tiene el plan de pago. ';

    if (mentionsFreeTierMetric || limitZero) {
      out +=
        'Google etiqueta a veces la métrica como “free_tier” aunque tú pagues: suele indicar que esta API key apunta a un proyecto sin ese producto facturado o sin cuota asignada para generativelanguage. ' +
        'Comprueba en Google AI Studio / Cloud Console que la clave sea del mismo proyecto donde activaste facturación y la API “Generative Language”. ';
    } else {
      out += 'Prueba de nuevo en 1–2 minutos; si persiste, revisa cuotas y “rate limits” del modelo en la consola del proyecto. ';
    }

    if (googleMsg) {
      out += `Detalle de Google: ${googleMsg.slice(0, 320)}${googleMsg.length > 320 ? '…' : ''} `;
    }

    out +=
      'Más info: https://ai.google.dev/gemini-api/docs/rate-limits · Uso: https://ai.dev/rate-limit . ' +
      'Mientras tanto puedes probar OpenAI o Anthropic en el mismo panel.';

    return out;
  }
  if (status === 404) {
    return `Gemini: modelo no disponible (404). Prueba dejar el modelo vacío o escribe gemini-2.0-flash. Detalle: ${raw.slice(0, 320)}`;
  }
  if (status === 403) {
    return `Gemini: permiso denegado (403). La clave no puede usar este modelo o la API no está habilitada. Detalle: ${raw.slice(0, 320)}`;
  }
  if (status === 400) {
    const invalidKey =
      /API_KEY_INVALID|API key not valid|invalid api key/i.test(raw) ||
      (googleMsg && /API key not valid|invalid api key/i.test(googleMsg));
    if (invalidKey) {
      return (
        'Gemini: la API key no es válida para este servicio (HTTP 400, API_KEY_INVALID). ' +
        'Crea una clave nueva en https://aistudio.google.com/apikey (proyecto donde tengas habilitada la API Gemini / Generative Language), ' +
        'cópiala entera sin espacios ni saltos de línea, pégala en el campo y guarda el perfil. ' +
        'Si rotaste o borraste la clave en Google, la anterior deja de funcionar al instante.'
      );
    }
    const detail = googleMsg || raw.slice(0, 240);
    return `Gemini: solicitud rechazada (400). ${detail}${detail.length >= 240 ? '…' : ''}`;
  }
  return `Gemini ${status}: ${raw.slice(0, 450)}`;
}

/**
 * Evita enviar una clave al endpoint equivocado (caso típico: clave Gemini con proveedor OpenAI).
 * @param {string} provider
 * @param {string} apiKey
 */
export function assertProviderMatchesApiKey(provider, apiKey) {
  const p = String(provider || '').toLowerCase().trim();
  const k = normalizeApiKey(apiKey);
  if (!k) return;

  const looksGoogle = /^AIza[0-9A-Za-z_-]{10,}/.test(k);
  const looksAnthropic = /^sk-ant-/.test(k);
  const looksOpenAI = /^sk-(?!ant-)[a-zA-Z0-9_-]{10,}/.test(k) || /^sk-proj-/.test(k);

  if (looksGoogle && p !== 'gemini') {
    throw new Error(
      'Esta clave es de Google (Gemini): suele empezar por "AIza…". En "Proveedor" elige **Google Gemini**, no OpenAI. ' +
        'Las claves de OpenAI empiezan por "sk-" o "sk-proj-".'
    );
  }
  if (looksAnthropic && p !== 'anthropic') {
    throw new Error(
      'Esta clave es de Anthropic (Claude). Elige **Anthropic (Claude)** como proveedor, no OpenAI ni Gemini.'
    );
  }
  if (looksOpenAI && p === 'gemini') {
    throw new Error(
      'Parece una clave de OpenAI (empieza por "sk-"). Elige **OpenAI** como proveedor, o pega una clave de Google (Gemini) que empiece por "AIza…".'
    );
  }
  if (looksOpenAI && p === 'anthropic') {
    throw new Error('Parece una clave de OpenAI. Para Claude necesitas una clave que empiece por "sk-ant-". Elige **OpenAI** o usa tu clave de Anthropic.');
  }
}

/**
 * @param {{ provider: string, apiKey: string, model?: string }} cfg
 */
export async function testAiCoachConnection(cfg) {
  const provider = String(cfg.provider || '').toLowerCase().trim();
  const apiKey = normalizeApiKey(cfg.apiKey);
  if (!apiKey) throw new Error('Falta API key.');
  assertProviderMatchesApiKey(provider, apiKey);
  const model = pickModel(provider, cfg.model);
  const msg = 'Responde exactamente la palabra OK en mayúsculas si recibes esto.';
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: msg }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${text.slice(0, 400)}`);
    return { ok: true, provider, model };
  }
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: msg }] }],
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(formatGeminiApiError(res.status, text));
    return { ok: true, provider, model };
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 32,
        messages: [{ role: 'user', content: msg }],
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
    return { ok: true, provider, model };
  }
  throw new Error(`Proveedor no soportado: ${provider}`);
}

/**
 * @param {{ provider: string, apiKey: string, model?: string, system?: string, user: string }} cfg
 */
export async function requestAiCoachCompletion(cfg) {
  const provider = String(cfg.provider || '').toLowerCase().trim();
  const apiKey = normalizeApiKey(cfg.apiKey);
  if (!apiKey) throw new Error('Falta API key.');
  assertProviderMatchesApiKey(provider, apiKey);
  const model = pickModel(provider, cfg.model);
  const system = String(cfg.system || 'Eres un entrenador personal digital conciso, en español.');
  const user = String(cfg.user || '');

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.35,
        max_tokens: 2200,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
    const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return String(text || '').trim();
  }
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.35 },
      }),
    });
    const rawBody = await res.text();
    let json = {};
    try {
      json = JSON.parse(rawBody);
    } catch (_) {}
    if (!res.ok) throw new Error(formatGeminiApiError(res.status, rawBody));
    const parts = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
    const reply = parts && parts[0] && parts[0].text;
    return String(reply || '').trim();
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2200,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
    const blocks = json.content && json.content[0] && json.content[0].text;
    return String(blocks || '').trim();
  }
  throw new Error(`Proveedor no soportado: ${provider}`);
}
