import { BIO_DATABASE } from '../data/bioDatabase.js';
import { CLIMA_PETRER } from '../data/clima.js';

export class BioEngine {
  
            constructor() {
                this.weights = JSON.parse(localStorage.getItem('bio_weights')) || {
                    fatigueSensitivity: 1.2,
                    sleepEfficiency: 1.0,
                    recoveryFatigueFactor: 1.0 
                }

}
