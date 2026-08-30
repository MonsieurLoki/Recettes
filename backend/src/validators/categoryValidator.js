/**
 * categoryValidator.js
 *
 * Validateur pour les données de catégorie entrantes.
 *
 * Rôle : vérifier qu'une catégorie soumise par l'API respecte toutes les
 * règles métier avant tout accès à la base de données.
 *
 * Paramètres d'entrée : le corps de la requête (body) et une instance de la
 * base de données (db) pour le contrôle d'unicité.
 *
 * Valeur de retour :
 *   - { valid: true }                              si toutes les règles sont respectées
 *   - { valid: false, errors: { name: message } }  si une règle est violée
 *
 * Requirements couverts : 4.5, 4.6
 */

/**
 * Valide les données de création d'une catégorie.
 *
 * Règles appliquées (Requirement 4.5) :
 *  1. Le nom ne doit pas être vide (après trim)
 *  2. Le nom ne doit pas dépasser 100 caractères (après trim)
 *  3. Le nom ne doit pas être identique à une catégorie existante,
 *     en ignorant la casse ET les espaces de début/fin
 *
 * @param {object} body - Corps de la requête, attendu avec la propriété `name`.
 * @param {import('better-sqlite3').Database} db - Instance better-sqlite3 pour
 *   les requêtes d'unicité.
 * @returns {{ valid: true } | { valid: false, errors: { name: string } }}
 */
function validateCreateCategory(body, db) {
  const raw = body?.name;

  // Règle 1 : présence et non-vide du nom (Requirement 4.5)
  // On accepte seulement des chaînes ; un champ absent ou vide est rejeté.
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return {
      valid: false,
      errors: { name: 'Le nom de la catégorie ne peut pas être vide.' },
    };
  }

  const name = raw.trim();

  // Règle 2 : longueur maximale de 100 caractères (Requirement 4.5)
  if (name.length > 100) {
    return {
      valid: false,
      errors: { name: 'Le nom de la catégorie ne doit pas dépasser 100 caractères.' },
    };
  }

  // Règle 3 : unicité insensible à la casse et aux espaces de début/fin
  // (Requirement 4.5, 4.6)
  //
  // La colonne `name` est définie COLLATE NOCASE dans SQLite, ce qui rend
  // la comparaison insensible à la casse au niveau de la base.
  // On applique un `trim()` ici avant la requête pour neutraliser les espaces
  // de début/fin (SQLite NOCASE ne strip pas les espaces).
  //
  // On utilise un prepared statement avec `?` pour éviter toute injection SQL
  // (Requirement 11.1).
  const existing = db
    .prepare('SELECT id FROM categories WHERE TRIM(name) = TRIM(?) COLLATE NOCASE')
    .get(name);

  if (existing) {
    return {
      valid: false,
      errors: { name: 'Une catégorie avec ce nom existe déjà.' },
    };
  }

  return { valid: true };
}

module.exports = { validateCreateCategory };
