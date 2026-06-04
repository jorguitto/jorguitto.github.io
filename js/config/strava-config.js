/**
 * Credenciales Strava embebidas (app estática).
 * AVISO: Cualquiera que abra el código en el navegador puede ver el client_secret.
 * No subas este archivo a un repositorio público sin regenerar el secret en Strava.
 */
(function () {
  var C = (window.__STRAVA_CONFIG__ = window.__STRAVA_CONFIG__ || {});
  C.client_id = '237715';
  C.client_secret = '2e1fea325f94691bd714811b2e13ecaecd4bcca7';

  window.STRAVA_CLIENT_ID = C.client_id;
  window.STRAVA_CLIENT_SECRET = C.client_secret;

  try {
    var sid = window.localStorage.getItem('strava_client_id');
    if (sid && /^\d+$/.test(String(sid).trim())) {
      C.client_id = String(sid).trim();
      window.STRAVA_CLIENT_ID = C.client_id;
    }
    var sec = window.localStorage.getItem('strava_client_secret');
    if (sec && String(sec).trim()) {
      C.client_secret = String(sec).trim();
      window.STRAVA_CLIENT_SECRET = C.client_secret;
    }
    if (!window.localStorage.getItem('strava_client_id') && C.client_id) {
      window.localStorage.setItem('strava_client_id', String(C.client_id));
    }
    if (!window.localStorage.getItem('strava_client_secret') && C.client_secret) {
      window.localStorage.setItem('strava_client_secret', String(C.client_secret));
    }
  } catch (_) {}
})();
