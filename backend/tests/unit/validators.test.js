/**
 * validators.test.js — Tests unitaires des validateurs d'entrée
 *
 * Couvre tous les cas documentés dans la Testing Strategy du design :
 *
 *   recipeValidator   : nom vide, nom trop long, doublon casse, ingrédients
 *                       hors limites, instructions vides/trop longues,
 *                       catégories hors limite
 *   categoryValidator : nom vide, doublon avec espaces différents
 *   searchValidator   : terme de recherche avec caractère de contrôle
 *   photoValidator    : fichier non JPEG/PNG, fichier > 10 Mo, image < 640×480 px
 *
 * Les validateurs qui accèdent à la base de données (recipeValidator,
 * categoryValidator) reçoivent une instance SQLite en mémoire (:memory:)
 * initialisée avec la migration 001_initial.sql avant chaque groupe de tests.
 *
 * Le validateur photoValidator appelle sharp() pour lire les métadonnées d'image.
 * On utilise la bibliothèque sharp elle-même pour créer de vrais fichiers image
 * temporaires en mémoire (buffers JPEG/PNG), ce qui évite tout problème de mock
 * CJS/ESM et teste le chemin de code réel.
 *
 * Requirements couverts : 1.4, 1.5, 1.6, 2.3, 2.5, 2.6, 3.5, 3.6, 4.5, 5.2,
 *                         7.8, 11.4
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';
import sharpLib from 'sharp';

// ─── Résolution du chemin de la migration depuis ce fichier de test ────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_PATH = join(__dirname, '../../src/db/migrations/001_initial.sql');

// ─── Chemin vers les validateurs ───────────────────────────────────────────────
import { validateCreateRecipe, validateUpdateRecipe } from '../../src/validators/recipeValidator.js';
import { validateCreateCategory } from '../../src/validators/categoryValidator.js';
import { validateSearchParams } from '../../src/validators/searchValidator.js';
import { validatePhotoFile } from '../../src/validators/photoValidator.js';
import { sanitizeOcrText } from '../../src/utils/sanitize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Gestion des fichiers temporaires créés pour les tests photoValidator
// ─────────────────────────────────────────────────────────────────────────────

/** Liste des fichiers temporaires créés lors des tests — nettoyés après la suite */
const tmpFiles = [];

/**
 * Crée un fichier image temporaire avec les dimensions données.
 * Utilise sharp pour générer un vrai JPEG ou PNG valide.
 *
 * @param {{ width: number, height: number, format?: 'jpeg'|'png' }} opts
 * @returns {Promise<string>} Chemin absolu du fichier temporaire créé
 */
async function createTmpImage({ width, height, format = 'jpeg' }) {
  const buf = await sharpLib({
    create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    [format]()
    .toBuffer();

  const tmpPath = join(os.tmpdir(), `test_${width}x${height}_${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`);
  writeFileSync(tmpPath, buf);
  tmpFiles.push(tmpPath);
  return tmpPath;
}

afterAll(() => {
  // Supprimer tous les fichiers temporaires créés pendant les tests
  for (const f of tmpFiles) {
    if (existsSync(f)) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper : créer une DB SQLite en mémoire avec le schéma de migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée une instance SQLite en mémoire et exécute la migration initiale.
 * Retourne l'instance prête à l'emploi.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createTestDb() {
  const db = new Database(':memory:');
  // Activer les contraintes de clé étrangère (nécessaire pour ON DELETE CASCADE)
  db.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  db.exec(sql);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper : construire un corps de requête de recette valide
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne un objet `body` minimal valide pour validateCreateRecipe.
 *
 * @param {object} overrides - Propriétés à surcharger
 * @returns {object}
 */
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
// recipeValidator — Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('recipeValidator', () => {
  /** Instance DB réinitialisée avant chaque test pour l'isolation */
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── Nom de recette ──────────────────────────────────────────────────────────

  describe('Nom de recette', () => {
    it('devrait rejeter un nom vide — Req. 3.5, 5.2', () => {
      // Cas : nom vide → rejeté
      const result = validateCreateRecipe(makeRecipeBody({ name: '' }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('name');
    });

    it('devrait rejeter un nom composé uniquement d\'espaces — Req. 3.5, 5.2', () => {
      // Cas : whitespace-only → rejeté (le trim() produit une chaîne vide)
      const result = validateCreateRecipe(makeRecipeBody({ name: '   ' }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('name');
    });

    it('devrait rejeter un nom de 201 caractères — Req. 3.5, 3.6, 5.2', () => {
      // Cas : nom trop long (limite = 200 car.)
      const longName = 'a'.repeat(201);
      const result = validateCreateRecipe(makeRecipeBody({ name: longName }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('name');
    });

    it('devrait accepter un nom de 200 caractères exactement — Req. 5.2', () => {
      // Valeur limite : 200 car. → accepté
      const name200 = 'a'.repeat(200);
      const result = validateCreateRecipe(makeRecipeBody({ name: name200 }), db);
      expect(result.valid).toBe(true);
    });

    it('devrait accepter un nom de recette unique — Req. 5.7', () => {
      // Cas nominal : nouveau nom non présent en DB
      const result = validateCreateRecipe(makeRecipeBody({ name: 'Soupe à l\'oignon' }), db);
      expect(result.valid).toBe(true);
    });

    it('devrait rejeter un nom dupliqué avec une casse différente — Req. 5.7', () => {
      // Insertion d'une recette existante puis tentative de doublon (casse diff.)
      db.prepare(
        "INSERT INTO recipes (name, instructions) VALUES (?, ?)"
      ).run('Tarte aux pommes', 'Instructions de base.');

      // 'tarte aux pommes' est un doublon de 'Tarte aux pommes' (COLLATE NOCASE)
      const result = validateCreateRecipe(
        makeRecipeBody({ name: 'tarte aux pommes' }),
        db
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('name');
    });

    it('devrait rejeter un nom dupliqué à la casse identique — Req. 5.7', () => {
      db.prepare(
        "INSERT INTO recipes (name, instructions) VALUES (?, ?)"
      ).run('Crêpes', 'Mélanger les ingrédients.');

      const result = validateCreateRecipe(makeRecipeBody({ name: 'Crêpes' }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('name');
    });

    it('devrait accepter le même nom lors d\'une mise à jour de la même recette — Req. 5.7', () => {
      // validateUpdateRecipe doit exclure la recette courante du check d'unicité
      const info = db.prepare(
        "INSERT INTO recipes (name, instructions) VALUES (?, ?)"
      ).run('Quiche Lorraine', 'Battre les œufs.');

      const result = validateUpdateRecipe(
        info.lastInsertRowid,
        makeRecipeBody({ name: 'Quiche Lorraine' }),
        db
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Ingrédients ─────────────────────────────────────────────────────────────

  describe('Ingrédients', () => {
    it('devrait rejeter une liste vide (0 ingrédient) — Req. 5.2', () => {
      // Cas : tableau vide → rejeté (minimum 1 ingrédient requis)
      const result = validateCreateRecipe(makeRecipeBody({ ingredients: [] }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('ingredients');
    });

    it('devrait rejeter une liste de 51 ingrédients (> 50) — Req. 5.2', () => {
      // Cas : plus de 50 ingrédients → rejeté
      const ingredients = Array.from({ length: 51 }, (_, i) => ({
        name: `Ingrédient ${i + 1}`,
        quantity: '1',
        unit: 'g',
      }));
      const result = validateCreateRecipe(makeRecipeBody({ ingredients }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('ingredients');
    });

    it('devrait accepter exactement 50 ingrédients — Req. 5.2', () => {
      // Valeur limite : 50 ingrédients → accepté
      const ingredients = Array.from({ length: 50 }, (_, i) => ({
        name: `Ingrédient ${i + 1}`,
      }));
      const result = validateCreateRecipe(makeRecipeBody({ ingredients }), db);
      expect(result.valid).toBe(true);
    });

    it('devrait rejeter si un ingrédient a un nom vide — Req. 5.2', () => {
      const ingredients = [{ name: '' }];
      const result = validateCreateRecipe(makeRecipeBody({ ingredients }), db);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('ingredients');
    });
  });

  // ── Instructions ─────────────────────────────────────────────────────────────

  describe('Instructions', () => {
    it('devrait rejeter des instructions vides — Req. 5.2', () => {
      // Cas : instructions vides → rejeté
      const result = validateCreateRecipe(
        makeRecipeBody({ instructions: '' }),
        db
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('instructions');
    });

    it('devrait rejeter des instructions de 10 001 caractères — Req. 5.2', () => {
      // Cas : instructions trop longues (limite = 10 000 car.)
      const longInstructions = 'a'.repeat(10001);
      const result = validateCreateRecipe(
        makeRecipeBody({ instructions: longInstructions }),
        db
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('instructions');
    });

    it('devrait accepter des instructions de 10 000 caractères exactement — Req. 5.2', () => {
      const instructions10k = 'a'.repeat(10000);
      const result = validateCreateRecipe(
        makeRecipeBody({ instructions: instructions10k }),
        db
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Catégories ──────────────────────────────────────────────────────────────

  describe('Catégories', () => {
    it('devrait rejeter plus de 10 catégories — Req. 5.2', () => {
      // Cas : 11 catégories → rejeté (maximum = 10)
      const category_ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const result = validateCreateRecipe(
        makeRecipeBody({ category_ids }),
        db
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveProperty('category_ids');
    });

    it('devrait accepter exactement 10 catégories — Req. 5.2', () => {
      // Valeur limite : 10 IDs → accepté
      const category_ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = validateCreateRecipe(
        makeRecipeBody({ category_ids }),
        db
      );
      expect(result.valid).toBe(true);
    });

    it('devrait accepter une liste vide de catégories (0 catégorie) — Req. 5.2', () => {
      // Les catégories sont optionnelles ; 0 est autorisé
      const result = validateCreateRecipe(makeRecipeBody({ category_ids: [] }), db);
      expect(result.valid).toBe(true);
    });

    it('devrait accepter l\'absence du champ category_ids — Req. 5.2', () => {
      const body = {
        name: 'Salade niçoise',
        instructions: 'Mélanger tous les ingrédients.',
        ingredients: [{ name: 'Tomate' }],
        // category_ids absent intentionnellement
      };
      const result = validateCreateRecipe(body, db);
      expect(result.valid).toBe(true);
    });
  });

  // ── Cas nominal complet ────────────────────────────────────────────────────

  it('devrait accepter un corps de recette entièrement valide — Req. 5.1, 5.2', () => {
    const result = validateCreateRecipe(
      makeRecipeBody({
        name: 'Blanquette de veau',
        instructions: 'Faire revenir la viande puis ajouter les légumes.',
        ingredients: [
          { name: 'Veau', quantity: '500', unit: 'g' },
          { name: 'Carotte', quantity: '2', unit: 'pièces' },
        ],
        category_ids: [2], // Plat principal
      }),
      db
    );
    expect(result.valid).toBe(true);
  });

  // ── Erreurs multiples ───────────────────────────────────────────────────────

  it('devrait collecter plusieurs erreurs simultanément — Req. 5.2, 5.3', () => {
    // Un corps complètement invalide doit retourner des erreurs sur chaque champ
    const result = validateCreateRecipe(
      {
        name: '',
        instructions: '',
        ingredients: [],
        category_ids: Array.from({ length: 11 }, (_, i) => i + 1),
      },
      db
    );
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThan(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// sanitizeOcrText — Validation du texte OCR (Req. 2.3, 2.4, 2.5, 2.6)
// ═════════════════════════════════════════════════════════════════════════════
//
// Le texte OCR est validé/sanitisé via sanitizeOcrText avant stockage.
// Cette fonction lève une Error pour les séquences interdites et retourne ""
// pour un texte null/vide (null n'est pas une entrée utilisateur valide —
// côté route, un texte vide/null déclenche un rejet HTTP 400).
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeOcrText (validation du texte OCR)', () => {
  it('devrait lever une erreur pour un texte OCR contenant {{ — Req. 2.6', () => {
    // Cas : séquence de template Mustache/Vue → rejeté (Error)
    expect(() => sanitizeOcrText('{{ recette }}')).toThrow(
      /séquences non autorisées/i
    );
  });

  it('devrait lever une erreur pour un texte OCR contenant <% — Req. 2.6', () => {
    // Cas : séquence de template EJS/ERB → rejeté (Error)
    expect(() => sanitizeOcrText('<% include header %>')).toThrow(
      /séquences non autorisées/i
    );
  });

  it('devrait lever une erreur pour un texte OCR contenant <script — Req. 2.6', () => {
    // Cas : balise JavaScript inline → rejeté (Error)
    expect(() => sanitizeOcrText('<script>alert(1)</script>')).toThrow(
      /séquences non autorisées/i
    );
  });

  it('devrait retourner une chaîne vide pour un texte OCR null (absent) — Req. 2.3, 2.4', () => {
    // sanitizeOcrText retourne "" pour null/undefined ; la route rejette
    // ensuite avec 400 si le résultat est vide (texte OCR obligatoire)
    expect(sanitizeOcrText(null)).toBe('');
    expect(sanitizeOcrText(undefined)).toBe('');
    expect(sanitizeOcrText('')).toBe('');
  });

  it('devrait lever une erreur pour un texte OCR de 50 001 caractères contenant <script — Req. 2.5', () => {
    // Req. 2.5 : limite à 50 000 car. — un texte trop long avec injection est rejeté.
    // La validation de longueur est portée par le validateur de route (recipeValidator
    // ou la route photos) ; sanitizeOcrText rejette d'abord les séquences dangereuses.
    // On vérifie ici que la séquence interdite est bien détectée même dans un grand texte.
    const longText = 'a'.repeat(50001) + '<script>alert(1)</script>';
    expect(() => sanitizeOcrText(longText)).toThrow(/séquences non autorisées/i);
  });

  it('devrait accepter un texte OCR valide de recette — Req. 2.3', () => {
    // Cas nominal : texte OCR sans séquences interdites → accepté
    const ocrText = 'Tarte aux pommes\nIngrédients : pommes, sucre, farine';
    expect(() => sanitizeOcrText(ocrText)).not.toThrow();
    expect(sanitizeOcrText(ocrText)).toContain('Tarte aux pommes');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// categoryValidator — Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('categoryValidator', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    // La migration insère déjà 8 catégories par défaut (Entrée, Plat principal…)
  });

  it('devrait rejeter un nom de catégorie vide — Req. 4.5', () => {
    // Cas : nom vide → rejeté
    const result = validateCreateCategory({ name: '' }, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter un nom composé uniquement d\'espaces — Req. 4.5', () => {
    const result = validateCreateCategory({ name: '   ' }, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter un nom de catégorie de 101 caractères — Req. 4.5', () => {
    // Cas : nom trop long (limite = 100 car.)
    const result = validateCreateCategory({ name: 'a'.repeat(101) }, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait accepter un nom de catégorie de 100 caractères exactement — Req. 4.5', () => {
    const result = validateCreateCategory({ name: 'a'.repeat(100) }, db);
    expect(result.valid).toBe(true);
  });

  it('devrait accepter une nouvelle catégorie avec un nom valide et unique — Req. 4.5', () => {
    const result = validateCreateCategory({ name: 'Apéritif' }, db);
    expect(result.valid).toBe(true);
  });

  it('devrait rejeter un doublon avec des espaces de début/fin différents — Req. 4.5', () => {
    // Cas : doublon avec espaces — '  Dessert  ' ≡ 'Dessert' (déjà en DB)
    // Les espaces de début/fin sont normalisés via TRIM() avant comparaison.
    const result = validateCreateCategory({ name: '  Dessert  ' }, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter un doublon insensible à la casse — Req. 4.5', () => {
    // 'entrée' est un doublon de 'Entrée' (catégorie par défaut en DB)
    const result = validateCreateCategory({ name: 'entrée' }, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter un doublon avec casse ET espaces différents — Req. 4.5', () => {
    // ' DESSERT ' est équivalent à 'Dessert' après TRIM() + COLLATE NOCASE
    const result = validateCreateCategory({ name: ' DESSERT ' }, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter si le champ name est absent — Req. 4.5', () => {
    const result = validateCreateCategory({}, db);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// searchValidator — Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('searchValidator', () => {
  it('devrait rejeter un terme de recherche name avec un caractère de contrôle — Req. 7.8', () => {
    // Cas : terme contenant U+0000 → rejeté avant interrogation DB
    const result = validateSearchParams({ name: 'tarte\x00pommes' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter un terme de recherche ingredient avec un caractère de contrôle — Req. 7.8', () => {
    // Cas : terme ingredient contenant U+001F (Unit Separator) → rejeté
    const result = validateSearchParams({ ingredient: 'farine\x1F' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('ingredient');
  });

  it('devrait rejeter un terme de recherche name de 101 caractères — Req. 7.1', () => {
    // Limite = 100 car. ; 101 → rejeté
    const result = validateSearchParams({ name: 'a'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('devrait rejeter un terme de recherche ingredient de 101 caractères — Req. 7.1', () => {
    const result = validateSearchParams({ ingredient: 'b'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('ingredient');
  });

  it('devrait accepter des paramètres de recherche vides — Req. 7.1', () => {
    // Tous les paramètres sont optionnels ; un objet vide est valide
    const result = validateSearchParams({});
    expect(result.valid).toBe(true);
  });

  it('devrait accepter un terme de recherche valide — Req. 7.1', () => {
    const result = validateSearchParams({ name: 'tarte', ingredient: 'pomme' });
    expect(result.valid).toBe(true);
  });

  it('devrait accepter un terme de recherche de 100 caractères exactement — Req. 7.1', () => {
    const result = validateSearchParams({ name: 'a'.repeat(100) });
    expect(result.valid).toBe(true);
  });

  it('devrait rejeter un paramètre page invalide — Req. 7.1', () => {
    const result = validateSearchParams({ page: '0' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('page');
  });

  it('devrait rejeter un paramètre limit invalide — Req. 7.1', () => {
    const result = validateSearchParams({ limit: '200' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('limit');
  });

  it('devrait rejeter un terme avec caractère de tabulation (U+0009) — Req. 7.8', () => {
    // U+0009 (tabulation) est dans la plage U+0000–U+001F → rejeté
    const result = validateSearchParams({ name: 'tarte\taux' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// photoValidator — Tests (vraies images créées avec sharp)
// ═════════════════════════════════════════════════════════════════════════════
//
// Pour éviter les problèmes de mock CJS/ESM, on utilise sharp directement pour
// créer de vrais fichiers JPEG/PNG temporaires. Cela teste le chemin de code
// réel, y compris la lecture des métadonnées par sharp dans photoValidator.js.
// ─────────────────────────────────────────────────────────────────────────────

describe('photoValidator', () => {

  // ── Format MIME ─────────────────────────────────────────────────────────────

  describe('Format MIME (Req. 1.4)', () => {
    it('devrait rejeter un fichier de type image/gif (non JPEG/PNG)', async () => {
      // Le format est rejeté avant même d'appeler sharp — pas besoin de vrai fichier
      const result = await validatePhotoFile({
        mimetype: 'image/gif',
        size: 1 * 1024 * 1024,
        path: '/nonexistent/file.gif',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/format/i);
    });

    it('devrait rejeter un fichier de type application/pdf', async () => {
      const result = await validatePhotoFile({
        mimetype: 'application/pdf',
        size: 1 * 1024 * 1024,
        path: '/nonexistent/file.pdf',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/format/i);
    });

    it('devrait rejeter un fichier de type image/webp', async () => {
      const result = await validatePhotoFile({
        mimetype: 'image/webp',
        size: 1 * 1024 * 1024,
        path: '/nonexistent/file.webp',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/format/i);
    });

    it('devrait accepter un fichier de type image/jpeg avec une vraie image JPEG valide', async () => {
      // Crée un vrai JPEG 640×480 valide en mémoire
      const path = await createTmpImage({ width: 640, height: 480, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(true);
    });

    it('devrait accepter un fichier de type image/png avec une vraie image PNG valide', async () => {
      // Crée un vrai PNG 640×480 valide en mémoire
      const path = await createTmpImage({ width: 640, height: 480, format: 'png' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/png', size: fileSize, path });
      expect(result.valid).toBe(true);
    });
  });

  // ── Taille fichier ──────────────────────────────────────────────────────────

  describe('Taille du fichier (Req. 1.5)', () => {
    it('devrait rejeter un fichier de 10,5 Mo (> 10 Mo)', async () => {
      // La vérification de taille est faite sur `file.size` avant d'appeler sharp
      // On peut passer n'importe quel chemin — la taille est rejetée avant
      const result = await validatePhotoFile({
        mimetype: 'image/jpeg',
        size: Math.round(10.5 * 1024 * 1024),
        path: '/nonexistent/big.jpg',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/taille/i);
    });

    it('devrait rejeter un fichier de 10 Mo + 1 octet', async () => {
      // Valeur juste au-dessus de la limite
      const result = await validatePhotoFile({
        mimetype: 'image/jpeg',
        size: 10 * 1024 * 1024 + 1,
        path: '/nonexistent/too-big.jpg',
      });
      expect(result.valid).toBe(false);
    });

    it('devrait accepter un fichier de 1 Mo avec une vraie image valide', async () => {
      // On utilise une vraie image — sa taille réelle sera petite (< 10 Mo)
      const path = await createTmpImage({ width: 800, height: 600, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      expect(fileSize).toBeLessThan(10 * 1024 * 1024);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(true);
    });
  });

  // ── Résolution image ────────────────────────────────────────────────────────

  describe('Résolution image (Req. 1.6)', () => {
    it('devrait rejeter une image de 639×480 px (largeur insuffisante)', async () => {
      // Crée un vrai JPEG 639×480 — résolution insuffisante en largeur
      const path = await createTmpImage({ width: 639, height: 480, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/résolution/i);
    });

    it('devrait rejeter une image de 640×479 px (hauteur insuffisante)', async () => {
      const path = await createTmpImage({ width: 640, height: 479, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/résolution/i);
    });

    it('devrait rejeter une image de 320×240 px', async () => {
      const path = await createTmpImage({ width: 320, height: 240, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/résolution/i);
    });

    it('devrait accepter une image de 640×480 px exactement', async () => {
      // Valeur minimale exacte → accepté
      const path = await createTmpImage({ width: 640, height: 480, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(true);
    });

    it('devrait accepter une image de 1920×1080 px', async () => {
      const path = await createTmpImage({ width: 1920, height: 1080, format: 'jpeg' });
      const { size: fileSize } = (await import('fs')).statSync(path);
      const result = await validatePhotoFile({ mimetype: 'image/jpeg', size: fileSize, path });
      expect(result.valid).toBe(true);
    });

    it('devrait rejeter si le chemin de fichier est invalide (fichier inexistant)', async () => {
      // sharp lèvera une erreur pour un chemin inexistant
      const result = await validatePhotoFile({
        mimetype: 'image/jpeg',
        size: 1024,
        path: '/nonexistent/corrupted.jpg',
      });
      expect(result.valid).toBe(false);
      // Peut retourner "non valide ou est corrompu" ou "résolution insuffisante"
      expect(result.error).toBeDefined();
    });
  });

  // ── Ordre de vérification ───────────────────────────────────────────────────

  it('devrait vérifier le format avant la taille (rejet MIME avant taille) — Req. 1.4, 1.5', async () => {
    // Un fichier gif de 20 Mo doit être rejeté pour le format, pas la taille
    const result = await validatePhotoFile({
      mimetype: 'image/gif',
      size: 20 * 1024 * 1024,
      path: '/nonexistent/big.gif',
    });
    expect(result.valid).toBe(false);
    // Le message doit concerner le format, pas la taille
    expect(result.error).toMatch(/format/i);
    expect(result.error).not.toMatch(/taille/i);
  });
});
