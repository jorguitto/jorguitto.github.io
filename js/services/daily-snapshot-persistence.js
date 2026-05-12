/**
 * Persistencia de snapshots diarios: localStorage por uid + Firestore opcional.
 */

import { validateDailySnapshot, DAILY_SNAPSHOT_SCHEMA_VERSION } from '../core/dailySnapshot.js';

export function localPendingKey(uid, dateKey) {
  return `fittracker:v${DAILY_SNAPSHOT_SCHEMA_VERSION}:daily_pending:${uid}:${dateKey}`;
}

export function localSnapshotCacheKey(uid, dateKey) {
  return `fittracker:v${DAILY_SNAPSHOT_SCHEMA_VERSION}:daily_cache:${uid}:${dateKey}`;
}

/**
 * Marca snapshot pendiente (sync aún no confirmada) o resuelto (pending false).
 */
export function writeLocalDailySnapshot(uid, dateKey, snapshot, pending) {
  const key = localPendingKey(uid, dateKey);
  const payload = JSON.stringify({ ...snapshot, pending: !!pending });
  try {
    window.localStorage.setItem(key, payload);
    window.localStorage.setItem(localSnapshotCacheKey(uid, dateKey), JSON.stringify(snapshot));
  } catch (e) {
    console.warn('writeLocalDailySnapshot:', e);
  }
}

export function readLocalDailySnapshotRecord(uid, dateKey) {
  try {
    const raw = window.localStorage.getItem(localPendingKey(uid, dateKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function clearLocalPendingFlag(uid, dateKey) {
  try {
    const raw = window.localStorage.getItem(localPendingKey(uid, dateKey));
    if (!raw) return;
    const o = JSON.parse(raw);
    o.pending = false;
    window.localStorage.setItem(localPendingKey(uid, dateKey), JSON.stringify(o));
  } catch (_) {}
}

/**
 * Guarda snapshot en Firestore: usuarios/{uid}/daily_snapshots/{dateKey}
 */
export async function saveDailySnapshotFirestore(db, uid, dateKey, snapshot) {
  if (!db || !uid || !dateKey || !snapshot) return;
  const fv = window.firebase?.firestore?.FieldValue;
  const ref = db.collection('usuarios').doc(uid).collection('daily_snapshots').doc(dateKey);
  await ref.set(
    {
      ...snapshot,
      updatedAt: fv ? fv.serverTimestamp() : new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * Carga snapshot desde Firestore (si existe).
 */
export async function loadDailySnapshotFirestore(db, uid, dateKey) {
  if (!db || !uid || !dateKey) return null;
  const snap = await db.collection('usuarios').doc(uid).collection('daily_snapshots').doc(dateKey).get();
  if (!snap.exists) return null;
  const d = snap.data();
  return validateDailySnapshot(d).ok ? d : null;
}
