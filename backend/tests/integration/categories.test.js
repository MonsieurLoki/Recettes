/**
 * tests/integration/categories.test.js
 *
 * Tests d'intégration pour les routes /api/categories.
 *
 * Stratégie d'isolation :
 *   - process.env.DB_PATH est défini sur ':memory:' AVANT tout require,
 *     ce qui force database.js à créer une base SQLite en mémoire.
 *   - process.env.API_KEY est défini sur une clé de test valide (≥ 32 car.)
 *     AVANT le chargement d'app.js, ce qui permet à auth.js de l'utiliser.
 *   - Les modules sont réinitialisés avec vi.resetModules() avant chaque test
 *     pour garantir qu'une nouvelle DB en mémoire est créée (isolation complète).
 *
 * Routes testées :
 *   GET  /api/categories  — 4.1
 *   POST /api/categories  — 4.4, 4.5, 4.7
 *   Auth X-API-Key        — 10.1
 *
 * Requirements couverts : 4.1, 4.4, 4.5, 11.4
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

// ─────────────────────────────────────────────────────────────────────────────
// Environnement — doit être défini AVANT tout require/import dynamique
// ─────────────────────────────────────────────────────────────────────────────

// Vitest charge ce fichier en mode ESM, mais l'application est en CommonJS.
// On utilise createRequire pour accéder aux modules CommonJS depuis un contexte ESM.
import { createRequire } from 'module';
import { describe, it, expect, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Clé de test : ≥ 32 caractères, valeur fixe pour tous les tests
const TEST_API_KEY = 'test-api-key-32-characters-long!!';

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation unique de l'app et de la DB en mémoire pour tout le fichier
// ─────────────────────────────────────────────────────────────────────────────
//
// Stratégie :
//   - DB_PATH et API_KEY sont définis ICI (avant tout require) pour que
//     database.js ouvre une DB ':memory:' et que auth.js charge la bonne clé.
//   - On charge app et supertest une seule fois et on les partage entre suites.
//   - L'isolation entre tests est assurée par l'utilisation de noms différents
//     (pas de réinitialisation de la DB entre tests — on évite les conflits
//     en choisissant des noms uniques ou en nettoyant la table dans beforeEach
//     des suites qui en ont besoin).

process.env.DB_PATH = ':memory:';
process.env.API_KEY = TEST_API_KEY;

const _require    = createRequire(import.meta.url);
const _supertest  = _require('supertest');
const _app        = _require('../../src/app');
const _db         = _require('../../src/db/database');

/**
 * Retourne l'instance supertest partagée pour ce fichier de test.
 * Toutes les suites utilisent la même app et la même DB en mémoire.
 */
function getRequest() {
  return _supertest(_app);
}

/**
 * Vide la table categories et réinsère les catégories par défaut.
 * À appeler dans beforeEach() quand un test a besoin d'un état propre.
 */
function resetCategories() {
  // Supprimer toutes les catégories (y compris les défauts)
  _db.prepare('DELETE FROM categories').run();
  // Réinsérer les 8 catégories par défaut de la migration
  const defaults = [
    'Entrée', 'Plat principal', 'Dessert', 'Soupe',
    'Salade', 'Sauce', 'Boisson', 'Autre',
  ];
  const stmt = _db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  for (const name of defaults) {
    stmt.run(name);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite principale
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/categories', () => {
  let request;

  beforeEach(() => {
    resetCategories();
    request = getRequest();
  });

  it('devrait retourner HTTP 200 et un tableau de catégories — Req. 4.1', async () => {
    const res = await request
      .get('/api/categories')
      .set('X-API-Key', TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('devrait inclure les catégories par défaut insérées à la migration — Req. 4.1', async () => {
    // La migration insère : Entrée, Plat principal, Dessert, Soupe, Salade,
    // Sauce, Boisson, Autre
    const res = await request
      .get('/api/categories')
      .set('X-API-Key', TEST_API_KEY);

    expect(res.status).toBe(200);

    const names = res.body.map((c) => c.name);
    expect(names).toContain('Entrée');
    expect(names).toContain('Plat principal');
    expect(names).toContain('Dessert');
    expect(names).toContain('Soupe');
    expect(names).toContain('Salade');
    expect(names).toContain('Sauce');
    expect(names).toContain('Boisson');
    expect(names).toContain('Autre');
  });

  it('devrait retourner des objets avec les champs id, name, created_at — Req. 4.1', async () => {
    const res = await request
      .get('/api/categories')
      .set('X-API-Key', TEST_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    const first = res.body[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('created_at');
  });

  it('devrait retourner les catégories triées par ordre alphabétique — Req. 4.1', async () => {
    const res = await request
      .get('/api/categories')
      .set('X-API-Key', TEST_API_KEY);

    expect(res.status).toBe(200);

    const names = res.body.map((c) => c.name);
    // Vérification que la liste est bien triée (comparaison insensible à la casse)
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    expect(names).toEqual(sorted);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/categories — création valide
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/categories — création valide', () => {
  let request;

  beforeEach(() => {
    resetCategories();
    request = getRequest();
  });

  it('devrait créer une catégorie et retourner HTTP 201 — Req. 4.4, 4.7', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Apéritif' });

    expect(res.status).toBe(201);
  });

  it('devrait retourner la catégorie créée avec id, name, created_at — Req. 4.7', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Apéritif' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', 'Apéritif');
    expect(res.body).toHaveProperty('created_at');
  });

  it('devrait avoir un id numérique positif — Req. 4.7', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Petit-déjeuner' });

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('number');
    expect(res.body.id).toBeGreaterThan(0);
  });

  it('devrait retourner le nom sanitisé (trim appliqué) — Req. 4.5', async () => {
    // Le nom soumis avec espaces en début/fin doit être trimé avant stockage
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: '  Sandwich  ' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Sandwich');
  });

  it('devrait rendre la nouvelle catégorie visible dans GET /api/categories — Req. 4.1', async () => {
    // Créer une nouvelle catégorie
    const postRes = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Brunch' });

    expect(postRes.status).toBe(201);

    // Vérifier qu'elle apparaît dans la liste
    const getRes = await request
      .get('/api/categories')
      .set('X-API-Key', TEST_API_KEY);

    expect(getRes.status).toBe(200);
    const names = getRes.body.map((c) => c.name);
    expect(names).toContain('Brunch');
  });

  it('devrait accepter un nom de 100 caractères exactement — Req. 4.5', async () => {
    const name100 = 'a'.repeat(100);
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: name100 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/categories — doublon → 409
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/categories — doublon → 409', () => {
  let request;

  beforeEach(() => {
    resetCategories();
    request = getRequest();
  });

  it('devrait retourner 409 pour un doublon exact — Req. 4.5', async () => {
    // 'Dessert' est déjà inséré par la migration
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Dessert' });

    expect(res.status).toBe(409);
  });

  it('devrait retourner 409 pour un doublon avec casse différente — Req. 4.5', async () => {
    // 'DESSERT' est équivalent à 'Dessert' via COLLATE NOCASE
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'DESSERT' });

    expect(res.status).toBe(409);
  });

  it('devrait retourner 409 pour un doublon avec casse mixte — Req. 4.5', async () => {
    // 'dEsSErT' doit aussi être détecté comme doublon de 'Dessert'
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'dEsSErT' });

    expect(res.status).toBe(409);
  });

  it('devrait retourner 409 pour un doublon avec espaces en début/fin — Req. 4.5', async () => {
    // '  Dessert  ' après trim() correspond à 'Dessert' déjà présent
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: '  Dessert  ' });

    expect(res.status).toBe(409);
  });

  it('devrait retourner 409 pour un doublon d\'une catégorie qu\'on vient de créer — Req. 4.5', async () => {
    // Créer une catégorie, puis tenter de la recréer
    await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Apéritif' });

    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Apéritif' });

    expect(res.status).toBe(409);
  });

  it('devrait retourner un corps JSON avec error et details.name — Req. 4.5', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'Dessert' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toHaveProperty('name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/categories — données invalides → 400
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/categories — données invalides → 400', () => {
  let request;

  beforeEach(() => {
    resetCategories();
    request = getRequest();
  });

  it('devrait retourner 400 pour un nom vide — Req. 4.5', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('devrait retourner 400 pour un nom composé uniquement d\'espaces — Req. 4.5', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
  });

  it('devrait retourner 400 pour un nom de 101 caractères — Req. 4.5', async () => {
    // La limite est 100 caractères ; 101 est invalide
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 'a'.repeat(101) });

    expect(res.status).toBe(400);
  });

  it('devrait retourner 400 si le champ name est absent — Req. 4.5', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({});

    expect(res.status).toBe(400);
  });

  it('devrait retourner 400 si name est un nombre (type incorrect) — Req. 4.5', async () => {
    // Le validateur n'accepte que les chaînes
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: 42 });

    expect(res.status).toBe(400);
  });

  it('devrait retourner un corps JSON avec error et details.name — Req. 4.5', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', TEST_API_KEY)
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toHaveProperty('name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authentification — absence ou invalide → 401
// ─────────────────────────────────────────────────────────────────────────────

describe('Authentification — X-API-Key absente ou invalide → 401', () => {
  let request;

  beforeEach(() => {
    resetCategories();
    request = getRequest();
  });

  it('devrait retourner 401 si X-API-Key est absent sur GET /api/categories — Req. 10.1', async () => {
    const res = await request.get('/api/categories');
    // Aucun en-tête X-API-Key
    expect(res.status).toBe(401);
  });

  it('devrait retourner 401 si X-API-Key est absent sur POST /api/categories — Req. 10.1', async () => {
    const res = await request
      .post('/api/categories')
      .send({ name: 'Apéritif' });

    expect(res.status).toBe(401);
  });

  it('devrait retourner 401 pour une X-API-Key incorrecte sur GET — Req. 10.1', async () => {
    const res = await request
      .get('/api/categories')
      .set('X-API-Key', 'mauvaise-cle-completement-fausse!!');

    expect(res.status).toBe(401);
  });

  it('devrait retourner 401 pour une X-API-Key incorrecte sur POST — Req. 10.1', async () => {
    const res = await request
      .post('/api/categories')
      .set('X-API-Key', 'mauvaise-cle-completement-fausse!!')
      .send({ name: 'Apéritif' });

    expect(res.status).toBe(401);
  });

  it('devrait retourner un corps JSON sans données applicatives pour un refus — Req. 10.1', async () => {
    const res = await request
      .get('/api/categories')
      .set('X-API-Key', 'mauvaise-cle-completement-fausse!!');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    // Le corps ne doit PAS contenir de catégories ni d'autres données
    expect(res.body).not.toHaveProperty('data');
    expect(Array.isArray(res.body)).toBe(false);
  });
});
