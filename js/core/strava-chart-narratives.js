/**
 * Textos interpretativos para gráficas de sesión (7 días), según deporte filtrado.
 * Sin datos inventados: solo patrones simples sobre el array recibido.
 */

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function avg(arr) {
  const v = arr.filter((x) => n(x) > 0);
  if (!v.length) return 0;
  return v.reduce((a, x) => a + n(x), 0) / v.length;
}

/**
 * @param {object[]} workouts — ya filtradas por deporte y ventana temporal, orden cronológico
 * @param {string|null} sportLane
 */
export function buildSessionChartNarratives(workouts, sportLane) {
  const empty = {
    pace: 'Sin sesiones en esta vista: importa o cambia de pestaña.',
    hr: '—',
    dist: '—',
    load: '—',
  };
  if (!Array.isArray(workouts) || !workouts.length) return empty;

  const paceVals = workouts.map((w) => n(w.avgPaceMinKm, 0)).filter((x) => x > 0);
  const hrVals = workouts.map((w) => n(w.averageHr, 0)).filter((x) => x > 0);
  const distVals = workouts.map((w) => n(w.distanceKm, 0)).filter((x) => x > 0);

  const paceFirst = paceVals[0];
  const paceLast = paceVals[paceVals.length - 1];
  const hrFirst = hrVals[0];
  const hrLast = hrVals[hrVals.length - 1];

  let pace = '';
  if (sportLane === 'run' || sportLane === 'walk') {
    if (paceVals.length >= 2) {
      if (paceLast < paceFirst * 0.98 && hrLast > 0 && hrFirst > 0 && hrLast < hrFirst * 0.98) {
        pace = 'Ritmo algo más vivo con FC algo menor al final del periodo: posible mejora aeróbica (orientativo).';
      } else if (paceLast > paceFirst * 1.02) {
        pace = 'Ritmo más relajado al final del periodo: fatiga, clima o bloque fácil (orientativo).';
      } else {
        pace = 'Ritmo estable en la ventana: buena señal de control o fase de mantenimiento (orientativo).';
      }
    } else {
      pace = 'Pocas sesiones con ritmo calculable: importa carreras con distancia y tiempo para ver tendencia.';
    }
  } else if (sportLane === 'ride') {
    pace = 'En bici el “ritmo min/km” es secundario: mira distancia y FC; si no hay potencia, usa sensación y FC como guía.';
  } else {
    pace = 'Este deporte no prioriza ritmo min/km: usa distancia, tiempo y FC si aplica.';
  }

  let hr = '';
  if (hrVals.length >= 2) {
    const a0 = avg(hrVals.slice(0, Math.ceil(hrVals.length / 2)));
    const a1 = avg(hrVals.slice(Math.floor(hrVals.length / 2)));
    if (a1 > a0 * 1.04) {
      hr = 'La FC media sube entre la primera y la segunda mitad del periodo: más estrés acumulado o más calor (orientativo).';
    } else if (a1 < a0 * 0.97) {
      hr = 'La FC media baja en la parte final del periodo: recuperación o sesiones más suaves (orientativo).';
    } else {
      hr = 'FC media estable: buen control de intensidad relativa en la ventana (orientativo).';
    }
  } else {
    hr = 'Pocas sesiones con FC registrada: activa FC en Strava o usa otro reloj para tendencias.';
  }

  const sumKm = distVals.reduce((a, x) => a + x, 0);
  let dist = '';
  if (distVals.length) {
    dist = `Volumen en ventana ≈ ${sumKm.toFixed(1)} km en ${distVals.length} sesión(es) con distancia.`;
    if (sportLane === 'ride' && sumKm > 120) {
      dist += ' Volumen alto en bici: vigila recuperación entre rodajes.';
    }
  } else {
    dist = 'Sin distancia registrada en estas sesiones (orientativo).';
  }

  let load = '';
  const times = workouts.map((w) => n(w.timeMin, 0));
  const hard = workouts.filter((w) => n(w.intensity, 1) >= 3 || n(w.averageHr, 0) >= 155).length;
  if (hard >= 3) {
    load = 'Varias sesiones duras en la ventana: alterna con días muy fáciles para absorber (orientativo).';
  } else if (hard === 0 && times.reduce((a, t) => a + t, 0) > 120) {
    load = 'Volumen con poca etiqueta “dura”: buena base si buscas constancia (orientativo).';
  } else {
    load = 'Distribución de carga mixta: revisa sueño y sensación antes de sumar otra palanca dura (orientativo).';
  }

  return { pace, hr, dist, load };
}
