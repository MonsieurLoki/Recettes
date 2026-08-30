/**
 * routes/categories.js
 *
 * Rôle : définit les routes Express relatives à la gestion des catégories
 * de recettes. Ces routes sont montées sous le préfixe `/api/categories`
 * dans app.js et sont toutes protégées par le middleware d'authentification
 * X-API-Key.
 *
 * Routes exposées :
 *   GET  /api/categories        — liste toutes les catégories (Requirement 4.1)
 *   POST /api/categories        — crée une nouvelle catégorie (Requirements 4.4, 4.5, 4.7)
 *
 * Dépendances :
 *   - better-sqlite3 (via db/database.js) pour les requêtes paramétrées
 *   - validators/categoryValidator.js pour la validation des règles métier
 *   - utils/sanitize.js pour la sanitisation des champs texte
 */

'use strict';

const express = require('express');

const db = require('../db/database');
const auth = require('../middleware/auth');
const { validateCreateCategory } = require('../validators/categoryValidator');
const { sanitizeText } = require('../utils/sanitize');

const router = express.Router();

// Applique le middleware d'authentification (X-API-Key) à toutes les routes
// de ce routeur. Toute requête sans clé valide est rejetée avec HTTP 401
// avant d'atteindre la logique métier.
router.use(auth);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/categories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/categories
 *
 * Description : retourne la liste complète de toutes les catégories disponibles,
 * triées par nom dans l'ordre alphabétique. Les catégories par défaut (Entrée,
 * Plat principal, Dessert, etc.) insérées à la migration sont incluses.
 *
 * Paramètres : aucun
 *
 * Codes de retour :
 *   200 — succès, corps : tableau d'objets { id, name, created_at }
 *   500 — erreur serveur interne (propagée au middleware errorHandler)
 *
 * Requirement : 4.1
 */
router.get('/', (req, res, next) => {
  try {
    // Requête paramétrée (pas de données utilisateur ici, mais on suit la même
    // convention pour la cohérence et la lisibilité).
    // ORDER BY name COLLATE NOCASE : tri alphabétique insensible à la casse,
    // cohérent avec la définition de la colonne dans la migration SQL.
    const categories = db
      .prepare('SELECT id, name, created_at FROM categories ORDER BY name COLLATE NOCASE ASC')
      .all();

    return res.status(200).json(categories);
  } catch (err) {
    // Déléguer au middleware errorHandler.js pour une réponse 500 uniforme.
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/categories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/categories
 *
 * Description : crée une nouvelle catégorie. Le nom est validé (non vide,
 * ≤ 100 caractères, unique insensible à la casse et aux espaces de début/fin),
 * sanitisé, puis inséré en base via un prepared statement.
 *
 * Corps attendu (JSON) :
 *   { "name": "Apéritif" }
 *
 * Codes de retour :
 *   201 — catégorie créée, corps : { id, name, created_at }
 *   400 — données invalides, corps : { error: "Données invalides", details: { name: "..." } }
 *   409 — catégorie déjà existante (unicité), corps : { error: "...", details: { name: "..." } }
 *   500 — erreur serveur interne (propagée au middleware errorHandler)
 *
 * Requirements : 4.4, 4.5, 4.7
 */
router.post('/', (req, res, next) => {
  try {
    // ── Étape 1 : validation des règles métier ──────────────────────────────
    // validateCreateCategory vérifie :
    //   - Présence et non-vide du nom (après trim)
    //   - Longueur ≤ 100 caractères
    //   - Unicité insensible à la casse et aux espaces (COLLATE NOCASE + TRIM)
    //
    // La base de données est passée en paramètre pour permettre la vérification
    // d'unicité sans sortir du validateur.
    const validation = validateCreateCategory(req.body, db);

    if (!validation.valid) {
      // Distinguer l'erreur de doublon (409 Conflict) des autres erreurs de
      // validation (400 Bad Request) pour que le client puisse adapter son message.
      const isDuplicate =
        validation.errors?.name?.includes('existe déjà') ?? false;

      const statusCode = isDuplicate ? 409 : 400;

      return res.status(statusCode).json({
        error: 'Données invalides',
        details: validation.errors,
      });
    }

    // ── Étape 2 : sanitisation ──────────────────────────────────────────────
    // sanitizeText effectue : trim(), suppression balises HTML (<script>,
    // <style>, attributs on*), nettoyage de tout balisage résiduel.
    // On sanitise APRÈS la validation pour que les messages d'erreur
    // correspondent à la saisie originale de l'utilisateur.
    const sanitizedName = sanitizeText(req.body.name);

    // ── Étape 3 : insertion en base via prepared statement ──────────────────
    // L'utilisation d'un placeholder `?` garantit qu'aucune donnée utilisateur
    // n'est concaténée directement dans la chaîne SQL (Requirement 11.1).
    //
    // `.run()` retourne un objet { changes, lastInsertRowid } :
    //   - changes : nombre de lignes modifiées (1 si l'insert a réussi)
    //   - lastInsertRowid : identifiant auto-incrémenté de la nouvelle ligne
    const result = db
      .prepare('INSERT INTO categories (name) VALUES (?)')
      .run(sanitizedName);

    // ── Étape 4 : relire la catégorie créée pour retourner les données complètes
    // (id, name, created_at) telles qu'elles sont stockées en base.
    const created = db
      .prepare('SELECT id, name, created_at FROM categories WHERE id = ?')
      .get(result.lastInsertRowid);

    // Requirement 4.7 : retourner HTTP 201 avec la catégorie nouvellement créée
    // pour que le frontend puisse l'afficher immédiatement comme sélectionnée.
    return res.status(201).json(created);
  } catch (err) {
    // Déléguer toute erreur inattendue au middleware errorHandler.js.
    next(err);
  }
});

module.exports = router;
