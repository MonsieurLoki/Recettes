/**
 * middleware/errorHandler.js
 *
 * Gestionnaire d'erreurs global Express.
 *
 * Rôle : intercepter toutes les erreurs propagées via `next(err)` depuis
 * n'importe quelle route ou middleware, et retourner une réponse JSON
 * structurée et sécurisée au client.
 *
 * ---
 * Différence entre erreur opérationnelle et erreur de programme
 * ---
 * Une **erreur opérationnelle** est une situation prévisible et gérée :
 * données invalides (400), ressource absente (404), conflit (409),
 * timeout d'un service tiers (502)… Elle est exprimée intentionnellement
 * par le code applicatif via `next(err)` avec un code HTTP approprié.
 * Le message peut être transmis au client car il ne révèle pas d'informations
 * sensibles sur le système.
 *
 * Une **erreur de programme** est un bug inattendu : exception JavaScript
 * non gérée, accès à une propriété undefined, erreur SQLite non anticipée…
 * Elle aboutit généralement en HTTP 500. Son message technique NE DOIT PAS
 * être envoyé au client car il pourrait révéler la structure interne du
 * code ou des chemins de fichiers sensibles. On log l'erreur côté serveur
 * et on retourne un message générique.
 *
 * Express identifie ce middleware comme gestionnaire d'erreurs grâce à sa
 * signature à 4 paramètres (err, req, res, next) — les 4 sont obligatoires
 * même si `next` n'est pas appelé dans le corps.
 *
 * @param {Error} err   - L'erreur propagée via next(err)
 * @param {object} req  - Objet Request Express
 * @param {object} res  - Objet Response Express
 * @param {Function} next - Fonction next Express (requise par la signature)
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Résoudre le code HTTP :
  // 1. Utiliser err.status ou err.statusCode si définis (erreur opérationnelle)
  // 2. Sinon, 500 (erreur de programme inattendue)
  const status = err.status || err.statusCode || 500;

  // --- Erreurs de validation (400) ---
  // Les validateurs applicatifs enrichissent l'erreur avec un objet `details`
  // contenant un message par champ invalide :
  // { name: "Le nom ne peut pas être vide", ingredients: "Au moins 1 ingrédient requis" }
  // On les relaie tels quels : le format est sûr et attendu par le frontend.
  if (status === 400 && err.details) {
    return res.status(400).json({
      error: 'Données invalides',
      details: err.details,
    });
  }

  // --- Erreurs opérationnelles (4xx et 502) ---
  // Le message de l'erreur est contrôlé par le code applicatif, il est donc
  // sûr de le transmettre au client.
  if (status < 500) {
    return res.status(status).json({
      error: err.message || 'Erreur de la requête',
    });
  }

  // --- Erreurs serveur (5xx) ---
  // On log les détails complets en console pour le débogage, mais on ne les
  // expose jamais au client (fuite d'informations internes).
  console.error(`[${new Date().toISOString()}] Erreur interne (${status}):`, err);

  return res.status(status).json({
    error: 'Une erreur interne est survenue. Veuillez réessayer.',
  });
}

module.exports = errorHandler;
