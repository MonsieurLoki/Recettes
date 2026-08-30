-- Migration 001 : Schéma initial de la base de données
-- Idempotent : toutes les instructions utilisent IF NOT EXISTS / OR IGNORE
-- afin de pouvoir être rejouées sans erreur sur une base déjà initialisée.

-- ============================================================
-- Table : categories
-- Rôle  : stocker les catégories qui permettent de classer les
--         recettes (ex. Entrée, Dessert…).
-- Contraintes clés :
--   - name est unique, sans distinction de casse (COLLATE NOCASE),
--     pour éviter les doublons comme « Dessert » et « dessert ».
--   - created_at est généré automatiquement au format ISO 8601 UTC.
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Catégories par défaut insérées une seule fois grâce à INSERT OR IGNORE.
-- OR IGNORE évite une erreur si les catégories existent déjà (rejeu de migration).
INSERT OR IGNORE INTO categories (name) VALUES
    ('Entrée'),
    ('Plat principal'),
    ('Dessert'),
    ('Soupe'),
    ('Salade'),
    ('Sauce'),
    ('Boisson'),
    ('Autre');

-- ============================================================
-- Table : recipes
-- Rôle  : stocker les recettes de cuisine.
-- Contraintes clés :
--   - name est unique sans distinction de casse pour éviter les
--     doublons (ex. « Tarte aux pommes » et « tarte aux pommes »).
--   - instructions est non NULL avec une valeur par défaut vide,
--     pour permettre la création d'un brouillon via le flux OCR.
--   - ocr_text conserve le texte brut extrait par Google Cloud Vision
--     à titre d'archive ; peut être NULL si la recette est saisie manuellement.
--   - photo_path stocke le chemin relatif dans /uploads ; NULL si pas de photo.
--   - updated_at est mis à jour manuellement par l'application à chaque PUT.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    instructions TEXT    NOT NULL DEFAULT '',
    ocr_text     TEXT,
    photo_path   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- Table : ingredients
-- Rôle  : stocker les ingrédients associés à une recette
--         (relation 1 recette → N ingrédients).
-- Contraintes clés :
--   - recipe_id référence recipes(id) avec ON DELETE CASCADE :
--     supprimer une recette supprime automatiquement ses ingrédients.
--   - quantity et unit sont des champs libres (texte) pour accepter des
--     valeurs comme « 1/2 », « une pincée », « c. à soupe ».
--   - position permet d'afficher les ingrédients dans l'ordre de saisie.
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredients (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    quantity  TEXT,
    unit      TEXT,
    position  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- Table : recipe_categories
-- Rôle  : table de liaison pour la relation N-N entre recettes et
--         catégories (une recette peut appartenir à plusieurs catégories
--         et une catégorie peut regrouper plusieurs recettes).
-- Contraintes clés :
--   - PRIMARY KEY composite (recipe_id, category_id) garantit
--     qu'une même paire ne peut être insérée deux fois.
--   - ON DELETE CASCADE sur les deux FK : supprimer une recette ou une
--     catégorie nettoie automatiquement les lignes de liaison orphelines.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_categories (
    recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id)
);

-- ============================================================
-- Index
-- idx_recipes_name    : accélère les recherches et tris sur le nom de recette
--                       (requêtes GET /api/recipes?name=…).
-- idx_ingredients_name: accélère les recherches par ingrédient
--                       (requêtes GET /api/recipes?ingredient=…).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_recipes_name     ON recipes(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name COLLATE NOCASE);
