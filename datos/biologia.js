/** Biologia TFG */
const BIO_DATABASE = {
            hombre: [
                { min: 18, max: 20, sleep: [8.5, 10], water: 45, meta: 1.15, mobileTol: 'dopamine', msg: "Sensibilidad Dopamina: MAX. Móvil >3h destroza la motivación." },
                { min: 21, max: 23, sleep: [8, 9],    water: 42, meta: 1.10, mobileTol: 'insomnia', msg: "Corteza Prefrontal cerrándose. Móvil nocturno causa insomnio severo." },
                { min: 24, max: 26, sleep: [7.5, 9],  water: 40, meta: 1.05, mobileTol: 'focus',    msg: "Foco máximo. El Deep Work consume mucha glucosa." },
                { min: 27, max: 29, sleep: [7.5, 8.5],water: 38, meta: 0.97, mobileTol: 'stress',   msg: "Estrés laboral inicia. Cortisol sube. Desconexión necesaria." },
                { min: 30, max: 33, sleep: [7, 8],    water: 35, meta: 0.95, mobileTol: 'blue',     msg: "Recuperación lenta. Luz azul afecta más al sueño profundo." },
                { min: 34, max: 37, sleep: [7, 8],    water: 35, meta: 0.95, mobileTol: 'sedentary',msg: "Si duermes mal, testosterona cae 15%. Sedentarismo mata cerebro." },
                { min: 38, max: 41, sleep: [7, 8],    water: 33, meta: 0.92, mobileTol: 'memory',   msg: "Riesgo apnea. Memoria corto plazo falla con estrés." },
                { min: 42, max: 45, sleep: [7, 7.5],  water: 33, meta: 0.90, mobileTol: 'vision',   msg: "Visión cansada. El móvil cansa la vista el triple." },
                { min: 46, max: 50, sleep: [7, 7.5],  water: 33, meta: 0.88, mobileTol: 'rigidity', msg: "Alerta Muscular. Si no entrenas fuerza, pierdes 0.5kg músculo/año." },
                { min: 50, max: 60, sleep: [6.5, 7.5],water: 30, meta: 0.85, mobileTol: 'prostate', msg: "Menor sed. Beber por horario. Prioridad salud ósea." },
                { min: 60, max: 120,sleep: [6, 7],    water: 30, meta: 0.80, mobileTol: 'confusion',msg: "Deshidratación causa confusión mental inmediata." }
            ],
            mujer: [
                { min: 18, max: 20, sleep: [9, 10],   water: 40, meta: 1.10, mobileTol: 'social',   msg: "Alta necesidad sueño. Ansiedad social por RRSS afecta ciclo." },
                { min: 21, max: 23, sleep: [8, 9],    water: 38, meta: 1.08, mobileTol: 'migraine', msg: "Pico fertilidad. Hidratación clave para migrañas." },
                { min: 24, max: 26, sleep: [8, 9],    water: 36, meta: 1.05, mobileTol: 'skin',     msg: "Estrés afecta piel/pelo inmediatamente. Vigila B12." },
                { min: 27, max: 29, sleep: [7.5, 8.5],water: 35, meta: 0.98, mobileTol: 'pms',      msg: "Sensibilidad emocional PMS. Metabolismo desciende levemente." },
                { min: 30, max: 33, sleep: [7.5, 8.5],water: 33, meta: 0.95, mobileTol: 'collagen', msg: "Calidad sueño vital para colágeno. Masa muscular difícil de ganar." },
                { min: 34, max: 37, sleep: [7, 8],    water: 33, meta: 0.92, mobileTol: 'adrenal',  msg: "Riesgo hipotiroidismo si sueño <6h. Fatiga suprarrenal." },
                { min: 38, max: 41, sleep: [7, 8],    water: 31, meta: 0.90, mobileTol: 'fog',      msg: "Niebla mental por progesterona. Cardio solo no funciona." },
                { min: 42, max: 45, sleep: [7, 7.5],  water: 31, meta: 0.88, mobileTol: 'anxiety',  msg: "Perimenopausia posible. Móvil noche empeora ansiedad." },
                { min: 46, max: 50, sleep: [7, 7.5],  water: 31, meta: 0.85, mobileTol: 'estrogen', msg: "Bajada estrógenos. Colesterol puede subir solo." },
                { min: 50, max: 60, sleep: [6.5, 7.5],water: 30, meta: 0.82, mobileTol: 'dry',      msg: "Piel seca indica falta agua. Riesgo Alzheimer > hombres." },
                { min: 60, max: 120,sleep: [6, 7],    water: 30, meta: 0.78, mobileTol: 'thirst',   msg: "La sed desaparece. Programar alarmas para beber." }
            ]
        };

const MICRO_DEFS = {
            vitA: { name: 'Vit A (Retinol)', unit: 'µg', base: 900, desc: 'Visión, piel y sistema inmune.', type: 'fat' },
            vitD: { name: 'Vit D (Sol)', unit: 'µg', base: 15, desc: 'Huesos fuertes y absorción de calcio.', type: 'fat' },
            vitE: { name: 'Vit E', unit: 'mg', base: 15, desc: 'Antioxidante celular potente.', type: 'fat' },
            vitK: { name: 'Vit K', unit: 'µg', base: 120, desc: 'Coagulación y salud ósea.', type: 'fat' },
            vitC: { name: 'Vit C', unit: 'mg', base: 90, desc: 'Inmune, colágeno y cicatrización.', type: 'water' },
            vitB1: { name: 'B1 (Tiamina)', unit: 'mg', base: 1.2, desc: 'Energía y sistema nervioso.', type: 'water' },
            vitB2: { name: 'B2 (Ribofl.)', unit: 'mg', base: 1.3, desc: 'Glóbulos rojos y crecimiento.', type: 'water' },
            vitB3: { name: 'B3 (Niacina)', unit: 'mg', base: 16, desc: 'Digestión, piel y nervios.', type: 'water' },
            vitB5: { name: 'B5 (Pantot.)', unit: 'mg', base: 5, desc: 'Metabolismo y hormonas.', type: 'water' },
            vitB6: { name: 'B6 (Piridox.)', unit: 'mg', base: 1.3, desc: 'Desarrollo cerebral e inmune.', type: 'water' },
            vitB7: { name: 'B7 (Biotina)', unit: 'µg', base: 30, desc: 'Cabello, piel y uñas.', type: 'water' },
            vitB9: { name: 'B9 (Fólico)', unit: 'µg', base: 400, desc: 'ADN y división celular.', type: 'water' },
            vitB12: { name: 'B12', unit: 'µg', base: 2.4, desc: 'Neuronas y previene anemia.', type: 'water' },
            omega3: { name: 'Omega-3', unit: 'g', base: 1.6, desc: 'Cerebro, corazón y antiinflamatorio.', type: 'fat' },
            calcium: { name: 'Calcio', unit: 'mg', base: 1000, desc: 'Huesos y dientes.', type: 'min' },
            iron: { name: 'Hierro', unit: 'mg', base: 8, desc: 'Transporte de oxígeno.', type: 'min' },
            magnesium: { name: 'Magnesio', unit: 'mg', base: 400, desc: 'Músculos, nervios y relax.', type: 'min' },
            zinc: { name: 'Zinc', unit: 'mg', base: 11, desc: 'Defensas y testosterona.', type: 'min' },
            sodium: { name: 'Sodio (Electrolitos)', unit: 'mg', base: 1500, desc: 'Volumen plasmático e hidratación.', type: 'min' },
            potassium: { name: 'Potasio (Electrolitos)', unit: 'mg', base: 3400, desc: 'Contracción muscular y nervios.', type: 'min' }
        };
