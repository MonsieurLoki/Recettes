/**
 * api.js — Wrapper fetch centralisé pour toutes les requêtes vers l'API backend.
 *
 * Pourquoi centraliser les appels API ?
 *   - Ajouter automatiquement l'en-tête X-API-Key à chaque requête (Req. 10.1).
 *   - Uniformiser la gestion des erreurs HTTP sans dupliquer le code dans
 *     chaque composant ou store.
 *   - Faciliter les tests et les changements de configuration (URL de base,
 *     en-têtes communs) sans toucher à tous les appels.
 *
 * Comment lire les variables d'environnement Vite ?
 *   Vite expose uniquement les variables dont le nom commence par VITE_ via
 *   import.meta.env. Elles sont remplacées statiquement au moment du build
 *   (tree-shaking), ce qui les distingue des variables Node.js (process.env).
 *   Exemple : VITE_API_KEY=ma-cle → import.meta.env.VITE_API_KEY === 'ma-cle'
 */

/**
 * Classe d'erreur personnalisée pour les erreurs HTTP de l'API.
 * Permet aux consommateurs de distinguer les erreurs de validation (400/409)
 * des erreurs serveur (5xx) et de les traiter différemment.
 */
export class ApiError extends Error {
  constructor(status, message, errors = null) {
    super(message)
    this.status = status
    this.errors = errors  // { champ: message } pour les erreurs 400
  }
}

/**
 * apiFetch — Wrapper autour de fetch() pour les requêtes vers l'API backend.
 *
 * Ajoute automatiquement :
 *   - L'en-tête X-API-Key (Req. 10.1)
 *   - Content-Type: application/json pour les requêtes avec corps
 *
 * Gestion des erreurs :
 *   - 400/409 : lance ApiError avec errors = { champ: message } (erreurs de validation)
 *   - 401 : lance ApiError(401, ...) — clé API manquante ou invalide
 *   - 5xx : lance ApiError(status, message générique) sans exposer les détails internes
 *   - Erreur réseau : propage l'erreur fetch native
 *
 * @param {string} path - Chemin de l'API, ex. '/api/recipes' ou '/api/recipes/42'
 * @param {RequestInit} [options={}] - Options fetch standard (method, body, headers…)
 * @returns {Promise<any>} Données JSON de la réponse en cas de succès
 * @throws {ApiError} En cas d'erreur HTTP
 */
export async function apiFetch(path, options = {}) {
  const headers = {
    // Ajouter la clé API depuis la variable d'environnement Vite (Req. 10.1).
    // VITE_API_KEY doit être définie dans .env.local (jamais committée).
    'X-API-Key': import.meta.env.VITE_API_KEY ?? '',
    ...options.headers,
  }

  // Ajouter Content-Type: application/json pour les requêtes avec corps JSON.
  // On ne l'ajoute pas pour les FormData (upload de photos) qui ont leur
  // propre Content-Type avec boundary.
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(path, { ...options, headers })

  // Réponse 204 No Content (DELETE) : pas de corps JSON à parser
  if (response.status === 204) {
    return null
  }

  let data
  try {
    data = await response.json()
  } catch {
    // La réponse n'est pas du JSON valide (ex. erreur HTML du serveur)
    throw new ApiError(response.status, `Erreur serveur (${response.status})`)
  }

  // Détecter la réponse de fallback offline renvoyée par le service worker (Req. 9.4).
  // Quand une recette n'est pas en cache et que le réseau est absent, le SW
  // retourne offline.json avec { offline: true, message: "..." }.
  // On lance une ApiError(503) pour que les composants puissent afficher le
  // message approprié sans traiter la donnée comme une vraie réponse API.
  if (data && data.offline === true) {
    throw new ApiError(
      503,
      data.message ?? "Cette recette n'est pas disponible sans connexion."
    )
  }

  if (!response.ok) {
    // Erreurs de validation (400) et conflits (409) : propager les détails
    if (response.status === 400 || response.status === 409) {
      throw new ApiError(
        response.status,
        data.error ?? 'Données invalides',
        data.details ?? null
      )
    }
    // Erreur d'authentification (401)
    if (response.status === 401) {
      throw new ApiError(401, 'Accès non autorisé. Vérifiez la clé API.')
    }
    // Erreurs serveur (5xx) et autres : message générique sans données internes
    throw new ApiError(
      response.status,
      response.status >= 500
        ? `Le serveur a rencontré une erreur. Réessayez dans quelques instants.`
        : data.error ?? `Erreur HTTP ${response.status}`
    )
  }

  return data
}
