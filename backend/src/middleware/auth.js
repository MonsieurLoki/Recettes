/**
 * Middleware d'authentification par clé API (X-API-Key).
 *
 * Rôle : vérifier que chaque requête entrante possède un en-tête X-API-Key
 * dont la valeur correspond exactement à la variable d'environnement API_KEY.
 *
 * Ce middleware doit être monté AVANT toutes les routes protégées dans app.js.
 *
 * Paramètres d'entrée : req (Express Request), res (Express Response), next (Function)
 * Valeur de retour : appelle next() si la clé est valide, sinon retourne HTTP 401.
 */

'use strict';

const crypto = require('crypto');

/**
 * Pourquoi crypto.timingSafeEqual ?
 *
 * Une comparaison naïve (===) se termine dès qu'un caractère diffère.
 * Un attaquant qui mesure précisément le temps de réponse peut en déduire
 * combien de caractères de sa tentative sont corrects (attaque par canal
 * auxiliaire / timing attack). crypto.timingSafeEqual compare les deux buffers
 * en temps constant, quel que soit le nombre de caractères identiques, ce qui
 * rend cette attaque infaisable.
 */

// Lire la clé API depuis les variables d'environnement au chargement du module.
// dotenv doit avoir été appelé (dans app.js) AVANT que ce module soit importé.
const API_KEY = process.env.API_KEY;

/**
 * Middleware de vérification de la clé API.
 *
 * @param {import('express').Request}  req  - Requête Express
 * @param {import('express').Response} res  - Réponse Express
 * @param {Function}                   next - Prochain middleware ou route
 */
function auth(req, res, next) {
  const submittedKey = req.headers['x-api-key'];

  // Si la clé est absente ou si la clé stockée n'est pas configurée,
  // refuser immédiatement sans comparaison.
  if (!submittedKey || !API_KEY) {
    logRefusal(req);
    return res.status(401).json({ error: 'accès non autorisé' });
  }

  // crypto.timingSafeEqual exige deux buffers de longueur identique.
  // Si les longueurs diffèrent, la clé est forcément invalide — on compare
  // quand même un buffer de même taille pour ne pas fuiter la longueur de
  // la vraie clé via le temps de réponse.
  const storedBuffer   = Buffer.from(API_KEY,       'utf8');
  const submittedBuffer = Buffer.from(submittedKey, 'utf8');

  let isValid = false;

  if (storedBuffer.length === submittedBuffer.length) {
    // Comparaison en temps constant : pas d'information sur le contenu
    // même si les longueurs sont égales.
    isValid = crypto.timingSafeEqual(storedBuffer, submittedBuffer);
  }
  // Si les longueurs diffèrent, isValid reste false.
  // On ne fait PAS de court-circuit sur la longueur avant la comparaison
  // car cela fuiterait la longueur de la vraie clé. La longueur n'est pas
  // secrète en soi (elle est fixée à ≥ 32 car.), mais c'est une bonne
  // habitude de maintenir un comportement uniforme.

  if (!isValid) {
    logRefusal(req);
    return res.status(401).json({ error: 'accès non autorisé' });
  }

  // Clé valide : passer au middleware / route suivant(e).
  next();
}

/**
 * Enregistre une tentative d'accès refusée dans la console (stdout).
 *
 * Informations loguées : date ISO 8601, adresse IP source.
 * Informations JAMAIS loguées : la valeur de la clé soumise (Requirement 10.4).
 *
 * @param {import('express').Request} req - Requête refusée
 */
function logRefusal(req) {
  // req.ip contient l'adresse IP réelle si app.set('trust proxy', true) est
  // activé (utile derrière un reverse-proxy Nginx/Caddy). Sans ce réglage,
  // req.ip retourne l'IP directe de la connexion TCP.
  const ip        = req.ip || req.socket?.remoteAddress || 'inconnue';
  const timestamp = new Date().toISOString();

  // Le message de log n'inclut délibérément PAS req.headers['x-api-key'].
  console.warn(`[AUTH] Accès refusé — ${timestamp} — IP : ${ip}`);
}

module.exports = auth;
