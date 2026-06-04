/** FitTracker - logica principal (index.html) */
// ==========================================================================================
        // 🧬 CONFIGURACIÓN: PERFIL BIOLÓGICO REACTIVO
        // ==========================================================================================
        
       // ==========================================================================================
        // ☁️ CONEXIÓN A LA NUBE: FIREBASE
        // ==========================================================================================
       // ==========================================================================================
        // ☁️ CONEXIÓN A LA NUBE: FIREBASE (CORREGIDO)
        // ==========================================================================================
        const firebaseConfig = {
            apiKey: "AIzaSyCgCwGwkMUTI9PhyWHBv6DXxhkHgf8Rjzg",
            authDomain: "fittracker-a347a.firebaseapp.com",
            projectId: "fittracker-a347a",
            storageBucket: "fittracker-a347a.firebasestorage.app",
            messagingSenderId: "251475812729",
            appId: "1:251475812729:web:d1ed26b4262091f11f8fa8",
            measurementId: "G-K0R3K5EBT0"
        };

        // Inicializar Firebase (Versión compatible con navegador)
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();
        db.settings({
            experimentalAutoDetectLongPolling: true,
            useFetchStreams: false
        });
        firebase.firestore.setLogLevel('error');

        let currentUser = null;
        let USER_BIO = null;
        function getDefaultAiCoachSettings() {
            return { provider: 'none', apiKey: '', model: '' };
        }
        window.__AICOACH_SETTINGS__ = Object.assign({}, getDefaultAiCoachSettings(), window.__AICOACH_SETTINGS__ || {});
        if (window.__AICOACH_SETTINGS__.provider === 'builtin') {
            window.__AICOACH_SETTINGS__.provider = 'none';
        }
        let authReady = false;
        let authStateHandled = false;
        let lastAuthDebug = "Iniciando autenticacion...";
        const AUTH_DEBUG_KEY = "fittracker_auth_debug";
        const AUTH_REDIRECT_PENDING_KEY = "fittracker_auth_redirect_pending";

        function setAuthDebug(message) {
            lastAuthDebug = message;
            try {
                localStorage.setItem(AUTH_DEBUG_KEY, message);
            } catch (_) {}
        }

        function getTodayDocId() {
            return new Date().toISOString().split('T')[0];
        }

        function normalizeRecordDateKey(record) {
            if (record && record.dateKey) return record.dateKey;
            const fallback = getTodayDocId();
            if (!record || !record.date) return fallback;
            const parsed = new Date(record.date);
            if (Number.isNaN(parsed.getTime())) return fallback;
            return parsed.toISOString().split('T')[0];
        }

        function showLoginError(title, message) {
            setAuthDebug(`${title}: ${message}`);
            Swal.fire({ title, text: message, icon: 'error' });
        }

        function isFirestoreOfflineError(error) {
            return !!(error && (error.code === "unavailable" || (error.message || "").toLowerCase().includes("offline")));
        }

        function toFsValue(v) {
            if (v === null || v === undefined) return { nullValue: null };
            if (typeof v === "string") return { stringValue: v };
            if (typeof v === "boolean") return { booleanValue: v };
            if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
            if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
            if (typeof v === "object") {
                const fields = {};
                Object.keys(v).forEach((k) => { fields[k] = toFsValue(v[k]); });
                return { mapValue: { fields } };
            }
            return { stringValue: String(v) };
        }

        function fromFsValue(value) {
            if (!value) return null;
            if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
            if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
            if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
            if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
            if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
            if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) return (value.arrayValue.values || []).map(fromFsValue);
            if (Object.prototype.hasOwnProperty.call(value, "mapValue")) {
                const out = {};
                const fields = (value.mapValue && value.mapValue.fields) || {};
                Object.keys(fields).forEach((k) => { out[k] = fromFsValue(fields[k]); });
                return out;
            }
            return null;
        }

        async function firestoreRestRequest(method, path, body, opts) {
            if (!currentUser) throw new Error("No autenticado");
            const token = await currentUser.getIdToken(true);
            const projectId = firebaseConfig.projectId;
            let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
            if (opts && opts.querySuffix) {
                url += (opts.querySuffix.startsWith("?") ? "" : "?") + opts.querySuffix;
            }
            const res = await fetch(url, {
                method,
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: body ? JSON.stringify(body) : undefined
            });
            if (!res.ok) {
                if (opts && opts.allow404 && method === "GET" && res.status === 404) {
                    return null;
                }
                const txt = await res.text();
                throw new Error(`REST ${method} ${path} -> ${res.status}: ${txt}`);
            }
            if (res.status === 204) return null;
            return res.json();
        }

        async function restPatchDocument(path, plainData) {
            const keys = Object.keys(plainData).filter((k) => plainData[k] !== undefined);
            const maskQs = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
            const fields = {};
            keys.forEach((k) => { fields[k] = toFsValue(plainData[k]); });
            return firestoreRestRequest("PATCH", path, { fields }, { querySuffix: maskQs ? `?${maskQs}` : "" });
        }

        async function restSetDocument(path, plainData) {
            return restPatchDocument(path, plainData);
        }

        async function restGetDocument(path) {
            const json = await firestoreRestRequest("GET", path, null, { allow404: true });
            if (!json) return {};
            const fields = (json && json.fields) || {};
            const out = {};
            Object.keys(fields).forEach((k) => { out[k] = fromFsValue(fields[k]); });
            return out;
        }

        async function syncTrackerWeekFromPending() {
            if (!currentUser) return;
            const raw = localStorage.getItem('fittracker_tracker_week_payload');
            if (!raw) return;
            try {
                const payload = JSON.parse(raw);
                if (!payload || !payload.weekId) return;
                await db.collection('usuarios')
                    .doc(currentUser.uid)
                    .collection('tracker_semanas')
                    .doc(payload.weekId)
                    .set({
                        ...payload,
                        linkedToFitTrackerAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                trackerWeeks = [{ ...payload, firestoreId: payload.weekId }, ...trackerWeeks.filter(w => (w.weekId || w.firestoreId) !== payload.weekId)];
                localStorage.removeItem('fittracker_tracker_week_payload');
            } catch (e) {
                console.error("No se pudo sincronizar semana Tracker -> FitTracker:", e);
            }
        }

        async function refreshTrackerWeeksFromCloud() {
            if (!currentUser) return;
            try {
                const trackerSnap = await db.collection('usuarios')
                    .doc(currentUser.uid)
                    .collection('tracker_semanas')
                    .orderBy('weekStart', 'desc')
                    .get({ source: "server" });
                trackerWeeks = trackerSnap.docs.map((doc) => ({ ...doc.data(), firestoreId: doc.id }));
            } catch (error) {
                console.error("Error refrescando semanas tracker:", error);
            }
        }

        function getDefaultUserBio() {
            return {
                nombre: (currentUser && currentUser.displayName) ? currentUser.displayName : "Atleta",
                genero: "hombre",
                fechaNacimiento: "",
                edad: 18,
                altura: 168,
                peso: 60,
                grasa: 12,
                masaMuscular: 50,
                ubicacion: "España",
                lat: null,
                lon: null,
                maxRunKm: 5,
                maxGymTime: 60,
                maxBikeKm: 25,
                goal: "maintenance",
                goalSpeed: "moderate"
            };
        }

        async function completarSesionConUsuario(user) {
            if (!user) return;
            currentUser = user;
            document.getElementById('login-screen').style.display = 'none';
            try {
                await cargarDatosUsuario(user.uid);
                await cargarPersistenciaDesdeNube(user.uid);
            } catch (error) {
                console.error("Error completando sesion:", error);
            }
            if (!USER_BIO) {
                USER_BIO = getDefaultUserBio();
            }
            if (USER_BIO.fechaNacimiento) {
                USER_BIO.edad = calcularEdad(USER_BIO.fechaNacimiento);
            }
            await initWeatherFromUserBio();
            loadDay();
            updateHistoryUI();
            authReady = true;
            if (typeof updateDay === "function") updateDay();
            verificarCumpleanos();
            await syncTrackerWeekFromPending();
        }

        async function initAuthFlow() {
            auth.useDeviceLanguage();
            try {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            } catch (error) {
                console.error("No se pudo fijar persistencia LOCAL:", error);
                try {
                    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
                    setAuthDebug("Persistencia fallback: SESSION");
                } catch (fallbackError) {
                    console.error("No se pudo fijar persistencia SESSION:", fallbackError);
                }
            }

            try {
                setAuthDebug("Procesando getRedirectResult...");
                const redirectResult = await auth.getRedirectResult();
                if (redirectResult && redirectResult.user) {
                    console.log("Redirect auth completado:", redirectResult.user.uid);
                    setAuthDebug(`Redirect OK (${redirectResult.user.uid})`);
                    try { sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY); } catch (_) {}
                    if (!auth.currentUser) {
                        await verificarUsuarioNuevo(redirectResult.user);
                    }
                } else {
                    const pending = (() => {
                        try { return sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === "1"; } catch (_) { return false; }
                    })();
                    if (pending && !auth.currentUser) {
                        setAuthDebug("Redirect sin usuario. Revisa Google Provider habilitado y dominio autorizado.");
                        showLoginError(
                            "Login no completado",
                            "Google devolvio al sitio pero Firebase no recibio sesion. Revisa: 1) Google provider habilitado en Authentication > Sign-in method, 2) dominio jorguitto.github.io en Authorized domains, 3) no bloqueo de cookies del navegador."
                        );
                        try { sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY); } catch (_) {}
                    } else {
                        setAuthDebug("getRedirectResult sin resultado (flujo normal sin login previo)");
                    }
                }
            } catch (error) {
                console.error("Error en getRedirectResult:", error);
                const msgByCode = {
                    "auth/unauthorized-domain": "Dominio no autorizado en Firebase Auth. Debes abrir la app desde un dominio permitido (localhost o hosting) y añadirlo en Authentication > Settings > Authorized domains.",
                    "auth/operation-not-supported-in-this-environment": "Google Sign-In no está permitido desde file://. Abre la app en un servidor (por ejemplo http://localhost:5500).",
                    "auth/popup-blocked": "El navegador bloqueó la ventana de login. Vuelve a intentarlo permitiendo popups.",
                    "auth/network-request-failed": "Fallo de red durante autenticación. Revisa conexión e inténtalo de nuevo."
                };
                showLoginError("Error de acceso", msgByCode[error.code] || `${error.code || "Error desconocido"}: ${error.message || "No se pudo completar el login."}`);
            }
        }
// Escuchar cambios de estado (Login/Logout) CON ONBOARDING
    
        auth.onAuthStateChanged(async (user) => {
            authStateHandled = true;

            if (user) {
                setAuthDebug(`onAuthStateChanged OK (${user.uid})`);
                document.getElementById('login-screen').style.display = 'none';
                await verificarUsuarioNuevo(user);
            } else {
                currentUser = null;
                USER_BIO = null;
                window.__AICOACH_SETTINGS__ = getDefaultAiCoachSettings();
                authReady = false;
                setAuthDebug("onAuthStateChanged: sin usuario");
                document.getElementById('login-screen').style.display = 'flex';
                document.getElementById('onboarding-modal').classList.add('hidden');
                document.getElementById('onboarding-modal').classList.remove('flex');
            }
        });

       async function loginConGoogle() {
            if (window.location.protocol === 'file:') {
                showLoginError(
                    "No se puede iniciar sesión desde archivo local",
                    "Abre este HTML en un servidor (localhost o hosting)."
                );
                return;
            }

            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            provider.addScope('email');
            auth.languageCode = 'es';

            try {
                // Al quitar el "await setPersistence" de aquí, la ventana se abre
                // en el mismo instante del toque, superando la seguridad de Safari.
                setAuthDebug("Intentando signInWithPopup directo");
                const popupResult = await auth.signInWithPopup(provider);
                
                if (popupResult && popupResult.user) {
                    setAuthDebug(`Popup OK (${popupResult.user.uid})`);
                    await verificarUsuarioNuevo(popupResult.user);
                }
            } catch (error) {
                console.error("Error Auth:", error);
                
                // Si el navegador de todas formas bloquea la ventana, avisamos amigablemente
                if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request") {
                    Swal.fire({
                        title: 'Ventana bloqueada',
                        text: 'Tu navegador ha bloqueado la ventana de inicio de sesión de Google. Por favor, permite las ventanas emergentes (pop-ups) para esta página.',
                        icon: 'warning'
                    });
                } else {
                    showLoginError("Error de Acceso", error.message || "No se pudo iniciar sesión.");
                }
            }
        }

        async function logoutUsuario() {
            try {
                await auth.signOut();
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
            }
            // onAuthStateChanged se encarga de volver a mostrar #login-screen.
        }

        function diagnosticarLogin() {
            const persistedDebug = (() => {
                try { return localStorage.getItem(AUTH_DEBUG_KEY) || "(sin debug persistido)"; } catch (_) { return "(no se pudo leer debug)"; }
            })();
            const redirectPending = (() => {
                try { return sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === "1"; } catch (_) { return false; }
            })();
            const checks = [];
            checks.push(`Protocolo: ${window.location.protocol}`);
            checks.push(`Host: ${window.location.host || "(sin host)"}`);
            checks.push(`Usuario auth.currentUser: ${auth.currentUser ? "SI" : "NO"}`);
            checks.push(`onAuthStateChanged ejecutado: ${authStateHandled ? "SI" : "NO"}`);
            checks.push(`Estado debug: ${lastAuthDebug}`);
            checks.push(`Debug persistido: ${persistedDebug}`);
            checks.push(`Redirect pendiente: ${redirectPending ? "SI" : "NO"}`);
            Swal.fire({
                title: "Diagnostico de Login",
                html: `<div style="text-align:left;font-size:13px;line-height:1.5">${checks.map(x => `• ${x}`).join('<br>')}</div>`,
                icon: "info"
            });
        }

        initAuthFlow();

        async function cargarDatosUsuario(uid) {
            try {
                try {
                    // await db.enableNetwork();
                } catch (enErr) {
                    console.warn("enableNetwork:", enErr);
                }
                const docRef = db.collection('usuarios').doc(uid);
                const docSnap = await docRef.get({ source: "server" });
                
                if (docSnap.exists && docSnap.data() && docSnap.data().bio) {
                    USER_BIO = docSnap.data().bio;
                } else if (docSnap.exists && docSnap.data() && docSnap.data().bio_json) {
                    USER_BIO = JSON.parse(docSnap.data().bio_json);
                } else {
                    USER_BIO = getDefaultUserBio();
                    await guardarDatosUsuario();
                }
                const uData = docSnap.exists ? docSnap.data() : null;
                if (uData && uData.aiCoach) {
                    window.__AICOACH_SETTINGS__ = Object.assign(getDefaultAiCoachSettings(), { ...uData.aiCoach });
                    if (window.__AICOACH_SETTINGS__.provider === 'builtin') {
                        window.__AICOACH_SETTINGS__.provider = 'none';
                    }
                } else {
                    window.__AICOACH_SETTINGS__ = getDefaultAiCoachSettings();
                }
            } catch (error) {
                console.error("Error Firestore:", error);
                let restFailureDetail = "";
                if (isFirestoreOfflineError(error) && currentUser) {
                    try {
                        const restDoc = await restGetDocument(`usuarios/${uid}`);
                        if (restDoc.bio_json) {
                            USER_BIO = JSON.parse(restDoc.bio_json);
                        } else if (restDoc.bio) {
                            USER_BIO = restDoc.bio;
                        } else {
                            USER_BIO = getDefaultUserBio();
                            await guardarDatosUsuario();
                        }
                        if (restDoc.aiCoach) {
                            window.__AICOACH_SETTINGS__ = Object.assign(getDefaultAiCoachSettings(), { ...restDoc.aiCoach });
                            if (window.__AICOACH_SETTINGS__.provider === 'builtin') {
                                window.__AICOACH_SETTINGS__.provider = 'none';
                            }
                        } else {
                            window.__AICOACH_SETTINGS__ = getDefaultAiCoachSettings();
                        }
                        setAuthDebug("Perfil cargado via REST (SDK offline)");
                        return;
                    } catch (restErr) {
                        console.error("Error REST Firestore (perfil):", restErr);
                        restFailureDetail = `\nREST: ${restErr.message || restErr}`;
                    }
                }
                USER_BIO = USER_BIO || getDefaultUserBio();
                const errCode = (error && error.code) ? error.code : "sin_codigo";
                const errMsg = (error && error.message) ? error.message : "sin_mensaje";
                const restHint = isFirestoreOfflineError(error)
                    ? `\n(Si ves esto, el SDK sigue offline y REST tambien fallo; revisa red o reglas.)${restFailureDetail}`
                    : "";
                showLoginError(
                    "Error de Firestore",
                    `No se pudieron cargar tus datos en la nube.\nCódigo: ${errCode}\nDetalle: ${errMsg}${restHint}\nSe usará perfil local temporal.`
                );
            }
        }

        async function guardarDatosUsuario() {
            if (!currentUser || !USER_BIO) return;
            try {
                await db.collection('usuarios').doc(currentUser.uid).set({
                    bio: USER_BIO,
                    bio_json: JSON.stringify(USER_BIO),
                    ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error("Error al guardar:", error);
                if (isFirestoreOfflineError(error)) {
                    try {
                        await restSetDocument(`usuarios/${currentUser.uid}`, {
                            bio_json: JSON.stringify(USER_BIO),
                            ultimaActualizacion_txt: new Date().toISOString()
                        });
                        return;
                    } catch (restErr) {
                        console.error("Error REST guardando perfil:", restErr);
                    }
                }
                showLoginError("Error al guardar perfil", `Firestore devolvio: ${error.code || "sin_codigo"}`);
            }
        }

        window.runAiCoachStravaReport = function runAiCoachStravaReport() {
            if (window.Swal && typeof window.Swal.fire === 'function') {
                window.Swal.fire({
                    icon: 'info',
                    title: 'Sin informes por IA',
                    html:
                        '<p class="text-sm text-left text-slate-700">Esta versión de la app <strong>no usa modelos de IA</strong> ni API keys externas.</p>' +
                        '<p class="text-sm text-left text-slate-600 mt-2">En la pestaña <strong>Strava</strong> tienes el <strong>coach digital</strong>: resumen, plan orientativo y gráficas calculadas solo con tus datos importados y tu perfil.</p>',
                    confirmButtonText: 'Entendido',
                    customClass: { popup: 'rounded-2xl text-left' },
                });
            }
        };

        async function guardarRegistroDiarioFirestore(docId, payload) {
            if (!currentUser) return;
            try {
                await db.collection('usuarios')
                    .doc(currentUser.uid)
                    .collection('registros_diarios')
                    .doc(docId)
                    .set({
                        ...payload,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
            } catch (error) {
                console.error("Error al sincronizar registro diario:", error);
                if (isFirestoreOfflineError(error)) {
                    try {
                        const restPayload = {
                            dateKey: payload.dateKey || docId,
                            today_json: payload.todayData ? JSON.stringify(payload.todayData) : null,
                            history_json: payload.historyRecord ? JSON.stringify(payload.historyRecord) : null,
                            updatedAt_txt: new Date().toISOString()
                        };
                        await restSetDocument(`usuarios/${currentUser.uid}/registros_diarios/${docId}`, restPayload);
                        return;
                    } catch (restErr) {
                        console.error("Error REST sincronizando registro:", restErr);
                    }
                }
                if (error && (error.code === "permission-denied" || error.code === "unauthenticated")) {
                    showLoginError(
                        "Sin permisos en Firestore",
                        "Tu sesion existe, pero las reglas de Firestore están bloqueando escritura en usuarios/{uid}/registros_diarios. Debes permitir acceso al usuario autenticado."
                    );
                }
            }
        }

        async function sincronizarDiaEnNube() {
            if (!currentUser) return;
            const docId = getTodayDocId();
            const payload = {
                dateKey: docId,
                data: todayData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                await db.collection('usuarios')
                    .doc(currentUser.uid)
                    .collection('dias')
                    .doc(docId)
                    .set(payload, { merge: true });
            } catch (error) {
                console.error("Error al sincronizar día en nube:", error);
                if (isFirestoreOfflineError(error)) {
                    try {
                        await restSetDocument(`usuarios/${currentUser.uid}/dias/${docId}`, {
                            dateKey: docId,
                            data_json: JSON.stringify(todayData),
                            updatedAt_txt: new Date().toISOString()
                        });
                    } catch (restErr) {
                        console.error("Error REST sincronizando día:", restErr);
                    }
                }
            }
        }

        async function guardarHistorialEnNube(record, existingFirestoreId) {
            if (!currentUser) return null;
            const payload = {
                ...record,
                dateKey: record.dateKey || getTodayDocId(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                const histCol = db.collection('usuarios').doc(currentUser.uid).collection('historial');
                if (existingFirestoreId) {
                    await histCol.doc(existingFirestoreId).set(payload, { merge: true });
                    return existingFirestoreId;
                }
                const docRef = await histCol.add(payload);
                return docRef.id;
            } catch (error) {
                console.error("Error guardando historial en nube:", error);
                if (isFirestoreOfflineError(error)) {
                    try {
                        const restRecord = { ...record, firestoreId: existingFirestoreId || null };
                        await restSetDocument(`usuarios/${currentUser.uid}/historial/${record.dateKey || getTodayDocId()}`, {
                            dateKey: record.dateKey || getTodayDocId(),
                            record_json: JSON.stringify(restRecord),
                            createdAt_txt: new Date().toISOString()
                        });
                        return existingFirestoreId || (record.dateKey || getTodayDocId());
                    } catch (restErr) {
                        console.error("Error REST guardando historial:", restErr);
                    }
                }
            }
            return null;
        }

        async function borrarHistorialEnNube(firestoreId) {
            if (!currentUser || !firestoreId) return;
            try {
                await db.collection('usuarios')
                    .doc(currentUser.uid)
                    .collection('historial')
                    .doc(firestoreId)
                    .delete();
            } catch (error) {
                console.error("Error borrando historial en nube:", error);
            }
        }

       async function cargarPersistenciaDesdeNube(uid) {
            const todayId = getTodayDocId();
            try {
                try { /* await db.enableNetwork(); */ } catch (_) {} // <--- O MÁRCALO ASÍ
                const daySnap = await db.collection('usuarios')
                    .doc(uid)
                    .collection('dias')
                    .doc(todayId)
                    .get({ source: "server" });
                if (daySnap.exists && daySnap.data() && daySnap.data().data) {
                    todayData = { ...INITIAL_STATE, ...daySnap.data().data };
                }
            } catch (error) {
                console.error("Error cargando día en nube:", error);
                if (isFirestoreOfflineError(error) && currentUser) {
                    try {
                        const dayDoc = await restGetDocument(`usuarios/${uid}/dias/${todayId}`);
                        if (dayDoc.data_json) {
                            todayData = { ...INITIAL_STATE, ...JSON.parse(dayDoc.data_json) };
                        }
                    } catch (restErr) {
                        console.error("Error REST cargando día:", restErr);
                    }
                }
            }

            try {
                const historySnap = await db.collection('usuarios')
                    .doc(uid)
                    .collection('historial')
                    .orderBy('dateKey', 'desc')
                    .get({ source: "server" });
                history = historySnap.docs.map((doc) => ({ ...doc.data(), firestoreId: doc.id }));
            } catch (error) {
                console.error("Error cargando historial en nube:", error);
                if (isFirestoreOfflineError(error) && currentUser) {
                    try {
                        const list = await firestoreRestRequest("GET", `usuarios/${uid}/historial`, null, { allow404: true });
                        if (!list || !list.documents) {
                            history = [];
                            return;
                        }
                        history = list.documents.map((d) => {
                            const fields = d.fields || {};
                            const recordJson = fromFsValue(fields.record_json);
                            const firestoreId = d.name ? d.name.split('/').pop() : null;
                            if (recordJson) {
                                try {
                                    const parsed = JSON.parse(recordJson);
                                    parsed.firestoreId = parsed.firestoreId || firestoreId;
                                    return parsed;
                                } catch (_) {}
                            }
                            const out = {};
                            Object.keys(fields).forEach((k) => { out[k] = fromFsValue(fields[k]); });
                            out.firestoreId = firestoreId;
                            return out;
                        }).sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || ""));
                    } catch (restErr) {
                        console.error("Error REST cargando historial:", restErr);
                    }
                }
            }

            try {
                const trackerSnap = await db.collection('usuarios')
                    .doc(uid)
                    .collection('tracker_semanas')
                    .orderBy('weekStart', 'desc')
                    .get({ source: "server" });
                trackerWeeks = trackerSnap.docs.map((doc) => ({ ...doc.data(), firestoreId: doc.id }));
            } catch (error) {
                console.error("Error cargando semanas tracker:", error);
                trackerWeeks = [];
            }

            try {
                const mod = window.__FITTRACKER_MODULES__;
                if (mod && currentUser && currentUser.uid === uid) {
                    const rec = mod.readLocalDailySnapshotRecord(uid, todayId);
                    if (rec && rec.pending === true && typeof mod.mergeSnapshotIntoInitial === 'function') {
                        todayData = mod.mergeSnapshotIntoInitial(rec.todayData, INITIAL_STATE);
                        if (rec.currentGoals && typeof rec.currentGoals === 'object') {
                            currentGoals = { ...BASE_GOALS, ...rec.currentGoals };
                        }
                        if (rec.cli && typeof rec.cli === 'object') {
                            Object.assign(CLIMA_REAL, rec.cli);
                        }
                        mod.clearLocalPendingFlag(uid, todayId);
                        await sincronizarDiaEnNube();
                    }
                }
            } catch (e) {
                console.warn('Pending daily snapshot:', e);
            }
        }

        const MONTH_NAMES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
        const CLIMA_REAL = { temp: null, tempMax: null, tempMin: null, icon: '⛅', weatherCode: null, source: 'fallback' };
        let weatherIntervalId = null;
        let appBooted = false;
        let onboardingLocation = null;
        let onbLocTimer = null;
        let swalLocTimer = null;

        function weatherCodeToIcon(code) {
            if (code === 0) return '☀️';
            if ([1, 2].includes(code)) return '🌤️';
            if (code === 3) return '☁️';
            if ([45, 48].includes(code)) return '🌫️';
            if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
            if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
            if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
            if ([95, 96, 99].includes(code)) return '⛈️';
            return '⛅';
        }

        async function fetchWeatherByCoords(lat, lon) {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=1`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Weather API ${res.status}`);
            const data = await res.json();
            const current = data.current_weather || {};
            const daily = data.daily || {};
            const temp = Number(current.temperature);
            const weatherCode = Number(current.weathercode);
            CLIMA_REAL.temp = Number.isFinite(temp) ? Math.round(temp) : null;
            CLIMA_REAL.tempMax = Number.isFinite(Number(daily.temperature_2m_max && daily.temperature_2m_max[0])) ? Math.round(Number(daily.temperature_2m_max[0])) : null;
            CLIMA_REAL.tempMin = Number.isFinite(Number(daily.temperature_2m_min && daily.temperature_2m_min[0])) ? Math.round(Number(daily.temperature_2m_min[0])) : null;
            CLIMA_REAL.weatherCode = Number.isFinite(weatherCode) ? weatherCode : null;
            CLIMA_REAL.icon = weatherCodeToIcon(CLIMA_REAL.weatherCode);
            CLIMA_REAL.source = 'live';
            return CLIMA_REAL;
        }

        async function resolveLocationToCoords(query) {
            if (!query || !query.trim()) return null;
            const q = query.trim();
            if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q)) {
                const [latS, lonS] = q.split(',');
                return { lat: Number(latS), lon: Number(lonS), name: q };
            }
            const suggestions = await searchLocationSuggestions(q);
            const first = suggestions[0];
            if (!first) return null;
            return {
                lat: Number(first.lat),
                lon: Number(first.lon),
                name: first.name
            };
        }

        async function searchLocationSuggestions(query) {
            if (!query || query.trim().length < 2) return [];
            const q = query.trim();
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`;
            try {
                const res = await fetch(nominatimUrl, { headers: { "Accept-Language": "es" } });
                if (!res.ok) throw new Error(`Nominatim ${res.status}`);
                const list = await res.json();
                return (list || []).map((x) => ({
                    lat: Number(x.lat),
                    lon: Number(x.lon),
                    name: x.display_name
                })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
            } catch (_) {
                const openMeteoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es&format=json`;
                const res2 = await fetch(openMeteoUrl);
                if (!res2.ok) return [];
                const data = await res2.json();
                const arr = (data && data.results) || [];
                return arr.map((x) => ({
                    lat: Number(x.latitude),
                    lon: Number(x.longitude),
                    name: [x.name, x.admin1, x.country].filter(Boolean).join(', ')
                })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
            }
        }

        async function ensureLocationCoordsInBio() {
            if (!USER_BIO) return;
            if (USER_BIO.lat != null && USER_BIO.lon != null) return;
            if (!USER_BIO.ubicacion) return;
            try {
                const coords = await resolveLocationToCoords(USER_BIO.ubicacion);
                if (!coords) return;
                USER_BIO.lat = coords.lat;
                USER_BIO.lon = coords.lon;
                USER_BIO.ubicacion = coords.name || USER_BIO.ubicacion;
            } catch (e) {
                console.error("No se pudo resolver ubicacion:", e);
            }
        }

        async function initWeatherFromUserBio() {
            if (!USER_BIO) return;
            await ensureLocationCoordsInBio();
            if (USER_BIO.lat != null && USER_BIO.lon != null) {
                try { await fetchWeatherByCoords(USER_BIO.lat, USER_BIO.lon); } catch (_) {}
            }
            if (!weatherIntervalId) {
                weatherIntervalId = setInterval(async () => {
                    if (USER_BIO && USER_BIO.lat != null && USER_BIO.lon != null) {
                        try { await fetchWeatherByCoords(USER_BIO.lat, USER_BIO.lon); } catch (_) {}
                    }
                }, 15 * 60 * 1000);
            }
        }

        async function usarUbicacionActualOnboarding() {
            const statusEl = document.getElementById('onb-location-status');
            if (!navigator.geolocation) {
                statusEl.textContent = 'Tu navegador no soporta geolocalización.';
                return;
            }
            statusEl.textContent = 'Detectando ubicación...';
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(5));
                const lon = Number(pos.coords.longitude.toFixed(5));
                onboardingLocation = { lat, lon };
                document.getElementById('onb-location').value = `${lat}, ${lon}`;
                try {
                    const clima = await fetchWeatherByCoords(lat, lon);
                    statusEl.textContent = `Ubicación detectada. Tiempo actual: ${clima.icon} ${clima.temp ?? '?'}°C`;
                } catch (_) {
                    statusEl.textContent = 'Ubicación detectada, pero no se pudo leer el clima ahora.';
                }
            }, (err) => {
                statusEl.textContent = `No se pudo detectar la ubicación (${err.message || 'permiso denegado'}).`;
            }, { enableHighAccuracy: true, timeout: 10000 });
        }

        async function renderLocationSuggestions(query, suggestionsContainerId, onPick) {
            const box = document.getElementById(suggestionsContainerId);
            if (!box) return;
            if (!query || query.trim().length < 2) {
                box.classList.add('hidden');
                box.innerHTML = '';
                return;
            }
            const items = await searchLocationSuggestions(query);
            if (!items.length) {
                box.classList.remove('hidden');
                box.innerHTML = `<div class="px-3 py-2 text-xs text-gray-400">Sin resultados para "${query}"</div>`;
                return;
            }
            box.classList.remove('hidden');
            box.innerHTML = items.map((it, idx) =>
                `<button type="button" class="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-gray-100 last:border-0" data-loc-idx="${idx}" data-lat="${it.lat}" data-lon="${it.lon}" data-name="${it.name.replace(/"/g, '&quot;')}">${it.name}</button>`
            ).join('');
            box.querySelectorAll('button[data-loc-idx]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const picked = {
                        lat: Number(btn.getAttribute('data-lat')),
                        lon: Number(btn.getAttribute('data-lon')),
                        name: btn.getAttribute('data-name')
                    };
                    box.classList.add('hidden');
                    box.innerHTML = '';
                    await onPick(picked);
                });
            });
        }

        function initOnboardingLocationAutocomplete() {
            const input = document.getElementById('onb-location');
            if (!input || input.dataset.autoBound === '1') return;
            input.dataset.autoBound = '1';
            input.addEventListener('input', () => {
                clearTimeout(onbLocTimer);
                const query = input.value.trim();
                onbLocTimer = setTimeout(() => {
                    renderLocationSuggestions(query, 'onb-location-suggestions', async (picked) => {
                        onboardingLocation = { lat: picked.lat, lon: picked.lon };
                        input.value = picked.name;
                        const statusEl = document.getElementById('onb-location-status');
                        try {
                            const clima = await fetchWeatherByCoords(picked.lat, picked.lon);
                            if (statusEl) statusEl.textContent = `Ubicación: ${picked.name} · ${clima.icon} ${clima.temp ?? '?'}°C`;
                        } catch (_) {
                            if (statusEl) statusEl.textContent = `Ubicación seleccionada: ${picked.name}`;
                        }
                    });
                }, 250);
            });
        }

        const ENGINE = new BioEngine();
// FUNCIÓN QUE PROCESA LOS GRAMOS Y ACTUALIZA TU APLICACIÓN
        function agregarAlimentoAlMotor(alimento100g, gramos) {
            const factor = gramos / 100;
            
            const kcalFinal = Math.round(alimento100g.cal * factor);
            const protFinal = Math.round(alimento100g.prot * factor);
            const carbsFinal = Math.round(alimento100g.carbs * factor);
            const fatFinal = Math.round(alimento100g.fat * factor);
            const satFinal = Math.round(alimento100g.sat * factor);

            // Actualizamos barras de progreso
            actualizarMacroHTML('val-cals', 'goal-cals', 'bar-cals', kcalFinal);
            actualizarMacroHTML('val-prot', 'goal-prot', 'bar-prot', protFinal);
            actualizarMacroHTML('val-carbs', 'goal-carbs', 'bar-carbs', carbsFinal);
            actualizarMacroHTML('val-fat', 'goal-fat', 'bar-fat', fatFinal);
            actualizarMacroHTML('val-sat', 'goal-sat', 'bar-sat', satFinal);

            const spanTotal = document.getElementById('total-consumed-kcal');
            if (spanTotal) {
                const totalActual = parseInt(spanTotal.innerText) || 0;
                spanTotal.innerText = (totalActual + kcalFinal) + " kcal";
            }

            // CREAMOS LA TARJETA CON EL BOTÓN DE ELIMINAR
            const lista = document.getElementById('addedFoodsList');
            if (lista) {
                // Generamos un ID único para poder borrar este elemento exacto luego
                const idUnico = 'food-scan-' + Date.now(); 
                
                const nuevaTarjeta = `
                    <div id="${idUnico}" class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center mb-2 animate-[fadeIn_0.3s_ease-out]">
                        <div>
                            <p class="text-xs font-bold text-slate-700 leading-tight">${alimento100g.name}</p>
                            <p class="text-[10px] text-gray-400 mt-0.5"><i class="fas fa-scale-balanced mr-1"></i>${gramos}g • ${protFinal}g P / ${carbsFinal}g C / ${fatFinal}g G</p>
                        </div>
                        <div class="flex items-center gap-3 text-right">
                            <p class="text-sm font-black text-orange-500">${kcalFinal} kcal</p>
                            <button onclick="eliminarAlimentoEscaneado('${idUnico}', ${kcalFinal}, ${protFinal}, ${carbsFinal}, ${fatFinal}, ${satFinal})" class="w-7 h-7 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                `;
                lista.innerHTML = nuevaTarjeta + lista.innerHTML; 
            }

            Swal.fire({
                title: '¡Añadido!',
                text: `Se han sumado ${kcalFinal} kcal a tu día.`,
                icon: 'success',
                timer: 1800,
                showConfirmButton: false
            });
        }

        // NUEVA FUNCIÓN: ELIMINAR ALIMENTO
        function eliminarAlimentoEscaneado(idElemento, kcal, prot, carbs, fat, sat) {
            Swal.fire({
                title: '¿Eliminar alimento?',
                text: "Se restarán las calorías y macros de tu progreso de hoy.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#1e293b',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // 1. Quitamos la tarjeta de la lista visualmente
                    const tarjeta = document.getElementById(idElemento);
                    if (tarjeta) tarjeta.remove();

                    // 2. Restamos los valores enviando las cantidades en negativo
                    actualizarMacroHTML('val-cals', 'goal-cals', 'bar-cals', -kcal);
                    actualizarMacroHTML('val-prot', 'goal-prot', 'bar-prot', -prot);
                    actualizarMacroHTML('val-carbs', 'goal-carbs', 'bar-carbs', -carbs);
                    actualizarMacroHTML('val-fat', 'goal-fat', 'bar-fat', -fat);
                    actualizarMacroHTML('val-sat', 'goal-sat', 'bar-sat', -sat);

                    // 3. Restamos del total consumido
                    const spanTotal = document.getElementById('total-consumed-kcal');
                    if (spanTotal) {
                        const totalActual = parseInt(spanTotal.innerText) || 0;
                        let nuevoTotal = totalActual - kcal;
                        if (nuevoTotal < 0) nuevoTotal = 0; // Evitar que salgan números negativos
                        spanTotal.innerText = nuevoTotal + " kcal";
                    }
                }
            });
        }

        // FUNCIÓN AUXILIAR MEJORADA (Ahora soporta restar y evita bajar de cero)
        function actualizarMacroHTML(idVal, idGoal, idBar, cantidadSuma) {
            const elVal = document.getElementById(idVal);
            const elGoal = document.getElementById(idGoal);
            const elBar = document.getElementById(idBar);
            
            if (elVal && elGoal && elBar) {
                const actual = parseInt(elVal.innerText) || 0;
                const meta = parseInt(elGoal.innerText) || 1;
                
                let nuevoActual = actual + cantidadSuma;
                if (nuevoActual < 0) nuevoActual = 0; // Si restas de más, se queda en 0
                
                elVal.innerText = nuevoActual;
                
                let porcentaje = (nuevoActual / meta) * 100;
                if (porcentaje > 100) porcentaje = 100;
                
                elBar.style.width = porcentaje + '%';
            }
        }

        // ==========================================================================================
        // 📦 BASE DE DATOS
        // ==========================================================================================
    const INITIAL_STATE = {
            wakeTime: '', sleepHours: 0, sleepQuality: 0,
            water: 0,
            studySessions: [],
            mobileHours: 0, 
            steps: 0, 
            standingHours: 0, 
            runKm: 0, runPace: 5.5, runInt: 2,
            runCals: 0, bikeCals: 0, // Nuevos campos manuales
            bikeKm: 0, bikeInt: 2, 
            gymCals: 0, gymTime: 0, gymInt: 2,
            foodLog: [],
            gymSessions: [], // Array de objetos {muscle, time, int}
            stravaSyncedWorkouts: [],
            stravaTodayActivityIds: []
        };

        let todayData = JSON.parse(JSON.stringify(INITIAL_STATE));
        let BASE_GOALS = { cals: 0, prot: 160, fat: 70, sat: 20, carbs: 300, water: 2500 }; 
        let currentGoals = { ...BASE_GOALS };
        let history = [];
        let trackerWeeks = [];
        
        let mentalLoad = 0;
        let physicalLoad = 0;
        let fatigue7d = 0;
        let stressDetails = []; 
        let waterDetails = [];
        let nutritionAdvice = "";
        let studyAdvice = "";
        let mentalExplanation = "";
        let physicalExplanation = "";

        let todayAlerts = [];

        // Variables para predicción diaria
        let predictedMental = 50;
        let predictedPhysical = 50;

        // ==========================================================================================
        // 🚀 INICIALIZACIÓN
        // ==========================================================================================
        window.onload = function() {
            enrichFoodDatabase();
            initOnboardingLocationAutocomplete();
            setTimeout(() => {
                const splash = document.getElementById('splash-screen');
                if (splash) splash.style.display = 'none';
                iniciarAppNormal();
            }, 1200);
        };

        function seleccionarApp(app) {
            if (app === 'tracker') {
                window.location.href = 'tracker.html';
                return;
            }
            document.getElementById('app-selector').style.display = 'none';
            iniciarAppNormal();
        }

        function toggleAppMenu() {
            const menu = document.getElementById('app-switcher-menu');
            if (!menu) return;
            menu.classList.toggle('hidden');
        }

        function abrirAppDesdeMenu(app) {
            const menu = document.getElementById('app-switcher-menu');
            if (menu) menu.classList.add('hidden');
            if (app === 'tracker') {
                window.location.href = 'tracker.html';
                return;
            }
            iniciarAppNormal();
        }

        document.addEventListener('click', (ev) => {
            const menu = document.getElementById('app-switcher-menu');
            if (!menu || menu.classList.contains('hidden')) return;
            const titleButton = ev.target.closest('button[onclick="toggleAppMenu()"]');
            if (titleButton) return;
            if (!ev.target.closest('#app-switcher-menu')) {
                menu.classList.add('hidden');
            }
        });

        function iniciarAppNormal() {
            if (appBooted) return;
            appBooted = true;
            const splash = document.getElementById('splash-screen');
            const selector = document.getElementById('app-selector');
            if (splash) splash.style.display = 'none';
            if (selector) selector.style.display = 'none';
            loadDay();
            renderFoodCategories();
            updateHistoryUI();
            startRealTimeClock();
            startSmartMonitor();
            if (USER_BIO) {
                calculateStressBar();
                updateDay();
                calculateDailyPrediction();
                updateBodyMap();
            }
            if (!auth.currentUser) {
                document.getElementById('login-screen').style.display = 'flex';
            }
        }

        function promptExactSteps() {
            const current = Math.round(Number(todayData.steps) || 0);
            Swal.fire({
                title: 'Pasos exactos',
                html: '<p class="text-xs text-slate-500 mb-2 text-left">Introduce el total del día (0–100.000). También puedes afinar con la barra.</p>',
                input: 'number',
                inputValue: current,
                inputAttributes: { min: 0, max: 100000, step: 1 },
                showCancelButton: true,
                confirmButtonText: 'Guardar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#15803d',
                preConfirm: (v) => {
                    const n = parseInt(String(v).replace(/\D/g, ''), 10);
                    if (!Number.isFinite(n) || n < 0) {
                        Swal.showValidationMessage('Número no válido');
                        return false;
                    }
                    if (n > 100000) {
                        Swal.showValidationMessage('Máximo 100.000 pasos');
                        return false;
                    }
                    return n;
                }
            }).then((res) => {
                if (!res.isConfirmed || res.value == null) return;
                const n = Number(res.value);
                todayData.steps = n;
                const range = document.getElementById('range-steps');
                if (range) {
                    range.value = String(Math.min(n, 100000));
                }
                updateSport();
            });
        }

        function onStravaGranularitySelectChange(ev) {
            const t = ev.target;
            if (!t || !t.classList || !t.classList.contains('strava-granularity-select')) return;
            const v = t.value;
            const mod = window.__FITTRACKER_MODULES__;
            if (mod && typeof mod.writeStravaChartGranularity === 'function') {
                mod.writeStravaChartGranularity(v);
            } else {
                try {
                    sessionStorage.setItem('fittrackerStravaChartGranularity', v);
                } catch (_) {}
            }
            document.querySelectorAll('.strava-granularity-select').forEach((x) => {
                if (x !== t) x.value = v;
            });
            if (typeof window.refreshStravaChartsOnly === 'function') window.refreshStravaChartsOnly();
        }

        window.addEventListener('fittracker-modules-ready', () => {
            try {
                const sec = document.getElementById('strava');
                if (sec && sec.classList.contains('active')) refreshStravaInsightsAndCharts();
                if (!window.__ftStravaGranularityChangeBound) {
                    window.__ftStravaGranularityChangeBound = true;
                    document.addEventListener('change', onStravaGranularitySelectChange, true);
                }
            } catch (_) {}
        });

        function startRealTimeClock() {
            setInterval(() => {
                const now = new Date();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const day = now.getDate();
                const month = MONTH_NAMES[now.getMonth()];
                
                const climate = ENGINE.getClimateStress();
                const maxTxt = CLIMA_REAL.tempMax != null ? ` Máx:${CLIMA_REAL.tempMax}°` : '';
                const minTxt = CLIMA_REAL.tempMin != null ? ` Mín:${CLIMA_REAL.tempMin}°` : '';
                document.getElementById('season-indicator').innerHTML = `${hours}:${minutes} · ${day} ${month} ${climate.icon} ${climate.temp}°C${maxTxt}${minTxt}`;
            }, 1000);
        }

        function calculateDailyPrediction() {
            if (!USER_BIO) return;
            if (history.length > 0) {
                const lastDay = history[0];
                const climate = ENGINE.getClimateStress();
                
                predictedMental = ENGINE.predictMentalPerformance(lastDay);
                predictedPhysical = ENGINE.predictPhysicalPerformance(lastDay);
                
                if (climate.temp > 28) {
                    predictedPhysical -= 10;
                }
                if (climate.temp < 10) {
                    predictedMental -= 5;
                }

                // Inyectar consejo natural
                const advice = ENGINE.generateDailyAdvice(history);
                // Lo mostramos sutilmente en el header o consola por ahora, o en un alert al inicio
                console.log("Consejo Bio-Motor:", advice);
            }
        }

        // ==========================================================================================
        // 🔔 SISTEMA DE ALERTAS INTELIGENTE
        // ==========================================================================================
        function startSmartMonitor() {
            setInterval(() => {
                checkAlerts();
            }, 300000);
            
            setTimeout(checkAlerts, 2000);
        }

        function checkAlerts() {
            if (!USER_BIO) {
                todayAlerts = [];
                updateAlertCards();
                return;
            }
            const h = new Date().getHours();
            const waterPct = (todayData.water / currentGoals.water) * 100;
            const foodPct = (todayData.foodLog.reduce((a,b)=>a+b.cal, 0) / currentGoals.cals) * 100;
            
            const totalCarbs = todayData.foodLog.reduce((a,b)=>a+b.carb, 0);
            const totalProt = todayData.foodLog.reduce((a,b)=>a+b.prot, 0);
            const totalStudy = todayData.studySessions.reduce((a,b)=>a+b.hours, 0);

            todayAlerts = [];

            // ALERTAS DE AGUA
            if (h >= 12 && waterPct < 30) {
                todayAlerts.push({ type: 'water', severity: 'low', message: '¡Alerta! Muy poca agua. Bebe ahora.' });
            } else if (h < 14 && waterPct > 100) {
                todayAlerts.push({ type: 'water', severity: 'high', message: 'Vas muy rápido. Has bebido toda el agua antes de comer.' });
            } else if (todayData.runKm > 5 && waterPct < 50) {
                todayAlerts.push({ type: 'water', severity: 'low', message: `Has corrido ${todayData.runKm}km y no has bebido suficiente agua. Necesitas reponer.` });
            }

            // ALERTAS DE COMBUSTIBLE
            if (totalCarbs < currentGoals.carbs * 0.5 && todayData.runKm > 5) {
                todayAlerts.push({ type: 'nutrition', severity: 'carbs', message: 'Te faltan carbohidratos para recuperar del entrenamiento.' });
            } else if (totalCarbs < currentGoals.carbs * 0.3) {
                todayAlerts.push({ type: 'nutrition', severity: 'carbs', message: 'Muy pocos carbohidratos. Afectará tu energía.' });
            }
            
            if (totalProt < currentGoals.prot * 0.5) {
                todayAlerts.push({ type: 'nutrition', severity: 'prot', message: 'Proteína baja. Tus músculos necesitan recuperarse.' });
            }

            // ALERTA DE GIMNASIO
            if (todayData.gymTime > USER_BIO.maxGymTime * 1.5) {
                todayAlerts.push({ type: 'physical', severity: 'high', message: 'Volumen de entreno excesivo. Riesgo de sobreentrenamiento.' });
            }

            // ALERTAS COGNITIVAS
            const studyLimit = USER_BIO.edad < 25 ? 8 : 5; // Tolerancia mayor para jóvenes
            if (totalStudy > studyLimit) {
                todayAlerts.push({ type: 'cognitive', severity: 'high', message: `Has estudiado ${totalStudy}h. Necesitas carbohidratos y omega-3 para recuperar.` });
                studyAdvice = `🧠 Alta carga cognitiva (${totalStudy}h). Toma frutos secos, pescado o aguacate.`;
            } else if (totalStudy > 3) {
                studyAdvice = `📚 Has estudiado ${totalStudy}h. Mantén una buena hidratación.`;
            } else {
                studyAdvice = "✅ Carga cognitiva nominal.";
            }

            // ALERTA DE COMIDA GENERAL
            if (h >= 15 && foodPct < 30) {
                todayAlerts.push({ type: 'food', severity: 'low', message: 'Has comido muy poco. El cuerpo entrará en reserva.' });
            }

            updateAlertCards();
        }

        function updateAlertCards() {
            const waterCard = document.getElementById('water-home-card');
            const foodCard = document.getElementById('food-home-card');

            waterCard.classList.remove('alert-water-low', 'alert-water-high', 'border-b-4', 'border-blue-400');
            foodCard.classList.remove('alert-food-low', 'alert-nutrition', 'border-b-4', 'border-orange-500');

            let waterAlert = todayAlerts.find(a => a.type === 'water');
            if (waterAlert) {
                if (waterAlert.severity === 'low') {
                    waterCard.classList.add('alert-water-low');
                } else if (waterAlert.severity === 'high') {
                    waterCard.classList.add('alert-water-high');
                }
            } else {
                waterCard.classList.add('border-b-4', 'border-blue-400');
            }

            let nutritionAlert = todayAlerts.find(a => a.type === 'nutrition');
            let foodAlert = todayAlerts.find(a => a.type === 'food');
            let cognitiveAlert = todayAlerts.find(a => a.type === 'cognitive');
            
            if (nutritionAlert || foodAlert || cognitiveAlert) {
                foodCard.classList.add('alert-nutrition');
            } else {
                foodCard.classList.add('border-b-4', 'border-orange-500');
            }
        }

        function getWaterAdvice() {
            const h = new Date().getHours();
            const waterPct = (todayData.water / currentGoals.water) * 100;
            const remaining = currentGoals.water - todayData.water;
            
            let expectedPct = 0;
            if (h < 10) expectedPct = 20;
            else if (h < 14) expectedPct = 40;
            else if (h < 18) expectedPct = 60;
            else if (h < 22) expectedPct = 80;
            else expectedPct = 100;
            
            if (h >= 20) {
                if (waterPct < 50) {
                    return `🌙 Son las ${h}:00, has bebido solo ${todayData.water}ml de ${Math.round(currentGoals.water)}ml. Te quedan ${Math.round(remaining)}ml por beber antes de dormir. ¡Bebe ahora!`;
                } else if (waterPct >= 90) {
                    return `🌙 Son las ${h}:00, has bebido ${todayData.water}ml. ¡Bien! Ya casi llegas a la meta.`;
                } else {
                    return `🌙 Son las ${h}:00, llevas ${todayData.water}ml. Te quedan ${Math.round(remaining)}ml para hoy.`;
                }
            } else if (h >= 12) {
                if (waterPct < 40) {
                    return `☀️ Son las ${h}:00 y solo has bebido ${todayData.water}ml. Deberías llevar al menos ${Math.round(currentGoals.water * 0.5)}ml a estas horas. ¡Hidrátate!`;
                } else if (todayData.runKm > 0 && waterPct < 60) {
                    return `🏃 Has hecho deporte y solo llevas ${todayData.water}ml. Necesitas más agua para recuperar.`;
                } else if (waterPct > 80) {
                    return `☀️ Son las ${h}:00 y ya has bebido ${todayData.water}ml. Vas muy bien, pero no te pases.`;
                } else {
                    return `☀️ Son las ${h}:00, llevas ${todayData.water}ml. Objetivo: ${Math.round(currentGoals.water)}ml. Sigue así.`;
                }
            } else {
                if (waterPct === 0) {
                    return `🌅 Son las ${h}:00 y aún no has bebido agua. Empieza el día hidratándote.`;
                } else {
                    return `🌅 Son las ${h}:00, buen comienzo con ${todayData.water}ml. Sigue bebiendo a lo largo del día.`;
                }
            }
        }

        // ==========================================================================================
        // 💊 LÓGICA DE VITAMINAS Y MICRONUTRIENTES
        // ==========================================================================================
        
        // Función para enriquecer la base de datos existente con estimaciones de vitaminas
        function enrichFoodDatabase() {
            for (const cat in foodDatabase) {
                foodDatabase[cat].forEach(food => {
                    if (!food.micros) {
                        food.micros = estimateMicros(food.name, cat);
                    }
                });
            }
        }

        function estimateMicros(name, cat) {
            // Generador heurístico de vitaminas basado en categoría y nombre
            let m = { ...MICRO_DEFS }; // Copia estructura
            // Inicializar a 0 o trazas
            Object.keys(m).forEach(k => m[k] = 0);

            const n = name.toLowerCase();
            const c = cat.toLowerCase();

            // --- ANÁLISIS DETALLADO POR ALIMENTO (Base 100g aprox) ---

            // 1. FRUTAS Y VERDURAS (Vitaminas C, A, K, Potasio, Magnesio)
            if (n.includes('naranja') || n.includes('limon') || n.includes('mandarina') || n.includes('pomelo')) {
                m.vitC = 53; m.vitA = 11; m.vitB9 = 30; m.calcium = 40;
            }
            else if (n.includes('kiwi')) {
                m.vitC = 93; m.vitK = 40; m.vitE = 1.5; m.magnesium = 17;
            }
            else if (n.includes('fresa') || n.includes('arandano') || n.includes('frambuesa') || n.includes('mora')) {
                m.vitC = 58; m.vitK = 2.2; m.magnesium = 13; m.vitB9 = 24;
            }
            else if (n.includes('platano') || n.includes('banana')) {
                m.magnesium = 27; m.vitB6 = 0.4; m.vitC = 8.7; m.vitB9 = 20;
            }
            else if (n.includes('zanahoria') || n.includes('calabaza') || n.includes('boniato')) {
                m.vitA = 835; m.vitK = 13; m.vitB6 = 0.1; m.vitC = 6;
            }
            else if (n.includes('espinaca') || n.includes('acelga') || n.includes('kale')) {
                m.vitK = 483; m.vitA = 469; m.vitB9 = 194; m.magnesium = 79; m.iron = 2.7; m.vitC = 28; m.calcium = 99;
            }
            else if (n.includes('brocoli') || n.includes('coliflor')) {
                m.vitC = 89; m.vitK = 101; m.vitB9 = 63; m.vitA = 31; m.magnesium = 21;
            }
            else if (n.includes('tomate')) {
                m.vitC = 14; m.vitA = 42; m.vitK = 7.9; m.vitB6 = 0.1;
            }
            else if (n.includes('pimiento')) {
                m.vitC = 128; m.vitA = 157; m.vitB6 = 0.3; m.vitB9 = 11;
            }
            else if (n.includes('aguacate')) {
                m.vitE = 2.1; m.vitK = 21; m.vitC = 10; m.vitB5 = 1.4; m.vitB6 = 0.3; m.vitB9 = 81; m.magnesium = 29;
            }

            // 2. CARNES (B12, Hierro, Zinc, B6, B3)
            else if (n.includes('higado') || n.includes('paté')) {
                m.vitA = 6000; m.vitB12 = 60; m.iron = 12; m.zinc = 4; m.vitB2 = 2.5; m.vitB9 = 200; // Superalimento
            }
            else if (n.includes('ternera') || n.includes('buey') || n.includes('roja')) {
                m.vitB12 = 2.6; m.zinc = 6; m.iron = 2.6; m.vitB3 = 5; m.vitB6 = 0.4; m.vitB2 = 0.2;
            }
            else if (n.includes('pollo') || n.includes('pavo')) {
                m.vitB3 = 11; m.vitB6 = 0.6; m.vitB12 = 0.3; m.zinc = 1; m.magnesium = 23; m.iron = 1;
            }
            else if (n.includes('cerdo') || n.includes('jamon')) {
                m.vitB1 = 0.7; m.vitB3 = 5; m.vitB6 = 0.4; m.vitB12 = 0.7; m.zinc = 2.5; m.iron = 0.9;
            }

            // 3. PESCADOS (Omega-3, D, B12, Yodo)
            else if (n.includes('salmon') || n.includes('trucha')) {
                m.omega3 = 2.3; m.vitD = 11; m.vitB12 = 3.2; m.vitB3 = 8; m.vitB6 = 0.6; m.magnesium = 27;
            }
            else if (n.includes('atun') || n.includes('bonito')) {
                m.vitB12 = 2.2; m.vitB3 = 13; m.vitD = 1.7; m.omega3 = 0.8; m.iron = 1.3; m.magnesium = 35;
            }
            else if (n.includes('sardina') || n.includes('boqueron')) {
                m.vitB12 = 8.9; m.vitD = 4.8; m.calcium = 380; m.omega3 = 1.4; m.iron = 2.9;
            }
            else if (n.includes('merluza') || n.includes('bacalao') || n.includes('blanco')) {
                m.vitB12 = 1.1; m.vitB3 = 2.5; m.magnesium = 20; m.calcium = 15;
            }
            else if (n.includes('gamba') || n.includes('langostino') || n.includes('mejillon')) {
                m.vitB12 = 12; m.iron = 3; m.zinc = 1.6; m.magnesium = 37; m.calcium = 50;
            }

            // 4. LÁCTEOS Y HUEVOS (Calcio, D, B2, B12)
            else if (n.includes('leche') || n.includes('yogur') || n.includes('kefir')) {
                m.calcium = 120; m.vitB2 = 0.2; m.vitB12 = 0.5; m.vitD = 1; m.vitA = 30; m.zinc = 0.4;
            }
            else if (n.includes('queso')) {
                m.calcium = 700; m.vitB12 = 1.5; m.vitA = 200; m.zinc = 3; m.vitB2 = 0.4;
                if(n.includes('fresco') || n.includes('burgos')) m.calcium = 150;
            }
            else if (n.includes('huevo') || n.includes('yema')) {
                m.vitD = 2; m.vitB12 = 0.9; m.vitA = 160; m.vitB2 = 0.5; m.vitB5 = 1.5; m.vitB7 = 20; m.iron = 1.8; m.zinc = 1.3;
            }
            else if (n.includes('clara')) {
                m.vitB2 = 0.4; m.magnesium = 11;
            }

            // 5. FRUTOS SECOS Y SEMILLAS (Magnesio, E, Grasas buenas)
            else if (n.includes('almendra')) {
                m.vitE = 26; m.magnesium = 270; m.calcium = 269; m.vitB2 = 1.1; m.iron = 3.7; m.zinc = 3.1;
            }
            else if (n.includes('nuez') || n.includes('nueces')) {
                m.omega3 = 9; m.magnesium = 158; m.vitB6 = 0.5; m.iron = 2.9; m.zinc = 3.1;
            }
            else if (n.includes('cacahuete') || n.includes('mani')) {
                m.vitB3 = 12; m.vitE = 8; m.magnesium = 168; m.vitB9 = 240; m.zinc = 3.3;
            }
            else if (n.includes('semilla') || n.includes('pipa')) {
                m.magnesium = 300; m.iron = 8; m.zinc = 7; m.vitE = 10;
            }

            // 6. LEGUMBRES Y CEREALES (Hierro, Magnesio, B1, B9)
            else if (n.includes('lenteja')) {
                m.iron = 3.3; m.vitB9 = 181; m.magnesium = 36; m.vitB1 = 0.3; m.zinc = 1.3;
            }
            else if (n.includes('garbanzo')) {
                m.vitB9 = 172; m.iron = 2.9; m.magnesium = 48; m.vitB6 = 0.1; m.zinc = 1.5;
            }
            else if (n.includes('judia') || n.includes('frijol')) {
                m.iron = 2; m.magnesium = 40; m.vitB1 = 0.2;
            }
            else if (n.includes('avena')) {
                m.magnesium = 177; m.iron = 4.7; m.zinc = 4; m.vitB1 = 0.7; m.vitB5 = 1.3;
            }
            else if (n.includes('arroz') && n.includes('integral')) {
                m.magnesium = 43; m.vitB3 = 2.6; m.vitB6 = 0.1;
            }
            else if (n.includes('pan') && n.includes('integral')) {
                m.magnesium = 50; m.iron = 2.5; m.vitB3 = 4;
            }

            // 7. OTROS
            else if (n.includes('chocolate') && n.includes('negro')) {
                m.magnesium = 228; m.iron = 11.9; m.zinc = 3.3;
            }
            else if (n.includes('aceite de oliva')) {
                m.vitE = 14; m.vitK = 60;
            }

            return m;
        }

        function calculateMicros() {
            let totals = {};
            Object.keys(MICRO_DEFS).forEach(k => totals[k] = 0);

            todayData.foodLog.forEach(f => {
                if (f && f.noMicros) return;
                // Si el alimento del log no tiene micros (añadido antes de la actualización), estimarlos
                let micros = f.micros;
                if (!micros) micros = estimateMicros(f.name, 'General');

                // Escalar por peso consumido (la base suele ser por 100g o por unidad definida, aquí simplificamos asumiendo que estimateMicros devuelve por 100g aprox)
                const ratio = f.weight / 100; 

                Object.keys(totals).forEach(k => {
                    if (micros[k]) totals[k] += (micros[k] * ratio);
                });
            });
            return totals;
        }

        /** Si hay alimentos del catálogo global sin micros, no inferir déficits vitamínicos en consejos. */
        function foodLogHasServerEntriesWithoutMicros() {
            return (todayData.foodLog || []).some((f) => f && f.noMicros);
        }

        function showMicros() {
            const modal = document.getElementById('micro-modal');
            const body = document.getElementById('micro-body');
            const totals = calculateMicros();
            
            let html = '';
            
            // Agrupar por tipo
            const groups = { 'fat': 'Liposolubles (Acumulables)', 'water': 'Hidrosolubles (Diarias)', 'min': 'Minerales' };
            
            Object.keys(groups).forEach(type => {
                html += `<h4 class="font-bold text-slate-700 uppercase text-xs tracking-wider mb-3 mt-2 border-b border-gray-200 pb-1">${groups[type]}</h4>`;
                html += `<div class="grid grid-cols-1 gap-4 mb-6">`;
                
                Object.keys(MICRO_DEFS).filter(k => MICRO_DEFS[k].type === type).forEach(k => {
                    const def = MICRO_DEFS[k];
                    const val = totals[k];
                    // Ajuste objetivo por sexo/edad/peso/meta
                    let rda = getMicronutrientTarget(k);
                    
                    const pct = Math.min((val / rda) * 100, 100);
                    let color = 'bg-blue-500';
                    if (pct < 30) color = 'bg-red-400';
                    else if (pct < 70) color = 'bg-yellow-400';
                    else color = 'bg-green-500';

                    // Lógica de acumulación (visual)
                    let accumText = "";
                    if (type === 'fat' && pct > 100) accumText = `<span class="text-[10px] text-green-600 ml-2"><i class="fas fa-check-circle"></i> Reserva llena</span>`;

                    html += `
                        <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                            <div class="flex justify-between items-end mb-1">
                                <div>
                                    <span class="font-bold text-slate-700 text-sm block">${def.name}</span>
                                    <span class="text-[10px] text-gray-400 leading-tight block">${def.desc}</span>
                                </div>
                                <div class="text-right">
                                    <span class="font-mono text-xs font-bold text-slate-600">${val.toFixed(1)} / ${rda}${def.unit}</span>
                                </div>
                            </div>
                            <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden relative">
                                <div class="${color} h-full rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
                            </div>
                            ${accumText}
                        </div>
                    `;
                });
                html += `</div>`;
            });

            body.innerHTML = html;
            modal.classList.add('open');
        }

        function closeMicros() {
            document.getElementById('micro-modal').classList.remove('open');
        }

        function editUserProfile() {
            const __bioSnapshot = USER_BIO ? JSON.parse(JSON.stringify(USER_BIO)) : null;
            Swal.fire({
                title: 'Editar Perfil Biológico',
                html: `
                    <div class="grid grid-cols-2 gap-3 text-left">
                        <div>
                            <label class="text-xs font-bold text-gray-500">Género</label>
                            <select id="swal-user-gen" class="w-full border p-2 rounded mb-2">
                                <option value="hombre" ${USER_BIO.genero === 'hombre' ? 'selected' : ''}>Hombre</option>
                                <option value="mujer" ${USER_BIO.genero === 'mujer' ? 'selected' : ''}>Mujer</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500">Fecha de nacimiento</label>
                            <input id="swal-user-birthdate" type="date" class="w-full border p-2 rounded mb-2" value="${USER_BIO.fechaNacimiento || ''}">
                            <p class="text-[11px] text-gray-500 -mt-1 mb-2">Edad actual: <span id="swal-user-age-preview">${USER_BIO.edad || 18}</span> años</p>
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500">Peso (kg)</label>
                            <input id="swal-user-w" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.peso}">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500">Altura (cm)</label>
                            <input id="swal-user-h" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.altura}">
                        </div>
                         <div>
                            <label class="text-xs font-bold text-gray-500">% Grasa</label>
                            <input id="swal-user-f" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.grasa}">
                        </div>
                         <div>
                            <label class="text-xs font-bold text-gray-500">Músculo (kg)</label>
                            <input id="swal-user-m" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.masaMuscular}">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500">Max Run (km)</label>
                            <input id="swal-user-maxrun" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.maxRunKm}">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500">Max Gym (min)</label>
                            <input id="swal-user-maxgym" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.maxGymTime}">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500">Max Bici (km)</label>
                            <input id="swal-user-maxbike" type="number" class="w-full border p-2 rounded mb-2" value="${USER_BIO.maxBikeKm}">
                        </div>
                        <div class="col-span-2">
                            <label class="text-xs font-bold text-gray-500">Objetivo Principal</label>
                            <select id="swal-user-goal" class="w-full border p-2 rounded mb-2 font-bold text-slate-700">
                                <option value="fat_loss" ${USER_BIO.goal === 'fat_loss' ? 'selected' : ''}>📉 Perder Grasa (Definición)</option>
                                <option value="maintenance" ${(!USER_BIO.goal || USER_BIO.goal === 'maintenance') ? 'selected' : ''}>⚖️ Mantenimiento / Salud</option>
                                <option value="muscle_gain" ${USER_BIO.goal === 'muscle_gain' ? 'selected' : ''}>💪 Ganar Masa Muscular (Volumen)</option>
                            </select>
                        </div>
                        <div class="col-span-2" id="swal-user-goal-speed-group">
                            <label class="text-xs font-bold text-gray-500">Ritmo del objetivo</label>
                            <div class="grid grid-cols-3 gap-2 mt-1">
                                <button type="button" data-speed="slow" class="swal-speed-btn text-center p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-200 transition">Lento</button>
                                <button type="button" data-speed="moderate" class="swal-speed-btn text-center p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-200 transition">Intermedio</button>
                                <button type="button" data-speed="fast" class="swal-speed-btn text-center p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-200 transition">Rápido</button>
                            </div>
                            <select id="swal-user-goal-speed" class="hidden">
                                <option value="slow">Lento</option>
                                <option value="moderate">Intermedio</option>
                                <option value="fast">Rápido</option>
                            </select>
                        </div>
                        <div id="swal-clinical-alert" class="col-span-2 hidden rounded-2xl border p-4"></div>
                        <div class="col-span-2" id="swal-activity-section">
                            <label class="text-xs font-bold text-gray-500">Actividad diaria</label>
                            <button type="button" id="swal-start-activity-quiz-btn" class="w-full text-left bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition flex justify-between items-center">
                                <span><i class="fas fa-question-circle mr-2"></i>Recalcular actividad diaria</span>
                                <i class="fas fa-chevron-right text-xs"></i>
                            </button>
                            <input type="hidden" id="swal-user-activity-level" value="${USER_BIO.activityLevel || 'moderate'}">
                            <div id="swal-activity-quiz-container" class="hidden bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-4 mt-2">
                                <div class="quiz-progress"><div id="swal-quiz-progress" class="quiz-progress-fill"></div></div>
                                <div id="swal-quiz-stage" class="quiz-stage"></div>
                                <div class="text-right">
                                    <button type="button" onclick="skipSwalActivityQuiz()" class="text-xs text-slate-500 hover:text-slate-700">Omitir cuestionario</button>
                                </div>
                            </div>
                            <div id="swal-activity-summary" class="bg-white border border-slate-200 rounded-3xl p-4 text-sm text-slate-700 mt-2">
                                <!-- Summary will be rendered here -->
                            </div>
                            <p class="text-[11px] text-gray-500 mt-1">Tu nivel actual es: <span id="swal-current-activity-label" class="font-bold"></span></p>
                        </div>
                        <div id="swal-user-goal-summary" class="col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-4 text-sm text-slate-700 hidden"></div>
                        <div class="col-span-2">
                            <label class="text-xs font-bold text-gray-500">Ubicación para clima real</label>
                            <div class="flex gap-2">
                                <input id="swal-user-location" type="text" class="w-full border p-2 rounded mb-2" value="${USER_BIO.ubicacion || ''}" placeholder="Ciudad o lat,lon">
                                <button type="button" id="swal-detect-location-btn" class="px-3 h-[42px] rounded bg-blue-100 text-blue-700 text-xs font-bold">Detectar</button>
                            </div>
                            <div id="swal-user-location-suggestions" class="bg-white border border-gray-200 rounded-lg hidden max-h-36 overflow-y-auto mb-2"></div>
                            <p id="swal-user-location-status" class="text-[11px] text-gray-500 -mt-1 mb-2">Usa Detectar para fijar temperatura exacta de tu zona.</p>
                        </div>

                        <!-- ============================= -->
                        <!-- STRAVA: Conectar con Strava   -->
                        <!-- ============================= -->
                        <div class="col-span-2">
                            <label class="text-xs font-bold text-gray-500">Strava</label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                <button type="button"
                                    id="strava-connect-btn"
                                    onclick="startStravaConnect()"
                                    class="w-full rounded-xl px-4 py-3 text-sm font-black text-white shadow-lg active:scale-[0.99] transition flex items-center justify-center gap-2"
                                    style="background: linear-gradient(135deg, #fc4c02, #ff7a45);">
                                    <i class="fab fa-strava"></i> Conectar con Strava
                                </button>
                                <button type="button"
                                    id="strava-disconnect-btn"
                                    onclick="desconectarStrava()"
                                    class="w-full rounded-xl px-4 py-3 text-sm font-black text-slate-700 bg-slate-100 border border-slate-200 shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2">
                                    <i class="fas fa-link-slash"></i> Desconectar
                                </button>
                            </div>
                            <div id="strava-connect-status" class="mt-2 text-[11px] text-slate-600">
                                Conecta Strava para ajustar agua y macros automáticamente.
                            </div>
                        </div>

                    </div>
                `,
                confirmButtonText: 'Guardar y Recalcular',
                showDenyButton: true,
                denyButtonText: 'Cerrar sesión',
                denyButtonColor: '#ef4444',
                didOpen: () => {
                    window.__swalDetectedLocation = null;
                    try { if (typeof updateStravaConnectUI === 'function') updateStravaConnectUI(); } catch (_) {}

                    const renderSwalClinicalAlert = () => {
                        const box = document.getElementById('swal-clinical-alert');
                        if (!box) return;
                        const gender = document.getElementById('swal-user-gen')?.value || 'hombre';
                        const birth = document.getElementById('swal-user-birthdate')?.value;
                        const age = birth ? calcularEdad(birth) : (USER_BIO?.edad || 25);
                        const weight = Number(document.getElementById('swal-user-w')?.value) || 0;
                        const height = Number(document.getElementById('swal-user-h')?.value) || 0;
                        const bodyFat = Number(document.getElementById('swal-user-f')?.value);
                        const muscleKg = Number(document.getElementById('swal-user-m')?.value);
                        const goal = document.getElementById('swal-user-goal')?.value || 'maintenance';

                        if (!weight || !height) {
                            box.classList.add('hidden');
                            return;
                        }

                        const alert = getClinicalAlert({ gender, age, weight, height, goal, bodyFat, muscleKg });
                        box.className = `col-span-2 rounded-2xl border p-4 ${alert.color.border} ${alert.color.bg} ${alert.color.text}`;
                        box.innerHTML = `
                            <div class="flex items-start gap-3">
                                <div class="w-9 h-9 rounded-xl ${alert.color.badge} text-white flex items-center justify-center font-black">
                                    ${alert.level === 'danger' ? '<i class="fas fa-triangle-exclamation"></i>' : alert.level === 'warn' ? '<i class="fas fa-circle-exclamation"></i>' : '<i class="fas fa-shield-heart"></i>'}
                                </div>
                                <div class="flex-1">
                                    <div class="text-sm font-black">${alert.title}</div>
                                    <div class="text-[13px] leading-5 mt-1">
                                        ${alert.message}
                                        <div class="mt-2 font-semibold">${alert.bmiText}</div>
                                        ${alert.idealText ? `<div class="mt-1 text-[12px] opacity-90">${alert.idealText}</div>` : ''}
                                    </div>
                                    ${alert.recommendationGoal
                                        ? `<button type="button" id="swal-apply-recommended-goal" class="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 border border-white/60 font-black text-[12px] hover:bg-white transition">
                                               <i class="fas fa-wand-magic-sparkles"></i> ${alert.recommendationGoal === 'fat_loss' ? 'Cambiar a Perder Grasa' : alert.recommendationGoal === 'muscle_gain' ? 'Cambiar a Ganar Masa' : 'Aplicar objetivo recomendado'}
                                           </button>`
                                        : ''}
                                </div>
                            </div>
                        `;
                        box.classList.remove('hidden');

                        const btn = document.getElementById('swal-apply-recommended-goal');
                        if (btn && alert.recommendationGoal) {
                            btn.onclick = () => {
                                const goalEl = document.getElementById('swal-user-goal');
                                if (goalEl) {
                                    goalEl.value = alert.recommendationGoal;
                                    goalEl.dispatchEvent(new Event('change'));
                                }
                            };
                        }
                    };

                    const applySwalDraftBioToGlobal = () => {
                        try {
                            const birth = document.getElementById('swal-user-birthdate')?.value;
                            const draft = {
                                genero: document.getElementById('swal-user-gen')?.value || (USER_BIO?.genero || 'hombre'),
                                fechaNacimiento: birth || (USER_BIO?.fechaNacimiento || null),
                                edad: birth ? calcularEdad(birth) : (USER_BIO?.edad || 18),
                                peso: Number(document.getElementById('swal-user-w')?.value) || (USER_BIO?.peso || 70),
                                altura: Number(document.getElementById('swal-user-h')?.value) || (USER_BIO?.altura || 170),
                                grasa: Number(document.getElementById('swal-user-f')?.value) || (USER_BIO?.grasa || 15),
                                masaMuscular: Number(document.getElementById('swal-user-m')?.value) || (USER_BIO?.masaMuscular || 30),
                                maxRunKm: Number(document.getElementById('swal-user-maxrun')?.value) || (USER_BIO?.maxRunKm || 0),
                                maxGymTime: Number(document.getElementById('swal-user-maxgym')?.value) || (USER_BIO?.maxGymTime || 60),
                                maxBikeKm: Number(document.getElementById('swal-user-maxbike')?.value) || (USER_BIO?.maxBikeKm || 0),
                                goalSpeed: document.getElementById('swal-user-goal-speed')?.value || (USER_BIO?.goalSpeed || 'moderate'),
                                goal: document.getElementById('swal-user-goal')?.value || (USER_BIO?.goal || 'maintenance'),
                                activityLevel: (swalActivityLevelResult || document.getElementById('swal-user-activity-level')?.value || USER_BIO?.activityLevel || 'moderate')
                            };
                            USER_BIO = { ...USER_BIO, ...draft };
                            ENGINE.recalculateEverything({ shouldSaveDay: false });
                        } catch (e) {
                            console.error("applySwalDraftBioToGlobal fallo:", e);
                        }
                    };

                    const bindLive = (id, evt = 'input') => {
                        const el = document.getElementById(id);
                        if (!el) return;
                        el.addEventListener(evt, () => {
                            renderSwalClinicalAlert();
                            syncProfileGoalPreview();
                            applySwalDraftBioToGlobal();
                        });
                    };

                    const birth = document.getElementById('swal-user-birthdate');
                    if (birth) {
                        birth.addEventListener('change', () => {
                            const age = birth.value ? calcularEdad(birth.value) : (USER_BIO.edad || 18);
                            const preview = document.getElementById('swal-user-age-preview');
                            if (preview) preview.textContent = String(age);
                        });
                    }
                    const detectBtn = document.getElementById('swal-detect-location-btn');
                    if (detectBtn) {
                        detectBtn.addEventListener('click', detectarUbicacionPerfilModal);
                    }
                    const locInput = document.getElementById('swal-user-location');
                    if (locInput) {
                        locInput.addEventListener('input', () => {
                            clearTimeout(swalLocTimer);
                            const q = locInput.value.trim();
                            swalLocTimer = setTimeout(() => {
                                renderLocationSuggestions(q, 'swal-user-location-suggestions', async (picked) => {
                                    window.__swalDetectedLocation = { lat: picked.lat, lon: picked.lon };
                                    locInput.value = picked.name;
                                    const status = document.getElementById('swal-user-location-status');
                                    try {
                                        const clima = await fetchWeatherByCoords(picked.lat, picked.lon);
                                        if (status) status.textContent = `Detectada: ${clima.icon} ${clima.temp ?? '?'}°C`;
                                    } catch (_) {
                                        if (status) status.textContent = `Ubicación seleccionada: ${picked.name}`;
                                    }
                                });
                            }, 250);
                        });
                    }

                    const swalStartQuizBtn = document.getElementById('swal-start-activity-quiz-btn');
                    if (swalStartQuizBtn) {
                        swalStartQuizBtn.addEventListener('click', startSwalActivityQuiz);
                    }

                    // Lógica para los botones de ritmo
                    const speedButtons = document.querySelectorAll('.swal-speed-btn');
                    const speedSelect = document.getElementById('swal-user-goal-speed');
                    
                    const updateSpeedSelection = (speed) => {
                        speedSelect.value = speed;
                        speedButtons.forEach(btn => {
                            btn.classList.toggle('bg-blue-600', btn.dataset.speed === speed);
                            btn.classList.toggle('text-white', btn.dataset.speed === speed);
                            btn.classList.toggle('bg-slate-100', btn.dataset.speed !== speed);
                            btn.classList.toggle('text-slate-700', btn.dataset.speed !== speed);
                        });
                        syncProfileGoalPreview();
                        renderSwalClinicalAlert();
                        applySwalDraftBioToGlobal();
                    };

                    speedButtons.forEach(btn => btn.addEventListener('click', () => updateSpeedSelection(btn.dataset.speed)));
                    updateSpeedSelection(USER_BIO.goalSpeed || 'moderate');

                    const swalGoal = document.getElementById('swal-user-goal');
                    const swalSpeed = document.getElementById('swal-user-goal-speed');
                    const swalActivity = document.getElementById('swal-user-activity-level');
                    const swalActivitySummary = document.getElementById('swal-activity-summary');
                    if (swalGoal) swalGoal.addEventListener('change', () => {
                        syncProfileGoalPreview();
                        toggleGoalSpeedField('swal-user');
                        renderSwalClinicalAlert();
                        applySwalDraftBioToGlobal();
                    });
                    if (swalSpeed) swalSpeed.addEventListener('change', syncProfileGoalPreview);
                    if (swalActivity) swalActivity.addEventListener('change', syncProfileGoalPreview);
                    syncProfileGoalPreview();
                    renderSwalActivitySummary(USER_BIO.activityLevel || 'moderate'); // Initial render of activity summary
                    toggleGoalSpeedField('swal-user');
                    renderSwalClinicalAlert();

                    bindLive('swal-user-gen', 'change');
                    bindLive('swal-user-birthdate', 'change');
                    bindLive('swal-user-w', 'input');
                    bindLive('swal-user-h', 'input');
                    bindLive('swal-user-f', 'input');
                    bindLive('swal-user-m', 'input');
                    bindLive('swal-user-maxrun', 'input');
                    bindLive('swal-user-maxgym', 'input');
                    bindLive('swal-user-maxbike', 'input');

                    // Hide quiz container initially
                    document.getElementById('swal-activity-quiz-container').classList.add('hidden');
                },
                preConfirm: async () => {
                    const birthdate = document.getElementById('swal-user-birthdate').value;
                    const locationText = document.getElementById('swal-user-location').value || (USER_BIO.ubicacion || "España");
                    let pickedCoords = (window.__swalDetectedLocation && window.__swalDetectedLocation.lat != null)
                        ? window.__swalDetectedLocation
                        : null;
                    if (!pickedCoords && locationText && locationText !== (USER_BIO.ubicacion || "")) {
                        const resolved = await resolveLocationToCoords(locationText);
                        if (resolved) pickedCoords = { lat: resolved.lat, lon: resolved.lon, name: resolved.name };
                    }
                    return {
                        genero: document.getElementById('swal-user-gen').value,
                        fechaNacimiento: birthdate || USER_BIO.fechaNacimiento || null,
                        edad: birthdate ? calcularEdad(birthdate) : (USER_BIO.edad || 18),
                        peso: Number(document.getElementById('swal-user-w').value),
                        altura: Number(document.getElementById('swal-user-h').value),
                        grasa: Number(document.getElementById('swal-user-f').value),
                        masaMuscular: Number(document.getElementById('swal-user-m').value),
                        maxRunKm: Number(document.getElementById('swal-user-maxrun').value),
                        maxGymTime: Number(document.getElementById('swal-user-maxgym').value),
                        maxBikeKm: Number(document.getElementById('swal-user-maxbike').value),
                        ubicacion: (pickedCoords && pickedCoords.name) ? pickedCoords.name : locationText,
                        lat: pickedCoords ? pickedCoords.lat : ((USER_BIO.lat != null) ? USER_BIO.lat : null),
                        lon: pickedCoords ? pickedCoords.lon : ((USER_BIO.lon != null) ? USER_BIO.lon : null),
                        goalSpeed: document.getElementById('swal-user-goal-speed').value || 'moderate',
                        goal: document.getElementById('swal-user-goal').value,
                        activityLevel: swalActivityLevelResult || document.getElementById('swal-user-activity-level').value || 'moderate',
                    };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    USER_BIO = { ...USER_BIO, ...result.value };
                    await ensureLocationCoordsInBio();
                    await guardarDatosUsuario();
                    await initWeatherFromUserBio();
                    ENGINE.recalculateEverything({ shouldSaveDay: true });
                    Swal.fire('Perfil Actualizado', `Las metas de agua y calorías se han ajustado a tu nueva biología. ${getGoalSpeedAdvice(USER_BIO.goalSpeed || 'moderate')}`, 'success');
                } else if (result.isDenied) {
                    logoutUsuario();
                    Swal.close();
                } else {
                    // Si el usuario cierra el modal sin confirmar, revertimos el perfil en memoria
                    if (__bioSnapshot) {
                        USER_BIO = __bioSnapshot;
                        ENGINE.recalculateEverything({ shouldSaveDay: false });
                    }
                }
            });
        }

        async function detectarUbicacionPerfilModal() {
            const statusEl = document.getElementById('swal-user-location-status');
            if (!navigator.geolocation) {
                if (statusEl) statusEl.textContent = 'Tu navegador no soporta geolocalización.';
                return;
            }
            if (statusEl) statusEl.textContent = 'Detectando ubicación...';
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(5));
                const lon = Number(pos.coords.longitude.toFixed(5));
                window.__swalDetectedLocation = { lat, lon };
                const input = document.getElementById('swal-user-location');
                if (input) input.value = `${lat}, ${lon}`;
                try {
                    const clima = await fetchWeatherByCoords(lat, lon);
                    if (statusEl) statusEl.textContent = `Detectada: ${clima.icon} ${clima.temp ?? '?'}°C · Máx ${clima.tempMax ?? '?'}°`;
                } catch (_) {
                    if (statusEl) statusEl.textContent = 'Ubicación detectada, pero no se pudo leer el clima ahora.';
                }
            }, (err) => {
                if (statusEl) statusEl.textContent = `No se pudo detectar la ubicación (${err.message || 'permiso denegado'}).`;
            }, { enableHighAccuracy: true, timeout: 10000 });
        }

        function triggerMorningPrediction() {
            if (!USER_BIO) return;
            updateDay(); 
            const sleep = parseFloat(document.getElementById('sleepHours').value);
            const wake = document.getElementById('wakeTime').value;
            
            if (sleep > 0 && wake && history.length > 0) {
                const lastDay = history[0];
                const climate = ENGINE.getClimateStress();
                
                const predictedEnergy = ENGINE.predictTomorrow(lastDay, climate, sleep);
                const mentalPrediction = ENGINE.predictMentalPerformance(lastDay);
                const physicalPrediction = ENGINE.predictPhysicalPerformance(lastDay);
                
                let msg = `<div class="text-3xl font-black text-center mb-2 ${predictedEnergy > 70 ? 'text-green-500' : 'text-orange-500'}">${predictedEnergy}%</div>`;
                msg += `<p class="text-sm text-center text-gray-600 mb-4">Batería estimada para hoy</p>`;
                
                msg += `<div class="grid grid-cols-2 gap-3 mb-4">`;
                msg += `<div class="bg-indigo-50 p-3 rounded-xl text-center"><span class="text-xs text-indigo-600">🧠 Mental</span><div class="text-xl font-bold text-indigo-700">${mentalPrediction}%</div></div>`;
                msg += `<div class="bg-orange-50 p-3 rounded-xl text-center"><span class="text-xs text-orange-600">💪 Física</span><div class="text-xl font-bold text-orange-700">${physicalPrediction}%</div></div>`;
                msg += `</div>`;
                
                const scores = lastDay.stressScores || { physical: 0, mental: 0 };
                
                if (scores.physical > 80) msg += `<div class="bg-red-50 p-2 rounded text-xs text-red-600 mb-2">🛑 <b>Ayer te pasaste:</b> Tus músculos están rotos. Hoy es día de descanso activo obligatorio.</div>`;
                else if (scores.physical > 50) msg += `<div class="bg-orange-50 p-2 rounded text-xs text-orange-600 mb-2">⚠️ <b>Carga Media:</b> Ayer entrenaste duro. Tómalo con calma.</div>`;
                else msg += `<div class="bg-green-50 p-2 rounded text-xs text-green-600 mb-2">✅ <b>Físico Ok:</b> Ayer fue suave. Hoy puedes apretar.</div>`;

                if (scores.mental > 80) msg += `<div class="bg-red-50 p-2 rounded text-xs text-red-600 mb-2">🧠 <b>Carga mental alta ayer:</b> Tu cerebro necesita descanso.</div>`;
                else if (scores.mental > 50) msg += `<div class="bg-orange-50 p-2 rounded text-xs text-orange-600 mb-2">📚 <b>Estudiaste mucho ayer:</b> Recuperación cognitiva necesaria.</div>`;

                if (climate.temp > 28) msg += `<div class="bg-orange-50 p-2 rounded text-xs text-orange-600 mb-2">🔥 <b>Calor (${climate.temp}°C):</b> Rendimiento -10%</div>`;
                else if (climate.temp < 15) msg += `<div class="bg-blue-50 p-2 rounded text-xs text-blue-600 mb-2">❄️ <b>Frío (${climate.temp}°C):</b> Quemas más calorías.</div>`;
                
                if (predictedEnergy < 40) msg += `<div class="bg-slate-100 p-2 rounded text-xs text-slate-700">🛌 <b>Sistema Crítico:</b> Solo dormir y comer hoy.</div>`;
                if (predictedEnergy < 40) {
                    if (lastDay.data.runKm > 5 || lastDay.data.bikeKm > 20 || (lastDay.data.gymSessions && lastDay.data.gymSessions.some(s => s.muscle === 'pierna'))) {
                        msg += `<div class="bg-orange-50 p-2 rounded text-xs text-orange-700">🦵 <b>Piernas Agotadas:</b> Tu energía global es baja, pero tu torso está fresco. Puedes entrenar tren superior hoy.</div>`;
                    } else {
                        msg += `<div class="bg-slate-100 p-2 rounded text-xs text-slate-700">🛌 <b>Sistema Crítico:</b> Solo dormir y comer hoy.</div>`;
                    }
                }

                Swal.fire({ title: 'Buenos días ☀️', html: msg, confirmButtonText: 'Entendido' });
            }
        }

        function updateDay() {
            if (!USER_BIO) return;
            const wakeEl = document.getElementById('wakeTime');
            if(wakeEl) todayData.wakeTime = wakeEl.value;
            const sleepHEl = document.getElementById('sleepHours');
            if(sleepHEl) todayData.sleepHours = Number(sleepHEl.value) || 0;
            const sleepQEl = document.getElementById('sleepQuality');
            if(sleepQEl) todayData.sleepQuality = Number(sleepQEl.value) || 0;

            const dailyActivityEl = document.getElementById('daily-activity-level');
            if (dailyActivityEl) {
                todayData.activityLevel = dailyActivityEl.value || (USER_BIO && USER_BIO.activityLevel) || 'moderate';
            } else if (USER_BIO && USER_BIO.activityLevel) {
                todayData.activityLevel = USER_BIO.activityLevel;
            }

            calculateDynamicGoals();
            calculateStressBar(); 
            saveDay();
            updateBodyMap();
            updateUI();
            checkAlerts();
        }

        function updateMobile() {
            todayData.mobileHours = parseFloat(document.getElementById('range-mobile').value) || 0;
            document.getElementById('val-mobile').innerText = todayData.mobileHours;
            document.getElementById('home-mobile').innerText = `${todayData.mobileHours}h Móvil`;
            updateDay();
        }

        function getMicronutrientTarget(key) {
            const def = MICRO_DEFS[key];
            if (!def || !USER_BIO) return def ? def.base : 0;
            let target = def.base;
            const sex = (USER_BIO.genero || '').toLowerCase();
            const age = Number(USER_BIO.edad) || 25;
            const weight = Number(USER_BIO.peso) || 70;
            const goal = USER_BIO.goal || 'maintenance';

            if (key === 'iron') target = sex === 'mujer' ? 18 : 8;
            if (key === 'zinc') target = sex === 'mujer' ? 8 : 11;
            if (key === 'vitC') target += Math.max(0, (weight - 70) * 0.5);
            if (key === 'magnesium') target += Math.max(0, (weight - 70) * 1.5);
            if (key === 'calcium' && age >= 50) target = 1200;
            if (key === 'vitD' && age >= 50) target = 20;
            if (key === 'vitB12' && age >= 50) target = 2.8;
            if (goal === 'fat_loss' && (key === 'vitB1' || key === 'vitB6' || key === 'vitB9')) target *= 1.1;

            // --- Dinámicos por estrés / sueño / deporte ---
            const mobileH = Number(todayData?.mobileHours) || 0;
            const sleepH = Number(todayData?.sleepHours) || 7;
            const sleepQ = Number(todayData?.sleepQuality) || 80;
            const studyH = (todayData?.studySessions || []).reduce((a, b) => a + (Number(b.hours) || 0), 0);
            const stressMental = Math.min(100, (studyH * 12) + (mobileH * 10));
            const hardSleep = (sleepH < 6) || ((sleepQ > 0) && (sleepQ < 70));
            const importedStravaKcal = Array.isArray(todayData?.gymSessions)
                ? todayData.gymSessions.filter((s) => s && s.source === 'strava').reduce((a, s) => a + (Number(s.kcal) || 0), 0)
                : 0;
            const activityCals = (Number(todayData?.runCals) || 0) + (Number(todayData?.bikeCals) || 0) + (Number(todayData?.gymCals) || 0) + importedStravaKcal;
            const intenseSport = activityCals > 550 || (Number(todayData?.runKm) || 0) > 8 || (Number(todayData?.bikeKm) || 0) > 35;

            // Estrés / móvil / estudio => sube Mg + C (y algo de B6)
            if (stressMental >= 45) {
                if (key === 'magnesium') target *= 1.15;
                if (key === 'vitC') target *= 1.20;
                if (key === 'vitB6') target *= 1.10;
            }
            if (stressMental >= 70) {
                if (key === 'magnesium') target *= 1.10;
                if (key === 'vitC') target *= 1.10;
            }

            // Falta de sueño => D + Zinc suben (apoyo inmune/hormonal)
            if (hardSleep) {
                if (key === 'vitD') target *= 1.20;
                if (key === 'zinc') target *= 1.15;
            }

            // Deporte intenso => Mg + Zinc + Vit C suben (estrés oxidativo/contracción)
            if (intenseSport) {
                if (key === 'magnesium') target *= 1.10;
                if (key === 'zinc') target *= 1.05;
                if (key === 'vitC') target *= 1.10;
                if (key === 'sodium') target *= 1.20;
                if (key === 'potassium') target *= 1.15;
            }

            return target;
        }

        function calculateDynamicGoals() {
            if (!USER_BIO) return;
            const climate = ENGINE.getClimateStress();
            const sex = (USER_BIO.genero || 'hombre').toLowerCase();
            const age = Number(USER_BIO.edad) || 25;
            const weight = Number(USER_BIO.peso) || 70;
            const height = Number(USER_BIO.altura) || 170;
            const bodyFat = Number(USER_BIO.grasa) || 0;
            const goal = normalizeGoalKey(USER_BIO.goal);
            const goalSpeed = USER_BIO.goalSpeed || "moderate";
            const activityLevel = todayData.activityLevel || USER_BIO.activityLevel || 'moderate';
            const activityMeta = getActivityLevelMeta(activityLevel);
            const leanMass = bodyFat > 0 ? (weight * (1 - (bodyFat / 100))) : (weight * 0.8);

            const mifflin = (10 * weight) + (6.25 * height) - (5 * age) + (sex === 'mujer' ? -161 : 5); // Mifflin-St Jeor
            const katch = 370 + (21.6 * leanMass);
            const bmr = bodyFat > 0 ? ((mifflin * 0.35) + (katch * 0.65)) : mifflin;

            const steps = Number(todayData.steps) || 0;
            const standing = Number(todayData.standingHours) || 0;
            const sleepHours = Number(todayData.sleepHours) || 7;
            const sleepQuality = Number(todayData.sleepQuality) || 80;
            const sleepRecovery = (Math.max(0, sleepHours - 6) * 0.01) + ((sleepQuality - 70) * 0.0015); // Ajuste por sueño
            const baseTdee = Math.round(bmr * activityMeta.tdeeFactor);
            let tdee = baseTdee + Math.round(bmr * sleepRecovery) + climate.termogenesisKcal;
            let activityCals = 0;
            const runCals = (Number(todayData.runCals) > 0) ? Number(todayData.runCals) : ((Number(todayData.runKm) || 0) * weight * 1.03);
            const bikeCals = (Number(todayData.bikeCals) > 0) ? Number(todayData.bikeCals) : ((Number(todayData.bikeKm) || 0) * weight * 0.4);
            const importedGymStravaCals = Array.isArray(todayData.gymSessions)
                ? todayData.gymSessions.filter((s) => s && s.source === 'strava').reduce((a, s) => a + (Number(s.kcal) || 0), 0)
                : 0;
            const gymCals = (Number(todayData.gymCals) || 0) + importedGymStravaCals;
            // NEAT (pasos) -> kcal: ~0.04 kcal/paso, ajustado por peso
            // Referencia práctica: 10k pasos ≈ 400 kcal en 70kg (varía por zancada/velocidad); aquí lo ajustamos por peso.
            const kcalPerStepBase = 0.04;
            const kcalPerStep = Math.min(0.06, Math.max(0.025, kcalPerStepBase * (weight / 70)));
            const stepsCals = steps > 0 ? (steps * kcalPerStep) : 0;
            todayData.stepsCals = stepsCals;

            activityCals += runCals + bikeCals + gymCals + stepsCals;
            tdee += activityCals;

            const studyHours = (todayData.studySessions || []).reduce((a, b) => a + (Number(b.hours) || 0), 0); // Suma de horas de estudio
            const studyCals = (todayData.studySessions || []).reduce((a, b) => a + ((Number(b.hours) || 0) * ((Number(b.focus) || 1) * 18)), 0);
            tdee += studyCals;
            tdee += Math.max(0, (Number(todayData.mobileHours) || 0) - 2) * 6; // Pequeño gasto por uso de móvil

            const goalDeltaPct = {
                fat_loss: { slow: -0.10, moderate: -0.18, fast: -0.25 },
                maintenance: { slow: 0, moderate: 0, fast: 0 },
                muscle_gain: { slow: 0.05, moderate: 0.10, fast: 0.15 }
            };
            const deltaPct = ((goalDeltaPct[goal] || goalDeltaPct.maintenance)[goalSpeed]) || 0;
            let targetCals = tdee * (1 + deltaPct);

            const safetyFloorByGender = sex === 'mujer' ? 1200 : 1500;
            const safetyFloorByFFM = leanMass * 22; // Mínimo para no perder masa muscular
            const calorieSafetyFloor = Math.max(safetyFloorByGender, safetyFloorByFFM);
            targetCals = Math.max(targetCals, calorieSafetyFloor);

            // ======================================================================================
            // Rangos nutricionales (min/max) en vez de “meta fija”
            // ======================================================================================
            // Reutilizamos studyHours ya calculado arriba (evitar redeclare)
            const mobileH = Number(todayData.mobileHours) || 0;
            const mentalStress = (studyHours * 10) + (Math.max(0, mobileH - 2) * 12); // proxy
            const brainFatBoost = mentalStress >= 45 ? 0.08 : (mentalStress >= 25 ? 0.04 : 0); // +4% / +8% kcal a grasas

            // Proteína (g/kg) min/max por objetivo + actividad
            let pMinKg = 1.6;
            let pMaxKg = 2.2;
            if (goal === 'muscle_gain') { pMinKg = 1.7; pMaxKg = 2.2; }
            if (goal === 'fat_loss') { pMinKg = 1.8; pMaxKg = 2.4; }
            if (activityCals > 500) { pMinKg += 0.05; pMaxKg += 0.10; }
            if (age >= 55) { pMinKg += 0.05; pMaxKg += 0.05; }

            const protMin = pMinKg * weight;
            const protMax = pMaxKg * weight;

            // Grasa (g/kg) min/max; sube por estrés mental (omega-3/cerebro)
            let fMinKg = sex === 'mujer' ? 0.75 : 0.65;
            let fMaxKg = sex === 'mujer' ? 1.10 : 0.95;
            if (goal === 'fat_loss') { fMinKg -= 0.05; fMaxKg -= 0.05; }
            if (goal === 'muscle_gain') { fMinKg += 0.03; fMaxKg += 0.05; }
            fMinKg += brainFatBoost;
            fMaxKg += brainFatBoost;

            const fatMin = Math.max(fMinKg * weight, sex === 'mujer' ? 45 : 40);
            const fatMax = Math.max(fMaxKg * weight, sex === 'mujer' ? 70 : 65);

            // Carbohidratos: el resto, con mínimos por cerebro + deporte
            const carbsFloor = 120 + Math.round((activityCals / 250) * 12) + (studyHours >= 4 ? 20 : 0);
            // Max carbs asumido como “resto con protMin + fatMin”
            const carbsMaxFromCals = Math.max(0, (targetCals - ((protMin * 4) + (fatMin * 9))) / 4);
            const carbsMinFromCals = Math.max(0, (targetCals - ((protMax * 4) + (fatMax * 9))) / 4);
            const carbsMin = Math.max(carbsFloor, carbsMinFromCals);
            const carbsMax = Math.max(carbsMin + 10, carbsMaxFromCals);

            // Objetivo “meta” (para consejos) = punto medio del rango
            const protein = (protMin + protMax) / 2;
            const fat = (fatMin + fatMax) / 2;
            const carbs = (carbsMin + carbsMax) / 2;

            const sat = Math.min((targetCals * 0.10) / 9, fat * 0.35);

            let baseMlKg = sex === 'mujer' ? 31 : 35;
            if (age >= 55) baseMlKg -= 2;
            if (age >= 70) baseMlKg -= 2;
            if (bodyFat > 30) baseMlKg -= 1;
            const tempAvg = [CLIMA_REAL.temp, CLIMA_REAL.tempMax, CLIMA_REAL.tempMin].filter(v => v != null).reduce((a, b, _, arr) => a + b / arr.length, climate.temp);
            const tempDelta = tempAvg - 22; // Temperatura de confort
            let weatherFactor = 1 + (tempDelta * 0.015);
            if (weatherFactor < 0.88) weatherFactor = 0.88;
            let water = (weight * baseMlKg) * weatherFactor;
            // Ajuste por deporte / movimiento / carga mental / sueño / objetivo
            const standingHours = Number(todayData.standingHours) || 0;
            const goalWaterBoost = goal === 'fat_loss' ? 180 : (goal === 'muscle_gain' ? 120 : 0);
            const stravaHydrationExtra = getStravaImportedHydrationMl();
            water += (activityCals * 1.25);          // ml por kcal de actividad
            water += (steps * 0.02);                 // pasos aumentan demanda hídrica
            water += (standingHours * 140);          // horas de pie
            water += (studyHours * 110);             // carga cognitiva
            water += stravaHydrationExtra;           // hidratación específica por sesiones Strava importadas
            water += goalWaterBoost;                 // objetivo (déficit = más riesgo de fatiga/deshidratación)
            if (sleepHours < 6) water += 280;

            let g = {
                cals: targetCals,
                prot: protein,
                protMin,
                protMax,
                fat: fat,
                fatMin,
                fatMax,
                sat: sat,
                carbs: carbs,
                carbsMin,
                carbsMax,
                water: water
            };

            waterDetails = [];
            waterDetails.push({ txt: `Base (${weight}kg)`, val: `${Math.round(weight * baseMlKg)}ml` });
            if (CLIMA_REAL.tempMax != null || CLIMA_REAL.tempMin != null) {
                waterDetails.push({ txt: `Clima ${climate.temp}° (Máx ${CLIMA_REAL.tempMax ?? '?'} / Mín ${CLIMA_REAL.tempMin ?? '?'})`, val: `${Math.round((weatherFactor - 1) * 100)}%` });
            } else {
                waterDetails.push({ txt: `Clima (${climate.temp}°C)`, val: `${Math.round((weatherFactor - 1) * 100)}%` });
            }
            if (activityCals > 0) waterDetails.push({ txt: `Deporte (${Math.round(activityCals)} kcal)`, val: `+${Math.round(activityCals * 1.25)}ml` });
            if (stravaHydrationExtra > 0) waterDetails.push({ txt: `Strava importado`, val: `+${Math.round(stravaHydrationExtra)}ml` });
            if (steps > 0) waterDetails.push({ txt: `Pasos (${Math.round(steps)})`, val: `+${Math.round(steps * 0.02)}ml` });
            if (standingHours > 0) waterDetails.push({ txt: `De pie (${standingHours.toFixed(1)}h)`, val: `+${Math.round(standingHours * 140)}ml` });
            if (studyHours > 0) waterDetails.push({ txt: `Estudio (${studyHours.toFixed(1)}h)`, val: `+${Math.round(studyHours * 110)}ml` });
            if (goalWaterBoost > 0) waterDetails.push({ txt: `Objetivo (${goal === 'fat_loss' ? 'déficit' : 'masa'})`, val: `+${Math.round(goalWaterBoost)}ml` });
            if (sleepHours < 6) waterDetails.push({ txt: `Sueño bajo (${sleepHours.toFixed(1)}h)`, val: `+280ml` });

            // NUTRICIÓN ADVICE
            nutritionAdvice = "";
            const totalCarbs = todayData.foodLog.reduce((a,b)=>a+b.carb, 0);
            const totalProt = todayData.foodLog.reduce((a,b)=>a+b.prot, 0);
            const totalStudy = todayData.studySessions.reduce((a,b)=>a+b.hours, 0);
            
            if (todayData.runKm > 10 && totalCarbs < g.carbs * 0.6) {
                nutritionAdvice += "<li class='text-orange-600'>🏃 <b>Recuperación:</b> Aún te faltan carbohidratos para reponer glucógeno.</li>";
            } else if (todayData.runKm > 5 && totalCarbs < g.carbs * 0.4) {
                nutritionAdvice += "<li class='text-orange-600'>⚠️ <b>Bajos de carbos:</b> Después de correr necesitas reponer energía.</li>";
            }
            
            if (todayData.gymTime > 30 && totalProt < g.prot * 0.5) {
                nutritionAdvice += "<li class='text-orange-600'>💪 <b>Proteína baja:</b> Tus músculos necesitan proteína para repararse.</li>";
            }
            
            if (totalStudy > 6) {
                nutritionAdvice += "<li class='text-purple-600'>🧠 <b>Alta carga mental:</b> Toma frutos secos, pescado o aguacate para el cerebro.</li>";
            } else if (totalStudy > 3) {
                nutritionAdvice += "<li class='text-purple-600'>📚 <b>Estudio moderado:</b> Mantén hidratación y snacks saludables.</li>";
            }
            
            if (totalProt >= g.prot * 0.8 && totalCarbs >= g.carbs * 0.8) {
                nutritionAdvice = "<li class='text-green-600'>✅ <b>Combustible óptimo:</b> Tus macros están equilibrados.</li>";
            }
            
            if (nutritionAdvice === "") {
                nutritionAdvice = "<li class='text-gray-600'>Mantén una alimentación equilibrada.</li>";
            }

            try {
                const sw = Array.isArray(todayData.stravaSyncedWorkouts) ? todayData.stravaSyncedWorkouts : [];
                sw.forEach((w) => {
                    const wx = w && w.weatherContext;
                    if (!wx || !wx.ok) return;
                    if (wx.flags && wx.flags.heat) {
                        nutritionAdvice += `<li class="text-amber-700 text-xs">☀️ <b>Strava (orientativo):</b> sesión con calor (${wx.tempC != null ? Math.round(wx.tempC) + '°C' : '—'}). Considera más agua y sodio.</li>`;
                    }
                    if (wx.flags && wx.flags.highUv && wx.sunExposureScore > 0.45) {
                        nutritionAdvice += `<li class="text-sky-700 text-xs">🌤️ <b>Strava (orientativo):</b> alta exposición solar estimada; posible apoyo a la síntesis cutánea de vitamina D (no es valor clínico).</li>`;
                    }
                    if (wx.flags && wx.flags.heat && wx.thermalFatigue > 0.25) {
                        nutritionAdvice += `<li class="text-orange-700 text-xs">🧊 <b>Recuperación (orientativo):</b> fatiga térmica elevada; prioriza sueño e hidratación.</li>`;
                    }
                });
            } catch (_) {}

            // Normalizamos para UI (mantener compatibilidad: goal-prot = MAX, etc.)
            currentGoals = {
                ...g,
                prot: g.protMax ?? g.prot,
                fat: g.fatMax ?? g.fat,
                carbs: g.carbsMax ?? g.carbs
            };

            // ==========================
            // STRAVA: ajustes diarios
            // ==========================
            try {
                const delta = (todayData && todayData.stravaAdjustments && todayData.stravaAdjustments.goalsDelta)
                    ? todayData.stravaAdjustments.goalsDelta
                    : null;
                if (delta) {
                    const addCals = Number(delta.cals) || 0;
                    const addCarbs = Number(delta.carbs) || 0;
                    const addProt = Number(delta.prot) || 0;
                    const addWaterMl = Number(delta.waterMl) || 0;

                    if (addCals) currentGoals.cals = (Number(currentGoals.cals) || 0) + addCals;
                    if (addCarbs) currentGoals.carbs = (Number(currentGoals.carbs) || 0) + addCarbs;
                    if (addProt) currentGoals.prot = (Number(currentGoals.prot) || 0) + addProt;
                    if (addWaterMl) {
                        currentGoals.water = (Number(currentGoals.water) || 0) + addWaterMl;
                        waterDetails.push({ txt: `Strava`, val: `+${Math.round(addWaterMl)}ml` });
                    }
                }
            } catch (e) {
                console.warn("Strava ajuste goals falló:", e);
            }
        }

        function calculatePhysicalStressScore() {
            let score = 0;
            // Esfuerzo Relativo (Porcentaje de Capacidad)
            const runLoad = (todayData.runKm / USER_BIO.maxRunKm) * 100; // Si corro mi maximo = 100 puntos base
            score += runLoad * (todayData.runInt === 3 ? 1.2 : 1.0); // Multiplicador de intensidad
            
            const gymLoad = (todayData.gymTime / (USER_BIO.maxGymTime || 60)) * 100;
            score += gymLoad * (todayData.gymInt === 3 ? 1.2 : 1.0);
            // Pasos: 1 punto por cada 1000 pasos
            score += (todayData.steps / 1000) * 1.5;
            // Ciclismo: Relativo al maximo
            const bikeLoad = (todayData.bikeKm / (USER_BIO.maxBikeKm || 25)) * 100;
            score += bikeLoad * (todayData.bikeInt === 3 ? 1.2 : 1.0);
            
            return score;
        }

        function calculateStressBar() {
            if (!USER_BIO) {
                mentalLoad = 0;
                physicalLoad = 0;
                return;
            }
            stressDetails = [];
            
            // CÁLCULO DE CARGA MENTAL
            let mLoad = 0;
            const profile = ENGINE.getBioProfile(USER_BIO.edad, USER_BIO.genero);
            
            // Sueño Parabólico
            const sleepScore = ENGINE.calculateSleepScore(todayData.sleepHours, todayData.sleepQuality);
            if(sleepScore < 100) {
                mLoad += (100 - sleepScore);
                stressDetails.push({cat:'mental', text: `Sueño Ineficiente`, type:'bad'});
                mentalExplanation = `Sueño Real: ${(todayData.sleepHours * (todayData.sleepQuality/100 || 0.85)).toFixed(1)}h (Meta: ${profile.sleep[0]}h).`;
            } else {
                mentalExplanation = `Has dormido ${todayData.sleepHours}h. ¡Perfecto!`;
            }

            // Estudio: 5 puntos por hora * foco
            // Ajuste por edad: Si es joven (<25), el estudio cansa mucho menos (factor 1.5 en vez de 4)
            let studyFactor = USER_BIO.edad < 25 ? 1.5 : 4;
            const studyLoad = todayData.studySessions.reduce((a,b) => a + (b.hours * (b.focus * studyFactor)), 0);
            mLoad += studyLoad;
            if(studyLoad > 0) {
                mentalExplanation += ` Has estudiado ${todayData.studySessions.reduce((a,b)=>a+b.hours,0)}h (${Math.round(studyLoad)} puntos).`;
            }
            
            // Móvil: Penalización dinámica según edad (Dr. AI)
            let mobilePenaltyFactor = 4;
            if (profile.mobileTol === 'dopamine' || profile.mobileTol === 'social') mobilePenaltyFactor = 6; // Jóvenes
            if (profile.mobileTol === 'vision' || profile.mobileTol === 'blue') mobilePenaltyFactor = 5; // Mayores
            
            const mobileLoad = todayData.mobileHours * mobilePenaltyFactor;
            mLoad += mobileLoad;

            if(todayData.mobileHours > 3) {
                let msg = `Uso excesivo móvil (${todayData.mobileHours}h)`;
                if (profile.mobileTol === 'dopamine') msg += " - Dopamina agotada";
                if (profile.mobileTol === 'insomnia') msg += " - Riesgo insomnio";
                stressDetails.push({cat:'mental', text: msg, type:'bad'});
                mentalExplanation += ` Móvil: ${todayData.mobileHours}h (Factor: x${mobilePenaltyFactor}).`;
            }
            
            // Grasa saturada baja afecta al cerebro
            const satFat = todayData.foodLog.reduce((a,b)=>a+(b.sat||0), 0);
            if (satFat < 8 && todayData.mobileHours > 2) {
                mLoad += 15;
                stressDetails.push({cat:'mental', text: "Cerebro Inflamado (Poca Grasa)", type:'bad'});
                mentalExplanation += " Poca grasa saturada afecta a la función cognitiva.";
            }
            
            mentalLoad = Math.min(Math.round(mLoad), 100);

            // CÁLCULO DE CARGA FÍSICA
            let pLoad = calculatePhysicalStressScore();
            
            // Ajuste por edad y músculo (Menos músculo = más daño relativo)
            if (USER_BIO.masaMuscular < 40) pLoad *= 1.1;
            
            if(pLoad > 100) {
                stressDetails.push({cat:'physical', text: `Sobrecarga (${Math.round(pLoad)}%)`, type:'bad'});
                physicalExplanation = `Has superado tu capacidad máxima teórica. Riesgo de lesión.`;
            } else if(todayData.runKm > 0) {
                stressDetails.push({cat:'physical', text: `Running (${Math.round((todayData.runKm/USER_BIO.maxRunKm)*100)}% Max)`, type:'neutral'});
                physicalExplanation = `Has corrido ${todayData.runKm}km. Carga moderada-alta.`;
            } else {
                physicalExplanation = `Actividad física: ${Math.round(pLoad)} puntos.`;
            }

            if(currentGoals.water > 0 && todayData.water < currentGoals.water * 0.5) {
                pLoad += 20;
                stressDetails.push({cat:'physical', text: "Deshidratación severa", type:'bad'});
                physicalExplanation += " Estás deshidratado, afecta al rendimiento.";
            }
            
            if(todayData.gymTime > 90) {
                physicalExplanation += ` Gimnasio: ${todayData.gymTime}min (alta intensidad).`;
            }
            
            physicalLoad = Math.min(Math.round(pLoad), 100);
            fatigue7d = getFatigue7Days();

            updateBar('mental', mentalLoad);
            updateBar('physical', physicalLoad);
            updateBar('fatigue', fatigue7d);
        }

        function updateBodyMap() {
            // 1. Mostrar texto de análisis
            const comp = ENGINE.analyzeBodyComposition();
            const analysisDiv = document.getElementById('body-analysis-text');
            const bodyMapRoot = document.getElementById('physiological-body-map');
            if(analysisDiv) {
                const base = "text-xs text-center font-bold mb-2 px-3 py-2 rounded-2xl w-full";
                analysisDiv.className = `${base} ${comp.badgeClass || 'bg-slate-100 text-slate-700'}`;
                analysisDiv.innerHTML = `<span class="font-black uppercase tracking-tight">${comp.status}</span><br><span class="text-[10px] font-medium leading-tight block mt-1">${comp.advice}</span>`;
            }

            // 2. Resetear todos los músculos a gris
            const allMuscles = [
                'front-traps', 'front-delts', 'front-pecs', 'front-biceps', 'front-forearms', 'front-abs', 'front-obliques', 'front-quads', 'front-calves',
                'back-traps', 'back-delts', 'back-triceps', 'back-forearms', 'back-lats', 'back-lower', 'back-glutes', 'back-hams', 'back-calves'
            ];
            const qMuscle = (id) => (bodyMapRoot || document).querySelectorAll(`[id="${id}"]`);
            
            allMuscles.forEach(id => {
                // FIX: Usar querySelectorAll para manejar IDs duplicados en el SVG (izquierda/derecha)
                const elements = qMuscle(id);
                elements.forEach(el => el.setAttribute('class', 'muscle-base'));
            });

            // Función auxiliar para pintar
            // Nivel 3 = Rojo (Primario), Nivel 2 = Amarillo (Secundario), Nivel 1 = Verde
            const paint = (id, level) => {
                // FIX: Usar querySelectorAll para pintar ambos lados
                const elements = qMuscle(id);
                if(elements.length === 0) return;
                
                let cls = 'muscle-base';
                if (level >= 3) cls = 'muscle-active-max';      // Rojo
                else if (level === 2) cls = 'muscle-active-mid'; // Amarillo
                else if (level === 1) cls = 'muscle-active-low'; // Verde
                
                elements.forEach(el => {
                    const current = el.getAttribute('class');
                    // No sobrescribir si ya tiene un color más intenso
                    if (current.includes('max')) return; 
                    if (current.includes('mid') && level < 3) return;

                    el.setAttribute('class', `muscle-base ${cls}`);
                });
            };

            // --- RECUPERACIÓN PROGRESIVA (esfuerzo relativo + decay por días) ---
            // Objetivo: si haces 100% de tu máximo -> rojo; día siguiente -> naranja; segundo día -> verde.
            const safeDiv = (a, b) => (b && b > 0) ? (a / b) : 0;
            const clamp01 = (x) => Math.max(0, Math.min(1, x));
            const sumGymBy = (day, muscle) => (day.gymSessions || []).reduce((acc, s) => acc + ((s.muscle === muscle) ? (Number(s.time) || 0) : 0), 0);

            const computeRelLoad = (day) => {
                const maxRun = Number(USER_BIO?.maxRunKm) || 0;
                const maxBike = Number(USER_BIO?.maxBikeKm) || 0;
                const maxGym = Number(USER_BIO?.maxGymTime) || 0;

                const runRel = clamp01(safeDiv(Number(day.runKm) || 0, maxRun || 5));
                const bikeRel = clamp01(safeDiv(Number(day.bikeKm) || 0, maxBike || 25));

                const legGym = clamp01(safeDiv(sumGymBy(day, 'pierna'), maxGym || 60));
                const chestGym = clamp01(safeDiv(sumGymBy(day, 'pecho'), maxGym || 60));
                const backGym = clamp01(safeDiv(sumGymBy(day, 'espalda'), maxGym || 60));
                const armsGym = clamp01(safeDiv(sumGymBy(day, 'brazos'), maxGym || 60));
                const shoulderGym = clamp01(safeDiv(sumGymBy(day, 'hombro'), maxGym || 60));
                const absGym = clamp01(safeDiv(sumGymBy(day, 'abs'), maxGym || 45));

                // Intensidad subjetiva (1..3) eleva carga un poco
                const intFactor = (x) => (x >= 3 ? 1.15 : (x >= 2 ? 1.05 : 1.0));
                const sportInt = Math.max(Number(day.runInt) || 1, Number(day.bikeInt) || 1);
                const sport = clamp01(Math.max(runRel, bikeRel) * intFactor(sportInt));

                // Piernas = sport o pierna gym
                const legs = clamp01(Math.max(sport, legGym));

                return {
                    legs,
                    chest: clamp01(chestGym),
                    back: clamp01(backGym),
                    arms: clamp01(armsGym),
                    shoulder: clamp01(shoulderGym),
                    core: clamp01(absGym)
                };
            };

            const levelFromScore = (s) => {
                if (s >= 0.85) return 3; // rojo
                if (s >= 0.45) return 2; // naranja
                if (s >= 0.20) return 1; // verde
                return 0;
            };

            const decay = [1.0, 0.55, 0.25]; // hoy, 1 día, 2 días
            const daysToCheck = Math.min(3, history.length + 1);
            let fatigue = { legs: 0, chest: 0, back: 0, arms: 0, shoulder: 0, core: 0 };

            // Día 0 = hoy (todayData), día 1..2 = history[0..1]
            for (let d = 0; d < daysToCheck; d++) {
                const day = (d === 0) ? todayData : (history[d - 1] ? history[d - 1].data : null);
                if (!day) continue;
                const rel = computeRelLoad(day);
                const factor = decay[d] || 0.15;
                Object.keys(fatigue).forEach(k => {
                    fatigue[k] = Math.max(fatigue[k], rel[k] * factor);
                });
            }

            // Pintar recuperación base (incluye “hoy” como rojo si corresponde)
            const legsLevel = levelFromScore(fatigue.legs);
            if (legsLevel > 0) {
                paint('front-quads', legsLevel);
                paint('back-hams', legsLevel >= 2 ? 2 : 1);
                paint('back-glutes', legsLevel >= 2 ? 2 : 1);
                paint('front-calves', legsLevel);
                paint('back-calves', legsLevel);
            }
            const chestLevel = levelFromScore(fatigue.chest);
            if (chestLevel > 0) {
                paint('front-pecs', chestLevel);
                paint('back-triceps', Math.max(1, chestLevel - 1));
                paint('front-delts', Math.max(1, chestLevel - 1));
            }
            const backLevel = levelFromScore(fatigue.back);
            if (backLevel > 0) {
                paint('back-lats', backLevel);
                paint('back-traps', backLevel);
                paint('back-lower', Math.max(1, backLevel - 1));
                paint('front-biceps', Math.max(1, backLevel - 1));
            }
            const armsLevel = levelFromScore(fatigue.arms);
            if (armsLevel > 0) {
                paint('front-biceps', armsLevel);
                paint('back-triceps', armsLevel);
                paint('front-forearms', Math.max(1, armsLevel - 1));
            }
            const shoulderLevel = levelFromScore(fatigue.shoulder);
            if (shoulderLevel > 0) {
                paint('front-delts', shoulderLevel);
                paint('back-delts', shoulderLevel);
                paint('front-traps', Math.max(1, shoulderLevel - 1));
                paint('back-traps', Math.max(1, shoulderLevel - 1));
            }
            const coreLevel = levelFromScore(fatigue.core);
            if (coreLevel > 0) {
                paint('front-abs', coreLevel);
                paint('front-obliques', coreLevel);
            }

            // --- LÓGICA DE MAPEO (Igualando la imagen de referencia) ---

            // 1. Running / Bici (Impacto en piernas)
            if (todayData.runKm > 0 || todayData.bikeKm > 0) {
                const int = Math.max(todayData.runInt, todayData.bikeInt);
                // Cuádriceps y Gemelos como primarios
                paint('front-quads', int >= 2 ? 3 : 2);
                paint('back-calves', int >= 2 ? 3 : 2);
                paint('front-calves', int >= 2 ? 3 : 2);
                // Femorales y Glúteos como secundarios (estabilidad)
                paint('back-hams', 2);
                paint('back-glutes', 2);
            }

            // 2. Gym Sessions
            if (todayData.gymSessions) {
                todayData.gymSessions.forEach(s => {
                    const int = s.int; // 1 (Suave), 2 (Media), 3 (Fallo)
                    const primaryColor = int === 3 ? 3 : (int === 2 ? 3 : 2); // Si es media/alta, ponlo rojo
                    const secondaryColor = 2; // Amarillo

                    if (s.muscle === 'pecho') { 
                        paint('front-pecs', primaryColor); 
                        paint('front-delts', secondaryColor); // Hombro frontal asiste
                        paint('back-triceps', secondaryColor); // Tríceps asiste empuje
                    }
                    if (s.muscle === 'espalda') { 
                        paint('back-lats', primaryColor); 
                        paint('back-traps', primaryColor);
                        paint('back-lower', secondaryColor);
                        paint('front-biceps', secondaryColor); // Bíceps asiste tracción
                        paint('back-delts', secondaryColor);
                    }
                    if (s.muscle === 'pierna') { 
                        paint('front-quads', primaryColor); 
                        paint('back-hams', primaryColor); 
                        paint('back-glutes', primaryColor); 
                        paint('back-calves', primaryColor);
                    }
                    if (s.muscle === 'brazos') { 
                        paint('front-biceps', primaryColor); 
                        paint('back-triceps', primaryColor); 
                        paint('front-forearms', secondaryColor);
                    }
                    if (s.muscle === 'hombro') { 
                        paint('front-delts', primaryColor); 
                        paint('back-delts', primaryColor);
                        paint('front-traps', secondaryColor);
                        paint('back-traps', secondaryColor);
                    }
                    if (s.muscle === 'abs') { 
                        paint('front-abs', primaryColor); 
                        paint('front-obliques', primaryColor); 
                    }
                });
            }
        }

        function finishDay() {
            const today = new Date().toISOString().split('T')[0];
            Swal.fire({
                title: 'Informe Realidad',
                html: `
                    <label class="block text-xs font-bold uppercase mb-1 text-left">Fecha del Registro</label>
                    <input type="date" id="swal-date" class="w-full p-2 border rounded mb-4 font-bold text-slate-600" value="${today}">
                    <label class="block text-xs font-bold uppercase mb-1 text-left">Energía Real (1-10)</label>
                    <div class="flex items-center gap-3">
                        <input type="range" id="swal-energy" min="1" max="10" value="5" class="w-full" oninput="document.getElementById('energy-val-disp').innerText = this.value">
                        <span id="energy-val-disp" class="font-bold text-2xl text-blue-600">5</span>
                    </div>
                    <label class="block text-xs font-bold uppercase mb-1 mt-4 text-left">Estado Anímico</label>
                    <select id="swal-mood" class="w-full p-2 border rounded mb-2">
                        <option value="NEUTRAL">Normal</option>
                        <option value="MOTIVATED">Motivado / Bestia</option>
                        <option value="TIRED">Cansado / Roto</option>
                        <option value="STRESSED">Estresado / Ansioso</option>
                        <option value="SAD">Triste / Bajón</option>
                    </select>
                `,
                confirmButtonText: 'Aprender y Guardar',
                preConfirm: () => ({ 
                    energy: parseInt(document.getElementById('swal-energy').value), 
                    mood: document.getElementById('swal-mood').value,
                    date: document.getElementById('swal-date').value
                })
            }).then((result) => {
                if (result.isConfirmed) {
                    const actualScore = result.value.energy * 10;
                    const predicted = 50;
                    const dateStr = result.value.date;
                    
                    if (Math.abs(actualScore - predicted) > 25) {
                        Swal.fire({
                            title: '¿Por qué fallé?',
                            text: `Predije ${predicted} pero sientes ${actualScore}.`,
                            input: 'select',
                            inputOptions: { 'UNKNOWN': 'No lo sé (Ajustar Motor)', 'TIRED_TRAINING': 'Entreno muy duro', 'EXTERNAL': 'Problema Externo (Vida)' },
                            confirmButtonText: 'Corregir estimación'
                        }).then((cause) => {
                            if(cause.value) ENGINE.learn(predicted, actualScore, cause.value);
                            saveAndClose(actualScore, result.value.mood, dateStr);
                        });
                    } else {
                        saveAndClose(actualScore, result.value.mood, dateStr);
                    }
                }
            });
        }

        async function saveAndClose(actualEnergy, mood, dateStr) {
            let recordDate;
            if (dateStr) {
                recordDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            } else {
                recordDate = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            }
            
            const record = { 
                date: recordDate, 
                dateKey: dateStr || getTodayDocId(),
                data: JSON.parse(JSON.stringify(todayData)), 
                goals: { ...currentGoals },
                stress: Math.round((mentalLoad + physicalLoad) / 2),
                stressScores: { mental: mentalLoad, physical: physicalLoad },
                subjective: { energy: actualEnergy, mood: mood },
                alerts: [...todayAlerts],
                mentalExplanation: mentalExplanation,
                physicalExplanation: physicalExplanation
            };
            
            const existingIdx = history.findIndex(h => h.dateKey === record.dateKey);
            const existingFirestoreId = existingIdx >= 0 ? (history[existingIdx].firestoreId || null) : null;
            if (existingIdx >= 0) history[existingIdx] = { ...history[existingIdx], ...record };
            else history.unshift(record);
            
            const firestoreId = await guardarHistorialEnNube(record, existingFirestoreId);
            if (firestoreId) {
                const idx = history.findIndex(h => h.dateKey === record.dateKey);
                if (idx >= 0) history[idx].firestoreId = firestoreId;
            }
            todayData = JSON.parse(JSON.stringify(INITIAL_STATE));
            todayAlerts = [];
            saveDay();
            updateHistoryUI();
            navigateTo('registro');
            Swal.fire({ icon: 'success', title: 'Informe guardado', timer: 1200, showConfirmButton: false });
        }

        // ==========================================================================================
        // 🛠️ UTILIDADES UI
        // ==========================================================================================
        function updateBar(type, val) { 
            const bar = document.getElementById(`bar-${type}`); 
            const txt = document.getElementById(type === 'fatigue' ? 'fatigue-val' : (type === 'mental' ? 'mental-val' : 'phys-val')); 
            if(bar && txt) { 
                bar.style.width = val + '%'; 
                txt.innerText = val + '%'; 
                if(type === 'fatigue') { 
                    bar.className = `h-full rounded-full transition-all duration-700 ${val < 40 ? 'bg-green-500' : (val < 70 ? 'bg-yellow-400' : 'bg-red-500')}`; 
                } 
            } 
        }
        
        function getFatigue7Days() { 
            if (history.length === 0) return 0; 
            const last7 = history.slice(0, 7); 
            let total = 0; 
            last7.forEach(h => { 
                total += (h.stress || 0); 
            }); 
            return Math.round(total / last7.length); 
        }
        
        function addStudySession() { 
            const hInput = document.getElementById('session-hours'); 
            const fInput = document.getElementById('session-focus'); 
            const hours = parseFloat(hInput.value); 
            const focus = parseInt(fInput.value); 
            if (!hours || hours <= 0) { 
                Swal.fire('Error', 'Indica las horas', 'error'); 
                return; 
            } 
            todayData.studySessions.push({ hours, focus, id: Date.now() }); 
            hInput.value = ''; 
            updateDay(); 
            Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 }).fire({ icon: 'success', title: 'Añadido' }); 
        }
        
        function removeStudySession(index) { 
            todayData.studySessions.splice(index, 1); 
            updateDay(); 
        }
        
        function renderStudySessions() { 
            const list = document.getElementById('studySessionsList'); 
            const totalDisplay = document.getElementById('total-study-hours-display'); 
            let total = 0; 
            const focusLabels = {1: 'Bajo', 2: 'Medio', 3: 'Deep Work'}; 
            const focusColors = {1: 'text-gray-400', 2: 'text-blue-500', 3: 'text-purple-600 font-black'}; 
            if (todayData.studySessions.length === 0) { 
                list.innerHTML = '<p class="text-center text-gray-300 text-xs italic py-4">No hay sesiones registradas hoy.</p>'; 
                totalDisplay.innerText = "0 horas"; 
                document.getElementById('home-study').innerText = "0"; 
                document.getElementById('mini-bar-study').style.width = "0%"; 
                return; 
            } 
            list.innerHTML = todayData.studySessions.map((s, i) => `<div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100"><div><div class="font-bold text-slate-700 text-sm">${s.hours} horas</div><div class="text-[10px] uppercase ${focusColors[s.focus]}">${focusLabels[s.focus]}</div></div><button onclick="removeStudySession(${i})" class="w-6 h-6 rounded-full bg-white text-red-300 hover:text-red-500 flex items-center justify-center shadow-sm"><i class="fas fa-times text-xs"></i></button></div>`).join(''); 
            todayData.studySessions.forEach(s => total += s.hours); 
            totalDisplay.innerText = total + " horas"; 
            document.getElementById('home-study').innerText = total; 
            document.getElementById('mini-bar-study').style.width = Math.min((total/10)*100, 100) + '%'; 
        }
        
        function updateUI() { 
            try {
                renderStudySessions(); 

                const setValue = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
                const setText = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };

                setValue('range-mobile', todayData.mobileHours);
                setText('val-mobile', todayData.mobileHours);
                setText('home-mobile', `${todayData.mobileHours}h Móvil`);

                setValue('range-steps', todayData.steps);
                setText('val-steps', todayData.steps);
                setText('home-steps', todayData.steps);

                setValue('range-standing', todayData.standingHours);
                setText('val-standing', todayData.standingHours);
                
                renderGymSessions();
                renderStravaGymWorkouts();

                let sum = { cal:0, prot:0, fat:0, sat:0, carb:0 }; 
                (todayData.foodLog || []).forEach(f => { 
                    sum.cal+=f.cal; 
                    sum.prot+=f.prot; 
                    sum.fat+=f.fat; 
                    sum.carb+=f.carb; 
                    if(f.sat) sum.sat+=f.sat; 
                }); 
                
                const setBar = (id, val, max, min = null) => { 
                    const safeMax = (max && max > 0) ? max : 1;
                    const p = Math.min((val/safeMax)*100, 100); 
                    const el = document.getElementById(`bar-${id}`); 
                    if(el) el.style.width = p+'%'; 
                    const valEl = document.getElementById(`val-${id}`);
                    if (valEl) valEl.innerText = (val % 1 !== 0 && val < 10) ? val.toFixed(1) : Math.round(val); 
                    const goalEl = document.getElementById(`goal-${id}`);
                    if (goalEl) goalEl.innerText = Math.round(max || 0); 

                    const minGoalEl = document.getElementById(`goal-${id}-min`);
                    if (minGoalEl && min != null) minGoalEl.innerText = Math.round(min);

                    const minMark = document.getElementById(`minmark-${id}`);
                    if (minMark && min != null) {
                        const left = Math.max(0, Math.min((min / safeMax) * 100, 100));
                        minMark.style.left = `${left}%`;
                    }
                }; 
                
                setBar('cals', sum.cal, currentGoals.cals); 
                setBar('prot', sum.prot, currentGoals.protMax ?? currentGoals.prot, currentGoals.protMin ?? null); 
                setBar('fat', sum.fat, currentGoals.fatMax ?? currentGoals.fat, currentGoals.fatMin ?? null); 
                setBar('carbs', sum.carb, currentGoals.carbsMax ?? currentGoals.carbs, currentGoals.carbsMin ?? null); 
                setBar('sat', sum.sat, currentGoals.sat); 

                // Mirror the kcal goal pill (if present)
                document.querySelectorAll('.goal-cals-mirror').forEach(el => {
                    el.textContent = String(Math.round(currentGoals.cals || 0));
                });
                
                setText('total-consumed-kcal', Math.round(sum.cal) + ' kcal');
                setText('home-water', todayData.water);
                setText('home-water-goal', Math.round(currentGoals.water || 0));
                const miniBarWater = document.getElementById('mini-bar-water');
                if (miniBarWater) miniBarWater.style.width = Math.min((todayData.water/(currentGoals.water || 1))*100, 100) + '%'; 
                
                const wp = Math.min(todayData.water / (currentGoals.water || 1), 1); 
                const waterCircle = document.getElementById('water-circle');
                if (waterCircle) waterCircle.style.strokeDashoffset = 628 - (wp * 628); 
                setText('water-display-lg', todayData.water);
                setText('water-goal-text', `Meta dinámica: ${Math.round(currentGoals.water || 0)} ml`); 
                
                setText('home-sport-km', (Number(todayData.runKm) || 0) + (Number(todayData.bikeKm) || 0)); 
                const sportProgress = Math.min((((Number(todayData.runKm) || 0) + ((Number(todayData.bikeKm) || 0)*0.4)) / 10) * 100, 100); 
                const barSportHome = document.getElementById('bar-sport-home');
                if (barSportHome) barSportHome.style.width = sportProgress + '%'; 

                // Mini-resumen premium de actividad (Apple Health style)
                const ints = ['--', 'Suave', 'Normal', 'Alta'];
                const weight = Number(USER_BIO && USER_BIO.peso) || 70;
                const runCalsUi = (Number(todayData.runCals) > 0) ? Number(todayData.runCals) : ((Number(todayData.runKm) || 0) * weight * 1.03);
                const bikeCalsUi = (Number(todayData.bikeCals) > 0) ? Number(todayData.bikeCals) : ((Number(todayData.bikeKm) || 0) * weight * 0.4);
                const gymCalsUi = (Number(todayData.gymCals) || 0) + getStravaGymImportedKcal();
                const stepsCalsUi = Number(todayData.stepsCals) || 0;

                const candidates = [
                    { key: 'gym', label: 'Gimnasio', icon: 'fa-dumbbell', color: 'text-slate-800', kcal: gymCalsUi, meta: `${Math.round(todayData.gymTime || 0)} min · ${ints[todayData.gymInt] || 'Normal'}` },
                    { key: 'bike', label: 'Bicicleta', icon: 'fa-bicycle', color: 'text-indigo-600', kcal: bikeCalsUi, meta: `${Number(todayData.bikeKm || 0)} km · ${ints[todayData.bikeInt] || 'Normal'}` },
                    { key: 'run', label: 'Running', icon: 'fa-running', color: 'text-orange-500', kcal: runCalsUi, meta: `${Number(todayData.runKm || 0)} km · ${ints[todayData.runInt] || 'Normal'}` },
                    { key: 'steps', label: 'Pasos', icon: 'fa-shoe-prints', color: 'text-green-600', kcal: stepsCalsUi, meta: `${Math.round(todayData.steps || 0)} pasos` }
                ];
                const best = candidates
                    .filter(c => (c.kcal || 0) > 0 || (c.key === 'steps' && (todayData.steps || 0) > 0))
                    .sort((a, b) => (b.kcal || 0) - (a.kcal || 0))[0];

                const mini = document.getElementById('home-sport-mini');
                const iconEl = document.getElementById('home-sport-icon');
                if (mini && iconEl) {
                    if (best) {
                        iconEl.className = `fas ${best.icon} ${best.color} text-xl`;
                        mini.innerText = `${best.label} · ${best.meta} · +${Math.round(best.kcal || 0)} kcal`;
                    } else {
                        iconEl.className = 'fas fa-running text-orange-500 text-xl';
                        mini.innerText = 'Actividad · 0 kcal';
                    }
                }
                
                const addedFoodsList = document.getElementById('addedFoodsList');
                if (addedFoodsList) {
                    addedFoodsList.innerHTML = (todayData.foodLog || []).map((f, i) => `<div class="flex justify-between items-center text-sm py-3 border-b border-gray-100 last:border-0 bg-white p-3 rounded-xl mb-2 shadow-sm"><div><div class="text-slate-700 font-bold">${f.name} <span class="text-xs text-gray-400 font-normal">(${f.weight}g)</span></div><div class="text-[10px] text-gray-400">P: ${Math.round(f.prot)}g | C: ${Math.round(f.carb)}g | G: ${Math.round(f.fat)}g | S: ${f.sat ? f.sat.toFixed(1) : 0}g</div></div><div class="flex items-center gap-3"><span class="font-bold text-xs text-slate-500 bg-gray-100 px-2 py-1 rounded">${Math.round(f.cal)} kcal</span><button onclick="removeFood(${i})" class="text-red-300 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 transition"><i class="fas fa-times"></i></button></div></div>`).join('') || '<p class="text-center text-gray-300 text-xs py-4">No has añadido comidas aún.</p>'; 
                }
            } catch (e) {
                console.error("updateUI error:", e);
            }
        }
        
        function addGymSession() {
            const muscle = document.getElementById('gym-muscle-select').value;
            const time = parseFloat(document.getElementById('gym-session-time').value);
            const int = parseInt(document.getElementById('gym-session-int').value, 10);
            const nameEl = document.getElementById('gym-exercise-name');
            const exercise = nameEl ? String(nameEl.value || '').trim() : '';
            const setsRaw = document.getElementById('gym-sets') ? String(document.getElementById('gym-sets').value || '').trim() : '';
            const repsRaw = document.getElementById('gym-reps') ? String(document.getElementById('gym-reps').value || '').trim() : '';
            const sets = parseInt(setsRaw, 10);

            if (!time || time <= 0) {
                Swal.fire('Falta dato', 'Indica los minutos del bloque (aunque sea estimados).', 'error');
                return;
            }

            if (!todayData.gymSessions) todayData.gymSessions = [];
            const entry = { muscle, time, int, source: 'manual' };
            if (exercise) entry.exercise = exercise;
            if (Number.isFinite(sets) && sets > 0) entry.sets = sets;
            if (repsRaw) entry.reps = repsRaw;
            todayData.gymSessions.push(entry);

            document.getElementById('gym-session-time').value = '';
            if (nameEl) nameEl.value = '';
            const setsEl = document.getElementById('gym-sets');
            const repsEl = document.getElementById('gym-reps');
            if (setsEl) setsEl.value = '';
            if (repsEl) repsEl.value = '';
            updateSport();
        }

        function removeGymSession(index) {
            todayData.gymSessions.splice(index, 1);
            updateSport();
        }

        function renderGymSessions() {
            const list = document.getElementById('gymSessionsList');
            if (!todayData.gymSessions || todayData.gymSessions.length === 0) {
                list.innerHTML =
                    '<p class="text-xs text-gray-400 text-center italic py-2">Aún no has registrado bloques de fuerza hoy.</p>';
                return;
            }

            const intLabels = { 1: 'Técnica / suave', 2: 'Media', 3: 'Duro' };
            const intColors = { 1: 'text-green-600', 2: 'text-amber-600', 3: 'text-red-600' };
            const esc = (t) =>
                String(t || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');

            list.innerHTML = todayData.gymSessions
                .map((s, i) => {
                    const title = s.exercise ? `<span class="text-slate-900">${esc(s.exercise)}</span> · ` : '';
                    const srParts = [];
                    if (s.sets && s.reps) srParts.push(`${s.sets}×${esc(s.reps)}`);
                    else {
                        if (s.sets) srParts.push(`${s.sets} series`);
                        if (s.reps) srParts.push(`${esc(s.reps)} reps`);
                    }
                    const sr = srParts.length ? `${srParts.join(' · ')} · ` : '';
                    return `
                <div class="flex justify-between items-start gap-2 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                    <div class="min-w-0">
                        <span class="block text-xs font-bold text-slate-800">${title}<span class="capitalize">${esc(s.muscle)}</span>${
                        s.source === 'strava' ? ' <span class="text-[10px] text-orange-500 font-black">Strava</span>' : ''
                    }</span>
                        <span class="text-[10px] text-slate-500 mt-0.5 block">${sr}${s.time} min · <span class="${intColors[s.int] || 'text-slate-500'} font-bold">${
                        intLabels[s.int] || '—'
                    }</span>${s.kcal ? ` · ${Math.round(s.kcal)} kcal` : ''}${s.sportType ? ` · ${esc(s.sportType)}` : ''}</span>
                    </div>
                    <button type="button" onclick="removeGymSession(${i})" class="text-red-300 hover:text-red-500 shrink-0 p-1" aria-label="Quitar"><i class="fas fa-times"></i></button>
                </div>`;
                })
                .join('');
        }

        function renderStravaGymWorkouts() {
            const el = document.getElementById('stravaGymList');
            if (!el) return;
            const escAttr = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const escHtml = (s) =>
                String(s ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            const workouts = Array.isArray(todayData.stravaSyncedWorkouts) ? todayData.stravaSyncedWorkouts : [];
            const doneToday = Array.isArray(todayData.stravaTodayActivityIds) ? todayData.stravaTodayActivityIds : [];
            if (!workouts.length) {
                el.innerHTML =
                    '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">Aún no hay actividades en el catálogo. Pulsa <b class="text-orange-600">Importar</b> para traerlas desde Strava.</div>';
                return;
            }
            const rowHtml = (w) => {
                const id = escAttr(w.activityId || '');
                const title = escHtml(w.name || w.typeLabel || w.sportType || 'Actividad');
                const sub = escHtml(`${w.typeLabel || w.sportType || ''} · ${Math.round(w.timeMin || 0)} min · ${Math.round(w.kcal || 0)} kcal`);
                const dateStr = escHtml((w.startDateLocal || w.startDate || '').slice(0, 10));
                const intl = escHtml(w.intensityLabel || '—');
                const todayBadge = doneToday.includes(String(w.activityId))
                    ? '<span class="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">Hoy</span>'
                    : '';
                return `
                <div class="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50/90 px-3 py-2.5 shadow-sm ring-1 ring-slate-100/80 transition hover:border-orange-200/80 hover:shadow-md" onclick="openImportedStravaWorkoutDetails('${id}')">
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-black text-slate-800">${title}</p>
                        <p class="truncate text-[11px] text-slate-500">${sub}</p>
                        <p class="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">${dateStr} · Int ${intl}</p>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                        ${todayBadge}
                        <button type="button" onclick="event.stopPropagation(); removeStravaImportedWorkout('${id}')" class="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 opacity-80 transition hover:bg-rose-100 hover:opacity-100" title="Quitar del catálogo">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>`;
            };
            const sortDesc = (arr) =>
                [...(arr || [])].sort((a, b) =>
                    String(b.startDateLocal || b.startDate || '').localeCompare(String(a.startDateLocal || a.startDate || ''))
                );
            const mod = window.__FITTRACKER_MODULES__;
            const bucketFn = mod && typeof mod.bucketStravaWorkoutsByCategory === 'function' ? mod.bucketStravaWorkoutsByCategory : null;
            if (!bucketFn) {
                const flat = sortDesc(workouts)
                    .slice(0, 80)
                    .map(rowHtml)
                    .join('');
                el.innerHTML = `<div class="space-y-2">${flat}</div>`;
                return;
            }
            const buckets = bucketFn(workouts);
            const order = [
                ['run', 'Running'],
                ['ride', 'Ciclismo'],
                ['walk', 'Caminar / senderismo'],
                ['swim', 'Natación'],
                ['gym', 'Gimnasio y fuerza'],
                ['other', 'Otros'],
            ];
            const blocks = order
                .map(([key, label]) => {
                    const arr = sortDesc(buckets[key] || []);
                    if (!arr.length) return '';
                    const rows = arr.map(rowHtml).join('');
                    return `<div class="mb-4 last:mb-0">
                        <div class="mb-2 flex items-center justify-between gap-2">
                            <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">${escHtml(label)}</p>
                            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">${arr.length}</span>
                        </div>
                        <div class="space-y-2">${rows}</div>
                    </div>`;
                })
                .join('');
            el.innerHTML =
                blocks ||
                '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">Sin actividades para mostrar.</div>';
        }

        async function confirmClearAllStravaCatalog() {
            const n = Array.isArray(todayData.stravaSyncedWorkouts) ? todayData.stravaSyncedWorkouts.length : 0;
            if (!n) {
                setStravaGymStatus('No hay actividades importadas que borrar.', 'neutral');
                return;
            }
            const step1 = await Swal.fire({
                title: 'Borrar todo el catálogo Strava',
                html: `<p class="text-sm text-slate-600 text-left">Se eliminarán <b>${n}</b> actividades de este día, las sesiones de gym ligadas a Strava y los ajustes de macros/agua derivados de esas importaciones.</p><p class="text-xs text-rose-600 mt-2 text-left">No afecta a tu cuenta Strava en la nube: solo este tracker.</p>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#b91c1c',
                customClass: { popup: 'rounded-3xl' },
            });
            if (!step1.isConfirmed) return;
            const step2 = await Swal.fire({
                title: 'Confirmación final',
                input: 'text',
                inputLabel: 'Escribe la palabra BORRAR en mayúsculas',
                inputPlaceholder: 'BORRAR',
                showCancelButton: true,
                confirmButtonText: 'Eliminar todo',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#7f1d1d',
                preConfirm: (v) => (String(v).trim() === 'BORRAR' ? true : (Swal.showValidationMessage('Debes escribir exactamente BORRAR'), false)),
            });
            if (!step2.isConfirmed) return;
            if (!Array.isArray(todayData.gymSessions)) todayData.gymSessions = [];
            todayData.gymSessions = todayData.gymSessions.filter((s) => !(s && s.source === 'strava'));
            todayData.stravaSyncedWorkouts = [];
            todayData.stravaTodayActivityIds = [];
            todayData.stravaAdjustments = {
                goalsDelta: { cals: 0, waterMl: 0, prot: 0, carbs: 0 },
                updatedAt: new Date().toISOString(),
            };
            updateSport();
            renderStravaGymWorkouts();
            refreshStravaInsightsAndCharts();
            setStravaGymStatus('Catálogo Strava vaciado en este día. Puedes volver a importar cuando quieras.', 'ok');
        }

        function getStravaGymImportedKcal() {
            if (!Array.isArray(todayData.gymSessions)) return 0;
            return todayData.gymSessions
                .filter((s) => s && s.source === 'strava')
                .reduce((a, s) => a + (Number(s.kcal) || 0), 0);
        }

        function getStravaWorkoutHydrationMl(workout) {
            if (!workout) return 0;
            const timeMin = Number(workout.timeMin) || 0;
            const kcal = Number(workout.kcal) || 0;
            const intensity = Number(workout.intensity) || 1;
            const baseByTime = (timeMin / 30) * 500;
            const byKcal = kcal * 0.45;
            const intensityFactor = intensity >= 3 ? 1.25 : (intensity === 2 ? 1.1 : 1);
            const wxBoost = Number(workout.hydrationFactor) > 0 ? Number(workout.hydrationFactor) : 1;
            return Math.round(Math.max(baseByTime, byKcal) * intensityFactor * wxBoost);
        }

        function getStravaImportedHydrationMl() {
            if (!Array.isArray(todayData.stravaSyncedWorkouts)) return 0;
            if (!Array.isArray(todayData.stravaTodayActivityIds)) return 0;
            const ids = new Set(todayData.stravaTodayActivityIds.map((x) => String(x)));
            return todayData.stravaSyncedWorkouts
                .filter((w) => ids.has(String(w.activityId)))
                .reduce((acc, w) => acc + getStravaWorkoutHydrationMl(w), 0);
        }

        function setStravaGymStatus(message, tone = 'neutral') {
            const el = document.getElementById('strava-gym-status');
            if (!el) return;
            const cls = tone === 'ok' ? 'text-emerald-600' : tone === 'err' ? 'text-red-600' : 'text-slate-500';
            el.className = `text-[11px] mt-2 ${cls}`;
            el.textContent = message;
        }

        function trySyncStravaPersonalBestsToBio() {
            const mod = window.__FITTRACKER_MODULES__;
            if (!mod || typeof mod.applyStravaCatalogToBioMaxes !== 'function' || !USER_BIO) return false;
            const list = Array.isArray(todayData.stravaSyncedWorkouts) ? todayData.stravaSyncedWorkouts : [];
            const changed = mod.applyStravaCatalogToBioMaxes(list, USER_BIO);
            if (changed && currentUser) {
                guardarDatosUsuario();
                return true;
            }
            return false;
        }

        function applyStravaWorkoutsToGym(workouts) {
            if (!Array.isArray(workouts) || workouts.length === 0) {
                setStravaGymStatus('No hay entrenamientos nuevos para importar hoy.', 'neutral');
                return { imported: 0, updated: 0, duplicated: 0 };
            }
            if (!Array.isArray(todayData.stravaSyncedWorkouts)) todayData.stravaSyncedWorkouts = [];
            if (!Array.isArray(todayData.stravaTodayActivityIds)) todayData.stravaTodayActivityIds = [];

            let imported = 0;
            let updated = 0;
            let duplicated = 0;
            workouts.forEach((w) => {
                if (!w || !w.activityId) return;
                const id = String(w.activityId);
                const already = todayData.stravaSyncedWorkouts.some((x) => String(x.activityId) === id);
                if (already) {
                    // Upsert en catálogo sincronizado.
                    todayData.stravaSyncedWorkouts = todayData.stravaSyncedWorkouts.map((x) =>
                        String(x.activityId) === id ? { ...x, ...w } : x
                    );
                    // Si ya estaba marcada como hecha hoy, actualizamos también su sesión.
                    todayData.gymSessions = (todayData.gymSessions || []).map((s) =>
                        (s && s.source === 'strava' && String(s.activityId) === id)
                            ? {
                                ...s,
                                time: Number(w.timeMin) || 0,
                                int: Number(w.intensity) || 2,
                                kcal: Number(w.kcal) || 0,
                                sportType: w.typeLabel || w.sportType || 'Actividad',
                                hydrationFactor: w.hydrationFactor,
                                weatherContext: w.weatherContext,
                              }
                            : s
                    );
                    updated++;
                    return;
                }
                todayData.stravaSyncedWorkouts.unshift(w);
                imported++;
            });

            trySyncStravaPersonalBestsToBio();

            updateUI();
            saveDay();
            renderStravaGymWorkouts();
            refreshStravaInsightsAndCharts();
            const extraKcal = getStravaGymImportedKcal();
            if (imported === 0 && updated === 0) duplicated = workouts.length;
            const tone = (imported > 0 || updated > 0) ? 'ok' : 'neutral';
            setStravaGymStatus(`Sincronizados ${imported}, actualizados ${updated}, omitidos ${duplicated}. Marcados para hoy: ${Math.round(extraKcal)} kcal.`, tone);
            return { imported, updated, duplicated };
        }

        async function importarStravaEntrenosGym() {
            if (typeof window.importarEntrenosStravaGym !== 'function') {
                setStravaGymStatus('Módulo de Strava no cargado.', 'err');
                return;
            }
            setStravaGymStatus('Importando entrenamientos desde Strava...');
            try {
                await window.importarEntrenosStravaGym();
            } catch (_) {}
        }

        function removeStravaImportedWorkout(activityId) {
            if (!activityId) return;
            Swal.fire({
                title: '¿Quitar entreno importado?',
                text: 'Se eliminará de Gym y se recalcularán kcal/objetivos de hoy.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, quitar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444'
            }).then((res) => {
                if (!res.isConfirmed) return;
                if (!Array.isArray(todayData.gymSessions)) todayData.gymSessions = [];
                if (!Array.isArray(todayData.stravaSyncedWorkouts)) todayData.stravaSyncedWorkouts = [];
                if (!Array.isArray(todayData.stravaTodayActivityIds)) todayData.stravaTodayActivityIds = [];

                todayData.gymSessions = todayData.gymSessions.filter((s) => !(s && s.source === 'strava' && String(s.activityId) === String(activityId)));
                todayData.stravaSyncedWorkouts = todayData.stravaSyncedWorkouts.filter((w) => String(w.activityId) !== String(activityId));
                todayData.stravaTodayActivityIds = todayData.stravaTodayActivityIds.filter((id) => String(id) !== String(activityId));

                updateSport();
                renderStravaGymWorkouts();
                refreshStravaInsightsAndCharts();
                setStravaGymStatus('Entreno importado eliminado. Puedes volver a importarlo cuando quieras.', 'ok');
            });
        }

        function addStravaWorkoutToToday(activityId) {
            if (!activityId) return;
            if (!Array.isArray(todayData.stravaSyncedWorkouts)) todayData.stravaSyncedWorkouts = [];
            if (!Array.isArray(todayData.stravaTodayActivityIds)) todayData.stravaTodayActivityIds = [];
            if (!Array.isArray(todayData.gymSessions)) todayData.gymSessions = [];

            const id = String(activityId);
            const workout = todayData.stravaSyncedWorkouts.find((w) => String(w.activityId) === id);
            if (!workout) return;
            if (todayData.stravaTodayActivityIds.includes(id)) {
                setStravaGymStatus('Esa actividad ya está marcada como hecha hoy.', 'neutral');
                return;
            }

            todayData.stravaTodayActivityIds.push(id);
            todayData.gymSessions.push({
                muscle: workout.muscle || 'cardio',
                time: Number(workout.timeMin) || 0,
                int: Number(workout.intensity) || 2,
                source: 'strava',
                kcal: Number(workout.kcal) || 0,
                sportType: workout.typeLabel || workout.sportType || 'Actividad',
                activityId: workout.activityId,
                hydrationFactor: workout.hydrationFactor,
                weatherContext: workout.weatherContext,
            });
            updateSport();
            renderStravaGymWorkouts();
            refreshStravaInsightsAndCharts();
            setStravaGymStatus(`Actividad añadida a hoy. +${Math.round(Number(workout.kcal) || 0)} kcal al motor biológico.`, 'ok');
        }

        function removeStravaWorkoutFromToday(activityId) {
            if (!activityId) return;
            if (!Array.isArray(todayData.stravaTodayActivityIds)) todayData.stravaTodayActivityIds = [];
            if (!Array.isArray(todayData.gymSessions)) todayData.gymSessions = [];
            const id = String(activityId);
            todayData.stravaTodayActivityIds = todayData.stravaTodayActivityIds.filter((x) => String(x) !== id);
            todayData.gymSessions = todayData.gymSessions.filter((s) => !(s && s.source === 'strava' && String(s.activityId) === id));
            updateSport();
            renderStravaGymWorkouts();
            refreshStravaInsightsAndCharts();
            setStravaGymStatus('Actividad quitada de hoy.', 'neutral');
        }

        function openImportedStravaWorkoutDetails(activityId) {
            if (!activityId || !Array.isArray(todayData.stravaSyncedWorkouts)) return;
            const w = todayData.stravaSyncedWorkouts.find((x) => String(x.activityId) === String(activityId));
            if (!w) return;
            const isToday = Array.isArray(todayData.stravaTodayActivityIds) && todayData.stravaTodayActivityIds.includes(String(activityId));
            const fmtDate = (iso) => {
                if (!iso) return '-';
                const d = new Date(iso);
                return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES');
            };
            const mod = window.__FITTRACKER_MODULES__;
            let coachBlock = '';
            if (mod && typeof mod.analyzeStravaWorkoutForUi === 'function') {
                try {
                    const a = mod.analyzeStravaWorkoutForUi(w, todayData);
                    const bullets = (a.bullets || []).map((t) => `<li class="text-[12px] text-slate-700 leading-relaxed">${String(t).replace(/</g, '&lt;')}</li>`).join('');
                    coachBlock = `<div class="col-span-2 mt-1 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-left">
                        <p class="text-[11px] font-black uppercase text-emerald-800">Análisis automático</p>
                        <p class="mt-1 text-sm font-bold text-slate-900">${String(a.headline || '').replace(/</g, '&lt;')}</p>
                        <ul class="mt-2 list-disc space-y-1 pl-4">${bullets}</ul>
                    </div>`;
                } catch (_) {}
            }
            Swal.fire({
                title: w.name || w.typeLabel || 'Detalle de actividad',
                html: `
                    <div class="text-left grid grid-cols-2 gap-2 text-[12px]">
                        <div class="bg-orange-50 border border-orange-100 rounded-lg p-2"><b>Tipo</b><br>${w.typeLabel || w.sportType || '-'}</div>
                        <div class="bg-blue-50 border border-blue-100 rounded-lg p-2"><b>Fecha</b><br>${fmtDate(w.startDateLocal || w.startDate)}</div>
                        <div class="bg-emerald-50 border border-emerald-100 rounded-lg p-2"><b>Duración</b><br>${Math.round(Number(w.timeMin) || 0)} min</div>
                        <div class="bg-red-50 border border-red-100 rounded-lg p-2"><b>Kcal</b><br>${Math.round(Number(w.kcal) || 0)} kcal</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><b>Distancia</b><br>${(Number(w.distanceKm) || 0).toFixed(2)} km</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><b>Ritmo medio</b><br>${Number(w.avgPaceMinKm) > 0 ? `${Number(w.avgPaceMinKm).toFixed(2)} min/km` : '—'}</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><b>Desnivel</b><br>${Math.round(Number(w.elevationGain) || 0)} m</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><b>FC media / max</b><br>${Math.round(Number(w.averageHr) || 0)} / ${Math.round(Number(w.maxHr) || 0)} bpm</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><b>Intensidad</b><br>${w.intensityLabel || 'Media'}</div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><b>Suffer score</b><br>${Math.round(Number(w.sufferScore) || 0)}</div>
                        <div class="col-span-2 bg-indigo-50 border border-indigo-100 rounded-lg p-2"><b>Hidratación estimada por este entreno</b><br>+${Math.round(getStravaWorkoutHydrationMl(w))} ml</div>
                        ${coachBlock}
                        <div class="col-span-2 text-[11px] text-slate-500 leading-relaxed">Mapa, splits y zonas detalladas requieren datos adicionales de Strava (no almacenamos la actividad completa en este modo).</div>
                    </div>
                `,
                confirmButtonText: 'Cerrar',
                showDenyButton: true,
                denyButtonText: isToday ? 'Quitar de hoy' : 'La he hecho hoy'
            }).then((res) => {
                if (!res.isDenied) return;
                if (isToday) removeStravaWorkoutFromToday(activityId);
                else addStravaWorkoutToToday(activityId);
            });
        }

        function openStravaGymPicker(workouts) {
            if (!Array.isArray(workouts) || workouts.length === 0) {
                setStravaGymStatus('No hay entrenamientos para seleccionar.', 'neutral');
                return;
            }

            const formatDate = (iso) => {
                if (!iso) return '-';
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return iso;
                return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            };
            const esc = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const rowsHtml = workouts.map((w, idx) => `
                <div class="border border-orange-100 bg-white rounded-xl p-3 mb-2 shadow-sm hover:shadow transition">
                    <div class="flex items-start gap-3">
                        <input type="checkbox" class="strava-pick-check mt-1.5 h-4 w-4 accent-orange-500" data-idx="${idx}">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2">
                                <button type="button" class="strava-pick-detail text-left text-xs font-black text-slate-700 truncate hover:text-blue-600" data-idx="${idx}">
                                    ${esc(w.name || w.typeLabel || 'Actividad')}
                                </button>
                                <span class="text-[10px] text-gray-400">${formatDate(w.startDateLocal || w.startDate)}</span>
                            </div>
                            <div class="text-[10px] text-gray-500 mt-1">${esc(w.typeLabel || w.sportType)} • ${Math.round(w.timeMin || 0)} min • Int ${esc(w.intensityLabel || 'Media')}</div>
                            <div class="mt-1 flex items-center gap-2">
                                <label class="text-[10px] text-gray-500">Kcal:</label>
                                <input type="number" min="0" class="strava-kcal-input w-20 border border-gray-200 rounded px-1 py-0.5 text-[11px] font-bold text-right" data-idx="${idx}" value="${Math.round(w.kcal || 0)}">
                                <span class="text-[10px] text-gray-400">(editable)</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');

            const detail0 = workouts[0];
            const detailHtml = (w) => `
                <div class="text-left text-[12px] space-y-1">
                    <div><b>Actividad:</b> ${esc(w.name || '-')}</div>
                    <div><b>Tipo:</b> ${esc(w.typeLabel || w.sportType || '-')}</div>
                    <div><b>Fecha:</b> ${formatDate(w.startDateLocal || w.startDate)}</div>
                    <div><b>Tiempo:</b> ${Math.round(w.timeMin || 0)} min</div>
                    <div><b>Distancia:</b> ${(Number(w.distanceKm) || 0).toFixed(2)} km</div>
                    <div><b>Desnivel:</b> ${Math.round(Number(w.elevationGain) || 0)} m</div>
                    <div><b>FC media/max:</b> ${Math.round(Number(w.averageHr) || 0)} / ${Math.round(Number(w.maxHr) || 0)} bpm</div>
                    <div><b>Suffer score:</b> ${Math.round(Number(w.sufferScore) || 0)}</div>
                    <div><b>Calorías Strava:</b> ${Math.round(Number(w.caloriesRaw) || 0)} kcal</div>
                    <div><b>Calorías por kJ:</b> ${Math.round(Number(w.caloriesFromKj) || 0)} kcal</div>
                    <div><b>Calorías estimadas:</b> ${Math.round(Number(w.caloriesEstimated) || 0)} kcal</div>
                    <div><b>Clima (orientativo):</b> ${w.weatherContext && w.weatherContext.summary ? esc(w.weatherContext.summary) : '-'}</div>
                </div>
            `;

            Swal.fire({
                title: 'Selecciona entrenos de Strava',
                width: 820,
                html: `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                        <div>
                            <div class="mb-2 flex items-center gap-2">
                                <button type="button" id="strava-select-all" class="px-2 py-1 rounded-lg bg-orange-100 text-orange-700 text-[11px] font-black">Seleccionar todo</button>
                                <button type="button" id="strava-unselect-all" class="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-black">Quitar todo</button>
                                <span id="strava-selected-count" class="text-[11px] text-slate-500 ml-auto">0 seleccionados</span>
                            </div>
                            <div style="max-height:340px;overflow:auto">${rowsHtml}</div>
                        </div>
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <div class="text-[11px] font-black text-slate-600 uppercase mb-2">Detalle</div>
                            <div id="strava-pick-detail-box">${detailHtml(detail0)}</div>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Importar seleccionados',
                cancelButtonText: 'Cancelar',
                didOpen: () => {
                    const box = document.getElementById('strava-pick-detail-box');
                    const countEl = document.getElementById('strava-selected-count');
                    const refreshCount = () => {
                        const count = document.querySelectorAll('.strava-pick-check:checked').length;
                        if (countEl) countEl.textContent = `${count} seleccionados`;
                    };

                    document.querySelectorAll('.strava-pick-detail').forEach((btn) => {
                        btn.addEventListener('click', () => {
                            const idx = Number(btn.dataset.idx);
                            const w = workouts[idx];
                            if (box && w) box.innerHTML = detailHtml(w);
                        });
                    });

                    document.querySelectorAll('.strava-pick-check').forEach((ch) => {
                        ch.addEventListener('change', refreshCount);
                    });

                    const btnAll = document.getElementById('strava-select-all');
                    const btnNone = document.getElementById('strava-unselect-all');
                    if (btnAll) {
                        btnAll.addEventListener('click', () => {
                            document.querySelectorAll('.strava-pick-check').forEach((c) => c.checked = true);
                            refreshCount();
                        });
                    }
                    if (btnNone) {
                        btnNone.addEventListener('click', () => {
                            document.querySelectorAll('.strava-pick-check').forEach((c) => c.checked = false);
                            refreshCount();
                        });
                    }
                    refreshCount();
                },
                preConfirm: () => {
                    const picks = [];
                    const checks = document.querySelectorAll('.strava-pick-check');
                    checks.forEach((ch) => {
                        if (!ch.checked) return;
                        const idx = Number(ch.dataset.idx);
                        const base = workouts[idx];
                        if (!base) return;
                        const kcalInput = document.querySelector(`.strava-kcal-input[data-idx="${idx}"]`);
                        const editedKcal = Number(kcalInput && kcalInput.value);
                        picks.push({ ...base, kcal: Number.isFinite(editedKcal) && editedKcal >= 0 ? editedKcal : (Number(base.kcal) || 0) });
                    });
                    if (!picks.length) {
                        Swal.showValidationMessage('Selecciona al menos un entrenamiento.');
                        return false;
                    }
                    return picks;
                }
            }).then((res) => {
                if (!res.isConfirmed || !Array.isArray(res.value)) return;
                const applied = applyStravaWorkoutsToGym(res.value);
                if (!applied) return;
                if (applied.imported > 0) {
                    Swal.fire({ icon: 'success', title: 'Entrenos sincronizados', text: `Importados: ${applied.imported} · Actualizados: ${applied.updated} · Omitidos: ${applied.duplicated}` });
                } else if (applied.updated > 0) {
                    Swal.fire({ icon: 'success', title: 'Entrenos actualizados', text: `Actualizados: ${applied.updated}` });
                } else {
                    Swal.fire({ icon: 'warning', title: 'No se importó ninguno', text: `Todos estaban duplicados o sin datos válidos.` });
                }
            });
        }

        // Hooks para módulo externo de Strava
        window.applyStravaWorkoutsToGym = applyStravaWorkoutsToGym;
        window.setStravaGymStatus = setStravaGymStatus;
        window.openStravaGymPicker = openStravaGymPicker;
        window.confirmClearAllStravaCatalog = confirmClearAllStravaCatalog;

        function updateSport() { 
            todayData.runKm = parseFloat(document.getElementById('range-run-km').value) || 0; 
            todayData.runPace = parseFloat(document.getElementById('range-run-pace').value) || 5.5; 
            todayData.runInt = parseInt(document.getElementById('range-run-int').value) || 2; 
            todayData.runCals = parseFloat(document.getElementById('run-cals').value) || 0; // Manual

            todayData.bikeKm = parseFloat(document.getElementById('range-bike-km').value) || 0; 
            todayData.bikeInt = parseInt(document.getElementById('range-bike-int').value) || 2; 
            todayData.bikeCals = parseFloat(document.getElementById('bike-cals').value) || 0; // Manual

            todayData.steps = parseInt(document.getElementById('range-steps').value) || 0; 
            todayData.standingHours = parseFloat(document.getElementById('range-standing').value) || 0; 
            
            // Calcular Gym Time desde sesiones
            let totalGymTime = 0;
            let maxInt = 1;
            if(todayData.gymSessions) {
                todayData.gymSessions.forEach(s => { totalGymTime += s.time; if(s.int > maxInt) maxInt = s.int; });
            }
            todayData.gymTime = totalGymTime;
            todayData.gymInt = maxInt;
            
            todayData.gymCals = parseFloat(document.getElementById('gym-cals').value) || 0; 
            
            document.getElementById('val-run-km').innerText = todayData.runKm; 
            let min = Math.floor(todayData.runPace); 
            let sec = Math.round((todayData.runPace - min) * 60); 
            document.getElementById('val-run-pace').innerText = `${min}:${sec < 10 ? '0' : ''}${sec}`; 
            
            const ints = ['--', 'Suave', 'Normal', 'Alta']; 
            document.getElementById('val-run-int-text').innerText = ints[todayData.runInt] || '--'; 
            document.getElementById('val-bike-km').innerText = todayData.bikeKm; 
            document.getElementById('val-bike-int-text').innerText = ints[todayData.bikeInt] || '--'; 
            document.getElementById('total-gym-time-display').innerText = todayData.gymTime + ' min';
            
            updateDay(); 
            proposeUpdateMaxPerformance();
        }

        function proposeUpdateMaxPerformance() {
            if (!USER_BIO) return;
            const key = `fittracker_max_prompt_${new Date().toISOString().slice(0,10)}`;
            if (localStorage.getItem(key)) return;

            const suggestions = [];
            if ((Number(todayData.runKm) || 0) > (Number(USER_BIO.maxRunKm) || 0) && (Number(todayData.runKm) || 0) > 0) {
                suggestions.push({ field: 'maxRunKm', label: 'Max Run (km)', value: Number(todayData.runKm) });
            }
            if ((Number(todayData.bikeKm) || 0) > (Number(USER_BIO.maxBikeKm) || 0) && (Number(todayData.bikeKm) || 0) > 0) {
                suggestions.push({ field: 'maxBikeKm', label: 'Max Bici (km)', value: Number(todayData.bikeKm) });
            }
            if ((Number(todayData.gymTime) || 0) > (Number(USER_BIO.maxGymTime) || 0) && (Number(todayData.gymTime) || 0) > 0) {
                suggestions.push({ field: 'maxGymTime', label: 'Max Gym (min)', value: Number(todayData.gymTime) });
            }
            if (suggestions.length === 0) return;

            localStorage.setItem(key, '1');
            const html = suggestions.map(s => `<div class="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2">
                <div class="text-left"><div class="font-black text-slate-800 text-sm">${s.label}</div><div class="text-xs text-slate-500">Nuevo récord detectado</div></div>
                <div class="font-mono font-black text-blue-600">${s.value}</div>
            </div>`).join('');

            Swal.fire({
                title: 'Nuevo récord detectado',
                html: `<div class="text-sm text-slate-700 mb-3">¿Quieres actualizar tus máximos? Esto mejora el mapa de recuperación y el “esfuerzo relativo”.</div>${html}`,
                showCancelButton: true,
                confirmButtonText: 'Actualizar máximos',
                cancelButtonText: 'Ahora no',
                confirmButtonColor: '#1e293b'
            }).then(async (res) => {
                if (!res.isConfirmed) return;
                suggestions.forEach(s => { USER_BIO[s.field] = s.value; });
                await guardarDatosUsuario();
                ENGINE.recalculateEverything({ shouldSaveDay: false });
            });
        }
        
        function showDetails(type) { 
            const modal = document.getElementById('info-modal'); 
            const title = document.getElementById('modal-title'); 
            const body = document.getElementById('modal-body'); 
            
            if(type === 'stress') { 
                title.innerText = "Diagnóstico Integral"; 
                
                const mentalItems = stressDetails.filter(d => d.cat === 'mental').map(d => `<li class="text-xs ${d.type === 'bad' ? 'text-red-500 font-bold' : 'text-slate-600'}">• ${d.text}</li>`).join(''); 
                const physItems = stressDetails.filter(d => d.cat === 'physical').map(d => `<li class="text-xs ${d.type === 'bad' ? 'text-red-500 font-bold' : 'text-slate-600'}">• ${d.text}</li>`).join(''); 
                
                let fatigueMsg = ""; 
                if(fatigue7d < 40) fatigueMsg = "Estás fresco/a (Zona Verde). Puedes entrenar duro."; 
                else if(fatigue7d < 70) fatigueMsg = "Fatiga acumulada moderada (Zona Amarilla). Vigila el sueño."; 
                else fatigueMsg = "<b>ALERTA ROJA:</b> Sobrecarga sistémica. Necesitas un día de descarga total."; 
                
                body.innerHTML = `<div class="space-y-4">
                    <div class="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                        <h4 class="font-bold text-indigo-700 text-sm mb-2">🧠 Carga Mental (${mentalLoad}%)</h4>
                        <p class="text-xs text-slate-600 mb-2">${mentalExplanation || 'Sin datos'}</p>
                        <ul class="mb-2 space-y-1">${mentalItems || '<li class="text-xs text-gray-400">Sin carga significativa</li>'}</ul>
                    </div>
                    <div class="bg-orange-50 p-3 rounded-xl border border-orange-100">
                        <h4 class="font-bold text-orange-700 text-sm mb-2">💪 Carga Física (${physicalLoad}%)</h4>
                        <p class="text-xs text-slate-600 mb-2">${physicalExplanation || 'Sin datos'}</p>
                        <ul class="mb-2 space-y-1">${physItems || '<li class="text-xs text-gray-400">Sin carga significativa</li>'}</ul>
                    </div>
                    <div class="bg-teal-50 p-3 rounded-xl border border-teal-100">
                        <h4 class="font-bold text-teal-700 text-sm mb-2">📅 Fatiga Crónica (7 días: ${fatigue7d}%)</h4>
                        <p class="text-xs text-teal-800">${fatigueMsg}</p>
                    </div>
                </div>`; 
            } else if (type === 'water') { 
                title.innerText = "Hidratación"; 
                body.innerHTML = waterDetails.map(d => `<div class="flex justify-between items-center bg-white border border-gray-100 p-3 rounded-xl mb-2"><span class="text-sm text-slate-600">${d.txt}</span><span class="text-sm font-bold text-blue-500">${d.val}</span></div>`).join('') +
                `<div class="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <p class="text-sm text-slate-700">${getWaterAdvice()}</p>
                </div>`; 
            } else if (type === 'study') { 
                title.innerText = "Detalle Cognitivo"; 
                const focusLabels = {1: 'Bajo', 2: 'Medio', 3: 'Deep Work'}; 
                let content = `<div class="bg-purple-50 p-4 rounded-2xl border border-purple-100 text-sm text-slate-700 mb-4">${studyAdvice}</div>`; 
                content += todayData.studySessions.length ? todayData.studySessions.map(s => `<div class="bg-gray-50 p-3 rounded-xl mb-2 flex justify-between"><span class="font-bold text-slate-700">${s.hours} horas</span><span class="text-xs text-purple-500 font-bold uppercase">${focusLabels[s.focus]}</span></div>`).join('') : '<p class="text-gray-400 text-center italic">Sin sesiones.</p>'; 
                body.innerHTML = content; 
            } else if (type === 'nutrition') { 
                title.innerText = "Control de Dieta"; 
                
                const micros = calculateMicros();
                const skipMicroNags = foodLogHasServerEntriesWithoutMicros();
                let adviceList = [];
                if (typeof window.fittrackerBuildDynamicDietAdvice === 'function') {
                    adviceList = window.fittrackerBuildDynamicDietAdvice({
                        USER_BIO,
                        todayData,
                        currentGoals,
                        history,
                        mentalLoad,
                        physicalLoad,
                        micros,
                        MICRO_DEFS_REF: MICRO_DEFS,
                        skipMicronutrientNags: skipMicroNags,
                        nowMs: Date.now(),
                    });
                }
                if (!adviceList.length) {
                    adviceList.push({ icon: 'fa-circle-info', color: 'text-slate-500', text: '<b>Consejos dinámicos:</b> carga el script <b>js/core/dynamic-diet-advice.js</b> (debería cargarse solo en la cabecera) para ver el plan variable.' });
                }

                let smartAdvice = `<ul class="space-y-3">`;
                adviceList.forEach((item) => {
                    smartAdvice += `<li class="flex gap-3 items-start"><div class="mt-0.5 w-5 flex-shrink-0 text-center"><i class="fas ${item.icon} ${item.color} text-sm"></i></div><span class="text-xs text-slate-600 leading-snug">${item.text}</span></li>`;
                });
                smartAdvice += `</ul>`;

                const macroExtra =
                    typeof window.fittrackerBuildDynamicMacroExtraLines === 'function'
                        ? window.fittrackerBuildDynamicMacroExtraLines({
                              USER_BIO,
                              todayData,
                              currentGoals,
                              history,
                              mentalLoad,
                              physicalLoad,
                              nowMs: Date.now(),
                          })
                        : '';

                body.innerHTML = `
                    <div class="bg-orange-50 p-4 rounded-2xl border border-orange-100 text-sm text-slate-700 mb-4 shadow-sm">
                        <h4 class="font-bold text-orange-800 mb-3 uppercase text-xs tracking-wider border-b border-orange-200 pb-2">Plan de acción (variable según tu día y la hora)</h4>
                        ${smartAdvice}
                    </div>
                    <p class="text-xs font-bold text-gray-400 uppercase mb-2">Estado macros + lectura al abrir</p>
                    <div class="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-sm text-slate-600 mb-4"><ul class="list-disc pl-4 space-y-1">${nutritionAdvice || "<li>Mantén una alimentación equilibrada.</li>"}${macroExtra}</ul></div>
                    <button onclick="showMicros()" class="w-full py-3 bg-slate-800 text-white rounded-xl font-bold shadow-lg active:scale-95 transition">Ver Panel de 18 Vitaminas</button>
                `; 
            } else if (type === 'sport') { 
                title.innerText = "Detalle Actividad"; 
                body.innerHTML = `<div class="grid grid-cols-2 gap-3 mb-4"><div class="bg-green-50 p-3 rounded-2xl text-center"><i class="fas fa-shoe-prints text-green-500 text-2xl mb-1"></i><div class="font-bold text-slate-700">${todayData.steps}</div><div class="text-[10px] text-gray-400">Pasos</div></div><div class="bg-orange-50 p-3 rounded-2xl text-center"><i class="fas fa-running text-orange-500 text-2xl mb-1"></i><div class="font-bold text-slate-700">${todayData.runKm} km</div><div class="text-[10px] text-gray-400">Running</div></div></div>`; 
            } 
            modal.classList.add('open'); 
        }
        
        function closeModal(e) { 
            if (e && !e.target.classList.contains('modal-overlay')) return; 
            document.getElementById('info-modal').classList.remove('open'); 
        }
        
        function renderFoodCategories() { 
            const container = document.getElementById('foodCategoriesContainer'); 
            container.innerHTML = ''; 
            const mainMealsConfig = [ 
                { id: 'Desayuno', icon: 'fa-sun', color: 'yellow' }, 
                { id: 'Almuerzo', icon: 'fa-bread-slice', color: 'orange' }, 
                { id: 'Comida', icon: 'fa-utensils', color: 'red' }, 
                { id: 'Merienda', icon: 'fa-cookie-bite', color: 'pink' }, 
                { id: 'Cena', icon: 'fa-moon', color: 'indigo' } 
            ]; 
            
            const mealContainer = document.createElement('div'); 
            mealContainer.className = "mb-6 space-y-3"; 
            mealContainer.innerHTML = '<h3 class="font-bold text-slate-700 text-sm uppercase tracking-wider mb-3 ml-1">🍽️ Tiempos de Comida</h3>'; 
            
            mainMealsConfig.forEach(cfg => { 
                if(foodDatabase[cfg.id]) { 
                    mealContainer.appendChild(createSuperGroupStyle( 
                        cfg.id, 
                        cfg.icon, 
                        `bg-${cfg.color}-50`, 
                        `text-${cfg.color}-600`, 
                        `border-${cfg.color}-200`, 
                        [cfg.id] 
                    )); 
                } 
            }); 
            container.appendChild(mealContainer); 
            
            const pantryKeys = ['Frutas', 'Verduras', 'Verduras y Frutas Extra (Exóticas y Específicas)', 'Carnes', 'Pescados', 'Huevos', 'Frutos Secos', 'Legumbres', 'Cereales Grano', 'Pastas', 'Panes', 'Ingredientes y Básicos de Cocina']; 
            container.appendChild(createSuperGroup('🍎 Despensa y Básicos', 'bg-green-50', 'text-green-800', 'border-green-100', pantryKeys)); 

            const dairyKeys = ['Leches', 'Quesos', 'Yogures', 'Lácteos y Postres (Ampliación)'];
            container.appendChild(createSuperGroup('🥛 Lácteos y Postres', 'bg-blue-50', 'text-blue-800', 'border-blue-100', dairyKeys));

            const preparedKeys = ['Platos Preparados y Tradicionales', 'Platos de Pasta (Cocinados)', 'Arroces y Guisos Españoles', 'Bocadillos y Sandwiches (Completos)', 'Tapas y Raciones Típicas', 'Mercadona / Hacendado (Ampliación Específicos)', 'Embutidos y Charcutería', 'Snacks y Aperitivos Salados', 'Platos Combinados', 'Pastas y Arroces Elaborados', 'Panes y Embutidos', 'Legumbres y Cereales', 'Mercadona Hacendado Extras'];
            container.appendChild(createSuperGroup('🥘 Platos, Tapas y Charcutería', 'bg-yellow-50', 'text-yellow-800', 'border-yellow-100', preparedKeys));
            
            const fastFoodKeys = ['Burger King', 'McDonalds', 'KFC', 'Taco Bell España', 'Taco Bell (Carta Ampliada)', 'Comida China y Asiática', 'Sushi y Comida Japonesa', 'Sushi (Carta Detallada)', 'Hamburguesas', 'Acompañamientos', 'Fast Food Variado']; 
            container.appendChild(createSuperGroup('🍔 Comida Rápida', 'bg-orange-50', 'text-orange-800', 'border-orange-100', fastFoodKeys)); 
            
            const sweetKeys = ['Panadería y Desayuno (Marcas y Tipos)', 'Bolleria', 'Bolleria y Pasteleria', 'Dulces', 'Chocolates y Galletas', 'Chuches y Golosinas', 'Golosinas y Snacks Dulces', 'Postres y Caprichos Españoles', 'Helados']; 
            container.appendChild(createSuperGroup('🍩 Panadería y Dulces', 'bg-purple-50', 'text-purple-800', 'border-purple-100', sweetKeys)); 
            
            const drinkKeys = ['Bebidas', 'Bebidas (Alcohol y Refrescos Extra)', 'Bebidas Alcohólicas Típicas', 'Bebidas y Cócteles'];
            container.appendChild(createSuperGroup('🍹 Bebidas', 'bg-teal-50', 'text-teal-800', 'border-teal-100', drinkKeys));
            
            const sauceKeys = ['Salsas', 'Salsas y Condimentos']; 
            container.appendChild(createSuperGroup('🥫 Salsas', 'bg-red-50', 'text-red-800', 'border-red-100', sauceKeys)); 
        }
        
        function createSuperGroupStyle(title, iconClass, bgClass, textClass, borderClass, keys) { 
            const groupDiv = document.createElement('div'); 
            groupDiv.className = `border ${borderClass} rounded-2xl ${bgClass} overflow-hidden shadow-sm transition hover:shadow-md`; 
            
            const header = document.createElement('div'); 
            header.className = `p-4 font-bold ${textClass} cursor-pointer flex justify-between items-center group-header`; 
            header.innerHTML = `<span class="flex items-center gap-3"><i class="fas ${iconClass} text-lg"></i> ${title}</span> <i class="fas fa-chevron-down opacity-50 transition-transform duration-300"></i>`; 
            header.onclick = function() { 
                this.nextElementSibling.classList.toggle('open'); 
                this.querySelector('.fa-chevron-down').classList.toggle('rotate-180'); 
            }; 
            
            const contentDiv = document.createElement('div'); 
            contentDiv.className = "group-content bg-white"; 
            
            if(keys.length === 1 && foodDatabase[keys[0]]) { 
                contentDiv.innerHTML = renderFoodList(keys[0]); 
            } else { 
                keys.forEach(key => { 
                    if(foodDatabase[key]) { 
                        contentDiv.innerHTML += renderFoodList(key); 
                    } 
                }); 
            } 
            
            groupDiv.appendChild(header); 
            groupDiv.appendChild(contentDiv); 
            return groupDiv; 
        }
        
        function createSuperGroup(title, bgClass, textClass, borderClass, keys) { 
            const groupDiv = document.createElement('div'); 
            groupDiv.className = `border ${borderClass} rounded-2xl ${bgClass} overflow-hidden shadow-sm mb-3`; 
            
            const header = document.createElement('div'); 
            header.className = `p-4 font-bold ${textClass} cursor-pointer flex justify-between items-center group-header`; 
            header.innerHTML = `<span>${title}</span> <i class="fas fa-layer-group opacity-50"></i>`; 
            header.onclick = function() { 
                this.nextElementSibling.classList.toggle('open'); 
            }; 
            
            const contentDiv = document.createElement('div'); 
            contentDiv.className = "group-content bg-white px-2 py-2 space-y-2"; 
            
            keys.forEach(key => { 
                if(foodDatabase[key]) { 
                    const subCat = createAccordion(key, 'bg-gray-50', 'text-gray-600', 'border-gray-200'); 
                    contentDiv.appendChild(subCat); 
                } 
            }); 
            
            groupDiv.appendChild(header); 
            groupDiv.appendChild(contentDiv); 
            return groupDiv; 
        }
        
        function createAccordion(cat, bgClass, textClass, borderClass) { 
            const div = document.createElement('div'); 
            div.className = `border ${borderClass} rounded-2xl ${bgClass} overflow-hidden shadow-sm transition hover:shadow-md`; 
            div.innerHTML = `<div class="p-4 font-bold ${textClass} cursor-pointer flex justify-between items-center group-header" onclick="this.nextElementSibling.classList.toggle('open')"><span class="flex items-center gap-2">${cat}</span> <i class="fas fa-chevron-down text-xs opacity-50"></i></div><div class="meal-content bg-slate-50">${renderFoodList(cat)}</div>`; 
            return div; 
        }
        
        function renderFoodList(cat) { 
            if(!foodDatabase[cat]) return ''; 
            return foodDatabase[cat].map((f, i) => `<div class="p-3 border-t border-gray-100 flex items-center justify-between hover:bg-blue-50/30 transition px-4 gap-2 search-item bg-white"><div class="flex-1"><div class="font-bold text-sm text-slate-700 item-name">${f.name}</div><div class="text-[10px] text-gray-400 font-mono mt-0.5">Base: ${f.cal} kcal / ${getSmartDefaultWeightLocal(f)}g</div></div><div class="flex items-center gap-2"><input type="number" id="weight-${cat.replace(/\s+/g, '')}-${i}" value="${getSmartDefaultWeightLocal(f)}" class="w-14 bg-white border border-gray-200 rounded-lg text-xs font-bold text-center py-2 focus:border-blue-500 outline-none shadow-sm" placeholder="g"><span class="text-[10px] text-gray-400">g</span></div><div class="flex gap-2 ml-1"><button onclick="viewCalculatedDetails('${cat}', ${i})" class="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-blue-500 shadow-sm flex items-center justify-center"><i class="fas fa-search text-xs"></i></button><button onclick="addCalculatedFood('${cat}', ${i})" class="w-8 h-8 rounded-full bg-primary text-white shadow-sm active:scale-90 transition flex items-center justify-center"><i class="fas fa-plus text-xs"></i></button></div></div>`).join(''); 
        }
        
        function searchGlobal(query) { 
            const results = document.getElementById('searchResults'); 
            if (query.length < 2) { 
                results.classList.add('hidden'); 
                return; 
            } 
            results.classList.remove('hidden'); 
            results.innerHTML = ''; 
            
            const normalize = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            // Lógica "La Hostia": Mapeo inteligente y búsqueda multi-término
            let cleanQuery = normalize(query);
            if (cleanQuery.includes("mercadona") || cleanQuery.includes("mercadonal")) {
                cleanQuery = cleanQuery.replace(/mercadona[l]?/g, "hacendado");
            }
            
            const terms = cleanQuery.split(" ").filter(t => t.length > 0);
            
            let count = 0; 
            for (const cat in foodDatabase) { 
                foodDatabase[cat].forEach((f, i) => { 
                    const normName = normalize(f.name);
                    const match = terms.every(term => normName.includes(term));
                    
                    if (match && count < 100) { 
                        count++; 
                        const div = document.createElement('div'); 
                        div.className = 'p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex justify-between items-center group'; 
                        div.innerHTML = `<div><div class="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition">${f.name}</div><div class="flex gap-2 text-[10px] text-gray-400"><span class="bg-gray-100 px-1.5 rounded text-gray-500">${cat}</span><span>${f.cal} kcal</span></div></div><i class="fas fa-plus-circle text-blue-400 opacity-0 group-hover:opacity-100 transition"></i>`; 
                        div.onclick = () => { 
                            viewCalculatedDetails(cat, i, true); 
                            results.classList.add('hidden'); 
                            document.getElementById('globalSearch').value = ''; 
                        }; 
                        results.appendChild(div); 
                    } 
                }); 
            } 
            if(count === 0) results.innerHTML = '<div class="p-4 text-center text-sm text-gray-400 italic">No se encontraron productos.<br>Prueba palabras clave simples.</div>'; 
        }
        
        function getSmartDefaultWeightLocal(food) {
            const mod = window.__FITTRACKER_MODULES__;
            if (mod && typeof mod.getSmartDefaultWeight === 'function') {
                return mod.getSmartDefaultWeight(food);
            }
            const w = Number(food && food.weight);
            if (Number.isFinite(w) && w > 0) return w;
            const s = Number(food && (food.servingWeightGrams || food.serving_size_g));
            if (Number.isFinite(s) && s > 0) return s;
            return 100;
        }

        function getCalculatedFood(cat, idx) {
            const base = foodDatabase[cat][idx];
            const catId = cat.replace(/\s+/g, '');
            const refW = getSmartDefaultWeightLocal(base);
            const inputEl = document.getElementById(`weight-${catId}-${idx}`);
            const inputVal = inputEl ? inputEl.value : refW;
            const newWeight = parseFloat(inputVal) || refW;
            const ratio = newWeight / refW;
            const micros = base.micros || estimateMicros(base.name, cat);
            return { name: base.name, weight: newWeight, cal: base.cal * ratio, prot: base.prot * ratio, fat: base.fat * ratio, carb: base.carb * ratio, sat: (base.sat || 0) * ratio, micros: micros };
        }

        function viewCalculatedDetails(cat, idx, fromSearch = false) {
            const base = foodDatabase[cat][idx];
            const refW = getSmartDefaultWeightLocal(base);
            let initialWeight = refW;
            if (!fromSearch) {
                const catId = cat.replace(/\s+/g, '');
                const listInput = document.getElementById(`weight-${catId}-${idx}`);
                if (listInput) initialWeight = parseFloat(listInput.value) || refW;
            }
            
            Swal.fire({ 
                title: base.name, 
                html: `<div class="mb-4"><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Cantidad (Gramos)</label><input id="swal-grams" type="number" value="${initialWeight}" class="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-center text-xl font-bold text-slate-700 focus:border-blue-500 outline-none"></div><div id="swal-stats" class="grid grid-cols-2 gap-3 text-center mb-2 transition-all"></div>`, 
                html: `
                    <div class="mb-4">
                        <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Cantidad (Gramos)</label>
                        <input id="swal-grams" type="number" value="${initialWeight}" class="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-center text-xl font-bold text-slate-700 focus:border-blue-500 outline-none">
                    </div>
                    <div id="swal-stats" class="grid grid-cols-2 gap-3 text-center mb-4 transition-all"></div>
                    
                    <div class="border-t border-gray-100 pt-2">
                        <button type="button" onclick="document.getElementById('micro-details').classList.toggle('hidden')" class="text-xs font-bold text-blue-500 hover:underline flex items-center justify-center w-full gap-1">
                            <i class="fas fa-microscope"></i> Ver 18 Vitaminas & Minerales
                        </button>
                        <div id="micro-details" class="hidden mt-3 text-left bg-slate-50 p-3 rounded-xl max-h-40 overflow-y-auto text-xs space-y-1 border border-gray-100">
                            <!-- Se llena dinámicamente -->
                        </div>
                    </div>
                `, 
                confirmButtonText: 'Añadir a Dieta', 
                confirmButtonColor: '#3b82f6', 
                showCancelButton: true, 
                cancelButtonText: 'Cancelar', 
                didOpen: () => { 
                    const input = document.getElementById('swal-grams'); 
                    const stats = document.getElementById('swal-stats'); 
                    const microDiv = document.getElementById('micro-details');
                    
                    // Estimar micros si no existen
                    const micros = base.micros || estimateMicros(base.name, cat);

                    const updateStats = () => { 
                        const w = parseFloat(input.value) || 0; 
                        const ratio = w / refW; 
                        const satVal = (base.sat || 0) * ratio; 
                        const displaySat = (satVal % 1 !== 0 && satVal < 10) ? satVal.toFixed(1) : Math.round(satVal); 
                        stats.innerHTML = `<div class="bg-gray-50 p-2 rounded-lg"><span class="block text-xs text-gray-400">Energía</span><span class="font-bold text-slate-700">${Math.round(base.cal * ratio)} kcal</span></div><div class="bg-gray-50 p-2 rounded-lg"><span class="block text-xs text-green-500">Proteína</span><span class="font-bold text-green-600">${Math.round(base.prot * ratio)}g</span></div><div class="bg-gray-50 p-2 rounded-lg"><span class="block text-xs text-yellow-500">Grasas</span><span class="font-bold text-yellow-600">${Math.round(base.fat * ratio)}g</span></div><div class="bg-gray-50 p-2 rounded-lg"><span class="block text-xs text-red-500">Carbos</span><span class="font-bold text-red-600">${Math.round(base.carb * ratio)}g</span></div><div class="bg-gray-50 p-2 rounded-lg col-span-2"><span class="block text-xs text-yellow-700">G. Saturadas</span><span class="font-bold text-yellow-800">${displaySat}g</span></div>`; 
                        
                        // Actualizar micros
                        let microHtml = '';
                        Object.keys(micros).forEach(k => {
                            const val = micros[k] * (w / 100); // Asumiendo base 100g para micros
                            if (val > 0.1) microHtml += `<div class="flex justify-between"><span>${MICRO_DEFS[k].name}</span><span class="font-mono font-bold text-slate-600">${val.toFixed(1)}${MICRO_DEFS[k].unit}</span></div>`;
                        });
                        microDiv.innerHTML = microHtml || '<p class="text-center text-gray-400">Trazas no significativas</p>';
                    }; 
                    input.addEventListener('input', updateStats); 
                    updateStats(); 
                }, 
                preConfirm: () => { 
                    const finalWeight = parseFloat(document.getElementById('swal-grams').value) || refW;
                    const ratio = finalWeight / refW; 
                    const micros = base.micros || estimateMicros(base.name, cat);
                    return { name: base.name, weight: finalWeight, cal: base.cal * ratio, prot: base.prot * ratio, fat: base.fat * ratio, carb: base.carb * ratio, sat: (base.sat || 0) * ratio, micros: micros }; 
                } 
            }).then((result) => { 
                if (result.isConfirmed) { 
                    todayData.foodLog.push(result.value); 
                    updateDay(); 
                    Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1000 }).fire({ icon: 'success', title: 'Añadido' }); 
                } 
            }); 
        }
        
        function addCalculatedFood(cat, idx) { 
            const f = getCalculatedFood(cat, idx); 
            todayData.foodLog.push(f); 
            updateDay(); 
            Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1000 }).fire({ icon: 'success', title: 'Añadido' }); 
        }
        
        function removeFood(i) { 
            todayData.foodLog.splice(i, 1); 
            updateDay(); 
        }
        
        function addWater(ml) { 
            todayData.water += ml; 
            updateDay(); 
        }
        
        function removeWater(ml) { 
            if(todayData.water >= ml) { 
                todayData.water -= ml; 
                updateDay(); 
            } 
        }
        
        function openCustomFoodModal() { 
            Swal.fire({ 
                title: 'Crear Alimento', 
                html: `<input id="swal-n" class="swal2-input" placeholder="Nombre"><div class="grid grid-cols-2 gap-2"><input id="swal-k" type="number" class="swal2-input" placeholder="Kcal (por 100g)"><input id="swal-p" type="number" class="swal2-input" placeholder="Prot (por 100g)"><input id="swal-c" type="number" class="swal2-input" placeholder="Carb (por 100g)"><input id="swal-f" type="number" class="swal2-input" placeholder="Grasas (por 100g)"><input id="swal-s" type="number" class="swal2-input" placeholder="G. Saturadas (por 100g)"><input id="swal-w" type="number" class="swal2-input" placeholder="Peso a consumir (g)"></div>`, 
                confirmButtonColor: '#1e293b', 
                confirmButtonText: 'Guardar', 
                preConfirm: () => {
                    const weight = Number(document.getElementById('swal-w').value) || 100;
                    const ratio = weight / 100; // Factor de conversión de 100g a peso real
                    return { 
                        name: document.getElementById('swal-n').value, 
                        cal: Number(document.getElementById('swal-k').value) * ratio, 
                        prot: Number(document.getElementById('swal-p').value) * ratio, 
                        fat: Number(document.getElementById('swal-f').value) * ratio, 
                        carb: Number(document.getElementById('swal-c').value) * ratio, 
                        sat: Number(document.getElementById('swal-s').value) * ratio, 
                        weight: weight,
                        micros: estimateMicros(document.getElementById('swal-n').value, 'Custom') // Estimar micros también para custom
                    };
                } 
            }).then(r => { 
                if(r.value) { 
                    todayData.foodLog.push(r.value); 
                    updateDay(); 
                } 
            }); 
        }
        
        function saveDay() {
            if (authReady && currentUser) {
                return sincronizarDiaEnNube();
            }
            return Promise.resolve();
        }
        
        function loadDay() { 
            todayData = { ...INITIAL_STATE, ...todayData };
            if (!Array.isArray(todayData.studySessions)) todayData.studySessions = []; 
            if(document.getElementById('wakeTime')) document.getElementById('wakeTime').value = todayData.wakeTime; 
            if(document.getElementById('sleepHours')) document.getElementById('sleepHours').value = todayData.sleepHours || ''; 
            if(document.getElementById('sleepQuality')) document.getElementById('sleepQuality').value = todayData.sleepQuality || ''; 
            
            // Sincronizar selector de actividad diaria con USER_BIO
            const activityLevelEl = document.getElementById('daily-activity-level');
            if (activityLevelEl) {
                activityLevelEl.value = (USER_BIO && USER_BIO.activityLevel) || todayData.activityLevel || 'moderate';
                todayData.activityLevel = activityLevelEl.value;
            }
            
            document.getElementById('range-run-km').value = todayData.runKm || 0; 
            document.getElementById('range-run-pace').value = todayData.runPace || 5.5; 
            document.getElementById('range-run-int').value = todayData.runInt || 2; 
            document.getElementById('run-cals').value = todayData.runCals || '';

            document.getElementById('range-bike-km').value = todayData.bikeKm || 0; 
            document.getElementById('range-bike-int').value = todayData.bikeInt || 2; 
            document.getElementById('bike-cals').value = todayData.bikeCals || '';

            document.getElementById('gym-cals').value = todayData.gymCals || ''; 
            document.getElementById('range-mobile').value = todayData.mobileHours || 0; 
            document.getElementById('range-steps').value = todayData.steps || 0; 
            document.getElementById('range-standing').value = todayData.standingHours || 0; 
            if (!todayData.gymSessions) todayData.gymSessions = [];
            if (!Array.isArray(todayData.stravaSyncedWorkouts)) todayData.stravaSyncedWorkouts = [];
            if (!Array.isArray(todayData.stravaTodayActivityIds)) todayData.stravaTodayActivityIds = [];
        }
        
        function stravaActiveLaneId() {
            const page = document.getElementById('strava');
            const lane = page && page.dataset ? String(page.dataset.stravaLane || 'overview').trim() : 'overview';
            return lane || 'overview';
        }

        function refreshStravaChartsOnly() {
            const mod = window.__FITTRACKER_MODULES__;
            if (!mod || typeof mod.mountStravaCharts !== 'function') return;
            const lane = stravaActiveLaneId();
            const sportLane = lane === 'overview' ? undefined : lane;
            try {
                if (typeof mod.unmountStravaCharts === 'function') mod.unmountStravaCharts();
                mod.mountStravaCharts({ todayData, sportLane });
            } catch (e) {
                console.warn('refreshStravaChartsOnly', e);
            }
        }
        window.refreshStravaChartsOnly = refreshStravaChartsOnly;

        function refreshStravaInsightsAndCharts() {
            const mod = window.__FITTRACKER_MODULES__;
            if (!mod) return;
            try {
                const mount = document.getElementById('strava-pro-mount');
                const lane = stravaActiveLaneId();
                if (mount && typeof mod.mountStravaProPanel === 'function') {
                    mod.mountStravaProPanel({ todayData, userBio: USER_BIO, mountEl: mount, activeTab: lane });
                } else {
                    refreshStravaChartsOnly();
                }
            } catch (e) {
                console.warn('refreshStravaInsightsAndCharts', e);
            }
        }

        async function navigateTo(id) { 
            document.querySelectorAll('.page-section').forEach(e=>e.classList.remove('active')); 
            document.getElementById(id).classList.add('active'); 
            document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active')); 
            document.getElementById('nav-'+id).classList.add('active'); 
            if (id === 'registro') {
                await refreshTrackerWeeksFromCloud();
                updateHistoryUI();
            }
            if (id === 'strava') {
                renderStravaGymWorkouts();
                refreshStravaInsightsAndCharts();
            }
            window.scrollTo(0,0); 
        }
        
        function updateHistoryUI() { 
            const list = document.getElementById('historyList'); 
            if(history.length === 0 && trackerWeeks.length === 0) { 
                list.innerHTML = '<div class="text-center text-gray-400 mt-10"><i class="fas fa-history text-4xl mb-3 opacity-30"></i><p>Sin historial</p></div>'; 
                return; 
            } 
            const getWeekIdFromDateKey = (dateKey) => {
                const d = new Date(`${dateKey}T12:00:00`);
                const day = d.getDay();
                const diffToMonday = (day + 6) % 7;
                const monday = new Date(d);
                monday.setDate(d.getDate() - diffToMonday);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                const fmt = (x) => x.toISOString().slice(0, 10);
                return `${fmt(monday)}_${fmt(sunday)}`;
            };

            const weekMap = new Map();
            history.forEach((h, i) => {
                const key = h.dateKey ? getWeekIdFromDateKey(h.dateKey) : `legacy_${i}`;
                if (!weekMap.has(key)) weekMap.set(key, { days: [], tracker: null });
                weekMap.get(key).days.push({ ...h, __idx: i });
            });
            trackerWeeks.forEach((w) => {
                const key = w.weekId || `${w.weekStart}_${w.weekEnd}`;
                if (!weekMap.has(key)) weekMap.set(key, { days: [], tracker: null });
                weekMap.get(key).tracker = w;
            });

            const sortedWeekKeys = Array.from(weekMap.keys()).sort((a, b) => b.localeCompare(a));
            list.innerHTML = sortedWeekKeys.map((wk) => {
                const block = weekMap.get(wk);
                const title = wk.includes('_') ? `Semana ${wk.replace('_', ' → ')}` : 'Semana';
                const trackerLine = block.tracker
                    ? `<div class="text-[11px] text-emerald-600 font-bold mb-2 flex items-center justify-between gap-2"><span>Tracker enlazado: ${block.tracker.score || 0}% · ${block.tracker.checks || 0} checks</span><button onclick="generateTrackerWeekPDF('${(block.tracker.weekId || '').replace(/'/g, "\\'")}')" class="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold"><i class="fas fa-file-pdf mr-1"></i>PDF Tracker</button></div>`
                    : '';
                const daysHtml = (block.days || []).sort((a,b) => (b.dateKey || '').localeCompare(a.dateKey || '')).map((h) => `
                    <div class="card p-4 flex justify-between items-center shadow-sm hover:shadow-md transition mb-2">
                        <div>
                            <div class="font-bold text-slate-800 capitalize text-sm">${h.date}</div>
                            <div class="text-[10px] text-gray-400 mt-1">Carga Global: <b>${h.stress || 0}%</b></div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="restoreDay(${h.__idx})" class="w-10 h-10 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center hover:bg-orange-200 transition"><i class="fas fa-undo-alt text-sm"></i></button>
                            <button onclick="generateBeautifulPDF(${h.__idx})" class="bg-slate-800 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition"><i class="fas fa-file-pdf text-sm"></i></button>
                            <button onclick="deleteDay(${h.__idx})" class="w-10 h-10 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition"><i class="fas fa-trash-alt text-sm"></i></button>
                        </div>
                    </div>
                `).join('');
                return `
                    <details class="card p-4 mb-3" open>
                        <summary class="font-bold text-slate-800 cursor-pointer">${title}</summary>
                        <div class="mt-3">
                            ${trackerLine}
                            ${daysHtml || '<div class="text-xs text-gray-400">Sin informes diarios aún.</div>'}
                        </div>
                    </details>
                `;
            }).join('');
        }
        
        function restoreDay(index) {
            Swal.fire({
                title: '¿Restaurar este día?',
                text: "Esto sobreescribirá lo que lleves registrado hoy.",
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, restaurar',
                confirmButtonColor: '#f59e0b'
            }).then(async (result) => {
                if (!result.isConfirmed) return;
                if (!currentUser) {
                    Swal.fire('Sesión', 'Inicia sesión para restaurar y sincronizar.', 'warning');
                    return;
                }
                const rec = history[index];
                if (!rec || !rec.data) return;
                const todayId = getTodayDocId();
                const mod = window.__FITTRACKER_MODULES__;
                const snapshot = mod && typeof mod.buildDailySnapshot === 'function'
                    ? mod.buildDailySnapshot({
                        dateKey: todayId,
                        todayData: JSON.parse(JSON.stringify(rec.data)),
                        currentGoals: rec.goals ? JSON.parse(JSON.stringify(rec.goals)) : null,
                        cli: JSON.parse(JSON.stringify(CLIMA_REAL)),
                    })
                    : null;

                if (mod && snapshot && typeof mod.writeLocalDailySnapshot === 'function') {
                    mod.writeLocalDailySnapshot(currentUser.uid, todayId, snapshot, true);
                }

                todayData = mod && typeof mod.mergeSnapshotIntoInitial === 'function'
                    ? mod.mergeSnapshotIntoInitial(JSON.parse(JSON.stringify(rec.data)), INITIAL_STATE)
                    : JSON.parse(JSON.stringify(rec.data));
                if (rec.goals) {
                    currentGoals = { ...BASE_GOALS, ...JSON.parse(JSON.stringify(rec.goals)) };
                }

                const removed = history[index];
                history.splice(index, 1);
                await borrarHistorialEnNube(removed && removed.firestoreId);

                try {
                    await sincronizarDiaEnNube();
                    if (mod && typeof mod.saveDailySnapshotFirestore === 'function' && snapshot) {
                        await mod.saveDailySnapshotFirestore(db, currentUser.uid, todayId, snapshot);
                    }
                    if (mod && typeof mod.writeLocalDailySnapshot === 'function' && snapshot) {
                        mod.writeLocalDailySnapshot(currentUser.uid, todayId, snapshot, false);
                    }
                } catch (e) {
                    console.error('restoreDay sync:', e);
                }
                window.location.reload();
            });
        }
        
        function deleteDay(index) { 
            Swal.fire({ 
                title: '¿Eliminar registro?', 
                text: "No se podrá recuperar.", 
                icon: 'warning', 
                showCancelButton: true, 
                confirmButtonText: 'Sí, eliminar', 
                confirmButtonColor: '#ef4444' 
            }).then((result) => { 
                if(result.isConfirmed) { 
                    const removed = history[index];
                    history.splice(index, 1); 
                    borrarHistorialEnNube(removed && removed.firestoreId);
                    updateHistoryUI(); 
                    Swal.fire('Eliminado', '', 'success'); 
                } 
            }); 
        }
        
        function generateBeautifulPDF(index) {
            const rec = history[index];
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const dark = [30, 41, 59];
            
            doc.setFillColor(...dark);
            doc.rect(0, 0, 210, 45, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text("INFORME DE RENDIMIENTO", 105, 20, null, null, "center");
            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.text(rec.date.toUpperCase(), 105, 32, null, null, "center");
            
            let y = 55;
            
            doc.setTextColor(0, 0, 0);
            doc.setFillColor(240, 240, 240);
            doc.rect(14, y-5, 180, 25, 'F');
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("RESUMEN DEL DIA", 20, y);
            y += 10;
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.text(`Carga Global: ${rec.stress}% | Energia Subjetiva: ${rec.subjective ? rec.subjective.energy : 'N/A'}/10 | Estado: ${rec.subjective ? rec.subjective.mood : 'N/A'}`, 20, y);
            y += 15;
            
            doc.setFillColor(79, 70, 229);
            doc.rect(14, y-3, (rec.stressScores.mental * 1.8), 6, 'F');
            doc.setFillColor(249, 115, 22);
            doc.rect(14, y+5, (rec.stressScores.physical * 1.8), 6, 'F');
            
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Mental: ${rec.stressScores.mental}%`, 160, y);
            doc.text(`Fisica: ${rec.stressScores.physical}%`, 160, y+8);
            y += 20;
            
            if (rec.mentalExplanation) {
                doc.setFontSize(10);
                doc.setTextColor(79, 70, 229);
                doc.text(`Mental: ${rec.mentalExplanation}`, 14, y);
                y += 6;
            }
            if (rec.physicalExplanation) {
                doc.setFontSize(10);
                doc.setTextColor(249, 115, 22);
                doc.text(`Fisica: ${rec.physicalExplanation}`, 14, y);
                y += 10;
            }
            
            const metricData = [
                ['Sueño', `${rec.data.sleepHours}h / ${rec.data.sleepQuality}%`, 'Pasos', `${rec.data.steps}`],
                ['Agua', `${rec.data.water} ml / ${Math.round(rec.goals.water)} ml`, 'Movil', `${rec.data.mobileHours}h`],
                ['Running', `${rec.data.runKm} km`, 'Ciclismo', `${rec.data.bikeKm} km`],
                ['Gym', `${rec.data.gymTime || 0} min / ${rec.data.gymCals || 0} kcal`, 'Horas Pie', `${rec.data.standingHours}h`]
            ];
            
            doc.autoTable({
                startY: y,
                head: [['Metrica', 'Valor', 'Metrica', 'Valor']],
                body: metricData,
                theme: 'grid',
                headStyles: { fillColor: dark, textColor: [255,255,255] },
                styles: { fontSize: 9, cellPadding: 3 },
                columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 35 }, 2: { cellWidth: 40 }, 3: { cellWidth: 35 } }
            });
            
            y = doc.lastAutoTable.finalY + 10;

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('ACTIVIDAD STRAVA (DIA DEL INFORME)', 14, y);
            y += 5;
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text('Incluye: fecha de la actividad = dia del informe O marcada como «hecha hoy» ese dia en Strava.', 14, y);
            y += 5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            const dayKeyPdf = String(rec.dateKey || '').slice(0, 10);
            const stravaAll = rec.data && Array.isArray(rec.data.stravaSyncedWorkouts) ? rec.data.stravaSyncedWorkouts : [];
            const idsToday = new Set(
                (rec.data && Array.isArray(rec.data.stravaTodayActivityIds) ? rec.data.stravaTodayActivityIds : []).map((x) => String(x))
            );
            const stravaDayRows = stravaAll
                .filter((w) => {
                    if (!w || w.activityId == null) return false;
                    const id = String(w.activityId);
                    const d = String(w.startDateLocal || w.startDate || '').slice(0, 10);
                    if (idsToday.has(id)) return true;
                    return !!(dayKeyPdf && d === dayKeyPdf);
                })
                .map((w) => {
                    const id = String(w.activityId);
                    const d = String(w.startDateLocal || w.startDate || '').slice(0, 10);
                    const markedToday = idsToday.has(id);
                    const sameCalendar = !!(dayKeyPdf && d === dayKeyPdf);
                    const prefix = markedToday && !sameCalendar ? '[Cuenta en este dia] ' : '';
                    return [
                        prefix + String(w.name || w.typeLabel || 'Actividad').substring(0, 26),
                        String(w.typeLabel || w.sportType || '').substring(0, 14),
                        `${(Number(w.distanceKm) || 0).toFixed(1)} km`,
                        `${Math.round(Number(w.timeMin) || 0)} min`,
                        Number(w.avgPaceMinKm) > 0 ? `${Number(w.avgPaceMinKm).toFixed(1)} min/km` : '-',
                        Number(w.averageHr) > 0 ? `${Math.round(Number(w.averageHr))} lpm` : '-',
                    ];
                });
            if (stravaDayRows.length > 0) {
                doc.autoTable({
                    startY: y,
                    head: [['Nombre', 'Tipo', 'Km', 'Tiempo', 'Ritmo', 'FC med.']],
                    body: stravaDayRows,
                    theme: 'striped',
                    headStyles: { fillColor: [234, 88, 12] },
                    styles: { fontSize: 8 },
                });
                y = doc.lastAutoTable.finalY + 10;
            } else {
                doc.setTextColor(120, 120, 120);
                doc.text(
                    dayKeyPdf
                        ? 'No hay actividades Strava para este informe: ninguna con fecha Strava ' +
                              dayKeyPdf +
                              ' y ninguna marcada como «hechas hoy» en ese dia (revisa que el informe se guardara despues de marcarlas).'
                        : 'Sin fecha clave (dateKey) para filtrar Strava en este informe.',
                    14,
                    y + 4
                );
                y += 14;
            }
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("SESIONES DE ESTUDIO", 14, y);
            y += 5;
            
            if (rec.data.studySessions && rec.data.studySessions.length > 0) {
                const studyRows = rec.data.studySessions.map(s => [
                    s.hours + 'h',
                    s.focus === 1 ? 'Bajo' : (s.focus === 2 ? 'Medio' : 'Alto')
                ]);
                doc.autoTable({
                    startY: y,
                    head: [['Duracion', 'Foco']],
                    body: studyRows,
                    theme: 'striped',
                    headStyles: { fillColor: [139, 92, 246] },
                    styles: { fontSize: 9 }
                });
                y = doc.lastAutoTable.finalY + 10;
            } else {
                doc.setFontSize(10);
                doc.setTextColor(150, 150, 150);
                doc.text("Sin sesiones de estudio registradas.", 14, y+5);
                y += 15;
            }
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("REGISTRO NUTRICIONAL", 14, y);
            y += 5;
            
            if (rec.data.foodLog && rec.data.foodLog.length > 0) {
                const foodBody = rec.data.foodLog.map(f => [
                    f.name.substring(0, 20),
                    Math.round(f.cal),
                    Math.round(f.prot),
                    Math.round(f.fat),
                    Math.round(f.carb),
                    f.sat ? f.sat.toFixed(1) : '0'
                ]);
                
                const totalCal = rec.data.foodLog.reduce((a,b)=>a+b.cal,0);
                const totalProt = rec.data.foodLog.reduce((a,b)=>a+b.prot,0);
                const totalFat = rec.data.foodLog.reduce((a,b)=>a+b.fat,0);
                const totalCarb = rec.data.foodLog.reduce((a,b)=>a+b.carb,0);
                const totalSat = rec.data.foodLog.reduce((a,b)=>a+(b.sat||0),0);
                
                foodBody.push(['TOTAL', Math.round(totalCal), Math.round(totalProt), Math.round(totalFat), Math.round(totalCarb), totalSat.toFixed(1)]);
                
                doc.autoTable({
                    startY: y,
                    head: [['Alimento', 'Kcal', 'Prot', 'Grasa', 'Carb', 'Sat']],
                    body: foodBody,
                    theme: 'grid',
                    headStyles: { fillColor: [34, 197, 94] },
                    styles: { fontSize: 8 },
                    columnStyles: { 0: { cellWidth: 60 } }
                });
                y = doc.lastAutoTable.finalY + 10;
            } else {
                doc.setFontSize(10);
                doc.setTextColor(150, 150, 150);
                doc.text("Sin alimentos registrados.", 14, y+5);
                y += 15;
            }
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("ALERTAS DEL DIA", 14, y);
            y += 5;
            
            if (rec.alerts && rec.alerts.length > 0) {
                const alertBody = rec.alerts.map(a => {
                    let typeText = a.type === 'water' ? 'Agua' : (a.type === 'nutrition' ? 'Nutricion' : 'Comida');
                    return [typeText, a.message];
                });
                doc.autoTable({
                    startY: y,
                    head: [['Tipo', 'Alerta']],
                    body: alertBody,
                    theme: 'grid',
                    headStyles: { fillColor: [239, 68, 68] },
                    styles: { fontSize: 9 }
                });
            } else {
                doc.setFontSize(10);
                doc.setTextColor(150, 150, 150);
                doc.text("No hubo alertas este dia.", 14, y+5);
            }
            
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`FitTracker - Informe generado el ${new Date().toLocaleDateString()}`, 105, 285, null, null, 'center');
            }
            
            const safeName = `FitTracker_${(rec.dateKey || 'informe').replace(/[^a-z0-9-]+/gi, '_')}`;
            openPdfPreviewModal(doc, safeName);
        }

        let __ftPdfPreviewUrl = null;
        function closePdfPreviewModal(ev) {
            if (ev && ev.target !== ev.currentTarget) return;
            const m = document.getElementById('pdf-preview-modal');
            const ifr = document.getElementById('pdf-preview-iframe');
            if (__ftPdfPreviewUrl) {
                try {
                    URL.revokeObjectURL(__ftPdfPreviewUrl);
                } catch (_) {}
                __ftPdfPreviewUrl = null;
            }
            if (ifr) ifr.src = 'about:blank';
            if (m) m.classList.remove('open');
        }

        function openPdfPreviewModal(doc, downloadName) {
            let blob;
            try {
                blob = doc.output('blob');
            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'No se pudo generar el PDF.', 'error');
                return;
            }
            if (__ftPdfPreviewUrl) {
                try {
                    URL.revokeObjectURL(__ftPdfPreviewUrl);
                } catch (_) {}
                __ftPdfPreviewUrl = null;
            }
            __ftPdfPreviewUrl = URL.createObjectURL(blob);
            const baseRaw = downloadName || 'FitTracker_informe';
            const base = String(baseRaw).replace(/[^a-z0-9-_]+/gi, '_');
            const ifr = document.getElementById('pdf-preview-iframe');
            const a = document.getElementById('pdf-preview-download');
            const m = document.getElementById('pdf-preview-modal');
            const t = document.getElementById('pdf-preview-title');
            if (t) t.textContent = 'Vista previa · ' + base;
            if (a) {
                a.href = __ftPdfPreviewUrl;
                const fn = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
                a.download = fn;
            }
            if (ifr) {
                const isNarrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;
                ifr.src = isNarrow ? `${__ftPdfPreviewUrl}#toolbar=0&zoom=page-width` : `${__ftPdfPreviewUrl}#toolbar=1`;
            }
            if (m) m.classList.add('open');
        }
        window.closePdfPreviewModal = closePdfPreviewModal;
        window.openPdfPreviewModal = openPdfPreviewModal;

        function generateTrackerWeekPDF(weekId) {
            const week = trackerWeeks.find(w => (w.weekId || '') === weekId);
            if (!week) {
                Swal.fire('No encontrado', 'No se encontró esa semana de Tracker.', 'warning');
                return;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text('TRACKER - INFORME SEMANAL', 14, 16);
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.text(`Semana: ${week.weekStart || '?'} -> ${week.weekEnd || '?'}`, 14, 24);
            doc.text(`Score: ${week.score || 0}% | Checks: ${week.checks || 0}`, 14, 30);

            const daysShort = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
            const habits = Array.isArray(week.habitsSnapshot) ? week.habitsSnapshot : [];
            const data = week.data || {};
            const bodyRows = habits.map((h) => {
                const arr = data[h.id] || [false, false, false, false, false, false, false];
                return [h.name, ...arr.map(v => v ? 'OK' : '-')];
            });
            doc.autoTable({
                startY: 36,
                head: [['Habito', ...daysShort]],
                body: bodyRows.length ? bodyRows : [['Sin datos', '', '', '', '', '', '', '']],
                styles: { fontSize: 9 },
                headStyles: { fillColor: [16, 185, 129] }
            });
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text(`Generado por FitTracker el ${new Date().toLocaleString()}`, 14, 205);
            const wname = `Tracker_${String(week.weekId || week.weekStart || 'semana').replace(/[^a-z0-9-_]+/gi, '_')}`;
            openPdfPreviewModal(doc, wname);
        }
        // ==========================================================================================
        // 📸 MOTOR DE ESCÁNER Y API DE ALIMENTOS (VERSIÓN ORIGINAL PERFECTA)
        // ==========================================================================================
        let escannerActivo = null;

        // 1. INICIAR LA CÁMARA (Versión estable)
        function iniciarEscaner() {
            document.getElementById('contenedor-escaner').style.display = 'block';
            
            escannerActivo = new Html5Qrcode("lector-codigo");
            
            escannerActivo.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 150 } }, // 10 FPS, enfoque seguro
                (codigoEscaneado) => {
                    // ¡Código detectado!
                    cerrarEscaner(); // Apagamos la cámara
                    buscarProductoPorCodigo(codigoEscaneado);
                },
                (errorMessage) => {
                    // Ignorar errores de lectura en progreso
                }
            ).catch((err) => {
                console.error("Error al iniciar la cámara", err);
                Swal.fire('Error', 'Comprueba los permisos de la cámara.', 'error');
            });
        }

        // 2. APAGAR LA CÁMARA
        function cerrarEscaner() {
            if (escannerActivo) {
                escannerActivo.stop().then(() => {
                    document.getElementById('contenedor-escaner').style.display = 'none';
                    escannerActivo = null;
                }).catch(err => console.error("Error al detener cámara", err));
            } else {
                document.getElementById('contenedor-escaner').style.display = 'none';
            }
        }

        // 3. BUSCAR EN OPEN FOOD FACTS Y PEDIR GRAMOS
        async function buscarProductoPorCodigo(codigo) {
            const url = `https://world.openfoodfacts.org/api/v0/product/${codigo}.json`;
            
            try {
                Swal.fire({ title: 'Analizando...', text: 'Buscando nutrientes', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
                
                const respuesta = await fetch(url);
                const datos = await respuesta.json();
                
                if (datos.status === 1) {
                    const p = datos.product;
                    const n = p.nutriments || {};
                    
                    const alimento = {
                        name: p.product_name || 'Producto sin nombre',
                        cal: parseFloat(n['energy-kcal_100g'] || 0),
                        prot: parseFloat(n.proteins_100g || 0),
                        carbs: parseFloat(n.carbohydrates_100g || 0),
                        fat: parseFloat(n.fat_100g || 0),
                        sat: parseFloat(n['saturated-fat_100g'] || 0),
                        azucar: parseFloat(n.sugars_100g || 0),
                        img: p.image_front_url || ''
                    };

                    const sq = parseFloat(String(p.serving_quantity || '').replace(',', '.'));
                    const unit = String(p.serving_quantity_unit || 'g').toLowerCase();
                    let scanDefaultG = 100;
                    if (Number.isFinite(sq) && sq > 0 && unit.startsWith('g')) scanDefaultG = sq;
                    scanDefaultG = getSmartDefaultWeightLocal({ weight: scanDefaultG });
                    
                    // INTERFAZ BONITA CON GRAMOS
                    Swal.fire({
                        title: alimento.name,
                        imageUrl: alimento.img,
                        imageHeight: 120,
                        html: `
                            <div class="grid grid-cols-2 gap-2 text-[11px] mt-2 text-left">
                                <div class="bg-orange-50 p-2 rounded border border-orange-100 text-orange-700"><b>🔥 Kcal:</b> ${alimento.cal.toFixed(1)}</div>
                                <div class="bg-green-50 p-2 rounded border border-green-100 text-green-700"><b>🥩 Prot:</b> ${alimento.prot.toFixed(1)}g</div>
                                <div class="bg-red-50 p-2 rounded border border-red-100 text-red-700"><b>🍞 Carbs:</b> ${alimento.carbs.toFixed(1)}g</div>
                                <div class="bg-yellow-50 p-2 rounded border border-yellow-100 text-yellow-700"><b>🥑 Grasas:</b> ${alimento.fat.toFixed(1)}g</div>
                                <div class="bg-yellow-100 p-2 rounded border border-yellow-200 text-yellow-800"><b>🧈 G. Sat:</b> ${alimento.sat.toFixed(1)}g</div>
                                <div class="bg-blue-50 p-2 rounded border border-blue-100 text-blue-700"><b>🍬 Azúcar:</b> ${alimento.azucar.toFixed(1)}g</div>
                            </div>
                            
                            <div class="mt-5 text-left border-t border-gray-100 pt-3">
                                <label class="text-xs font-black text-slate-700 uppercase">¿Cuántos gramos vas a comer?</label>
                                <input type="number" id="gramos-input" class="w-full mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xl font-black text-center text-slate-800 focus:border-blue-500 outline-none" placeholder="Ej: 30" value="${scanDefaultG}">
                            </div>
                        `,
                        showCancelButton: true,
                        confirmButtonColor: '#1e293b',
                        cancelButtonColor: '#ef4444',
                        confirmButtonText: '<i class="fas fa-check"></i> Añadir a mi dieta',
                        cancelButtonText: 'Cancelar',
                        preConfirm: () => {
                            const gramos = document.getElementById('gramos-input').value;
                            if (!gramos || gramos <= 0) {
                                Swal.showValidationMessage('Introduce una cantidad válida');
                            }
                            return gramos;
                        }
                    }).then((result) => {
                        if (result.isConfirmed) {
                            agregarAlimentoAlMotor(alimento, result.value);
                        }
                    });
                    
                } else {
                    Swal.fire('No encontrado', 'Este producto no está en la base de datos pública.', 'info');
                }
            } catch (error) {
                Swal.fire('Error', 'Fallo al conectar a internet.', 'error');
            }
        }

        // 4. AÑADIR A LA APP Y CREAR TARJETA CON BOTÓN DE BORRAR
        function agregarAlimentoAlMotor(alimento100g, gramos) {
            const factor = gramos / 100;
            
            const kcalFinal = Math.round(alimento100g.cal * factor);
            const protFinal = Math.round(alimento100g.prot * factor);
            const carbsFinal = Math.round(alimento100g.carbs * factor);
            const fatFinal = Math.round(alimento100g.fat * factor);
            const satFinal = Math.round(alimento100g.sat * factor);

            actualizarMacroHTML('val-cals', 'goal-cals', 'bar-cals', kcalFinal);
            actualizarMacroHTML('val-prot', 'goal-prot', 'bar-prot', protFinal);
            actualizarMacroHTML('val-carbs', 'goal-carbs', 'bar-carbs', carbsFinal);
            actualizarMacroHTML('val-fat', 'goal-fat', 'bar-fat', fatFinal);
            actualizarMacroHTML('val-sat', 'goal-sat', 'bar-sat', satFinal);

            const spanTotal = document.getElementById('total-consumed-kcal');
            if (spanTotal) {
                const totalActual = parseInt(spanTotal.innerText) || 0;
                spanTotal.innerText = (totalActual + kcalFinal) + " kcal";
            }

            const lista = document.getElementById('addedFoodsList');
            if (lista) {
                const idUnico = 'food-scan-' + Date.now(); 
                
                const nuevaTarjeta = `
                    <div id="${idUnico}" class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center mb-2 animate-[fadeIn_0.3s_ease-out]">
                        <div>
                            <p class="text-xs font-bold text-slate-700 leading-tight">${alimento100g.name}</p>
                            <p class="text-[10px] text-gray-400 mt-0.5"><i class="fas fa-scale-balanced mr-1"></i>${gramos}g • ${protFinal}g P / ${carbsFinal}g C / ${fatFinal}g G</p>
                        </div>
                        <div class="flex items-center gap-3 text-right">
                            <p class="text-sm font-black text-orange-500">${kcalFinal} kcal</p>
                            <button onclick="eliminarAlimentoEscaneado('${idUnico}', ${kcalFinal}, ${protFinal}, ${carbsFinal}, ${fatFinal}, ${satFinal})" class="w-7 h-7 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                `;
                lista.innerHTML = nuevaTarjeta + lista.innerHTML; 
            }

            Swal.fire({
                title: '¡Añadido!',
                text: `Se han sumado ${kcalFinal} kcal a tu día.`,
                icon: 'success',
                timer: 1800,
                showConfirmButton: false
            });
        }

        // 5. ELIMINAR EL ALIMENTO SI TE EQUIVOCAS
        function eliminarAlimentoEscaneado(idElemento, kcal, prot, carbs, fat, sat) {
            Swal.fire({
                title: '¿Eliminar alimento?',
                text: "Se restarán las calorías y macros de tu progreso de hoy.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#1e293b',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    const tarjeta = document.getElementById(idElemento);
                    if (tarjeta) tarjeta.remove();

                    actualizarMacroHTML('val-cals', 'goal-cals', 'bar-cals', -kcal);
                    actualizarMacroHTML('val-prot', 'goal-prot', 'bar-prot', -prot);
                    actualizarMacroHTML('val-carbs', 'goal-carbs', 'bar-carbs', -carbs);
                    actualizarMacroHTML('val-fat', 'goal-fat', 'bar-fat', -fat);
                    actualizarMacroHTML('val-sat', 'goal-sat', 'bar-sat', -sat);

                    const spanTotal = document.getElementById('total-consumed-kcal');
                    if (spanTotal) {
                        const totalActual = parseInt(spanTotal.innerText) || 0;
                        let nuevoTotal = totalActual - kcal;
                        if (nuevoTotal < 0) nuevoTotal = 0; 
                        spanTotal.innerText = nuevoTotal + " kcal";
                    }
                }
            });
        }

        // 6. ACTUALIZAR LAS BARRAS
        function actualizarMacroHTML(idVal, idGoal, idBar, cantidadSuma) {
            const elVal = document.getElementById(idVal);
            const elGoal = document.getElementById(idGoal);
            const elBar = document.getElementById(idBar);
            
            if (elVal && elGoal && elBar) {
                const actual = parseInt(elVal.innerText) || 0;
                const meta = parseInt(elGoal.innerText) || 1;
                
                let nuevoActual = actual + cantidadSuma;
                if (nuevoActual < 0) nuevoActual = 0; 
                
                elVal.innerText = nuevoActual;
                
                let porcentaje = (nuevoActual / meta) * 100;
                if (porcentaje > 100) porcentaje = 100;
                
                elBar.style.width = porcentaje + '%';
            }
        }
// ==========================================================================================
        // 🚀 BUSCADOR PRO: MODO APISONADORA (REINTENTOS INFINITOS + BOTÓN CANCELAR)
        // ==========================================================================================
        let temporizadorBuscador = null;
        let guardiaDeTrafico = null; 

        function normalizarTexto(texto) {
            return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        }

        // 🛑 NUEVA FUNCIÓN: Para que el usuario pueda parar el ataque infinito
        window.cancelarBusqueda = function() {
            if (guardiaDeTrafico) guardiaDeTrafico.abort();
            const contenedor = document.getElementById('searchResults');
            contenedor.innerHTML = '';
            contenedor.classList.add('hidden');
            document.getElementById('globalSearch').value = '';
        };

        // 🔨 MODO APISONADORA: Bucle infinito hasta que entre o el usuario cancele
        async function fetchConReintentosInfinitos(url, senal) {
            let intento = 1;
            while (true) { // Bucle infinito
                try {
                    const respuesta = await fetch(url, { signal: senal });
                    if (respuesta.ok) {
                        return await respuesta.json(); // ¡Entramos! Devolvemos los datos y rompemos el bucle
                    }
                    throw new Error("Servidor saturado"); 
                } catch (error) {
                    // Si tú cancelas o tecleas otra letra, paramos el bucle al instante
                    if (error.name === 'AbortError') throw error; 
                    
                    // Actualizamos la pantalla para que veas el ataque en directo
                    const spinner = document.getElementById('spinner-global');
                    if (spinner) {
                        spinner.innerHTML = `
                            <div class="flex flex-col items-center justify-center p-4 bg-red-50 border-t border-red-100 rounded-b-xl">
                                <div class="text-red-500 mb-2"><i class="fas fa-hammer fa-bounce text-2xl"></i></div>
                                <div class="font-black text-slate-700 text-sm">Forzando servidor (Intento ${intento})</div>
                                <div class="text-[10px] text-red-400 mt-1 mb-3 text-center leading-tight">La base mundial está colapsada.<br>Golpeando hasta conseguir hueco...</div>
                                <button onclick="cancelarBusqueda()" class="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold shadow-md hover:bg-red-600 active:scale-95 transition-all">
                                    <i class="fas fa-times mr-1"></i> Detener ataque
                                </button>
                            </div>
                        `;
                    }
                    
                    intento++;
                    // Esperamos 800ms antes del siguiente golpe para no banear nuestra propia IP
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }

        async function searchGlobal(query) {
            const contenedorResultados = document.getElementById('searchResults');
            const termino = query.trim();
            const terminoLimpio = normalizarTexto(termino);

            if (terminoLimpio.length === 0) {
                contenedorResultados.innerHTML = '';
                contenedorResultados.classList.add('hidden');
                clearTimeout(temporizadorBuscador);
                if (guardiaDeTrafico) guardiaDeTrafico.abort(); 
                return;
            }

            contenedorResultados.classList.remove('hidden');
            contenedorResultados.style.maxHeight = "450px";
            contenedorResultados.style.overflowY = "auto";

            // ------------------------------------------------------------------
            // FASE 1: BÚSQUEDA LOCAL (INSTANTÁNEA)
            // ------------------------------------------------------------------
            let resultadosLocales = [];
            try {
                for (const categoria in foodDatabase) {
                    if (foodDatabase[categoria]) {
                        foodDatabase[categoria].forEach(alimento => {
                            if (alimento.name) {
                                const nombreLocal = normalizarTexto(alimento.name);
                                if (nombreLocal.includes(terminoLimpio)) {
                                    resultadosLocales.push({
                                        name: alimento.name, cal: alimento.cal, prot: alimento.prot,
                                        carbs: alimento.carb || alimento.carbs || 0,
                                        carb: alimento.carb || alimento.carbs || 0,
                                        fat: alimento.fat,
                                        sat: alimento.sat || 0, azucar: alimento.azucar || 0, img: '',
                                        weight: alimento.weight || 100,
                                        micros: alimento.micros || null,
                                        source: 'local'
                                    });
                                }
                            }
                        });
                    }
                }
            } catch (err) {}

            let htmlLocal = '';
            if (resultadosLocales.length > 0) {
                htmlLocal += '<div class="px-3 py-1.5 bg-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest sticky top-0"><i class="fas fa-database mr-1"></i> Mi Base de Datos</div>';
                resultadosLocales.slice(0, 15).forEach(alimento => {
                    const objCodificado = encodeURIComponent(JSON.stringify(alimento));
                    htmlLocal += `
                        <div class="p-3 border-b border-gray-50 hover:bg-blue-50 active:bg-blue-100 cursor-pointer transition flex justify-between items-center" onclick="seleccionarDesdeBuscador('${objCodificado}')">
                            <span class="text-sm font-bold text-slate-700 truncate mr-2">${alimento.name}</span>
                            <span class="text-xs font-black text-orange-500 shrink-0">${alimento.cal.toFixed(0)} kcal</span>
                        </div>
                    `;
                });
            }

            contenedorResultados.innerHTML = htmlLocal + `
                <div id="spinner-global" class="p-4 text-center text-xs text-gray-500 bg-white border-t border-gray-100">
                    <i class="fas fa-satellite-dish fa-spin mr-2 text-blue-500"></i> Localizando en la red mundial...
                </div>
            `;

            // ------------------------------------------------------------------
            // FASE 2: RED MUNDIAL (CON BUCLE INFINITO IMPARABLE)
            // ------------------------------------------------------------------
            clearTimeout(temporizadorBuscador);
            
            if (terminoLimpio.length < 2) {
                const spinner = document.getElementById('spinner-global');
                if (spinner) spinner.style.display = 'none';
                return;
            }

            temporizadorBuscador = setTimeout(async () => {
                
                if (guardiaDeTrafico) guardiaDeTrafico.abort();
                guardiaDeTrafico = new AbortController(); 
                const senal = guardiaDeTrafico.signal;

                let resultadosMundiales = [];
                try {
                    let terminoAPI = terminoLimpio;
                    if (terminoAPI.length > 4) {
                        if (terminoAPI.endsWith('es')) terminoAPI = terminoAPI.slice(0, -2);
                        else if (terminoAPI.endsWith('s')) terminoAPI = terminoAPI.slice(0, -1);
                    }

                    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(terminoAPI)}&search_simple=1&action=process&json=1&page_size=80`;
                    
                    // ¡EL ATAQUE! Se quedará aquí atascado devolviendo golpes hasta que lo logre.
                    const datos = await fetchConReintentosInfinitos(url, senal);

                    if (datos.products && datos.products.length > 0) {
                        let temp = [];
                        datos.products.forEach(p => {
                            if (p.product_name) {
                                const n = p.nutriments || {};
                                let kcal = parseFloat(n['energy-kcal_100g']);
                                if (isNaN(kcal)) kcal = parseFloat(n['energy_100g']) / 4.184;
                                if (isNaN(kcal) || kcal < 0) kcal = 0; 

                                let score = 0;
                                const nombreP = normalizarTexto(p.product_name);
                                const paises = (p.countries_tags || []).join(' ').toLowerCase();
                                const marcas = normalizarTexto(p.brands || '');

                                if (paises.includes('spain') || paises.includes('españa')) score += 200;
                                if (nombreP.includes(terminoLimpio)) score += 50;
                                if (nombreP.startsWith(terminoLimpio)) score += 30;
                                if (marcas.includes(terminoLimpio)) score += 40;

                                score += parseFloat(p.completeness) * 10 || 0;

                                temp.push({
                                    name: p.product_name + (p.brands ? ` (${p.brands.split(',')[0]})` : ''),
                                    cal: kcal, prot: parseFloat(n.proteins_100g || 0), carbs: parseFloat(n.carbohydrates_100g || 0),
                                    fat: parseFloat(n.fat_100g || 0), sat: parseFloat(n['saturated-fat_100g'] || 0),
                                    azucar: parseFloat(n.sugars_100g || 0), img: p.image_front_small_url || '', score: score,
                                    carb: parseFloat(n.carbohydrates_100g || 0),
                                    weight: 100,
                                    source: 'global',
                                    noMicros: true
                                });
                            }
                        });
                        
                        temp.sort((a, b) => b.score - a.score);
                        resultadosMundiales = temp.slice(0, 40); 
                    }

                    let htmlMundial = '';
                    if (resultadosMundiales.length > 0) {
                        htmlMundial += '<div class="px-3 py-1.5 bg-blue-50 text-[10px] font-black text-blue-600 uppercase tracking-widest border-t border-blue-100 shadow-sm sticky top-0"><i class="fas fa-globe mr-1"></i> Resultados Globales (Desliza)</div>';
                        resultadosMundiales.forEach(alimento => {
                            const objCodificado = encodeURIComponent(JSON.stringify(alimento));
                            const img = alimento.img ? `<img src="${alimento.img}" class="w-10 h-10 rounded-lg object-cover bg-white border border-gray-100">` : `<div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-200"><i class="fas fa-box"></i></div>`;
                            htmlMundial += `
                                <div class="p-3 border-b border-gray-50 hover:bg-blue-50 active:bg-blue-100 cursor-pointer transition flex items-center gap-3" onclick="seleccionarDesdeBuscador('${objCodificado}')">
                                    ${img}
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-bold text-slate-700 truncate">${alimento.name}</p>
                                        <p class="text-[10px] text-gray-400 mt-0.5 truncate">${alimento.prot.toFixed(1)}g P • ${alimento.carbs.toFixed(1)}g C • ${alimento.fat.toFixed(1)}g G</p>
                                    </div>
                                    <span class="text-xs font-black text-orange-500 shrink-0">${alimento.cal.toFixed(0)} kcal</span>
                                </div>
                            `;
                        });
                    } else {
                        htmlMundial = '<div class="p-4 text-center text-xs text-gray-400 bg-gray-50 rounded-b-xl border-t border-gray-100">Búsqueda global finalizada: No hay coincidencias en la red.</div>';
                    }

                    const spinner = document.getElementById('spinner-global');
                    if (spinner) spinner.outerHTML = htmlMundial;

                } catch (e) { 
                    if (e.name === 'AbortError') {
                        // Cancelado a propósito
                    } else {
                        console.error("Error definitivo:", e);
                    }
                }
            }, 500); 
        }

        // ==========================================================================================
        // 🛠️ SELECCIÓN DESDE BUSCADOR (CONECTADO AL MOTOR)
        // ==========================================================================================
        function seleccionarDesdeBuscador(alimentoCodificado) {
            const alimento = JSON.parse(decodeURIComponent(alimentoCodificado));
            const hasMicros = !!(alimento.micros && Object.keys(alimento.micros).length);
            const baseWeight = getSmartDefaultWeightLocal(alimento);
            
            document.getElementById('searchResults').classList.add('hidden');
            document.getElementById('globalSearch').value = '';

            Swal.fire({
                title: alimento.name,
                imageUrl: alimento.img || null,
                imageHeight: alimento.img ? 120 : null,
                html: `
                    <div class="grid grid-cols-2 gap-2 text-[11px] mt-2 text-left">
                        <div class="bg-orange-50 p-2 rounded border border-orange-100 text-orange-700"><b>🔥 Kcal:</b> ${alimento.cal.toFixed(1)}</div>
                        <div class="bg-green-50 p-2 rounded border border-green-100 text-green-700"><b>🥩 Prot:</b> ${alimento.prot.toFixed(1)}g</div>
                        <div class="bg-red-50 p-2 rounded border border-red-100 text-red-700"><b>🍞 Carbs:</b> ${alimento.carbs.toFixed(1)}g</div>
                        <div class="bg-yellow-50 p-2 rounded border border-yellow-100 text-yellow-700"><b>🥑 Grasas:</b> ${alimento.fat.toFixed(1)}g</div>
                        <div class="bg-yellow-100 p-2 rounded border border-yellow-200 text-yellow-800"><b>🧈 G. Sat:</b> ${alimento.sat.toFixed(1)}g</div>
                        <div class="bg-blue-50 p-2 rounded border border-blue-100 text-blue-700"><b>🍬 Azúcar:</b> ${alimento.azucar.toFixed(1)}g</div>
                    </div>
                    
                    <div class="mt-5 text-left border-t border-gray-100 pt-3">
                        <label class="text-xs font-black text-slate-700 uppercase">¿Cuántos gramos has consumido?</label>
                        <input type="number" id="gramos-input-modal" class="w-full mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xl font-black text-center text-slate-800 focus:border-blue-500 outline-none" placeholder="Ej: 100" value="${baseWeight}">
                    </div>
                    ${hasMicros ? `
                    <div class="mt-4 border-t border-gray-100 pt-3">
                        <button type="button" onclick="document.getElementById('search-micro-details').classList.toggle('hidden')" class="text-xs font-bold text-blue-500 hover:underline flex items-center justify-center w-full gap-1">
                            <i class="fas fa-microscope"></i> Ver 18 Vitaminas & Minerales
                        </button>
                        <div id="search-micro-details" class="hidden mt-3 text-left bg-slate-50 p-3 rounded-xl max-h-40 overflow-y-auto text-xs space-y-1 border border-gray-100">
                            ${Object.keys(alimento.micros).map((k) => {
                                if (!MICRO_DEFS[k]) return '';
                                const v = Number(alimento.micros[k]) || 0;
                                if (v <= 0) return '';
                                return `<div class="flex justify-between"><span>${MICRO_DEFS[k].name}</span><span class="font-mono font-bold text-slate-600">${v.toFixed(1)}${MICRO_DEFS[k].unit}</span></div>`;
                            }).join('') || '<p class="text-center text-gray-400">Trazas no significativas</p>'}
                        </div>
                    </div>` : `
                    <div class="mt-4 text-[11px] bg-amber-50 border border-amber-100 text-amber-700 rounded-xl p-3">
                        <i class="fas fa-triangle-exclamation mr-1"></i>
                        Este alimento viene del servidor global. Puede no traer vitaminas/minerales completos y no se contarán en tu panel de micros.
                    </div>`}
                `,
                showCancelButton: true,
                confirmButtonColor: '#1e293b',
                cancelButtonColor: '#ef4444',
                confirmButtonText: 'Añadir a mi dieta',
                cancelButtonText: 'Cancelar',
                preConfirm: () => {
                    const gramos = document.getElementById('gramos-input-modal').value;
                    if (!gramos || gramos <= 0) {
                        Swal.showValidationMessage('Introduce una cantidad válida');
                    }
                    return gramos;
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const gramos = Number(result.value) || 0;
                    if (gramos <= 0) return;
                    const ratio = gramos / baseWeight;
                    const carbsBase = Number(alimento.carb ?? alimento.carbs ?? 0);
                    const foodItem = {
                        name: alimento.name,
                        weight: gramos,
                        cal: (Number(alimento.cal) || 0) * ratio,
                        prot: (Number(alimento.prot) || 0) * ratio,
                        fat: (Number(alimento.fat) || 0) * ratio,
                        carb: carbsBase * ratio,
                        sat: (Number(alimento.sat) || 0) * ratio
                    };
                    if (hasMicros) {
                        foodItem.micros = alimento.micros;
                    } else {
                        // Bandera explícita para no estimar micros ficticios en resultados globales.
                        foodItem.noMicros = true;
                    }
                    todayData.foodLog.push(foodItem);
                    updateDay();
                    Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 })
                        .fire({ icon: 'success', title: 'Añadido a tu dieta' });
                }
            });
        }
        // ==========================================================================================
        // 🧬 SISTEMA DE ONBOARDING (NUEVOS USUARIOS)
        // ==========================================================================================

        async function verificarUsuarioNuevo(user) {
            try {
                // Buscamos si el usuario ya existe en tu base de datos de Firebase
                const docRef = db.collection('usuarios').doc(user.uid);
                const docSnap = await docRef.get();

                if (!docSnap.exists) {
                    // Si no existe, es su primer día. Creamos el documento y abrimos el formulario.
                    await docRef.set({
                        email: user.email,
                        nombre: user.displayName,
                        perfilCompletado: false // Esta es la llave clave
                    });
                    document.getElementById('onboarding-modal').classList.remove('hidden');
                    document.getElementById('onboarding-modal').classList.add('flex');
                    openOnboardingWizard(user);
                } else {
                    const datos = docSnap.data();
                    if (datos.perfilCompletado === false) {
                        // Existe pero la última vez cerró la app sin acabar el formulario
                        document.getElementById('onboarding-modal').classList.remove('hidden');
                        document.getElementById('onboarding-modal').classList.add('flex');
                        openOnboardingWizard(user);
                    } else {
                        // ¡ES JORGE O PEPE! Tienen su perfil completado, entran directos a la app
                        await completarSesionConUsuario(user); // Llama a tu función normal que carga la app
                    }
                }
            } catch (error) {
                console.error("Error al verificar usuario:", error);
            }
        }

        function omitirOnboarding() {
            Swal.fire({
                title: '¿Omitir configuración?',
                text: "Si omites este paso, los cálculos de calorías y macros no serán exactos y la aplicación usará datos genéricos. Siempre podrás modificar esto más adelante en 'Editar Perfil Biológico'.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#1e293b',
                confirmButtonText: 'Sí, omitir',
                cancelButtonText: 'Volver al formulario'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const user = firebase.auth().currentUser;
                    if (user) {
                        // Guardamos datos básicos por defecto para que la app no explote con "NaN"
                        await db.collection('usuarios').doc(user.uid).update({
                            perfilCompletado: true,
                            genero: 'Hombre', edad: 25, peso: 70, altura: 170,
                            grasa: 15, musculo: 30, maxRun: 0, maxBike: 0,
                            goal: 'maintenance', goalSpeed: 'moderate', activityLevel: 'moderate'
                        });
                        
                        document.getElementById('onboarding-modal').classList.add('hidden');
                        document.getElementById('onboarding-modal').classList.remove('flex');
                        Swal.fire('Perfil genérico creado', 'Recuerda actualizar tus datos más adelante.', 'info');
                        await completarSesionConUsuario(user); // Arrancamos la app
                    }
                }
            });
        }

       // Función para calcular la edad exacta a partir de la fecha
        function calcularEdad(fechaNacimiento) {
            const hoy = new Date();
            const cumple = new Date(fechaNacimiento);
            let edad = hoy.getFullYear() - cumple.getFullYear();
            const m = hoy.getMonth() - cumple.getMonth();
            if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
                edad--;
            }
            return edad;
        }

        // ==========================================================================================
        // 🧭 ONBOARDING WIZARD (5 pasos + animaciones)
        // ==========================================================================================
        let onbWizardState = { step: 0, total: 5 };

        function openOnboardingWizard(user) {
            try {
                onbWizardState = { step: 0, total: 5 };
                const nameEl = document.getElementById('onb-nombre');
                if (nameEl && !nameEl.value) nameEl.value = (user && user.displayName) ? user.displayName : '';

                // Defaults
                const activityEl = document.getElementById('onb-activity-level');
                if (activityEl && !activityEl.value) activityEl.value = 'moderate';

                onbWizardShowStep(0);
                syncOnboardingGoalPreview();
                renderOnbClinicalAlert();
            } catch (e) {
                console.error('No se pudo abrir el wizard:', e);
            }
        }

        function onbWizardShowStep(nextStep) {
            const steps = Array.from(document.querySelectorAll('#onboarding-modal .onb-step'));
            const total = onbWizardState.total;
            const step = Math.max(0, Math.min(Number(nextStep) || 0, total - 1));
            onbWizardState.step = step;

            steps.forEach(sec => {
                const s = Number(sec.dataset.step);
                sec.classList.toggle('hidden', s !== step);
            });

            const subtitle = document.getElementById('onb-step-subtitle');
            const progress = document.getElementById('onb-step-progress');
            const backBtn = document.getElementById('onb-back-btn');
            const nextBtn = document.getElementById('onb-next-btn');
            const finishBtn = document.getElementById('onb-finish-btn');

            const subtitleText = [
                'Paso 1/5 · Básicos',
                'Paso 2/5 · Composición',
                'Paso 3/5 · Ubicación & clima',
                'Paso 4/5 · Actividad (auto)',
                'Paso 5/5 · Objetivo & seguridad'
            ][step] || `Paso ${step + 1}/${total}`;

            if (subtitle) subtitle.textContent = subtitleText;
            if (progress) progress.style.width = `${Math.round(((step + 1) / total) * 100)}%`;

            const isFirst = step === 0;
            const isLast = step === total - 1;
            if (backBtn) backBtn.classList.toggle('hidden', isFirst);
            if (nextBtn) nextBtn.classList.toggle('hidden', isLast);
            if (finishBtn) finishBtn.classList.toggle('hidden', !isLast);

            // Refresh dynamic previews on relevant steps
            if (step === 3) syncOnboardingGoalPreview();
            if (step === 4) {
                syncOnboardingGoalPreview();
                renderOnbClinicalAlert();
            }
        }

        function onbWizardNext() {
            if (!onbWizardValidateStep(onbWizardState.step)) return;
            onbWizardShowStep(onbWizardState.step + 1);
        }

        function onbWizardPrev() {
            onbWizardShowStep(onbWizardState.step - 1);
        }

        function onbWizardValidateStep(step) {
            const birth = document.getElementById('onb-birthdate')?.value;
            const weight = Number(document.getElementById('onb-peso')?.value) || 0;
            const height = Number(document.getElementById('onb-altura')?.value) || 0;

            if (step === 0) {
                if (!birth) {
                    Swal.fire('Falta un dato', 'Introduce tu fecha de nacimiento para calcular la edad.', 'warning');
                    return false;
                }
                return true;
            }
            if (step === 1) {
                if (weight <= 0 || height <= 0) {
                    Swal.fire('Falta un dato', 'Revisa tu peso y altura (son necesarios).', 'warning');
                    return false;
                }
                return true;
            }
            if (step === 3) {
                const activityVal = document.getElementById('onb-activity-level')?.value;
                if (!activityVal) {
                    Swal.fire('Actividad pendiente', 'Haz el cuestionario rápido para estimar tu actividad diaria.', 'warning');
                    return false;
                }
                return true;
            }
            return true;
        }

        function clampNumber(n, min, max) {
            const x = Number(n);
            if (!Number.isFinite(x)) return min;
            return Math.min(max, Math.max(min, x));
        }

        function getClinicalAlert({ gender, age, weight, height, goal, bodyFat = null, muscleKg = null }) {
            const hM = (Number(height) || 0) / 100;
            const bmi = (hM > 0) ? (Number(weight) / (hM * hM)) : NaN;
            const normalizedGoal = normalizeGoalKey(goal);
            const isMale = String(gender || '').toLowerCase() === 'hombre';
            const safeBmiLow = (age && age < 18) ? 18.0 : 18.5;
            const dangerBmiLow = 17.0;
            const warnBmiLow = safeBmiLow;

            const idealBmi = 22.0;
            const idealWeight = (hM > 0) ? (idealBmi * hM * hM) : null;
            const idealRange = (hM > 0)
                ? { min: (20.0 * hM * hM), max: (24.0 * hM * hM) }
                : null;

            const sex = isMale ? 'hombre' : 'mujer';
            const bf = bodyFat != null ? Number(bodyFat) : NaN;
            const mk = muscleKg != null ? Number(muscleKg) : NaN;
            const w = Number(weight) || 0;
            const muscleRatio = (w > 0 && Number.isFinite(mk)) ? (mk / w) : NaN;
            const healthyFatLow = sex === 'hombre' ? 10 : 18;
            const healthyFatHigh = sex === 'hombre' ? 20 : 28;

            const bmiCategory = (() => {
                if (!Number.isFinite(bmi)) return 'SIN DATOS';
                if (bmi < 18.5) return 'BAJO PESO';
                if (bmi < 25) return 'NORMOPESO';
                if (bmi < 30) return 'SOBREPESO';
                if (bmi < 35) return 'OBESIDAD I';
                if (bmi < 40) return 'OBESIDAD II';
                return 'OBESIDAD III';
            })();

            const fatHealthy = Number.isFinite(bf) ? (bf >= healthyFatLow && bf <= healthyFatHigh) : null;

            // Excepción muscular (no ocultar riesgo salvo perfil muy claro)
            const muscularException = Number.isFinite(bmi)
                && bmi >= 25
                && fatHealthy === true
                && Number.isFinite(muscleRatio)
                && muscleRatio >= 0.45;

            // Severity by BMI + body fat + goal interaction
            let level = 'ok';
            let title = 'En rango';
            let message = 'Tu perfil parece consistente para el objetivo elegido.';
            let recommendationGoal = null;

            if (Number.isFinite(bmi)) {
                // Bajo peso
                if (bmi < dangerBmiLow) {
                    level = 'danger';
                    title = 'Peligro';
                    message = 'Tu IMC es críticamente bajo. Un objetivo de pérdida de grasa puede ser peligroso.';
                } else if (bmi < warnBmiLow) {
                    level = 'warn';
                    title = 'Advertencia';
                    message = 'Tu IMC está por debajo del rango saludable. Ajusta el objetivo con cuidado.';
                }
                // Sobrepeso / obesidad
                if (!muscularException && bmi >= 30) {
                    level = 'danger';
                    title = 'Alerta de Salud';
                    message = 'Tu IMC está en rango de obesidad. Esto aumenta el riesgo cardiometabólico; tu objetivo debería priorizar pérdida de grasa y actividad diaria.';
                    if (normalizedGoal !== 'fat_loss') recommendationGoal = 'fat_loss';
                } else if (!muscularException && bmi >= 25) {
                    level = (level === 'danger') ? level : 'warn';
                    title = 'Advertencia';
                    message = 'Tu IMC está por encima del rango saludable. Recomendación: prioriza pérdida de grasa con déficit leve y pasos diarios.';
                    if (normalizedGoal !== 'fat_loss') recommendationGoal = 'fat_loss';
                }
            }

            // Cross-check: low BMI + fat loss => danger
            if (normalizedGoal === 'fat_loss' && Number.isFinite(bmi) && bmi < warnBmiLow) {
                level = (bmi < dangerBmiLow) ? 'danger' : 'warn';
                title = (level === 'danger') ? 'Peligro' : 'Advertencia';
                message = (level === 'danger')
                    ? 'Perder grasa con un IMC tan bajo es un riesgo clínico. Recomendación: cambiar a Ganar Masa.'
                    : 'Perder grasa con un IMC bajo puede afectar energía, hormonas y recuperación. Considera Mantenimiento o Ganar Masa.';
            }

            // Additional heuristic: very low absolute weight
            if (normalizedGoal === 'fat_loss' && Number.isFinite(bmi) && bmi < 18.0) {
                level = 'danger';
                title = 'Peligro';
                message = 'Tus datos indican bajo peso. No es recomendable un déficit calórico. Prioriza subir peso de forma saludable.';
            }

            // % grasa: si está por encima de rango saludable, subir severidad (sin contradecir excepción muscular)
            if (!muscularException && Number.isFinite(bf)) {
                if (bf > healthyFatHigh && level === 'ok') {
                    level = 'warn';
                    title = 'Advertencia';
                    message = `Tu % de grasa (${bf.toFixed(0)}%) está por encima del rango saludable para ${sex}. Recomendación: prioriza fuerza + déficit leve.`;
                    if (normalizedGoal !== 'fat_loss') recommendationGoal = 'fat_loss';
                }
                if (bf > (sex === 'hombre' ? 25 : 32)) {
                    level = 'danger';
                    title = 'Alerta de Salud';
                    message = `Tu % de grasa (${bf.toFixed(0)}%) es alto y sugiere riesgo cardiometabólico. Prioriza pérdida de grasa y actividad diaria.`;
                    if (normalizedGoal !== 'fat_loss') recommendationGoal = 'fat_loss';
                }
            }

            // Si está realmente en rango saludable (IMC + % grasa), entonces sí permitimos “óptimo”
            const bmiHealthy = Number.isFinite(bmi) && bmi >= 18.5 && bmi <= 24.9;
            const bfHealthy = Number.isFinite(bf) ? (bf >= healthyFatLow && bf <= healthyFatHigh) : false;
            if (level === 'ok' && (bmiHealthy || bfHealthy || muscularException)) {
                title = muscularException ? 'Perfil atlético (excepción muscular)' : 'Óptimo';
                message = muscularException
                    ? 'IMC alto compatible con masa muscular y % grasa saludable. Mantén fuerza y controla tendencia.'
                    : 'IMC y/o % de grasa están en rangos saludables para tu perfil.';
            }

            const color = level === 'danger'
                ? { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-600' }
                : level === 'warn'
                    ? { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-500' }
                    : { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-600' };

            const idealText = idealWeight
                ? `Peso ideal estimado: ~${idealWeight.toFixed(1)} kg (rango saludable aprox. ${idealRange.min.toFixed(1)}–${idealRange.max.toFixed(1)} kg).`
                : '';

            const bmiText = Number.isFinite(bmi) ? `IMC: ${bmi.toFixed(1)} (${bmiCategory}).` : '';

            return {
                level,
                title,
                message,
                bmi,
                idealWeight,
                idealRange,
                bmiText,
                idealText,
                color,
                recommendationGoal: (level === 'danger' && normalizedGoal === 'fat_loss')
                    ? 'muscle_gain'
                    : recommendationGoal,
                meta: { isMale }
            };
        }

        // Requerida por el prompt (API simple) - usa la lógica clínica unificada
        function validateHealthStatus(peso, altura, objetivo, genero = 'hombre', edad = 25) {
            const alert = getClinicalAlert({
                gender: genero,
                age: Number(edad) || 25,
                weight: Number(peso) || 0,
                height: Number(altura) || 0,
                goal: objetivo || 'maintenance'
            });
            const color = alert.level === 'danger' ? 'red' : alert.level === 'warn' ? 'orange' : 'green';
            return {
                color,
                level: alert.level,
                message: `${alert.message} ${alert.idealText || ''}`.trim(),
                bmi: alert.bmi,
                idealWeight: alert.idealWeight,
                recommendationGoal: alert.recommendationGoal
            };
        }

        function renderOnbClinicalAlert() {
            const box = document.getElementById('onb-clinical-alert');
            if (!box) return;
            const gender = document.getElementById('onb-genero')?.value || 'hombre';
            const birth = document.getElementById('onb-birthdate')?.value;
            const age = birth ? calcularEdad(birth) : null;
            const weight = Number(document.getElementById('onb-peso')?.value) || 0;
            const height = Number(document.getElementById('onb-altura')?.value) || 0;
            const bodyFat = Number(document.getElementById('onb-grasa')?.value);
            const muscleKg = Number(document.getElementById('onb-musculo')?.value);
            const goal = document.getElementById('onb-objetivo')?.value || 'maintenance';

            if (!birth || !weight || !height) {
                box.classList.add('hidden');
                return;
            }

            const alert = getClinicalAlert({ gender, age, weight, height, goal, bodyFat, muscleKg });
            box.className = `rounded-2xl border p-4 ${alert.color.border} ${alert.color.bg} ${alert.color.text}`;
            box.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="w-9 h-9 rounded-xl ${alert.color.badge} text-white flex items-center justify-center font-black">
                        ${alert.level === 'danger' ? '<i class="fas fa-triangle-exclamation"></i>' : alert.level === 'warn' ? '<i class="fas fa-circle-exclamation"></i>' : '<i class="fas fa-shield-heart"></i>'}
                    </div>
                    <div class="flex-1">
                        <div class="text-sm font-black">${alert.title}</div>
                        <div class="text-[13px] leading-5 mt-1">
                            ${alert.message}
                            <div class="mt-2 font-semibold">${alert.bmiText}</div>
                            ${alert.idealText ? `<div class="mt-1 text-[12px] opacity-90">${alert.idealText}</div>` : ''}
                        </div>
                        ${alert.recommendationGoal
                            ? `<button type="button" onclick="onbApplyRecommendedGoal('${alert.recommendationGoal}')" class="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 border border-white/60 font-black text-[12px] hover:bg-white transition">
                                   <i class="fas fa-wand-magic-sparkles"></i> ${alert.recommendationGoal === 'fat_loss' ? 'Cambiar a Perder Grasa' : alert.recommendationGoal === 'muscle_gain' ? 'Cambiar a Ganar Masa' : 'Aplicar objetivo recomendado'}
                               </button>`
                            : ''}
                    </div>
                </div>
            `;
            box.classList.remove('hidden');
        }

        function onbApplyRecommendedGoal(goal) {
            const el = document.getElementById('onb-objetivo');
            if (!el) return;
            el.value = goal;
            el.dispatchEvent(new Event('change'));
            renderOnbClinicalAlert();
        }

        function verificarCumpleanos() {
            if (!USER_BIO || !USER_BIO.fechaNacimiento) return;
            const hoy = new Date();
            const cumple = new Date(USER_BIO.fechaNacimiento);
            if (Number.isNaN(cumple.getTime())) return;
            if (hoy.getDate() !== cumple.getDate() || hoy.getMonth() !== cumple.getMonth()) return;
            const cacheKey = `fittracker_bday_${hoy.toISOString().slice(0, 10)}`;
            if (localStorage.getItem(cacheKey)) return;
            localStorage.setItem(cacheKey, '1');
            const nuevaEdad = calcularEdad(USER_BIO.fechaNacimiento);
            Swal.fire({
                title: 'Feliz cumpleaños',
                text: `${USER_BIO.nombre || 'Campeón'} hoy cumples ${nuevaEdad} años. Que tengas un día brutal.`,
                icon: 'success',
                confirmButtonText: 'Gracias'
            });
        }

        function getGoalSpeedAdvice(speed) {
            if (speed === 'fast') return 'Modo rápido: útil a corto plazo, pero vigila energía, hambre, sueño y recuperación.';
            if (speed === 'slow') return 'Modo lento: más sostenible y con menor riesgo de rebote.';
            return 'Modo intermedio: equilibrio entre progreso y adherencia.';
        }

        function normalizeGoalKey(goal) {
            if (!goal) return 'maintenance';
            const lower = String(goal).toLowerCase();
            if (lower.includes('grasa') || lower.includes('fat_loss') || lower.includes('definici')) return 'fat_loss';
            if (lower.includes('muscul') || lower.includes('muscle_gain') || lower.includes('volumen')) return 'muscle_gain';
            return 'maintenance';
        }

        function getHealthWarning(goal, speed, gender, age, weight, height, bodyFat) {
            const bmi = height > 0 ? weight / ((height / 100) ** 2) : 22;
            const isMale = String(gender).toLowerCase() === 'hombre';
            const fatLowerWarning = isMale ? 12 : 18;
            let warning = '';

            if (goal === 'fat_loss') {
                if (bmi < 18.5) {
                    warning = '⚠️ Tu IMC es muy bajo. Perder grasa rápido en tu situación es peligroso para tu salud. Consulta a un médico.';
                } else if (bodyFat < fatLowerWarning) {
                    warning = '⚠️ Tu porcentaje de grasa corporal ya es bajo. Perder grasa rápido puede afectar tu energía y salud.';
                }
            } else if (goal === 'muscle_gain') {
                if (bmi < 18.5) {
                    warning = '⚠️ Tu IMC es muy bajo. Necesitas ganar peso primero (preferiblemente con comida nutritiva) antes de buscar músculo.';
                } else if (age >= 50 && speed === 'fast') {
                    warning = '⚠️ A partir de 50 años, es mejor subir masa de forma moderada para evitar fatiga y mala recuperación.';
                } else if (bodyFat < (isMale ? 8 : 14)) {
                    warning = '⚠️ Estás bastante magro. Un ritmo intermedio o lento es más seguro para ganar músculo sano.';
                }
            }
            if (goal === 'maintenance' && speed === 'fast') {
                warning = '⚠️ Mantenimiento no necesita ritmo rápido. Elige intermedio o lento para estabilizar tu peso con menos estrés.';
            }
            return warning;
        }

        let swalQuizState = { step: 0, score: 0, answers: [] };
        let swalActivityLevelResult = null;
        function toggleGoalSpeedField(prefix) { 
            const goalEl = document.getElementById(`${prefix}-objetivo`);
            const speedGroup = document.getElementById(`${prefix}-goal-speed-group`);
            if (!goalEl || !speedGroup) return; 
            const goal = normalizeGoalKey(goalEl.value);
            speedGroup.style.display = goal === 'maintenance' ? 'none' : '';
        }

        const ONB_QUIZ_QUESTIONS = [
            {
                question: '¿Cómo empiezas tu mañana?',
                options: [
                    { text: 'Despierto y estoy sentado la mayor parte del tiempo', score: 1 },
                    { text: 'Paseo ligero o desplazamientos cortos', score: 2 },
                    { text: 'Trabajo con movimiento ligero todo el rato', score: 3 },
                    { text: 'Empiezo activo: gimnasio, trabajo físico o entreno', score: 4 }
                ]
            },
            {
                question: '¿Cómo es tu tarde?',
                options: [
                    { text: 'Sentado en estudio, oficina o sofá', score: 1 },
                    { text: 'Me muevo un poco entre tareas', score: 2 },
                    { text: 'Estoy de pie o hago tareas domésticas', score: 3 },
                    { text: 'Entreno fuerte o realizo trabajo intenso', score: 4 }
                ]
            },
            {
                question: '¿Y los fines de semana?',
                options: [
                    { text: 'Casi no salgo de casa', score: 1 },
                    { text: 'Paseos ligeros y actividad suave', score: 2 },
                    { text: 'Actividad deportiva 1-2 días', score: 3 },
                    { text: 'Salgo mucho, entreno o camino largas distancias', score: 4 }
                ]
            },
            {
                question: '¿Tu trabajo exige movimiento físico?',
                options: [
                    { text: 'No, es sedentario', score: 1 },
                    { text: 'Algo de desplazamiento y movimiento ligero', score: 2 },
                    { text: 'Sí, estoy de pie y hago tareas activas', score: 3 },
                    { text: 'Sí, es muy exigente físicamente', score: 4 }
                ]
            }
        ];

        let onboardingQuizState = { step: 0, score: 0, answers: [] };

        function startOnboardingQuiz() {
            onboardingQuizState = { step: 0, score: 0, answers: [] };
            document.getElementById('onb-activity-quiz').classList.remove('hidden');
            document.getElementById('onb-activity-summary').classList.add('hidden');
            renderOnboardingQuiz();
        }

        function skipOnboardingQuiz() {
            document.getElementById('onb-activity-quiz').classList.add('hidden');
            const summary = document.getElementById('onb-activity-summary');
            const hidden = document.getElementById('onb-activity-level');
            if (hidden && !hidden.value) hidden.value = 'moderate';
            if (hidden) hidden.dispatchEvent(new Event('change'));
            if (summary) {
                const meta = getActivityLevelMeta(hidden ? hidden.value : 'moderate');
                summary.innerHTML = `
                    <div class="font-bold text-slate-800 mb-3">Actividad diaria (estimada)</div>
                    <p class="text-sm text-slate-600 mb-2">Se aplicará por defecto <strong>${meta.label}</strong>.</p>
                    <div class="text-[13px] text-slate-600 space-y-2">
                        <div>Siempre podrás recalibrarlo después en “Editar Perfil Biológico”.</div>
                    </div>
                `;
                summary.classList.remove('hidden');
            }
        }

        function renderOnboardingQuiz() {
            const stage = document.getElementById('onb-quiz-stage');
            const progress = document.getElementById('onb-quiz-progress');
            if (!stage || !progress) return;
            const current = ONB_QUIZ_QUESTIONS[onboardingQuizState.step];
            if (!current) return finishOnboardingQuiz();
            progress.style.width = `${Math.round((onboardingQuizState.step / ONB_QUIZ_QUESTIONS.length) * 100)}%`;
            stage.innerHTML = `
                <div class="quiz-step active">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-xs uppercase text-slate-500 font-bold">Pregunta ${onboardingQuizState.step + 1}/${ONB_QUIZ_QUESTIONS.length}</p>
                            <h4 class="text-sm font-bold text-slate-800">${current.question}</h4>
                        </div>
                        <span class="text-xs text-slate-400">elige una opción</span>
                    </div>
                    <div class="grid gap-3">
                        ${current.options.map((opt, idx) => `
                            <button type="button" onclick="selectOnboardingQuizAnswer(${idx})" class="quiz-option w-full text-left bg-white border border-slate-200 rounded-2xl p-3 text-sm text-slate-700 hover:border-blue-300">
                                ${opt.text}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function selectOnboardingQuizAnswer(optionIndex) {
            const current = ONB_QUIZ_QUESTIONS[onboardingQuizState.step];
            if (!current || !current.options[optionIndex]) return;
            onboardingQuizState.score += current.options[optionIndex].score;
            onboardingQuizState.answers.push(current.options[optionIndex].text);
            onboardingQuizState.step += 1;
            if (onboardingQuizState.step >= ONB_QUIZ_QUESTIONS.length) {
                finishOnboardingQuiz();
            } else {
                renderOnboardingQuiz();
            }
        }

        function computeOnboardingActivityLevel(score) {
            if (score <= 7) return 'very_low';
            if (score <= 9) return 'low';
            if (score <= 11) return 'moderate';
            if (score <= 13) return 'high';
            return 'very_high';
        }

        function finishOnboardingQuiz() {
            const activityValue = computeOnboardingActivityLevel(onboardingQuizState.score);
            const activityMeta = getActivityLevelMeta(activityValue);
            const summary = document.getElementById('onb-activity-summary');
            const quiz = document.getElementById('onb-activity-quiz');
            const hidden = document.getElementById('onb-activity-level');
            if (hidden) {
                hidden.value = activityValue;
                hidden.dispatchEvent(new Event('change'));
            }
            if (summary) {
                summary.innerHTML = `
                    <div class="font-bold text-slate-800 mb-3">Actividad diaria calculada</div>
                    <p class="text-sm text-slate-600 mb-2">Según tus respuestas, tu nivel de actividad es <strong>${activityMeta.label}</strong>.</p>
                    <div class="text-[13px] text-slate-600 space-y-2">
                        <div>Este nivel usa la forma en que te mueves por la mañana, tarde, fin de semana y tu trabajo.</div>
                        <div>${activityMeta.text}</div>
                        <div class="text-slate-500">Se aplicará esta valoración para ajustar tus calorías base.</div>
                    </div>
                `;
                summary.classList.remove('hidden');
            }
            if (quiz) quiz.classList.add('hidden');
            syncOnboardingGoalPreview();
        }

        function startSwalActivityQuiz() {
            swalQuizState = { step: 0, score: 0, answers: [] };
            document.getElementById('swal-activity-quiz-container').classList.remove('hidden');
            document.getElementById('swal-activity-summary').classList.add('hidden');
            document.getElementById('swal-start-activity-quiz-btn').classList.add('hidden');
            renderSwalActivityQuiz();
        }

        function skipSwalActivityQuiz() {
            document.getElementById('swal-activity-quiz-container').classList.add('hidden');
            document.getElementById('swal-activity-summary').classList.remove('hidden');
            document.getElementById('swal-start-activity-quiz-btn').classList.remove('hidden');
            // Optionally reset to current USER_BIO activity level if skipped
            swalActivityLevelResult = USER_BIO.activityLevel || 'moderate';
            renderSwalActivitySummary(swalActivityLevelResult);
            syncProfileGoalPreview();
        }

        function renderSwalActivityQuiz() {
            const stage = document.getElementById('swal-quiz-stage');
            const progress = document.getElementById('swal-quiz-progress');
            if (!stage || !progress) return;
            const current = ONB_QUIZ_QUESTIONS[swalQuizState.step];
            if (!current) return finishSwalActivityQuiz();
            progress.style.width = `${Math.round((swalQuizState.step / ONB_QUIZ_QUESTIONS.length) * 100)}%`;
            stage.innerHTML = `
                <div class="quiz-step active">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-xs uppercase text-slate-500 font-bold">Pregunta ${swalQuizState.step + 1}/${ONB_QUIZ_QUESTIONS.length}</p>
                            <h4 class="text-sm font-bold text-slate-800">${current.question}</h4>
                        </div>
                        <span class="text-xs text-slate-400">elige una opción</span>
                    </div>
                    <div class="grid gap-3">
                        ${current.options.map((opt, idx) => `
                            <button type="button" onclick="selectSwalActivityQuizAnswer(${idx})" class="quiz-option w-full text-left bg-white border border-slate-200 rounded-2xl p-3 text-sm text-slate-700 hover:border-blue-300">
                                ${opt.text}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function selectSwalActivityQuizAnswer(optionIndex) {
            const current = ONB_QUIZ_QUESTIONS[swalQuizState.step];
            if (!current || !current.options[optionIndex]) return;
            swalQuizState.score += current.options[optionIndex].score;
            swalQuizState.answers.push(current.options[optionIndex].text);
            swalQuizState.step += 1;
            if (swalQuizState.step >= ONB_QUIZ_QUESTIONS.length) {
                finishSwalActivityQuiz();
            } else {
                renderSwalActivityQuiz();
            }
        }

        function finishSwalActivityQuiz() {
            swalActivityLevelResult = computeOnboardingActivityLevel(swalQuizState.score);
            renderSwalActivitySummary(swalActivityLevelResult);
            document.getElementById('swal-activity-quiz-container').classList.add('hidden');
            document.getElementById('swal-activity-summary').classList.remove('hidden');
            document.getElementById('swal-start-activity-quiz-btn').classList.remove('hidden');
            document.getElementById('swal-user-activity-level').value = swalActivityLevelResult; // Update hidden input
            syncProfileGoalPreview();
            try {
                if (USER_BIO) USER_BIO.activityLevel = swalActivityLevelResult;
                if (ENGINE && typeof ENGINE.recalculateEverything === 'function') ENGINE.recalculateEverything({ shouldSaveDay: false });
            } catch (_) {}
        }

        function renderSwalActivitySummary(activityValue) {
            const activityMeta = getActivityLevelMeta(activityValue);
            const summary = document.getElementById('swal-activity-summary');
            const currentActivityLabel = document.getElementById('swal-current-activity-label');
            if (summary) {
                summary.innerHTML = `
                    <div class="font-bold text-slate-800 mb-3">Actividad diaria calculada</div>
                    <p class="text-sm text-slate-600 mb-2">Según tus respuestas, tu nivel de actividad es <strong>${activityMeta.label}</strong>.</p>
                    <div class="text-[13px] text-slate-600 space-y-2">
                        <div>Este nivel usa la forma en que te mueves por la mañana, tarde, fin de semana y tu trabajo.</div>
                        <div>${activityMeta.text}</div>
                        <div class="text-slate-500">Se aplicará esta valoración para ajustar tus calorías base.</div>
                    </div>
                `;
                summary.classList.remove('hidden');
            }
            if (currentActivityLabel) {
                currentActivityLabel.textContent = activityMeta.label;
            }
        }

        function getActivityLevelMeta(level) {
            const map = {
                very_low: { label: 'Muy baja', tdeeFactor: 1.2, factor: -0.05, text: 'Rutina sedentaria, muy poco movimiento en el día.' },
                low: { label: 'Baja', tdeeFactor: 1.375, factor: 0, text: 'Actividad ligera, desplazamientos cortos y pocas horas en movimiento.' },
                moderate: { label: 'Media', tdeeFactor: 1.55, factor: 0.08, text: 'Jornada normal con algo de ejercicio o trabajo moderado.' },
                high: { label: 'Alta', tdeeFactor: 1.725, factor: 0.16, text: 'Trabajo activo o entrenamientos frecuentes durante la semana.' },
                very_high: { label: 'Muy alta', tdeeFactor: 1.9, factor: 0.26, text: 'Trabajo físico intenso y entrenamiento diario.' }
            };
            return map[level] || map.moderate;
        }

        function renderGoalStrategySummary(prefix, summaryId) {
            const goalEl = document.getElementById(`${prefix}-objetivo`);
            const speedEl = document.getElementById(`${prefix}-goal-speed`);
            const activityEl = document.getElementById(`${prefix}-activity-level`);
            const summary = document.getElementById(summaryId);
            if (!goalEl || !summary) return;

            const goal = normalizeGoalKey(goalEl.value);
            const speed = speedEl ? speedEl.value : 'moderate';
            const activityLevel = activityEl ? activityEl.value : 'moderate';
            const gender = document.getElementById(`${prefix}-genero`)?.value || 'hombre';
            const weight = Number(document.getElementById(`${prefix}-peso`)?.value) || 70;
            const height = Number(document.getElementById(`${prefix}-altura`)?.value) || 170;
            const birthdate = document.getElementById(`${prefix}-birthdate`)?.value;
            const age = birthdate ? calcularEdad(birthdate) : 25;
            const bodyFat = Number(document.getElementById(`${prefix}-grasa`)?.value) || 20;
            const mifflin = (10 * weight) + (6.25 * height) - (5 * age) + (gender === 'mujer' ? -161 : 5);
            const leanMass = bodyFat > 0 ? (weight * (1 - (bodyFat / 100))) : (weight * 0.8);
            const katch = 370 + (21.6 * leanMass);
            const bmr = bodyFat > 0 ? ((mifflin * 0.35) + (katch * 0.65)) : mifflin;
            const activityMeta = getActivityLevelMeta(activityLevel);
            const baseTdee = Math.round(bmr * activityMeta.tdeeFactor);
            const goalDeltaPct = {
                fat_loss: { slow: -0.10, moderate: -0.18, fast: -0.25 },
                maintenance: { slow: 0, moderate: 0, fast: 0 },
                muscle_gain: { slow: 0.05, moderate: 0.10, fast: 0.15 }
            };
            const deltaPct = ((goalDeltaPct[goal] || goalDeltaPct.maintenance)[speed]) || 0;
            const adjusted = Math.round(baseTdee * (1 + deltaPct));
            const warning = getHealthWarning(goal, speed, gender, age, weight, height, bodyFat);

            const speedLabel = speed === 'slow' ? 'Lento' : speed === 'fast' ? 'Rápido' : 'Intermedio';
            const goalLabel = goal === 'fat_loss' ? 'Perder Grasa' : goal === 'muscle_gain' ? 'Ganar Masa Muscular' : 'Mantenimiento';
            const speedMessage = goal === 'maintenance'
                ? 'Mantenimiento no aplica ritmo: tu gasto estimado se ajusta para estabilizar tu peso.'
                : `Ritmo ${speedLabel}: ${Math.round(deltaPct * 100)}% ${deltaPct > 0 ? 'más' : 'menos'} calorías según ${goalLabel.toLowerCase()}.`;
            
            const warningMessages = warning ? [warning] : [];

            summary.innerHTML = `
                <div class="font-bold text-slate-700 mb-3">Resumen de cálculo</div>
                <div class="space-y-2 text-[13px] leading-5">
                    <div><strong>Metabolismo Basal (BMR):</strong> ${Math.round(bmr)} kcal · Tu gasto en reposo total.</div>
                    <div><strong>Actividad Diaria (TDEE):</strong> ${activityMeta.label} · Multiplicador x${activityMeta.tdeeFactor.toFixed(2)} · ${activityMeta.text}</div>
                    <div><strong>Base TDEE:</strong> ${baseTdee} kcal.</div>
                    <div><strong>Objetivo:</strong> ${goalLabel} · ${speedMessage}</div>
                    <div class="text-slate-700 font-bold text-lg"><strong>Meta resultante:</strong> ${adjusted} kcal.</div>
                    ${warningMessages.length > 0 
                        ? `<div class="mt-2 p-3 bg-orange-100 border border-orange-200 rounded-lg text-orange-700 font-semibold"><ul>${warningMessages.map(w => `<li>${w}</li>`).join('')}</ul></div>` 
                        : ''}
                    <div class="text-slate-500">Estos cálculos se apoyan en tus kilos, tu % de grasa, tu masa muscular y tu nivel real de actividad.</div>
                </div>
            `;
            summary.classList.remove('hidden');
        }

        function toggleActivityQuestionnaire() {
            const panel = document.getElementById('activity-questionnaire');
            const icon = panel.previousElementSibling.querySelector('.fa-chevron-down');
            if (!panel) return;
            panel.classList.toggle('open');
            if (icon) icon.classList.toggle('rotate-180');
        }

        function updateDailyActivityLevel(force = false) {
            const select = document.getElementById('daily-activity-level'); 
            if (!select) return; 
            const value = select.value || 'moderate'; 
            todayData.activityLevel = value; 
            if (USER_BIO) USER_BIO.activityLevel = value; 
            updateDay(); 
        }

        function syncOnboardingGoalPreview() {
            renderGoalStrategySummary('onb', 'onb-goal-summary');
        }

        function syncProfileGoalPreview() {
            renderGoalStrategySummary('swal-user', 'swal-user-goal-summary');
        }

        async function attachGoalPreviewListeners() {
            const onbGoal = document.getElementById('onb-objetivo');
            const onbSpeed = document.getElementById('onb-goal-speed');
            const onbSpeedBtns = document.querySelectorAll('.onb-speed-btn');
            const onbActivity = document.getElementById('onb-activity-level');
            const onbBirth = document.getElementById('onb-birthdate');
            const onbWeight = document.getElementById('onb-peso');
            const onbHeight = document.getElementById('onb-altura');
            const onbGender = document.getElementById('onb-genero');
            if (onbGoal) {
                onbGoal.addEventListener('change', () => {
                    syncOnboardingGoalPreview();
                    toggleGoalSpeedField('onb');
                    renderOnbClinicalAlert();
                });
            }

            onbSpeedBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    onbSpeed.value = btn.dataset.speed;
                    onbSpeedBtns.forEach(b => {
                        b.classList.toggle('bg-blue-600', b.dataset.speed === onbSpeed.value);
                        b.classList.toggle('text-white', b.dataset.speed === onbSpeed.value);
                    });
                    syncOnboardingGoalPreview();
                });
            });

            if (onbActivity) onbActivity.addEventListener('change', syncOnboardingGoalPreview);
            if (onbBirth) onbBirth.addEventListener('change', () => { syncOnboardingGoalPreview(); renderOnbClinicalAlert(); });
            if (onbWeight) onbWeight.addEventListener('input', () => { syncOnboardingGoalPreview(); renderOnbClinicalAlert(); });
            if (onbHeight) onbHeight.addEventListener('input', () => { syncOnboardingGoalPreview(); renderOnbClinicalAlert(); });
            if (onbGender) onbGender.addEventListener('change', () => { syncOnboardingGoalPreview(); renderOnbClinicalAlert(); });

            const activitySelect = document.getElementById('daily-activity-level');
            if (activitySelect) activitySelect.addEventListener('change', () => updateDailyActivityLevel(true));

            if (onbGoal || onbSpeed || onbActivity) {
                syncOnboardingGoalPreview();
                toggleGoalSpeedField('onb');
                renderOnbClinicalAlert();
            }
        }

        document.addEventListener('DOMContentLoaded', attachGoalPreviewListeners);

        async function guardarOnboarding() {
            const user = firebase.auth().currentUser;
            if (!user) return;

            const fechaNacStr = document.getElementById('onb-birthdate').value;
            if (!fechaNacStr) {
                Swal.fire('Atención', 'Por favor, introduce tu fecha de nacimiento.', 'error');
                return;
            }

            const edadCalculada = calcularEdad(fechaNacStr);
            const pesoForm = parseFloat(document.getElementById('onb-peso').value) || 0;
            const alturaForm = parseInt(document.getElementById('onb-altura').value) || 0;

            if (edadCalculada < 1 || pesoForm <= 0 || alturaForm <= 0) {
                Swal.fire('Datos inválidos', 'Por favor, revisa tu fecha de nacimiento, peso y altura.', 'error');
                return;
            }

            // Alerta clínica preventiva (antes de guardar)
            const goalSelected = document.getElementById('onb-objetivo').value;
            const bfForm = parseFloat(document.getElementById('onb-grasa')?.value) || 0;
            const mkForm = parseFloat(document.getElementById('onb-musculo')?.value) || 0;
            const alert = getClinicalAlert({
                gender: document.getElementById('onb-genero').value,
                age: edadCalculada,
                weight: pesoForm,
                height: alturaForm,
                goal: goalSelected,
                bodyFat: bfForm || null,
                muscleKg: mkForm || null
            });
            if (alert.level === 'danger' && alert.recommendationGoal && normalizeGoalKey(goalSelected) !== normalizeGoalKey(alert.recommendationGoal)) {
                const ideal = alert.idealWeight ? alert.idealWeight.toFixed(1) : '?';
                const btnLabel = alert.recommendationGoal === 'fat_loss' ? 'Cambiar a Perder Grasa'
                    : alert.recommendationGoal === 'muscle_gain' ? 'Cambiar a Ganar Masa'
                    : 'Aplicar recomendado';
                const recText = alert.recommendationGoal === 'fat_loss' ? 'Perder Grasa' : (alert.recommendationGoal === 'muscle_gain' ? 'Ganar Masa' : alert.recommendationGoal);
                const res = await Swal.fire({
                    title: '⚠️ Alerta de salud',
                    html: `<div class="text-left text-sm text-slate-700">
                              <div class="font-black text-red-600 mb-2">${alert.title}</div>
                              <div>${alert.message}</div>
                              <div class="mt-2"><b>${alert.bmiText}</b></div>
                              ${alert.idealWeight ? `<div class="mt-1"><b>Peso ideal estimado:</b> ~${ideal} kg</div>` : ''}
                              <div class="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 font-semibold">
                                Recomendación: cambia el objetivo a <b>${recText}</b>.
                              </div>
                           </div>`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#1e293b',
                    cancelButtonColor: '#ef4444',
                    confirmButtonText: btnLabel,
                    cancelButtonText: 'Continuar igual'
                });
                if (res.isConfirmed) {
                    onbApplyRecommendedGoal(alert.recommendationGoal);
                }
            }

            // Construimos el objeto BIO tal cual lo espera tu aplicación
            let manualLocationText = document.getElementById('onb-location').value || (USER_BIO && USER_BIO.ubicacion) || "España";
            let manualCoords = onboardingLocation;
            if (!manualCoords && manualLocationText) {
                try {
                    const resolved = await resolveLocationToCoords(manualLocationText);
                    if (resolved) {
                        manualCoords = { lat: resolved.lat, lon: resolved.lon };
                        manualLocationText = resolved.name || manualLocationText;
                    }
                } catch (_) {}
            }

            const datosBio = {
                nombre: (document.getElementById('onb-nombre')?.value || '').trim() || user.displayName || "Usuario",
                genero: document.getElementById('onb-genero').value,
                fechaNacimiento: fechaNacStr, // Guardamos la fecha para el futuro
                edad: edadCalculada,
                peso: pesoForm,
                altura: alturaForm,
                grasa: parseFloat(document.getElementById('onb-grasa').value) || 15,
                masaMuscular: parseFloat(document.getElementById('onb-musculo').value) || 30,
                maxRunKm: parseFloat(document.getElementById('onb-run').value) || 0,
                maxGymTime: parseFloat(document.getElementById('onb-maxgym')?.value) || 0,
                maxBikeKm: parseFloat(document.getElementById('onb-bike').value) || 0,
                ubicacion: manualLocationText,
                lat: manualCoords ? manualCoords.lat : ((USER_BIO && USER_BIO.lat != null) ? USER_BIO.lat : null),
                lon: manualCoords ? manualCoords.lon : ((USER_BIO && USER_BIO.lon != null) ? USER_BIO.lon : null),
                goalSpeed: document.getElementById('onb-goal-speed').value || "moderate",
                goal: document.getElementById('onb-objetivo').value,
                activityLevel: document.getElementById('onb-activity-level').value || 'moderate'
            };

            try {
                // IMPORTANTE: Guardamos en 'bio' porque es donde tu loadUserData lo lee
                await db.collection('usuarios').doc(user.uid).set({
                    perfilCompletado: true,
                    email: user.email,
                    bio: datosBio 
                }, { merge: true });

                Swal.fire({
                    title: '¡Perfil Calibrado!',
                    text: `Fecha guardada (${fechaNacStr}) · Edad calculada: ${edadCalculada} años · ${getGoalSpeedAdvice(datosBio.goalSpeed)}`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });

                // Cerramos modal y cargamos la app
                document.getElementById('onboarding-modal').classList.add('hidden');
                document.getElementById('onboarding-modal').classList.remove('flex');
                
                // Forzamos la recarga de datos para que el motor biológico se entere del cambio
                await completarSesionConUsuario(user); 

            } catch (error) {
                console.error("Error al guardar perfil:", error);
                Swal.fire('Error', 'No se pudieron guardar los datos en Firebase.', 'error');
            }
        }
