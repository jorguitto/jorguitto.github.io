/**
 * Motor orientativo de “entrenador digital” a partir de sesiones Strava normalizadas.
 * Fatiga, carga y narrativa principal usan solo los últimos 7 días naturales (local).
 * No es consejo médico ni clínico; solo patrones heurísticos para motivación y hábitos.
 */

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/** Últimos N días de calendario (incluye hoy), zona horaria del dispositivo. */
export function filterStravaWorkoutsLastCalendarDays(workouts, numDays = 7) {
  const arr = Array.isArray(workouts) ? workouts : [];
  const nDays = Math.max(1, Math.min(31, Number(numDays) || 7));
  const end = startOfLocalDay(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - (nDays - 1));
  return arr.filter((w) => {
    const d = parseWorkoutLocalDate(w);
    if (!d) return false;
    const day = startOfLocalDay(d);
    return day >= start && day <= end;
  });
}

function localDayKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function workoutLocalDayKey(w) {
  const d = parseWorkoutLocalDate(w);
  return d ? localDayKeyFromDate(d) : '';
}

export { bucketStravaWorkoutsByCategory, strictStravaCategory as bucketStravaWorkoutUiCategory } from './strava-sport-taxonomy.js';

/** Carga interna heurística (0–100 por sesión): duración × intensidad × factor FC. */
export function sessionLoadScore(w) {
  const min = n(w.timeMin, n(w.movingTimeSec, 0) / 60);
  const int = Math.max(1, Math.min(3, n(w.intensity, 2)));
  const hr = n(w.averageHr, 0);
  const hrBoost = hr > 0 ? 1 + Math.min(0.5, (hr - 120) / 200) : 1;
  const raw = min * int * int * hrBoost * 0.35;
  return Math.min(100, Math.round(raw));
}

/** Índice 0–100 a partir de la suma de cargas en la ventana (orientativo semanal). */
function weeklyLoadIndexFromSum(loadSum) {
  const ref = 400;
  return Math.min(100, Math.round((loadSum / ref) * 100));
}

export function aggregateStravaSessions(workouts) {
  const list = Array.isArray(workouts) ? workouts.filter((x) => x && x.activityId) : [];
  const bySport = new Map();
  let totalKm = 0;
  let totalMin = 0;
  let totalKcal = 0;
  let totalElev = 0;
  let hrSum = 0;
  let hrN = 0;
  let loadSum = 0;

  list.forEach((w) => {
    const sport = String(w.sportType || w.typeLabel || 'Actividad').trim() || 'Actividad';
    const km = n(w.distanceKm, 0);
    const min = n(w.timeMin, 0);
    const kcal = n(w.kcal, 0);
    const el = n(w.elevationGain, 0);
    const hr = n(w.averageHr, 0);
    totalKm += km;
    totalMin += min;
    totalKcal += kcal;
    totalElev += el;
    if (hr > 0) {
      hrSum += hr;
      hrN += 1;
    }
    loadSum += sessionLoadScore(w);
    if (!bySport.has(sport)) {
      bySport.set(sport, { sport, count: 0, km: 0, min: 0, kcal: 0, load: 0 });
    }
    const row = bySport.get(sport);
    row.count += 1;
    row.km += km;
    row.min += min;
    row.kcal += kcal;
    row.load += sessionLoadScore(w);
  });

  return {
    list,
    count: list.length,
    totalKm,
    totalMin,
    totalKcal,
    totalElev,
    avgHr: hrN ? Math.round(hrSum / hrN) : 0,
    loadIndex: weeklyLoadIndexFromSum(loadSum),
    loadSumRaw: loadSum,
    bySport: Array.from(bySport.values()).sort((a, b) => b.km - a.km || b.min - a.min),
  };
}

function isHardSession(w) {
  return n(w.intensity, 1) >= 3 || n(w.averageHr, 0) >= 155;
}

/** Días naturales consecutivos desde hoy con al menos una sesión dura (máx 10). */
function consecutiveHardCalendarDaysFromToday(workouts) {
  const hardDays = new Set();
  (Array.isArray(workouts) ? workouts : []).forEach((w) => {
    const key = workoutLocalDayKey(w);
    if (!key) return;
    if (isHardSession(w)) hardDays.add(key);
  });
  let streak = 0;
  for (let i = 0; i < 10; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = localDayKeyFromDate(d);
    if (hardDays.has(k)) streak += 1;
    else break;
  }
  return streak;
}

function hardSessionCount(workouts) {
  return (Array.isArray(workouts) ? workouts : []).filter((w) => isHardSession(w)).length;
}

function trendPaceInWindow(workouts) {
  const withPace = (Array.isArray(workouts) ? workouts : [])
    .map((w) => ({ w, p: n(w.avgPaceMinKm, 0) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => String(b.w.startDateLocal || b.w.startDate).localeCompare(String(a.w.startDateLocal || a.w.startDate)))
    .slice(0, 8);
  if (withPace.length < 3) return 'neutral';
  const recent = withPace.slice(0, 2).reduce((a, x) => a + x.p, 0) / Math.min(2, withPace.length);
  const older = withPace.slice(-2).reduce((a, x) => a + x.p, 0) / 2;
  if (recent < older * 0.97) return 'faster';
  if (recent > older * 1.03) return 'slower';
  return 'neutral';
}

function hashStr(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickDailyMotivation(name, readinessKey, paceTrend, hardStreakDays, hardCount7) {
  const dayKey = localDayKeyFromDate(new Date());
  const tired = readinessKey === 'fatigue' || hardStreakDays >= 3 || hardCount7 >= 4;
  const fly = paceTrend === 'faster' && !tired;
  const poolKey = tired ? 'tired' : fly ? 'fly' : paceTrend === 'slower' ? 'steady' : 'base';
  const pools = {
    tired: [
      `${name}, el descanso es entrenamiento: sin él la semana siguiente siempre paga más cara.`,
      'Hoy gana quien recupera bien: sueño, comida y una salida suave valen más que otro tirón vacío.',
      'Tu sistema nervioso no miente: si notas pesadez, baja un marchamo y vuelve fuerte en 48–72 h.',
      'Un entrenador bueno te frenaría aquí. Eso es profesionalidad, no flojera.',
      'La constancia no es machacarse todos los días: es saber cuándo apretar y cuándo absorber.',
    ],
    fly: [
      `${name}, estás en una ventana donde el cuerpo responde: capitalízala sin volverte loco con el volumen.`,
      'Cuando ritmo y sensación van a la par, el trabajo es no romper la fórmula: progresión pequeña y constante.',
      'Buen momento para fijar un referente de calidad (series cortas, técnica, cadencia) y anotar sensaciones.',
      'Progresión visible: celebra el detalle (un km más limpio, menos coste subjetivo) además del crono.',
    ],
    steady: [
      `${name}, ritmo más relajado puede ser el mejor aliado: absorbe carga y vuelve a apretar cuando toque.`,
      'A veces el cuerpo pide “rodaje de lujo”: baja pulsaciones, disfruta el paisaje y sigue sumando volumen limpio.',
      'No todo es PR: semanas de sensación media son el cemento de las grandes semanas.',
    ],
    base: [
      `${name}, entrenar bien es aburrido a ratos: repetir lo correcto es lo que te separa del caos.`,
      'Hoy construyes el atleta del mes que viene: paciencia con el proceso.',
      'Micro hábitos (calentar bien, hidratarte, dormir) multiplican el valor de cada sesión.',
      'La app es tu cuaderno: úsala para honestidad, no para autojuicio con un solo número.',
    ],
  };
  const pool = pools[poolKey] || pools.base;
  const idx = hashStr(`${dayKey}|${name}|${poolKey}|${readinessKey}|${paceTrend}`) % pool.length;
  return pool[idx];
}

/**
 * @param {object[]} workouts — stravaSyncedWorkouts (catálogo importado)
 * @param {{ firstName?: string, stepsToday?: number, sleepHours?: number, windowDays?: number }} ctx
 */
export function buildStravaCoachPayload(workouts, ctx = {}) {
  const windowDays = Number(ctx.windowDays) > 0 ? Number(ctx.windowDays) : 7;
  const allList = Array.isArray(workouts) ? workouts.filter((x) => x && x.activityId) : [];
  const win = filterStravaWorkoutsLastCalendarDays(allList, windowDays);
  const rawName = (ctx.firstName && String(ctx.firstName).trim().split(/\s+/)[0]) || 'Atleta';
  const name = esc(rawName);
  const steps = n(ctx.stepsToday, 0);
  const sleep = n(ctx.sleepHours, 0);

  const aggLifetime = aggregateStravaSessions(allList);
  const agg = aggregateStravaSessions(win);

  const paceTrend = trendPaceInWindow(win);
  const hardStreakDays = consecutiveHardCalendarDaysFromToday(win);
  const hardCount7 = hardSessionCount(win);
  const lowVolume = agg.count > 0 && agg.totalMin < 90 && agg.count < 3;

  const bullets = [];
  const plan = [];
  const badges = [];

  if (allList.length === 0) {
    return {
      name,
      headline: 'Tu laboratorio de rendimiento está listo',
      subline: 'Importa actividades Strava para desbloquear métricas, tendencias y un plan orientativo.',
      bullets: [
        'Conecta Strava en Perfil Biológico si aún no lo has hecho.',
        'Cuando importes, el coach usará una ventana de 7 días para fatiga y carga; el catálogo completo queda abajo por deporte.',
      ],
      plan: ['Esta semana: 2–3 sesiones fáciles + 1 progresión suave si ya entrenas con regularidad (orientativo).'],
      motivation:
        'Cada sesión que registras es una señal a favor de tu constancia. El siguiente paso es solo importar tu último entreno.',
      badges: [{ label: 'Modo análisis', tone: 'slate' }],
      readiness: 'Sin datos',
      disclaimer:
        'Información orientativa para hábitos y entrenamiento recreativo. No sustituye valoración médica ni prescripción profesional.',
      agg,
      aggLifetime,
      windowDays,
      paceTrend,
      hardStreakDays,
      hardCount7,
    };
  }

  bullets.push(
    `Biblioteca importada: ${aggLifetime.count} sesiones (todo el tiempo). Análisis de fatiga y carga: últimos ${windowDays} días (${agg.count} sesiones en ventana).`
  );

  if (win.length === 0) {
    bullets.push(
      `En los últimos ${windowDays} días no hay sesiones importadas con fecha: el “readiness” refleja descanso o datos sin fecha. Sigue importando tras cada entreno.`
    );
  } else {
    bullets.push(
      `Ventana ${windowDays} días: ${agg.totalKm.toFixed(1)} km · ${Math.round(agg.totalMin)} min · ≈ ${Math.round(
        agg.totalKcal
      )} kcal · índice de carga heurística ${agg.loadIndex}/100 (orientativo).`
    );
  }

  if (agg.avgHr > 0 && win.length) {
    bullets.push(
      `FC media (ventana) ${agg.avgHr} lpm — referencia de esfuerzo, no diagnóstico (orientativo).`
    );
  }

  if (agg.totalElev > 200 && win.length) {
    bullets.push(
      `Desnivel en la ventana ${Math.round(
        agg.totalElev
      )} m — buen estímulo de fuerza específica si lo toleras bien (orientativo).`
    );
  }

  if (paceTrend === 'faster' && win.length >= 3) {
    bullets.push('En carrera/ritmo (ventana): tendencia a ritmos algo más vivos vs salidas anteriores (orientativo).');
    badges.push({ label: 'Progresión ritmo', tone: 'emerald' });
  } else if (paceTrend === 'slower' && win.length >= 3) {
    bullets.push(
      'En carrera/ritmo (ventana): ritmo algo más relajado que al inicio del periodo — fatiga, clima o bloque fácil (orientativo).'
    );
  }

  if (hardStreakDays >= 3) {
    bullets.push(
      `${hardStreakDays} días seguidos con al menos una sesión dura: prioriza 48–72 h suaves o técnicas antes de otra palanca (orientativo).`
    );
    badges.push({ label: 'Días duros seguidos', tone: 'amber' });
  } else if (hardCount7 >= 4) {
    bullets.push(
      `${hardCount7} sesiones duras en ${windowDays} días: densidad alta; alterna calidad con rodajes muy fáciles (orientativo).`
    );
    badges.push({ label: 'Densidad alta', tone: 'amber' });
  }

  if (lowVolume && win.length) {
    bullets.push(
      'Volumen moderado-bajo en la ventana: ideal para base o transición; si buscas PR, sube volumen gradualmente (orientativo).'
    );
  }

  if (steps > 0 && steps < 5000) {
    bullets.push(
      `Pasos hoy ${steps} — si no hubo carrera larga, sube NEAT (paseos cortos) para recuperación activa (orientativo).`
    );
  } else if (steps >= 12000) {
    bullets.push(
      `Pasos hoy ${steps} — buen movimiento general; hidrata y vigila carga si además entrenas duro (orientativo).`
    );
  }

  if (sleep > 0 && sleep < 6.5) {
    bullets.push(
      `Sueño reportado ${sleep}h — prioriza dormir más antes de apretar intensidad; el rendimiento escala con el descanso (orientativo).`
    );
    badges.push({ label: 'Prioridad sueño', tone: 'violet' });
  }

  const wxHot = win.filter((w) => w.weatherContext && w.weatherContext.flags && w.weatherContext.flags.heat).length;
  if (wxHot > 0) {
    bullets.push(
      `${wxHot} sesión(es) con calor en la ventana: hidrata más y considera electrolitos en salidas largas (orientativo).`
    );
  }

  plan.push(
    'Hoy / mañana: calentamiento progresivo + bloque principal al 70–80% de sensación si vienes de días duros en la ventana (orientativo).'
  );
  plan.push('Semana: alterna 2 toques de calidad + 2 días de volumen muy suave + 1 día técnico o movilidad (orientativo).');
  plan.push('Progresión: sube ~5–8% de volumen semanal solo si duermes bien y no acumulas dolor articular (orientativo).');

  let readinessKey = 'stable';
  let readiness = 'Estable';
  if (!win.length) {
    readiness = 'Sin datos recientes';
    readinessKey = 'empty';
  } else if (hardStreakDays >= 3 || (sleep > 0 && sleep < 6) || (hardCount7 >= 4 && agg.loadIndex >= 62)) {
    readiness = 'Fatiga probable';
    readinessKey = 'fatigue';
  } else if (agg.loadIndex >= 72) {
    readiness = 'Carga elevada';
    readinessKey = 'load';
  } else if (agg.loadIndex <= 28 && agg.count >= 2) {
    readiness = 'Base / absorción';
    readinessKey = 'base';
  }

  const motivation = pickDailyMotivation(rawName, readinessKey, paceTrend, hardStreakDays, hardCount7);

  let headline = 'Panel de rendimiento personal';
  if (!win.length) headline = 'Sin Strava en la ventana de 7 días';
  else if (paceTrend === 'faster' && hardStreakDays < 3) headline = 'Buen ritmo de progresión';
  else if (hardStreakDays >= 3 || (readinessKey === 'fatigue' && hardCount7 >= 4)) headline = 'Prioriza recuperación inteligente';
  else if (lowVolume) headline = 'Semana de construcción';

  const subline = `Todo el análisis de fatiga y carga usa los últimos ${windowDays} días naturales; la biblioteca completa sigue disponible por deporte abajo.`;

  return {
    name,
    headline,
    subline,
    bullets,
    plan,
    motivation,
    badges: badges.length ? badges : [{ label: 'Análisis activo', tone: 'blue' }],
    readiness,
    readinessKey,
    disclaimer:
      'Recomendaciones heurísticas basadas en datos importados y en tu día en la app. No son diagnóstico médico ni nutrición clínica.',
    agg,
    aggLifetime,
    windowDays,
    paceTrend,
    hardStreakDays,
    hardCount7,
  };
}
