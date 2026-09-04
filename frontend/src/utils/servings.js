/**
 * utils/servings.js — Utilitaire de recalcul des quantités d'ingrédients
 *
 * Expose une fonction pure `scaleQuantity` qui ajuste une quantité
 * proportionnellement au changement de portions.
 */

/**
 * scaleQuantity — Recalcule une quantité en fonction du ratio de portions.
 *
 * Si la quantité est un nombre décimal positif, elle est multipliée par
 * le ratio (targetServings / originalServings) et arrondie à 2 décimales.
 * Sinon (texte libre comme "à goût", "une pincée"), elle est retournée
 * sans modification.
 *
 * @param {string|null|undefined} qty             - Quantité originale
 * @param {number}                originalServings - Portions de la recette
 * @param {number}                targetServings   - Portions souhaitées
 * @returns {string|null|undefined} Quantité ajustée
 */
export function scaleQuantity(qty, originalServings, targetServings) {
  if (qty == null) return qty
  const n = parseFloat(qty)
  if (!isNaN(n) && n > 0 && isFinite(n)) {
    const scaled = (n * targetServings) / originalServings
    return String(Math.round(scaled * 100) / 100)
  }
  return qty
}

/**
 * formatTime — Formate une durée en minutes en chaîne lisible.
 *
 * @param {number|null} minutes - Durée en minutes
 * @returns {string} Ex : "45 min", "1h 30min", ""
 */
export function formatTime(minutes) {
  if (!minutes || minutes <= 0) return ''
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}
