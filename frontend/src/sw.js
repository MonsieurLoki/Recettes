/**
 * sw.js — Service Worker personnalisé pour l'application Recettes.
 *
 * Stratégie : injectManifest (vite-plugin-pwa).
 * Workbox injecte la liste des assets précachés dans self.__WB_MANIFEST au
 * moment du build ; ce fichier contient la logique de runtime caching et le
 * handler de fallback hors ligne.
 *
 * Pourquoi injectManifest plutôt que generateSW ?
 *   generateSW génère un SW entièrement automatique mais ne permet pas
 *   d'ajouter de la logique personnalisée (setCatchHandler).
 *   injectManifest laisse le contrôle complet tout en déléguant le précache
 *   à Workbox.
 */

import { clientsClaim } from 'workbox-core'
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import {
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
} from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Prendre le contrôle immédiatement après installation (sans attendre reload)
self.skipWaiting()
clientsClaim()

// ── Précache ──────────────────────────────────────────────────────────────────
// self.__WB_MANIFEST est remplacé par la liste des assets Vite au moment du
// build (injection par vite-plugin-pwa). CacheFirst implicite pour tous ces
// assets (versionnés par hash).
precacheAndRoute(self.__WB_MANIFEST)

// Supprimer les anciens caches lors des mises à jour du service worker
cleanupOutdatedCaches()

// ── Runtime caching ───────────────────────────────────────────────────────────

// GET /api/recipes/:id et sous-ressources → NetworkFirst TTL 24 h (Req. 9.3)
// Tente le réseau en premier ; si absent ou lent, utilise le cache.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && /^\/api\/recipes\/.+/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-recipes-detail-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 }), // 24 h
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

// GET /api/recipes (liste) → NetworkFirst TTL 24 h (Req. 9.3)
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && /^\/api\/recipes(\?.*)?$/.test(url.pathname + url.search),
  new NetworkFirst({
    cacheName: 'api-recipes-list-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 }), // 24 h
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

// GET /api/categories → StaleWhileRevalidate TTL 7 jours (Req. 9.2)
// Retourne immédiatement le cache et met à jour en arrière-plan.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && /^\/api\/categories/.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'api-categories-cache',
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60 }), // 7 jours
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

// ── Fallback hors ligne (Req. 9.4) ───────────────────────────────────────────
// Quand NetworkFirst échoue (offline) et que la ressource n'est pas en cache,
// setCatchHandler intercepte l'erreur. Pour les requêtes /api/recipes/**,
// on répond avec offline.json précaché pour que le frontend puisse afficher
// le message « Cette recette n'est pas disponible sans connexion ».
setCatchHandler(async ({ request, url }) => {
  if (
    request.method === 'GET' &&
    /^\/api\/recipes/.test(url.pathname)
  ) {
    // Récupérer offline.json depuis le précache (toujours disponible hors ligne)
    const cache = await caches.open('workbox-precache-v2')
    const offlineResponse = await cache.match('/offline.json')
    if (offlineResponse) return offlineResponse

    // Fallback de dernier recours si le précache ne contient pas encore offline.json
    return new Response(
      JSON.stringify({
        offline: true,
        message: "Cette recette n'est pas disponible sans connexion.",
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // Pour toutes les autres requêtes : laisser l'erreur se propager
  return Response.error()
})
