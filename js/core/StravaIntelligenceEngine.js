/**
 * Motor Strava Intelligence: tendencias, carga aguda/crónica (heurística), insights cortos.
 * Orientativo — no es diagnóstico médico. Pensado para miles de sesiones (muestreo + agregación O(n)).
 */

import { sessionLoadScore } from './StravaCoachEngine.js';
import { strictStravaCategory } from './strava-sport-taxonomy.js';

const MAX_SESSIONS_DEEP = 900;

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseWorkoutLocalDate(w) {
  const s = String(w.startDateLocal || w.startDate || '').trim();
  if (!s) return null;
  const iso = s.length <= 10 ? `${s}T12:00:00` : s;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function localDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sortByDateAsc(workouts) {
  return [...workouts].sort(
    (a, b) => String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''))
  );
}

/** Serie diaria de carga (suma de sessionLoadScore) entre start y end inclusive. */
function dailyLoadSeries(workouts, dayCount) {
  const end = startOfLocalDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - (dayCount - 1));
  const map = new Map();
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    map.set(localDayKey(d), 0);
  }
  workouts.forEach((w) => {
    const dt = parseWorkoutLocalDate(w);
    if (!dt) return;
    const day = startOfLocalDay(dt);
    if (day < start || day > end) return;
    const key = localDayKey(day);
    if (!map.has(key)) return;
    map.set(key, (map.get(key) || 0) + sessionLoadScore(w));
  });
  const keys = [...map.keys()].sort();
  return keys.map((k) => ({ day: k, load: Math.min(200, map.get(k) || 0) }));
}

/** Carga crónica / aguda tipo CTL/ATL con constantes de tiempo (días). */
function chronicAcuteFromSeries(dailyLoads, tauC = 42, tauA = 7) {
  let ctl = 0;
  let atl = 0;
  const series = [];
  dailyLoads.forEach(({ day, load }) => {
    ctl += (load - ctl) / tauC;
    atl += (load - atl) / tauA;
    series.push({ day, ctl, atl, tsb: ctl - atl, load });
  });
  const last = series[series.length - 1] || { ctl: 0, atl: 0, tsb: 0, load: 0 };
  return { ctl: last.ctl, atl: last.atl, tsb: last.ctl - last.atl, series };
}

function sumLoads(arr) {
  return arr.reduce((a, x) => a + x.load, 0);
}

function meanStdLoads(loads) {
  if (!loads.length) return { mean: 0, std: 1 };
  const mean = loads.reduce((a, x) => a + x, 0) / loads.length;
  const v = loads.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, loads.length - 1);
  const std = Math.sqrt(v) || 1;
  return { mean, std };
}

function pctChange(prev, curr) {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * @param {object[]} workouts
 * @param {{ maxDeep?: number }} [opts]
 */
export function buildStravaIntelligencePayload(workouts, opts = {}) {
  const maxDeep = Math.min(2000, Math.max(200, Number(opts.maxDeep) || MAX_SESSIONS_DEEP));
  const raw = Array.isArray(workouts) ? workouts.filter((w) => w && w.activityId) : [];
  const total = raw.length;
  const sortedDesc = [...raw].sort((a, b) =>
    String(b.startDateLocal || b.startDate || '').localeCompare(String(a.startDateLocal || a.startDate || ''))
  );
  const sampled = sortedDesc.slice(0, maxDeep);
  const sortedAsc = sortByDateAsc(sampled);

  const daily90 = dailyLoadSeries(sampled, 90);
  const daily56 = daily90.slice(-56);
  const { ctl, atl, tsb, series } = chronicAcuteFromSeries(daily90, 42, 7);

  const last7 = daily90.slice(-7);
  const prev7 = daily90.slice(-14, -7);
  const vol7 = sumLoads(last7);
  const volPrev7 = sumLoads(prev7);
  const volWoWPct = pctChange(volPrev7, vol7);

  const last28 = daily90.slice(-28);
  const prev28 = daily90.slice(-56, -28);
  const vol28 = sumLoads(last28);
  const volPrev28 = sumLoads(prev28);
  const volMoM = pctChange(volPrev28, vol28);

  const loads7 = last7.map((x) => x.load);
  const { mean: m7, std: s7 } = meanStdLoads(loads7);
  const monotony7 = m7 > 0 ? m7 / s7 : 0;

  const activeDays7 = last7.filter((x) => x.load > 2).length;
  const idleDays = [...daily90.slice(-14)].filter((x) => x.load <= 2).length;

  /** @type {{ severity: 'positive'|'neutral'|'warn'|'risk', title: string, detail: string, tag?: string }[]} */
  const insights = [];

  if (total === 0) {
    return {
      total,
      sampled: 0,
      executiveLine: 'Importa actividades para activar el laboratorio de carga y tendencias.',
      executiveSeverity: 'neutral',
      ctl,
      atl,
      tsb,
      series: series.slice(-56),
      weeklyBars: [],
      insights: [],
      monotony7: 0,
      strain7: vol7,
      volWoWPct,
      volMoM,
      runDecoupling: null,
    };
  }

  if (atl > ctl * 1.15 && vol7 > 80) {
    insights.push({
      severity: 'risk',
      title: 'Carga aguda por encima de la crónica',
      detail:
        'Tu ATL (últimos días) supera claramente a la CTL (base). Es un patrón típico de acumulación rápida: prioriza sueño y 48–72 h más suaves antes de otra palanca dura.',
      tag: 'CTL/ATL',
    });
  } else if (atl > ctl * 1.08) {
    insights.push({
      severity: 'warn',
      title: 'Tendencia a fatiga acumulada',
      detail: 'La carga reciente gana terreno a tu base. No es “malo” si es un bloque planificado, pero vigila sueño, hambre y sensación subjetiva.',
      tag: 'Carga',
    });
  } else if (ctl > atl * 1.2 && vol7 > 40) {
    insights.push({
      severity: 'positive',
      title: 'Base sólida vs picos recientes',
      detail: 'La crónica está por encima de la aguda: buen contexto para una progresión controlada o un test corto si lo buscas.',
      tag: 'CTL/ATL',
    });
  }

  if (monotony7 > 1.8 && vol7 > 60) {
    insights.push({
      severity: 'warn',
      title: 'Semana monótona',
      detail:
        'Poca variación día a día en la carga heurística. Los entrenadores suelen alternar estímulos: mete un día muy fácil o técnico para romper monotonía.',
      tag: 'Monotonía',
    });
  }

  if (volWoWPct >= 12) {
    insights.push({
      severity: 'neutral',
      title: `Volumen de carga ~${volWoWPct}% vs semana anterior`,
      detail: 'Subida clara en la ventana de 7 días. Asegúrate de que el salto sea progresivo y no solo “más duro todo”.',
      tag: 'Tendencia',
    });
  } else if (volWoWPct <= -18 && volPrev7 > 40) {
    insights.push({
      severity: 'neutral',
      title: `Volumen ~${Math.abs(volWoWPct)}% por debajo de la semana previa`,
      detail: 'Bajada marcada: puede ser descarga, lesión o falta de tiempo. Si no es planificado, revisa adherencia y objetivos.',
      tag: 'Tendencia',
    });
  }

  if (volMoM >= 10) {
    insights.push({
      severity: 'positive',
      title: `Últimas 4 semanas: +${volMoM}% de carga vs el mes anterior`,
      detail: 'Buena señal de constancia si duermes bien y no hay dolor mecánico.',
      tag: 'Mes',
    });
  }

  if (activeDays7 <= 1 && total >= 5) {
    insights.push({
      severity: 'warn',
      title: 'Poca frecuencia esta semana',
      detail: 'Pocos días con estímulo relevante. Para muchos objetivos, la frecuencia semanal importa tanto como el tirón único.',
      tag: 'Adherencia',
    });
  }

  if (idleDays >= 10 && total >= 8) {
    insights.push({
      severity: 'neutral',
      title: 'Ventana con bastantes días sin carga',
      detail: 'Puede ser transición o baja adherencia. Si buscas rendimiento, planifica al menos 3–4 toques suaves por semana.',
      tag: 'Consistencia',
    });
  }

  const runs = sortedDesc.filter((w) => strictStravaCategory(w) === 'run' && n(w.avgPaceMinKm, 0) > 0 && n(w.averageHr, 0) > 0).slice(0, 8);
  let runDecoupling = null;
  if (runs.length >= 4) {
    const recent = runs.slice(0, 2);
    const older = runs.slice(-2);
    const paceR = recent.reduce((a, w) => a + n(w.avgPaceMinKm), 0) / recent.length;
    const paceO = older.reduce((a, w) => a + n(w.avgPaceMinKm), 0) / older.length;
    const hrR = recent.reduce((a, w) => a + n(w.averageHr), 0) / recent.length;
    const hrO = older.reduce((a, w) => a + n(w.averageHr), 0) / older.length;
    if (paceR < paceO * 0.98 && hrR > hrO * 1.03) {
      insights.push({
        severity: 'warn',
        title: 'Running: más pulso a ritmo parecido',
        detail:
          'En las últimas carreras, la FC sube algo con ritmos similares: puede ser fatiga, calor o falta de base. Valora descarga o rodajes muy suaves.',
        tag: 'Running',
      });
      runDecoupling = { status: 'warn', paceR, paceO, hrR, hrO };
    } else if (paceR < paceO * 0.97 && hrR < hrO * 0.99) {
      insights.push({
        severity: 'positive',
        title: 'Running: mejor ritmo con FC contenida',
        detail: 'Patrón típico de mejora aeróbica (orientativo). Mantén progresión prudente.',
        tag: 'Running',
      });
      runDecoupling = { status: 'ok', paceR, paceO, hrR, hrO };
    } else {
      runDecoupling = { status: 'na', paceR, paceO, hrR, hrO };
    }
  }

  const rides = sortedDesc.filter((w) => strictStravaCategory(w) === 'ride');
  if (rides.length >= 5) {
    const elev = rides.slice(0, 14).reduce((a, w) => a + n(w.elevationGain, 0), 0);
    const km = rides.slice(0, 14).reduce((a, w) => a + n(w.distanceKm, 0), 0);
    if (km > 80 && elev / km > 12) {
      insights.push({
        severity: 'neutral',
        title: 'Ciclismo: mucho desnivel por km reciente',
        detail: 'Patrón montañoso intenso: vigila recuperación entre subidas y hidratación en calor.',
        tag: 'Bici',
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      severity: 'neutral',
      title: 'Patrones estables en el muestreo',
      detail: 'No hay alertas fuertes en las heurísticas actuales. Sigue registrando para que el modelo capte tendencias.',
      tag: 'General',
    });
  }

  let executiveSeverity = 'neutral';
  if (insights.some((i) => i.severity === 'risk')) executiveSeverity = 'risk';
  else if (insights.some((i) => i.severity === 'warn')) executiveSeverity = 'warn';
  else if (insights.some((i) => i.severity === 'positive')) executiveSeverity = 'positive';

  const first = insights[0];
  const executiveLine = first
    ? `${first.title}. ${first.detail.slice(0, 120)}${first.detail.length > 120 ? '…' : ''}`
    : 'Análisis listo.';

  const weeklyBars = [];
  const today0 = startOfLocalDay(new Date());
  for (let w = 7; w >= 0; w--) {
    const weekEnd = new Date(today0);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    let load = 0;
    sampled.forEach((x) => {
      const dt = parseWorkoutLocalDate(x);
      if (!dt) return;
      const d0 = startOfLocalDay(dt);
      if (d0 >= weekStart && d0 <= weekEnd) load += sessionLoadScore(x);
    });
    weeklyBars.push({
      label: `${localDayKey(weekStart).slice(5)} → ${localDayKey(weekEnd).slice(5)}`,
      load: Math.round(load),
    });
  }

  return {
    total,
    sampled: sampled.length,
    executiveLine,
    executiveSeverity,
    ctl,
    atl,
    tsb,
    series: series.slice(-56),
    weeklyBars,
    insights: insights.slice(0, 10),
    monotony7: Math.round(monotony7 * 100) / 100,
    strain7: Math.round(vol7),
    volWoWPct,
    volMoM,
    runDecoupling,
  };
}
