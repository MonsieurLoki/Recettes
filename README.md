# Recettes — Application de gestion de recettes

Application web personnelle permettant de capturer des recettes papier par
photo, d'en extraire le texte via OCR, puis de créer, éditer, catégoriser,
rechercher et supprimer des recettes. Installable en tant que PWA.

---

## Architecture

L'application est organisée en **monorepo** avec deux couches indépendantes :

```
recettes/
├── backend/   — API REST Node.js + Express + SQLite
└── frontend/  — Application Vue 3 + Vite (PWA)
```

### Backend (`backend/`)

Serveur Express.js qui expose une API REST JSON protégée par une clé API
partagée (`X-API-Key`). Il gère :

- **CRUD des recettes** avec ingrédients et catégories (SQLite via `better-sqlite3`)
- **Upload de photos** (Multer) et appel à **Google Cloud Vision** pour l'OCR
- **Validation et sanitisation** de toutes les entrées
- **Sécurité HTTP** via `helmet` et limitation du débit via `express-rate-limit`

### Frontend (`frontend/`)

Application Vue 3 compilée par Vite, installable en PWA sur Chrome Android.
Elle communique exclusivement avec le backend via des requêtes HTTP authentifiées.
Fonctionnalités clés :

- Liste et recherche de recettes (par nom, ingrédient, catégorie)
- Saisie et édition de recettes avec validation côté client
- Capture de recettes papier via la caméra du téléphone
- Mode hors ligne partiel (recettes récemment consultées disponibles sans réseau)

### Flux OCR complet

```
Navigateur → POST /api/photos (multipart) → Multer (stockage local)
→ Validation (format/taille/résolution)
→ Google Cloud Vision API (TEXT_DETECTION)
→ Extraction du nom candidat (5 premiers mots)
→ Brouillon de recette en base SQLite
→ Réponse 201 { recipe_id, ocr_text, suggested_name }
→ Utilisateur complète et enregistre la recette
```

---

## Prérequis

| Outil | Version minimale | Notes |
|---|---|---|
| **Node.js** | 20 LTS | [nodejs.org](https://nodejs.org) |
| **npm** | 10 | Inclus avec Node.js 20 |
| **Compte Google Cloud** | — | [console.cloud.google.com](https://console.cloud.google.com) — activer l'API Cloud Vision |
| **Navigateur** | Chrome 90+, Safari 15+, Firefox 110+ | Chrome recommandé pour la PWA et Wake Lock |

---

## Lancement local

1. **Cloner le dépôt**
   ```bash
   git clone <url-du-depot>
   cd recettes
   ```

2. **Configurer les variables d'environnement**
   ```bash
   cp .env.example .env
   # Éditez .env et renseignez toutes les valeurs (voir section ci-dessous)
   ```

3. **Installer les dépendances du backend**
   ```bash
   cd backend
   npm install
   cd ..
   ```

4. **Installer les dépendances du frontend**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

5. **Lancer le backend** (dans un terminal dédié)
   ```bash
   cd backend
   npm run dev
   # Le serveur écoute sur http://localhost:3000
   ```

6. **Lancer le frontend** (dans un second terminal)
   ```bash
   cd frontend
   npm run dev
   # L'application est accessible sur http://localhost:5173
   ```

7. **Ouvrir l'application** dans le navigateur :
   `http://localhost:5173`

> **Note PWA :** Pour tester l'installation PWA sur Android, servez l'application
> en HTTPS (ex. via un tunnel ngrok) et ouvrez-la dans Chrome.

---

## Variables d'environnement

Copiez `.env.example` → `.env` et renseignez chaque variable.
**Ne committez jamais le fichier `.env`** — il est exclu par `.gitignore`.

| Variable | Description | Format | Sensibilité |
|---|---|---|---|
| `API_KEY` | Clé secrète partagée entre le frontend et le backend (en-tête `X-API-Key`) | Chaîne aléatoire ≥ 32 caractères | 🔴 Secrète |
| `GOOGLE_APPLICATION_CREDENTIALS` | Chemin vers le fichier JSON du compte de service Google Cloud | Chemin absolu vers un fichier `.json` | 🔴 Secrète |
| `PORT` | Port d'écoute du serveur Express | Entier 1024–65535 (défaut : `3000`) | 🟢 Publique |
| `UPLOADS_DIR` | Dossier de stockage des photos uploadées | Chemin relatif ou absolu (défaut : `./uploads`) | 🟢 Publique |
| `DB_PATH` | Chemin vers le fichier SQLite | Chemin relatif ou absolu (défaut : `./data/recettes.db`) | 🟢 Publique |
| `VITE_API_KEY` | Clé API lue par le frontend Vite (`import.meta.env.VITE_API_KEY`) — doit être identique à `API_KEY` | Même valeur que `API_KEY` | 🔴 Secrète |

> Pour générer une clé API sécurisée :
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Tests (backend)

```bash
cd backend
npm test           # tous les tests (unitaires + intégration + propriétés)
npm run test:unit  # tests unitaires uniquement
npm run test:int   # tests d'intégration uniquement
npm run test:props # tests de propriétés (fast-check)
```

---

## Structure du projet

```
recettes/
├── .env.example          — Variables d'environnement documentées (aucune valeur réelle)
├── .gitignore            — Exclut node_modules/, .env, uploads/, data/
├── README.md             — Ce fichier
├── backend/
│   ├── src/
│   │   ├── app.js        — Configuration Express (middlewares, routes)
│   │   ├── server.js     — Point d'entrée (listen, validation démarrage)
│   │   ├── db/           — Connexion SQLite et migrations
│   │   ├── middleware/   — auth.js, errorHandler.js
│   │   ├── routes/       — categories.js, recipes.js, photos.js
│   │   ├── services/     — ocrService.js, ocrNameExtractor.js
│   │   ├── utils/        — sanitize.js
│   │   └── validators/   — recipeValidator.js, categoryValidator.js, …
│   └── tests/
│       ├── unit/         — Tests unitaires (Vitest)
│       └── integration/  — Tests d'intégration (Vitest + supertest)
└── frontend/
    ├── src/
    │   ├── App.vue       — Composant racine
    │   ├── main.js       — Point d'entrée Vue
    │   ├── router/       — Vue Router 4
    │   ├── stores/       — Stores Pinia (recipes, categories)
    │   ├── components/   — Composants réutilisables
    │   ├── views/        — Vues (pages)
    │   └── services/     — api.js (wrapper fetch)
    └── public/
        ├── manifest.webmanifest  — Manifeste PWA
        ├── offline.json          — Fallback hors ligne
        └── icons/                — Icônes PWA (192 et 512 px)
```
