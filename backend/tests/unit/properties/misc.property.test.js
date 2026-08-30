/**
 * misc.property.test.js — Tests de propriétés (fast-check) divers
 *
 * Couvre les propriétés :
 *   Property 14 : Tout terme de recherche contenant un caractère U+0000–U+001F
 *                 est rejeté avant toute interrogation de la base de données
 *   Property 15 : Les instructions sont stockées et restituées sans modification
 *                 (invariant round-trip : n lignes en entrée → n lignes en sortie)
 *   Property 16 : Les logs de refus d'accès contiennent la date et l'adresse IP
 *                 mais ne contiennent jamais la valeur de la clé soumise
 *
 * Requirements couverts : 7.8, 8.1, 10.4
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { createRequire } from 'module';
import { describe, it, vi } from 'vitest';
import fc from 'fast-check';

const _require = createRequire(import.meta.url);

const request     = _require('supertest');
const app         = _require('../../../src/app.js');
const { validateSearchParams } = _require('../../../src/validators/searchValidator.js');

const VALID_API_KEY = 'test-api-key-32-characters-long!!';

// ═════════════════════════════════════════════════════════════════════════════
// Property 14 : Les termes de recherche contenant des caractères de contrôle
//               sont rejetés avant interrogation DB
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 14: control characters in search terms are rejected by validateSearchParams', () => {
  // Arbitraire : un caractère de contrôle unique dans la plage U+0000–U+001F
  const controlCharArb = fc
    .integer({ min: 0x0000, max: 0x001f })
    .map((code) => String.fromCharCode(code));

  // Arbitraire : chaîne ASCII propre (lettres/chiffres) pour le préfixe/suffixe
  const cleanStringArb = fc.stringMatching(/^[a-zA-Z0-9 ]{0,20}$/);

  it('Validates: Requirements 7.8 — tout terme name contenant un caractère U+0000–U+001F est rejeté', () => {
    // Feature: recipe-management-mvp, Property 14: control characters in search terms are rejected before DB query
    fc.assert(
      fc.property(
        cleanStringArb,
        controlCharArb,
        cleanStringArb,
        (prefix, controlChar, suffix) => {
          const term = prefix + controlChar + suffix;
          const result = validateSearchParams({ name: term });
          return result.valid === false && result.errors != null && 'name' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 7.8 — tout terme ingredient contenant un caractère U+0000–U+001F est rejeté', () => {
    // Feature: recipe-management-mvp, Property 14: control characters in search terms are rejected before DB query
    fc.assert(
      fc.property(
        cleanStringArb,
        controlCharArb,
        cleanStringArb,
        (prefix, controlChar, suffix) => {
          const term = prefix + controlChar + suffix;
          const result = validateSearchParams({ ingredient: term });
          return result.valid === false && result.errors != null && 'ingredient' in result.errors;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Validates: Requirements 7.8 — le caractère de contrôle seul dans name est également rejeté', () => {
    // Feature: recipe-management-mvp, Property 14: control characters in search terms are rejected before DB query
    // Cas dégénéré : le terme est uniquement constitué du caractère de contrôle
    fc.assert(
      fc.property(
        controlCharArb,
        (controlChar) => {
          const result = validateSearchParams({ name: controlChar });
          return result.valid === false && result.errors != null && 'name' in result.errors;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 15 : Les instructions sont stockées et restituées sans modification
//               (round-trip invariant via POST → GET)
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 15: instructions are stored and returned unmodified (round-trip)', () => {
  // Arbitraire : ligne de texte simple (lettres, chiffres, espaces, ponctuation
  // courante) qui ne perturbe pas le JSON ni le SQL.
  // On exige que la chaîne ne commence pas et ne finisse pas par un espace,
  // car sanitizeText applique trim() au stockage — un espace de début/fin
  // ne passerait pas le round-trip.
  const safeLineArb = fc
    .stringMatching(/^[a-zA-Z0-9 éèêëàâùûüôîï,.'()-]{1,50}$/)
    .filter((s) => s.trim().length > 0)
    .filter((s) => s === s.trim());

  // Arbitraire : 1 à 5 lignes jointes par \n
  const instructionsArb = fc
    .array(safeLineArb, { minLength: 1, maxLength: 5 })
    .map((lines) => lines.join('\n'));

  // Compteur pour garantir l'unicité du nom de recette entre les runs
  let runIndex = 0;

  it('Validates: Requirements 8.1 — les instructions sont restituées identiquement après création', async () => {
    // Feature: recipe-management-mvp, Property 15: instructions are stored and returned unmodified
    await fc.assert(
      fc.asyncProperty(instructionsArb, async (instructions) => {
        runIndex += 1;
        const uniqueName = `Recette Prop15 ${Date.now()}-${runIndex}`;

        // POST : créer la recette avec les instructions générées
        const postRes = await request(app)
          .post('/api/recipes')
          .set('X-API-Key', VALID_API_KEY)
          .send({
            name: uniqueName,
            instructions,
            ingredients: [{ name: 'Sel', quantity: '1', unit: 'pincée' }],
            category_ids: [],
          });

        if (postRes.status !== 201) return false;

        const recipeId = postRes.body.id;

        // GET : récupérer la recette et vérifier les instructions
        const getRes = await request(app)
          .get(`/api/recipes/${recipeId}`)
          .set('X-API-Key', VALID_API_KEY);

        if (getRes.status !== 200) return false;

        // Invariant : les instructions retournées sont identiques à celles soumises
        return getRes.body.instructions === instructions;
      }),
      { numRuns: 10 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 16 : Les logs de refus contiennent IP et date mais pas la clé soumise
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 16: auth refusal logs contain IP and date but never the submitted key value', () => {
  // Pattern ISO 8601 simplifié : au moins une date/heure de la forme YYYY-MM-DD
  const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}/;

  it('Validates: Requirements 10.4 — le log de refus contient une date ISO et "IP" mais pas la clé soumise', async () => {
    // Feature: recipe-management-mvp, Property 16: auth refusal logs contain IP/date but not the submitted key value
    await fc.assert(
      fc.asyncProperty(
        // Générer des clés incorrectes distinctes de la clé valide et
        // suffisamment longues pour être détectables dans le log si elles
        // venaient à y apparaître par erreur.
        fc
          .string({ minLength: 8, maxLength: 50 })
          .filter((s) => s !== VALID_API_KEY)
          // Exclure les chaînes qui contiendraient par coïncidence un motif de date,
          // ce qui rendrait le test non-déterministe sur la vérification du contenu.
          .filter((s) => !ISO_DATE_PATTERN.test(s))
          // Exclure les chaînes qui contiennent "IP" pour éviter les faux positifs.
          .filter((s) => !s.includes('IP')),
        async (wrongKey) => {
          const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

          try {
            const res = await request(app)
              .get('/api/recipes')
              .set('X-API-Key', wrongKey);

            // La requête doit être refusée (401)
            if (res.status !== 401) return false;

            // console.warn doit avoir été appelé au moins une fois
            if (warnSpy.mock.calls.length === 0) return false;

            // Récupérer tous les messages loggués (les convertir en string)
            const loggedMessages = warnSpy.mock.calls
              .map((args) => args.map(String).join(' '));

            // Au moins un message doit contenir une date ISO et "IP"
            const hasDateAndIp = loggedMessages.some(
              (msg) => ISO_DATE_PATTERN.test(msg) && msg.includes('IP')
            );
            if (!hasDateAndIp) return false;

            // Aucun message ne doit contenir la valeur de la clé soumise
            const leaksKey = loggedMessages.some((msg) => msg.includes(wrongKey));
            if (leaksKey) return false;

            return true;
          } finally {
            warnSpy.mockRestore();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Validates: Requirements 10.4 — le log de refus sans clé contient date et IP', async () => {
    // Feature: recipe-management-mvp, Property 16: auth refusal logs contain IP/date but not the submitted key value
    // Cas : aucune clé fournie (header absent)
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
          const res = await request(app).get('/api/recipes');

          if (res.status !== 401) return false;
          if (warnSpy.mock.calls.length === 0) return false;

          const loggedMessages = warnSpy.mock.calls
            .map((args) => args.map(String).join(' '));

          // Le log doit contenir une date ISO et "IP"
          return loggedMessages.some(
            (msg) => ISO_DATE_PATTERN.test(msg) && msg.includes('IP')
          );
        } finally {
          warnSpy.mockRestore();
        }
      }),
      { numRuns: 10 }
    );
  });
});
