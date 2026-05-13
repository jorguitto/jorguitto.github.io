/**
 * Narrativa tipo entrenador por deporte (lane), usando TODO el catálogo importado del día.
 * Comparativas 7d / 28d / mes calendario / año aproximado y textos en español.
 */

import { filterWorkoutsByStravaTab } from './strava-workout-filters.js';
import { sessionLoadScore } from './StravaCoachEngine.js';

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function parseWorkoutLocalDate(w) {
  const s = String(w.startDateLocal || w.startDate || '').trim();
  if (!s) return null;
  const iso = s.length <= 10 ? `${s}T12:00:00` : s;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = startOfLocalDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function inRange(w, from, to) {
  const dt = parseWorkoutLocalDate(w);
  if (!dt) return false;
  const day = startOfLocalDay(dt);
  return day >= from && day <= to;
}

function sumKm(list) {
  return list.reduce((a, w) => a + n(w.distanceKm, 0), 0);
}

function sumMin(list) {
  return list.reduce((a, w) => a + n(w.timeMin, 0), 0);
}

function sumLoad(list) {
  return list.reduce((a, w) => a + sessionLoadScore(w), 0);
}

function filterRange(list, from, to) {
  return list.filter((w) => inRange(w, from, to));
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleString('es-ES', { month: 'short', year: 'numeric' });
}

/** @param {object[]} laneWorkouts */
function monthlyRollup(laneWorkouts) {
  const map = new Map();
  laneWorkouts.forEach((w) => {
    const d = parseWorkoutLocalDate(w);
    if (!d) return;
    const k = monthKey(d);
    if (!map.has(k)) map.set(k, { km: 0, sessions: 0, min: 0, load: 0, paceSum: 0, paceW: 0, hrSum: 0, hrN: 0 });
    const row = map.get(k);
    const km = n(w.distanceKm, 0);
    row.km += km;
    row.sessions += 1;
    row.min += n(w.timeMin, 0);
    row.load += sessionLoadScore(w);
    const pace = n(w.avgPaceMinKm, 0);
    if (pace > 0 && km > 0) {
      row.paceSum += pace * km;
      row.paceW += km;
    }
    const hr = n(w.averageHr, 0);
    if (hr > 0) {
      row.hrSum += hr;
      row.hrN += 1;
    }
  });
  const keys = [...map.keys()].sort();
  return keys.map((k) => {
    const r = map.get(k);
    return {
      key: k,
      label: monthLabel(k),
      km: r.km,
      sessions: r.sessions,
      min: r.min,
      load: r.load,
      avgPace: r.paceW > 0 ? r.paceSum / r.paceW : 0,
      avgHr: r.hrN ? r.hrSum / r.hrN : 0,
    };
  });
}

function pctChange(prev, curr) {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * @param {string} lane — run | ride | … | overview (overview devuelve vacío ligero)
 * @param {object[]} allWorkouts — stravaSyncedWorkouts completo del día
 */
export function buildLaneCoachNarrative(lane, allWorkouts) {
  const laneId = String(lane || 'overview');
  const raw = Array.isArray(allWorkouts) ? allWorkouts.filter((w) => w && w.activityId) : [];
  const list = laneId === 'overview' ? [] : filterWorkoutsByStravaTab(raw, laneId);
  const sorted = [...list].sort(
    (a, b) => String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''))
  );
  const sortedDesc = [...list].sort((a, b) =>
    String(b.startDateLocal || b.startDate || '').localeCompare(String(a.startDateLocal || a.startDate || ''))
  );

  const today = startOfLocalDay(new Date());
  const d7 = daysAgo(6);
  const d14 = daysAgo(13);
  const d28 = daysAgo(27);
  const d56 = daysAgo(55);
  const d365 = daysAgo(364);

  const w7 = filterRange(sorted, d7, today);
  const wPrev7 = filterRange(sorted, d14, daysAgo(7));
  const w28 = filterRange(sorted, d28, today);
  const wPrev28 = filterRange(sorted, d56, daysAgo(28));
  const w365 = filterRange(sorted, d365, today);

  const months = monthlyRollup(sorted);
  const lastM = months.length ? months[months.length - 1] : null;
  const prevM = months.length > 1 ? months[months.length - 2] : null;

  const keyInsights = [];
  const historicalLines = [];
  const window7Lines = [];
  const correlations = [];

  if (!list.length) {
    return {
      lane: laneId,
      summary: `No hay actividades clasificadas como “${laneId}” en el catálogo actual. Importa desde Strava o cambia de pestaña.`,
      keyInsights: ['Sin datos en esta categoría no podemos calcular tendencias ni comparativas.'],
      historicalCompare: { title: 'Histórico (catálogo del día)', lines: ['—'] },
      window7: { title: `Últimos 7 días (${laneId})`, lines: ['—'] },
      correlations: ['—'],
      statsStrip: { sessions: 0, kmCatalog: 0, spanLabel: '—' },
    };
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanLabel = `${String(first.startDateLocal || first.startDate || '').slice(0, 10)} → ${String(
    last.startDateLocal || last.startDate || ''
  ).slice(0, 10)}`;

  const km7 = sumKm(w7);
  const kmP7 = sumKm(wPrev7);
  const ses7 = w7.length;
  const sesP7 = wPrev7.length;
  const load7 = sumLoad(w7);
  const loadP7 = sumLoad(wPrev7);
  const km28 = sumKm(w28);
  const kmP28 = sumKm(wPrev28);
  const ses28 = w28.length;
  const sesP28 = wPrev28.length;

  const chKm7 = pctChange(kmP7, km7);
  const chSes7 = pctChange(sesP7, ses7);
  const chKm28 = pctChange(kmP28, km28);
  const chSes28 = pctChange(sesP28, ses28);

  window7Lines.push(
    `Últimos 7 días: ${ses7} sesión(es), ${km7.toFixed(1)} km, carga heurística sumada ≈ ${Math.round(load7)}. Semana previa: ${sesP7} sesión(es), ${kmP7.toFixed(
      1
    )} km.`
  );
  if (kmP7 > 3) {
    if (chKm7 >= 12) window7Lines.push(`El volumen en km subió ~${chKm7}% vs la semana anterior: revisa si el salto era planificado y cómo duermes.`);
    else if (chKm7 <= -15) window7Lines.push(`El volumen en km bajó ~${Math.abs(chKm7)}% vs la semana anterior: si no era descarga intencional, puede explicar sensación de “pérdida de ritmo”.`);
  }
  if (sesP7 >= 2 && chSes7 <= -40) {
    window7Lines.push(`La frecuencia cayó fuerte (${ses7} vs ${sesP7} sesiones): el rendimiento percibido a veces sigue a la frecuencia, no solo al tirón.`);
  }

  historicalLines.push(
    `Ventana 28 días: ${ses28} sesión(es) y ${km28.toFixed(1)} km. Bloque anterior (28 días): ${sesP28} sesión(es) y ${kmP28.toFixed(1)} km.`
  );
  if (kmP28 > 5) {
    if (chKm28 >= 10) historicalLines.push(`En 28 días has sumado ~${chKm28}% más km que en el bloque previo: tendencia de acumulación.`);
    else if (chKm28 <= -12) historicalLines.push(`En 28 días has sumado ~${Math.abs(chKm28)}% menos km: puede ser fase de recuperación, tiempo libre o baja adherencia.`);
  }

  if (lastM && prevM) {
    historicalLines.push(
      `${lastM.label}: ${lastM.sessions} sesión(es), ${lastM.km.toFixed(1)} km. Mes previo (${prevM.label}): ${prevM.sessions} sesión(es), ${prevM.km.toFixed(1)} km.`
    );
    const mKm = pctChange(prevM.km, lastM.km);
    if (prevM.km > 3 && Math.abs(mKm) >= 8) {
      historicalLines.push(
        mKm > 0
          ? `El último mes calendario completo en datos sumó ~${mKm}% más km que el anterior.`
          : `El último mes con datos sumó ~${Math.abs(mKm)}% menos km que el mes previo.`
      );
    }
  }

  if (laneId === 'run') {
    const runsPace = sortedDesc.filter((w) => n(w.avgPaceMinKm, 0) > 0 && n(w.distanceKm, 0) > 0.3);
    if (runsPace.length >= 6) {
      const recent = runsPace.slice(0, 4);
      const older = runsPace.slice(-4);
      const pr = recent.reduce((a, w) => a + n(w.avgPaceMinKm), 0) / recent.length;
      const po = older.reduce((a, w) => a + n(w.avgPaceMinKm), 0) / older.length;
      const hrr = recent.filter((w) => n(w.averageHr, 0) > 0);
      const hro = older.filter((w) => n(w.averageHr, 0) > 0);
      if (hrr.length >= 3 && hro.length >= 3) {
        const hrR = hrr.reduce((a, w) => a + n(w.averageHr), 0) / hrr.length;
        const hrO = hro.reduce((a, w) => a + n(w.averageHr), 0) / hro.length;
        if (pr < po * 0.98 && hrR <= hrO * 1.02) {
          correlations.push('Correlación útil: en tus últimas carreras el ritmo mejora sin subir la FC media respecto a bloques anteriores (señal típica de mejor eficiencia, orientativa).');
        } else if (pr < po * 0.98 && hrR > hrO * 1.03) {
          correlations.push('Correlación a vigilar: ritmo más rápido pero FC media más alta que en bloques anteriores; puede ser fatiga, calor o progresión mal dosificada.');
        }
      }
      if (pr > po * 1.03) {
        correlations.push('Tus ritmos medios recientes son algo más lentos que en el bloque anterior: a menudo va ligado a más Z2, fatiga o más calor.');
      }
    }
    const freq = w365.length;
    if (freq >= 8 && km28 < kmP28 * 0.85) {
      correlations.push('Patrón: volumen reciente por debajo del bloque previo; si la frecuencia también cayó, la sensación de “forma” puede tardar en recuperarse.');
    }
  }

  if (laneId === 'ride' && km28 > 20 && kmP28 > 20) {
    const elev28 = w28.reduce((a, w) => a + n(w.elevationGain, 0), 0);
    const elevP = wPrev28.reduce((a, w) => a + n(w.elevationGain, 0), 0);
    if (elev28 > elevP * 1.35 && elev28 / km28 > 10) {
      correlations.push('Más desnivel acumulado por km en las últimas 4 semanas: exige más recuperación entre días duros.');
    }
  }

  if (!correlations.length) {
    correlations.push('A medida que acumules más sesiones homogéneas en esta categoría, aparecerán correlaciones ritmo/FC/volumen más estables.');
  }

  keyInsights.push(
    `Catálogo filtrado (${laneId}): ${list.length} sesión(es) disponibles en este tracker, entre ${spanLabel}. (Las comparativas usan solo lo que está guardado aquí; no leemos automáticamente todo Strava histórico remoto.)`
  );

  if (laneId === 'run') {
    keyInsights.push(
      'Running: el motor compara ventanas 7d / 28d / meses y busca correlaciones ritmo‑FC sobre ese catálogo local (no solo la ventana global del coach).'
    );
  } else {
    keyInsights.push('Esta pestaña aísla métricas y listas al deporte seleccionado para evitar ruido de otras disciplinas.');
  }

  let summary = '';
  if (laneId === 'run') {
    summary = `Resumen running: ${list.length} carrera(s) en el catálogo disponible. `;
    if (kmP7 > 2) summary += chKm7 >= 8 ? `Esta semana llevas más volumen que la anterior (~${chKm7}% km). ` : chKm7 <= -10 ? `Esta semana llevas menos volumen (~${Math.abs(chKm7)}% km). ` : 'El volumen semanal es similar al de la semana previa. ';
    if (lastM && prevM && prevM.km > 2) {
      const mk = pctChange(prevM.km, lastM.km);
      if (Math.abs(mk) >= 10) summary += `A nivel mensual, ${lastM.label} se alejó ~${mk > 0 ? '+' : ''}${mk}% en km frente a ${prevM.label}. `;
    }
    summary += correlations[0] && correlations[0] !== 'A medida que acumules' ? correlations[0] : 'Sigue importando para afinar el modelo.';
  } else {
    summary = `Resumen ${laneId}: ${list.length} sesión(es). Comparativa 7d/28d arriba; usa las gráficas inferiores para ver la ventana corta con el mismo filtro deportivo.`;
  }

  return {
    lane: laneId,
    summary: summary.trim(),
    keyInsights: keyInsights.slice(0, 6),
    historicalCompare: { title: 'Comparativa histórica (catálogo del día)', lines: historicalLines.slice(0, 6) },
    window7: { title: 'Últimos 7 días vs semana previa', lines: window7Lines.slice(0, 5) },
    correlations: correlations.slice(0, 4),
    statsStrip: {
      sessions: list.length,
      kmCatalog: sumKm(list),
      minCatalog: sumMin(list),
      loadCatalog: sumLoad(list),
      spanLabel,
      km365: sumKm(w365),
      sessions365: w365.length,
    },
  };
}
