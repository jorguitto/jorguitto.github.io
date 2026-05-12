/**
 * Punto de extensión Firestore / persistencia compartida (reexporta snapshots diarios).
 */
export {
  saveDailySnapshotFirestore,
  loadDailySnapshotFirestore,
  writeLocalDailySnapshot,
  readLocalDailySnapshotRecord,
} from './daily-snapshot-persistence.js';
