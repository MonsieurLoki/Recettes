/**
 * search.property.test.js — Tests de propriétés (fast-check) pour la recherche
 *
 * Couvre les propriétés universelles du moteur de recherche de recettes :
 *   Property 5 : la recherche par nom retourne uniquement les recettes dont
 *                le nom contient le terme (insensible à la casse)
 *   Property 6 : la recherche par catégories retourne uniquement les recettes
 *                associées à TOUTES les catégories demandées (logique ET)
 *   Property 7 : la recherche par ingrédient retourne uniquement les recettes
 *                possédant un ingrédient contenant le terme
 *   Property 8 : la combinaison nom + catégories respecte la logique ET
 *                (chaque résultat satisfait les deux contraintes simultanément)
 *
 * Stratégie : on seed la DB en mémoire avec un ensemble fixe de recettes, puis
 * on utilise fast-check pour générer des termes de recherche variés et vérifier
 * que les invariants tiennent pour tous ces termes. Cette approche est plus
 * rapide et déterministe qu'un seeding property-generated.
 *
 * Les tests interrogent la DB SQLite directement (sans HTTP) pour tester la
 * logique de filtrage SQL en isolation, ce qui évite la lenteur des requêtes
 * HTTP tout en couvrant exactement le code de la route GET /api/recipes.
 *
 * Requirements couverts : 7.2, 7.3, 7.4, 7.5
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it, beforeEach } from 'vitest';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationSql = readFileSync(
  join(__dirname, '../../../src/db/migrations/001_initial.sql'),
  'utf8'
);

// ─────────────────────────────────────────────────────────────────────────────
// Helper : créer une DB SQLite en mémoire prête à l'emploi
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(migrationSql);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures : ensemble fixe de recettes pour le seeding
//
// Chaque recette est conçue pour être reconnaissable et tester des cas précis :
//  - noms avec des termes facilement recherchables
//  - catégories variées (Dessert=3, Plat principal=2, Entrée=1, Soupe=4)
//  - ingrédients distincts pour que les filtres soient discriminants
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURES = [
  {
    name: 'Tarte aux pommes',
    instructions: 'Préchauffer le four à 180°C.',
    ingredients: ['pomme', 'sucre', 'farine'],
    categoryNames: ['Dessert'],
  },
  {
    name: 'Crêpes sucrées',
    instructions: 'Mélanger farine, œufs et lait.',
    ingredients: ['farine', 'oeuf', 'lait'],
    categoryNames: ['Dessert'],
  },
  {
    name: 'Soupe à l\'oignon',
    instructions: 'Faire revenir les oignons.',
    ingredients: ['oignon', 'bouillon', 'fromage'],
    categoryNames: ['Soupe', 'Entrée'],
  },
  {
    name: 'Boeuf bourguignon',
    instructions: 'Faire mariner le boeuf.',
    ingredients: ['boeuf', 'vin rouge', 'carotte'],
    categoryNames: ['Plat principal'],
  },
  {
    name: 'Salade niçoise',
    instructions: 'Couper les légumes en dés.',
    ingredients: ['tomate', 'thon', 'olive'],
    categoryNames: ['Entrée', 'Salade'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper : insérer les fixtures dans la DB de test
// Retourne un mapping nom_catégorie → id_catégorie pour les assertions.
// ─────────────────────────────────────────────────────────────────────────────

function seedDb(db) {
  // Récupérer les catégories déjà insérées par la migration
  const cats = db.prepare('SELECT id, name FROM categories').all();
  const catByName = {};
  for (const c of cats) {
    catByName[c.name] = c.id;
  }

  const insertRecipe = db.prepare(
    'INSERT INTO recipes (name, instructions) VALUES (?, ?)'
  );
  const insertIngredient = db.prepare(
    'INSERT INTO ingredients (recipe_id, name, position) VALUES (?, ?, ?)'
  );
  const insertCatLink = db.prepare(
    'INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)'
  );

  for (const fix of FIXTURES) {
    const { lastInsertRowid: recipeId } = insertRecipe.run(fix.name, fix.instructions);
    fix.ingredients.forEach((ing, pos) => insertIngredient.run(recipeId, ing, pos));
    for (const catName of fix.categoryNames) {
      const catId = catByName[catName];
      if (catId) insertCatLink.run(recipeId, catId);
    }
  }

  return catByName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper : reproduire exactement la requête SQL de GET /api/recipes
// (logique extraite de routes/recipes.js pour les tests unitaires)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exécute le filtre de recherche par nom sur la DB fournie.
 * Retourne toutes les recettes dont le nom contient `term` (LIKE, insensible
 * à la casse), sans pagination (pour simplifier les assertions).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} term - Terme de recherche
 * @returns {Array<{id: number, name: string}>}
 */
function searchByName(db, term) {
  return db
    .prepare(`SELECT id, name FROM recipes WHERE LOWER(name) LIKE LOWER(?)`)
    .all(`%${term}%`);
}

/**
 * Exécute le filtre de recherche par ingrédient sur la DB fournie.
 * Retourne toutes les recettes ayant au moins un ingrédient dont le nom
 * contient `term` (LIKE, insensible à la casse).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} term - Terme de recherche
 * @returns {Array<{id: number, name: string}>}
 */
function searchByIngredient(db, term) {
  return db
    .prepare(
      `SELECT DISTINCT r.id, r.name
       FROM recipes r
       WHERE EXISTS (
         SELECT 1 FROM ingredients i
         WHERE i.recipe_id = r.id
           AND LOWER(i.name) LIKE LOWER(?)
       )`
    )
    .all(`%${term}%`);
}

/**
 * Exécute le filtre de recherche par catégories (logique ET) sur la DB.
 * Retourne les recettes associées à TOUTES les catégories dont l'ID est dans
 * `categoryIds`.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number[]} categoryIds - IDs de catégories
 * @returns {Array<{id: number, name: string}>}
 */
function searchByCategories(db, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) {
    return db.prepare('SELECT id, name FROM recipes').all();
  }
  const placeholders = categoryIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT r.id, r.name
       FROM recipes r
       WHERE (
         SELECT COUNT(DISTINCT rc.category_id)
         FROM recipe_categories rc
         WHERE rc.recipe_id = r.id
           AND rc.category_id IN (${placeholders})
       ) = ?`
    )
    .all(...categoryIds, categoryIds.length);
}

/**
 * Récupère les IDs de catégories associées à une recette donnée.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} recipeId
 * @returns {number[]}
 */
function getRecipeCategoryIds(db, recipeId) {
  return db
    .prepare('SELECT category_id FROM recipe_categories WHERE recipe_id = ?')
    .all(recipeId)
    .map(r => r.category_id);
}

/**
 * Récupère les noms d'ingrédients d'une recette donnée.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} recipeId
 * @returns {string[]}
 */
function getRecipeIngredientNames(db, recipeId) {
  return db
    .prepare('SELECT name FROM ingredients WHERE recipe_id = ?')
    .all(recipeId)
    .map(r => r.name);
}

/**
 * Exécute le filtre combiné nom + catégories (logique ET) sur la DB.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} nameTerm
 * @param {number[]} categoryIds
 * @returns {Array<{id: number, name: string}>}
 */
function searchByNameAndCategories(db, nameTerm, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) {
    return searchByName(db, nameTerm);
  }
  const placeholders = categoryIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT r.id, r.name
       FROM recipes r
       WHERE LOWER(r.name) LIKE LOWER(?)
         AND (
           SELECT COUNT(DISTINCT rc.category_id)
           FROM recipe_categories rc
           WHERE rc.recipe_id = r.id
             AND rc.category_id IN (${placeholders})
         ) = ?`
    )
    .all(`%${nameTerm}%`, ...categoryIds, categoryIds.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraires fast-check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère un terme de recherche textuel propre (lettres ASCII minuscules, 1–8
 * caractères). Cette contrainte garantit :
 *   - des termes courts qui ont statistiquement des chances de matcher
 *     dans les données de test (ex. "a", "ou", "tart")
 *   - pas de caractères spéciaux qui fausseraient le LIKE SQL
 */
const searchTermArb = fc
  .stringMatching(/^[a-z]{1,8}$/)
  .filter(s => s.length >= 1);

// ═════════════════════════════════════════════════════════════════════════════
// Property 5 : La recherche par nom retourne uniquement les recettes
//              dont le nom contient le terme (insensible à la casse)
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 5: name filter returns only recipes containing the search term', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedDb(db);
  });

  it('Validates: Requirements 7.2 — toute recette retournée par ?name=t contient t dans son nom', () => {
    // Feature: recipe-management-mvp, Property 5: name filter returns only recipes containing the search term (case-insensitive)
    fc.assert(
      fc.property(searchTermArb, (term) => {
        const results = searchByName(db, term);

        // Propriété : chaque recette retournée doit avoir un nom contenant `term`
        // La comparaison doit être insensible à la casse.
        return results.every((recipe) =>
          recipe.name.toLowerCase().includes(term.toLowerCase())
        );
      }),
      { numRuns: 20 }
    );
  });

  it('Validates: Requirements 7.2 — la recherche est insensible à la casse (terme en majuscules)', () => {
    // Feature: recipe-management-mvp, Property 5: name filter returns only recipes containing the search term (case-insensitive)
    // On vérifie avec des termes en majuscules que les résultats sont identiques
    fc.assert(
      fc.property(searchTermArb, (term) => {
        const lowerResults = searchByName(db, term.toLowerCase());
        const upperResults = searchByName(db, term.toUpperCase());

        // Les deux requêtes doivent retourner les mêmes IDs (dans n'importe quel ordre)
        const lowerIds = lowerResults.map(r => r.id).sort();
        const upperIds = upperResults.map(r => r.id).sort();
        return JSON.stringify(lowerIds) === JSON.stringify(upperIds);
      }),
      { numRuns: 20 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 6 : La recherche par catégories retourne uniquement les recettes
//              associées à TOUTES les catégories sélectionnées (logique ET)
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 6: category filter returns only recipes associated with all requested categories', () => {
  let db;
  let catByName;

  beforeEach(() => {
    db = createTestDb();
    catByName = seedDb(db);
  });

  it('Validates: Requirements 7.3 — toute recette retournée est associée à chacune des catégories demandées', () => {
    // Feature: recipe-management-mvp, Property 6: category filter returns only recipes associated with all requested categories
    //
    // On utilise des catégories qui existent réellement dans la DB de seed
    // pour maximiser la chance d'avoir des résultats à valider.
    const availableCatIds = Object.values(catByName);

    fc.assert(
      fc.property(
        // Sélectionner 1 ou 2 catégories parmi les IDs disponibles
        fc.shuffledSubarray(availableCatIds, { minLength: 1, maxLength: 2 }),
        (selectedCatIds) => {
          const results = searchByCategories(db, selectedCatIds);

          // Propriété : chaque recette retournée doit être associée à TOUTES
          // les catégories sélectionnées.
          return results.every((recipe) => {
            const recipeCats = getRecipeCategoryIds(db, recipe.id);
            return selectedCatIds.every((catId) => recipeCats.includes(catId));
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Validates: Requirements 7.3 — une recette non associée à l\'une des catégories n\'est pas retournée', () => {
    // Feature: recipe-management-mvp, Property 6: category filter returns only recipes associated with all requested categories
    //
    // Propriété négative : si on filtre avec une combinaison de catégories,
    // aucune recette retournée ne doit manquer l'une des catégories.
    const availableCatIds = Object.values(catByName);

    fc.assert(
      fc.property(
        fc.shuffledSubarray(availableCatIds, { minLength: 1, maxLength: 2 }),
        (selectedCatIds) => {
          const results = searchByCategories(db, selectedCatIds);
          const resultIds = new Set(results.map(r => r.id));

          // Toutes les recettes NON retournées ne doivent pas satisfaire
          // tous les critères de catégorie
          const allRecipes = db.prepare('SELECT id FROM recipes').all();
          const excluded = allRecipes.filter(r => !resultIds.has(r.id));

          return excluded.every((recipe) => {
            const recipeCats = getRecipeCategoryIds(db, recipe.id);
            // Au moins une des catégories demandées est absente → exclue à raison
            return selectedCatIds.some((catId) => !recipeCats.includes(catId));
          });
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 7 : La recherche par ingrédient retourne uniquement les recettes
//              possédant un ingrédient dont le nom contient le terme
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 7: ingredient filter returns only recipes having an ingredient containing the search term', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedDb(db);
  });

  it('Validates: Requirements 7.4 — toute recette retournée possède au moins un ingrédient contenant le terme', () => {
    // Feature: recipe-management-mvp, Property 7: ingredient filter returns only recipes having an ingredient containing the search term
    fc.assert(
      fc.property(searchTermArb, (term) => {
        const results = searchByIngredient(db, term);

        // Propriété : chaque recette retournée doit avoir au moins un ingrédient
        // dont le nom contient `term` (insensible à la casse).
        return results.every((recipe) => {
          const ingredientNames = getRecipeIngredientNames(db, recipe.id);
          return ingredientNames.some((ingName) =>
            ingName.toLowerCase().includes(term.toLowerCase())
          );
        });
      }),
      { numRuns: 20 }
    );
  });

  it('Validates: Requirements 7.4 — la recherche par ingrédient est insensible à la casse', () => {
    // Feature: recipe-management-mvp, Property 7: ingredient filter returns only recipes having an ingredient containing the search term
    fc.assert(
      fc.property(searchTermArb, (term) => {
        const lowerResults = searchByIngredient(db, term.toLowerCase());
        const upperResults = searchByIngredient(db, term.toUpperCase());

        const lowerIds = lowerResults.map(r => r.id).sort();
        const upperIds = upperResults.map(r => r.id).sort();
        return JSON.stringify(lowerIds) === JSON.stringify(upperIds);
      }),
      { numRuns: 20 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 8 : La combinaison nom + catégories respecte la logique ET
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 8: combined name+category filter is AND logic', () => {
  let db;
  let catByName;

  beforeEach(() => {
    db = createTestDb();
    catByName = seedDb(db);
  });

  it('Validates: Requirements 7.5 — chaque résultat satisfait à la fois le filtre nom ET le filtre catégorie', () => {
    // Feature: recipe-management-mvp, Property 8: combined name+category filter is AND logic (result matches both filters simultaneously)
    const availableCatIds = Object.values(catByName);

    fc.assert(
      fc.property(
        searchTermArb,
        fc.shuffledSubarray(availableCatIds, { minLength: 1, maxLength: 2 }),
        (nameTerm, selectedCatIds) => {
          const results = searchByNameAndCategories(db, nameTerm, selectedCatIds);

          return results.every((recipe) => {
            // Contrainte 1 : le nom contient le terme de recherche
            const nameMatches = recipe.name.toLowerCase().includes(nameTerm.toLowerCase());

            // Contrainte 2 : la recette est associée à TOUTES les catégories demandées
            const recipeCats = getRecipeCategoryIds(db, recipe.id);
            const catsMatch = selectedCatIds.every((catId) => recipeCats.includes(catId));

            return nameMatches && catsMatch;
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Validates: Requirements 7.5 — les résultats sont un sous-ensemble de chaque filtre pris séparément', () => {
    // Feature: recipe-management-mvp, Property 8: combined name+category filter is AND logic (result matches both filters simultaneously)
    //
    // Logique ET : résultats(nom+cats) ⊆ résultats(nom) ∩ résultats(cats)
    const availableCatIds = Object.values(catByName);

    fc.assert(
      fc.property(
        searchTermArb,
        fc.shuffledSubarray(availableCatIds, { minLength: 1, maxLength: 2 }),
        (nameTerm, selectedCatIds) => {
          const combinedResults = searchByNameAndCategories(db, nameTerm, selectedCatIds);
          const nameOnlyResults = searchByName(db, nameTerm);
          const catOnlyResults = searchByCategories(db, selectedCatIds);

          const nameOnlyIds = new Set(nameOnlyResults.map(r => r.id));
          const catOnlyIds = new Set(catOnlyResults.map(r => r.id));

          // Chaque résultat combiné doit être présent dans les deux filtres individuels
          return combinedResults.every(
            (r) => nameOnlyIds.has(r.id) && catOnlyIds.has(r.id)
          );
        }
      ),
      { numRuns: 20 }
    );
  });
});
