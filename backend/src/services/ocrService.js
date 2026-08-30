/**
 * services/ocrService.js
 *
 * Rôle : encapsuler l'appel à Google Cloud Vision pour extraire le texte
 * (OCR) d'une image stockée localement.
 *
 * Paramètre d'entrée : filePath (string) — chemin absolu ou relatif vers
 *   le fichier image à analyser (JPEG ou PNG).
 * Valeur de retour : Promise<string> — le texte extrait par l'OCR.
 * Erreurs lancées :
 *   - Si l'OCR échoue ou ne répond pas dans les 30 s → Error avec status 502,
 *     que le route handler doit transformer en réponse HTTP 502.
 *
 * Requirements couverts : 1.8 (stockage OCR + notification), 1.9 (timeout 30 s)
 */

'use strict';

const vision = require('@google-cloud/vision');

// Durée maximale d'attente pour la réponse de Google Cloud Vision (en ms).
// Au-delà, on considère que le service est indisponible.
const OCR_TIMEOUT_MS = 30_000;

/**
 * Crée une promesse qui se rejette automatiquement après `ms` millisecondes.
 *
 * Comment fonctionne Promise.race :
 * Promise.race([p1, p2]) retourne une promesse qui se résout ou se rejette
 * dès que la *première* des promesses passées se résout ou se rejette.
 * On l'utilise ici pour imposer un timeout : si l'OCR ne répond pas dans
 * 30 s, la promesse de timeout « gagne la course » et rejette l'ensemble,
 * interrompant l'attente sans laisser la requête OCR en suspens indéfiniment.
 *
 * Pourquoi ce timeout :
 * Google Cloud Vision est un service réseau externe. Une panne, une
 * surcharge ou un problème réseau peut bloquer le serveur Node.js
 * indéfiniment si aucune limite n'est fixée. 30 s est le délai au-delà
 * duquel on préfère informer l'utilisateur d'un échec plutôt que de le
 * laisser attendre sans réponse (Requirement 1.9).
 *
 * @param {number} ms - Délai en millisecondes avant le rejet
 * @returns {Promise<never>} Promesse qui se rejette après `ms` ms
 */
function createTimeoutPromise(ms) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      const err = new Error(
        `Le service OCR n'a pas répondu dans le délai imparti (${ms / 1000} s).`
      );
      err.status = 502;
      reject(err);
    }, ms);
  });
}

/**
 * Extrait le texte d'une image via Google Cloud Vision (TEXT_DETECTION).
 *
 * L'appel est enveloppé dans un Promise.race contre un timeout de 30 s.
 * Si Google Cloud Vision ne répond pas à temps, ou si une erreur survient,
 * la fonction logue l'erreur et lance une exception avec status 502 pour
 * que le route handler retourne un HTTP 502 au client.
 *
 * @param {string} filePath - Chemin vers le fichier image à analyser
 * @returns {Promise<string>} Texte extrait de l'image
 * @throws {Error} Erreur avec .status = 502 en cas d'échec ou de timeout
 */
async function extractTextFromImage(filePath) {
  // Instancier le client Vision à chaque appel pour respecter les credentials
  // chargés via la variable d'environnement GOOGLE_APPLICATION_CREDENTIALS.
  // (Le SDK lit cette variable automatiquement au moment de l'instanciation.)
  const client = new vision.ImageAnnotatorClient();

  // Promesse OCR : envoie le fichier à Google Cloud Vision avec la feature
  // TEXT_DETECTION, qui renvoie le texte brut de l'image entière.
  const ocrPromise = client.textDetection(filePath);

  try {
    // Promise.race déclenche la résolution ou le rejet dès que la première
    // promesse se règle. Si l'OCR répond avant 30 s → on obtient le résultat.
    // Si le timeout expire avant → la promesse de timeout rejette et l'OCR
    // est abandonné (bien que la requête réseau reste ouverte côté Google ;
    // Node.js ne dispose pas de mécanisme natif pour annuler une requête HTTP
    // en cours, mais la promesse résultante est ignorée).
    const [result] = await Promise.race([ocrPromise, createTimeoutPromise(OCR_TIMEOUT_MS)]);

    // L'annotation TEXT_DETECTION retourne un tableau d'annotations textuelles.
    // Le premier élément (index 0) contient le bloc de texte complet de l'image
    // dans sa propriété `description`. Si aucune annotation n'est trouvée
    // (image sans texte lisible), on retourne une chaîne vide.
    const fullTextAnnotation = result.textAnnotations?.[0]?.description ?? '';
    return fullTextAnnotation;

  } catch (err) {
    // Logger l'erreur complète côté serveur pour le débogage, sans l'exposer
    // au client (Requirement 10.4 par analogie — ne pas fuiter les détails internes).
    console.error(
      `[OCR] Échec de l'extraction pour "${filePath}" — ${new Date().toISOString()}:`,
      err.message
    );

    // Si l'erreur vient déjà du timeout (status 502 posé par createTimeoutPromise),
    // on la relance telle quelle. Sinon, on crée une nouvelle erreur 502 générique
    // pour que le route handler puisse retourner la bonne réponse HTTP.
    if (!err.status) {
      err.status = 502;
      err.message = "Le service d'extraction de texte a rencontré une erreur.";
    }
    throw err;
  }
}

module.exports = { extractTextFromImage };
