import { strictStravaCategory } from './strava-sport-taxonomy.js';

/**
 * Sube solo hacia arriba maxRunKm / maxBikeKm / maxGymTime del perfil biológico
 * según el mejor valor visto en el catálogo Strava importado (por categoría estricta).
 * @param {object[]|null|undefined} workouts
 * @param {object|null|undefined} userBio
 * @returns {boolean} true si mutó userBio
 */
export function applyStravaCatalogToBioMaxes(workouts, userBio) {
  if (!userBio || !Array.isArray(workouts)) return false;
  let bestRun = 0;
  let bestBike = 0;
  let bestGym = 0;
  for (const w of workouts) {
    if (!w) continue;
    const cat = strictStravaCategory(w);
    const km = Number(w.distanceKm) || 0;
    const t = Number(w.timeMin) || 0;
    if (cat === 'run' && km > bestRun) bestRun = km;
    if (cat === 'ride' && km > bestBike) bestBike = km;
    if (cat === 'gym' && t > bestGym) bestGym = t;
  }
  let changed = false;
  const curR = Number(userBio.maxRunKm) || 0;
  const curB = Number(userBio.maxBikeKm) || 0;
  const curG = Number(userBio.maxGymTime) || 0;
  if (bestRun > curR + 0.009) {
    userBio.maxRunKm = Math.round(bestRun * 10) / 10;
    changed = true;
  }
  if (bestBike > curB + 0.009) {
    userBio.maxBikeKm = Math.round(bestBike * 10) / 10;
    changed = true;
  }
  if (bestGym > curG + 0.009) {
    userBio.maxGymTime = Math.round(bestGym * 10) / 10;
    changed = true;
  }
  return changed;
}
