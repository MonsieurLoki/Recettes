/**
 * tests/integration/recipes.test.js
 *
 * Tests d'intégration pour les routes CRUD et de recherche des recettes.
 *
 * Stratégie DB : process.env.DB_PATH est positionné à ':memory:' AVANT tout
 * require applicatif, ce qui force database.js à créer une base SQLite
 * en mémoire isolée pour cette suite. La migration 001_initial.sql est
 * exécutée automatiquement au premier require du module database.
 *
 * Entre chaque test, les tables recettes/ingrédients/liaisons sont purgées
 * pour garantir l'isolation. Les catégories par défaut (Entrée, Plat
 * principal, Dessert…) sont conservées — elles sont insérées avec
 * INSERT OR IGNORE et ne sont jamais supprimées.
 *
 * Requirements couverts : 5.1, 5.4, 5.5, 5.6, 6.1, 6.2, 7.2, 7.3, 7.4,
 *                         7.5, 11.4
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';

// On importe directement les modules CJS via createRequire pour s'assurer de
// partager la même instance de singleton que le module app.js (require cache CJS).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const app = require('../../src/app.js');
const db  = require('../../src/db/database.js');

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY  = 'test-api-key-32-characters-long!!';
const BASE_URL = '/api/recipes';

/**
 * Retourne un objet de recette valide minimal.
 * @param {object} overrides
 */
function makeRecipe(overrides = {}) {
  return {
    name:         'Tarte aux pommes',
    instructions: 'Préchauffer le four à 180°C. Éplucher les pommes.',
    ingredients:  [{ name: 'Pomme', quantity: '4', unit: 'pièces' }],
    category_ids: [],
    ...overrides,
  };
}

/**
 * Raccourci — requête authentifiée via supertest.
 */
const api = {
  get:    (url)       => request(app).get(url).set('X-API-Key', API_KEY),
  post:   (url, body) => request(app).post(url).set('X-API-Key', API_KEY).send(body),
  put:    (url, body) => request(app).put(url).set('X-API-Key', API_KEY).send(body),
  delete: (url)       => request(app).delete(url).set('X-API-Key', API_KEY),
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Purger les données entre chaque test pour garantir l'isolation.
  // ON DELETE CASCADE sur recipe_categories et ingredients est activé,
  // donc supprimer recipes suffit — on supprime explicitement tout de même
  // pour être robuste.
  db.prepare('DELETE FROM recipe_categories').run();
  db.prepare('DELETE FROM ingredients').run();
  db.prepare('DELETE FROM recipes').run();
});

afterAll(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — créer une recette via l'API et retourner l'objet créé
// ─────────────────────────────────────────────────────────────────────────────

async function createRecipe(body = {}) {
  const res = await api.post(BASE_URL, makeRecipe(body));
  expect(res.status).toBe(201);
  return res.body;
}

// ═════════════════════════════════════════════════════════════════════════════
// CRUD recettes
// ═════════════════════════════════════════════════════════════════════════════

describe('CRUD recettes', () => {

  // ── POST /api/recipes ──────────────────────────────────────────────────────

  describe('POST /api/recipes', () => {
    it('crée une recette valide → 201 + recette complète — Req. 5.1, 5.5', async () => {
      const body = makeRecipe({
        name:         'Blanquette de veau',
        instructions: 'Faire revenir la viande.',
        ingredients:  [
          { name: 'Veau',    quantity: '500', unit: 'g' },
          { name: 'Carotte', quantity: '2',   unit: 'pièces' },
        ],
        category_ids: [2], // Plat principal
      });

      const res = await api.post(BASE_URL, body);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id:           expect.any(Number),
        name:         'Blanquette de veau',
        instructions: 'Faire revenir la viande.',
        created_at:   expect.any(String),
        updated_at:   expect.any(String),
      });
      // Ingrédients présents dans le bon ordre (Req. 5.5)
      expect(res.body.ingredients).toHaveLength(2);
      expect(res.body.ingredients[0].name).toBe('Veau');
      expect(res.body.ingredients[1].name).toBe('Carotte');
      // Catégorie présente
      expect(res.body.categories).toHaveLength(1);
      expect(res.body.categories[0].id).toBe(2);
    });

    it('retourne 409 pour un nom dupliqué — Req. 5.7', async () => {
      await createRecipe({ name: "Soupe à l'oignon" });
      const res = await api.post(BASE_URL, makeRecipe({ name: "Soupe à l'oignon" }));
      expect(res.status).toBe(409);
    });

    it('retourne 400 avec errors.name pour un nom vide — Req. 5.2, 5.3', async () => {
      const res = await api.post(BASE_URL, makeRecipe({ name: '' }));
      expect(res.status).toBe(400);
      expect(res.body.details).toHaveProperty('name');
    });

    it('retourne 400 avec errors.ingredients sans ingrédients — Req. 5.2, 5.3', async () => {
      const res = await api.post(BASE_URL, makeRecipe({ ingredients: [] }));
      expect(res.status).toBe(400);
      expect(res.body.details).toHaveProperty('ingredients');
    });

    it('retourne 401 sans X-API-Key — Req. 10.1, 10.2', async () => {
      const res = await request(app).post(BASE_URL).send(makeRecipe());
      expect(res.status).toBe(401);
      // La réponse ne doit pas contenir de données applicatives
      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('data');
    });
  });

  // ── GET /api/recipes/:id ───────────────────────────────────────────────────

  describe('GET /api/recipes/:id', () => {
    it('retourne 200 + recette complète pour un ID existant — Req. 8.1', async () => {
      const created = await createRecipe({
        name:        'Quiche Lorraine',
        ingredients: [
          { name: 'Œuf',    quantity: '3',   unit: 'pièces' },
          { name: 'Lardon', quantity: '150', unit: 'g' },
        ],
      });

      const res = await api.get(`${BASE_URL}/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.body.name).toBe('Quiche Lorraine');
      // Ingrédients dans l'ordre de saisie (Req. 8.1)
      expect(res.body.ingredients).toHaveLength(2);
      expect(res.body.ingredients[0].name).toBe('Œuf');
      expect(res.body.ingredients[1].name).toBe('Lardon');
      expect(Array.isArray(res.body.categories)).toBe(true);
    });

    it('retourne 404 pour un ID inexistant', async () => {
      const res = await api.get(`${BASE_URL}/99999`);
      expect(res.status).toBe(404);
    });
  });

  // ── PUT /api/recipes/:id ───────────────────────────────────────────────────

  describe('PUT /api/recipes/:id', () => {
    it('met à jour nom, instructions et ingrédients → 200 + données modifiées — Req. 5.4, 5.5, 5.6', async () => {
      const created = await createRecipe({
        name:         'Salade César',
        instructions: 'Préparer la laitue.',
        ingredients:  [{ name: 'Laitue', quantity: '1', unit: 'tête' }],
      });

      const updated = {
        name:         'Salade César améliorée',
        instructions: 'Préparer la laitue. Ajouter les croûtons.',
        ingredients:  [
          { name: 'Laitue',   quantity: '1',  unit: 'tête' },
          { name: 'Croûtons', quantity: '50', unit: 'g' },
          { name: 'Parmesan', quantity: '30', unit: 'g' },
        ],
        category_ids: [],
      };

      const res = await api.put(`${BASE_URL}/${created.id}`, updated);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Salade César améliorée');
      expect(res.body.instructions).toBe('Préparer la laitue. Ajouter les croûtons.');
      expect(res.body.ingredients).toHaveLength(3);
      expect(res.body.ingredients.map((i) => i.name)).toEqual([
        'Laitue', 'Croûtons', 'Parmesan',
      ]);
    });

    it('retourne 404 pour un ID inexistant — Req. 5.4', async () => {
      const res = await api.put(`${BASE_URL}/99999`, makeRecipe());
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/recipes/:id ────────────────────────────────────────────────

  describe('DELETE /api/recipes/:id', () => {
    it('supprime une recette existante → 204 — Req. 6.1', async () => {
      const created = await createRecipe({ name: 'Mousse au chocolat' });
      const res = await api.delete(`${BASE_URL}/${created.id}`);
      expect(res.status).toBe(204);
    });

    it('après suppression, GET /:id retourne 404 — Req. 6.1', async () => {
      const created = await createRecipe({ name: 'Crème brûlée' });
      await api.delete(`${BASE_URL}/${created.id}`);
      const res = await api.get(`${BASE_URL}/${created.id}`);
      expect(res.status).toBe(404);
    });

    it('après suppression, la recette est absente de GET /api/recipes — Req. 6.1', async () => {
      const created = await createRecipe({ name: 'Île flottante' });
      await api.delete(`${BASE_URL}/${created.id}`);
      const res = await api.get(BASE_URL);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((r) => r.id);
      expect(ids).not.toContain(created.id);
    });

    it('retourne 404 pour un ID inexistant — Req. 6.1', async () => {
      const res = await api.delete(`${BASE_URL}/99999`);
      expect(res.status).toBe(404);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Filtres de recherche — Req. 7.2, 7.3, 7.4, 7.5
// ═════════════════════════════════════════════════════════════════════════════

describe('Filtres de recherche GET /api/recipes', () => {

  // Jeu de données commun pour les tests de recherche
  beforeEach(async () => {
    // Recette 1 — Tarte aux pommes, catégorie Dessert (id=3), ingrédient : pomme
    await api.post(BASE_URL, {
      name:         'Tarte aux pommes',
      instructions: 'Faire la pâte.',
      ingredients:  [{ name: 'Pomme', quantity: '4', unit: 'pièces' }],
      category_ids: [3], // Dessert
    });

    // Recette 2 — Tarte tatin, catégorie Dessert (id=3), ingrédient : pomme caramélisée
    await api.post(BASE_URL, {
      name:         'Tarte tatin',
      instructions: 'Caraméliser les pommes.',
      ingredients:  [{ name: 'Pomme caramélisée', quantity: '6', unit: 'pièces' }],
      category_ids: [3], // Dessert
    });

    // Recette 3 — Blanquette de veau, catégorie Plat principal (id=2)
    await api.post(BASE_URL, {
      name:         'Blanquette de veau',
      instructions: 'Faire mijoter.',
      ingredients:  [
        { name: 'Veau',    quantity: '500', unit: 'g' },
        { name: 'Carotte', quantity: '2',   unit: 'pièces' },
      ],
      category_ids: [2], // Plat principal
    });

    // Recette 4 — Soupe à l'oignon, catégorie Soupe (id=4)
    await api.post(BASE_URL, {
      name:         "Soupe à l'oignon",
      instructions: 'Faire revenir les oignons.',
      ingredients:  [{ name: 'Oignon', quantity: '3', unit: 'pièces' }],
      category_ids: [4], // Soupe
    });
  });

  // ── Filtre par nom ───────────────────────────────────────────────────────

  it('filtre par nom — retourne les recettes contenant "tarte" (insensible à la casse) — Req. 7.2', async () => {
    const res = await api.get(`${BASE_URL}?name=tarte`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(2);
    for (const recipe of res.body.data) {
      expect(recipe.name.toLowerCase()).toContain('tarte');
    }
  });

  it('filtre par nom — insensible à la casse (TARTE → tarte) — Req. 7.2', async () => {
    const res = await api.get(`${BASE_URL}?name=TARTE`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  // ── Filtre par ingrédient ────────────────────────────────────────────────

  it('filtre par ingrédient — retourne les recettes contenant "pomme" — Req. 7.4', async () => {
    const res = await api.get(`${BASE_URL}?ingredient=pomme`);

    expect(res.status).toBe(200);
    // "Tarte aux pommes" (Pomme) et "Tarte tatin" (Pomme caramélisée)
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('filtre par ingrédient — insensible à la casse (OIGNON → oignon) — Req. 7.4', async () => {
    const res = await api.get(`${BASE_URL}?ingredient=OIGNON`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Soupe à l'oignon");
  });

  // ── Filtre par catégorie ─────────────────────────────────────────────────

  it('filtre par catégorie — retourne les recettes de Dessert (id=3) — Req. 7.3, 7.5', async () => {
    const res = await api.get(`${BASE_URL}?categories=3`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    const names = res.body.data.map((r) => r.name);
    expect(names).toContain('Tarte aux pommes');
    expect(names).toContain('Tarte tatin');
  });

  it('filtre par catégorie — logique ET (Dessert ET Plat principal → 0 résultats) — Req. 7.5', async () => {
    // Aucune recette n'appartient simultanément à Dessert (3) ET Plat principal (2)
    const res = await api.get(`${BASE_URL}?categories=2,3`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  // ── Filtre combiné nom + ingrédient ──────────────────────────────────────

  it('filtre combiné nom + ingrédient (AND) — Req. 7.2, 7.4', async () => {
    // "tarte" dans le nom ET "pomme" dans les ingrédients
    const res = await api.get(`${BASE_URL}?name=tarte&ingredient=pomme`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const recipe of res.body.data) {
      expect(recipe.name.toLowerCase()).toContain('tarte');
    }
  });

  it('filtre combiné AND strict — tarte + veau → 0 résultats — Req. 7.2, 7.4', async () => {
    // "tarte" dans le nom ET "veau" dans les ingrédients → aucune recette
    const res = await api.get(`${BASE_URL}?name=tarte&ingredient=veau`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  // ── Aucun résultat ───────────────────────────────────────────────────────

  it('aucun résultat pour un nom inexistant → { data: [], total: 0 } — Req. 7.6, 7.7', async () => {
    const res = await api.get(`${BASE_URL}?name=nonexistentrecipeXYZ`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  // ── Structure de la réponse ──────────────────────────────────────────────

  it('la réponse contient les champs de pagination (data, total, page, limit) — Req. 7.6', async () => {
    const res = await api.get(BASE_URL);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBe(4);
    expect(res.body.page).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Suppression en cascade — Req. 6.2
// ═════════════════════════════════════════════════════════════════════════════

describe('Suppression en cascade (Req. 6.2)', () => {

  it('supprimer une recette supprime aussi ses ingrédients (ON DELETE CASCADE)', async () => {
    const created = await createRecipe({
      name:        'Pot-au-feu',
      ingredients: [
        { name: 'Bœuf',    quantity: '800', unit: 'g' },
        { name: 'Poireau', quantity: '2',   unit: 'pièces' },
        { name: 'Navet',   quantity: '3',   unit: 'pièces' },
      ],
    });

    const recipeId = created.id;

    // Vérifier que les ingrédients existent avant la suppression
    const ingredientsBefore = db
      .prepare('SELECT id FROM ingredients WHERE recipe_id = ?')
      .all(recipeId);
    expect(ingredientsBefore).toHaveLength(3);

    const deleteRes = await api.delete(`${BASE_URL}/${recipeId}`);
    expect(deleteRes.status).toBe(204);

    // Vérifier la suppression en cascade
    const ingredientsAfter = db
      .prepare('SELECT id FROM ingredients WHERE recipe_id = ?')
      .all(recipeId);
    expect(ingredientsAfter).toHaveLength(0);
  });

  it('supprimer une recette supprime aussi ses liaisons catégories — Req. 6.2', async () => {
    const created = await createRecipe({
      name:         'Gratin dauphinois',
      category_ids: [2, 5], // Plat principal + Salade
    });

    const recipeId = created.id;

    const linksBefore = db
      .prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?')
      .all(recipeId);
    expect(linksBefore).toHaveLength(2);

    await api.delete(`${BASE_URL}/${recipeId}`);

    const linksAfter = db
      .prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?')
      .all(recipeId);
    expect(linksAfter).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Authentification — Req. 10.1, 10.2
// ═════════════════════════════════════════════════════════════════════════════

describe('Authentification (Req. 10.1, 10.2)', () => {

  it('GET /api/recipes sans X-API-Key → 401', async () => {
    const res = await request(app).get(BASE_URL);
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('data');
  });

  it('GET /api/recipes/:id sans X-API-Key → 401', async () => {
    const res = await request(app).get(`${BASE_URL}/1`);
    expect(res.status).toBe(401);
  });

  it('POST /api/recipes sans X-API-Key → 401', async () => {
    const res = await request(app).post(BASE_URL).send(makeRecipe());
    expect(res.status).toBe(401);
  });

  it('DELETE /api/recipes/:id sans X-API-Key → 401', async () => {
    const res = await request(app).delete(`${BASE_URL}/1`);
    expect(res.status).toBe(401);
  });

  it('clé API incorrecte → 401', async () => {
    const res = await request(app)
      .get(BASE_URL)
      .set('X-API-Key', 'wrong-key-that-is-32-chars-long!!');
    expect(res.status).toBe(401);
  });
});
