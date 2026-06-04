/**
 * Análisis de una sesión concreta frente al historial del mismo deporte (lane).
 */

import { sessionLoadScore } from './StravaCoachEngine.js';
import { strictStravaCategory } from './strava-sport-taxonomy.js';

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function parseTs(w) {
  const s = String(w.startDateLocal || w.startDate || '').trim();
  if (!s) return NaN;
  const iso = s.length <= 10 ? `${s}T12:00:00` : s;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function median(arr) {
  const a = [...arr].filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * @param {object} workout
 * @param {object[]} sameLaneSortedDesc — misma categoría UI, más reciente primero
 */
export function buildStravaSessionAnalysis(workout, sameLaneSortedDesc) {
  const w = workout || {};
  const list = Array.isArray(sameLaneSortedDesc) ? sameLaneSortedDesc.filter((x) => x && x.activityId) : [];
  const others = list.filter((x) => String(x.activityId) !== String(w.activityId));
  const myLoad = sessionLoadScore(w);
  const loads = others.map(sessionLoadScore).filter((x) => x > 0);
  const medLoad = median(loads);
  const cat = strictStravaCategory(w);

  const idx = list.findIndex((x) => String(x.activityId) === String(w.activityId));
  const prev = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  let daysGap = null;
  if (prev) {
    const t0 = parseTs(w);
    const t1 = parseTs(prev);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      daysGap = Math.max(0, Math.round((t0 - t1) / 86400000));
    }
  }

  const km = n(w.distanceKm, 0);
  const pace = n(w.avgPaceMinKm, 0);
  const hr = n(w.averageHr, 0);
  const peersPace = others.map((x) => n(x.avgPaceMinKm, 0)).filter((x) => x > 0);
  const peersHr = others.map((x) => n(x.averageHr, 0)).filter((x) => x > 0);
  const medPace = median(peersPace);
  const medHr = median(peersHr);

  const bullets = [];

  if (myLoad > 0 && medLoad > 0) {
    if (myLoad >= medLoad * 1.25) bullets.push('Carga heurística alta respecto a tu mediana en este deporte: sesión exigente en tu contexto reciente.');
    else if (myLoad <= medLoad * 0.75) bullets.push('Carga heurística por debajo de tu mediana: sesión más ligera que tu “normal” reciente.');
    else bullets.push('Carga heurística cercana a tu mediana: esfuerzo acorde a tu patrón habitual.');
  }

  if (cat === 'run' && pace > 0 && medPace > 0 && hr > 0 && medHr > 0) {
    if (pace < medPace * 0.97 && hr <= medHr * 1.02) {
      bullets.push('Mejor ritmo que tu mediana con FC contenida: buena señal de eficiencia aeróbica (orientativo).');
    } else if (pace < medPace * 0.97 && hr >= medHr * 1.04) {
      bullets.push('Ritmo más rápido que tu mediana pero con FC más alta: puede ser progreso, calor, cafeína o fatiga acumulada.');
    } else if (pace > medPace * 1.04) {
      bullets.push('Ritmo más conservador que tu mediana: a veces es recuperación activa o fatiga; valora sensación subjetiva.');
    }
  }

  if (n(w.intensity, 1) >= 3 || (hr > 0 && hr >= 155)) {
    bullets.push('Intensidad alta por FC o etiqueta: revisa recuperación en las 36–48 h siguientes.');
  }

  if (daysGap != null) {
    if (daysGap <= 1 && (n(w.intensity, 1) >= 2 || myLoad >= medLoad)) {
      bullets.push(`Solo ${daysGap === 0 ? 'el mismo día' : '1 día'} respecto a la sesión anterior en este deporte: cadencia ajustada si buscas absorción del estímulo.`);
    } else if (daysGap >= 4) {
      bullets.push(`Han pasado ~${daysGap} días desde tu sesión previa en este deporte: margen de recuperación amplio.`);
    }
  }

  if (km > 0 && others.length >= 5) {
    const kms = others.map((x) => n(x.distanceKm, 0)).filter((x) => x > 0);
    const longCut = median(kms) * 1.35;
    if (km >= longCut) bullets.push('Distancia por encima de tu “largo” típico reciente: hidrata y vigila la segunda mitad del día.');
  }

  if (!bullets.length) {
    bullets.push('Datos suficientes para contexto básico; sigue registrando sesiones para comparativas más finas.');
  }

  let headline = 'Análisis de sesión';
  if (myLoad > 0 && medLoad > 0 && myLoad >= medLoad * 1.25) headline = 'Sesión intensa en tu contexto';
  else if (cat === 'run' && pace > 0 && medPace > 0 && pace < medPace * 0.97 && hr > 0 && medHr > 0 && hr <= medHr * 1.02) headline = 'Buen control relativo de ritmo y FC';

  return {
    headline,
    bullets: bullets.slice(0, 5),
    meta: { cat, myLoad, medLoad, daysGap },
  };
}
