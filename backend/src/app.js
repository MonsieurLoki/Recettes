/**
 * app.js — Configuration Express
 *
 * Ce fichier configure l'application Express sans la démarrer.
 * La mise en écoute (listen) est déléguée à server.js, ce qui permet
 * d'importer `app` dans les tests d'intégration sans ouvrir de port.
 *
 * Ordre d'application des middlewares :
 * 1. dotenv     — doit être le premier : charge les variables d'env
 * 2. helmet     — sécurise les en-têtes HTTP (avant tout traitement)
 * 3. rateLimit  — limite le débit des requêtes (avant la logique métier)
 * 4. express.json — parse le corps des requêtes JSON
 * 5. Routes métier (auth vérifiée dans chaque routeur via auth.js)
 * 6. errorHandler — intercepte toutes les erreurs non traitées (doit être dernier)
 *
 * Requirements couverts : 10.1 (clé API), 11.5 (commentaires pédagogiques)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Chargement des variables d'environnement
// ─────────────────────────────────────────────────────────────────────────────
// dotenv doit être appelé en tout premier pour que tous les modules suivants
// aient accès à process.env dès leur import/require.
// En production, les variables d'env sont injectées directement par la
// plateforme — dotenv ne fait rien si les variables sont déjà définies.
require('dotenv').config();

const express = require('express');

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sécurité HTTP : helmet
// ─────────────────────────────────────────────────────────────────────────────
// helmet() positionne une série d'en-têtes HTTP de sécurité en une seule ligne :
//   - Content-Security-Policy   : limite les sources de scripts autorisées
//   - X-Frame-Options           : empêche le clickjacking (intégration dans un iframe)
//   - X-Content-Type-Options    : empêche le MIME sniffing du navigateur
//   - Strict-Transport-Security : force HTTPS (activé uniquement si servi en HTTPS)
//   - Referrer-Policy           : contrôle les infos envoyées dans l'en-tête Referer
// À appliquer avant toute autre logique pour ne jamais exposer une réponse sans
// ces protections.
const helmet = require('helmet');

// ─────────────────────────────────────────────────────────────────────────────
// 3. Limitation du débit : express-rate-limit
// ─────────────────────────────────────────────────────────────────────────────
// Le rate limiting réduit l'exposition aux abus (scraping, brute-force sur la
// clé API, DoS léger). Il doit être appliqué avant les routes pour couper les
// requêtes excessives le plus tôt possible.
//   windowMs : fenêtre glissante de 15 minutes
//   max      : 100 requêtes par IP par fenêtre
//   standardHeaders : envoie les en-têtes RateLimit-* standardisés (RFC 6585)
//   legacyHeaders   : désactive les anciens en-têtes X-RateLimit-* pour éviter
//                     la duplication
const rateLimit = require('express-rate-limit');

// ─────────────────────────────────────────────────────────────────────────────
// Routes et middleware applicatifs
// ─────────────────────────────────────────────────────────────────────────────
const recipesRouter    = require('./routes/recipes');
const categoriesRouter = require('./routes/categories');
const photosRouter     = require('./routes/photos');
const errorHandler     = require('./middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// Création de l'instance Express
// ─────────────────────────────────────────────────────────────────────────────
const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// Application des middlewares dans l'ordre
// ─────────────────────────────────────────────────────────────────────────────

// 2. En-têtes de sécurité HTTP
app.use(helmet());

// 3. Limitation du débit des requêtes
//
// En environnement de test (NODE_ENV === 'test'), le rate-limiting est
// désactivé pour éviter que les suites de tests property-based (qui envoient
// de nombreuses requêtes rapides) ne déclenchent le limiteur et obtiennent
// des réponses 429 au lieu des statuts attendus.
// En production, le rate-limiting est toujours actif.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes en millisecondes
  max: 100,                  // max 100 requêtes par IP sur cette fenêtre
  standardHeaders: true,     // envoie RateLimit-* selon le standard IETF
  legacyHeaders: false,      // désactive les en-têtes X-RateLimit-* obsolètes
  skip: () => process.env.NODE_ENV === 'test', // pas de limite en test
  message: {
    error: 'Trop de requêtes, veuillez réessayer dans 15 minutes.'
  }
});
app.use(limiter);

// 4. Parsing du corps JSON
// express.json() transforme le corps des requêtes avec Content-Type: application/json
// en objet JavaScript disponible dans req.body.
// Le parsing multipart (fichiers) est délégué à Multer dans les routes concernées
// (/api/photos) pour ne charger ce middleware que là où il est nécessaire.
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// 5. Montage des routes métier
// ─────────────────────────────────────────────────────────────────────────────
// Chaque routeur vérifie lui-même la clé API via le middleware auth.js.
// Le préfixe /api est centralisé ici pour rester cohérent et faciliter un
// éventuel versionning futur (/api/v2/...).
app.use('/api/recipes',    recipesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/photos',     photosRouter);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Gestionnaire d'erreurs global (doit être le dernier middleware)
// ─────────────────────────────────────────────────────────────────────────────
// Express identifie un gestionnaire d'erreurs grâce à sa signature à 4 arguments
// (err, req, res, next). Il doit être monté après toutes les routes pour
// intercepter les erreurs propagées via next(err) ou les exceptions lancées
// dans un middleware async.
app.use(errorHandler);

module.exports = app;
