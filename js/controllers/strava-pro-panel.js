/**
 * UI premium Strava: monta HTML en #strava-pro-mount (legacy llama desde proyecto(1).html).
 * Responsive (móvil / escritorio), ventana 7 días en coach, pestañas por deporte.
 */
import {
  buildStravaCoachPayload,
  aggregateStravaSessions,
  bucketStravaWorkoutsByCategory,
  filterStravaWorkoutsLastCalendarDays,
} from '../core/StravaCoachEngine.js';
import { buildStravaIntelligencePayload } from '../core/StravaIntelligenceEngine.js';
import { strictStravaCategory } from '../core/strava-sport-taxonomy.js';
import { recoverySignalsFromWorkouts } from '../core/RecoveryEngine.js';
import { performanceTrendHints } from '../core/PerformanceEngine.js';
import { buildLaneCoachNarrative } from '../core/strava-lane-narrative-engine.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BADGE_TONE = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-900 border-amber-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
};

const WINDOW_DAYS = 7;

const TAB_META = [
  { id: 'overview', label: 'Resumen', icon: 'fa-chart-line' },
  { id: 'run', label: 'Running', icon: 'fa-person-running' },
  { id: 'ride', label: 'Ciclismo', icon: 'fa-bicycle' },
  { id: 'walk', label: 'Caminar', icon: 'fa-person-hiking' },
  { id: 'gym', label: 'Gym', icon: 'fa-dumbbell' },
  { id: 'swim', label: 'Natación', icon: 'fa-person-swimming' },
  { id: 'other', label: 'Otros', icon: 'fa-layer-group' },
];

const INTEL_SHELL = {
  positive: 'ring-emerald-500/30 shadow-emerald-900/20',
  neutral: 'ring-white/10 shadow-slate-900/30',
  warn: 'ring-amber-400/40 shadow-amber-900/25',
  risk: 'ring-rose-500/40 shadow-rose-900/30',
};

function kpiCard(label, value, hint, extraClass) {
  return `
    <div class="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3 sm:p-4 shadow-sm backdrop-blur-sm ${extraClass || ''}">
      <p class="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500 truncate">${esc(label)}</p>
      <p class="mt-1 break-words text-lg sm:text-2xl font-black text-slate-900 tabular-nums leading-tight">${value}</p>
      ${hint ? `<p class="mt-1 text-[9px] sm:text-[10px] text-slate-500 leading-snug">${esc(hint)}</p>` : ''}
    </div>
  `;
}

function sortWorkoutsDesc(workouts) {
  return [...(Array.isArray(workouts) ? workouts : [])].sort((a, b) =>
    String(b.startDateLocal || b.startDate || '').localeCompare(String(a.startDateLocal || a.startDate || ''))
  );
}

function sessionRowHtml(w) {
  const date = String(w.startDateLocal || w.startDate || '').slice(0, 10);
  const km = Number(w.distanceKm) || 0;
  const min = Number(w.timeMin) || 0;
  const cat = strictStravaCategory(w);
  const idJs = String(w.activityId ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
    <div data-strava-session-row="1" class="strava-session-row flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-xl border border-slate-100/90 bg-white/60 px-3 py-2 text-[11px] backdrop-blur-sm transition hover:border-orange-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:gap-2" onclick="openImportedStravaWorkoutDetails('${idJs}')">
      <div class="min-w-0">
        <span class="truncate font-bold text-slate-800">${esc(w.name || w.typeLabel || 'Actividad')}</span>
        <span class="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-slate-400">${esc(cat)} · ${esc(String(w.typeLabel || w.sportType || '').slice(0, 28))}</span>
      </div>
      <span class="shrink-0 font-mono text-[10px] text-slate-500">${esc(date)} · ${km.toFixed(1)} km · ${Math.round(min)} min</span>
    </div>`;
}

function metricHelpPill(metricId, label) {
  return `<button type="button" data-strava-metric="${esc(metricId)}" class="rounded-xl bg-white/10 px-3 py-1.5 text-left text-[10px] font-black text-white ring-1 ring-white/10 transition hover:bg-white/20">${esc(
    label
  )}</button>`;
}

function bulletList(title, items) {
  const li = (items || []).map((t) => `<li class="text-[11px] leading-relaxed text-slate-700 sm:text-xs">${esc(t)}</li>`).join('');
  return `
    <div class="rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm sm:p-4">
      <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">${esc(title)}</p>
      <ul class="mt-2 list-disc space-y-1 pl-4">${li || '<li class="text-xs text-slate-400">—</li>'}</ul>
    </div>`;
}

function sportRunSectionHtml(workouts, buckets, buckets7, windowDays) {
  const all = sortWorkoutsDesc(buckets.run || []);
  const w7 = sortWorkoutsDesc(buckets7.run || []);
  const aggAll = aggregateStravaSessions(all);
  const agg7 = aggregateStravaSessions(w7);
  const narr = buildLaneCoachNarrative('run', workouts);
  const rows = all.map(sessionRowHtml).join('');
  const strip = narr.statsStrip || {};
  return `
    <div data-strava-tab-panel="run" class="hidden space-y-4 min-w-0">
      <div class="rounded-3xl border border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-white p-4 shadow-lg ring-1 ring-orange-100 sm:p-5">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">1 · Resumen inteligente (running)</p>
        <p class="mt-2 text-sm font-bold leading-snug text-slate-900 sm:text-base">${esc(narr.summary)}</p>
        <div class="mt-3 grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
          ${kpiCard(`Sesiones (catálogo)`, String(strip.sessions ?? aggAll.count), 'Solo carreras clasificadas', '')}
          ${kpiCard(`Km (catálogo)`, aggAll.count ? `${aggAll.totalKm.toFixed(1)}` : '0', 'Suma importada', '')}
          ${kpiCard(`Km últimos 365d`, strip.km365 != null ? `${Number(strip.km365).toFixed(1)}` : '—', 'Dentro del catálogo', '')}
          ${kpiCard(`Sesiones ${windowDays}d`, String(agg7.count), 'Ventana corta', '')}
        </div>
        <ul class="mt-3 space-y-1 border-t border-orange-100/80 pt-3">
          ${narr.keyInsights.map((t) => `<li class="text-[11px] text-slate-700 sm:text-xs"><span class="font-black text-orange-600">→</span> ${esc(t)}</li>`).join('')}
        </ul>
      </div>

      <div class="grid gap-3 lg:grid-cols-2">
        ${bulletList('2 · Comparativa histórica (bloques)', [...(narr.historicalCompare?.lines || [])])}
        ${bulletList(`3 · ${narr.window7?.title || 'Últimos 7 días'}`, [...(narr.window7?.lines || [])])}
      </div>

      <div class="rounded-2xl border border-cyan-200/80 bg-cyan-50/90 p-3 shadow-sm sm:p-4">
        <p class="text-[10px] font-black uppercase tracking-widest text-cyan-900">4 · Correlaciones y lectura de entrenador</p>
        <ul class="mt-2 list-disc space-y-1 pl-4">
          ${narr.correlations.map((t) => `<li class="text-[11px] leading-relaxed text-cyan-950 sm:text-xs">${esc(t)}</li>`).join('')}
        </ul>
        <p class="mt-2 text-[10px] leading-relaxed text-cyan-900/80">Las gráficas inferiores (ritmo, FC, distancia, carga) usan la misma pestaña: solo running, últimos 7 días calendario. Pulsa el título de cada gráfica en la página para leer la conclusión automática.</p>
      </div>

      <div class="rounded-3xl border border-slate-200/90 bg-white/95 p-3 shadow-md sm:p-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-[10px] font-black uppercase tracking-widest text-slate-600">5 · Todas las carreras (catálogo)</p>
          <input id="strava-run-list-filter" type="search" autocomplete="off" placeholder="Buscar por nombre o tipo…" class="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-inner sm:max-w-xs" />
        </div>
        <div id="strava-run-all-rows" class="custom-scrollbar mt-2 max-h-[min(420px,55vh)] space-y-1 overflow-y-auto pr-1">
          ${rows || '<p class="text-xs text-slate-400">Sin carreras en el catálogo.</p>'}
        </div>
      </div>
    </div>`;
}

function sportSection(cat, label, buckets, buckets7, startHidden) {
  const all = sortWorkoutsDesc(buckets[cat] || []);
  const w7 = sortWorkoutsDesc(buckets7[cat] || []);
  const aggAll = aggregateStravaSessions(all);
  const agg7 = aggregateStravaSessions(w7);
  const rows = all.slice(0, 12).map(sessionRowHtml).join('');
  return `
    <div data-strava-tab-panel="${cat}" class="${startHidden ? 'hidden ' : ''}space-y-3 min-w-0">
      <div class="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
        ${kpiCard(`${label} · 7 días`, agg7.count ? String(agg7.count) : '0', 'Sesiones en ventana', '')}
        ${kpiCard(`${label} · km (7d)`, agg7.count ? `${agg7.totalKm.toFixed(1)}` : '0', 'Solo ventana', '')}
        ${kpiCat('Total catálogo', String(aggAll.count), 'Sesiones importadas', '')}
        ${kpiCat('Total km', aggAll.count ? `${aggAll.totalKm.toFixed(1)}` : '0', 'Todo el catálogo', '')}
      </div>
      <div class="rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-sm backdrop-blur-md min-w-0">
        <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Solo ${esc(label)} · ordenadas por fecha</p>
        <div class="mt-2 max-h-52 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
          ${rows || '<p class="text-xs text-slate-400">Sin actividades en esta categoría.</p>'}
        </div>
      </div>
    </div>`;
}

/** Variante compacta de kpiCard para grids 4 cols en móvil */
function kpiCat(label, value, hint, extraClass) {
  return `
    <div class="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 p-2.5 sm:p-3 shadow-sm ${extraClass || ''}">
      <p class="truncate text-[8px] sm:text-[9px] font-black uppercase tracking-wide text-slate-500">${esc(label)}</p>
      <p class="mt-0.5 truncate text-base sm:text-lg font-black text-slate-900 tabular-nums">${value}</p>
      ${hint ? `<p class="mt-0.5 truncate text-[8px] text-slate-500">${esc(hint)}</p>` : ''}
    </div>`;
}

/**
 * @param {{ todayData?: object, userBio?: object|null, mountEl?: HTMLElement|null, mountSelector?: string, activeTab?: string }} opts
 */
export function mountStravaProPanel(opts) {
  const sel = opts.mountSelector || '#strava-pro-mount';
  const el = opts.mountEl || document.querySelector(sel);
  if (!el) return;

  const stravaPage = document.getElementById('strava');
  const requested = opts.activeTab || stravaPage?.dataset?.stravaLane || 'overview';
  const initialTab = TAB_META.some((t) => t.id === requested) ? requested : 'overview';
  if (stravaPage) stravaPage.dataset.stravaLane = initialTab;

  const todayData = opts.todayData || {};
  const bio = opts.userBio || {};
  const workouts = Array.isArray(todayData.stravaSyncedWorkouts) ? todayData.stravaSyncedWorkouts : [];
  const firstName = (bio.nombre && String(bio.nombre).split(' ')[0]) || '';

  const coach = buildStravaCoachPayload(workouts, {
    firstName,
    stepsToday: Number(todayData.steps) || 0,
    sleepHours: Number(todayData.sleepHours) || 0,
    windowDays: WINDOW_DAYS,
  });

  const rw = recoverySignalsFromWorkouts(workouts, { windowDays: WINDOW_DAYS });
  const ph = performanceTrendHints(workouts, { windowDays: WINDOW_DAYS });
  const extraHints = [...(rw.hints || []), ...(ph || [])];

  const win7 = filterStravaWorkoutsLastCalendarDays(workouts, WINDOW_DAYS);
  const buckets = bucketStravaWorkoutsByCategory(workouts);
  const buckets7 = bucketStravaWorkoutsByCategory(win7);

  const badgeHtml = coach.badges
    .map(
      (b) =>
        `<span class="inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[9px] font-black sm:text-[10px] ${BADGE_TONE[b.tone] || BADGE_TONE.slate}">${esc(b.label)}</span>`
    )
    .join('');

  const bulletsHtml = coach.bullets
    .map((t) => `<li class="flex gap-2 text-xs sm:text-sm text-slate-700 leading-relaxed"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"></span><span class="min-w-0 break-words">${esc(t)}</span></li>`)
    .join('');

  const planHtml = coach.plan.map((t) => `<li class="text-xs sm:text-sm text-slate-700 border-l-2 border-emerald-400 pl-3 py-1 break-words">${esc(t)}</li>`).join('');

  const extraHtml = extraHints.map((t) => `<li class="text-[11px] sm:text-xs text-slate-600 leading-relaxed break-words">${esc(t)}</li>`).join('');

  const intel = buildStravaIntelligencePayload(workouts);
  const intelRing = INTEL_SHELL[intel.executiveSeverity] || INTEL_SHELL.neutral;
  const insightsHtml =
    (intel.insights || []).length > 0
      ? (intel.insights || [])
          .slice(0, 8)
          .map(
            (it) => `
      <details class="group rounded-2xl border border-slate-200/90 bg-white/70 backdrop-blur-md shadow-sm open:shadow-md transition">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 sm:px-4 [&::-webkit-details-marker]:hidden">
          <span class="h-2 w-2 shrink-0 rounded-full ${it.severity === 'risk' ? 'bg-rose-500' : it.severity === 'warn' ? 'bg-amber-400' : it.severity === 'positive' ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
          <span class="min-w-0 flex-1 text-left text-[11px] font-black text-slate-900 sm:text-xs">${esc(it.title)}</span>
          ${it.tag ? `<span class="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">${esc(it.tag)}</span>` : ''}
          <i class="fas fa-chevron-down text-[10px] text-slate-400 transition group-open:rotate-180"></i>
        </summary>
        <div class="border-t border-slate-100 px-3 py-2 pb-3 text-[11px] leading-relaxed text-slate-600 sm:px-4 sm:text-xs">${esc(it.detail)}</div>
      </details>`
          )
          .join('')
      : `<div class="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-500">Importa actividades para generar insights automáticos.</div>`;

  const intelStrip = `
    <div class="space-y-2">
      <div class="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 shadow-2xl ring-2 backdrop-blur-xl sm:p-5 ${intelRing}">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0 flex-1">
            <p class="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-300/90">Laboratorio · histórico inteligente</p>
            <p class="mt-2 text-sm font-semibold leading-snug text-slate-50 sm:text-base">${esc(intel.executiveLine)}</p>
            ${
              intel.sampled < intel.total
                ? `<p class="mt-1 text-[10px] text-slate-500">Motor: últimas ${intel.sampled} sesiones de ${intel.total} (velocidad). Los totales del catálogo no se pierden.</p>`
                : ''
            }
          </div>
          <div class="flex shrink-0 flex-wrap gap-2 xl:justify-end">
            ${metricHelpPill('ctl', `CTL ~${Math.round(intel.ctl)}`)}
            ${metricHelpPill('atl', `ATL ~${Math.round(intel.atl)}`)}
            ${metricHelpPill('tsb', `TSB ~${Math.round(intel.tsb)}`)}
            ${metricHelpPill('monotony', `Mono ${intel.monotony7}`)}
            ${metricHelpPill('strain7', `Σ7d ${intel.strain7}`)}
          </div>
        </div>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">${insightsHtml}</div>
    </div>`;

  const bulletsCompact = `
    <details class="mt-4 rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-sm open:bg-white/80">
      <summary class="cursor-pointer list-none px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 [&::-webkit-details-marker]:hidden">Ampliar líneas del coach (${coach.bullets.length})</summary>
      <ul class="space-y-2 border-t border-slate-100 px-4 py-3">${bulletsHtml}</ul>
    </details>`;

  const wxBlock = win7
    .filter((w) => w && w.weatherContext && w.weatherContext.summary)
    .slice(0, 5)
    .map(
      (w) => `
      <div class="flex min-w-0 flex-col gap-0.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] sm:flex-row sm:items-center sm:justify-between">
        <span class="min-w-0 truncate font-bold text-slate-700">${esc(w.name || w.typeLabel || 'Actividad')}</span>
        <span class="shrink-0 text-slate-500">${esc(w.weatherContext.summary)}</span>
      </div>`
    )
    .join('');

  const a = coach.agg;
  const aLife = coach.aggLifetime || a;
  const hasData = aLife.count > 0;
  const hasWindow = a.count > 0;

  const sportChips = (aLife.bySport || [])
    .map(
      (s) => `
      <span class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm sm:text-[11px]">
        <i class="fas fa-bolt shrink-0 text-orange-500"></i><span class="truncate">${esc(s.sport)}</span>
        <span class="shrink-0 text-slate-400 font-mono">${s.count}×</span>
        <span class="shrink-0 text-emerald-600">${s.km.toFixed(1)}km</span>
      </span>`
    )
    .join('');

  const tabButtons = TAB_META.map((t) => {
    const active = t.id === initialTab;
    return `<button type="button" data-strava-tab="${t.id}" class="strava-pro-tab shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition sm:text-xs ${
      active ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }"><i class="fas ${t.icon} mr-1 opacity-90"></i>${esc(t.label)}</button>`;
  }).join('');

  const overviewPanel = `
    <div data-strava-tab-panel="overview" class="space-y-3 min-w-0">
      ${intelStrip}
      <div class="grid min-w-0 gap-3 xl:grid-cols-3">
        <div class="min-w-0 space-y-3 xl:col-span-2">
          <div class="rounded-3xl border border-white/60 bg-white/75 p-4 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200/60 backdrop-blur-xl sm:p-5">
            <div class="flex flex-col gap-3 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-start min-[400px]:justify-between">
              <div class="min-w-0 flex-1">
                <p class="text-[9px] font-black uppercase tracking-[0.18em] text-orange-600 sm:text-[10px] sm:tracking-[0.2em]">Coach digital · ventana ${WINDOW_DAYS} d</p>
                <h3 class="mt-1 break-words text-lg font-black text-slate-900 sm:text-xl">${esc(coach.headline)}</h3>
                <p class="mt-2 text-[11px] text-slate-600 leading-relaxed sm:text-xs">${esc(coach.subline)}</p>
              </div>
              <div class="flex min-w-0 shrink-0 flex-col gap-2 sm:items-end">
                <span class="w-fit rounded-full bg-slate-900 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white sm:text-[10px]">Readiness</span>
                <span class="break-words text-base font-black text-orange-600 sm:text-lg">${esc(coach.readiness)}</span>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">${badgeHtml}</div>
            ${bulletsCompact}
          </div>

          <div class="rounded-3xl border border-emerald-200/60 bg-gradient-to-r from-emerald-50/90 via-white to-white p-4 shadow-lg backdrop-blur-md sm:p-5">
            <p class="text-[9px] font-black uppercase text-emerald-700 tracking-widest sm:text-[10px]">Plan orientativo</p>
            <ul class="mt-3 space-y-2">${planHtml}</ul>
          </div>
        </div>

        <div class="min-w-0 space-y-3">
          <div class="rounded-3xl border border-white/10 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-xl sm:p-5">
            <p class="text-[9px] font-black uppercase text-orange-300 tracking-widest sm:text-[10px]">Motivación (hoy)</p>
            <p class="mt-3 text-xs leading-relaxed text-slate-100 sm:text-sm">${esc(coach.motivation)}</p>
            <p class="mt-4 border-t border-white/10 pt-3 text-[9px] leading-relaxed text-slate-400 sm:text-[10px]">${esc(coach.disclaimer)}</p>
          </div>

          <div class="rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-md backdrop-blur-md sm:p-4">
            <p class="text-[9px] font-black uppercase text-slate-500 sm:text-[10px]">Micro señales · ${WINDOW_DAYS} d</p>
            <ul class="mt-2 list-disc space-y-1 pl-4">${extraHtml || '<li class="text-xs text-slate-400">Importa sesiones en la ventana para tendencias.</li>'}</ul>
          </div>

          ${
            wxBlock
              ? `<div class="rounded-3xl border border-sky-200/60 bg-sky-50/80 p-3 shadow-md backdrop-blur-md sm:p-4">
              <p class="text-[9px] font-black uppercase text-sky-800 sm:text-[10px]">Clima (ventana)</p>
              <div class="mt-2 space-y-1">${wxBlock}</div>
            </div>`
              : ''
          }
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 min-[1100px]:grid-cols-6 sm:gap-3">
        ${kpiCard(`Sesiones (${WINDOW_DAYS} d)`, hasWindow ? String(a.count) : '0', hasData ? `Catálogo: ${aLife.count}` : '—', '')}
        ${kpiCard(`Km (${WINDOW_DAYS} d)`, hasWindow ? `${a.totalKm.toFixed(1)}` : '0', 'Ventana activa', '')}
        ${kpiCard(`Tiempo (${WINDOW_DAYS} d)`, hasWindow ? `${Math.round(a.totalMin)} min` : '0', 'Moving time', '')}
        ${kpiCard(`Energía (${WINDOW_DAYS} d)`, hasWindow ? `≈ ${Math.round(a.totalKcal)}` : '—', 'kcal est.', '')}
        ${kpiCard(`Desnivel (${WINDOW_DAYS} d)`, hasWindow ? `${Math.round(a.totalElev)} m` : '0', 'Si Strava lo trae', '')}
        ${kpiCard('Carga índice', hasWindow ? String(a.loadIndex) : '—', '0–100 · ventana', 'ring-1 ring-orange-100')}
      </div>

      <div class="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="min-w-0 text-[9px] font-black uppercase tracking-widest text-slate-500 sm:text-[10px]">Tipos en catálogo (Strava)</p>
          ${hasData ? `<span class="shrink-0 text-[10px] font-bold text-slate-400">${aLife.bySport.length} tipos</span>` : ''}
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5 sm:gap-2">${hasData ? sportChips : '<span class="text-xs text-slate-400">Importa actividades para ver chips.</span>'}</div>
      </div>
    </div>`;

  const runPanel = sportRunSectionHtml(workouts, buckets, buckets7, WINDOW_DAYS);
  const ridePanel = sportSection('ride', 'Bici', buckets, buckets7, true);
  const walkPanel = sportSection('walk', 'Caminar / hike', buckets, buckets7, true);
  const gymPanel = sportSection('gym', 'Gym / fuerza', buckets, buckets7, true);
  const swimPanel = sportSection('swim', 'Natación', buckets, buckets7, true);
  const otherPanel = sportSection('other', 'Otros', buckets, buckets7, true);

  el.innerHTML = `
    <div class="strava-pro-root min-w-0 max-w-full overflow-x-hidden xl:max-w-[1360px] xl:mx-auto">
      <div class="-mx-1 mb-3 flex min-w-0 gap-1.5 overflow-x-auto overflow-y-hidden pb-1 px-1 overscroll-x-contain touch-pan-x sm:mx-0 sm:flex-wrap sm:overflow-visible">
        ${tabButtons}
      </div>
      ${overviewPanel}
      ${runPanel}
      ${ridePanel}
      ${walkPanel}
      ${gymPanel}
      ${swimPanel}
      ${otherPanel}
    </div>`;

  const root = el.querySelector('.strava-pro-root');
  if (root) {
    const tabs = () => root.querySelectorAll('[data-strava-tab]');
    const panels = () => root.querySelectorAll('[data-strava-tab-panel]');
    const LANE_TITLE = {
      run: 'Running',
      ride: 'Ciclismo',
      walk: 'Caminar / hike',
      gym: 'Gym y fuerza',
      swim: 'Natación',
      other: 'Otros deportes',
    };
    const paint = (activeId) => {
      tabs().forEach((btn) => {
        const id = btn.getAttribute('data-strava-tab');
        const on = id === activeId;
        btn.classList.toggle('border-slate-900', on);
        btn.classList.toggle('bg-slate-900', on);
        btn.classList.toggle('text-white', on);
        btn.classList.toggle('shadow-md', on);
        btn.classList.toggle('border-slate-200', !on);
        btn.classList.toggle('bg-white', !on);
        btn.classList.toggle('text-slate-600', !on);
      });
      panels().forEach((p) => {
        const id = p.getAttribute('data-strava-tab-panel');
        p.classList.toggle('hidden', id !== activeId);
      });
      const page = document.getElementById('strava');
      if (page) page.dataset.stravaLane = activeId;
      const btxt = document.getElementById('strava-lane-banner-text');
      if (btxt) {
        if (activeId === 'overview') btxt.textContent = '';
        else {
          const arr = buckets[activeId] || [];
          btxt.textContent = `${LANE_TITLE[activeId] || activeId}: ${arr.length} actividad(es) en catálogo con esta clasificación. Las gráficas inferiores usan solo estas sesiones (7 días).`;
        }
      }
      if (typeof window.refreshStravaChartsOnly === 'function') window.refreshStravaChartsOnly();
    };
    tabs().forEach((btn) => {
      btn.addEventListener('click', () => paint(btn.getAttribute('data-strava-tab') || 'overview'));
    });
    root.addEventListener('click', (ev) => {
      const m = ev.target.closest('[data-strava-metric]');
      if (m && typeof window.openStravaMetricHelp === 'function') {
        ev.preventDefault();
        window.openStravaMetricHelp(m.getAttribute('data-strava-metric') || '');
      }
    });
    const runFilter = root.querySelector('#strava-run-list-filter');
    if (runFilter) {
      runFilter.addEventListener('input', () => {
        const q = String(runFilter.value || '')
          .trim()
          .toLowerCase();
        root.querySelectorAll('[data-strava-session-row]').forEach((row) => {
          const text = String(row.textContent || '').toLowerCase();
          row.classList.toggle('hidden', q.length > 0 && !text.includes(q));
        });
      });
    }
    paint(initialTab);
  }
}