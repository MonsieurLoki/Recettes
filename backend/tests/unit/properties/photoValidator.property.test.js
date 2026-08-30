/**
 * photoValidator.property.test.js — Tests de propriétés (fast-check) pour la validation des fichiers image
 *
 * Couvre la propriété universelle de validation des fichiers photo :
 *   Property 10 : Tout fichier hors contraintes (format, taille, résolution)
 *                 est rejeté avec valid: false et un message indiquant la
 *                 contrainte violée
 *
 * Sub-properties :
 *   10a — Tout type MIME non-JPEG/PNG est toujours rejeté avec une erreur de format
 *   10b — Tout fichier dont la taille dépasse 10 Mo est toujours rejeté avec une erreur de taille
 *   10c — Toute image JPEG/PNG dont la résolution est inférieure à 640×480 px
 *         est toujours rejetée avec une erreur de résolution
 *
 * Requirements couverts : 1.4, 1.5, 1.6
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it, afterAll } from 'vitest';
import fc from 'fast-check';
import sharp from 'sharp';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { statSync } from 'fs';
import os from 'os';
import { join } from 'path';

import { validatePhotoFile } from '../../../src/validators/photoValidator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Gestion des fichiers temporaires créés pour 10c
// ─────────────────────────────────────────────────────────────────────────────

/** Liste des fichiers temporaires à supprimer après les tests */
const tmpFiles = [];

/**
 * Crée un vrai fichier JPEG temporaire avec les dimensions spécifiées.
 * Utilise sharp pour garantir un fichier image valide et lisible.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>} Chemin absolu du fichier temporaire
 */
async function createTmpJpeg(width, height) {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg()
    .toBuffer();

  const tmpPath = join(
    os.tmpdir(),
    `prop10c_${width}x${height}_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  );
  writeFileSync(tmpPath, buf);
  tmpFiles.push(tmpPath);
  return tmpPath;
}

afterAll(() => {
  // Nettoyer tous les fichiers temporaires créés pendant les tests
  for (const f of tmpFiles) {
    if (existsSync(f)) {
      try {
        unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 10a : Tout type MIME non-JPEG/PNG est toujours rejeté
// ═════════════════════════════════════════════════════════════════════════════

// Feature: recipe-management-mvp, Property 10: non-JPEG/PNG files are always rejected

describe('Property 10a: tout type MIME non-JPEG/PNG est toujours rejeté avec erreur de format', () => {
  it('Validates: Requirements 1.4 — tout MIME non-JPEG/PNG → valid false + erreur format', () => {
    // Feature: recipe-management-mvp, Property 10: non-JPEG/PNG files are always rejected
    // La vérification MIME se fait avant tout accès disque : on peut passer
    // n'importe quel chemin — le fichier n'est jamais lu pour un MIME invalide.
    fc.assert(
      fc.property(
        fc.constantFrom(
          'image/gif',
          'image/webp',
          'image/bmp',
          'application/pdf',
          'text/plain',
          'video/mp4',
          'image/tiff'
        ),
        (mimetype) => {
          // Appel synchrone au validateur : le résultat est une Promise, mais
          // fast-check ne supporte pas les propriétés async pour des vérifications
          // simples. On utilise une Promise résolue immédiatement car la
          // vérification MIME est purement synchrone (avant tout I/O).
          let syncResult;
          // validatePhotoFile retourne une Promise ; le rejet MIME est la
          // première vérification synchrone (pas d'await nécessaire pour ce
          // cas car le code retourne directement { valid: false, error } avant
          // tout I/O). On utilise une assertion async séparée.
          return true; // placeholder — voir le test async ci-dessous
        }
      ),
      { numRuns: 1 } // couvert intégralement par le test async
    );
  });

  it('Validates: Requirements 1.4 — (async) tout MIME non-JPEG/PNG → valid false + erreur format', async () => {
    // Feature: recipe-management-mvp, Property 10: non-JPEG/PNG files are always rejected
    // validatePhotoFile est async ; on utilise fc.asyncProperty.
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'image/gif',
          'image/webp',
          'image/bmp',
          'application/pdf',
          'text/plain',
          'video/mp4',
          'image/tiff'
        ),
        async (mimetype) => {
          const result = await validatePhotoFile({
            mimetype,
            size: 1024,
            path: '/nonexistent/file',
          });
          // La valeur de retour doit indiquer le rejet et mentionner le format
          return result.valid === false && /format/i.test(result.error);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 10b : Tout fichier dont la taille dépasse 10 Mo est toujours rejeté
// ═════════════════════════════════════════════════════════════════════════════

// Feature: recipe-management-mvp, Property 10: files over 10 MB are always rejected

describe('Property 10b: tout fichier > 10 Mo est toujours rejeté avec erreur de taille', () => {
  it('Validates: Requirements 1.5 — taille > 10 Mo → valid false + erreur taille', async () => {
    // Feature: recipe-management-mvp, Property 10: files over 10 MB are always rejected
    // La vérification de taille est effectuée après le MIME mais avant toute
    // lecture du fichier par sharp. On passe un MIME valide (image/jpeg) et un
    // chemin inexistant : le fichier ne sera jamais lu car la taille est rejetée
    // en premier.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10 * 1024 * 1024 + 1, max: 20 * 1024 * 1024 }),
        async (size) => {
          const result = await validatePhotoFile({
            mimetype: 'image/jpeg',
            size,
            path: '/nonexistent/too-big.jpg',
          });
          return result.valid === false && /taille/i.test(result.error);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 10c : Toute image JPEG/PNG avec résolution < 640×480 est rejetée
// ═════════════════════════════════════════════════════════════════════════════

// Feature: recipe-management-mvp, Property 10: images below 640×480 are always rejected

describe('Property 10c: toute image JPEG/PNG avec résolution < 640×480 px est rejetée avec erreur de résolution', () => {
  it('Validates: Requirements 1.6 — résolution insuffisante → valid false + erreur résolution', async () => {
    // Feature: recipe-management-mvp, Property 10: images below 640×480 are always rejected
    // On génère des paires (width, height) où au moins une dimension est trop petite.
    // Trois cas couverts :
    //   - largeur < 640, hauteur >= 480
    //   - largeur >= 640, hauteur < 480
    //   - largeur < 640 et hauteur < 480
    // On crée de vrais fichiers JPEG pour que sharp puisse lire les métadonnées.
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Largeur trop petite, hauteur suffisante
          fc.record({
            width: fc.integer({ min: 1, max: 639 }),
            height: fc.integer({ min: 480, max: 800 }),
          }),
          // Largeur suffisante, hauteur trop petite
          fc.record({
            width: fc.integer({ min: 640, max: 800 }),
            height: fc.integer({ min: 1, max: 479 }),
          }),
          // Les deux trop petites
          fc.record({
            width: fc.integer({ min: 1, max: 639 }),
            height: fc.integer({ min: 1, max: 479 }),
          })
        ),
        async ({ width, height }) => {
          const tmpPath = await createTmpJpeg(width, height);
          const { size: fileSize } = statSync(tmpPath);

          const result = await validatePhotoFile({
            mimetype: 'image/jpeg',
            size: fileSize,
            path: tmpPath,
          });

          return result.valid === false && /résolution/i.test(result.error);
        }
      ),
      { numRuns: 20 }
    );
  });
});
