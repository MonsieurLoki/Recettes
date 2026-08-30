import { defineConfig } from 'vitest/config';
import os from 'os';

export default defineConfig({
  test: {
    // Les variables d'environnement sont injectées avant le chargement de tout module,
    // ce qui permet à auth.js (qui lit API_KEY au niveau du module) de voir la valeur
    // de test dès son premier require().
    env: {
      DB_PATH: ':memory:',
      API_KEY: 'test-api-key-32-characters-long!!',
      UPLOADS_DIR: os.tmpdir(),
      NODE_ENV: 'test',
    },

    // setupFiles : exécutés avant chaque fichier de test dans le worker Vitest.
    // mockOcr.js patche le cache require() de Node pour que ocrService.js soit
    // remplacé par un vi.fn() avant que app.js ne soit chargé.
    setupFiles: ['./tests/setup/mockOcr.js'],
  },
});
