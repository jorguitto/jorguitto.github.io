/**
 * Strava OAuth: refresco de token antes de llamadas API.
 * Requiere client_secret (idealmente vía backend; aquí se lee de window/localStorage como el legacy).
 */

const TOKEN_URL = 'https://www.strava.com/api/v3/oauth/token';

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function getClientId() {
  const v =
    window.STRAVA_CLIENT_ID ||
    (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_id) ||
    readStorage('strava_client_id') ||
    '';
  return String(v || '').trim();
}

function getClientSecret() {
  const v =
    window.STRAVA_CLIENT_SECRET ||
    (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_secret) ||
    readStorage('strava_client_secret') ||
    '';
  return String(v || '').trim();
}

/**
 * Devuelve tokens vigentes; refresca si expires_at está próximo o pasado.
 * @param {firebase.firestore.Firestore} db
 * @param {string} uid
 */
export async function refreshStravaTokenIfNeeded(db, uid) {
  if (!db || !uid) throw new Error('refreshStravaTokenIfNeeded: falta db o uid');
  const ref = db.collection('usuarios').doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  const t = data && data.stravaTokens ? data.stravaTokens : null;
  if (!t || !t.refresh_token) return t;

  const now = Math.floor(Date.now() / 1000);
  const exp =
    t.expires_at == null
      ? 0
      : typeof t.expires_at === 'number' && Number.isFinite(t.expires_at)
        ? t.expires_at
        : typeof t.expires_at === 'object' && t.expires_at.seconds != null
          ? t.expires_at.seconds
          : Number(t.expires_at) || 0;
  if (exp > now + 300) return t;

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!/^\d+$/.test(clientId)) throw new Error('STRAVA_CLIENT_ID inválido');
  if (!clientSecret) throw new Error('Falta STRAVA_CLIENT_SECRET para refrescar el token');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Strava refresh falló (${res.status}). ${text}`);
  }
  const json = JSON.parse(text);
  const fv = window.firebase?.firestore?.FieldValue;
  const stravaTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token || t.refresh_token,
    expires_at: json.expires_at,
    expires_in: json.expires_in,
    token_type: json.token_type || 'Bearer',
    athlete: json.athlete || t.athlete || null,
    updatedAt: fv ? fv.serverTimestamp() : new Date().toISOString(),
  };
  await ref.set({ stravaTokens }, { merge: true });
  try {
    window.localStorage.setItem(
      `fittracker_strava_exp:${uid}`,
      JSON.stringify({ expires_at: stravaTokens.expires_at, at: Date.now() })
    );
  } catch (_) {}
  return stravaTokens;
}

export function connectStrava() {
  if (typeof window.startStravaConnect === 'function') window.startStravaConnect();
}

export async function fetchStravaActivities(accessToken, perPage = 30) {
  const url = new URL('https://www.strava.com/api/v3/athlete/activities');
  url.searchParams.set('per_page', String(perPage));
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Strava activities falló (${res.status}). ${text}`);
  }
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

export function normalizeStravaActivity(activity) {
  if (!activity || !activity.id) return null;
  return {
    id: activity.id,
    type: activity.sport_type || activity.type,
    date: activity.start_date_local || activity.start_date,
    distance: activity.distance,
    moving_time: activity.moving_time,
    heart_rate: activity.average_heartrate,
    calories: activity.calories,
    start_latlng: activity.start_latlng || null,
  };
}
