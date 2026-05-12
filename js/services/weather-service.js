/**
 * Clima por coordenadas y momento (Open-Meteo). Solo orientación / bienestar, no diagnóstico.
 */

import { HEAT_STRESS_TEMP_C, COLD_STRESS_TEMP_C, HIGH_UV, RAIN_PRECIP_MM_H } from '../data/weatherThresholds.js';

function isoDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function pickHourlyIndex(times, targetMs) {
  if (!Array.isArray(times) || !times.length) return 0;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    const diff = Math.abs(t - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/**
 * @param {{ lat: number, lng: number, isoDateTime: string }} params
 * @returns {Promise<object>} contexto para BioEngine / mensajes
 */
export async function getActivityWeatherContext({ lat, lng, isoDateTime }) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    return {
      ok: false,
      summary: 'Sin ubicación en la actividad.',
      flags: {},
    };
  }
  const when = isoDateTime ? new Date(isoDateTime) : new Date();
  const dateStr = isoDateOnly(when);
  const now = Date.now();
  const useArchive = when.getTime() < now - 36 * 3600 * 1000;

  const base = useArchive
    ? `https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}`
    : `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}`;

  const url =
    `${base}` +
    `&start_date=${dateStr}&end_date=${dateStr}` +
    `&hourly=temperature_2m,relativehumidity_2m,precipitation,cloudcover,uv_index` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, summary: `Clima no disponible (${res.status})`, flags: {} };
  }
  const data = await res.json();
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const idx = pickHourlyIndex(times, when.getTime());
  const temp = Number(hourly.temperature_2m && hourly.temperature_2m[idx]);
  const precip = Number(hourly.precipitation && hourly.precipitation[idx]);
  const cloud = Number(hourly.cloudcover && hourly.cloudcover[idx]);
  const uv = Number(hourly.uv_index && hourly.uv_index[idx]);

  const isRainy = Number.isFinite(precip) && precip >= RAIN_PRECIP_MM_H;
  const isSunny = Number.isFinite(cloud) && cloud <= 25 && !isRainy;
  const heat = Number.isFinite(temp) && temp >= HEAT_STRESS_TEMP_C;
  const cold = Number.isFinite(temp) && temp <= COLD_STRESS_TEMP_C;
  const highUv = Number.isFinite(uv) && uv >= HIGH_UV;

  let summary = '';
  if (Number.isFinite(temp)) summary += `${Math.round(temp)}°C`;
  if (isRainy) summary += summary ? ' · lluvia' : 'Lluvia';
  else if (isSunny) summary += summary ? ' · soleado' : 'Soleado';
  else summary += summary ? ' · nubosidad variable' : 'Nubosidad variable';

  return {
    ok: true,
    tempC: Number.isFinite(temp) ? temp : null,
    precipMm: Number.isFinite(precip) ? precip : null,
    cloudPct: Number.isFinite(cloud) ? cloud : null,
    uvIndex: Number.isFinite(uv) ? uv : null,
    isRainy,
    isSunny,
    summary,
    flags: { heat, cold, highUv },
    /** Factor 0–1 para ajustes orientativos (p. ej. vitamina D estimada) */
    sunExposureScore: isSunny && !isRainy ? Math.min(1, (Number.isFinite(uv) ? uv / 10 : 0.35) + 0.25) : isRainy ? 0.05 : 0.2,
    hydrationBoost: heat ? 1.25 : isRainy ? 1.05 : 1,
    thermalFatigue: heat ? 0.35 : cold ? 0.15 : 0.05,
    electrolyteHint: heat && (isRainy || precip > 0) ? 0.4 : heat ? 0.25 : 0,
  };
}
