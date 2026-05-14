/**
 * Taxonomía Strava centralizada. Primero tipos API oficiales; luego heurística de texto.
 * @see https://developers.strava.com/docs/reference/#api-models-ActivityType
 */

function normText(w) {
  return `${w?.sportType || ''} ${w?.typeLabel || ''} ${w?.name || ''}`.toLowerCase();
}

function canonType(t) {
  return String(t || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** @typedef {'run'|'ride'|'walk'|'gym'|'swim'|'other'} StravaUiCategory */

const API_RUN = new Set(['run', 'trailrun', 'virtualrun']);
const API_WALK = new Set(['walk', 'hike']);
const API_RIDE = new Set([
  'ride',
  'virtualride',
  'ebikeride',
  'emountainbikeride',
  'gravelride',
  'mountainbikeride',
  'bmx',
  'handcycle',
  'velomobile',
]);
const API_SWIM = new Set(['swim']);
const API_GYM = new Set([
  'workout',
  'weighttraining',
  'crossfit',
  'elliptical',
  'stairstepper',
  'rockclimbing',
  'yoga',
  'pilates',
  'soccer',
  'football',
  'rugby',
  'basketball',
  'volleyball',
  'baseball',
  'skateboard',
  'surfing',
  'snowboard',
  'alpineski',
  'backcountryski',
  'nordicski',
  'snowshoe',
  'iceskate',
  'inlineskate',
  'golf',
  'rowing',
  'kayaking',
  'standuppaddling',
  'wheelchair',
]);

const UI_KIND_SET = new Set(['run', 'ride', 'walk', 'gym', 'swim', 'other']);

/**
 * Categoría solo a partir de sport_type / type de Strava (sin nombre de actividad).
 * @returns {StravaUiCategory|null}
 */
export function stravaCategoryFromApiTypes(w) {
  const a = canonType(w?.sportType);
  const b = canonType(w?.typeLabel);
  for (const t of [a, b]) {
    if (!t) continue;
    if (API_SWIM.has(t)) return 'swim';
    if (API_RIDE.has(t)) return 'ride';
    if (API_RUN.has(t)) return 'run';
    if (API_WALK.has(t)) return 'walk';
    if (API_GYM.has(t)) return 'gym';
  }
  return null;
}

function categoryFromHeuristic(w) {
  const s = normText(w);

  if (/football|fútbol|futbol|rugby|basket|baloncesto|volley|vóley|padel|tennis|hockey|baseball|softball|lacrosse|pickleball|handball|soccer/.test(s)) {
    return 'gym';
  }
  if (/swim|nataci|aquathlon|waterpolo/.test(s)) return 'swim';

  if (
    /\b(virtual)?ride\b|ebikeride|emountain|gravel|mountain\s*bike|cyclocross|velotaxi|handcycle|bmx|unicycle|\bcicl|rodillo|zwift|trainer.*bike|mtb\b|\bbici\b/.test(
      s
    )
  ) {
    return 'ride';
  }

  if (/\b(trailrun|virtualrun|treadmill|track)\b|\brun\b|parkrun|correr|interval.*run|tempo.*run|fartlek/.test(s)) {
    return 'run';
  }

  if (/\bwalk|walking|hike|hiking|nordic|snowshoe|senderismo|marcha|trekking|race\s*walk/.test(s)) {
    return 'walk';
  }

  if (
    /workout|weight|crossfit|yoga|pilates|strength|gym|hiit|elliptical|stair|stepper|rowing|kayak|ski|snowboard|surf|skate|climb|escalad|core|mobility|stretch|sauna|elíptic|eliptic/.test(
      s
    ) &&
    !/\brun\b|ride|swim/.test(s)
  ) {
    return 'gym';
  }

  return 'other';
}

/**
 * @param {object} w
 * @returns {StravaUiCategory}
 */
export function strictStravaCategory(w) {
  const apiPrimary = canonType(w?.sportType);
  const ukEarly = canonType(w?.uiKind);
  if (apiPrimary === 'workout' && ukEarly && UI_KIND_SET.has(ukEarly) && ukEarly !== 'gym') {
    return /** @type {StravaUiCategory} */ (ukEarly);
  }
  const fromApi = stravaCategoryFromApiTypes(w);
  if (fromApi) return fromApi;
  const uk = canonType(w?.uiKind);
  if (uk && UI_KIND_SET.has(uk)) return /** @type {StravaUiCategory} */ (uk);
  return categoryFromHeuristic(w);
}

/**
 * @param {object[]} workouts
 * @returns {Record<StravaUiCategory, object[]>}
 */
export function bucketStravaWorkoutsByCategory(workouts) {
  const list = Array.isArray(workouts) ? workouts : [];
  const out = { run: [], ride: [], walk: [], gym: [], swim: [], other: [] };
  list.forEach((w) => {
    if (!w || !w.activityId) return;
    const k = strictStravaCategory(w);
    out[k].push(w);
  });
  return out;
}

export function isRunActivity(w) {
  return strictStravaCategory(w) === 'run';
}

export function isRideActivity(w) {
  return strictStravaCategory(w) === 'ride';
}
