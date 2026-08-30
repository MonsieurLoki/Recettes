/**
 * dataConsistency.property.test.js — Tests de propriétés (fast-check) pour la cohérence des données
 *
 * Couvre les propriétés universelles de cohérence des données entre les
 * opérations CRUD :
 *   Property 11 : Après DELETE /api/recipes/:id réussi, GET /api/recipes ne
 *                 contient pas l'id supprimé
 *   Property 12 : Round-trip : une recette créée puis lue via GET /api/recipes/:id
 *                 est identique (nom, instructions, ingrédients, catégories)
 *   Property 13 : L'unicité est vérifiée insensiblement à la casse et aux
 *                 espaces de début/fin
 *
 * Stratégie : on passe par l'API HTTP via supertest pour tester la cohérence
 * de bout en bout (route → validation → DB → réponse). La DB en mémoire est
 * définie dans vitest.config.js (DB_PATH=':memory:').
 * Chaque run utilise des noms de recettes uniques (suffixe numérique croissant)
 * pour éviter les conflits entre les itérations fast-check et garantir que
 * chaque POST cible une ressource vraiment nouvelle.
 *
 * Requirements couverts : 4.5, 5.1, 5.5, 5.7, 6.2
 *
 * Feature: recipe-management-mvp
 * Spec path: .kiro/specs/recipe-management-mvp
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const app  = _require('../../../src/app.js');

import supertestPkg from 'supertest';
const request = supertestPkg;

const API_KEY = 'test-api-key-32-characters-long!!';

// ─────────────────────────────────────────────────────────────────────────────
// Helper : envoyer une requête HTTP authentifiée
// ─────────────────────────────────────────────────────────────────────────────

function api() {
  return request(app);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper : corps de recette valide minimal
// Les noms sont passés en paramètre pour permettre la génération property-based.
// On utilise uniquement des caractères ASCII simples pour éviter les
// interactions avec la sanitisation HTML (qui pourrait supprimer des balises)
// et pour que les comparaisons name === name soient fiables après round-trip.
// ─────────────────────────────────────────────────────────────────────────────

function makeRecipeBody(name, overrides = {}) {
  return {
    name,
    instructions: 'Etapes de la recette pour les tests.',
    ingredients: [{ name: 'farine' }],
    category_ids: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compteur global pour garantir des noms uniques entre les runs fast-check
// ─────────────────────────────────────────────────────────────────────────────

// Chaque appel à `uniqueSuffix()` produit un entier croissant que l'on colle
// au nom généré, ce qui rend les noms uniques même sans purger la DB entre
// deux runs. Cela évite tout risque de collision entre des runs concurrents
// ou des générations identiques de fast-check.
let _runCounter = 0;
function uniqueSuffix() {
  return ++_runCounter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraires fast-check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère un nom de recette « propre » :
 *   - uniquement des lettres minuscules ASCII et des espaces internes
 *   - trimé et longueur ≥ 3 après trim pour passer la validation
 *   - pas d'espace en début/fin (pour Property 12 où on compare les noms
 *     directement ; les espaces de début/fin sont testés séparément en Property 13)
 *
 * Le filtre garantit que le nom n'est pas whitespace-only et fait ≥ 3 car.
 */
const cleanNameArb = fc
  .stringMatching(/^[a-z]{3,20}$/)
  .filter(s => s.trim().length >= 3);

/**
 * Génère un nom de base pour Property 13 : uniquement lettres ASCII, au moins
 * 5 caractères, aucun espace (ce qui permet de créer facilement des variantes
 * casse / espaces de début et de fin).
 */
const baseNameForUniquenessArb = fc.stringMatching(/^[a-zA-Z]{5,15}$/);

// ═════════════════════════════════════════════════════════════════════════════
// Property 11 : Après DELETE réussi, la recette est absente de GET /api/recipes
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 11: after DELETE, recipe is absent from GET /api/recipes list', () => {
  it('Validates: Requirements 6.2 — GET /api/recipes ne contient pas l\'id d\'une recette supprimée', async () => {
    // Feature: recipe-management-mvp, Property 11: after DELETE, recipe is absent from GET list
    await fc.assert(
      fc.asyncProperty(cleanNameArb, async (name) => {
        // Nom unique par run pour éviter les conflits de noms avec d'autres runs
        const uniqueName = `${name}${uniqueSuffix()}`;

        // 1. Créer une recette
        const postRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName));

        if (postRes.status !== 201) return false;
        const createdId = postRes.body.id;

        // 2. Supprimer la recette
        const deleteRes = await api()
          .delete(`/api/recipes/${createdId}`)
          .set('X-API-Key', API_KEY);

        if (deleteRes.status !== 204) return false;

        // 3. Vérifier que l'id n'apparaît plus dans GET /api/recipes
        const listRes = await api()
          .get('/api/recipes')
          .set('X-API-Key', API_KEY);

        if (listRes.status !== 200) return false;

        const ids = listRes.body.data.map(r => r.id);
        return !ids.includes(createdId);
      }),
      { numRuns: 10 }
    );
  });

  it('Validates: Requirements 6.2 — GET /api/recipes/:id retourne 404 après suppression', async () => {
    // Feature: recipe-management-mvp, Property 11: after DELETE, GET /:id returns 404
    await fc.assert(
      fc.asyncProperty(cleanNameArb, async (name) => {
        const uniqueName = `${name}${uniqueSuffix()}`;

        // 1. Créer une recette
        const postRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName));

        if (postRes.status !== 201) return false;
        const createdId = postRes.body.id;

        // 2. Supprimer la recette
        const deleteRes = await api()
          .delete(`/api/recipes/${createdId}`)
          .set('X-API-Key', API_KEY);

        if (deleteRes.status !== 204) return false;

        // 3. GET /:id doit retourner 404
        const getRes = await api()
          .get(`/api/recipes/${createdId}`)
          .set('X-API-Key', API_KEY);

        return getRes.status === 404;
      }),
      { numRuns: 10 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 12 : Round-trip création → lecture retourne des données identiques
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 12: round-trip create+read returns identical recipe data', () => {
  it('Validates: Requirements 5.1, 5.5 — GET /:id retourne exactement les données POSTées', async () => {
    // Feature: recipe-management-mvp, Property 12: round-trip create+read returns identical recipe data
    //
    // On génère des recettes avec des noms, instructions et ingrédients variés.
    // La comparaison se fait sur les données telles que retournées par POST
    // (déjà sanitisées par le backend) et GET /:id — les deux doivent être
    // identiques puisque la même donnée stockée est retournée dans les deux cas.
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Noms composés uniquement de lettres pour éviter toute transformation
          // par la sanitisation qui pourrait différer entre POST et GET
          name: fc
            .stringMatching(/^[a-zA-Z ]{3,20}$/)
            .map(s => s.trim())
            .filter(s => s.length >= 3),
          // Instructions simples (pas de balises HTML pour éviter la sanitisation)
          instructions: fc.string({ minLength: 5, maxLength: 100 })
            .filter(s => !/<|>|\{\{|<%/.test(s)),
          // 1 à 3 ingrédients avec des noms purement alphabétiques
          ingredients: fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-zA-Z]{3,15}$/),
            }),
            { minLength: 1, maxLength: 3 }
          ),
        }),
        async ({ name, instructions, ingredients }) => {
          // Nom unique par run pour éviter les conflits avec d'autres itérations
          const uniqueName = `${name.slice(0, 40)}${uniqueSuffix()}`;

          const body = { name: uniqueName, instructions, ingredients, category_ids: [] };

          // 1. Créer la recette
          const postRes = await api()
            .post('/api/recipes')
            .set('X-API-Key', API_KEY)
            .send(body);

          if (postRes.status !== 201) return false;
          const posted = postRes.body;

          // 2. Lire la recette via GET /:id
          const getRes = await api()
            .get(`/api/recipes/${posted.id}`)
            .set('X-API-Key', API_KEY);

          if (getRes.status !== 200) return false;
          const fetched = getRes.body;

          // 3. Comparer les champs : on compare GET vs POST (tous deux reflètent
          //    les données telles que stockées — sanitisées de façon identique)
          if (fetched.name !== posted.name) return false;
          if (fetched.instructions !== posted.instructions) return false;
          if (fetched.ingredients.length !== posted.ingredients.length) return false;

          // Vérifier que chaque ingrédient correspond (l'ordre est préservé
          // via la colonne `position`)
          for (let i = 0; i < posted.ingredients.length; i++) {
            if (fetched.ingredients[i].name !== posted.ingredients[i].name) {
              return false;
            }
          }

          // Vérifier la cohérence des catégories (tableau vide dans les deux cas)
          if (fetched.categories.length !== posted.categories.length) return false;

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Validates: Requirements 5.2, 5.5 — l\'ordre des ingrédients est préservé (position)', async () => {
    // Feature: recipe-management-mvp, Property 12: round-trip create+read preserves ingredient order
    await fc.assert(
      fc.asyncProperty(
        // Générer 2 à 4 ingrédients avec des noms distincts et ordonnés
        fc.array(
          fc.stringMatching(/^[a-zA-Z]{3,15}$/),
          { minLength: 2, maxLength: 4 }
        ).filter(names => new Set(names).size === names.length), // noms uniques
        async (ingredientNames) => {
          // Nom unique basé sur le compteur pour éviter les collisions
          const uniqueName = `recipe${uniqueSuffix()}`;
          const body = {
            name: uniqueName,
            instructions: 'Instructions de test.',
            ingredients: ingredientNames.map(n => ({ name: n })),
            category_ids: [],
          };

          const postRes = await api()
            .post('/api/recipes')
            .set('X-API-Key', API_KEY)
            .send(body);

          if (postRes.status !== 201) return false;

          const getRes = await api()
            .get(`/api/recipes/${postRes.body.id}`)
            .set('X-API-Key', API_KEY);

          if (getRes.status !== 200) return false;

          const fetchedIngredients = getRes.body.ingredients;

          // L'ordre des ingrédients doit être identique à l'ordre de soumission
          if (fetchedIngredients.length !== ingredientNames.length) return false;

          return ingredientNames.every(
            (name, idx) => fetchedIngredients[idx].name === name
          );
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Property 13 : L'unicité est vérifiée insensiblement à la casse et aux espaces
// ═════════════════════════════════════════════════════════════════════════════

describe('Property 13: uniqueness is case and whitespace insensitive', () => {
  it('Validates: Requirements 5.7 — un doublon en minuscules est rejeté avec 409', async () => {
    // Feature: recipe-management-mvp, Property 13: uniqueness is case and space insensitive
    //
    // On utilise un suffixe numérique unique par run pour éviter les collisions
    // entre les itérations fast-check et les recettes créées par les autres
    // propriétés dans ce fichier. La propriété testée reste identique : on crée
    // une recette avec un nom, puis on essaie de recréer une recette avec le même
    // nom en minuscules — le résultat doit être 409.
    await fc.assert(
      fc.asyncProperty(baseNameForUniquenessArb, async (baseName) => {
        // Suffixe numérique unique pour éviter tout conflit avec les autres runs
        const suffix = uniqueSuffix();
        const uniqueName = `${baseName}${suffix}`;

        // 1. Créer la recette avec le nom unique
        const postRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName));

        if (postRes.status !== 201) return false;

        // 2. Réessayer avec le nom en minuscules → doit être rejeté avec 409
        // (toUpperCase puis toLowerCase pour tester la normalisation de casse)
        const lowerRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName.toLowerCase()));

        return lowerRes.status === 409;
      }),
      { numRuns: 10 }
    );
  });

  it('Validates: Requirements 5.7 — un doublon en majuscules est rejeté avec 409', async () => {
    // Feature: recipe-management-mvp, Property 13: uniqueness is case and space insensitive
    await fc.assert(
      fc.asyncProperty(baseNameForUniquenessArb, async (baseName) => {
        const suffix = uniqueSuffix();
        const uniqueName = `${baseName}${suffix}`;

        // 1. Créer avec le nom unique
        const postRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName));

        if (postRes.status !== 201) return false;

        // 2. Réessayer avec le nom en majuscules → doit être rejeté avec 409
        const upperRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName.toUpperCase()));

        return upperRes.status === 409;
      }),
      { numRuns: 10 }
    );
  });

  it('Validates: Requirements 4.5, 5.7 — un doublon avec espaces de début/fin est rejeté avec 409', async () => {
    // Feature: recipe-management-mvp, Property 13: uniqueness is case and space insensitive
    //
    // Le validateur trim() le nom avant de vérifier l'unicité. Donc " recette "
    // et "recette" doivent être considérés comme identiques.
    await fc.assert(
      fc.asyncProperty(baseNameForUniquenessArb, async (baseName) => {
        const suffix = uniqueSuffix();
        const uniqueName = `${baseName}${suffix}`;

        // 1. Créer avec le nom unique (sans espaces parasites)
        const postRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(uniqueName));

        if (postRes.status !== 201) return false;

        // 2. Réessayer avec le nom entouré d'espaces → doit être rejeté avec 409
        const paddedRes = await api()
          .post('/api/recipes')
          .set('X-API-Key', API_KEY)
          .send(makeRecipeBody(` ${uniqueName} `));

        return paddedRes.status === 409;
      }),
      { numRuns: 10 }
    );
  });
});
