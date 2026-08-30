/**
 * tests/integration/photos.test.js
 *
 * Tests d'intégration pour le endpoint POST /api/photos.
 *
 * Stratégie :
 * - Base de données SQLite en mémoire (:memory:) pour l'isolation complète.
 *   → Configuré dans vitest.config.js via env.DB_PATH = ':memory:'
 * - ocrService.js mocké via require.cache patching (tests/setup/mockOcr.js)
 *   pour éviter tout appel à Google Cloud Vision.
 *   Le mock est exposé via globalThis.__mockExtractTextFromImage (vi.fn()).
 * - Les images de test sont de vrais buffers JPEG/PNG créés par sharp,
 *   ce qui permet de tester le chemin de validation réel (photoValidator + sharp).
 * - UPLOADS_DIR pointe vers os.tmpdir() via vitest.config.js env.
 *
 * Requirements couverts : 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 3.1
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';

// app chargé après le setup (mockOcr.js a patché require.cache avant cet import)
import app from '../../src/app.js';

// ─── Référence au mock OCR ────────────────────────────────────────────────────
// Exposé par tests/setup/mockOcr.js via globalThis.__mockExtractTextFromImage.
// C'est le même vi.fn() que photos.js utilise via son require('../services/ocrService').
/** @type {import('vitest').MockedFunction<any>} */
const mockOcr = globalThis.__mockExtractTextFromImage;

// ─── Constantes ───────────────────────────────────────────────────────────────
const VALID_API_KEY = 'test-api-key-32-characters-long!!';
// API_KEY injectée par vitest.config.js → auth.js la lit à l'import du module

// Texte OCR avec 5+ mots pour tester Req. 3.1
const VALID_OCR_TEXT = 'Tarte aux pommes Ingrédients farine sucre beurre';
const EXPECTED_NAME  = 'Tarte aux pommes Ingrédients farine'; // 5 premiers mots

// ─── Helper : créer une image de test ────────────────────────────────────────

/**
 * Crée un buffer JPEG ou PNG valide avec les dimensions données via sharp.
 *
 * @param {{ width: number, height: number, format?: 'jpeg'|'png' }} opts
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function createTestImage({ width, height, format = 'jpeg' }) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 180, b: 180 },
    },
  })
    [format]()
    .toBuffer();

  return {
    buffer,
    mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
  };
}

// Réinitialiser le mock entre les groupes de tests pour éviter les interférences.
afterEach(() => {
  mockOcr.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/photos — Tests d'intégration
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/photos', () => {

  // ── Authentification ────────────────────────────────────────────────────────

  describe('Authentification', () => {
    it('devrait retourner 401 sans X-API-Key — Req. 10.1', async () => {
      const res = await request(app)
        .post('/api/photos')
        .attach('photo', Buffer.from('fake'), { filename: 'test.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('devrait retourner 401 avec une clé API incorrecte — Req. 10.1', async () => {
      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', 'mauvaise-cle')
        .attach('photo', Buffer.from('fake'), { filename: 'test.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── Absence de fichier ──────────────────────────────────────────────────────

  describe('Absence de fichier', () => {
    it('devrait retourner 400 si aucun fichier n\'est envoyé — Req. 1.3', async () => {
      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── Format de fichier ───────────────────────────────────────────────────────

  describe('Format de fichier (Req. 1.4)', () => {
    it('devrait retourner 400 pour un fichier GIF (format non supporté)', async () => {
      // Le fileFilter Multer rejette les types non JPEG/PNG avant tout traitement
      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', Buffer.from('GIF89a'), { filename: 'test.gif', contentType: 'image/gif' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── Taille du fichier ───────────────────────────────────────────────────────

  describe('Taille du fichier (Req. 1.5)', () => {
    it('devrait retourner 400 pour un fichier > 10 Mo', async () => {
      // Buffer de 10 Mo + 1 octet déclaré comme JPEG.
      // Multer interrompt le flux dès que la limite fileSize est atteinte → 400.
      const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', oversizedBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── Résolution image ────────────────────────────────────────────────────────

  describe('Résolution image (Req. 1.6)', () => {
    it('devrait retourner 400 pour une image JPEG de 320×240 px (résolution insuffisante)', async () => {
      // Image réelle créée par sharp — photoValidator lit les vraies métadonnées
      const { buffer, mimeType } = await createTestImage({ width: 320, height: 240, format: 'jpeg' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'small.jpg', contentType: mimeType });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/résolution/i);
    });
  });

  // ── Upload JPEG valide → 201 ────────────────────────────────────────────────

  describe('Upload JPEG valide (Req. 1.3, 1.8, 3.1)', () => {
    beforeAll(() => {
      // Configurer le mock OCR pour retourner un texte avec 5+ mots
      mockOcr.mockResolvedValue(VALID_OCR_TEXT);
    });

    it('devrait retourner 201 avec recipe_id, ocr_text et suggested_name pour un JPEG valide', async () => {
      // Image JPEG 640×480 — dimensions minimales exactes (Req. 1.6)
      const { buffer, mimeType } = await createTestImage({ width: 640, height: 480, format: 'jpeg' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'recipe.jpg', contentType: mimeType });

      expect(res.status).toBe(201);
      // Req. 1.8 : recipe_id doit être un nombre entier
      expect(res.body).toHaveProperty('recipe_id');
      expect(typeof res.body.recipe_id).toBe('number');
      // Req. 1.8 : le texte OCR brut est retourné tel quel
      expect(res.body).toHaveProperty('ocr_text', VALID_OCR_TEXT);
      // Req. 3.1 : les 5 premiers mots non vides du texte OCR
      expect(res.body).toHaveProperty('suggested_name', EXPECTED_NAME);
    });

    it('devrait retourner 201 pour une image JPEG de résolution supérieure (1920×1080)', async () => {
      const { buffer, mimeType } = await createTestImage({ width: 1920, height: 1080, format: 'jpeg' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'hd.jpg', contentType: mimeType });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('recipe_id');
    });
  });

  // ── Upload PNG valide → 201 ─────────────────────────────────────────────────

  describe('Upload PNG valide (Req. 1.3, 1.8)', () => {
    beforeAll(() => {
      mockOcr.mockResolvedValue('Crêpes au beurre noisette');
    });

    it('devrait retourner 201 pour un PNG valide (640×480)', async () => {
      const { buffer, mimeType } = await createTestImage({ width: 640, height: 480, format: 'png' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'recipe.png', contentType: mimeType });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('recipe_id');
      expect(res.body).toHaveProperty('ocr_text', 'Crêpes au beurre noisette');
      // 4 mots seulement → tous inclus dans suggested_name
      expect(res.body).toHaveProperty('suggested_name', 'Crêpes au beurre noisette');
    });
  });

  // ── Timeout OCR → 502 ──────────────────────────────────────────────────────

  describe('Timeout OCR (Req. 1.9)', () => {
    it('devrait retourner 502 quand le service OCR simule un timeout', async () => {
      // Le mock OCR rejette avec une erreur de timeout (status 502)
      const timeoutError = new Error("Le service OCR n'a pas répondu dans le délai imparti (30 s).");
      timeoutError.status = 502;
      mockOcr.mockRejectedValue(timeoutError);

      const { buffer, mimeType } = await createTestImage({ width: 640, height: 480, format: 'jpeg' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'timeout.jpg', contentType: mimeType });

      expect(res.status).toBe(502);
      expect(res.body).toHaveProperty('error');
    });

    it('devrait retourner 502 quand le service OCR retourne une erreur générique', async () => {
      const ocrError = new Error("Le service d'extraction de texte a rencontré une erreur.");
      ocrError.status = 502;
      mockOcr.mockRejectedValue(ocrError);

      const { buffer, mimeType } = await createTestImage({ width: 640, height: 480, format: 'jpeg' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'error.jpg', contentType: mimeType });

      expect(res.status).toBe(502);
    });
  });

  // ── OCR texte vide → suggested_name vide ───────────────────────────────────

  describe('Texte OCR vide (Req. 3.1, 3.2)', () => {
    it('devrait retourner suggested_name vide ("") si l\'OCR ne détecte aucun texte', async () => {
      // Req. 3.2 : texte OCR sans mot → suggested_name = ""
      mockOcr.mockResolvedValue('');

      const { buffer, mimeType } = await createTestImage({ width: 640, height: 480, format: 'jpeg' });

      const res = await request(app)
        .post('/api/photos')
        .set('X-API-Key', VALID_API_KEY)
        .attach('photo', buffer, { filename: 'blank.jpg', contentType: mimeType });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('ocr_text', '');
      expect(res.body).toHaveProperty('suggested_name', '');
    });
  });
});
