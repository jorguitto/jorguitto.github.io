/**
 * Fase 3 (sincronización) + Fase 4 (cálculos y ajuste de objetivos).
 *
 * - sincronizarStrava() se dispara al entrar al Dashboard (navigateTo('inicio')) y también en load.
 * - Lee access_token en Firestore (usuarios/{uid}.stravaTokens).
 * - Trae la última actividad del atleta.
 * - Evita reprocesar la misma activity.id en el día actual.
 * - Persiste los deltas en todayData.stravaAdjustments.goalsDelta para que el motor los sume a currentGoals.
 */

(function () {
  function getFirebase() {
    if (!window.firebase) throw new Error('Firebase no está cargado.');
    const auth = window.auth || window.firebase.auth();
    const db = window.db || window.firebase.firestore();
    return { auth, db };
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function ensureToastEl() {
    let el = document.getElementById('strava-sync-toast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'strava-sync-toast';
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '84px';
    el.style.transform = 'translateX(-50%)';
    el.style.background = 'rgba(15, 23, 42, 0.92)';
    el.style.color = '#fff';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '12px';
    el.style.fontSize = '12px';
    el.style.fontWeight = '700';
    el.style.zIndex = '9999';
    el.style.maxWidth = '92vw';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function showToast(message) {
    const el = ensureToastEl();
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(window.__stravaToastTimer);
    window.__stravaToastTimer = setTimeout(() => {
      el.style.display = 'none';
    }, 4500);
  }

  async function fetchLatestActivity(accessToken) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    url.searchParams.set('per_page', '1');
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Strava activities falló (${res.status}). ${text}`);
    }
    const arr = await res.json();
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  }

  async function fetchRecentActivities(accessToken, limit = 8) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    url.searchParams.set('per_page', String(limit));
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Strava activities (list) falló (${res.status}). ${text}`);
    }
    const arr = await res.json();
    return Array.isArray(arr) ? arr : [];
  }

  function mapSportToGymMuscle(sportType) {
    const s = String(sportType || '').toLowerCase();
    if (s.includes('run') || s.includes('ride') || s.includes('velo') || s.includes('walk') || s.includes('hike')) return 'pierna';
    if (s.includes('weight') || s.includes('workout') || s.includes('crossfit') || s.includes('strength')) return 'pecho';
    if (s.includes('swim')) return 'espalda';
    return 'cardio';
  }

  function mapIntensity(activity) {
    const movingTime = Number(activity.moving_time) || 0;
    const avgHr = Number(activity.average_heartrate) || 0;
    const suffer = Number(activity.suffer_score) || 0;
    if (movingTime > 3600 || suffer >= 60 || avgHr >= 160) return { level: 3, label: 'Alta' };
    if (movingTime > 1800 || suffer >= 30 || avgHr >= 145) return { level: 2, label: 'Media' };
    return { level: 1, label: 'Suave' };
  }

  function getAppWeightKg() {
    const w =
      (window.USER_BIO && Number(window.USER_BIO.peso)) ||
      Number(window.__FITTRACKER_USER_WEIGHT) ||
      70;
    return Number.isFinite(w) && w > 0 ? w : 70;
  }

  function estimateCaloriesByMet(activity, weightKg) {
    const movingTimeSec = Number(activity.moving_time) || 0;
    const hours = movingTimeSec / 3600;
    if (hours <= 0) return 0;
    const sport = String(activity.sport_type || activity.type || '').toLowerCase();
    let met = 6;
    if (sport.includes('run')) met = 9.8;
    else if (sport.includes('ride') || sport.includes('velo')) met = 8.5;
    else if (sport.includes('walk') || sport.includes('hike')) met = 4.5;
    else if (sport.includes('swim')) met = 8.0;
    else if (sport.includes('workout') || sport.includes('weight') || sport.includes('strength')) met = 6.0;
    return met * weightKg * hours;
  }

  function toGymWorkout(activity) {
    const timeMin = Math.round((Number(activity.moving_time) || 0) / 60);
    const caloriesRaw = Number(activity.calories) || 0;
    const caloriesFromKj = (Number(activity.kilojoules) || 0) * 0.239006;
    const caloriesFromMet = estimateCaloriesByMet(activity, getAppWeightKg());
    const kcal = Math.round(caloriesRaw || caloriesFromKj || caloriesFromMet || 0);
    const sportType = activity.sport_type || activity.type || 'Actividad';
    const intensity = mapIntensity(activity);
    const distanceKm = (Number(activity.distance) || 0) / 1000;
    return {
      activityId: activity.id,
      name: activity.name || sportType,
      sportType,
      typeLabel: sportType,
      startDate: activity.start_date || '',
      startDateLocal: activity.start_date_local || '',
      timeMin,
      kcal,
      intensity: intensity.level,
      intensityLabel: intensity.label,
      muscle: mapSportToGymMuscle(sportType),
      distanceKm: Number(distanceKm.toFixed(2)),
      elevationGain: Number(activity.total_elevation_gain) || 0,
      averageHr: Number(activity.average_heartrate) || 0,
      maxHr: Number(activity.max_heartrate) || 0,
      sufferScore: Number(activity.suffer_score) || 0,
      movingTimeSec: Number(activity.moving_time) || 0,
      elapsedTimeSec: Number(activity.elapsed_time) || 0,
      caloriesRaw: caloriesRaw,
      caloriesFromKj: Math.round(caloriesFromKj || 0),
      caloriesEstimated: Math.round(caloriesFromMet || 0),
    };
  }

  function computeDeltasFromActivity(activity) {
    const caloriesRaw = Number(activity.calories) || 0;
    const caloriesFromKj = (Number(activity.kilojoules) || 0) * 0.239006;
    const caloriesFromMet = estimateCaloriesByMet(activity, getAppWeightKg());
    const calories = Math.round(caloriesRaw || caloriesFromKj || caloriesFromMet || 0);
    const movingTime = Number(activity.moving_time) || 0; // seconds

    const waterMl = (movingTime / 1800) * 500; // 500ml cada 30 min (proporcional)

    const avgHr = Number(activity.average_heartrate) || 0;
    const suffer = Number(activity.suffer_score) || 0;
    const intense = (movingTime > 2700) && (suffer >= 40 || avgHr >= 150);

    const prot = intense ? 25 : 0;
    const carbs = (calories / 100) * 15;

    return {
      cals: calories,
      waterMl,
      prot,
      carbs,
      intense,
    };
  }

  function prettySport(activity) {
    return (activity && (activity.sport_type || activity.type)) ? (activity.sport_type || activity.type) : 'actividad';
  }

  async function readUserTokens(db, uid) {
    const snap = await db.collection('usuarios').doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    return data && data.stravaTokens ? data.stravaTokens : null;
  }

  async function markProcessedAndStoreDelta(db, uid, activity, delta) {
    const todayKey = getTodayKey();
    const dayRef = db.collection('usuarios').doc(uid).collection('dias').doc(todayKey);

    await db.runTransaction(async (tx) => {
      const daySnap = await tx.get(dayRef);
      const dayData = (daySnap.exists && daySnap.data() && daySnap.data().data) ? daySnap.data().data : {};

      const processed = Array.isArray(dayData.stravaProcessedActivityIds) ? dayData.stravaProcessedActivityIds : [];
      if (processed.includes(activity.id)) return; // ya procesada hoy

      const prevAdj = (dayData.stravaAdjustments && dayData.stravaAdjustments.goalsDelta) ? dayData.stravaAdjustments.goalsDelta : {};
      const nextAdj = {
        cals: (Number(prevAdj.cals) || 0) + (Number(delta.cals) || 0),
        waterMl: (Number(prevAdj.waterMl) || 0) + (Number(delta.waterMl) || 0),
        prot: (Number(prevAdj.prot) || 0) + (Number(delta.prot) || 0),
        carbs: (Number(prevAdj.carbs) || 0) + (Number(delta.carbs) || 0),
      };

      const next = {
        ...dayData,
        stravaProcessedActivityIds: [...processed, activity.id],
        stravaLastActivity: {
          id: activity.id,
          name: activity.name || null,
          sport_type: activity.sport_type || activity.type || null,
          start_date: activity.start_date || null,
          moving_time: activity.moving_time || null,
          calories: activity.calories || null,
          average_heartrate: activity.average_heartrate || null,
          suffer_score: activity.suffer_score || null,
        },
        stravaAdjustments: {
          goalsDelta: nextAdj,
          updatedAt: new Date().toISOString(),
        },
      };

      tx.set(dayRef, { dateKey: todayKey, data: next, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
  }

  async function refreshAppDayFromCloud(uid) {
    // En el legacy, `todayData` es un binding léxico (no cuelga de window),
    // así que no podemos mutarlo desde fuera directamente.
    // En su lugar: recargamos el día desde Firestore con la función existente.
    try {
      if (typeof window.cargarPersistenciaDesdeNube === 'function') {
        await window.cargarPersistenciaDesdeNube(uid);
      }
      if (typeof window.loadDay === 'function') window.loadDay();
      if (typeof window.updateDay === 'function') window.updateDay();
      if (typeof window.updateUI === 'function') window.updateUI();
    } catch (e) {
      console.warn('refreshAppDayFromCloud error:', e);
    }
  }

  async function sincronizarStrava() {
    try {
      const { auth, db } = getFirebase();
      const user = auth.currentUser;
      if (!user) return;

      const tokens = await readUserTokens(db, user.uid);
      if (!tokens || !tokens.access_token) return;

      const activity = await fetchLatestActivity(tokens.access_token);
      if (!activity || !activity.id) return;

      const todayKey = getTodayKey();
      const daySnap = await db.collection('usuarios').doc(user.uid).collection('dias').doc(todayKey).get();
      const dayData = (daySnap.exists && daySnap.data() && daySnap.data().data) ? daySnap.data().data : {};
      const processed = Array.isArray(dayData.stravaProcessedActivityIds) ? dayData.stravaProcessedActivityIds : [];
      if (processed.includes(activity.id)) return;

      // Nueva actividad -> Fase 4
      const delta = computeDeltasFromActivity(activity);
      await markProcessedAndStoreDelta(db, user.uid, activity, delta);
      await refreshAppDayFromCloud(user.uid);

      const sport = prettySport(activity);
      const waterLiters = (Number(delta.waterMl) || 0) / 1000;
      showToast(`¡Buen entreno de ${sport}! Ajustamos macros y +${waterLiters.toFixed(1)}L de agua a tu meta de hoy.`);
    } catch (e) {
      console.warn('sincronizarStrava fallo:', e);
    }
  }

  async function importarEntrenosStravaGym() {
    try {
      const { auth, db } = getFirebase();
      const user = auth.currentUser;
      if (!user) {
        if (typeof window.setStravaGymStatus === 'function') {
          window.setStravaGymStatus('Inicia sesión para importar entrenamientos.', 'err');
        }
        return;
      }

      const tokens = await readUserTokens(db, user.uid);
      if (!tokens || !tokens.access_token) {
        if (typeof window.setStravaGymStatus === 'function') {
          window.setStravaGymStatus('Primero conecta Strava en Perfil Biológico.', 'err');
        }
        return;
      }

      const activities = await fetchRecentActivities(tokens.access_token, 10);
      if (!activities.length) {
        if (typeof window.setStravaGymStatus === 'function') {
          window.setStravaGymStatus('No hay actividades recientes en Strava.', 'neutral');
        }
        return;
      }

      const workouts = activities
        .filter((a) => a && a.id)
        .map((a) => toGymWorkout(a));

      if (typeof window.openStravaGymPicker === 'function') {
        window.openStravaGymPicker(workouts);
      } else if (typeof window.applyStravaWorkoutsToGym === 'function') {
        window.applyStravaWorkoutsToGym(workouts);
      }
      showToast(`Strava Gym: ${workouts.length} entrenos listos para seleccionar.`);
    } catch (e) {
      console.warn('importarEntrenosStravaGym fallo:', e);
      if (typeof window.setStravaGymStatus === 'function') {
        window.setStravaGymStatus(`Error importando Strava: ${e.message || e}`, 'err');
      }
    }
  }

  // Exponer para uso desde el legacy
  window.sincronizarStrava = sincronizarStrava;
  window.importarEntrenosStravaGym = importarEntrenosStravaGym;

  // Hook: al entrar al Dashboard (navigateTo('inicio'))
  function wrapNavigateTo() {
    if (window.__stravaNavigateWrapped) return;
    if (typeof window.navigateTo !== 'function') return;

    const original = window.navigateTo;
    window.navigateTo = async function (id) {
      const r = await original.apply(this, arguments);
      try {
        if (id === 'inicio') await sincronizarStrava();
      } catch (_) {}
      return r;
    };

    window.__stravaNavigateWrapped = true;
  }

  // Inicialización
  window.addEventListener('load', () => {
    // Intentar envolver inmediatamente y también unos segundos por si todavía no existe.
    wrapNavigateTo();
    const t0 = Date.now();
    const timer = setInterval(() => {
      wrapNavigateTo();
      if (window.__stravaNavigateWrapped || (Date.now() - t0) > 8000) clearInterval(timer);
    }, 250);

    // Sync inicial (al abrir la app)
    setTimeout(() => {
      sincronizarStrava();
    }, 1800);
  });
})();

