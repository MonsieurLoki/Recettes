/**
 * ocrNameExtractor.test.js
 *
 * Tests unitaires pour la fonction extractCandidateName.
 *
 * Requirement 3.1 : les 5 premiers mots non vides sont extraits, joints par
 *   un espace et tronques a 200 caracteres.
 * Requirement 3.2 : un texte vide ou sans mot retourne "".
 */

import { describe, it, expect } from 'vitest';
import { extractCandidateName } from '../../src/services/ocrNameExtractor.js';

describe('extractCandidateName', () => {
  // --- Requirement 3.1 -------------------------------------------------------

  it('retourne les 5 premiers mots quand le texte en contient plus de 5', () => {
    const result = extractCandidateName('un deux trois quatre cinq six sept');
    expect(result).toBe('un deux trois quatre cinq');
  });

  it('retourne les 5 premiers mots sur un texte multi-lignes', () => {
    const result = extractCandidateName(
      'Tarte aux pommes\nIngredients : farine sucre beurre'
    );
    expect(result).toBe('Tarte aux pommes Ingredients :');
  });

  it('retourne exactement 3 mots quand le texte n\'en contient que 3', () => {
    const result = extractCandidateName('Pain au chocolat');
    expect(result).toBe('Pain au chocolat');
  });

  it('retourne le seul mot present quand le texte n\'en contient qu\'un', () => {
    const result = extractCandidateName('Quiche');
    expect(result).toBe('Quiche');
  });

  it('ignore les espaces multiples entre les mots et prend les 5 premiers non vides', () => {
    const result = extractCandidateName('  un   deux   trois   quatre   cinq   six  ');
    expect(result).toBe('un deux trois quatre cinq');
  });

  it('ignore les tabulations et sauts de ligne et prend les 5 premiers non vides', () => {
    const result = extractCandidateName('\tmot1\nmot2\r\nmot3\t\tmot4   mot5   mot6');
    expect(result).toBe('mot1 mot2 mot3 mot4 mot5');
  });

  it('tronque a 200 caracteres quand les 5 premiers mots donnent une chaine trop longue', () => {
    // 5 mots de 45 caracteres chacun + 4 espaces = 229 caracteres => tronque a 200
    const longWord = 'a'.repeat(45);
    const text = Array(6).fill(longWord).join(' ');
    const result = extractCandidateName(text);
    expect(result.length).toBe(200);
  });

  it('ne tronque pas quand le resultat fait moins de 200 caracteres', () => {
    // 5 mots courts => pas de troncature
    const result = extractCandidateName('Gateau moelleux chocolat fondant rapide extra');
    expect(result).toBe('Gateau moelleux chocolat fondant rapide');
    expect(result.length).toBeLessThanOrEqual(200);
  });

  // --- Requirement 3.2 -------------------------------------------------------

  it('retourne "" pour une chaine vide', () => {
    expect(extractCandidateName('')).toBe('');
  });

  it('retourne "" pour une chaine composee uniquement d\'espaces', () => {
    expect(extractCandidateName('     ')).toBe('');
  });

  it('retourne "" pour une chaine composee uniquement de tabulations et sauts de ligne', () => {
    expect(extractCandidateName('\t\n\r\n  \t')).toBe('');
  });

  it('retourne "" pour null', () => {
    expect(extractCandidateName(null)).toBe('');
  });

  it('retourne "" pour undefined', () => {
    expect(extractCandidateName(undefined)).toBe('');
  });

  it('retourne "" pour un nombre (type non-string)', () => {
    // Req. 3.2 : tout type non-string est traité comme absent
    expect(extractCandidateName(42)).toBe('');
    expect(extractCandidateName(3.14)).toBe('');
  });

  it('conserve les accents et la ponctuation tels quels dans les mots — Req. 3.1', () => {
    // Les caractères spéciaux ne sont pas séparateurs et sont conservés intacts
    const result = extractCandidateName('Crème brûlée à l\'ancienne façon');
    expect(result).toBe('Crème brûlée à l\'ancienne façon');
  });

  it('conserve la ponctuation attachée à un mot — Req. 3.1', () => {
    // ':' attaché à 'Ingrédients' fait partie du token (pas un espace)
    const result = extractCandidateName('Tarte aux pommes Ingrédients : farine');
    expect(result).toBe('Tarte aux pommes Ingrédients :');
  });
});
