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
import { recoverySignalsFromWorkouts } from './core/RecoveryEngine.js';
import { performanceTrendHints } from './core/PerformanceEngine.js';

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
  unmountStravaCharts,
  recoverySignalsFromWorkouts,
  performanceTrendHints,
};

window.dispatchEvent(new CustomEvent('fittracker-modules-ready'));
