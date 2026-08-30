/**
 * ocrNameExtractor.property.test.js — Tests de propriétés (fast-check)
 * pour l'extraction du nom candidat OCR.
 *
 * Couvre la propriété universelle de extractCandidateName :
 *   Property 4 : Pour tout texte OCR avec ≥ 1 mot, le résultat contient au
 *     plus 5 mots et ≤ 200 caractères ; pour tout texte vide ou sans mot,
 *     retourne "".
 *
 * Requirements couverts : 3.1, 3.2
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { extractCandidateName } from '../../../src/services/ocrNameExtractor.js';

// ═════════════════════════════════════════════════════════════════════════════
// Property 4 : Extraction du nom candidat OCR
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 4: extractCandidateName — output invariants', () => {

  // Property 4a : Pour tout texte avec ≥ 1 mot, résultat ≤ 5 mots et ≤ 200 car.
  it('Validates: Requirements 3.1 — résultat contient au plus 5 mots et ≤ 200 caractères', () => {
    // Feature: recipe-management-mvp, Property 4: extractCandidateName returns ≤5 words and ≤200 chars for non-empty text
    fc.assert(
      fc.property(
        fc.string().filter(s => s.split(/\s+/).filter(Boolean).length >= 1),
        (text) => {
          const result = extractCandidateName(text);
          const words = result.split(/\s+/).filter(Boolean);
          return words.length <= 5 && result.length <= 200;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 4b : Pour tout texte avec ≥ 5 mots, le résultat contient exactement 5 mots
  // (avant troncature, i.e. quand la chaîne jointe fait ≤ 200 car.)
  it('Validates: Requirements 3.1 — résultat contient exactement 5 mots quand le texte en a ≥ 5 (hors troncature)', () => {
    // Feature: recipe-management-mvp, Property 4: extractCandidateName returns exactly 5 words when input has ≥5 words
    // On utilise des mots courts (max 10 car.) pour éviter que la troncature
    // à 200 caractères réduise le résultat sous 5 mots.
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[a-z]{1,10}$/),
          { minLength: 5, maxLength: 20 }
        ).map(words => words.join(' ')),
        (text) => {
          const result = extractCandidateName(text);
          const resultWords = result.split(/\s+/).filter(Boolean);
          return resultWords.length === 5;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 4c : Pour tout texte vide ou whitespace-only, retourne ""
  it('Validates: Requirements 3.2 — texte vide ou whitespace-only retourne ""', () => {
    // Feature: recipe-management-mvp, Property 4: extractCandidateName returns "" for empty/whitespace-only text
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s]*$/),
        (text) => extractCandidateName(text) === ''
      ),
      { numRuns: 100 }
    );
  });

  // Property 4d : Pour null, undefined et tout type non-string, retourne ""
  it('Validates: Requirements 3.2 — null, undefined et types non-string retournent ""', () => {
    // Feature: recipe-management-mvp, Property 4: extractCandidateName returns "" for non-string inputs
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, 0, [], {}),
        (input) => extractCandidateName(input) === ''
      ),
      { numRuns: 100 }
    );
  });

  // Property 4e : La longueur du résultat est toujours ≤ 200 caractères,
  // même pour des entrées avec des mots très longs.
  it('Validates: Requirements 3.1 — longueur du résultat toujours ≤ 200 caractères', () => {
    // Feature: recipe-management-mvp, Property 4: extractCandidateName result length is always ≤200 chars
    fc.assert(
      fc.property(
        // Chaînes potentiellement très longues sans espaces (un seul "mot")
        fc.string({ minLength: 0, maxLength: 500 }),
        (text) => {
          const result = extractCandidateName(text);
          return result.length <= 200;
        }
      ),
      { numRuns: 100 }
    );
  });

});
