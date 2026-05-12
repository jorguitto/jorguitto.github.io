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
  const STRAVA_TOKEN_URL = 'https://www.strava.com/api/v3/oauth/token';

  function getFirebase() {
    if (!window.firebase) throw new Error('Firebase no está cargado.');
    const auth = window.auth || window.firebase.auth();
    const db = window.db || window.firebase.firestore();
    return { auth, db };
  }

  function readStravaLs(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  /** Misma fuente que strava-auth.js / strava-service.js (window, __STRAVA_CONFIG__, localStorage). */
  function stravaClientId() {
    const v =
      window.STRAVA_CLIENT_ID ||
      (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_id) ||
      readStravaLs('strava_client_id') ||
      '';
    return String(v || '').trim();
  }

  function stravaClientSecret() {
    const v =
      window.STRAVA_CLIENT_SECRET ||
      (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_secret) ||
      readStravaLs('strava_client_secret') ||
      '';
    return String(v || '').trim();
  }

  /**
   * Intercambia refresh_token por tokens nuevos y los guarda en Firestore.
   * No depende de módulos ES (evita 401 si el boot module aún no cargó).
   */
  async function refreshStravaTokensNow(db, uid) {
    const ref = db.collection('usuarios').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    const t = data && data.stravaTokens ? data.stravaTokens : null;
    if (!t || !t.refresh_token) {
      throw new Error('No hay refresh_token. Desconecta y vuelve a conectar Strava en Perfil Biológico.');
    }
    const clientId = stravaClientId();
    const clientSecret = stravaClientSecret();
    if (!/^\d+$/.test(clientId)) {
      throw new Error('STRAVA_CLIENT_ID no válido. Configura window.STRAVA_CLIENT_ID o localStorage strava_client_id.');
    }
    if (!clientSecret) {
      throw new Error(
        'Falta STRAVA_CLIENT_SECRET (necesario para refrescar). ' +
          'Configura window.STRAVA_CLIENT_SECRET o localStorage strava_client_secret, o usa un backend seguro.'
      );
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
    });
    const res = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`Strava refresh (${res.status}): ${text}`);
    }
    const json = JSON.parse(text);
    const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
    const stravaTokens = {
      access_token: json.access_token,
      refresh_token: json.refresh_token || t.refresh_token,
      expires_at: json.expires_at,
      expires_in: json.expires_in,
      token_type: json.token_type || 'Bearer',
      athlete: json.athlete || t.athlete || null,
      updatedAt: fv ? fv.serverTimestamp() : new Date().toISOString(),
    };
    await ref.set({ stravaTokens }, { merge: true });
    try {
      window.localStorage.setItem(
        `fittracker_strava_exp:${uid}`,
        JSON.stringify({ expires_at: stravaTokens.expires_at, at: Date.now() })
      );
    } catch (_) {}
    return stravaTokens;
  }

  function expiresAtSeconds(tokens) {
    if (!tokens || tokens.expires_at == null || tokens.expires_at === '') return 0;
    const e = tokens.expires_at;
    if (typeof e === 'number' && Number.isFinite(e)) return e;
    if (typeof e === 'object' && e !== null && typeof e.seconds === 'number') return e.seconds;
    const n = Number(e);
    return Number.isFinite(n) ? n : 0;
  }

  async function getValidStravaAccessToken(db, uid) {
    let t = await readUserTokens(db, uid);
    if (!t || !t.access_token) return null;
    const now = Math.floor(Date.now() / 1000);
    const exp = expiresAtSeconds(t);
    const expSoon = exp > 0 && exp <= now + 300;
    const missingExp = !exp;
    if (t.refresh_token && (missingExp || expSoon)) {
      try {
        t = await refreshStravaTokensNow(db, uid);
      } catch (e) {
        console.warn('Strava refresh proactivo:', e);
      }
    }
    const mod = window.__FITTRACKER_MODULES__;
    if (mod && typeof mod.refreshStravaTokenIfNeeded === 'function') {
      try {
        const again = await mod.refreshStravaTokenIfNeeded(db, uid);
        if (again && again.access_token) t = again;
      } catch (e) {
        console.warn('Strava refresh (módulo):', e);
      }
    }
    return t && t.access_token ? t.access_token : null;
  }

  /**
   * GET athlete/activities con refresh + un reintento si Strava devuelve 401.
   */
  async function fetchStravaActivitiesArray(db, uid, perPage) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    url.searchParams.set('per_page', String(perPage));

    async function oneFetch(accessToken) {
      return fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    let accessToken = await getValidStravaAccessToken(db, uid);
    if (!accessToken) {
      throw new Error('No hay token de Strava. Conecta Strava en Perfil Biológico.');
    }

    let res = await oneFetch(accessToken);
    if (res.status === 401) {
      const tok = await readUserTokens(db, uid);
      if (tok && tok.refresh_token) {
        try {
          const fresh = await refreshStravaTokensNow(db, uid);
          res = await oneFetch(fresh.access_token);
        } catch (e) {
          const body = await res.text().catch(() => '');
          throw new Error(
            `${e.message || e} — Tras 401 de Strava no se pudo renovar el token. ` +
              'Comprueba STRAVA_CLIENT_SECRET (mismo que usaste al conectar) o vuelve a conectar Strava.'
          );
        }
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Strava activities falló (${res.status}). ${text}`);
    }
    const arr = await res.json();
    return Array.isArray(arr) ? arr : [];
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

  async function fetchLatestActivity(db, uid) {
    const arr = await fetchStravaActivitiesArray(db, uid, 1);
    return arr.length ? arr[0] : null;
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

  function classifyStravaUi(name, sportType) {
    const type = String(sportType || '').toLowerCase();
    const n = String(name || '').trim().toLowerCase();
    const genericTokens = [
      'entrenamiento',
      'training',
      'workout',
      'afternoon workout',
      'morning workout',
      'evening workout',
      'weight training',
      'strength training',
      'entrenamiento matutino',
      'entrenamiento vespertino',
      'entrenamiento en el gimnasio',
      'gym session',
      'crossfit',
      'yoga',
      'pilates',
      'hiit',
      'gimnasio',
    ];
    const isGenericName =
      genericTokens.some((t) => n.includes(t)) ||
      /^entrenamiento\b/i.test(String(name || '').trim()) ||
      /^workout\b/i.test(String(name || '').trim());

    if (type.includes('ride') || type.includes('virtualride') || type.includes('ebikeride') || type.includes('handcycle')) {
      return { uiKind: 'ride', typeLabel: 'Ciclismo' };
    }
    if (type.includes('run') || type.includes('virtualrun')) {
      return { uiKind: 'run', typeLabel: 'Running' };
    }
    if (type.includes('swim')) {
      return { uiKind: 'swim', typeLabel: 'Natación' };
    }
    if (type.includes('walk') || type.includes('hike') || type.includes('snowshoe')) {
      return { uiKind: 'walk', typeLabel: type.includes('hike') || type.includes('senderismo') ? 'Senderismo' : 'Caminata' };
    }
    if (
      isGenericName ||
      type.includes('workout') ||
      type.includes('weight') ||
      type.includes('crossfit') ||
      type.includes('yoga') ||
      type.includes('elliptical') ||
      type.includes('rowing') ||
      type.includes('stair')
    ) {
      return { uiKind: 'gym', typeLabel: 'Gimnasio / general' };
    }
    return { uiKind: 'other', typeLabel: String(sportType || 'Actividad') };
  }

  function toGymWorkout(activity, weatherContext) {
    const timeMin = Math.round((Number(activity.moving_time) || 0) / 60);
    const caloriesRaw = Number(activity.calories) || 0;
    const caloriesFromKj = (Number(activity.kilojoules) || 0) * 0.239006;
    const caloriesFromMet = estimateCaloriesByMet(activity, getAppWeightKg());
    const kcal = Math.round(caloriesRaw || caloriesFromKj || caloriesFromMet || 0);
    const sportType = activity.sport_type || activity.type || 'Actividad';
    const ui = classifyStravaUi(activity.name, sportType);
    const intensity = mapIntensity(activity);
    const distanceKm = (Number(activity.distance) || 0) / 1000;
    const movingTimeSec = Number(activity.moving_time) || 0;
    let avgPaceMinKm = 0;
    if (distanceKm > 0.05 && movingTimeSec > 30) {
      avgPaceMinKm = Math.round((movingTimeSec / 60 / distanceKm) * 100) / 100;
    }
    const wx = weatherContext && typeof weatherContext === 'object' ? weatherContext : null;
    return {
      activityId: activity.id,
      name: activity.name || sportType,
      sportType,
      typeLabel: ui.typeLabel,
      uiKind: ui.uiKind,
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
      movingTimeSec,
      elapsedTimeSec: Number(activity.elapsed_time) || 0,
      caloriesRaw: caloriesRaw,
      caloriesFromKj: Math.round(caloriesFromKj || 0),
      caloriesEstimated: Math.round(caloriesFromMet || 0),
      avgPaceMinKm,
      weatherContext: wx,
      hydrationFactor: wx && wx.hydrationBoost ? wx.hydrationBoost : 1,
      fatigueFactor: wx && wx.thermalFatigue != null ? 1 + Number(wx.thermalFatigue) : 1,
      recoveryLoad: Math.round(intensity.level * 12 + timeMin / 15),
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

  async function persistStravaActivities(db, uid, workouts) {
    if (!db || !uid || !Array.isArray(workouts)) return;
    const col = db.collection('usuarios').doc(uid).collection('strava_activities');
    for (let i = 0; i < Math.min(workouts.length, 20); i++) {
      const w = workouts[i];
      if (!w || !w.activityId) continue;
      try {
        await col.doc(String(w.activityId)).set(
          {
            id: w.activityId,
            type: w.sportType || w.typeLabel || null,
            date: w.startDateLocal || w.startDate || null,
            distance: w.distanceKm != null ? w.distanceKm * 1000 : null,
            moving_time: w.movingTimeSec || null,
            heart_rate: w.averageHr || null,
            calories: w.kcal || null,
            weather: w.weatherContext || null,
            uv: w.weatherContext && w.weatherContext.uvIndex != null ? w.weatherContext.uvIndex : null,
            hydrationFactor: w.hydrationFactor != null ? w.hydrationFactor : null,
            fatigueFactor: w.fatigueFactor != null ? w.fatigueFactor : null,
            recoveryLoad: w.recoveryLoad != null ? w.recoveryLoad : null,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('persistStravaActivities', e);
      }
    }
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

      const activity = await fetchLatestActivity(db, user.uid);
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

      const pre = await readUserTokens(db, user.uid);
      if (!pre || !pre.access_token) {
        if (typeof window.setStravaGymStatus === 'function') {
          window.setStravaGymStatus('Primero conecta Strava en Perfil Biológico.', 'err');
        }
        return;
      }

      const activities = await fetchStravaActivitiesArray(db, user.uid, 10);
      if (!activities.length) {
        if (typeof window.setStravaGymStatus === 'function') {
          window.setStravaGymStatus('No hay actividades recientes en Strava.', 'neutral');
        }
        return;
      }

      const mod = window.__FITTRACKER_MODULES__;
      const workouts = [];
      for (const a of activities.filter((x) => x && x.id)) {
        let wx = null;
        if (mod && typeof mod.getActivityWeatherContext === 'function' && Array.isArray(a.start_latlng) && a.start_latlng.length >= 2) {
          try {
            wx = await mod.getActivityWeatherContext({
              lat: a.start_latlng[0],
              lng: a.start_latlng[1],
              isoDateTime: a.start_date_local || a.start_date,
            });
          } catch (_) {}
        }
        workouts.push(toGymWorkout(a, wx));
      }

      await persistStravaActivities(db, user.uid, workouts);

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

