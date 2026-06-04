/**
 * Pesos por defecto al seleccionar alimentos (porción típica o 100 g).
 * @param {object} food — ítem de foodDatabase u objeto API (servingWeightGrams opcional).
 * @returns {number} gramos (> 0)
 */
export function getSmartDefaultWeight(food) {
  if (!food || typeof food !== 'object') return 100;
  const w = Number(food.weight);
  if (Number.isFinite(w) && w > 0) return w;
  const s = Number(food.servingWeightGrams ?? food.serving_size_g);
  if (Number.isFinite(s) && s > 0) return s;
  return 100;
}

/**
 * Gramos en los que están expresados los macros del ítem (cal/prot/carb/fat del catálogo).
 * Por convención FitTracker: los valores del catálogo son siempre por 100 g.
 * El campo `weight` / `servingWeightGrams` solo define la porción sugerida en la UI, no la base nutricional.
 * Excepción: si un ítem declara explícitamente `macroReferenceGrams` (p. ej. bebida por 250 ml).
 * @param {object} food
 * @param {string} [_categoryName] reservado por compatibilidad
 * @returns {number} gramos de referencia (> 0)
 */
export function inferMacroReferenceGrams(food, _categoryName) {
  if (!food || typeof food !== 'object') return 100;
  if (Number.isFinite(food.macroReferenceGrams) && food.macroReferenceGrams > 0) {
    return food.macroReferenceGrams;
  }
  return 100;
}

/**
 * Factor lineal para escalar macros: gramos consumidos / gramos de referencia nutricional.
 */
export function macroScaleFactor(food, consumedGrams, categoryName) {
  const g = Math.max(0, Number(consumedGrams) || 0);
  const ref = inferMacroReferenceGrams(food, categoryName);
  return ref > 0 ? g / ref : 0;
}
