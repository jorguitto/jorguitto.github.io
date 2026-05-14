/**
 * Resume datos del tracker para prompts de IA (tamaño acotado).
 * No incluye secretos; orientado a análisis deportivo general.
 */

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

/**
 * @param {{ todayData?: object, USER_BIO?: object|null, history?: object[] }} ctx
 */
export function buildAiCoachContextSummary(ctx) {
  const bio = ctx.USER_BIO || {};
  const td = ctx.todayData || {};
  const hist = Array.isArray(ctx.history) ? ctx.history.slice(0, 14) : [];
  const strava = Array.isArray(td.stravaSyncedWorkouts) ? td.stravaSyncedWorkouts : [];
  const sStrava = strava.slice(0, 40).map((w) => ({
    id: w.activityId,
    name: w.name,
    type: w.sportType || w.typeLabel,
    km: n(w.distanceKm),
    min: n(w.timeMin),
    date: (w.startDateLocal || w.startDate || '').slice(0, 10),
    hr: n(w.averageHr),
    pace: n(w.avgPaceMinKm),
  }));
  return {
    perfil: {
      edad: bio.edad,
      peso: bio.peso,
      objetivo: bio.goal,
      nivelActividad: bio.activityLevel,
    },
    hoy: {
      fecha: td.dateKey || null,
      pasos: n(td.steps),
      sueñoH: n(td.sleepHours),
      runKm: n(td.runKm),
      bikeKm: n(td.bikeKm),
      hidratacionMl: n(td.waterConsumed),
    },
    stravaResumen: {
      sesionesEnCatalogoHoy: strava.length,
      muestra: sStrava,
    },
    historialCorto: hist.map((h) => ({
      fecha: h.dateKey || h.fecha,
      stress: h.stressScores || null,
    })),
  };
}
