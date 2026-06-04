/**
 * Estimaciones orientativas por categoría Strava (no diagnóstico médico).
 * Combina sesiones importadas con edad/peso del perfil para VO2 aproximado y % frente a un techo teórico por edad.
 */

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function ageFromBio(bio) {
  const a = n(bio?.edad, 0);
  if (a > 10 && a < 100) return a;
  return 35;
}

function maxHrFromBio(bio, age) {
  const m = n(bio?.maxHr ?? bio?.fcMax ?? bio?.fcmax, 0);
  if (m > 120 && m < 230) return m;
  return Math.max(140, Math.round(220 - age));
}

/** ACSM aproximado: VO2 ml/kg/min en carrera llana a velocidad constante (pace min/km). */
function vo2FromRunPaceMinKm(paceMinKm) {
  if (!(paceMinKm > 3) || !(paceMinKm < 25)) return null;
  const mPerMin = 1000 / paceMinKm;
  const vo2 = 0.2 * mPerMin + 3.5;
  if (vo2 < 20 || vo2 > 85) return null;
  return Math.round(vo2 * 10) / 10;
}

/** Techo teórico “élite por edad” muy simplificado (orientativo, no tabla clínica). */
function theoreticalVo2Ceiling(age) {
  const base = 92 - Math.max(0, age - 22) * 0.65;
  return Math.max(48, Math.min(95, base));
}

function median(arr) {
  const a = arr.filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function sumKm(ws) {
  return ws.reduce((a, w) => a + n(w.distanceKm, 0), 0);
}

/**
 * @param {string} lane — run | ride | walk | gym | swim | other
 * @param {object[]} laneWorkouts — catálogo de esa pestaña (orden cualquiera)
 * @param {object} userBio
 * @returns {null | { vo2Text: string, pctText: string, pctNum: number, bullets: string[] }}
 */
export function computeLaneFitnessSnapshot(lane, laneWorkouts, userBio) {
  const bio = userBio && typeof userBio === 'object' ? userBio : {};
  const age = ageFromBio(bio);
  const weight = n(bio.peso, 70) || 70;
  const maxHr = maxHrFromBio(bio, age);
  const arr = Array.isArray(laneWorkouts) ? laneWorkouts.filter((w) => w && w.activityId) : [];
  if (!arr.length) return null;

  const recent = arr.slice(0, 24);
  const kmRecent = sumKm(recent);
  const paces = recent.map((w) => n(w.avgPaceMinKm, 0)).filter((p) => p > 3.5 && p < 22);
  const hrs = recent.map((w) => n(w.averageHr, 0)).filter((h) => h > 80 && h < 210);
  const medPace = median(paces);
  const medHr = median(hrs);

  const ceiling = theoreticalVo2Ceiling(age);
  const bullets = [];

  let vo2Est = null;
  let labelSport = 'actividad';

  if (lane === 'run' || lane === 'walk') {
    labelSport = lane === 'run' ? 'running' : 'caminata';
    if (medPace > 0) vo2Est = vo2FromRunPaceMinKm(medPace);
    if (vo2Est) bullets.push(`Ritmo medio reciente ~${medPace.toFixed(1)} min/km → VO2 estimado ~${vo2Est} ml/kg/min (fórmula metabolica simplificada).`);
    else bullets.push('Pocas sesiones con ritmo y distancia fiables para estimar VO2; sigue registrando con GPS/reloj.');
  } else if (lane === 'ride') {
    labelSport = 'ciclismo';
    const speeds = recent
      .map((w) => {
        const km = n(w.distanceKm, 0);
        const min = n(w.timeMin, 0);
        if (km > 1 && min > 5) return km / (min / 60);
        return 0;
      })
      .filter((s) => s > 8 && s < 55);
    const v = median(speeds);
    if (v > 0) {
      const met = 2 + 0.15 * v;
      vo2Est = Math.round((3.5 * met) * 10) / 10;
      bullets.push(`Velocidad media reciente ~${v.toFixed(1)} km/h → MET ~${met.toFixed(1)} → VO2 aproximado ~${vo2Est} ml/kg/min (muy orientativo en bici).`);
    } else bullets.push('En bici hace falta distancia + tiempo en varias salidas para estimar mejor el gasto aeróbico.');
  } else if (lane === 'swim') {
    labelSport = 'natación';
    if (medPace > 0) vo2Est = vo2FromRunPaceMinKm(medPace * 1.08);
    if (vo2Est) bullets.push(`Ritmo medio (min/km acuático) ajustado → VO2 aproximado ~${vo2Est} ml/kg/min (natación es aún más aproximado).`);
    else bullets.push('Importa sesiones con tiempo y distancia para afinar la estimación en natación.');
  } else if (lane === 'gym') {
    labelSport = 'gym';
    const mins = recent.map((w) => n(w.timeMin, 0)).filter((m) => m > 5);
    const t = median(mins);
    if (t > 0 && medHr > 0) {
      const hrr = Math.min(1, Math.max(0, (medHr - 90) / (maxHr - 90)));
      vo2Est = Math.round((14 + hrr * 32) * 10) / 10;
      bullets.push(`Sesiones ~${Math.round(t)} min con FC media ~${Math.round(medHr)} lpm → VO2 de esfuerzo aproximado ~${vo2Est} ml/kg/min (no es VO2 máx de laboratorio).`);
    } else bullets.push('Activa FC en Strava o añade duración para estimar mejor el esfuerzo en fuerza.');
  } else {
    labelSport = 'esta categoría';
    if (medPace > 0) vo2Est = vo2FromRunPaceMinKm(medPace);
    if (vo2Est) bullets.push(`VO2 aproximado ~${vo2Est} ml/kg/min según ritmo/distancia donde aplique.`);
    else bullets.push('Mezcla de tipos: la estimación es menos precisa; prioriza deportes homogéneos.');
  }

  if (kmRecent > 0) bullets.push(`Volumen reciente (~${kmRecent.toFixed(0)} km en últimas ${recent.length} sesiones con distancia): contexto de carga.`);
  if (medHr > 0 && maxHr > 0) {
    const pctHr = Math.round((medHr / maxHr) * 100);
    bullets.push(`FC media ~${Math.round(medHr)} lpm vs FC máx estimada ${maxHr} lpm (${pctHr}% reserva aprox.).`);
  }
  bullets.push(`Perfil: ${Math.round(age)} años, ~${Math.round(weight)} kg. Techo teórico usado para el %: VO2 ~${ceiling} ml/kg/min (referencia “muy alto” para la edad, no límite absoluto).`);

  let pctNum = 55;
  if (vo2Est && ceiling > 0) {
    pctNum = Math.round(Math.min(100, (vo2Est / ceiling) * 100));
  } else {
    const sessionsPerWeek = (arr.length / Math.max(4, arr.length > 8 ? 4 : 2)) * 0.5 + kmRecent * 2;
    pctNum = Math.min(95, Math.round(35 + Math.min(40, sessionsPerWeek)));
  }

  const vo2Text = vo2Est ? `~${vo2Est} ml/kg/min` : '— (datos insuficientes)';
  const pctText = `${pctNum}%`;

  return {
    vo2Text,
    pctText,
    pctNum,
    labelSport,
    ceiling,
    bullets,
  };
}
