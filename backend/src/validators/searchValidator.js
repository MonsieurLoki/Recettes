/**
 * searchValidator.js — Validation des paramètres de recherche de recettes
 *
 * Ce module valide les paramètres de la requête GET /api/recipes avant toute
 * interrogation de la base de données. Il constitue la première ligne de
 * défense contre les saisies malformées ou dangereuses dans les champs de
 * recherche.
 *
 * Pourquoi valider avant d'interroger la DB ?
 *  - Les caractères de contrôle (U+0000–U+001F) peuvent produire des
 *    comportements imprévisibles dans les requêtes SQL ou dans les logs.
 *    Les rejeter tôt évite tout traitement inutile.
 *  - Limiter la longueur des termes de recherche à 100 caractères prévient
 *    les abus (requêtes excessivement longues).
 *  - La validation centralisée ici garantit que les routes restent lisibles
 *    et que la logique de validation n'est pas dupliquée.
 *
 * Requirements couverts : 7.1 (longueur ≤ 100 car.), 7.8 (rejet caractères
 * de contrôle), 11.1 (prepared statements dans les routes qui utilisent ces
 * params), 11.5 (commentaires pédagogiques)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Longueur maximale autorisée pour les termes de recherche `name` et
 * `ingredient` (Requirement 7.1).
 */
const MAX_SEARCH_TERM_LENGTH = 100;

/**
 * Expression régulière détectant les caractères de contrôle Unicode dans la
 * plage U+0000–U+001F (Requirement 7.8).
 *
 * Ces caractères sont invisibles et n'ont aucune place dans un terme de
 * recherche légitme. Leur présence est symptomatique d'une saisie anormale
 * (copier-coller de données binaires, tentative d'injection).
 *
 * La plage \x00-\x1F correspond exactement aux 32 premiers points de code
 * Unicode (C0 controls) qui incluent NULL, tabulation horizontale, retour
 * chariot, saut de ligne, etc.
 */
const CONTROL_CHAR_REGEX = /[\x00-\x1F]/;

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions utilitaires internes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valide un terme de recherche textuel (champ `name` ou `ingredient`).
 *
 * Règles appliquées :
 *  1. Si la valeur est absente (undefined) ou chaîne vide après trim,
 *     elle est ignorée (les champs de recherche sont tous optionnels).
 *  2. La longueur ne doit pas dépasser MAX_SEARCH_TERM_LENGTH (Req. 7.1).
 *  3. La valeur ne doit pas contenir de caractères de contrôle U+0000–U+001F
 *     (Req. 7.8).
 *
 * @param {string|undefined} value - La valeur du paramètre de requête.
 * @param {string} fieldName - Nom du champ (pour le message d'erreur).
 * @returns {{ error: string }|null} Un objet erreur si invalide, null sinon.
 */
function validateSearchTerm(value, fieldName) {
  // Champ absent ou vide → accepté (la recherche n'est pas filtrée sur ce critère)
  if (value === undefined || value === null) return null;

  const str = String(value);

  // Vérification de la longueur maximale (Requirement 7.1)
  if (str.length > MAX_SEARCH_TERM_LENGTH) {
    return {
      error: `Le champ "${fieldName}" ne peut pas dépasser ${MAX_SEARCH_TERM_LENGTH} caractères (reçu : ${str.length} caractères).`,
    };
  }

  // Vérification de l'absence de caractères de contrôle (Requirement 7.8).
  // On teste sur la chaîne AVANT trim afin de détecter également les
  // caractères de contrôle en début ou en fin de chaîne.
  if (CONTROL_CHAR_REGEX.test(str)) {
    return {
      error: `Le champ "${fieldName}" contient des caractères non autorisés (caractères de contrôle U+0000–U+001F).`,
    };
  }

  return null;
}

/**
 * Valide le paramètre de pagination `page`.
 *
 * Règles appliquées :
 *  - Si absent, la valeur par défaut (1) est utilisée → pas d'erreur.
 *  - Doit être un entier ≥ 1.
 *
 * @param {string|undefined} value - La valeur brute du paramètre `page`.
 * @returns {{ error: string }|null} Un objet erreur si invalide, null sinon.
 */
function validatePage(value) {
  if (value === undefined || value === null) return null;

  const num = Number(value);

  // Number('') vaut 0, Number('abc') vaut NaN — les deux sont rejetés.
  if (!Number.isInteger(num) || num < 1) {
    return {
      error: 'Le paramètre "page" doit être un entier supérieur ou égal à 1.',
    };
  }

  return null;
}

/**
 * Valide le paramètre de pagination `limit`.
 *
 * Règles appliquées :
 *  - Si absent, la valeur par défaut (20) est utilisée → pas d'erreur.
 *  - Doit être un entier compris entre 1 et 100 inclus.
 *
 * @param {string|undefined} value - La valeur brute du paramètre `limit`.
 * @returns {{ error: string }|null} Un objet erreur si invalide, null sinon.
 */
function validateLimit(value) {
  if (value === undefined || value === null) return null;

  const num = Number(value);

  if (!Number.isInteger(num) || num < 1 || num > 100) {
    return {
      error: 'Le paramètre "limit" doit être un entier entre 1 et 100.',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateSearchParams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valide l'ensemble des paramètres de requête pour GET /api/recipes.
 *
 * Paramètres attendus dans `query` :
 *  - `name`       {string} (optionnel) — terme de recherche par nom de recette,
 *                 ≤ 100 car., sans caractères de contrôle (Req. 7.1, 7.8)
 *  - `ingredient` {string} (optionnel) — terme de recherche par ingrédient,
 *                 ≤ 100 car., sans caractères de contrôle (Req. 7.1, 7.8)
 *  - `categories` {string} (optionnel) — IDs de catégories séparés par virgule,
 *                 ex. "1,3" ; non validé ici (la route filtre les IDs invalides)
 *  - `page`       {string} (optionnel) — numéro de page, entier ≥ 1
 *  - `limit`      {string} (optionnel) — résultats par page, entier 1–100
 *
 * @param {object} query - L'objet `req.query` d'Express, contenant les
 *                         paramètres de la query string sous forme de chaînes.
 * @returns {{ valid: true }|{ valid: false, errors: object }}
 *   - `{ valid: true }` si tous les paramètres sont valides.
 *   - `{ valid: false, errors: { [champ]: message } }` si au moins un
 *     paramètre est invalide, avec un message explicite par champ concerné.
 *
 * @example
 * validateSearchParams({ name: 'tarte', page: '2', limit: '10' })
 * // → { valid: true }
 *
 * @example
 * validateSearchParams({ name: 'x'.repeat(101) })
 * // → { valid: false, errors: { name: 'Le champ "name" ne peut pas dépasser...' } }
 *
 * @example
 * validateSearchParams({ ingredient: 'sucre\x00' })
 * // → { valid: false, errors: { ingredient: 'Le champ "ingredient" contient...' } }
 */
function validateSearchParams(query) {
  const errors = {};

  // ── Validation du terme de recherche par nom (Req. 7.1, 7.8) ───────────────
  const nameError = validateSearchTerm(query.name, 'name');
  if (nameError) errors.name = nameError.error;

  // ── Validation du terme de recherche par ingrédient (Req. 7.1, 7.8) ────────
  const ingredientError = validateSearchTerm(query.ingredient, 'ingredient');
  if (ingredientError) errors.ingredient = ingredientError.error;

  // ── Validation de la pagination ─────────────────────────────────────────────
  // `categories` n'est pas validé ici : la route l'analysera et ignorera les
  // IDs non numériques, ce qui est un comportement tolérant suffisant.
  const pageError = validatePage(query.page);
  if (pageError) errors.page = pageError.error;

  const limitError = validateLimit(query.limit);
  if (limitError) errors.limit = limitError.error;

  // ── Résultat ────────────────────────────────────────────────────────────────
  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { validateSearchParams };
