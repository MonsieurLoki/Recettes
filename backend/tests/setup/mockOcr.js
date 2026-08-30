/**
 * tests/setup/mockOcr.js
 *
 * Setup Vitest : remplace le module ocrService dans le cache CJS de Node.js
 * AVANT que app.js ne soit chargé, afin que photos.js → require('../services/ocrService')
 * reçoive la version mockée plutôt que la vraie.
 *
 * Ce fichier est exécuté via vitest.config.js → test.setupFiles.
 * Il est importé avant chaque fichier de test, dans le même worker Vitest.
 *
 * Pourquoi ce fichier est nécessaire :
 * Vitest transforme les fichiers de test en ESM et gère leur résolution de
 * modules via son propre registre. Cependant, les fichiers source CJS (app.js,
 * photos.js, ocrService.js…) sont chargés par le chargeur CJS natif de Node.js
 * via require(). vi.mock() intercepte les imports ESM, mais pas les require()
 * natifs. En patchant directement le cache require.cache de Node, on garantit
 * que ocrService.js retourne notre mock peu importe qui l'appelle.
 */

import { vi } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Résoudre le chemin absolu de ocrService.js
const require = createRequire(import.meta.url);
const ocrServicePath = require.resolve(path.join(__dirname, '../../src/services/ocrService.js'));

// Créer un vi.fn() partagé pour extractTextFromImage
// On l'expose sur globalThis pour que les tests puissent le reconfigurer.
globalThis.__mockExtractTextFromImage = vi.fn();

// Injecter le module mocké dans le cache require de Node.js AVANT que
// app.js ne soit importé dans le test. Ainsi, quand photos.js fera
// require('../services/ocrService'), Node retournera notre mock.
require.cache[ocrServicePath] = {
  id: ocrServicePath,
  filename: ocrServicePath,
  loaded: true,
  exports: {
    extractTextFromImage: globalThis.__mockExtractTextFromImage,
  },
};
