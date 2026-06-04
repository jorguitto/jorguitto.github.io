/** Motor biologico FitTracker (requiere BIO_DATABASE, CLIMA_PETRER, USER_BIO, CLIMA_REAL) */
class BioEngine {
    constructor() {
        this.weights = JSON.parse(localStorage.getItem('bio_weights')) || {
            fatigueSensitivity: 1.2,
            sleepEfficiency: 1.0,
            recoveryFatigueFactor: 1.0 
        };
    }

    getBioProfile(age, gender) {
        const g = gender.toLowerCase() === 'mujer' ? 'mujer' : 'hombre';
        const list = BIO_DATABASE[g];
        // Buscar rango exacto o devolver el último (más viejo) por defecto
        return list.find(r => age >= r.min && age <= r.max) || list[list.length - 1];
    }

    recalculateBiologicalProfile() {
        const profile = this.getBioProfile(USER_BIO.edad, USER_BIO.genero);
        
        // Factor de recuperación (0.5 lento - 1.5 rápido)
        let recoveryFactor = (100 - USER_BIO.edad) / 80; 
        if (USER_BIO.masaMuscular > 40) recoveryFactor += 0.2; // Más músculo ayuda metabólicamente
        
        return { sleepNeed: profile.sleep, recoveryFactor, profileData: profile };
    }

    getBMR() {
        let base = (10 * USER_BIO.peso) + (6.25 * USER_BIO.altura) - (5 * USER_BIO.edad);
        if (USER_BIO.genero === "hombre") base += 5;
        else base -= 161;
        
        if(USER_BIO.masaMuscular > 0 && USER_BIO.grasa < 15) {
            base *= 1.1; // Bonus muscular
        }
        
        const profile = this.getBioProfile(USER_BIO.edad, USER_BIO.genero);
        return base * profile.meta; // Ajuste metabólico por edad
    }

    getClimateStress() {
        const month = new Date().getMonth();
        const fallback = CLIMA_PETRER[month];
        const liveTemp = (CLIMA_REAL && CLIMA_REAL.temp != null) ? CLIMA_REAL.temp : null;
        const temp = liveTemp != null ? liveTemp : fallback.t;
        const icon = liveTemp != null ? CLIMA_REAL.icon : fallback.icon;
        let waterFactor = 1.0;
        let thermalFatigue = 0;

        if (temp > 25) { 
            let extraDegrees = temp - 25;
            waterFactor += (extraDegrees * 0.05); 
            thermalFatigue = 10;
        }
        
        let termogenesis = (temp < 15) ? 100 : 0;
        return { waterFactor, termogenesisKcal: termogenesis, temp, thermalFatigue, icon };
    }

    analyzeBodyComposition() {
        const { peso, altura, grasa, masaMuscular, edad, genero, maxRunKm, maxGymTime, maxBikeKm } = USER_BIO;
        const heightM = (Number(altura) || 0) / 100;
        const weight = Number(peso) || 0;
        const bodyFat = Number(grasa) || 0;
        const muscleKg = Number(masaMuscular) || 0;

        const bmiRaw = (heightM > 0 && weight > 0) ? (weight / (heightM * heightM)) : 0;
        const bmi = Number.isFinite(bmiRaw) ? bmiRaw : 0;

        // Nivel atlético (solo como “contexto”, nunca para tapar riesgo clínico)
        let performanceScore = 0;
        let activeStats = 0;
        if ((Number(maxRunKm) || 0) > 0) { activeStats++; performanceScore += Math.min(Number(maxRunKm) / 10, 1.5); }
        if ((Number(maxGymTime) || 0) > 0) { activeStats++; performanceScore += Math.min(Number(maxGymTime) / 90, 1.5); }
        if ((Number(maxBikeKm) || 0) > 0) { activeStats++; performanceScore += Math.min(Number(maxBikeKm) / 40, 1.5); }
        const fitnessLevel = activeStats > 0 ? (performanceScore / activeStats) : 0; // 0..1.5 aprox

        // Rangos saludables (adultos) según referencia práctica de app:
        // - IMC saludable: 18.5–24.9
        // - % grasa saludable: 10–20% hombres, 18–28% mujeres
        const sex = (genero || '').toLowerCase() === 'mujer' ? 'mujer' : 'hombre';
        const healthyFatLow = sex === 'hombre' ? 10 : 18;
        const healthyFatHigh = sex === 'hombre' ? 20 : 28;
        const athleticFatHigh = sex === 'hombre' ? 15 : 22;

        const muscleRatio = (weight > 0) ? (muscleKg / weight) : 0;

        const bmiCategory = (() => {
            if (bmi <= 0) return 'SIN DATOS';
            if (bmi < 18.5) return 'BAJO PESO';
            if (bmi < 25) return 'NORMOPESO';
            if (bmi < 30) return 'SOBREPESO';
            if (bmi < 35) return 'OBESIDAD I';
            if (bmi < 40) return 'OBESIDAD II';
            return 'OBESIDAD III';
        })();

        const fatCategory = (() => {
            if (bodyFat <= 0) return 'SIN % GRASA';
            if (bodyFat < healthyFatLow) return 'GRASA BAJA';
            if (bodyFat <= healthyFatHigh) return 'GRASA SALUDABLE';
            if (bodyFat <= (sex === 'hombre' ? 25 : 32)) return 'GRASA ELEVADA';
            return 'GRASA MUY ELEVADA';
        })();

        // Excepción muscular: IMC alto por masa magra (muy raro). Solo si %grasa está en rango saludable y músculo alto.
        const isMuscularException = (bmi >= 25) && (bodyFat > 0) && (bodyFat <= healthyFatHigh) && (muscleRatio >= 0.45) && (fitnessLevel >= 0.9);

        let status = `Salud: ${bmiCategory}`;
        let advice = "Sigue registrando tus datos para recomendaciones precisas.";
        let colorClass = "text-slate-700";
        let badgeClass = "bg-slate-100 text-slate-700";
        let alertLevel = "none"; // none | warning | danger

        // Regla estricta: NO decir “óptimo/atlético” si IMC no está en 18.5–24.9 O %grasa no está en rango saludable.
        const bmiHealthy = bmi >= 18.5 && bmi <= 24.9;
        const fatHealthy = (bodyFat > 0) ? (bodyFat >= healthyFatLow && bodyFat <= healthyFatHigh) : false;

        if (bmi <= 0 || weight <= 0 || heightM <= 0) {
            status = "Salud: Datos incompletos";
            advice = "Revisa peso y altura para calcular IMC y riesgo.";
        } else if (!isMuscularException && (bmiCategory.startsWith('OBESIDAD') || bmiCategory === 'SOBREPESO')) {
            alertLevel = bmiCategory.startsWith('OBESIDAD') ? "danger" : "warning";
            colorClass = alertLevel === 'danger' ? "text-red-700" : "text-orange-700";
            badgeClass = alertLevel === 'danger' ? "bg-red-50 text-red-700 border border-red-100" : "bg-orange-50 text-orange-700 border border-orange-100";

            const riskMsg = alertLevel === 'danger'
                ? "Alerta de Salud: tu composición actual sugiere un riesgo elevado."
                : "Alerta de Salud: estás por encima de tu rango saludable.";

            const goalHint = "Te recomendamos cambiar tu objetivo a 'Perder Grasa' y empezar con un déficit calórico leve y pasos diarios.";
            const impactHint = bmi >= 30 ? "Evita correr si hay molestias articulares; prioriza caminar + fuerza progresiva." : "Prioriza caminar, fuerza 2–3 días/semana y proteína suficiente.";

            // Si hay % grasa, úsalo para reforzar el mensaje (sin insultar y sin simplismos)
            const fatHint = bodyFat > healthyFatHigh
                ? `Tu % de grasa (${bodyFat}%) está por encima de rango saludable.`
                : (bodyFat > 0 ? `Tu % de grasa (${bodyFat}%) no indica perfil atlético.` : "Registra tu % de grasa para afinar el diagnóstico.");

            advice = `${riskMsg} ${fatHint} ${goalHint} ${impactHint}`;
        } else if (bmiHealthy && fatHealthy && muscleRatio >= 0.38 && (bodyFat > 0 ? bodyFat <= athleticFatHigh : true)) {
            status = "Salud: Composición atlética";
            colorClass = "text-green-700";
            badgeClass = "bg-green-50 text-green-700 border border-green-100";
            advice = "Composición en rango saludable. Mantén fuerza + pasos y ajusta calorías según objetivo.";
        } else if (bmiHealthy || fatHealthy || isMuscularException) {
            status = isMuscularException ? "Salud: Alto peso por masa muscular" : `Salud: ${bmiCategory}`;
            colorClass = "text-slate-700";
            badgeClass = "bg-slate-100 text-slate-700";
            const extra = (!bmiHealthy && fatHealthy) ? "Tu IMC está alto pero tu % grasa está en rango: revisa perímetros y tendencia." : "";
            advice = `IMC: ${bmi.toFixed(1)} · ${fatCategory}. ${extra}`.trim();
        } else {
            // Casos como “skinny fat” (IMC normal pero grasa elevada) o grasa baja
            if (bodyFat > 0 && bodyFat > healthyFatHigh && bmi < 25) {
                alertLevel = "warning";
                status = "Salud: Normopeso con grasa elevada";
                colorClass = "text-yellow-800";
                badgeClass = "bg-yellow-50 text-yellow-800 border border-yellow-100";
                advice = "Alerta: aunque el IMC sea normal, tu % de grasa es alto. Prioriza fuerza + proteína y reduce calorías moderadamente.";
            } else if (bodyFat > 0 && bodyFat < healthyFatLow) {
                alertLevel = "warning";
                status = "Salud: Grasa corporal baja";
                colorClass = "text-blue-700";
                badgeClass = "bg-blue-50 text-blue-700 border border-blue-100";
                advice = "Grasa corporal baja: vigila energía, sueño y lípidos en dieta. Si hay síntomas, consulta profesional sanitario.";
            } else {
                advice = `IMC: ${bmi.toFixed(1)} · ${fatCategory}.`;
            }
        }

        // Persistimos en memoria para que se guarde en Firebase junto al perfil (si existe el flujo de guardado)
        USER_BIO.imc = Number(bmi.toFixed(1));
        USER_BIO.imcCategoria = bmiCategory;
        USER_BIO.grasaCategoria = fatCategory;
        USER_BIO.healthAlertLevel = alertLevel;

        return {
            status,
            advice,
            bmi: bmi.toFixed(1),
            bmiCategory,
            fatCategory,
            fitnessLevel: Number.isFinite(fitnessLevel) ? Number(fitnessLevel.toFixed(2)) : 0,
            colorClass,
            badgeClass,
            alertLevel
        };
    }

    calculateSleepScore(hours, quality = 100) {
        const profile = this.getBioProfile(USER_BIO.edad, USER_BIO.genero);
        const [minSleep, maxSleep] = profile.sleep;
        
        // Corrección Dr. AI: Sueño Real = Horas * (Calidad/100)
        // Si no hay dato de calidad (0), asumimos 80% por defecto para no penalizar tanto
        const qFactor = quality > 0 ? (quality / 100) : 0.85;
        const realSleep = hours * qFactor;

        if (realSleep < minSleep) {
            // Falta de sueño (Penalización exponencial)
            // Ejemplo: Necesita 8, duerme 6 reales -> deficit 2 -> -40 pts
            return Math.max(0, 100 - ((minSleep - realSleep) * 20)); 
        } else if (realSleep > maxSleep + 1.5) {
            // Letargo
            const optimalMax = maxSleep;
            return Math.max(50, 100 - ((realSleep - optimalMax) * 15));
        }
        return 100; // Zona Óptima
    }

    analyzeHormones(fatIntake, sleepHours) {
        const minFat = USER_BIO.peso * 0.8;
        if (fatIntake < minFat) {
            return { status: 'ALERTA', advice: `⚠️ Grasa baja. Peligro testosterona baja.` };
        }
        return { status: 'OPTIMO', advice: "" };
    }

    predictTomorrow(lastDayData, climateData) {
        const { recoveryFactor } = this.recalculateBiologicalProfile();
        const scores = lastDayData.stressScores || { physical: 50, mental: 30 };
        const lastMood = lastDayData.subjective ? lastDayData.subjective.mood : 'NEUTRAL';
        
        // Recuperación basada en edad y músculo
        const physicalPenalty = (scores.physical * 0.6 * this.weights.fatigueSensitivity) / recoveryFactor;
        const mentalPenalty = (scores.mental * 0.3) / recoveryFactor;
        const sleepRecovery = (lastDayData.sleepHours / 8) * 100;
        
        let moodPenalty = 0;
        if (lastMood === 'SAD') moodPenalty = 20;
        if (lastMood === 'STRESSED') moodPenalty = 15;

        let battery = sleepRecovery; 
        battery -= physicalPenalty;
        battery -= mentalPenalty;
        battery -= moodPenalty;
        battery -= (climateData.thermalFatigue || 0);

        const result = Math.min(Math.max(Math.round(battery), 10), 100);
        return isNaN(result) ? 50 : result; // Evitar NaN
    }

    predictMentalPerformance(lastDayData) {
        const scores = lastDayData.stressScores || { mental: 30 };
        const sleepHours = lastDayData.sleepHours || 7;
        
        // Si la carga mental de ayer fue alta, hoy rindes menos
        let mentalScore = 100 - (scores.mental * 0.4);
        
        // Ajuste por sueño
        if (sleepHours < 6) mentalScore -= 25;
        else if (sleepHours < 7) mentalScore -= 15;
        else if (sleepHours > 8) mentalScore += 5;
        
        return Math.min(Math.max(Math.round(mentalScore), 10), 100);
    }

    predictPhysicalPerformance(lastDayData) {
        const scores = lastDayData.stressScores || { physical: 50 };
        const sleepHours = lastDayData.sleepHours || 7;
        
        let physicalScore = 100 - (scores.physical * 0.5);
        
        if (sleepHours < 6) physicalScore -= 25;
        else if (sleepHours < 7) physicalScore -= 15;
        
        return Math.min(Math.max(Math.round(physicalScore), 10), 100);
    }

    learn(predicted, actual) {
        const error = actual - predicted;
        if (error < -20) this.weights.fatigueSensitivity += 0.1;
        else if (error > 20) this.weights.fatigueSensitivity -= 0.05;
        localStorage.setItem('bio_weights', JSON.stringify(this.weights));
    }

    generateDailyAdvice(history) {
        if (!history || history.length === 0) return "Bienvenido. Registra tu primer día para calibrar el motor.";
        
        const yesterday = history[0];
        const sessions = yesterday.data.gymSessions || [];
        const runIntensity = (yesterday.data.runKm / USER_BIO.maxRunKm) * 100;
        const { recoveryFactor, profileData } = this.recalculateBiologicalProfile();

        let advice = `<b>${profileData.msg}</b> `;
        const hasLegs = sessions.some(s => s.muscle === 'pierna') || yesterday.data.runKm > 5 || yesterday.data.bikeKm > 20;

        if (hasLegs && runIntensity > 80) {
            advice += "Ayer machacaste piernas. Hoy el tren inferior está recuperando (Zona Naranja). <b>Recomendación:</b> Entrena Torso, Brazos o haz descanso activo. No repitas pierna hoy.";
        } else if (yesterday.stressScores.mental > 80) {
            advice += "Detectada alta carga cognitiva ayer. Hoy prioriza sueño y grasas saludables.";
        } else {
            advice += "Sistemas recuperados. Puedes entrenar fuerte hoy.";
        }
        return advice;
    }

    recalculateEverything(opts = {}) {
        const { shouldSaveDay = false } = opts || {};
        try {
            if (typeof calculateDynamicGoals === 'function') calculateDynamicGoals();
            if (typeof calculateStressBar === 'function') calculateStressBar();
            if (typeof updateBodyMap === 'function') updateBodyMap();
            if (typeof updateUI === 'function') updateUI();
            if (typeof checkAlerts === 'function') checkAlerts();
            if (shouldSaveDay && typeof saveDay === 'function') saveDay();
        } catch (e) {
            console.error("recalculateEverything fallo:", e);
        }
    }
}

