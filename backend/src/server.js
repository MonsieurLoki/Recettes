/**
 * server.js — Point d'entrée du serveur Express
 *
 * Rôle : valider les variables d'environnement critiques au démarrage,
 * puis lancer l'écoute HTTP sur le port configuré.
 *
 * Ce fichier est séparé de app.js pour faciliter les tests d'intégration :
 * les tests importent app.js directement sans démarrer un vrai serveur TCP.
 */

// Charger dotenv en premier pour que toutes les variables d'environnement
// soient disponibles avant n'importe quel autre import.
require('dotenv').config();

const app = require('./app');

// ─── Validation des variables d'environnement critiques ─────────────────────

const API_KEY = process.env.API_KEY;
const PORT    = process.env.PORT || 3000;

/**
 * La clé API doit être définie et comporter au moins 32 caractères.
 *
 * Pourquoi 32 caractères minimum ?
 * Une clé de 32 caractères aléatoires représente environ 192 bits d'entropie
 * (en base62), ce qui rend une attaque par force brute computationnellement
 * impossible. En dessous de cette longueur, la sécurité est considérablement
 * réduite.
 *
 * process.exit(1) est utilisé intentionnellement ici : il s'agit d'une erreur
 * de configuration fatale qui doit empêcher le serveur de répondre à des
 * requêtes sans protection. Un crash explicite est préférable à un serveur
 * silencieusement non sécurisé.
 *
 * Requirements: 10.1, 10.3
 */
if (!API_KEY || API_KEY.length < 32) {
  console.error(
    '[ERREUR FATALE] La variable d\'environnement API_KEY est absente ou ' +
    'trop courte (minimum 32 caractères). ' +
    'Copiez .env.example vers .env et renseignez une valeur sécurisée.'
  );
  // Arrêt avec code de sortie 1 = erreur de configuration
  process.exit(1);
}

// ─── Démarrage du serveur ────────────────────────────────────────────────────

/**
 * app.listen() lance l'écoute TCP sur le port spécifié.
 * Le callback de succès confirme dans les logs que le serveur est prêt.
 *
 * Paramètres :
 *   PORT   — numéro de port lu depuis process.env.PORT (défaut : 3000)
 *
 * Retour : l'instance http.Server (non utilisée ici, mais exportable pour
 * les tests si nécessaire).
 */
app.listen(PORT, () => {
  console.log(`[server] Serveur démarré et en écoute sur le port ${PORT}`);
  console.log(`[server] Environnement : ${process.env.NODE_ENV || 'development'}`);
});
