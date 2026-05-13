/**
 * Fase 2 (OAuth callback) + Fase 1 (URL de autorización)
 * - App sin backend: esto requiere CLIENT_SECRET para intercambiar `code` por tokens.
 *   ADVERTENCIA: NO es seguro exponer `client_secret` en frontend. Lo correcto es usar
 *   Firebase Cloud Functions (o similar) para el intercambio de tokens.
 *
 * Este archivo sigue el requisito del usuario (fetch() desde cliente) con placeholders.
 */

(function () {
  /**
   * CONFIGURA ESTO CON TUS DATOS REALES DE STRAVA
   * - client_id: número entero (p.ej. "123456")
   * - client_secret: cadena (NO recomendado en frontend; ver nota arriba)
   * - redirect_uri:
   *   Strava exige que sea EXACTAMENTE la misma URL que uses en el authorize.
   *   Como tú pruebas en 2 sitios (local y GitHub Pages), usamos 2 redirect URIs
   *   y seleccionamos automáticamente según el host.
   */
  const STRAVA_CLIENT_ID_DEFAULT = '';
  const STRAVA_CLIENT_SECRET_DEFAULT = '';
  const STRAVA_CLIENT_SECRET_PLACEHOLDER = 'TU_CLIENT_SECRET';
  const STRAVA_REDIRECT_URI_PROD = 'https://jorguitto.github.io/proyecto(1).html';
  const STRAVA_REDIRECT_URI_DEV = 'https://127.0.0.1:3000/'; // o 'https://127.0.0.1:3000/proyecto(1).html' si sirves ese archivo
  const STRAVA_SCOPE = 'activity:read_all';

  function readFromStorage(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function getStravaClientId() {
    const fromWindow =
      window.STRAVA_CLIENT_ID ||
      (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_id);
    const fromStorage = readFromStorage('strava_client_id');
    const value = fromWindow || fromStorage || STRAVA_CLIENT_ID_DEFAULT;
    return String(value || '').trim();
  }

  function getStravaClientSecret() {
    const fromWindow =
      window.STRAVA_CLIENT_SECRET ||
      (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_secret);
    const fromStorage = readFromStorage('strava_client_secret');
    const value = fromWindow || fromStorage || STRAVA_CLIENT_SECRET_DEFAULT;
    return String(value || '').trim();
  }

  function getClientIdSource() {
    const fromWindow =
      window.STRAVA_CLIENT_ID ||
      (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_id);
    if (fromWindow) return 'window';
    const fromStorage = readFromStorage('strava_client_id');
    if (fromStorage) return 'localStorage';
    return 'default_placeholder';
  }

  function getClientSecretSource() {
    const fromWindow =
      window.STRAVA_CLIENT_SECRET ||
      (window.__STRAVA_CONFIG__ && window.__STRAVA_CONFIG__.client_secret);
    if (fromWindow) return 'window';
    const fromStorage = readFromStorage('strava_client_secret');
    if (fromStorage) return 'localStorage';
    return 'default_placeholder';
  }

  function maskValue(v) {
    const s = String(v || '');
    if (!s) return '(vacio)';
    if (s.length <= 4) return '****';
    return `${s.slice(0, 2)}***${s.slice(-2)}`;
  }

  function buildConfigDiagnostics() {
    const clientId = getStravaClientId();
    const clientSecret = getStravaClientSecret();
    const redirectUri = getRedirectUriForEnv();
    const idSource = getClientIdSource();
    const secretSource = getClientSecretSource();

    const issues = [];
    if (!clientId) {
      issues.push('STRAVA_CLIENT_ID está vacío.');
    } else if (!/^\d+$/.test(clientId)) {
      issues.push(`STRAVA_CLIENT_ID debe ser numérico y ahora vale "${clientId}".`);
    }

    if (!clientSecret) {
      issues.push('STRAVA_CLIENT_SECRET no está configurado.');
    }

    if (!/^https?:\/\//.test(String(redirectUri))) {
      issues.push(`Redirect URI inválida: ${redirectUri}`);
    }

    return {
      ok: issues.length === 0,
      issues,
      debugLine: `idSource=${idSource}, id=${maskValue(clientId)}, secretSource=${secretSource}, redirect=${redirectUri}`,
    };
  }

  function getRedirectUriForEnv() {
    // Strava exige coincidencia exacta con la URL autorizada en el dashboard.
    // Usar siempre origin + pathname evita fallos al mover el HTML (fork, copia local, otra ruta en GitHub Pages).
    try {
      return `${window.location.origin}${window.location.pathname}`;
    } catch (_) {
      return STRAVA_REDIRECT_URI_PROD;
    }
  }

  function getFirebase() {
    if (!window.firebase) throw new Error('Firebase no está cargado.');
    if (!window.auth || !window.db) {
      // En `proyecto(1).html` existen `auth` y `db` en global scope.
      // Si no existiesen, intentamos derivarlos de firebase.
      return { auth: window.firebase.auth(), db: window.firebase.firestore() };
    }
    return { auth: window.auth, db: window.db };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForUser(auth, timeoutMs = 15000) {
    if (auth.currentUser) return auth.currentUser;
    let resolved = false;
    let userResolved = null;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!resolved) reject(new Error('Timeout esperando usuario autenticado.'));
      }, timeoutMs);
      const unsub = auth.onAuthStateChanged((u) => {
        if (resolved) return;
        if (u) {
          resolved = true;
          userResolved = u;
          clearTimeout(timer);
          try { unsub(); } catch (_) {}
          resolve(u);
        }
      });
      // Pequeña protección: si el SDK tarda, damos margen.
      (async () => {
        for (let i = 0; i < 6 && !resolved; i++) await sleep(250);
        if (!resolved && auth.currentUser) {
          resolved = true;
          clearTimeout(timer);
          try { unsub(); } catch (_) {}
          resolve(auth.currentUser);
        }
      })();
    });
  }

  function buildAuthorizeUrl() {
    const clientId = getStravaClientId();
    const diagnostics = buildConfigDiagnostics();
    // Strava requiere client_id entero.
    if (!/^\d+$/.test(clientId)) {
      setStatus(`Configura STRAVA_CLIENT_ID numérico. ${diagnostics.debugLine}`, 'err');
      throw new Error(`STRAVA_CLIENT_ID inválido. ${diagnostics.debugLine}`);
    }
    const redirectUri = getRedirectUriForEnv();
    if (!/^https?:\/\//.test(String(redirectUri))) {
      setStatus('Configura STRAVA_REDIRECT_URI (URL completa https://...).', 'err');
      throw new Error('STRAVA_REDIRECT_URI inválida.');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: STRAVA_SCOPE,
      approval_prompt: 'auto',
    });
    return `https://www.strava.com/oauth/authorize?${params.toString()}`;
  }

  async function exchangeCodeForTokens(code) {
    const clientId = getStravaClientId();
    const clientSecret = getStravaClientSecret();
    if (!/^\d+$/.test(clientId)) {
      throw new Error('STRAVA_CLIENT_ID inválido (debe ser numérico).');
    }
    if (!clientSecret || clientSecret === STRAVA_CLIENT_SECRET_PLACEHOLDER) {
      throw new Error('Falta STRAVA_CLIENT_SECRET válido.');
    }
    const redirectUri = getRedirectUriForEnv();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    // Endpoint oficial (docs Strava): /api/v3/oauth/token
    const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Strava token exchange falló (${res.status}). ${text}`);
    }
    return await res.json();
  }

  function cleanUrl() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('code');
      u.searchParams.delete('scope');
      u.searchParams.delete('error');
      window.history.replaceState({}, document.title, u.toString());
    } catch (_) {}
  }

  function getPendingCode() {
    try { return window.sessionStorage.getItem('strava_pending_code') || ''; } catch (_) { return ''; }
  }

  function setPendingCode(code) {
    try {
      if (code) window.sessionStorage.setItem('strava_pending_code', String(code));
      else window.sessionStorage.removeItem('strava_pending_code');
    } catch (_) {}
  }

  function setStatus(text, tone = 'neutral') {
    const el = document.getElementById('strava-connect-status');
    if (!el) return;
    const color =
      tone === 'ok' ? 'text-emerald-700' :
      tone === 'warn' ? 'text-amber-700' :
      tone === 'err' ? 'text-red-600' :
      'text-slate-600';
    el.className = `mt-2 text-[11px] ${color}`;
    el.textContent = text;
  }

  async function updateStravaConnectUI() {
    try {
      const { auth, db } = getFirebase();
      const user = auth.currentUser;
      const btn = document.getElementById('strava-connect-btn');
      const disconnectBtn = document.getElementById('strava-disconnect-btn');
      if (!btn) return;

      if (!user) {
        btn.disabled = true;
        btn.style.opacity = '0.65';
        if (disconnectBtn) { disconnectBtn.disabled = true; disconnectBtn.style.opacity = '0.65'; }
        setStatus('Inicia sesión para conectar Strava.', 'warn');
        return;
      }

      btn.disabled = false;
      btn.style.opacity = '1';
      if (disconnectBtn) { disconnectBtn.disabled = false; disconnectBtn.style.opacity = '1'; }

      const snap = await db.collection('usuarios').doc(user.uid).get();
      const data = snap.exists ? snap.data() : null;
      const t = data && data.stravaTokens ? data.stravaTokens : null;
      if (t && t.access_token) {
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Strava conectado';
        setStatus('✅ Strava conectado. La app sincronizará al entrar al Dashboard.', 'ok');
      } else {
        btn.innerHTML = '<i class="fab fa-strava"></i> Conectar con Strava';
        setStatus('Conecta Strava para ajustar agua y macros automáticamente.', 'neutral');
        const pending = getPendingCode();
        if (pending) {
          setStatus('Procesando autorización de Strava...', 'neutral');
          handleStravaOAuthCallback();
        }
      }
    } catch (e) {
      console.warn('updateStravaConnectUI error:', e);
    }
  }

  async function desconectarStrava() {
    try {
      const { auth, db } = getFirebase();
      const user = auth.currentUser;
      if (!user) {
        setStatus('Inicia sesión para desconectar Strava.', 'warn');
        return;
      }

      await db.collection('usuarios').doc(user.uid).set(
        {
          stravaTokens: window.firebase.firestore.FieldValue.delete(),
          strava_profile: window.firebase.firestore.FieldValue.delete(),
        },
        { merge: true }
      );

      setStatus('Strava desconectado correctamente.', 'ok');
      await updateStravaConnectUI();
      try {
        if (window.Swal) {
          window.Swal.fire({ icon: 'success', title: 'Strava desconectado', timer: 1300, showConfirmButton: false });
        }
      } catch (_) {}
    } catch (e) {
      console.error('desconectarStrava fallo:', e);
      setStatus(`No se pudo desconectar: ${e.message || e}`, 'err');
    }
  }

  async function handleStravaOAuthCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code') || getPendingCode();
    const error = url.searchParams.get('error');

    if (error) {
      cleanUrl();
      console.warn('Strava OAuth error:', error);
      setStatus('No se pudo conectar Strava (error de autorización).', 'err');
      return;
    }

    if (!code) return; // no callback
    setPendingCode(code);

    try {
      setStatus('Conectando Strava... (intercambiando código)', 'neutral');
      const { auth, db } = getFirebase();
      const user = await waitForUser(auth);
      const tokenPayload = await exchangeCodeForTokens(code);

      const stravaTokens = {
        access_token: tokenPayload.access_token,
        refresh_token: tokenPayload.refresh_token,
        expires_at: tokenPayload.expires_at,
        expires_in: tokenPayload.expires_in,
        token_type: tokenPayload.token_type,
        athlete: tokenPayload.athlete || null,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection('usuarios').doc(user.uid).set(
        {
          stravaTokens,
          strava_profile: {
            athlete_id: tokenPayload.athlete && tokenPayload.athlete.id,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );

      setPendingCode('');
      cleanUrl();
      await updateStravaConnectUI();
      setStatus('✅ Strava conectado. Ya puedes volver al Dashboard.', 'ok');
      try {
        if (window.Swal) {
          window.Swal.fire({
            icon: 'success',
            title: 'Strava conectado',
            text: 'Sincronizaremos tus actividades automáticamente.',
            timer: 1800,
            showConfirmButton: false,
          });
        }
      } catch (_) {}
      setTimeout(() => {
        try {
          if (typeof window.syncStravaActivityCatalog === 'function') {
            window.syncStravaActivityCatalog(50);
          }
        } catch (_) {}
      }, 900);
    } catch (e) {
      console.error('handleStravaOAuthCallback fallo:', e);
      const details = (e && e.message) ? e.message : String(e);
      setStatus(`Error conectando Strava: ${details}`, 'err');
      try {
        if (window.Swal) {
          window.Swal.fire({
            icon: 'error',
            title: 'Falló conexión con Strava',
            html: `<div style="text-align:left;font-size:13px"><p>Error exacto:</p><code style="font-size:11px;word-break:break-all">${details}</code></div>`
          });
        }
      } catch (_) {}
      cleanUrl();
    }
  }

  function startStravaConnect() {
    try {
      const clientId = getStravaClientId();
      const redirectUri = getRedirectUriForEnv();
      const idSource = getClientIdSource();

      if (!clientId || !/^\d+$/.test(clientId)) {
        const msg = `STRAVA_CLIENT_ID inválido. Fuente=${idSource}, valor="${clientId || '(vacio)'}"`;
        setStatus(msg, 'err');
        if (window.Swal) {
          window.Swal.fire({
            icon: 'error',
            title: 'Configura STRAVA_CLIENT_ID',
            html: `
              <div style="text-align:left;font-size:13px">
                <p style="margin-bottom:8px">Para redirigir a Strava, el Client ID debe ser numérico.</p>
                <code style="font-size:11px;word-break:break-all">${msg}</code>
                <p style="margin-top:10px">Asegúrate de que exista <code>js/strava-app-config.js</code> (con tu ID numérico) y que en <code>proyecto(1).html</code> se cargue <b>antes</b> de <code>strava-auth.js</code>. También puedes usar: <code>localStorage.setItem('strava_client_id','TU_ID')</code> y recargar.</p>
              </div>
            `,
          });
        }
        return;
      }
      if (!/^https?:\/\//.test(String(redirectUri))) {
        setStatus(`Redirect URI inválida: ${redirectUri}`, 'err');
        return;
      }

      // Importante: para iniciar OAuth sólo necesitamos client_id + redirect_uri.
      // client_secret se usa después, en el intercambio code -> token.
      const url = buildAuthorizeUrl();
      window.location.href = url;
    } catch (e) {
      console.error('startStravaConnect fallo:', e);
      setStatus(`Error iniciando OAuth: ${e.message || e}`, 'err');
    }
  }

  async function bootstrapStravaSessionAfterModules() {
    for (let i = 0; i < 50; i++) {
      const mod = window.__FITTRACKER_MODULES__;
      if (mod && typeof mod.ensureStravaSessionForCurrentUser === 'function') {
        try {
          await mod.ensureStravaSessionForCurrentUser();
        } catch (e) {
          console.warn('ensureStravaSessionForCurrentUser', e);
        }
        return;
      }
      await sleep(200);
    }
  }

  function hookFirebaseAuthForStrava() {
    const tryHook = () => {
      const auth = window.auth || (window.firebase && window.firebase.auth && window.firebase.auth());
      if (!auth) {
        setTimeout(tryHook, 300);
        return;
      }
      auth.onAuthStateChanged((user) => {
        if (!user) return;
        bootstrapStravaSessionAfterModules().finally(() => {
          try {
            updateStravaConnectUI();
          } catch (_) {}
        });
      });
    };
    tryHook();
  }

  // Exponer funciones globales (vanilla JS / inline handlers)
  window.startStravaConnect = startStravaConnect;
  window.updateStravaConnectUI = updateStravaConnectUI;
  window.handleStravaOAuthCallback = handleStravaOAuthCallback;
  window.desconectarStrava = desconectarStrava;

  // Ejecutar al cargar (Fase 2) + restaurar tokens Strava tras reload
  window.addEventListener('load', () => {
    handleStravaOAuthCallback();
    bootstrapStravaSessionAfterModules().finally(() => {
      try {
        updateStravaConnectUI();
      } catch (_) {}
    });
  });

  hookFirebaseAuthForStrava();
})();

