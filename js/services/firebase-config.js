let cached = null;

export function initFirebase() {
  if (cached) return cached;
  const firebaseGlobal = window.firebase;
  if (!firebaseGlobal) throw new Error('Firebase SDK no cargado (compat CDN).');

  const firebaseConfig = {
            apiKey: "AIzaSyCgCwGwkMUTI9PhyWHBv6DXxhkHgf8Rjzg",
            authDomain: "fittracker-a347a.firebaseapp.com",
            projectId: "fittracker-a347a",
            storageBucket: "fittracker-a347a.firebasestorage.app",
            messagingSenderId: "251475812729",
            appId: "1:251475812729:web:d1ed26b4262091f11f8fa8",
            measurementId: "G-K0R3K5EBT0"
        };

  if (!firebaseGlobal.apps || !firebaseGlobal.apps.length) firebaseGlobal.initializeApp(firebaseConfig);

  const auth = firebaseGlobal.auth();
  const db = firebaseGlobal.firestore();
  cached = { firebase: firebaseGlobal, auth, db, firebaseConfig };
  return cached;
}
