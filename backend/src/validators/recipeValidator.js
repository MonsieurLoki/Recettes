/**
 * validators/recipeValidator.js
 *
 * Validation des données de recette avant toute écriture en base.
 *
 * Rôle :
 *   Vérifier que chaque champ soumis par le client respecte les règles
 *   métier définies dans les requirements. En cas d'échec, les erreurs
 *   sont collectées et retournées sous une forme structurée pour que le
 *   frontend puisse les afficher inline sous chaque champ invalide.
 *
 * Paramètres communs :
 *   @param {object} body  - Corps de la requête (req.body)
 *   @param {object} db    - Instance better-sqlite3 (connexion partagée)
 *
 * Valeur de retour :
 *   { valid: true }
 *   ou
 *   { valid: false, errors: { champ: "message d'erreur" } }
 *
 * Toutes les requêtes DB utilisent des prepared statements (?) pour prévenir
 * toute injection SQL — jamais de concaténation de données utilisateur.
 * (Requirement 11.1)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de validation
// ─────────────────────────────────────────────────────────────────────────────

/** Longueur maximale du nom d'une recette (Requirement 5.2) */
const MAX_NAME_LENGTH = 200;

/** Nombre minimum et maximum d'ingrédients (Requirement 5.2) */
const MIN_INGREDIENTS = 1;
const MAX_INGREDIENTS = 50;

/** Longueur maximale des instructions (Requirement 5.2) */
const MAX_INSTRUCTIONS_LENGTH = 10000;

/** Nombre maximum de catégories associées à une recette (Requirement 5.2) */
const MAX_CATEGORIES = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions de validation internes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valide le champ `name` d'une recette.
 *
 * Règles :
 *  - Non vide (après trim) (Requirement 5.2)
 *  - ≤ 200 caractères (Requirement 5.2)
 *  - Unique en base, insensible à la casse (Requirement 5.7)
 *
 * Le paramètre `excludeId` permet d'exclure la recette courante du check
 * d'unicité lors d'une mise à jour (on ne veut pas se bloquer soi-même).
 *
 * @param {string}      name       - Valeur soumise pour le nom
 * @param {object}      db         - Instance better-sqlite3
 * @param {number|null} excludeId  - ID de la recette à exclure (null en création)
 * @returns {string|null} Message d'erreur, ou null si valide
 */
function validateName(name, db, excludeId = null) {
  // Requirement 5.2 — le nom ne peut pas être vide ou composé uniquement d'espaces
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Le nom ne peut pas être vide.';
  }

  // Requirement 5.2 — le nom ne doit pas dépasser 200 caractères
  if (name.trim().length > MAX_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_NAME_LENGTH} caractères.`;
  }

  // Requirement 5.7 — unicité insensible à la casse
  // La colonne `name` est déclarée COLLATE NOCASE dans SQLite, ce qui rend
  // la comparaison automatiquement insensible à la casse côté base.
  // On utilise un prepared statement avec ? pour éviter toute injection SQL.
  let row;
  if (excludeId !== null) {
    // Mise à jour : on exclut la recette en cours de modification pour ne pas
    // lui reprocher d'avoir son propre nom.
    const stmt = db.prepare(
      'SELECT id FROM recipes WHERE name = ? AND id != ?'
    );
    row = stmt.get(name.trim(), excludeId);
  } else {
    // Création : aucune recette ne doit avoir ce nom
    const stmt = db.prepare('SELECT id FROM recipes WHERE name = ?');
    row = stmt.get(name.trim());
  }

  if (row) {
    return 'Une recette avec ce nom existe déjà.';
  }

  return null; // valide
}

/**
 * Valide le tableau d'ingrédients soumis avec la recette.
 *
 * Règles :
 *  - Doit être un tableau (Requirement 5.2)
 *  - Contient entre 1 et 50 éléments (Requirement 5.2)
 *  - Chaque ingrédient possède au moins un champ `name` non vide
 *
 * @param {Array} ingredients - Tableau d'ingrédients soumis
 * @returns {string|null} Message d'erreur, ou null si valide
 */
function validateIngredients(ingredients) {
  // Requirement 5.2 — les ingrédients doivent être fournis sous forme de tableau
  if (!Array.isArray(ingredients)) {
    return 'Les ingrédients doivent être fournis sous forme de liste.';
  }

  // Requirement 5.2 — au moins 1 ingrédient requis
  if (ingredients.length < MIN_INGREDIENTS) {
    return `La recette doit contenir au moins ${MIN_INGREDIENTS} ingrédient.`;
  }

  // Requirement 5.2 — maximum 50 ingrédients
  if (ingredients.length > MAX_INGREDIENTS) {
    return `La recette ne peut pas contenir plus de ${MAX_INGREDIENTS} ingrédients.`;
  }

  // Chaque ingrédient doit avoir un nom non vide
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    if (!ing || typeof ing.name !== 'string' || ing.name.trim().length === 0) {
      return `L'ingrédient à la position ${i + 1} doit avoir un nom.`;
    }
  }

  return null; // valide
}

/**
 * Valide le champ `instructions` d'une recette.
 *
 * Règles :
 *  - Non vides (après trim) (Requirement 5.2)
 *  - ≤ 10 000 caractères (Requirement 5.2)
 *
 * @param {string} instructions - Texte des instructions soumis
 * @returns {string|null} Message d'erreur, ou null si valide
 */
function validateInstructions(instructions) {
  // Requirement 5.2 — les instructions ne peuvent pas être vides
  if (typeof instructions !== 'string' || instructions.trim().length === 0) {
    return 'Les instructions ne peuvent pas être vides.';
  }

  // Requirement 5.2 — les instructions ne doivent pas dépasser 10 000 caractères
  if (instructions.trim().length > MAX_INSTRUCTIONS_LENGTH) {
    return `Les instructions ne peuvent pas dépasser ${MAX_INSTRUCTIONS_LENGTH} caractères.`;
  }

  return null; // valide
}

/**
 * Valide le tableau d'IDs de catégories soumis avec la recette.
 *
 * Règles :
 *  - Doit être un tableau (ou absent, auquel cas on accepte 0 catégorie)
 *  - Maximum 10 catégories (Requirement 5.2)
 *  - Chaque élément doit être un entier positif (Requirement 5.2)
 *
 * @param {Array|undefined} categoryIds - Tableau d'IDs de catégories
 * @returns {string|null} Message d'erreur, ou null si valide
 */
function validateCategoryIds(categoryIds) {
  // Les catégories sont optionnelles (0 à 10 IDs) — un champ absent est valide
  if (categoryIds === undefined || categoryIds === null) {
    return null; // 0 catégorie est autorisé (Requirement 5.2)
  }

  if (!Array.isArray(categoryIds)) {
    return 'Les catégories doivent être fournies sous forme de liste d\'IDs.';
  }

  // Requirement 5.2 — maximum 10 catégories
  if (categoryIds.length > MAX_CATEGORIES) {
    return `Une recette ne peut pas avoir plus de ${MAX_CATEGORIES} catégories.`;
  }

  // Chaque ID doit être un entier positif
  for (const id of categoryIds) {
    if (!Number.isInteger(id) || id <= 0) {
      return 'Chaque ID de catégorie doit être un entier positif.';
    }
  }

  return null; // valide
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions exportées
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateCreateRecipe — valide le corps d'une requête POST /api/recipes.
 *
 * Vérifie :
 *  - name       : non vide, ≤ 200 car., unique insensible à la casse (Req. 5.2, 5.7)
 *  - ingredients: tableau de 1 à 50 entrées (Req. 5.2)
 *  - instructions: non vides, ≤ 10 000 car. (Req. 5.2)
 *  - category_ids: 0 à 10 IDs entiers (Req. 5.2)
 *
 * @param {object} body - Corps de la requête HTTP (req.body)
 * @param {object} db   - Instance better-sqlite3
 * @returns {{ valid: boolean, errors?: object }}
 */
function validateCreateRecipe(body, db) {
  const errors = {};

  // Validation du nom (Requirement 5.2, 5.7)
  const nameError = validateName(body.name, db, null);
  if (nameError) errors.name = nameError;

  // Validation des ingrédients (Requirement 5.2)
  const ingredientsError = validateIngredients(body.ingredients);
  if (ingredientsError) errors.ingredients = ingredientsError;

  // Validation des instructions (Requirement 5.2)
  const instructionsError = validateInstructions(body.instructions);
  if (instructionsError) errors.instructions = instructionsError;

  // Validation des catégories (Requirement 5.2)
  const categoryIdsError = validateCategoryIds(body.category_ids);
  if (categoryIdsError) errors.category_ids = categoryIdsError;

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * validateUpdateRecipe — valide le corps d'une requête PUT /api/recipes/:id.
 *
 * Identique à validateCreateRecipe, avec une seule différence :
 * le check d'unicité du nom exclut la recette courante (identifiée par `id`)
 * afin de permettre de re-soumettre une recette avec son propre nom sans erreur.
 *
 * (Requirement 5.2, 5.3, 5.7, 5.8, 11.1)
 *
 * @param {number} id   - ID de la recette en cours de modification
 * @param {object} body - Corps de la requête HTTP (req.body)
 * @param {object} db   - Instance better-sqlite3
 * @returns {{ valid: boolean, errors?: object }}
 */
function validateUpdateRecipe(id, body, db) {
  const errors = {};

  // Validation du nom avec exclusion de la recette courante (Requirement 5.7)
  // On passe `id` en troisième argument pour exclure cette recette du check
  // d'unicité — sans ça, mettre à jour une recette sans changer son nom
  // déclencherait une fausse erreur « nom déjà existant ».
  const nameError = validateName(body.name, db, id);
  if (nameError) errors.name = nameError;

  // Validation des ingrédients (Requirement 5.2)
  const ingredientsError = validateIngredients(body.ingredients);
  if (ingredientsError) errors.ingredients = ingredientsError;

  // Validation des instructions (Requirement 5.2)
  const instructionsError = validateInstructions(body.instructions);
  if (instructionsError) errors.instructions = instructionsError;

  // Validation des catégories (Requirement 5.2)
  const categoryIdsError = validateCategoryIds(body.category_ids);
  if (categoryIdsError) errors.category_ids = categoryIdsError;

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

module.exports = { validateCreateRecipe, validateUpdateRecipe };
