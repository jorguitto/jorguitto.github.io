/**
 * Expone APIs ES module al HTML legacy (proyecto(1).html) vía window.__FITTRACKER_MODULES__
 */
import { mergeSnapshotIntoInitial, buildDailySnapshot, validateDailySnapshot, DAILY_SNAPSHOT_SCHEMA_VERSION } from './core/dailySnapshot.js';
import { getSmartDefaultWeight } from './core/food-helpers.js';
import {
  writeLocalDailySnapshot,
  readLocalDailySnapshotRecord,
  clearLocalPendingFlag,
  saveDailySnapshotFirestore,
  loadDailySnapshotFirestore,
} from './services/daily-snapshot-persistence.js';
import { refreshStravaTokenIfNeeded, fetchStravaActivities } from './services/strava-service.js';
import { getActivityWeatherContext } from './services/weather-service.js';
import { mountStravaCharts, unmountStravaCharts } from './controllers/strava-controller.js';
import { mountStravaProPanel } from './controllers/strava-pro-panel.js';
import { buildStravaIntelligencePayload } from './core/StravaIntelligenceEngine.js';
import { recoverySignalsFromWorkouts } from './core/RecoveryEngine.js';
import { performanceTrendHints } from './core/PerformanceEngine.js';
import { formatStravaMetricHelpHtml, getStravaMetricHelp } from './core/strava-metric-glossary.js';
import { buildStravaSessionAnalysis } from './core/strava-session-analyst.js';
import { strictStravaCategory, bucketStravaWorkoutsByCategory } from './core/strava-sport-taxonomy.js';
import { filterWorkoutsByStravaTab } from './core/strava-workout-filters.js';

function analyzeStravaWorkoutForUi(workout, todayData) {
  const all = Array.isArray(todayData?.stravaSyncedWorkouts) ? todayData.stravaSyncedWorkouts : [];
  const cat = strictStravaCategory(workout);
  const peers = filterWorkoutsByStravaTab(all, cat).sort((a, b) =>
    String(b.startDateLocal || b.startDate || '').localeCompare(String(a.startDateLocal || a.startDate || ''))
  );
  return buildStravaSessionAnalysis(workout, peers);
}

export async function ensureStravaSessionForCurrentUser() {
  const auth = window.auth || (window.firebase && window.firebase.auth && window.firebase.auth());
  const db = window.db || (window.firebase && window.firebase.firestore && window.firebase.firestore());
  const uid = auth && auth.currentUser && auth.currentUser.uid;
  if (!db || !uid) return { ok: false, reason: 'no_auth' };
  try {
    const tokens = await refreshStravaTokenIfNeeded(db, uid);
    return { ok: !!(tokens && tokens.access_token), tokens };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

window.openStravaMetricHelp = function openStravaMetricHelp(metricId) {
  const id = String(metricId || '').toLowerCase().trim();
  const h = getStravaMetricHelp(id);
  if (!h) return;
  if (typeof window.Swal !== 'undefined' && window.Swal.fire) {
    window.Swal.fire({
      title: h.title,
      html: formatStravaMetricHelpHtml(id),
      width: 640,
      confirmButtonText: 'Entendido',
      customClass: { popup: 'rounded-2xl text-left' },
    });
  }
};

window.__FITTRACKER_MODULES__ = {
  DAILY_SNAPSHOT_SCHEMA_VERSION,
  mergeSnapshotIntoInitial,
  buildDailySnapshot,
  validateDailySnapshot,
  writeLocalDailySnapshot,
  readLocalDailySnapshotRecord,
  clearLocalPendingFlag,
  saveDailySnapshotFirestore,
  loadDailySnapshotFirestore,
  refreshStravaTokenIfNeeded,
  fetchStravaActivities,
  getActivityWeatherContext,
  getSmartDefaultWeight,
  mountStravaCharts,
  mountStravaProPanel,
  buildStravaIntelligencePayload,
  unmountStravaCharts,
  recoverySignalsFromWorkouts,
  performanceTrendHints,
  formatStravaMetricHelpHtml,
  getStravaMetricHelp,
  buildStravaSessionAnalysis,
  analyzeStravaWorkoutForUi,
  strictStravaCategory,
  bucketStravaWorkoutsByCategory,
  filterWorkoutsByStravaTab,
  ensureStravaSessionForCurrentUser,
};

window.dispatchEvent(new CustomEvent('fittracker-modules-ready'));
