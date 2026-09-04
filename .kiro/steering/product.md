# Steering — Recettes

## Contexte du projet
Application personnelle de gestion de recettes de cuisine. Projet éducatif :
le développeur est junior, le code doit être commenté et compréhensible,
pas seulement fonctionnel.

## État actuel (septembre 2026)
Le MVP est **en production** sur https://recettes.critiq.ovh

### Stack déployée
- **Backend** : Node.js 22 + Express 4 + SQLite (better-sqlite3) — VPS OVH Debian 12, géré par PM2
- **Frontend** : Vue 3 + Vite 5 + Pinia + Vue Router 4 — servi par Nginx, installable en PWA
- **OCR** : Google Cloud Vision API (TEXT_DETECTION)
- **Structuration IA** : Gemini 3.5 Flash (API AI Studio) — structure le texte OCR en recette JSON
- **HTTPS** : Let's Encrypt via Certbot + Nginx
- **Déploiement** : script `~/deploy.sh` sur le VPS (git pull + npm install + pm2 restart + vite build)

### Fonctionnalités implémentées
- Capture de recette par photo → OCR → Gemini → formulaire pré-rempli (nom + ingrédients + instructions)
- CRUD complet des recettes (créer, lire, modifier, supprimer)
- Catégorisation multi-catégories
- Recherche par nom, ingrédient, catégorie (avec pagination)
- Wake Lock sur la vue détail (écran allumé en cuisine)
- PWA installable (manifest + service worker Workbox)
- Mode hors ligne partiel (recettes récemment consultées disponibles sans réseau)
- Protection par clé API (X-API-Key)

### Variables d'environnement (VPS — backend/.env)
- `API_KEY` : clé partagée frontend/backend
- `GEMINI_API_KEY` : clé AI Studio pour la structuration Gemini
- `GOOGLE_APPLICATION_CREDENTIALS` : chemin vers la clé JSON Google Cloud Vision
- `PORT=3000`, `UPLOADS_DIR=./uploads`, `DB_PATH=./data/recettes.db`

### Variables d'environnement (VPS — frontend/.env.production)
- `VITE_API_KEY` : même valeur que API_KEY

## Langue
- Toute l'interface utilisateur est en français.
- Le contenu des recettes (nom, ingrédients, instructions) est en français.
- Les commentaires de code et la documentation technique sont en anglais
  (convention standard), sauf demande contraire.

## Plateformes cibles
- Web app responsive, installable en PWA (pas d'application native).
- Usage principal : téléphone Android, en cuisine.
- Doit aussi bien fonctionner sur iPhone (Safari) et sur laptop (édition
  des recettes).
- Une seule base de code pour mobile et desktop.

## Architecture
- Backend séparé : stockage (base de données), logique métier, appel aux
  services cloud (OCR + Gemini).
- Pas de système de comptes utilisateurs / authentification multi-utilisateur.
- Usage strictement personnel (un seul utilisateur : le propriétaire).

## Sécurité (important : le repo est public sur GitHub)
- Aucun secret, clé API ou identifiant ne doit jamais être commité — tout
  passe par des variables d'environnement / secrets exclus du repo (.gitignore).
- Même sans comptes utilisateurs, l'accès au backend doit être protégé par
  une clé API partagée (pas d'endpoint totalement ouvert).
- Protection systématique contre l'injection SQL, l'injection de template,
  et la validation/sanitization de toute entrée utilisateur (y compris le
  texte issu de l'OCR).
- Le code doit être écrit en gardant à l'esprit qu'il sera lu publiquement.

## Qualité et méthode
- Développement piloté par les spécifications (specs Kiro) : Requirements
  → Design → Tasks, phase par phase, avec validation explicite à chaque étape.
- Code testé (280 tests backend : unitaires, intégration, property-based avec fast-check).
- Documentation claire (README, commentaires pédagogiques dans le code).
- Versionné avec Git sur GitHub (MonsieurLoki/Recettes), commits propres et compréhensibles.
- Commits réguliers à chaque changement significatif + push vers GitHub.

## Prochaines évolutions envisagées
- Amélioration du design frontend (CSS global, thème cohérent, icônes PWA)
- Nouvelles fonctionnalités à définir (suggestions de recettes, planning de repas, etc.)
- Les fonctionnalités de chatbot vocal sont prévues dans des specs séparées.