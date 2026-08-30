/**
 * auth.property.test.js — Tests de propriétés (fast-check) pour le middleware auth
 *
 * Couvre la propriété universelle de l'authentification par clé API :
 *   Property 9 : Pour toute requête sans clé ou avec clé incorrecte,
 *                la réponse est HTTP 401 et ne contient pas de données applicatives
 *
 * Sub-properties :
 *   9a — Toute requête sans en-tête X-API-Key retourne 401
 *   9b — Toute requête avec une clé incorrecte (≠ clé valide) retourne 401
 *   9c — Le corps de la réponse 401 ne contient jamais de données applicatives
 *
 * Requirements couverts : 10.2
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 *
 * Note sur le rate-limiting :
 *   L'application applique un rate-limit de 100 req/15 min par IP. Pour ne pas
 *   déclencher ce limiteur pendant les tests (qui multiplieraient les requêtes),
 *   chaque propriété utilise numRuns: 30, et les 3 sous-propriétés partagent
 *   le même endpoint GET /api/categories (endpoint le moins coûteux) afin de
 *   rester sous le seuil de 100 requêtes par exécution de suite.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Imports — pattern createRequire pour les modules CJS depuis un contexte ESM
// ─────────────────────────────────────────────────────────────────────────────
// Vitest exécute ce fichier en mode ESM (import/export), mais l'application
// est entièrement en CommonJS (require/module.exports). On utilise createRequire
// pour importer les modules CJS sans que la résolution ESM n'interfère.
import { createRequire } from 'module';
import { describe, it } from 'vitest';
import fc from 'fast-check';

const _require = createRequire(import.meta.url);

// supertest doit être chargé via require pour obtenir sa version CJS correcte.
// L'import ESM de supertest retourne parfois un objet wrapper plutôt que la
// fonction directement appelable.
const request = _require('supertest');

// app.js est CommonJS ; vitest.config.js a déjà défini DB_PATH=':memory:' et
// API_KEY='test-api-key-32-characters-long!!' via test.env avant ce chargement.
const app = _require('../../../src/app.js');

// La clé valide est injectée par vitest.config.js via test.env.
const VALID_API_KEY = 'test-api-key-32-characters-long!!';

// ─────────────────────────────────────────────────────────────────────────────
// Property 9a : Toute requête sans X-API-Key retourne HTTP 401
// ─────────────────────────────────────────────────────────────────────────────

// Feature: recipe-management-mvp, Property 9: requests without API key always return 401

describe('Property 9a: toute requête sans X-API-Key retourne 401', () => {
  it('Validates: Requirements 10.2 — GET /api/categories sans clé → 401', async () => {
    // Feature: recipe-management-mvp, Property 9a: requests without X-API-Key return 401
    // On utilise GET /api/categories car c'est le endpoint le moins coûteux
    // (pas de DB write, pas d'OCR). numRuns: 30 pour rester sous le rate-limit.
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // pas de clé
        async () => {
          const res = await request(app).get('/api/categories');
          return res.status === 401;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Validates: Requirements 10.2 — GET /api/recipes sans clé → 401', async () => {
    // Feature: recipe-management-mvp, Property 9a: requests without X-API-Key return 401
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/api/recipes');
          return res.status === 401;
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 9b : Toute requête avec une clé incorrecte retourne HTTP 401
// ─────────────────────────────────────────────────────────────────────────────

// Feature: recipe-management-mvp, Property 9: requests with wrong API key always return 401

describe('Property 9b: toute requête avec une clé incorrecte retourne 401', () => {
  it('Validates: Requirements 10.2 — clé incorrecte sur GET /api/categories → 401', async () => {
    // Feature: recipe-management-mvp, Property 9b: requests with wrong API key return 401
    // On génère des chaînes dont la longueur est ≥ 1 et ≠ la vraie clé.
    // fc.string() avec filter exclut la vraie clé pour éviter un faux positif.
    // On utilise fc.string({ minLength: 1, maxLength: 200 }) pour éviter des
    // chaînes vides qui correspondraient au cas "clé absente" (Property 9a),
    // déjà couvert séparément.
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s !== VALID_API_KEY),
        async (wrongKey) => {
          const res = await request(app)
            .get('/api/categories')
            .set('X-API-Key', wrongKey);
          return res.status === 401;
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 9c : Le corps de la réponse 401 ne contient jamais de données applicatives
// ─────────────────────────────────────────────────────────────────────────────

// Feature: recipe-management-mvp, Property 9: 401 response body never contains application data

describe('Property 9c: le corps de la réponse 401 ne contient pas de données applicatives', () => {
  it('Validates: Requirements 10.2 — réponse 401 sans clé ne contient que { error }', async () => {
    // Feature: recipe-management-mvp, Property 9c: 401 response body never contains application data
    // Le corps doit être { error: '...' } uniquement — jamais de tableaux, d'id,
    // de name correspondant à des données applicatives, ni d'objet data imbriqué.
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/api/categories');

          // La réponse doit être 401
          if (res.status !== 401) return false;

          const body = res.body;
          // Doit avoir un champ error de type string
          if (!body || typeof body.error !== 'string') return false;
          // Ne doit contenir aucune donnée applicative au niveau racine
          if (Array.isArray(body))            return false;
          if (Array.isArray(body.data))       return false;
          if (typeof body.id === 'number')    return false;
          if (Array.isArray(body.categories)) return false;
          if (Array.isArray(body.recipes))    return false;

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Validates: Requirements 10.2 — réponse 401 avec clé incorrecte ne contient que { error }', async () => {
    // Feature: recipe-management-mvp, Property 9c: 401 response body never contains application data
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s !== VALID_API_KEY),
        async (wrongKey) => {
          const res = await request(app)
            .get('/api/categories')
            .set('X-API-Key', wrongKey);

          if (res.status !== 401) return false;

          const body = res.body;
          if (!body || typeof body.error !== 'string') return false;
          if (Array.isArray(body))            return false;
          if (Array.isArray(body.data))       return false;
          if (typeof body.id === 'number')    return false;
          if (Array.isArray(body.categories)) return false;
          if (Array.isArray(body.recipes))    return false;

          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});
