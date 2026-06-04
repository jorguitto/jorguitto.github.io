/**
 * Snapshots diarios: validación y fusión con INITIAL_STATE (lógica pura, sin Firebase ni DOM).
 */

export const DAILY_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Construye el objeto serializable del snapshot (sin efectos secundarios).
 * @param {{ dateKey: string, todayData: object, currentGoals?: object|null, cli?: object|null, ui?: object }} params
 */
export function buildDailySnapshot({ dateKey, todayData, currentGoals = null, cli = null, ui = null }) {
  return {
    schemaVersion: DAILY_SNAPSHOT_SCHEMA_VERSION,
    dateKey: String(dateKey || ''),
    savedAt: new Date().toISOString(),
    todayData: todayData ? JSON.parse(JSON.stringify(todayData)) : {},
    currentGoals: currentGoals ? JSON.parse(JSON.stringify(currentGoals)) : null,
    cli: cli ? JSON.parse(JSON.stringify(cli)) : null,
    ui: ui ? JSON.parse(JSON.stringify(ui)) : null,
  };
}

export function validateDailySnapshot(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'empty' };
  if (Number(raw.schemaVersion) !== DAILY_SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, error: 'version' };
  }
  if (!raw.dateKey || typeof raw.todayData !== 'object') return { ok: false, error: 'shape' };
  return { ok: true, data: raw };
}

/**
 * Fusiona datos del día guardados sobre INITIAL_STATE y normaliza arrays/campos habituales.
 * @param {object} todayDataFromSnapshot
 * @param {object} initialState
 */
export function mergeSnapshotIntoInitial(todayDataFromSnapshot, initialState) {
  const base = JSON.parse(JSON.stringify(initialState || {}));
  const td = todayDataFromSnapshot && typeof todayDataFromSnapshot === 'object' ? todayDataFromSnapshot : {};
  const out = { ...base, ...td };
  if (!Array.isArray(out.studySessions)) out.studySessions = [];
  if (!Array.isArray(out.foodLog)) out.foodLog = [];
  if (!Array.isArray(out.gymSessions)) out.gymSessions = [];
  if (!Array.isArray(out.stravaSyncedWorkouts)) out.stravaSyncedWorkouts = [];
  if (!Array.isArray(out.stravaTodayActivityIds)) out.stravaTodayActivityIds = [];
  return out;
}
