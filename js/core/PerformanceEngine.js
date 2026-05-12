/**
 * Tendencias deportivas simples (no predicción médica).
 * Compara sesiones recientes vs anteriores solo dentro de la ventana de N días.
 * @param {object[]} workouts — típicamente más reciente primero
 * @param {{ windowDays?: number }} [opts]
 */
export function performanceTrendHints(workouts, opts = {}) {
  const windowDays = Number(opts.windowDays) > 0 ? Number(opts.windowDays) : 7;
  const raw = Array.isArray(workouts) ? workouts : [];
  const inWin = filterWorkoutsLastCalendarDays(raw, windowDays);
  const runs = inWin
    .filter((w) => isRunActivity(w) && (Number(w.avgPaceMinKm) || 0) > 0)
    .sort((a, b) => String(b.startDateLocal || b.startDate).localeCompare(String(a.startDateLocal || a.startDate)));

  if (runs.length < 3) return [];

  const hints = [];
  const recent = runs.slice(0, 2);
  const older = runs.slice(-2);
  const paceRecent = avg(recent.map((x) => Number(x.avgPaceMinKm) || 0));
  const paceOlder = avg(older.map((x) => Number(x.avgPaceMinKm) || 0));
  const hrRecent = avg(recent.map((x) => Number(x.averageHr) || 0));
  const hrOlder = avg(older.map((x) => Number(x.averageHr) || 0));

  if (paceRecent > 0 && paceOlder > 0 && paceRecent < paceOlder * 0.97 && hrRecent > 0 && hrOlder > 0 && hrRecent < hrOlder * 0.96) {
    hints.push(
      `Running (${windowDays} d): ritmo algo más vivo con FC algo menor en las últimas salidas — posible adaptación aeróbica (orientativo).`
    );
  } else if (paceRecent > 0 && paceOlder > 0 && paceRecent > paceOlder * 1.03) {
    hints.push(
      `Running (${windowDays} d): ritmo más relajado que al inicio de la ventana — puede ser fatiga, calor o bloque fácil (orientativo).`
    );
  }

  const rides = inWin
    .filter((w) => isRideActivity(w))
    .sort((a, b) => String(b.startDateLocal || b.startDate).localeCompare(String(a.startDateLocal || a.startDate)));
  if (rides.length >= 3) {
    const kmRecent = sum(rides.slice(0, 2).map((x) => Number(x.distanceKm) || 0));
    const kmOlder = sum(rides.slice(-2).map((x) => Number(x.distanceKm) || 0));
    if (kmOlder > 5 && kmRecent > kmOlder * 1.2) {
      hints.push(`Bici (${windowDays} d): sube el volumen en km en las salidas recientes — vigila recuperación entre rodajes largos (orientativo).`);
    }
  }

  return hints;
}

function sum(arr) {
  return arr.reduce((a, x) => a + x, 0);
}

function avg(arr) {
  const v = arr.filter((x) => x > 0);
  if (!v.length) return 0;
  return v.reduce((a, x) => a + x, 0) / v.length;
}

import { isRunActivity, isRideActivity } from './strava-sport-taxonomy.js';

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseWorkoutLocalDate(w) {
  const s = String(w.startDateLocal || w.startDate || '').trim();
  if (!s) return null;
  const iso = s.length <= 10 ? `${s}T12:00:00` : s;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function filterWorkoutsLastCalendarDays(workouts, numDays) {
  const end = startOfLocalDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - (numDays - 1));
  return workouts.filter((w) => {
    const d = parseWorkoutLocalDate(w);
    if (!d) return false;
    const day = startOfLocalDay(d);
    return day >= start && day <= end;
  });
}
