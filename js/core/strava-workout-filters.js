/**
 * Capa única de filtrado Strava por deporte (lane).
 * Toda la UI y las gráficas deben usar estas funciones — sin duplicar lógica.
 */

import { strictStravaCategory } from './strava-sport-taxonomy.js';

/** @typedef {'overview'|'run'|'ride'|'walk'|'gym'|'swim'|'other'} StravaUiTab */

/**
 * @param {object[]} workouts
 * @param {StravaUiTab|string|null|undefined} tab
 * @returns {object[]}
 */
export function filterWorkoutsByStravaTab(workouts, tab) {
  const t = tab == null || tab === '' || tab === 'overview' ? 'overview' : String(tab);
  const arr = Array.isArray(workouts) ? workouts.filter((w) => w && w.activityId) : [];
  if (t === 'overview') return arr;
  return arr.filter((w) => strictStravaCategory(w) === t);
}

/**
 * @param {object[]} workouts
 * @param {StravaUiTab|string|null|undefined} tab
 */
export function countWorkoutsByStravaTab(workouts, tab) {
  return filterWorkoutsByStravaTab(workouts, tab).length;
}
