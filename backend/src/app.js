/**
 * app.js — Configuration Express
 *
 * Ce fichier configure l'application Express sans la démarrer.
 * La mise en écoute (listen) est déléguée à server.js, ce qui permet
 * d'importer `app` dans les tests d'intégration sans ouvrir de port.
 *
 * Ordre d'application des middlewares :
 * 0. trust proxy  — doit être avant rateLimit pour que X-Forwarded-For soit lu correctement
 * 1. dotenv       — doit être le premier : charge les variables d'env
 * 2. helmet       — sécurise les en-têtes HTTP (avant tout traitement)
 * 3. rateLimit    — limite le débit des requêtes (avant la logique métier)
 * 4. express.json — parse le corps des requêtes JSON
 * 5. Routes métier (auth vérifiée dans chaque routeur via auth.js)
 * 6. errorHandler — intercepte toutes les erreurs non traitées (doit être dernier)
 *
 * Requirements couverts : 10.1 (clé API), 11.5 (commentaires pédagogiques)
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const recipesRouter    = require('./routes/recipes');
const categoriesRouter = require('./routes/categories');
const photosRouter     = require('./routes/photos');
const errorHandler     = require('./middleware/errorHandler');

const app = express();

// 0. Trust proxy — indispensable derrière Nginx en production.
// Sans ce réglage, express-rate-limit lève une erreur car X-Forwarded-For
// est présent mais Express ne fait pas confiance au proxy.
// 1 = faire confiance au premier proxy uniquement (Nginx).
// Désactivé en test pour ne pas affecter les tests unitaires.
if (process.env.NODE_ENV !== 'test') {
  app.set('trust proxy', 1);
}

// 2. En-têtes de sécurité HTTP
app.use(helmet());

// 3. Limitation du débit des requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    error: 'Trop de requêtes, veuillez réessayer dans 15 minutes.'
  }
});
app.use(limiter);

// 4. Parsing du corps JSON
app.use(express.json());

// 5. Montage des routes métier
app.use('/api/recipes',    recipesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/photos',     photosRouter);

// 6. Gestionnaire d'erreurs global (doit être le dernier middleware)
app.use(errorHandler);

module.exports = app;