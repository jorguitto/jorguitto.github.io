/**
 * Informe deportivo detallado (orientativo, no sustituye valoración médica ni entrenador presencial).
 * Entrada: objetos estilo toGymWorkout (timeMin, kcal, distanceKm, averageHr, maxHr, intensity, uiKind, startDateLocal, elevationGain, sufferScore).
 */

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function dayKey(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function groupByDay(list) {
  const m = new Map();
  list.forEach((w) => {
    const k = dayKey(w.startDateLocal || w.startDate);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(w);
  });
  return m;
}

function sum(list, fn) {
  return list.reduce((a, w) => a + num(fn(w)), 0);
}

function mean(list, fn) {
  if (!list.length) return 0;
  return sum(list, fn) / list.length;
}

function stdDev(list, fn) {
  if (list.length < 2) return 0;
  const vals = list.map((w) => num(fn(w)));
  const mu = vals.reduce((a, v) => a + v, 0) / vals.length;
  const variance = vals.reduce((a, v) => a + (v - mu) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function filterSinceDays(workouts, days) {
  const cutoff = Date.now() - days * 86400000;
  return workouts.filter((w) => {
    const t = new Date(w.startDateLocal || w.startDate || 0).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function inferMaxHr(userBio) {
  const age = num(userBio && userBio.edad, 35);
  return Math.max(150, Math.min(210, Math.round(208 - 0.7 * age)));
}

function hrReservePct(hr, maxHr, restHr = 50) {
  if (!maxHr || hr <= 0) return 0;
  return Math.max(0, Math.min(1, (hr - restHr) / (maxHr - restHr)));
}

/**
 * @param {object[]} workouts
 * @param {object} [userBio]
 * @returns {{ headline: string, riskLevel: string, sections: object[], checklist: string[], metrics: object }}
 */
export function buildStravaCoachReport(workouts, userBio = {}) {
  const raw = Array.isArray(workouts) ? workouts.filter((w) => w && (w.activityId || w.name)) : [];
  const w = [...raw].sort((a, b) =>
    String(b.startDateLocal || b.startDate || '').localeCompare(String(a.startDateLocal || a.startDate || ''))
  );
  if (!w.length) {
    return {
      headline: 'Sin actividades importadas todavía.',
      riskLevel: 'low',
      sections: [],
      checklist: ['Importa desde Strava para generar tu informe de entrenador.'],
      metrics: {},
    };
  }

  const maxHr = inferMaxHr(userBio);
  const wRun = w.filter((x) => (x.uiKind || '').includes('run') || String(x.sportType || '').toLowerCase().includes('run'));
  const wRide = w.filter((x) => (x.uiKind || '').includes('ride') || String(x.sportType || '').toLowerCase().includes('ride'));
  const wSwim = w.filter((x) => (x.uiKind || '').includes('swim'));
  const wGym = w.filter((x) => (x.uiKind || '').includes('gym'));
  const wWalk = w.filter((x) => (x.uiKind || '').includes('walk'));

  let c7 = filterSinceDays(w, 7);
  let c28 = filterSinceDays(w, 28);
  if (c7.length < 2) c7 = w.slice(0, 14);
  if (c28.length < 4) c28 = w.slice(0, 45);

  const last7 = c7;
  const last28 = c28;

  const vol7 = sum(last7, (x) => x.timeMin);
  const vol28 = sum(last28, (x) => x.timeMin);
  const kcal7 = sum(last7, (x) => x.kcal);
  const km7 = sum(last7, (x) => x.distanceKm);
  const elev7 = sum(last7, (x) => x.elevationGain);

  const load7 = sum(last7, (x) => num(x.recoveryLoad, num(x.intensity) * 12 + num(x.timeMin) / 15));
  const load28 = sum(last28, (x) => num(x.recoveryLoad, num(x.intensity) * 12 + num(x.timeMin) / 15));
  const chronicDenom = Math.max(1, vol28 / 4);
  const acuteChronic = chronicDenom > 0 ? vol7 / chronicDenom : 0;

  const byDay = groupByDay(w.slice(0, 120));
  let hardStack = 0;
  let maxHardStack = 0;
  const daysArr = [...byDay.keys()].sort();
  daysArr.forEach((d) => {
    const dayWs = byDay.get(d) || [];
    const hard = dayWs.some((x) => num(x.intensity) >= 3 || num(x.averageHr) >= maxHr * 0.82 || num(x.sufferScore) >= 50);
    if (hard) {
      hardStack += 1;
      maxHardStack = Math.max(maxHardStack, hardStack);
    } else {
      hardStack = 0;
    }
  });

  const doubleDays = [];
  byDay.forEach((arr, d) => {
    if (arr.length >= 2) doubleDays.push({ d, n: arr.length, kcal: sum(arr, (x) => x.kcal), min: sum(arr, (x) => x.timeMin) });
  });
  doubleDays.sort((a, b) => b.kcal - a.kcal);

  const hrList = last28.filter((x) => num(x.averageHr) > 40);
  const avgHr = mean(hrList, (x) => x.averageHr);
  const hrHi = hrList.filter((x) => hrReservePct(num(x.averageHr), maxHr) >= 0.78).length;

  const paceRun = wRun.filter((x) => num(x.avgPaceMinKm) > 2 && num(x.avgPaceMinKm) < 25);
  const paceDrift =
    paceRun.length >= 4
      ? mean(paceRun.slice(0, 2), (x) => x.avgPaceMinKm) - mean(paceRun.slice(-2), (x) => x.avgPaceMinKm)
      : 0;

  const monotony = vol7 > 0 && last7.length > 1 ? vol7 / (stdDev(last7, (x) => x.timeMin) + 5) : 0;

  const maxRunGoal = num(userBio && userBio.maxRunKm, 0);
  const maxBikeGoal = num(userBio && userBio.maxBikeKm, 0);
  const weekRunKm = sum(last7.filter((x) => wRun.includes(x)), (x) => x.distanceKm);
  const weekBikeKm = sum(last7.filter((x) => wRide.includes(x)), (x) => x.distanceKm);

  let riskLevel = 'low';
  if (acuteChronic > 1.35 || maxHardStack >= 3 || monotony > 10) riskLevel = 'high';
  else if (acuteChronic > 1.15 || maxHardStack >= 2 || monotony > 7) riskLevel = 'med';

  const headline =
    riskLevel === 'high'
      ? 'Patrón de carga elevado: prioriza recuperación activa y sueño las próximas 48–72 h.'
      : riskLevel === 'med'
        ? 'Carga moderada-alta: buen momento para afinar calidad sin sumar más volumen bruto.'
        : 'Carga controlada: puedes planificar 1–2 estímulos de calidad si el descanso ha sido correcto.';

  const sections = [];

  sections.push({
    title: 'Resumen cuantitativo (actividades importadas)',
    bullets: [
      `Sesiones en memoria: ${w.length} (orden de la más reciente a la más antigua).`,
      `Últimos 7 días calendario: ${Math.round(vol7)} min · ${Math.round(kcal7)} kcal · ${km7.toFixed(1)} km.`,
      `Desnivel en esos 7 días: ${Math.round(elev7)} m (impacto muscular y demanda metabólica).`,
    ],
  });

  sections.push({
    title: 'Distribución por disciplina',
    bullets: [
      `Running: ${wRun.length} sesiones · ${sum(wRun, (x) => x.distanceKm).toFixed(1)} km · ${Math.round(sum(wRun, (x) => x.timeMin))} min.`,
      `Ciclismo: ${wRide.length} sesiones · ${sum(wRide, (x) => x.distanceKm).toFixed(1)} km · ${Math.round(sum(wRide, (x) => x.timeMin))} min.`,
      `Natación: ${wSwim.length} sesiones · ${Math.round(sum(wSwim, (x) => x.timeMin))} min.`,
      `Gimnasio / fuerza o genérico: ${wGym.length} sesiones.`,
      `Caminata / senderismo: ${wWalk.length} sesiones.`,
    ],
  });

  const acwrTxt =
    acuteChronic > 1.4
      ? 'Ratio volumen reciente vs base: alto. Riesgo de sobrereaching si se mantiene varias semanas.'
      : acuteChronic > 1.15
        ? 'Ratio moderado: progresión aceptable si la sensación subjetiva y el sueño acompañan.'
        : 'Ratio conservador: margen para estímulos puntuales si buscas rendimiento.';

  sections.push({
    title: 'Gestión de carga (sencilla, tipo ACWR aproximado)',
    bullets: [
      `Carga aguda (min en últimos 7 días) vs crónica (promedio semanal a partir de 28 días): ratio ${acuteChronic.toFixed(2)} (orientativo; no sustituye un ACWR clínico).`,
      acwrTxt,
      `Monotonía aproximada (uniformidad del volumen entre sesiones de la última semana): ${monotony.toFixed(1)} — valores altos sugieren poca variación y más riesgo de fatiga monótona.`,
    ],
  });

  if (doubleDays.length) {
    const top = doubleDays.slice(0, 5);
    sections.push({
      title: 'Días con doble sesión o más',
      bullets: [
        `Detectados ${doubleDays.length} día(s) con 2+ actividades — vigila recuperación e hidratación.`,
        ...top.map((x) => `${x.d}: ${x.n} sesiones · ~${Math.round(x.min)} min · ~${Math.round(x.kcal)} kcal.`),
      ],
    });
  }

  if (hrList.length) {
    sections.push({
      title: 'Frecuencia cardíaca media',
      bullets: [
        `FC media en sesiones con dato: ${avgHr.toFixed(0)} lpm (referencia máx. estimada ${maxHr} lpm por edad).`,
        `${hrHi} sesiones recientes con FC media ≥ ~78 % de reserva — útiles para detectar días muy exigentes.`,
      ],
    });
  }

  if (paceRun.length >= 4) {
    sections.push({
      title: 'Running — ritmo',
      bullets: [
        paceDrift > 0.25
          ? 'Tendencia: ritmo algo más lento en las carreras recientes vs un poco más atrás — puede ser fatiga, clima o menor exigencia del entreno.'
          : paceDrift < -0.2
            ? 'Tendencia: ritmo más rápido en lo reciente — vigila no acumular dureza sin recuperación.'
            : 'Ritmo relativamente estable entre sesiones recientes de carrera.',
      ],
    });
  }

  if (maxRunGoal > 0 || maxBikeGoal > 0) {
    const br = [];
    if (maxRunGoal > 0) br.push(`Últimos 7 días: ~${weekRunKm.toFixed(1)} km de carrera (perfil declarado: hasta ~${maxRunGoal} km/semana).`);
    if (maxBikeGoal > 0) br.push(`Últimos 7 días: ~${weekBikeKm.toFixed(1)} km de bici (perfil declarado: hasta ~${maxBikeGoal} km/semana).`);
    sections.push({ title: 'Comparativa con tu perfil (FitTracker)', bullets: br });
  }

  const checklist = [];
  checklist.push('Duración y calidad de sueño: si baja, reduce el segundo estímulo duro de la semana.');
  checklist.push('Hidratación y sodio en calor: sube agua 300–500 ml por hora de esfuerzo intenso en exterior.');
  checklist.push('Proteína post-esfuerzo: prioriza 25–40 g en las 2 h siguientes a sesiones duras o largas.');
  if (maxHardStack >= 2) checklist.push('Evita 3+ días seguidos al umbral; inserta rodaje suave o técnica.');
  if (wRide.length >= wRun.length * 2 && wRun.length < 2) checklist.push('Mucho volumen en bici y poco impacto en suelo: añade 1 carrera suave o refuerzo de cadena si tu objetivo es running.');
  if (riskLevel === 'high') checklist.push('Semana de descarga: baja 30–40 % volumen o mantén volumen pero baja toda la intensidad 1 semana.');

  return {
    headline,
    riskLevel,
    sections,
    checklist,
    metrics: {
      acuteChronic,
      monotony,
      vol7,
      kcal7,
      km7,
      maxHardStack,
      sessions: w.length,
    },
  };
}
