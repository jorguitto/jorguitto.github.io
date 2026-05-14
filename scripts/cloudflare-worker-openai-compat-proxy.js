/**
 * Cloudflare Worker: reenvía /v1/chat/completions a https://g0i.ai (misma ruta) y añade CORS
 * para que FitTracker pueda llamar desde el navegador.
 *
 * Despliegue (resumen):
 * 1) https://dash.cloudflare.com → Workers & Pages → Create → pegar este handler.
 * 2) Publica en una URL tipo https://fittracker-g0i.TUUSUARIO.workers.dev
 * 3) En tu HTML (antes de fittracker-modules-boot), define:
 *    window.__FITTRACKER_OPENAI_COMPAT_BASE__ = { g0i: 'https://fittracker-g0i.TUUSUARIO.workers.dev/v1' };
 *
 * Seguridad: cualquiera que conozca la URL del Worker puede enviar tráfico a g0i con su propia clave;
 * no expongas el Worker en sitios públicos sin rate limit / token propio si te preocupa el abuso.
 */
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const u = new URL(request.url);
    const upstream = 'https://g0i.ai' + u.pathname + u.search;

    const auth = request.headers.get('Authorization') || '';
    const ct = request.headers.get('Content-Type') || 'application/json';
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();

    const upstreamRes = await fetch(upstream, {
      method: request.method,
      headers: {
        Authorization: auth,
        'Content-Type': ct,
      },
      body,
    });

    const out = new Headers();
    out.set('Access-Control-Allow-Origin', origin);
    out.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    out.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    out.set('Vary', 'Origin');
    const passCt = upstreamRes.headers.get('Content-Type');
    if (passCt) out.set('Content-Type', passCt);

    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: out });
  },
};
