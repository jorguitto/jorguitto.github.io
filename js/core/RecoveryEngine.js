/**
 * Señales orientativas de recuperación / carga a partir de sesiones Strava.
 * Solo considera la ventana de los últimos N días naturales (por defecto 7).
 * @param {object[]} workouts — orden típico: más reciente primero
 * @param {{ windowDays?: number }} [opts]
 */
export function recoverySignalsFromWorkouts(workouts, opts = {}) {
  const windowDays = Number(opts.windowDays) > 0 ? Number(opts.windowDays) : 7;
  const list = filterWorkoutsLastCalendarDays(Array.isArray(workouts) ? workouts : [], windowDays);
  if (!list.length) return { loadScore: 0, hints: [], windowDays, sessionsInWindow: 0 };

  let intense = 0;
  let minutes = 0;
  list.forEach((w) => {
    minutes += Number(w.timeMin) || 0;
    if (Number(w.intensity) >= 3 || (Number(w.averageHr) || 0) >= 155) intense += 1;
  });

  const hints = [];
  if (intense >= 4) {
    hints.push(
      `En los últimos ${windowDays} días hay ${intense} sesiones duras: prioriza sueño y 48–72 h con volumen suave antes de otra palanca (orientativo).`
    );
  } else if (intense >= 3) {
    hints.push('Tres o más tirones fuertes en la ventana semanal: revisa si el siguiente bloque puede ser técnico o aeróbico suave (orientativo).');
  }
  if (minutes > 400 && intense >= 2) {
    hints.push('Muchos minutos acumulados con varias sesiones exigentes: hidrata bien y vigila articulaciones (orientativo).');
  }
  if (intense === 0 && minutes > 120) {
    hints.push('Buen volumen con intensidad moderada: base coherente para subir calidad cuando toque (orientativo).');
  }
  if (intense === 0 && minutes > 0 && minutes <= 90) {
    hints.push('Volumen moderado en la semana: buen momento para técnica, fuerza o una progresión corta si duermes bien (orientativo).');
  }

  const loadScore = Math.min(100, Math.round(minutes / 8 + intense * 10));
  return { loadScore, hints, windowDays, sessionsInWindow: list.length };
}

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
