/**
 * Señales orientativas de recuperación / carga a partir de sesiones Strava recientes.
 * @param {object[]} workouts — objetos con intensity, timeMin, averageHr, movingTimeSec
 */
export function recoverySignalsFromWorkouts(workouts) {
  const list = Array.isArray(workouts) ? workouts : [];
  if (!list.length) return { loadScore: 0, hints: [] };
  let intense = 0;
  let minutes = 0;
  list.slice(0, 7).forEach((w) => {
    minutes += Number(w.timeMin) || 0;
    if (Number(w.intensity) >= 3 || (Number(w.averageHr) || 0) >= 155) intense++;
  });
  const hints = [];
  if (intense >= 4) hints.push('Llevas varias sesiones seguidas con intensidad alta (orientativo). Valora días más suaves.');
  if (minutes > 400 && intense >= 2) hints.push('Volumen acumulado alto esta semana. Vigila sueño e hidratación.');
  if (intense === 0 && minutes > 120) hints.push('Buen volumen con intensidad moderada: base sólida para progresar.');
  return { loadScore: Math.min(100, Math.round(minutes / 6 + intense * 12)), hints };
}
