/** @typedef {'day'|'week'|'month'|'year'|'max'} StravaChartGranularity */

export const STRAVA_CHART_GRANULARITY_KEY = 'fittrackerStravaChartGranularity';

const VALID = new Set(['day', 'week', 'month', 'year', 'max']);

/** @param {unknown} v */
export function normalizeStravaChartGranularity(v) {
  const s = String(v || '').toLowerCase().trim();
  return VALID.has(s) ? /** @type {StravaChartGranularity} */ (s) : 'max';
}

export function readStravaChartGranularity() {
  try {
    return normalizeStravaChartGranularity(sessionStorage.getItem(STRAVA_CHART_GRANULARITY_KEY));
  } catch (_) {
    return 'max';
  }
}

/** @param {StravaChartGranularity} mode */
export function writeStravaChartGranularity(mode) {
  try {
    sessionStorage.setItem(STRAVA_CHART_GRANULARITY_KEY, normalizeStravaChartGranularity(mode));
  } catch (_) {}
}

function parseLocalDay(iso) {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Date} d
 * @returns {string} YYYY-MM-DD (lunes de esa semana, TZ local)
 */
function mondayKeyOfDate(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dow);
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, '0');
  const day = String(copy.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {string} iso
 * @param {StravaChartGranularity} mode
 * @returns {string} clave estable para agrupar y ordenar
 */
export function aggregationSortKey(iso, mode) {
  const d = parseLocalDay(iso);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (mode === 'day') return `${y}-${m}-${day}`;
  if (mode === 'month') return `${y}-${m}`;
  if (mode === 'year') return `${y}`;
  if (mode === 'week') return mondayKeyOfDate(d);
  return `${y}-${m}-${day}`;
}

/**
 * @param {StravaChartGranularity} mode
 * @param {string} sortKey
 */
function formatChartLabel(mode, sortKey) {
  if (!sortKey) return '—';
  if (mode === 'day') {
    const d = parseLocalDay(sortKey);
    return d
      ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
      : sortKey;
  }
  if (mode === 'week') {
    const d0 = parseLocalDay(sortKey);
    if (!d0) return sortKey;
    const d1 = new Date(d0);
    d1.setDate(d1.getDate() + 6);
    const a = d0.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const b = d1.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `Sem ${a}–${b}`;
  }
  if (mode === 'month') {
    const [yy, mm] = sortKey.split('-');
    const d = new Date(Number(yy), Number(mm) - 1, 1);
    return Number.isNaN(d.getTime()) ? sortKey : d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  }
  if (mode === 'year') return sortKey;
  return sortKey;
}

/**
 * @param {object[]} list
 * @param {StravaChartGranularity} mode
 * @param {string} sortKey
 */
function mergeBucket(list, mode, sortKey) {
  const sortedList = [...list].sort((a, b) =>
    String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''))
  );
  const first = sortedList[0];
  const last = sortedList[sortedList.length - 1];
  let dist = 0;
  let tim = 0;
  let hrSum = 0;
  let hrW = 0;
  let kcal = 0;
  let elev = 0;
  for (const w of sortedList) {
    dist += Number(w.distanceKm) || 0;
    const tm = Number(w.timeMin) || 0;
    tim += tm;
    const hr = Number(w.averageHr) || 0;
    if (hr > 0 && tm > 0) {
      hrSum += hr * tm;
      hrW += tm;
    }
    kcal += Number(w.kcal) || 0;
    elev += Number(w.totalElevationGain) || Number(w.elevationGain) || 0;
  }
  const avgHr = hrW > 0 ? hrSum / hrW : 0;
  let pace = 0;
  if (dist > 0.05 && tim > 0.5) pace = tim / dist;

  const isoEnd = last.startDateLocal || last.startDate || '';
  const chartLabel = formatChartLabel(mode, sortKey);
  const count = sortedList.length;

  return {
    ...first,
    activityId: first.activityId,
    name: count > 1 ? `Agrupado (${count} sesiones)` : first.name,
    startDateLocal: isoEnd,
    distanceKm: Math.round(dist * 100) / 100,
    timeMin: Math.round(tim * 10) / 10,
    averageHr: avgHr > 0 ? Math.round(avgHr) : 0,
    avgPaceMinKm: pace > 0 ? Math.round(pace * 100) / 100 : 0,
    kcal: Math.round(kcal),
    totalElevationGain: Math.round(elev),
    _chartLabel: chartLabel,
    _bucketCount: count,
    _bucketSortKey: sortKey,
  };
}

const MAX_POINTS_RAW = 280;

/**
 * Orden ascendente por fecha; opcionalmente submuestreo uniforme en modo max.
 * @param {object[]} workouts
 * @param {StravaChartGranularity|string} mode
 */
export function aggregateWorkoutsForStravaCharts(workouts, mode) {
  const m = normalizeStravaChartGranularity(mode);
  const arr = Array.isArray(workouts) ? workouts.filter(Boolean) : [];
  const sortByDate = (a, b) =>
    String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''));

  if (m === 'max') {
    const sorted = [...arr].sort(sortByDate);
    if (sorted.length <= MAX_POINTS_RAW) return sorted;
    const step = Math.ceil(sorted.length / MAX_POINTS_RAW);
    return sorted.filter((_, i) => i % step === 0);
  }

  const map = new Map();
  for (const w of arr) {
    const key = aggregationSortKey(w.startDateLocal || w.startDate || '', m);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(w);
  }
  const keys = [...map.keys()].sort();
  return keys.map((key) => mergeBucket(map.get(key), m, key));
}

export const STRAVA_GRANULARITY_LABEL_ES = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  max: 'Máx. (sesión)',
};
