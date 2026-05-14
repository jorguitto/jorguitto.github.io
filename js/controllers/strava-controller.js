/**
 * Gráficas Strava (Chart.js). Resumen: gráficas clásicas 7d+catálogo.
 * Pestaña deporte (no Resumen): dos gráficas combinadas (catálogo + 7 días) + conclusión bajo el catálogo.
 * CTL/ATL siguen en Resumen u ocultos según layout.
 */

import { filterStravaWorkoutsLastCalendarDays } from '../core/StravaCoachEngine.js';
import { buildStravaIntelligencePayload } from '../core/StravaIntelligenceEngine.js';
import { filterWorkoutsByStravaTab } from '../core/strava-workout-filters.js';
import { buildSessionChartNarratives } from '../core/strava-chart-narratives.js';

const chartRefs = {};
const CHART_WINDOW_DAYS = 7;

const LANE_LABEL_ES = {
  run: 'Running',
  ride: 'Ciclismo',
  walk: 'Caminar / hike',
  gym: 'Gym / fuerza',
  swim: 'Natación',
  other: 'Otros',
};

const LANE_COMBO_HINT_CATALOG =
  'Toca la gráfica sobre un día/entreno.\n1.er toque: resumen del punto.\n2.º toque en el mismo punto: abrir la actividad completa.\n(Catálogo completo de esta pestaña.)';

const LANE_COMBO_HINT_7D =
  'Misma interacción que arriba, solo con sesiones de los últimos 7 días naturales en esta categoría.';

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

  const sortByDate = (a, b) =>
    String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''));

  const workouts7 = filterStravaWorkoutsLastCalendarDays(rawFiltered, CHART_WINDOW_DAYS).sort(sortByDate);
  const workoutsCatalog = [...rawFiltered].sort(sortByDate);

  if (lane) {
    const lbl = LANE_LABEL_ES[lane] || lane;
    const tCat = document.getElementById('strava-lane-combo-catalog-title');
    if (tCat) tCat.textContent = `${lbl} · catálogo completo`;
    const t7 = document.getElementById('strava-lane-combo-7d-title');
    if (t7) t7.textContent = `${lbl} · últimos 7 días`;

    setInsight('strava-lane-combo-conclusion', buildLaneTrajectoryConclusion(lane, workoutsCatalog));
    mountLaneComboChart(Chart, lane, workoutsCatalog, color, grid, {
      canvasId: 'strava-lane-combo-canvas-catalog',
      hintId: 'strava-lane-combo-hint-catalog',
      hintDefault: LANE_COMBO_HINT_CATALOG,
      maxTicks: 22,
      emptyHint: 'No hay sesiones en esta categoría para graficar.',
    });
    mountLaneComboChart(Chart, lane, workouts7, color, grid, {
      canvasId: 'strava-lane-combo-canvas-7d',
      hintId: 'strava-lane-combo-hint-7d',
      hintDefault: LANE_COMBO_HINT_7D,
      maxTicks: 12,
      emptyHint: 'Sin sesiones en los últimos 7 días naturales en esta categoría.',
    });
  } else {
    setInsight('strava-lane-combo-conclusion', '');
    const hc = document.getElementById('strava-lane-combo-hint-catalog');
    if (hc) hc.textContent = '';
    const h7 = document.getElementById('strava-lane-combo-hint-7d');
    if (h7) h7.textContent = '';
    mountSessionChartsBlock(Chart, workouts7, lane, color, grid, false);
    mountSessionChartsBlock(Chart, workoutsCatalog, lane, color, grid, true);
  }
}

function fmtLaneComboDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtPaceMinKmMm(minKm) {
  const n = Number(minKm);
  if (!(n > 0)) return '—';
  const mi = Math.floor(n);
  const sec = Math.min(59, Math.round((n - mi) * 60));
  return `${mi}:${String(sec).padStart(2, '0')} /km`;
}

/**
 * Tercera serie: ritmo (min/km) si hay datos; si no, duración (min). Gym fuerza duración.
 * @param {string} lane
 * @param {object[]} workouts
 */
function resolveLaneThirdSeries(lane, workouts) {
  if (lane === 'gym') {
    return {
      label: 'Duración (min)',
      reverse: false,
      data: workouts.map((w) => {
        const t = Number(w.timeMin) || 0;
        return t > 0 ? t : null;
      }),
      isPace: false,
    };
  }
  const paceData = workouts.map((w) => {
    const p = Number(w.avgPaceMinKm) || 0;
    return p > 0 ? p : null;
  });
  const hasPace = paceData.some((p) => p != null);
  if (hasPace) {
    return {
      label: 'Ritmo (min/km)',
      reverse: true,
      data: paceData,
      isPace: true,
    };
  }
  return {
    label: 'Duración (min)',
    reverse: false,
    data: workouts.map((w) => {
      const t = Number(w.timeMin) || 0;
      return t > 0 ? t : null;
    }),
    isPace: false,
  };
}

/**
 * Texto automático: tendencia al comparar primer vs último tercio del historial (orientativo).
 * @param {string} lane
 * @param {object[]} workoutsAsc
 */
function buildLaneTrajectoryConclusion(lane, workoutsAsc) {
  const sorted = [...(workoutsAsc || [])].sort((a, b) =>
    String(a.startDateLocal || a.startDate || '').localeCompare(String(b.startDateLocal || b.startDate || ''))
  );
  if (!sorted.length) {
    return 'Sin sesiones en esta categoría: importa desde Strava o revisa cómo se clasifica el deporte.';
  }
  if (sorted.length < 4) {
    return 'Con pocas sesiones aún no se puede trazar una tendencia clara; vuelve a mirar esto cuando tengas más historial importado en esta pestaña.';
  }

  const n = sorted.length;
  const k = Math.max(2, Math.floor(n / 3));
  const first = sorted.slice(0, k);
  const last = sorted.slice(-k);

  const avgPos = (arr, get) => {
    const vals = arr.map(get).filter((x) => Number.isFinite(x) && x > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const d0 = avgPos(first, (x) => Number(x.distanceKm) || 0);
  const d1 = avgPos(last, (x) => Number(x.distanceKm) || 0);
  const hr0 = avgPos(first, (x) => Number(x.averageHr) || 0);
  const hr1 = avgPos(last, (x) => Number(x.averageHr) || 0);
  const p0 = avgPos(first, (x) => Number(x.avgPaceMinKm) || 0);
  const p1 = avgPos(last, (x) => Number(x.avgPaceMinKm) || 0);
  const t0 = avgPos(first, (x) => Number(x.timeMin) || 0);
  const t1 = avgPos(last, (x) => Number(x.timeMin) || 0);

  const third = resolveLaneThirdSeries(lane, sorted);
  const parts = [];
  let tone = 'mixta';

  if (d0 > 0 && d1 > 0) {
    if (d1 > d0 * 1.12) parts.push(`sube la distancia media por sesión (~${d0.toFixed(1)} → ~${d1.toFixed(1)} km)`);
    else if (d1 < d0 * 0.88) parts.push(`baja la distancia media por sesión (~${d0.toFixed(1)} → ~${d1.toFixed(1)} km)`);
  }

  if (third.isPace && p0 > 0 && p1 > 0) {
    if (p1 < p0 * 0.97) {
      parts.push('el ritmo medio mejora (menos min/km), compatible con trayectoria ascendente en velocidad/eficiencia');
      tone = 'ascendente';
    } else if (p1 > p0 * 1.03) {
      parts.push('el ritmo medio se relaja (más min/km): bloques fáciles, fatiga acumulada o condiciones distintas');
      tone = 'descendente';
    }
  } else if (!third.isPace && t0 > 0 && t1 > 0) {
    if (t1 > t0 * 1.1) {
      parts.push('las sesiones alargan de media en duración');
      tone = 'ascendente';
    } else if (t1 < t0 * 0.9) {
      parts.push('las sesiones se acortan de media');
      tone = 'descendente';
    }
  }

  if (hr0 > 0 && hr1 > 0) {
    if (hr1 > hr0 * 1.04 && p0 > 0 && p1 > 0 && p1 >= p0 * 0.98) {
      parts.push('la FC media sube sin mejora clara de ritmo: más estrés cardiovascular relativo');
    } else if (hr1 < hr0 * 0.96 && third.isPace && p0 > 0 && p1 > 0 && p1 < p0) {
      parts.push('FC algo más baja con ritmo algo más vivo: posible comodidad o base más aeróbica');
    }
  }

  const open =
    tone === 'ascendente'
      ? 'La trayectoria global en esta categoría se interpreta como favorable o ascendente (orientativo), sobre todo porque '
      : tone === 'descendente'
        ? 'La trayectoria se acerca más a un patrón descendente o de relajación en los datos importados, porque '
        : 'La trayectoria es mixta o estable al comparar el primer tercio de tu historial con el más reciente: ';

  const body = parts.length ? parts.join(' · ') + '.' : 'no hay cambios claros entre el inicio del historial y las sesiones recientes en los datos disponibles.';

  return `${open}${body}\n\nComparación automática (primer vs último tercio de sesiones ordenadas por fecha). No sustituye sensación, sueño ni lesiones.`;
}

/**
 * Gráfica 3 líneas por pestaña deporte. Doble toque mismo índice abre actividad.
 * @param {typeof window.Chart} Chart
 * @param {string} lane
 * @param {object[]} workouts — orden cronológico ascendente
 * @param {{ canvasId: string, hintId: string, hintDefault: string, maxTicks: number, emptyHint: string }} ui
 */
function mountLaneComboChart(Chart, lane, workouts, color, grid, ui) {
  const hintEl = document.getElementById(ui.hintId);
  const canvas = document.getElementById(ui.canvasId);

  const setHint = (text) => {
    if (hintEl) hintEl.textContent = text || ui.hintDefault;
  };

  const mk = (id, cfg) => {
    const el = document.getElementById(id);
    if (!el) return;
    chartRefs[id] = new Chart(el, cfg);
  };

  setHint(ui.hintDefault);
  if (!canvas) return;

  if (!workouts.length) {
    setHint(ui.emptyHint);
    return;
  }

  const third = resolveLaneThirdSeries(lane, workouts);
  let selectedIdx = -1;

  const labels = workouts.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10));
  const distData = workouts.map((w) => Number(w.distanceKm) || 0);
  const hrData = workouts.map((w) => {
    const h = Number(w.averageHr) || 0;
    return h > 0 ? h : null;
  });

  const scales = {
    x: {
      ticks: { color, maxTicksLimit: ui.maxTicks },
      grid: { color: grid },
    },
    y: {
      type: 'linear',
      position: 'left',
      ticks: { color },
      grid: { color: grid },
      title: { display: true, text: 'Distancia (km)', color },
    },
    y1: {
      type: 'linear',
      position: 'right',
      ticks: { color },
      grid: { drawOnChartArea: false },
      title: { display: true, text: 'FC (lpm)', color },
    },
    yThird: {
      type: 'linear',
      position: 'right',
      offset: true,
      reverse: third.reverse,
      ticks: { color },
      grid: { drawOnChartArea: false },
      title: { display: true, text: third.label, color },
    },
  };

  mk(ui.canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Distancia (km)',
          data: distData,
          yAxisID: 'y',
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 8,
          spanGaps: true,
        },
        {
          label: 'FC media',
          data: hrData,
          yAxisID: 'y1',
          borderColor: '#dc2626',
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 8,
          spanGaps: true,
        },
        {
          label: third.label,
          data: third.data,
          yAxisID: 'yThird',
          borderColor: '#ea580c',
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 8,
          spanGaps: true,
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 420, easing: 'easeOutQuart' },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const it = items && items[0];
              const i = it != null ? it.dataIndex : -1;
              if (i >= 0 && workouts[i] && workouts[i].name) return String(workouts[i].name).slice(0, 56);
              return undefined;
            },
          },
        },
      },
      scales,
      onClick: (evt, elements, chart) => {
        let idx = -1;
        if (elements && elements.length) idx = elements[0].index;
        if (idx < 0 && chart && evt) {
          const nat = evt.native || evt;
          if (typeof chart.getElementsAtEventForMode === 'function') {
            const found = chart.getElementsAtEventForMode(nat, 'index', { intersect: false }, true);
            if (found && found.length) idx = found[0].index;
          }
        }
        if (idx < 0) {
          selectedIdx = -1;
          setHint(ui.hintDefault);
          try {
            if (typeof chart.setActiveElements === 'function') chart.setActiveElements([]);
            chart.update();
          } catch (_) {}
          return;
        }
        if (selectedIdx === idx) {
          const w = workouts[idx];
          const aid = w && w.activityId;
          if (aid != null && typeof window.openImportedStravaWorkoutDetails === 'function') {
            window.openImportedStravaWorkoutDetails(String(aid));
          }
          selectedIdx = -1;
          setHint(ui.hintDefault);
          try {
            if (typeof chart.setActiveElements === 'function') chart.setActiveElements([]);
            chart.update();
          } catch (_) {}
          return;
        }
        selectedIdx = idx;
        const w = workouts[idx];
        const iso = w.startDateLocal || w.startDate || '';
        const dateLabel = fmtLaneComboDate(iso);
        const km = (Number(w.distanceKm) || 0).toFixed(2);
        const fc = Number(w.averageHr) || 0;
        const thirdLine = third.isPace
          ? `Ritmo medio: ${fmtPaceMinKmMm(w.avgPaceMinKm)}`
          : `Duración: ${(Number(w.timeMin) || 0) > 0 ? `${Math.round(Number(w.timeMin))} min` : '—'}`;
        setHint(
          [
            `Seleccionado (${idx + 1}/${workouts.length})`,
            `Fecha: ${dateLabel}`,
            `Distancia: ${km} km`,
            `FC media: ${fc > 0 ? `${Math.round(fc)} lpm` : '—'}`,
            thirdLine,
            '',
            'Vuelve a tocar el mismo punto para abrir la ficha completa.',
          ].join('\n')
        );
        try {
          if (typeof chart.setActiveElements === 'function') {
            chart.setActiveElements([
              { datasetIndex: 0, index: idx },
              { datasetIndex: 1, index: idx },
              { datasetIndex: 2, index: idx },
            ]);
            chart.update();
          }
        } catch (_) {}
      },
    },
  });
}

/**
 * Ritmo / FC / distancia / carga por sesión. `catalog === false` → IDs legacy (ventana 7 d);
 * `catalog === true` → mismas gráficas sobre todo el catálogo de la pestaña activa.
 * @param {typeof window.Chart} Chart
 * @param {object[]} workouts
 * @param {string|null} lane
 * @param {string} color
 * @param {string} grid
 * @param {boolean} catalog
 */
function mountSessionChartsBlock(Chart, workouts, lane, color, grid, catalog) {
  const ids = catalog
    ? {
        paceI: 'strava-chart-pace-catalog-insight',
        paceC: 'strava-chart-pace-catalog',
        hrI: 'strava-chart-hr-catalog-insight',
        hrC: 'strava-chart-hr-catalog',
        distI: 'strava-chart-dist-catalog-insight',
        distC: 'strava-chart-distance-catalog',
        loadI: 'strava-chart-load-catalog-insight',
        loadC: 'strava-chart-load-catalog',
      }
    : {
        paceI: 'strava-chart-pace-insight',
        paceC: 'strava-chart-pace',
        hrI: 'strava-chart-hr-insight',
        hrC: 'strava-chart-hr',
        distI: 'strava-chart-dist-insight',
        distC: 'strava-chart-distance',
        loadI: 'strava-chart-load-insight',
        loadC: 'strava-chart-load',
      };

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
    scales: {
      x: {
        ticks: { color, maxTicksLimit: catalog ? 18 : 12 },
        grid: { color: grid },
      },
      y: { ticks: { color }, grid: { color: grid } },
    },
  };

  if (!workouts.length) {
    setInsight(ids.paceI, narr.pace);
    setInsight(ids.hrI, narr.hr);
    setInsight(ids.distI, narr.dist);
    setInsight(ids.loadI, narr.load);
    return;
  }

  const labels = workouts.map((w) => (w.startDateLocal || w.startDate || '').slice(0, 10));
  const pace = workouts.map((w) => Number(w.avgPaceMinKm) || 0);
  const hr = workouts.map((w) => Number(w.averageHr) || 0);
  const dist = workouts.map((w) => Number(w.distanceKm) || 0);

  const showPace = lane == null || lane === 'run' || lane === 'walk';
  if (showPace && pace.some((p) => p > 0)) {
    mk(ids.paceC, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Ritmo (min/km)', data: pace, borderColor: '#f97316', tension: 0.25 }],
      },
      options: baseOpts,
    });
    setInsight(ids.paceI, narr.pace);
  } else {
    setInsight(
      ids.paceI,
      lane === 'ride' || lane === 'swim' || lane === 'gym'
        ? 'Ritmo min/km no es la métrica principal para este deporte en esta vista; mira distancia, FC y carga.'
        : narr.pace
    );
  }

  mk(ids.hrC, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'FC media', data: hr, borderColor: '#ef4444', tension: 0.25 }],
    },
    options: baseOpts,
  });
  setInsight(ids.hrI, narr.hr);

  mk(ids.distC, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Distancia (km)', data: dist, backgroundColor: '#3b82f6' }],
    },
    options: baseOpts,
  });
  setInsight(ids.distI, narr.dist);

  const loadEl = document.getElementById(ids.loadC);
  if (loadEl) {
    const loadData = workouts.map((w) => {
      const min = Number(w.timeMin) || 0;
      const int = Math.max(1, Math.min(3, Number(w.intensity) || 1));
      const hrv = Number(w.averageHr) || 0;
      const hrBoost = hrv > 0 ? 1 + Math.min(0.5, (hrv - 120) / 200) : 1;
      return Math.min(100, Math.round(min * int * int * hrBoost * 0.35));
    });
    mk(ids.loadC, {
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
  setInsight(ids.loadI, narr.load);
}

export function unmountStravaCharts() {
  destroyAll();
}
