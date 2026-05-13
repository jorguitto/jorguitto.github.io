/**
 * Gráficas Strava (Chart.js global). Destruye instancias previas para evitar fugas de memoria.
 * Requiere CDN: https://cdn.jsdelivr.net/npm/chart.js
 */

const chartRefs = {};

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

/**
 * @param {object} opts
 * @param {{ stravaSyncedWorkouts?: object[] }} opts.todayData
 */
export function mountStravaCharts(opts) {
  const Chart = window.Chart;
  if (!Chart) return;
  destroyAll();
  const workouts = Array.isArray(opts?.todayData?.stravaSyncedWorkouts) ? opts.todayData.stravaSyncedWorkouts : [];
  if (!workouts.length) return;

  const color = darkTextColor();
  const grid = color === '#e2e8f0' ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';

  const labels = workouts.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10)).reverse();
  const pace = workouts.map((w) => Number(w.avgPaceMinKm) || 0).reverse();
  const hr = workouts.map((w) => Number(w.averageHr) || 0).reverse();
  const dist = workouts.map((w) => Number(w.distanceKm) || 0).reverse();

  const mk = (id, cfg) => {
    const el = document.getElementById(id);
    if (!el) return;
    chartRefs[id] = new Chart(el, cfg);
  };

  mk('strava-chart-pace', {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Ritmo (min/km aprox.)', data: pace, borderColor: '#f97316', tension: 0.25 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color } } },
      scales: { x: { ticks: { color }, grid: { color: grid } }, y: { ticks: { color }, grid: { color: grid } } },
    },
  });

  mk('strava-chart-hr', {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'FC media', data: hr, borderColor: '#ef4444', tension: 0.25 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color } } },
      scales: { x: { ticks: { color }, grid: { color: grid } }, y: { ticks: { color }, grid: { color: grid } } },
    },
  });

  mk('strava-chart-distance', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Distancia (km)', data: dist, backgroundColor: '#3b82f6' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color } } },
      scales: { x: { ticks: { color }, grid: { color: grid } }, y: { ticks: { color }, grid: { color: grid } } },
    },
  });
}

export function unmountStravaCharts() {
  destroyAll();
}
