/**
 * Gráficas Strava (Chart.js). Agrupa por running, ciclismo y otras actividades.
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

function inferUiKind(w) {
  if (w && w.uiKind) return w.uiKind;
  const t = `${w && w.sportType} ${w && w.typeLabel} ${w && w.name}`.toLowerCase();
  if (t.includes('ride') || t.includes('ciclismo')) return 'ride';
  if (t.includes('run') || t.includes('running')) return 'run';
  if (t.includes('swim') || t.includes('natación')) return 'swim';
  if (t.includes('walk') || t.includes('hike') || t.includes('camin')) return 'walk';
  if (t.includes('workout') || t.includes('weight') || t.includes('yoga') || t.includes('entrenamiento')) return 'gym';
  return 'other';
}

function bikeAvgKmh(w) {
  const km = Number(w.distanceKm) || 0;
  const min = Number(w.timeMin) || 0;
  if (km <= 0.02 || min <= 0) return 0;
  return Math.round((km / (min / 60)) * 10) / 10;
}

/**
 * @param {object} opts
 * @param {{ stravaSyncedWorkouts?: object[] }} opts.todayData
 */
export function mountStravaCharts(opts) {
  const Chart = window.Chart;
  const host = document.getElementById('strava-charts-root');
  destroyAll();
  if (host) host.innerHTML = '';

  const workouts = Array.isArray(opts?.todayData?.stravaSyncedWorkouts) ? opts.todayData.stravaSyncedWorkouts : [];
  if (!workouts.length || !Chart) return;

  const color = darkTextColor();
  const grid = color === '#e2e8f0' ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)';
  const scales = {
    responsive: true,
    plugins: { legend: { labels: { color } } },
    scales: { x: { ticks: { color }, grid: { color: grid } }, y: { ticks: { color }, grid: { color: grid } } },
  };

  const mk = (id, cfg) => {
    const el = document.getElementById(id);
    if (!el) return;
    chartRefs[id] = new Chart(el, cfg);
  };

  const groups = { run: [], ride: [], swim: [], gym: [], walk: [], other: [] };
  workouts.forEach((w) => {
    const k = inferUiKind(w);
    if (groups[k]) groups[k].push(w);
    else groups.other.push(w);
  });

  const section = (title, body) =>
    `<section class="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 shadow-sm p-4 mb-4">
      <h3 class="text-sm font-black text-slate-800 tracking-tight mb-3">${title}</h3>
      ${body}
    </section>`;

  const chartRow = (id, caption, h = 118) =>
    `<div class="mb-4 last:mb-0">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">${caption}</p>
      <canvas id="${id}" height="${h}"></canvas>
    </div>`;

  const htmlParts = [];

  if (groups.run.length) {
    htmlParts.push(
      section(
        'Running',
        chartRow('strava-chart-run-pace', 'Ritmo (min / km aprox.)') +
          chartRow('strava-chart-run-hr', 'FC media') +
          chartRow('strava-chart-run-dist', 'Distancia (km)', 96)
      )
    );
  }

  if (groups.ride.length) {
    htmlParts.push(
      section(
        'Ciclismo',
        chartRow('strava-chart-ride-speed', 'Velocidad media (km / h aprox.)') +
          chartRow('strava-chart-ride-hr', 'FC media') +
          chartRow('strava-chart-ride-dist', 'Distancia (km)', 96)
      )
    );
  }

  const misc = [...groups.swim, ...groups.walk, ...groups.gym, ...groups.other];
  if (misc.length) {
    htmlParts.push(
      section(
        'Otras actividades (natación, gimnasio, caminata…)',
        chartRow('strava-chart-misc-kcal', 'Kcal por sesión', 108) + chartRow('strava-chart-misc-time', 'Duración (min)', 96)
      )
    );
  }

  if (!htmlParts.length) {
    htmlParts.push(
      section('Actividad', chartRow('strava-chart-fallback-kcal', 'Kcal por sesión', 120))
    );
  }

  if (host) host.innerHTML = htmlParts.join('');

  requestAnimationFrame(() => {
    try {
      if (groups.run.length) {
        const labels = groups.run.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10)).reverse();
        mk('strava-chart-run-pace', {
          type: 'line',
          data: {
            labels,
            datasets: [{ label: 'min/km', data: groups.run.map((w) => Number(w.avgPaceMinKm) || 0).reverse(), borderColor: '#f97316', tension: 0.25 }],
          },
          options: scales,
        });
        mk('strava-chart-run-hr', {
          type: 'line',
          data: {
            labels,
            datasets: [{ label: 'bpm', data: groups.run.map((w) => Number(w.averageHr) || 0).reverse(), borderColor: '#ef4444', tension: 0.25 }],
          },
          options: scales,
        });
        mk('strava-chart-run-dist', {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'km', data: groups.run.map((w) => Number(w.distanceKm) || 0).reverse(), backgroundColor: '#3b82f6' }],
          },
          options: scales,
        });
      }

      if (groups.ride.length) {
        const labels = groups.ride.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10)).reverse();
        mk('strava-chart-ride-speed', {
          type: 'line',
          data: {
            labels,
            datasets: [{ label: 'km/h', data: groups.ride.map((w) => bikeAvgKmh(w)).reverse(), borderColor: '#6366f1', tension: 0.25 }],
          },
          options: scales,
        });
        mk('strava-chart-ride-hr', {
          type: 'line',
          data: {
            labels,
            datasets: [{ label: 'bpm', data: groups.ride.map((w) => Number(w.averageHr) || 0).reverse(), borderColor: '#ef4444', tension: 0.25 }],
          },
          options: scales,
        });
        mk('strava-chart-ride-dist', {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'km', data: groups.ride.map((w) => Number(w.distanceKm) || 0).reverse(), backgroundColor: '#22c55e' }],
          },
          options: scales,
        });
      }

      if (misc.length) {
        const labels = misc.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10)).reverse();
        mk('strava-chart-misc-kcal', {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'kcal', data: misc.map((w) => Number(w.kcal) || 0).reverse(), backgroundColor: '#0ea5e9' }],
          },
          options: scales,
        });
        mk('strava-chart-misc-time', {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'min', data: misc.map((w) => Number(w.timeMin) || 0).reverse(), backgroundColor: '#94a3b8' }],
          },
          options: scales,
        });
      } else if (!groups.run.length && !groups.ride.length) {
        const labels = workouts.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10)).reverse();
        mk('strava-chart-fallback-kcal', {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'kcal', data: workouts.map((w) => Number(w.kcal) || 0).reverse(), backgroundColor: '#94a3b8' }],
          },
          options: scales,
        });
      }
    } catch (e) {
      console.warn('mountStravaCharts', e);
    }
  });
}

export function unmountStravaCharts() {
  destroyAll();
  const host = document.getElementById('strava-charts-root');
  if (host) host.innerHTML = '';
}
