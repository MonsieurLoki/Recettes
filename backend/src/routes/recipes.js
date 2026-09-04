/**
 * routes/recipes.js
 *
 * Rôle : définit toutes les routes Express relatives à la gestion des recettes.
 * Ces routes sont montées sous le préfixe `/api/recipes` dans app.js et sont
 * toutes protégées par le middleware d'authentification X-API-Key.
 *
 * Routes exposées :
 *   GET    /api/recipes          — liste paginée avec filtres (Req. 7.1–7.7)
 *   GET    /api/recipes/:id      — détail d'une recette (Req. 8.1)
 *   POST   /api/recipes          — créer une recette (Req. 5.1–5.3, 5.5, 5.7, 5.8)
 *   PUT    /api/recipes/:id      — mettre à jour une recette (Req. 5.4–5.8)
 *   DELETE /api/recipes/:id      — supprimer une recette (Req. 6.1, 6.2)
 *
 * Dépendances :
 *   - better-sqlite3 (via db/database.js) pour toutes les requêtes SQLite
 *   - validators/recipeValidator.js pour la validation des règles métier
 *   - validators/searchValidator.js pour la validation des paramètres de recherche
 *   - utils/sanitize.js pour la sanitisation des champs texte
 *   - middleware/auth.js monté globalement dans app.js
 *
 * Pourquoi des transactions SQLite pour les écritures ?
 * ─────────────────────────────────────────────────────
 * La création ou la mise à jour d'une recette implique plusieurs tables :
 *   1. `recipes`           — la recette elle-même
 *   2. `ingredients`       — ses ingrédients (1 à 50 lignes)
 *   3. `recipe_categories` — les liaisons recette ↔ catégorie
 * Sans transaction, si une erreur survient entre l'insertion de la recette et
 * l'insertion des ingrédients, la base se retrouverait dans un état incohérent
 * (recette sans ingrédients). Une transaction SQLite garantit l'atomicité :
 * soit tout est commité ensemble, soit tout est annulé (ROLLBACK automatique
 * en cas d'exception). (Requirement 11.1)
 *
 * Comment fonctionne la cascade ON DELETE CASCADE ?
 * ──────────────────────────────────────────────────
 * Les tables `ingredients` et `recipe_categories` déclarent leur colonne
 * `recipe_id` avec la contrainte `REFERENCES recipes(id) ON DELETE CASCADE`.
 * Quand on supprime une recette (DELETE FROM recipes WHERE id = ?), SQLite
 * supprime automatiquement toutes les lignes liées dans ces deux tables.
 * Cela évite les données orphelines sans requêtes DELETE explicites
 * supplémentaires. La contrainte est activée au niveau de la connexion via
 * `PRAGMA foreign_keys = ON` (configuré dans database.js). (Requirement 6.2)
 */

'use strict';

const express = require('express');

const db = require('../db/database');
const auth = require('../middleware/auth');
const { validateCreateRecipe, validateUpdateRecipe } = require('../validators/recipeValidator');
const { validateSearchParams } = require('../validators/searchValidator');
const { sanitizeText } = require('../utils/sanitize');

const router = express.Router();

// Toutes les routes de ce fichier sont protégées par la clé API.
// auth est appliqué au niveau du routeur pour couvrir toutes les routes
// ci-dessous sans répéter le middleware sur chacune (Requirement 10.1).
router.use(auth);

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions utilitaires internes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Récupère une recette complète (avec ses ingrédients et ses catégories)
 * depuis la base de données à partir de son identifiant.
 *
 * Cette fonction est partagée par GET /api/recipes/:id, POST et PUT pour
 * éviter la duplication du code de lecture. Elle retourne null si la recette
 * n'existe pas, permettant à la route appelante de renvoyer un 404.
 *
 * @param {number} id - Identifiant de la recette à récupérer.
 * @returns {object|null} La recette complète ou null si introuvable.
 */
function getRecipeById(id) {
  // Récupération des champs de la recette elle-même.
  // Prepared statement avec ? pour éviter toute injection SQL (Req. 11.1).
  // Inclut les nouveaux champs ajoutés par la migration 002 :
  // servings, prep_time, cook_time, notes (Requirements 1.8, 3.8, 9.6).
  const recipe = db
    .prepare(
      `SELECT id, name, instructions, ocr_text, photo_path,
              servings, prep_time, cook_time, notes,
              created_at, updated_at
       FROM recipes WHERE id = ?`
    )
    .get(id);

  if (!recipe) return null;

  // Récupération des ingrédients associés, triés par leur position d'affichage.
  // La position garantit que l'ordre de saisie de l'utilisateur est préservé
  // lors de la restitution (Requirement 8.1).
  const ingredients = db
    .prepare(
      `SELECT id, name, quantity, unit, position
       FROM ingredients WHERE recipe_id = ? ORDER BY position ASC`
    )
    .all(id);

  // Récupération des catégories associées via la table de liaison recipe_categories.
  // La jointure avec categories permet de retourner directement le nom lisible.
  const categories = db
    .prepare(
      `SELECT c.id, c.name
       FROM categories c
       INNER JOIN recipe_categories rc ON rc.category_id = c.id
       WHERE rc.recipe_id = ?
       ORDER BY c.name COLLATE NOCASE ASC`
    )
    .all(id);

  return { ...recipe, ingredients, categories };
}

/**
 * Insère les ingrédients d'une recette dans la table `ingredients`.
 *
 * Cette fonction est appelée à l'intérieur d'une transaction, aussi bien lors
 * de la création (POST) que de la mise à jour (PUT). Elle ne valide pas les
 * ingrédients — cette responsabilité appartient au validateur.
 *
 * Chaque ingrédient reçoit une propriété `position` correspondant à son index
 * dans le tableau soumis, ce qui préserve l'ordre de saisie de l'utilisateur.
 *
 * @param {number}   recipeId    - ID de la recette parente.
 * @param {Array}    ingredients - Tableau d'ingrédients (name, quantity?, unit?).
 * @param {object}   dbInstance  - Instance better-sqlite3 à utiliser (permet
 *                                 de passer une connexion de test différente).
 */
function insertIngredients(recipeId, ingredients, dbInstance) {
  // Préparer le statement une seule fois hors de la boucle est plus efficace
  // que de le préparer à chaque itération.
  const stmt = dbInstance.prepare(
    `INSERT INTO ingredients (recipe_id, name, quantity, unit, position)
     VALUES (?, ?, ?, ?, ?)`
  );

  ingredients.forEach((ing, index) => {
    // Sanitisation de chaque champ texte de l'ingrédient (Requirement 5.8).
    const name     = sanitizeText(ing.name);
    const quantity = ing.quantity != null ? sanitizeText(String(ing.quantity)) : null;
    const unit     = ing.unit     != null ? sanitizeText(String(ing.unit))     : null;

    stmt.run(recipeId, name, quantity, unit, index);
  });
}

/**
 * Insère les liaisons recette ↔ catégorie dans la table `recipe_categories`.
 *
 * Cette fonction est appelée à l'intérieur d'une transaction.
 * Les IDs fournis sont supposés valides (entiers positifs) — la validation
 * a déjà eu lieu dans recipeValidator.
 *
 * @param {number}  recipeId    - ID de la recette parente.
 * @param {Array}   categoryIds - Tableau d'IDs de catégories (peut être vide).
 * @param {object}  dbInstance  - Instance better-sqlite3 à utiliser.
 */
function insertCategoryLinks(recipeId, categoryIds, dbInstance) {
  if (!categoryIds || categoryIds.length === 0) return;

  const stmt = dbInstance.prepare(
    `INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)`
  );

  for (const catId of categoryIds) {
    stmt.run(recipeId, catId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recipes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/recipes
 *
 * Description : retourne une liste paginée de recettes résumées (sans le
 * détail des ingrédients ni le texte OCR) avec filtrage optionnel par nom,
 * catégories et ingrédient.
 *
 * Paramètres de requête (query string) :
 *   name       {string}  (optionnel) — recherche insensible à la casse dans le nom
 *   ingredient {string}  (optionnel) — recherche insensible à la casse dans les ingrédients
 *   categories {string}  (optionnel) — IDs de catégories séparés par virgule (logique ET)
 *   page       {integer} (optionnel, défaut 1)  — numéro de page ≥ 1
 *   limit      {integer} (optionnel, défaut 20) — résultats par page (1–100)
 *
 * Codes de retour :
 *   200 — succès, corps : { data: [...], total: N, page: N, limit: N }
 *   400 — paramètres de recherche invalides
 *   401 — clé API absente ou invalide (géré par auth.js)
 *   500 — erreur serveur interne
 *
 * Requirements : 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */
router.get('/', (req, res, next) => {
  try {
    // ── Étape 1 : validation des paramètres de recherche ───────────────────
    const validation = validateSearchParams(req.query);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Paramètres de recherche invalides',
        details: validation.errors,
      });
    }

    // ── Étape 2 : extraction et normalisation des paramètres ───────────────
    const name       = req.query.name       ? req.query.name.trim()       : null;
    const ingredient = req.query.ingredient ? req.query.ingredient.trim() : null;
    const page       = req.query.page  ? Math.max(1, parseInt(req.query.page,  10)) : 1;
    const limit      = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : 20;
    const offset     = (page - 1) * limit;

    // Parsing des IDs de catégories (chaîne "1,3" → tableau [1, 3]).
    // On filtre les valeurs non numériques pour tolérer une saisie imparfaite.
    let categoryIds = [];
    if (req.query.categories) {
      categoryIds = req.query.categories
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    }

    // max_time filter: optional positive integer (total time in minutes)
    // (Requirement 5.3, 5.4)
    let maxTime = null;
    if (req.query.max_time !== undefined) {
      const mt = parseInt(req.query.max_time, 10);
      if (isNaN(mt) || mt <= 0) {
        return res.status(400).json({
          error: 'Paramètres de recherche invalides',
          details: { max_time: 'max_time doit être un entier positif (minutes).' },
        });
      }
      maxTime = mt;
    }

    // ── Étape 3 : construction dynamique de la requête SQL ─────────────────
    //
    // Pourquoi construire la requête dynamiquement ?
    // Les filtres sont tous optionnels. Plutôt que d'écrire une requête
    // géante avec des conditions systématiques (ex. `WHERE name LIKE '%x%' OR 1=1`),
    // on construit la clause WHERE uniquement avec les conditions actives.
    // Cela produit un SQL plus lisible et potentiellement plus performant.
    //
    // Sécurité : les valeurs utilisateur ne sont JAMAIS concaténées dans
    // la chaîne SQL — elles sont toujours passées comme paramètres `?`
    // au prepared statement (Requirement 11.1).
    //
    // Le filtre par catégories (logique ET) nécessite une sous-requête :
    // pour chaque catégorie sélectionnée, la recette doit avoir une entrée
    // dans recipe_categories. On compte le nombre de correspondances et on
    // vérifie qu'il est égal au nombre de catégories demandées.

    const conditions = [];
    const params = [];

    if (name) {
      // LOWER() côté SQL + LOWER() sur le paramètre = comparaison insensible
      // à la casse sans dépendre de la collation de la colonne.
      // Le pattern LIKE '%...%' avec LOWER() couvre les accents tant que
      // SQLite est compilé avec ICU (sinon, insensible aux ASCII uniquement).
      conditions.push('LOWER(r.name) LIKE LOWER(?)');
      params.push(`%${name}%`);
    }

    if (ingredient) {
      // Sous-requête EXISTS : la recette doit avoir au moins un ingrédient
      // dont le nom contient le terme de recherche (Requirement 7.4).
      conditions.push(
        `EXISTS (
           SELECT 1 FROM ingredients i
           WHERE i.recipe_id = r.id
             AND LOWER(i.name) LIKE LOWER(?)
         )`
      );
      params.push(`%${ingredient}%`);
    }

    if (categoryIds.length > 0) {
      // Logique ET sur les catégories (Requirement 7.3, 7.5) :
      // on compte combien de catégories demandées sont associées à la recette
      // et on exige que ce compte soit égal au nombre de catégories filtrées.
      // Cela garantit que la recette est associée à TOUTES les catégories,
      // et pas seulement à l'une d'entre elles (ce qui serait un ET, non un OU).
      const placeholders = categoryIds.map(() => '?').join(', ');
      conditions.push(
        `(
           SELECT COUNT(DISTINCT rc.category_id)
           FROM recipe_categories rc
           WHERE rc.recipe_id = r.id
             AND rc.category_id IN (${placeholders})
         ) = ?`
      );
      params.push(...categoryIds, categoryIds.length);
    }

    if (maxTime !== null) {
      // Recettes dont le temps total ≤ maxTime, OR recettes sans aucun temps
      // renseigné (toujours incluses — Req. 5.3).
      // COALESCE(x, 0) traite un champ NULL comme 0 pour le calcul du total.
      conditions.push(
        `(
           (r.prep_time IS NOT NULL OR r.cook_time IS NOT NULL)
           AND COALESCE(r.prep_time, 0) + COALESCE(r.cook_time, 0) <= ?
         ) OR (r.prep_time IS NULL AND r.cook_time IS NULL)`
      );
      params.push(maxTime);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Requête de comptage pour la pagination (même filtres, sans LIMIT/OFFSET).
    const countSql = `
      SELECT COUNT(DISTINCT r.id) AS total
      FROM recipes r
      ${whereClause}
    `;

    // Requête principale : on récupère les champs résumés des recettes
    // (sans instructions, ocr_text — non nécessaires pour la liste).
    // Les nouveaux champs photo_path, servings, prep_time, cook_time sont
    // inclus pour permettre l'affichage des miniatures et du temps sur les cartes
    // (Requirements 1.9, 3.9, 5.4, 8.8).
    // Les catégories sont agrégées en JSON pour éviter N+1 requêtes.
    // GROUP_CONCAT produit une chaîne "id:nom||id:nom,..." qu'on parse côté JS.
    const dataSql = `
      SELECT
        r.id,
        r.name,
        r.updated_at,
        r.photo_path,
        r.servings,
        r.prep_time,
        r.cook_time,
        GROUP_CONCAT(c.id || ':' || c.name, '||') AS categories_raw
      FROM recipes r
      LEFT JOIN recipe_categories rc ON rc.recipe_id = r.id
      LEFT JOIN categories c ON c.id = rc.category_id
      ${whereClause}
      GROUP BY r.id
      ORDER BY r.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    // Paramètres pour la requête de données : mêmes filtres + pagination.
    const dataParams = [...params, limit, offset];

    // Exécution des deux requêtes.
    const { total } = db.prepare(countSql).get(params);
    const rows = db.prepare(dataSql).all(dataParams);

    // Transformation du résultat : on convertit la chaîne categories_raw
    // en tableau d'objets { id, name }.
    const data = rows.map((row) => {
      let categories = [];
      if (row.categories_raw) {
        categories = row.categories_raw.split('||').map((entry) => {
          const [catId, ...nameParts] = entry.split(':');
          return { id: parseInt(catId, 10), name: nameParts.join(':') };
        });
      }
      return {
        id: row.id,
        name: row.name,
        categories,
        photo_path: row.photo_path ?? null,
        servings: row.servings ?? 4,
        prep_time: row.prep_time ?? null,
        cook_time: row.cook_time ?? null,
        updated_at: row.updated_at,
      };
    });

    return res.status(200).json({ data, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recipes/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/recipes/:id
 *
 * Description : retourne la recette complète identifiée par `id`, incluant
 * ses ingrédients (triés par position) et ses catégories.
 *
 * Paramètres de chemin :
 *   id {integer} — identifiant numérique de la recette
 *
 * Codes de retour :
 *   200 — succès, corps : recette complète (voir Data Models dans design.md)
 *   401 — clé API absente ou invalide (géré par auth.js)
 *   404 — recette introuvable
 *   500 — erreur serveur interne
 *
 * Requirements : 8.1
 */
router.get('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Un ID non numérique est traité comme un 404 (ressource inexistante)
    // plutôt qu'un 400 pour ne pas exposer la structure interne de l'API.
    if (isNaN(id) || id <= 0) {
      return res.status(404).json({ error: 'Recette introuvable.' });
    }

    const recipe = getRecipeById(id);

    if (!recipe) {
      return res.status(404).json({ error: 'Recette introuvable.' });
    }

    return res.status(200).json(recipe);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recipes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/recipes
 *
 * Description : crée une nouvelle recette avec ses ingrédients et ses
 * catégories. Toute l'opération est atomique grâce à une transaction SQLite :
 * si une étape échoue, aucune donnée n'est persistée.
 *
 * Corps attendu (JSON) :
 *   {
 *     "name":         string  (1–200 car., unique insensible à la casse)
 *     "instructions": string  (1–10 000 car.)
 *     "ingredients":  Array   (1–50 entrées : { name, quantity?, unit? })
 *     "category_ids": integer[] (0–10 IDs, optionnel)
 *   }
 *
 * Codes de retour :
 *   201 — recette créée, corps : recette complète
 *   400 — données invalides, corps : { error, details: { champ: message } }
 *   401 — clé API absente ou invalide
 *   409 — conflit : nom de recette déjà existant
 *   500 — erreur serveur interne
 *
 * Requirements : 5.1, 5.2, 5.3, 5.5, 5.7, 5.8, 11.1
 */
router.post('/', (req, res, next) => {
  try {
    // ── Étape 1 : validation des règles métier ────────────────────────────
    // validateCreateRecipe vérifie : nom (non vide, ≤ 200 car., unique),
    // ingrédients (1–50), instructions (non vides, ≤ 10 000 car.),
    // catégories (0–10 IDs entiers). (Requirements 5.2, 5.7)
    const validation = validateCreateRecipe(req.body, db);

    if (!validation.valid) {
      // Distinguer doublon de nom (409 Conflict) des autres erreurs de
      // validation (400 Bad Request) pour que le client adapte son message.
      const isDuplicate = validation.errors?.name?.includes('existe déjà') ?? false;
      return res.status(isDuplicate ? 409 : 400).json({
        error: 'Données invalides',
        details: validation.errors,
      });
    }

    // ── Étape 2 : sanitisation de tous les champs texte ───────────────────
    // Sanitiser APRÈS la validation pour que les messages d'erreur
    // correspondent à la saisie originale de l'utilisateur. (Requirement 5.8)
    const sanitizedName         = sanitizeText(req.body.name);
    const sanitizedInstructions = sanitizeText(req.body.instructions);
    const categoryIds           = req.body.category_ids || [];

    // Lecture des nouveaux champs optionnels (Requirements 1.3, 3.6, 3.7, 9.4, 9.5).
    // servings : entier 1–100, défaut 4 si absent ou vide.
    // prep_time / cook_time : entiers positifs en minutes, NULL si absents.
    // notes : texte libre ≤ 2000 car., sanitisé ; NULL si absent.
    const servings       = (req.body.servings  != null && req.body.servings  !== '') ? parseInt(req.body.servings,  10) : 4;
    const prepTime       = (req.body.prep_time != null && req.body.prep_time !== '') ? parseInt(req.body.prep_time, 10) : null;
    const cookTime       = (req.body.cook_time != null && req.body.cook_time !== '') ? parseInt(req.body.cook_time, 10) : null;
    const sanitizedNotes = req.body.notes != null ? sanitizeText(String(req.body.notes)) : null;

    // ── Étape 3 : transaction atomique ────────────────────────────────────
    // Pourquoi une transaction ?
    // Sans transaction, une erreur lors de l'insertion des ingrédients
    // laisserait une recette sans ingrédients en base (état incohérent).
    // better-sqlite3 fournit `db.transaction()` qui enveloppe automatiquement
    // toutes les opérations dans un BEGIN/COMMIT et rollback en cas d'exception.
    const createRecipe = db.transaction(() => {
      // Insertion de la recette principale (Requirement 5.1)
      // Les quatre nouveaux champs sont inclus pour satisfaire les colonnes
      // ajoutées par la migration 002 (Requirements 1.3, 3.6, 9.4).
      const result = db
        .prepare(
          `INSERT INTO recipes (name, instructions, servings, prep_time, cook_time, notes)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(sanitizedName, sanitizedInstructions, servings, prepTime, cookTime, sanitizedNotes);

      const newId = result.lastInsertRowid;

      // Insertion des ingrédients (Requirement 5.2)
      insertIngredients(newId, req.body.ingredients, db);

      // Insertion des liaisons catégories (Requirement 5.2)
      insertCategoryLinks(newId, categoryIds, db);

      return newId;
    });

    const newId = createRecipe();

    // ── Étape 4 : relire la recette complète pour la réponse ──────────────
    // On relit depuis la DB pour retourner les données telles qu'elles sont
    // effectivement stockées (timestamps générés par SQLite, IDs auto, etc.).
    // (Requirement 5.5)
    const created = getRecipeById(newId);

    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/recipes/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/recipes/:id
 *
 * Description : met à jour une recette existante. La stratégie utilisée pour
 * les ingrédients et les catégories est « supprimer tout puis réinsérer » :
 * on efface les enregistrements existants, puis on insère les nouvelles
 * valeurs. C'est plus simple et plus sûr que de calculer un diff — on évite
 * les bugs liés à la gestion des positions et des doublons. La transaction
 * garantit l'atomicité de l'opération. (Requirements 5.4, 5.5, 5.6)
 *
 * Corps attendu (JSON) : même format que POST /api/recipes
 *
 * Codes de retour :
 *   200 — succès, corps : recette complète mise à jour
 *   400 — données invalides
 *   401 — clé API absente ou invalide
 *   404 — recette introuvable
 *   409 — conflit : nom déjà utilisé par une autre recette
 *   500 — erreur serveur interne
 *
 * Requirements : 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 11.1
 */
router.put('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(404).json({ error: 'Recette introuvable.' });
    }

    // ── Étape 1 : vérifier que la recette existe ──────────────────────────
    // On lit aussi `servings` ici pour pouvoir préserver la valeur existante
    // si le client ne soumet pas ce champ (Requirement 1.7).
    const existing = db.prepare('SELECT id, servings FROM recipes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Recette introuvable.' });
    }

    // ── Étape 2 : validation des règles métier ────────────────────────────
    // validateUpdateRecipe exclut la recette courante du check d'unicité du
    // nom, afin de ne pas bloquer une mise à jour sans changement de nom.
    // (Requirements 5.2, 5.7)
    const validation = validateUpdateRecipe(id, req.body, db);

    if (!validation.valid) {
      const isDuplicate = validation.errors?.name?.includes('existe déjà') ?? false;
      return res.status(isDuplicate ? 409 : 400).json({
        error: 'Données invalides',
        details: validation.errors,
      });
    }

    // ── Étape 3 : sanitisation ────────────────────────────────────────────
    const sanitizedName         = sanitizeText(req.body.name);
    const sanitizedInstructions = sanitizeText(req.body.instructions);
    const categoryIds           = req.body.category_ids || [];

    // Lecture des nouveaux champs optionnels (Requirements 1.6, 1.7, 3.3, 3.4, 9.4, 9.5).
    // servings : préserve la valeur existante en base si absent du body.
    // prep_time / cook_time : NULL si absents (les remplace toujours).
    // notes : NULL si absent.
    const servings       = (req.body.servings  != null && req.body.servings  !== '') ? parseInt(req.body.servings,  10) : (existing?.servings ?? 4);
    const prepTime       = (req.body.prep_time != null && req.body.prep_time !== '') ? parseInt(req.body.prep_time, 10) : null;
    const cookTime       = (req.body.cook_time != null && req.body.cook_time !== '') ? parseInt(req.body.cook_time, 10) : null;
    const sanitizedNotes = req.body.notes != null ? sanitizeText(String(req.body.notes)) : null;

    // ── Étape 4 : transaction atomique ────────────────────────────────────
    // Stratégie DELETE + INSERT pour les ingrédients et catégories :
    // Plutôt que de calculer les différences entre l'état actuel et le nouvel
    // état (opération complexe et source de bugs), on supprime toutes les
    // entrées existantes et on les remplace par les nouvelles. La transaction
    // garantit que ce remplacement est atomique — pas d'état intermédiaire
    // visible. Les suppressions sont propagées automatiquement par SQLite via
    // ON DELETE CASCADE pour les clés étrangères, mais ici on supprime
    // explicitement par recipe_id (les lignes filles n'ont pas de CASCADE
    // activé par la clé recipe_id dans la table ingredients — on les supprime
    // manuellement). (Requirement 11.1)
    const updateRecipe = db.transaction(() => {
      // Mise à jour des champs de la recette principale.
      // Les quatre nouveaux champs sont inclus (Requirements 1.6, 3.3, 9.4).
      // updated_at est rafraîchi via strftime pour rester en ISO 8601.
      db.prepare(
        `UPDATE recipes
         SET name = ?, instructions = ?, servings = ?, prep_time = ?, cook_time = ?, notes = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      ).run(sanitizedName, sanitizedInstructions, servings, prepTime, cookTime, sanitizedNotes, id);

      // Suppression des anciens ingrédients (DELETE explicite car ingredients
      // n'a pas ON DELETE CASCADE sur recipe_id — la cascade est sur la
      // suppression de la recette elle-même, pas sur sa mise à jour).
      db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(id);

      // Suppression des anciennes liaisons catégories (même raison).
      db.prepare('DELETE FROM recipe_categories WHERE recipe_id = ?').run(id);

      // Réinsertion des nouveaux ingrédients et catégories.
      insertIngredients(id, req.body.ingredients, db);
      insertCategoryLinks(id, categoryIds, db);
    });

    updateRecipe();

    // ── Étape 5 : relire la recette complète pour la réponse ──────────────
    const updated = getRecipeById(id);

    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/recipes/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/recipes/:id
 *
 * Description : supprime définitivement une recette identifiée par `id`.
 * Les ingrédients et les liaisons catégories associés sont supprimés
 * automatiquement par SQLite grâce aux contraintes ON DELETE CASCADE
 * déclarées dans la migration 001_initial.sql. Il n'est donc pas nécessaire
 * d'émettre des DELETE supplémentaires sur les tables filles.
 *
 * Comment fonctionne la cascade :
 *   Les tables `ingredients` et `recipe_categories` déclarent :
 *     recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE
 *   Quand la ligne parente (dans `recipes`) est supprimée, SQLite propage
 *   automatiquement la suppression dans ces tables, à condition que
 *   PRAGMA foreign_keys = ON soit actif (configuré dans database.js).
 *   (Requirement 6.2, 11.1)
 *
 * Paramètres de chemin :
 *   id {integer} — identifiant numérique de la recette
 *
 * Codes de retour :
 *   204 — suppression réussie, corps vide
 *   401 — clé API absente ou invalide
 *   404 — recette introuvable
 *   500 — erreur serveur interne
 *
 * Requirements : 6.1, 6.2
 */
router.delete('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(404).json({ error: 'Recette introuvable.' });
    }

    // ── Vérifier l'existence avant la suppression ─────────────────────────
    // better-sqlite3 `.run()` retourne `{ changes: 0 }` si aucune ligne ne
    // correspond au WHERE — on pourrait s'en servir directement. Mais
    // vérifier d'abord avec un SELECT permet de retourner un 404 explicite
    // plutôt qu'un 204 silencieux sur une ressource inexistante, ce qui est
    // plus conforme à la sémantique REST et plus utile pour le débogage.
    const existing = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Recette introuvable.' });
    }

    // ── Suppression avec propagation en cascade ───────────────────────────
    // La suppression de la ligne dans `recipes` déclenche automatiquement
    // la suppression des lignes associées dans `ingredients` et
    // `recipe_categories` grâce aux contraintes ON DELETE CASCADE.
    // PRAGMA foreign_keys = ON est activé dans database.js.
    db.prepare('DELETE FROM recipes WHERE id = ?').run(id);

    // HTTP 204 No Content : succès sans corps de réponse.
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
