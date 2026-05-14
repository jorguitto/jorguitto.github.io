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
