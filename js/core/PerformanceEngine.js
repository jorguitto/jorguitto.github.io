/**
 * Tendencias deportivas simples (no predicción médica).
 * @param {object[]} workouts — ordenados de más reciente a más antiguo
 */
export function performanceTrendHints(workouts) {
  const w = Array.isArray(workouts) ? workouts.slice(0, 12) : [];
  if (w.length < 3) return [];
  const hints = [];
  const last = w[0];
  const prev = w[w.length - 1];
  const paceLast = Number(last.avgPaceMinKm) || 0;
  const pacePrev = Number(prev.avgPaceMinKm) || 0;
  const hrLast = Number(last.averageHr) || 0;
  const hrPrev = Number(prev.averageHr) || 0;
  if (paceLast > 0 && pacePrev > 0 && paceLast < pacePrev * 0.97 && hrLast > 0 && hrPrev > 0 && hrLast < hrPrev * 0.96) {
    hints.push('Tu ritmo mejora mientras reduces pulsaciones: posible mejora cardiovascular (orientativo).');
  }
  if (paceLast > 0 && pacePrev > 0 && paceLast > pacePrev * 1.03) {
    hints.push('El ritmo se ha relajado respecto a sesiones anteriores: puede ser fatiga o menor exigencia.');
  }
  return hints;
}
