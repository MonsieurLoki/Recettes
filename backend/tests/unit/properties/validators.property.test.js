/**
 * validators.property.test.js — Tests de propriétés (fast-check) pour les validateurs
 *
 * Couvre les propriétés universelles des validateurs d'entrée :
 *   Property 1 : tout texte whitespace-only est toujours rejeté
 *   Property 2 : tout texte dépassant la limite du champ est toujours rejeté
 *   Property 3 : tout texte contenant {{, <% ou <script est toujours rejeté
 *
 * Requirements couverts : 2.3, 2.4, 2.5, 2.6, 3.5, 3.6, 4.5, 5.2, 7.1
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

import { validateCreateRecipe } from '../../../src/validators/recipeValidator.js';
import { validateCreateCategory } from '../../../src/validators/categoryValidator.js';
import { validateSearchParams } from '../../../src/validators/searchValidator.js';
import { sanitizeOcrText } from '../../../src/utils/sanitize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Setup DB en mémoire
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationSql = readFileSync(
  join(__dirname, '../../../src/db/migrations/001_initial.sql'),
  'utf8'
);

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(migrationSql);
  return db;
}

// Helper : corps de recette valide avec surcharges
function makeRecipeBody(overrides = {}) {
  return {
    name: 'Tarte aux pommes',
    instructions: 'Préchauffer le four à 180°C.',
    ingredients: [{ name: 'Pomme', quantity: '4', unit: 'pièces' }],
    category_ids: [],
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Property 1 : Whitespace-only text is always rejected by validators
// ═════════════════════════════════════════════════════════════════════════════

// Feature: recipe-management-mvp, Property 1: whitespace-only text is always rejected by validators

describe('Property 1: whitespace-only text is always rejected', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('Validates: Requirements 5.2 — nom de recette whitespace-only est rejeté', () => {
    // Feature: recipe-management-mvp, Property 1: whitespace-only text is always rejected by validators
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s]*$/),
        (whitespaceOnly) => {
          const result = validateCreateRecipe(
            makeRecipeBody({ name: whitespaceOnly }),
            db
          );
          return result.valid === false && result.errors && 'name' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 5.2 — instructions whitespace-only sont rejetées', () => {
    // Feature: recipe-management-mvp, Property 1: whitespace-only text is always rejected by validators
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s]*$/),
        (whitespaceOnly) => {
          const result = validateCreateRecipe(
            makeRecipeBody({ instructions: whitespaceOnly }),
            db
          );
          return result.valid === false && result.errors && 'instructions' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 4.5 — nom de catégorie whitespace-only est rejeté', () => {
    // Feature: recipe-management-mvp, Property 1: whitespace-only text is always rejected by validators
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s]*$/),
        (whitespaceOnly) => {
          const result = validateCreateCategory({ name: whitespaceOnly }, db);
          return result.valid === false && result.errors && 'name' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 2 : Text exceeding field length limit is always rejected
// ═════════════════════════════════════════════════════════════════════════════

// Feature: recipe-management-mvp, Property 2: text exceeding field length limit is always rejected

describe('Property 2: text exceeding field length limit is always rejected', () => {
  const RECIPE_NAME_LIMIT = 200;
  const RECIPE_INSTRUCTIONS_LIMIT = 10000;
  const CATEGORY_NAME_LIMIT = 100;
  const SEARCH_TERM_LIMIT = 100;

  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  it('Validates: Requirements 5.2 — nom de recette > 200 caractères est rejeté', () => {
    // Feature: recipe-management-mvp, Property 2: text exceeding field length limit is always rejected
    // On génère des chaînes composées uniquement de 'a' pour éviter que trim()
    // réduise la longueur sous la limite.
    // fc.string() with minLength alone could be shrunk to whitespace, so we use
    // fc.array + map pour garantir une chaîne non-whitespace de longueur suffisante.
    fc.assert(
      fc.property(
        fc.integer({ min: RECIPE_NAME_LIMIT + 1, max: RECIPE_NAME_LIMIT + 50 })
          .map(len => 'a'.repeat(len)),
        (longName) => {
          const result = validateCreateRecipe(
            makeRecipeBody({ name: longName }),
            db
          );
          return result.valid === false && result.errors && 'name' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 5.2 — instructions > 10 000 caractères sont rejetées', () => {
    // Feature: recipe-management-mvp, Property 2: text exceeding field length limit is always rejected
    fc.assert(
      fc.property(
        fc.integer({ min: RECIPE_INSTRUCTIONS_LIMIT + 1, max: RECIPE_INSTRUCTIONS_LIMIT + 50 })
          .map(len => 'a'.repeat(len)),
        (longInstructions) => {
          const result = validateCreateRecipe(
            makeRecipeBody({ instructions: longInstructions }),
            db
          );
          return result.valid === false && result.errors && 'instructions' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 4.5 — nom de catégorie > 100 caractères est rejeté', () => {
    // Feature: recipe-management-mvp, Property 2: text exceeding field length limit is always rejected
    fc.assert(
      fc.property(
        fc.integer({ min: CATEGORY_NAME_LIMIT + 1, max: CATEGORY_NAME_LIMIT + 50 })
          .map(len => 'a'.repeat(len)),
        (longName) => {
          const result = validateCreateCategory({ name: longName }, db);
          return result.valid === false && result.errors && 'name' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 7.1 — terme de recherche (name) > 100 caractères est rejeté', () => {
    // Feature: recipe-management-mvp, Property 2: text exceeding field length limit is always rejected
    fc.assert(
      fc.property(
        fc.integer({ min: SEARCH_TERM_LIMIT + 1, max: SEARCH_TERM_LIMIT + 50 })
          .map(len => 'a'.repeat(len)),
        (longTerm) => {
          const result = validateSearchParams({ name: longTerm });
          return result.valid === false && result.errors && 'name' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 3 : Template injection sequences are always rejected
// ═════════════════════════════════════════════════════════════════════════════

// Feature: recipe-management-mvp, Property 3: template injection sequences are always rejected

describe('Property 3: template injection sequences are always rejected by sanitizeOcrText', () => {
  it('Validates: Requirements 2.6 — tout texte contenant {{ lève une erreur', () => {
    // Feature: recipe-management-mvp, Property 3: template injection sequences are always rejected
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (prefix, suffix) => {
          const input = prefix + '{{' + suffix;
          try {
            sanitizeOcrText(input);
            return false; // devait lever une erreur
          } catch (err) {
            return err instanceof Error;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 2.6 — tout texte contenant <% lève une erreur', () => {
    // Feature: recipe-management-mvp, Property 3: template injection sequences are always rejected
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (prefix, suffix) => {
          const input = prefix + '<%' + suffix;
          try {
            sanitizeOcrText(input);
            return false; // devait lever une erreur
          } catch (err) {
            return err instanceof Error;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 2.6 — tout texte contenant <script (insensible à la casse) lève une erreur', () => {
    // Feature: recipe-management-mvp, Property 3: template injection sequences are always rejected
    // La vérification est insensible à la casse : <SCRIPT, <Script, <sCrIpT
    // sont tous rejetés.
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        // Générer des variantes de casse pour '<script'
        fc.constantFrom('<script', '<SCRIPT', '<Script', '<sCrIpT'),
        (prefix, suffix, scriptTag) => {
          const input = prefix + scriptTag + suffix;
          try {
            sanitizeOcrText(input);
            return false; // devait lever une erreur
          } catch (err) {
            return err instanceof Error;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
