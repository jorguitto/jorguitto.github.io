import { initFirebase } from './services/firebase-config.js';
import { foodDatabase } from './data/foodDatabase.js';
import { MICRO_DEFS } from './data/bioDatabase.js';
import { BioEngine } from './core/BioEngine.js';

const { auth, db } = initFirebase();

// TODO: aquí se migran tus handlers de DOM desde el legacy (proyecto(1).html)
// - listeners, render, navegación, etc.
// - usa foodDatabase/MICRO_DEFS/BioEngine sin meter lógica pura en el DOM

window.__FITTRACKER__ = { auth, db, foodDatabase, MICRO_DEFS, BioEngine };
console.log('FitTracker modular arrancado');
