/**
 * __mocks__/ocrService.js
 *
 * Mock manuel du service OCR utilisé dans les tests d'intégration.
 * Vitest charge ce fichier automatiquement quand vi.mock() est appelé
 * pour '../../src/services/ocrService.js' depuis un test.
 *
 * extractTextFromImage est un vi.fn() que les tests configurent via
 * mockResolvedValue() / mockRejectedValue() pour simuler les différents
 * comportements du service OCR sans appel réseau.
 */

import { vi } from 'vitest';

export const extractTextFromImage = vi.fn();
