/**
 * Gráficas Strava (Chart.js). Respeta el deporte activo (pestaña): solo esas sesiones.
 * Resumen (overview): catálogo + intel global + gráficas mezcladas 7d.
 */

import { filterStravaWorkoutsLastCalendarDays } from '../core/StravaCoachEngine.js';
import { buildStravaIntelligencePayload } from '../core/StravaIntelligenceEngine.js';
import { filterWorkoutsByStravaTab } from '../core/strava-workout-filters.js';
import { buildSessionChartNarratives } from '../core/strava-chart-narratives.js';

const chartRefs = {};
const CHART_WINDOW_DAYS = 7;

function destroyAll() {
  Object.keys(chartRefs).forEach((k) => {
    try {
      chartRefs[k].destroy();
    } catch (_) {}
    delete chartRefs[k];
  });
}

function darkTextColor() {
  const dark = document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? '#e2e8f0' : '#334155';
}

function setInsight(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '—';
}

function mountIntelligenceCharts(rawFiltered, color, grid) {
  const Chart = window.Chart;
  if (!Chart) return;
  const intel = buildStravaIntelligencePayload(Array.isArray(rawFiltered) ? rawFiltered : []);
  const mk = (id, cfg) => {
    const el = document.getElementById(id);
    if (!el) return;
    chartRefs[id] = new Chart(el, cfg);
  };

  setInsight(
    'strava-chart-ctl-insight',
    intel.total
      ? `CTL/ATL heurísticos sobre ${intel.sampled === intel.total ? 'todo el' : 'las últimas ' + intel.sampled + ' de ' + intel.total} sesión(es) de esta vista. TSB ≈ ${Math.round(intel.tsb)}: positivo suele sugerir margen; negativo, fatiga acumulada (orientativo).`
      : 'Sin datos para esta vista deportiva.'
  );
  setInsight(
    'strava-chart-weekly-insight',
    intel.weeklyBars && intel.weeklyBars.length
      ? 'Cada barra suma la carga heurística de 7 días calendario; compara alturas para ver si subes volumen bruto demasiado rápido (orientativo).'
      : '—'
  );

  const ctlEl = document.getElementById('strava-chart-ctl-atl');
  if (ctlEl && intel.series && intel.series.length > 2) {
    const s = intel.series;
    const labels = s.map((x) => x.day.slice(5));
    mk('strava-chart-ctl-atl', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'CTL (base)', data: s.map((x) => x.ctl), borderColor: '#22d3ee', tension: 0.2, fill: false },
          { label: 'ATL (aguda)', data: s.map((x) => x.atl), borderColor: '#fb923c', tension: 0.2, fill: false },
        ],
      },
      options: {
        animation: { duration: 480, easing: 'easeOutQuart' },
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color, boxWidth: 10 } } },
        scales: {
          x: { ticks: { color, maxTicksLimit: 8 }, grid: { color: grid } },
          y: { ticks: { color }, grid: { color: grid } },
        },
      },
    });
  }

  const wEl = document.getElementById('strava-chart-weekly-load');
  if (wEl && intel.weeklyBars && intel.weeklyBars.length) {
    mk('strava-chart-weekly-load', {
      type: 'bar',
      data: {
        labels: intel.weeklyBars.map((b) => b.label),
        datasets: [{ label: 'Carga (7 d)', data: intel.weeklyBars.map((b) => b.load), backgroundColor: '#6366f1' }],
      },
      options: {
        animation: { duration: 480, easing: 'easeOutQuart' },
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color, maxRotation: 45, minRotation: 0 }, grid: { color: grid } },
          y: { ticks: { color }, grid: { color: grid } },
        },
      },
    });
  }
}

/**
 * @param {object} opts
 * @param {{ stravaSyncedWorkouts?: object[] }} opts.todayData
 * @param {string|null|undefined} opts.sportLane — null / overview = todas; 'run','ride',…
 */
export function mountStravaCharts(opts) {
  const Chart = window.Chart;
  if (!Chart) return;
  destroyAll();
  const raw = Array.isArray(opts?.todayData?.stravaSyncedWorkouts) ? opts.todayData.stravaSyncedWorkouts : [];
  const lane = opts?.sportLane == null || opts.sportLane === 'overview' ? null : String(opts.sportLane);

  const rawFiltered = lane ? filterWorkoutsByStravaTab(raw, lane) : raw;

  const color = darkTextColor();
  const grid = color === '#e2e8f0' ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';

  if (lane == null && raw.length) {
    mountIntelligenceCharts(raw, color, grid);
  } else if (lane && rawFiltered.length) {
    mountIntelligenceCharts(rawFiltered, color, grid);
  } else {
    setInsight('strava-chart-ctl-insight', lane ? 'Sin sesiones de este deporte en el catálogo.' : 'Sin actividades importadas.');
    setInsight('strava-chart-weekly-insight', '—');
  }

  const workouts = filterStravaWorkoutsLastCalendarDays(rawFiltered, CHART_WINDOW_DAYS).sort(
    (a, b) => String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''))
  );

  const narr = buildSessionChartNarratives(workouts, lane);

  const mk = (id, cfg) => {
    const el = document.getElementById(id);
    if (!el) return;
    chartRefs[id] = new Chart(el, cfg);
  };

  const baseOpts = {
    animation: { duration: 400, easing: 'easeOutQuart' },
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color } } },
    scales: { x: { ticks: { color }, grid: { color: grid } }, y: { ticks: { color }, grid: { color: grid } } },
  };

  if (!workouts.length) {
    setInsight('strava-chart-pace-insight', narr.pace);
    setInsight('strava-chart-hr-insight', narr.hr);
    setInsight('strava-chart-dist-insight', narr.dist);
    setInsight('strava-chart-load-insight', narr.load);
    return;
  }

  const labels = workouts.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10));
  const pace = workouts.map((w) => Number(w.avgPaceMinKm) || 0);
  const hr = workouts.map((w) => Number(w.averageHr) || 0);
  const dist = workouts.map((w) => Number(w.distanceKm) || 0);

  const showPace = lane == null || lane === 'run' || lane === 'walk';
  if (showPace && pace.some((p) => p > 0)) {
    mk('strava-chart-pace', {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Ritmo (min/km)', data: pace, borderColor: '#f97316', tension: 0.25 }],
      },
      options: baseOpts,
    });
    setInsight('strava-chart-pace-insight', narr.pace);
  } else {
    setInsight(
      'strava-chart-pace-insight',
      lane === 'ride' || lane === 'swim' || lane === 'gym'
        ? 'Ritmo min/km no es la métrica principal para este deporte en esta vista; mira distancia, FC y carga.'
        : narr.pace
    );
  }

  mk('strava-chart-hr', {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'FC media', data: hr, borderColor: '#ef4444', tension: 0.25 }],
    },
    options: baseOpts,
  });
  setInsight('strava-chart-hr-insight', narr.hr);

  mk('strava-chart-distance', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Distancia (km)', data: dist, backgroundColor: '#3b82f6' }],
    },
    options: baseOpts,
  });
  setInsight('strava-chart-dist-insight', narr.dist);

  const loadEl = document.getElementById('strava-chart-load');
  if (loadEl) {
    const loadData = workouts.map((w) => {
      const min = Number(w.timeMin) || 0;
      const int = Math.max(1, Math.min(3, Number(w.intensity) || 1));
      const hrv = Number(w.averageHr) || 0;
      const hrBoost = hrv > 0 ? 1 + Math.min(0.5, (hrv - 120) / 200) : 1;
      return Math.min(100, Math.round(min * int * int * hrBoost * 0.35));
    });
    mk('strava-chart-load', {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Carga heurística (0–100)', data: loadData, backgroundColor: '#a855f7' }],
      },
      options: {
        ...baseOpts,
        scales: { ...baseOpts.scales, y: { max: 100, ticks: { color }, grid: { color: grid } } },
      },
    });
  }
  setInsight('strava-chart-load-insight', narr.load);
}

export function unmountStravaCharts() {
  destroyAll();
}
