# Implementation Plan: Recipe Management MVP

## Overview

Ce plan découpe le MVP en étapes incrémentales couvrant l'initialisation du
monorepo, le backend Express + SQLite, la validation, les routes, les tests
property-based, le frontend Vue 3, la PWA et la documentation finale.

Chaque tâche est autonome et s'appuie sur les précédentes. Les sous-tâches
marquées `*` sont optionnelles (tests) et peuvent être sautées pour un MVP
rapide — elles restent fortement recommandées pour un projet pédagogique.

---

## Tasks

- [x] 1. Initialisation du monorepo et des fichiers de base
  - [x] 1.1 Créer la structure de dossiers du monorepo
    - Créer les dossiers `frontend/` et `backend/` à la racine du dépôt
    - Initialiser `package.json` dans chaque sous-dossier (`npm init -y`)
    - Créer un `package.json` racine avec des scripts `start`, `dev`, `test`
      qui délèguent aux sous-dossiers via `npm --workspace`
    - _Requirements: 11.6_

  - [x] 1.2 Créer le fichier `.gitignore` racine
    - Exclure : `.env`, `.env.local`, `.env.production`, `node_modules/`,
      `__pycache__/`, `*.key`, `*.pem`, `secrets.*`,
      `backend/uploads/`, `backend/data/`
    - _Requirements: 11.3_

  - [x] 1.3 Créer le fichier `.env.example` documenté
    - Inclure toutes les variables : `API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`,
      `PORT`, `UPLOADS_DIR`, `DB_PATH`
    - Ajouter des commentaires expliquant chaque variable et son format attendu
    - Ne jamais inclure de vraie valeur — uniquement des placeholders lisibles
    - _Requirements: 11.2_

  - [x] 1.4 Créer le squelette du README racine
    - Sections vides à remplir en fin de projet : description de l'architecture,
      prérequis logiciels avec versions, étapes de lancement local,
      structure des variables d'environnement
    - _Requirements: 11.6_

- [x] 2. Backend — infrastructure Express et middleware globaux
  - [x] 2.1 Installer les dépendances backend et configurer le projet
    - Installer : `express`, `better-sqlite3`, `multer`, `sharp`,
      `@google-cloud/vision`, `dotenv`, `helmet`, `express-rate-limit`
    - Installer en devDependencies : `vitest`, `supertest`, `fast-check`
    - Ajouter les scripts npm : `start`, `dev` (nodemon), `test`,
      `test:unit`, `test:props`, `test:int`
    - _Requirements: 11.4_

  - [x] 2.2 Créer `backend/src/app.js` — configuration Express
    - Charger `dotenv` en tout premier
    - Appliquer `helmet()` pour les en-têtes de sécurité HTTP
    - Appliquer `express-rate-limit` (fenêtre 15 min, max 100 req)
    - Parser JSON (`express.json()`) et multipart (Multer via les routes)
    - Monter les routes `/api/recipes`, `/api/categories`, `/api/photos`
    - Monter le middleware `errorHandler` en dernier
    - Commenter chaque bloc : rôle, ordre d'application, raison sécuritaire
    - _Requirements: 10.1, 11.5_

  - [x] 2.3 Créer `backend/src/server.js` — point d'entrée
    - Valider au démarrage que `API_KEY` est définie et ≥ 32 caractères ;
      faire un `process.exit(1)` commenté si la condition n'est pas remplie
    - Faire `app.listen(PORT)` avec un message de log indiquant le port
    - _Requirements: 10.1, 10.3_

  - [x] 2.4 Créer `backend/src/middleware/auth.js` — vérification X-API-Key
    - Lire `API_KEY` depuis `process.env` (chargé par dotenv dans `app.js`)
    - Comparer l'en-tête `X-API-Key` avec `crypto.timingSafeEqual` pour
      éviter les attaques timing
    - Retourner `HTTP 401` + `{ "error": "accès non autorisé" }` si absent
      ou invalide — sans aucune donnée applicative dans le corps
    - Logger chaque refus : date, heure, IP source — sans la valeur soumise
    - Documenter pourquoi `timingSafeEqual` est utilisé (commentaire pédagogique)
    - _Requirements: 10.1, 10.2, 10.4_

  - [x] 2.5 Créer `backend/src/middleware/errorHandler.js` — gestionnaire global
    - Intercepter toutes les erreurs non traitées (`(err, req, res, next)`)
    - Retourner un JSON structuré pour les erreurs de validation (400) :
      `{ "error": "Données invalides", "details": { champ: message } }`
    - Retourner un message générique pour les erreurs 5xx sans fuite interne
    - Commenter : différence entre erreur opérationnelle et erreur de programme
    - _Requirements: 11.5_

- [x] 3. Backend — base de données SQLite
  - [x] 3.1 Créer `backend/src/db/database.js` — connexion et initialisation
    - Ouvrir la base SQLite via `better-sqlite3` avec le chemin `DB_PATH`
    - Lire et exécuter le fichier de migration `001_initial.sql` au démarrage
      si les tables n'existent pas encore (idempotent grâce à `IF NOT EXISTS`)
    - Exporter l'instance `db` pour utilisation dans les routes
    - Commenter : pourquoi SQLite est adapté au single-user, différence avec
      un ORM
    - _Requirements: 5.1, 5.5_

  - [x] 3.2 Créer `backend/src/db/migrations/001_initial.sql`
    - Table `categories` (id, name UNIQUE COLLATE NOCASE, created_at)
    - Insérer les 8 catégories par défaut avec `INSERT OR IGNORE`
    - Table `recipes` (id, name UNIQUE COLLATE NOCASE, instructions, ocr_text,
      photo_path, created_at, updated_at)
    - Table `ingredients` (id, recipe_id FK CASCADE, name, quantity, unit,
      position)
    - Table `recipe_categories` (recipe_id, category_id, PRIMARY KEY composite)
    - Index `idx_recipes_name` et `idx_ingredients_name`
    - Commenter chaque table : son rôle et ses contraintes clés
    - _Requirements: 4.1, 5.1, 5.5_

- [x] 4. Backend — validation et sanitisation
  - [x] 4.1 Créer `backend/src/utils/sanitize.js`
    - Fonction `sanitizeText(str)` : `trim()` + suppression des balises HTML
      exécutables (`<script`, `<style`, attributs `on*`)
    - Fonction `sanitizeOcrText(str)` : mêmes règles + rejet si contient
      `{{`, `<%`, `<script`
    - Documenter chaque fonction : rôle, paramètres, valeur de retour,
      exemples dans les commentaires
    - _Requirements: 2.6, 5.8, 11.5_

  - [x] 4.2 Créer `backend/src/validators/recipeValidator.js`
    - `validateCreateRecipe(body, db)` : vérifie nom (non vide, ≤ 200 car.,
      unique insensible à la casse), ingrédients (1–50 entrées),
      instructions (non vides, ≤ 10 000 car.), catégories (0–10 IDs)
    - `validateUpdateRecipe(id, body, db)` : mêmes règles + exclure la
      recette courante du check d'unicité
    - Toutes les requêtes DB utilisent des prepared statements avec `?`
    - Retourner `{ valid: true }` ou `{ valid: false, errors: { champ: msg } }`
    - Commenter chaque règle avec la référence requirement correspondante
    - _Requirements: 5.2, 5.3, 5.7, 5.8, 11.1_

  - [x] 4.3 Créer `backend/src/validators/categoryValidator.js`
    - `validateCreateCategory(body, db)` : vérifie nom (non vide, ≤ 100 car.,
      unique insensible à la casse et aux espaces de début/fin)
    - Retourner `{ valid: true }` ou `{ valid: false, errors: { name: msg } }`
    - _Requirements: 4.5, 4.6_

  - [x] 4.4 Créer `backend/src/validators/photoValidator.js`
    - `validatePhotoFile(file)` : vérifie format MIME (image/jpeg ou image/png),
      taille ≤ 10 Mo, résolution ≥ 640×480 px via `sharp` (métadonnées)
    - Retourner `{ valid: true }` ou `{ valid: false, error: msg }`
    - Commenter pourquoi `sharp` est utilisé pour lire les métadonnées sans
      charger l'image entière en mémoire
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 4.5 Créer `backend/src/validators/searchValidator.js`
    - `validateSearchParams(query)` : vérifie `name` et `ingredient` (≤ 100 car.,
      pas de caractères de contrôle U+0000–U+001F), `page` ≥ 1, `limit` 1–100
    - Retourner `{ valid: true }` ou `{ valid: false, errors: { ... } }`
    - _Requirements: 7.1, 7.8_

- [x] 5. Backend — service OCR et extraction du nom candidat
  - [x] 5.1 Créer `backend/src/services/ocrService.js`
    - Fonction `extractTextFromImage(filePath)` : appeler
      `@google-cloud/vision` avec `TEXT_DETECTION`
    - Envelopper l'appel dans `Promise.race` avec un timeout de 30 s
      (utiliser une promesse rejetée par `setTimeout`)
    - En cas d'erreur ou de timeout : logger l'erreur et lancer une exception
      que le route handler transforme en réponse 502
    - Commenter : comment fonctionne `Promise.race`, pourquoi ce timeout
    - _Requirements: 1.8, 1.9_

  - [x] 5.2 Créer `backend/src/services/ocrNameExtractor.js`
    - Fonction `extractCandidateName(ocrText)` : récupérer les 5 premiers
      mots non vides, les joindre par un espace, tronquer à 200 caractères
    - Retourner `""` si `ocrText` est vide ou sans mot
    - Commenter : définition de « mot non vide », comportement de troncature
    - _Requirements: 3.1, 3.2_

- [x] 6. Backend — routes API
  - [x] 6.1 Créer `backend/src/routes/categories.js`
    - `GET /api/categories` : retourner toutes les catégories triées par nom
    - `POST /api/categories` : valider avec `categoryValidator`, sanitiser
      le nom, insérer avec prepared statement, retourner 201 + catégorie créée
    - Commenter chaque route : méthode HTTP, description, codes de retour
    - _Requirements: 4.1, 4.4, 4.5, 4.7_

  - [x] 6.2 Créer `backend/src/routes/photos.js`
    - Configurer Multer : stockage `UPLOADS_DIR`, filtre MIME (jpeg/png),
      limite 10 Mo
    - `POST /api/photos` : appliquer auth, multer, `photoValidator` (format,
      taille, résolution via sharp), appeler `ocrService`, appeler
      `ocrNameExtractor`, créer un brouillon de recette en DB avec `ocr_text`
      et `photo_path`, retourner 201 + `{ recipe_id, ocr_text, suggested_name }`
    - Gérer les erreurs Multer séparément (fichier trop grand → 400)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.1, 3.2_

  - [x] 6.3 Créer `backend/src/routes/recipes.js` — lecture
    - `GET /api/recipes` : valider les query params avec `searchValidator`,
      construire la requête SQLite dynamiquement avec prepared statements
      (jointure ingredients + recipe_categories), paginer avec `LIMIT`/`OFFSET`
    - `GET /api/recipes/:id` : retourner la recette complète avec ingrédients
      et catégories ; 404 si inexistante
    - Commenter la construction de la requête dynamique (sécurité prepared
      statements vs concaténation)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1_

  - [x] 6.4 Créer `backend/src/routes/recipes.js` — écriture (CRUD)
    - `POST /api/recipes` : valider avec `recipeValidator`, sanitiser tous les
      champs texte, insérer recette + ingrédients + liaisons catégories dans
      une transaction SQLite, retourner 201 + recette complète
    - `PUT /api/recipes/:id` : même validation, mettre à jour en transaction
      (DELETE + INSERT des ingrédients et catégories), mettre à jour
      `updated_at`, retourner 200 + recette complète
    - `DELETE /api/recipes/:id` : vérifier l'existence (404 si absent),
      supprimer en cascade (SQLite `ON DELETE CASCADE`), retourner 204
    - Commenter : pourquoi les transactions, comment fonctionne la cascade
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 11.1_

- [x] 7. Checkpoint — Backend complet
  - Vérifier que le serveur démarre sans erreur : `node backend/src/server.js`
  - Tester manuellement les routes principales avec un outil comme curl ou
    un fichier `.http`
  - S'assurer que les erreurs (401, 400, 404, 409) retournent bien le bon format
  - Poser des questions à l'utilisateur si des points restent flous.

- [ ] 8. Backend — tests unitaires
  - [ ] 8.1 Créer `backend/tests/unit/sanitize.test.js`
    - Tester `sanitizeText` : trim, suppression balises `<script>`, attributs
      `onclick`
    - Tester `sanitizeOcrText` : rejet des séquences `{{`, `<%`, `<script`
    - _Requirements: 2.6, 5.8_

  - [x] 8.2 Créer `backend/tests/unit/validators.test.js`
    - Couvrir tous les cas documentés dans la Testing Strategy du design :
      nom vide, nom trop long, doublon casse, texte OCR vide/trop long/balisé,
      ingrédients hors limites, instructions vides/trop longues,
      catégories hors limite, terme de recherche avec caractère de contrôle,
      fichier non JPEG/PNG, fichier > 10 Mo, image < 640×480 px
    - _Requirements: 1.4, 1.5, 1.6, 2.3, 2.5, 2.6, 3.5, 3.6, 4.5, 5.2, 7.8, 11.4_

  - [ ] 8.3 Créer `backend/tests/unit/ocrNameExtractor.test.js`
    - Cas : texte avec 5+ mots → 5 premiers, texte avec 3 mots → 3 mots,
      texte vide → `""`, texte très long → tronqué à 200 car.
    - _Requirements: 3.1, 3.2_

- [ ] 9. Backend — tests d'intégration
  - [ ] 9.1 Créer `backend/tests/integration/categories.test.js`
    - Utiliser une DB SQLite en mémoire (`:memory:`) initialisée avant chaque
      fichier de test via le module `database.js`
    - Tester : GET liste, POST catégorie valide → 201, POST doublon → 409,
      POST nom vide → 400
    - _Requirements: 4.1, 4.4, 4.5, 11.4_

  - [ ] 9.2 Créer `backend/tests/integration/recipes.test.js`
    - Tester le CRUD complet : créer valide → 201, lire → 200 + données
      complètes, mettre à jour → 200 + données modifiées, supprimer → 204 +
      absent de la liste, supprimer inexistant → 404
    - Tester les filtres de recherche : par nom, par catégorie, par ingrédient,
      combiné, aucun résultat → liste vide + message
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 6.1, 6.2, 7.2, 7.3, 7.4, 7.5, 11.4_

  - [ ] 9.3 Créer `backend/tests/integration/photos.test.js`
    - Mocker `@google-cloud/vision` pour isoler la logique backend
    - Tester : upload JPEG valide → 201 + ocr_text + suggested_name,
      upload PNG valide → 201, upload mauvais format → 400,
      upload > 10 Mo → 400, image < 640×480 → 400,
      OCR timeout (mock) → 502
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 3.1_

- [ ] 10. Backend — tests de propriétés (fast-check)
  - [ ] 10.1 Créer `backend/tests/unit/properties/validators.property.test.js` — Properties 1, 2, 3
    - Annoter chaque test : `// Feature: recipe-management-mvp, Property N: ...`
    - **Property 1 :** Pour tout texte vide ou whitespace-only (généré par
      `fc.stringMatching(/^[\s]*$/)`) soumis comme nom, catégorie ou
      instructions, le validateur rejette
    - **Property 2 :** Pour tout texte dont la longueur dépasse la limite du
      champ (généré par `fc.string({ minLength: limit+1 })`), le validateur
      rejette
    - **Property 3 :** Pour tout texte contenant `{{`, `<%` ou `<script`
      (généré par `fc.string()` auquel on concatène la séquence), le validateur
      rejette
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.5, 3.6, 4.5, 5.2, 7.1_

  - [ ] 10.2 Écrire le test de propriété pour Property 4 (extraction nom OCR)
    - **Property 4 :** Pour tout texte OCR avec ≥ 1 mot, le résultat contient
      au plus 5 mots et ≤ 200 car. ; pour tout texte vide, retourne `""`
    - _Requirements: 3.1, 3.2_

  - [ ] 10.3 Écrire le test de propriété pour Properties 5, 6, 7, 8 (recherche)
    - **Property 5 :** Toutes les recettes retournées par `?name=t` contiennent
      `t` dans leur nom (insensible à la casse)
    - **Property 6 :** Toutes les recettes retournées par `?categories=c1,c2`
      sont associées à chacune des catégories c1 et c2
    - **Property 7 :** Toutes les recettes retournées par `?ingredient=t`
      possèdent un ingrédient contenant `t`
    - **Property 8 :** La combinaison nom + catégories respecte la logique ET
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [ ] 10.4 Écrire le test de propriété pour Property 9 (auth)
    - **Property 9 :** Pour toute requête sans clé ou avec clé incorrecte,
      la réponse est HTTP 401 et ne contient pas de données applicatives
    - _Requirements: 10.2_

  - [ ] 10.5 Écrire le test de propriété pour Property 10 (validation fichier)
    - **Property 10 :** Tout fichier hors contraintes (format, taille,
      résolution) est rejeté avec HTTP 400 et un message indiquant la
      contrainte violée
    - _Requirements: 1.4, 1.5, 1.6_

  - [ ] 10.6 Écrire le test de propriété pour Properties 11, 12, 13 (cohérence données)
    - **Property 11 :** Après `DELETE /api/recipes/:id` réussi, `GET /api/recipes`
      ne contient pas l'id supprimé
    - **Property 12 :** Round-trip : une recette créée puis lue est identique
      (nom, instructions, ingrédients, catégories)
    - **Property 13 :** L'unicité est vérifiée insensiblement à la casse et aux
      espaces de début/fin
    - _Requirements: 4.5, 5.1, 5.5, 5.7, 6.2_

  - [ ] 10.7 Écrire le test de propriété pour Properties 14, 15, 16
    - **Property 14 :** Tout terme de recherche avec un caractère U+0000–U+001F
      est rejeté avant interrogation DB
    - **Property 15 :** Le formatage des instructions produit n étapes numérotées
      de 1 à n dans l'ordre
    - **Property 16 :** Les logs de refus contiennent IP/date mais pas la valeur
      de la clé soumise
    - _Requirements: 7.8, 8.1, 10.4_

- [ ] 11. Checkpoint — Tests backend
  - Lancer `npm test` depuis `backend/` et vérifier que tous les tests passent
  - Corriger les éventuels échecs avant de passer au frontend
  - Poser des questions à l'utilisateur si des comportements sont inattendus.

- [ ] 12. Frontend — infrastructure Vue 3
  - [ ] 12.1 Initialiser le projet Vite + Vue 3 dans `frontend/`
    - `npm create vite@latest frontend -- --template vue`
    - Installer : `vue-router@4`, `pinia@2`, `vite-plugin-pwa@0.20`
    - Configurer `vite.config.js` : alias `@` → `src/`, proxy dev vers
      `http://localhost:3000` pour `/api`
    - _Requirements: 9.1, 9.2_

  - [ ] 12.2 Créer `frontend/src/services/api.js` — wrapper fetch centralisé
    - Fonction `apiFetch(path, options)` : ajouter automatiquement l'en-tête
      `X-API-Key` depuis `import.meta.env.VITE_API_KEY`
    - Intercepter les erreurs HTTP (400 → propager `errors`, 5xx → erreur
      globale)
    - Commenter : pourquoi centraliser les appels API, comment lire les vars
      d'environnement Vite
    - _Requirements: 10.1_

  - [ ] 12.3 Configurer Vue Router dans `frontend/src/router/index.js`
    - Routes : `/` → `HomeView`, `/recipes/:id` → `RecipeDetailView`,
      `/recipes/:id/edit` → `RecipeEditView`, `/capture` → `PhotoCaptureView`
    - Mode history (`createWebHistory`)
    - _Requirements: 8.1, 9.1_

  - [ ] 12.4 Créer les stores Pinia
    - `frontend/src/stores/recipes.js` : état `recipes`, `currentRecipe`,
      `total`, `page`, actions `fetchRecipes(filters)`, `fetchRecipe(id)`,
      `createRecipe`, `updateRecipe`, `deleteRecipe`
    - `frontend/src/stores/categories.js` : état `categories`,
      actions `fetchCategories`, `createCategory`
    - Commenter chaque action : ce qu'elle fait, ce qu'elle retourne,
      comment elle gère les erreurs
    - _Requirements: 5.1, 5.4, 6.1, 7.1_

- [ ] 13. Frontend — composants réutilisables
  - [ ] 13.1 Créer `frontend/src/components/LoadingSpinner.vue`
    - Spinner ≥ 24×24 px, contraste élevé, visible sur fond clair et sombre
    - Props : `size` (défaut 24), `label` (texte accessible pour lecteur d'écran)
    - Attribut `aria-live="polite"` et `role="status"` pour l'accessibilité
    - _Requirements: 9.7_

  - [ ] 13.2 Créer `frontend/src/components/SearchBar.vue`
    - Deux champs : recherche par nom (max 100 car.) et par ingrédient
      (max 100 car.)
    - Émettre un événement `search` avec `{ name, ingredient }` à chaque
      changement (debounce 300 ms recommandé)
    - Labels en français, `maxlength` HTML + validation côté JS
    - Surface tactile ≥ 44×44 px pour chaque champ
    - _Requirements: 7.1, 7.8, 9.5_

  - [ ] 13.3 Créer `frontend/src/components/CategorySelector.vue`
    - Afficher la liste des catégories sous forme de cases à cocher (multi-select)
    - Section « Nouvelle catégorie » avec champ + bouton « Ajouter »
    - Émettre les événements `update:modelValue` (tableau d'IDs) et
      `category-created`
    - _Requirements: 4.2, 4.3, 4.4, 9.5_

  - [ ] 13.4 Créer `frontend/src/components/RecipeCard.vue`
    - Afficher : nom de la recette, liste des catégories, date de mise à jour
    - Lien vers la vue détail (`/recipes/:id`)
    - Surface tactile ≥ 44×44 px sur toute la carte
    - Rôle `article` pour l'accessibilité
    - _Requirements: 8.1, 9.1, 9.5_

  - [ ] 13.5 Créer `frontend/src/components/RecipeForm.vue`
    - Champs : nom (input texte), catégories (CategorySelector), ingrédients
      (liste dynamique avec ajout/suppression), instructions (textarea)
    - Afficher les erreurs inline sous chaque champ invalide
    - Bouton « Enregistrer » déclenche la validation locale puis l'envoi
    - Message de confirmation visible ≥ 3 secondes après succès (via `setTimeout`)
    - Tous les libellés en français courant
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 9.5, 9.6_

- [ ] 14. Frontend — vues
  - [ ] 14.1 Créer `frontend/src/views/HomeView.vue`
    - Afficher `SearchBar` + filtre par catégories (CategorySelector en mode
      filtre) + liste de `RecipeCard`
    - Appeler `recipesStore.fetchRecipes(filters)` à chaque changement de
      filtre
    - Afficher « Aucune recette trouvée » si `total === 0`
    - Afficher `LoadingSpinner` pendant les requêtes > 500 ms (avec `setTimeout`
      et annulation si la réponse arrive avant)
    - Bouton « Ajouter par photo » (→ `/capture`) et « Nouvelle recette »
      (→ `/recipes/new/edit`) avec surface tactile ≥ 44×44 px
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.1, 9.5, 9.7_

  - [ ] 14.2 Créer `frontend/src/views/RecipeDetailView.vue`
    - Afficher le nom, les catégories, les ingrédients (quantité + unité + nom)
      et les instructions en étapes numérotées
    - Si aucune instruction : afficher le message prévu
    - Taille de texte ≥ 16 px, contraste ≥ 4,5:1 (vérifier avec les outils
      de dev Chrome)
    - Activer Wake Lock via `navigator.wakeLock.request('screen')` dans
      `onMounted`, libérer dans `onBeforeUnmount`, ignorer silencieusement
      `TypeError` et `NotAllowedError`
    - Boutons « Modifier » et « Supprimer » avec dialogue de confirmation
      (nom de la recette dans le message)
    - _Requirements: 6.1, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 14.3 Créer `frontend/src/views/RecipeEditView.vue`
    - En mode édition (`/recipes/:id/edit`) : charger la recette via le store,
      pré-remplir `RecipeForm`
    - En mode création (`/recipes/new/edit`) : formulaire vide
    - Après succès : naviguer vers la vue détail de la recette sauvegardée
    - _Requirements: 5.1, 5.4, 5.5, 5.6_

  - [ ] 14.4 Créer `frontend/src/views/PhotoCaptureView.vue`
    - `<input type="file" accept="image/*" capture="environment">` pour
      ouvrir la caméra native
    - Afficher la prévisualisation de la photo sélectionnée
    - Au clic « Envoyer » : uploader via `POST /api/photos`, afficher
      `LoadingSpinner`, afficher le texte OCR dans un `<textarea>` éditable
      et le nom candidat dans un champ texte pré-rempli
    - En cas d'erreur (400, 502) : afficher un message explicite en français
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.3, 3.4, 9.7_

- [ ] 15. Frontend — PWA (manifest, service worker, offline)
  - [ ] 15.1 Créer `frontend/public/manifest.webmanifest`
    - `name`, `short_name`, `description`, `start_url: "/"`,
      `display: "standalone"`, `background_color: "#ffffff"`,
      `theme_color: "#2d6a4f"`, `orientation: "portrait-primary"`
    - Deux icônes : 192×192 et 512×512, purpose `maskable any`
    - Créer les fichiers PNG de placeholder dans `frontend/public/icons/`
    - _Requirements: 9.2_

  - [ ] 15.2 Configurer `vite-plugin-pwa` dans `vite.config.js`
    - Précache : tous les assets Vite (JS, CSS, HTML) → stratégie `CacheFirst`
    - Runtime caching :
      - `GET /api/recipes/**` → `NetworkFirst`, TTL 24 h
      - `GET /api/categories` → `StaleWhileRevalidate`, TTL 7 j
    - Pas de cache pour POST, PUT, DELETE
    - Commenter chaque stratégie : pourquoi ce choix pour ce type de ressource
    - _Requirements: 9.2, 9.3_

  - [ ] 15.3 Créer `frontend/public/offline.json` et le gérer dans le service worker
    - Fichier JSON minimal retourné quand une recette n'est pas en cache hors ligne
    - Dans la configuration Workbox, ajouter un handler fallback pour
      `GET /api/recipes/**` offline → répondre avec `offline.json`
    - Dans `api.js`, détecter la réponse `offline.json` et afficher le message
      « Cette recette n'est pas disponible sans connexion »
    - _Requirements: 9.3, 9.4_

- [ ] 16. Checkpoint — Application complète
  - Vérifier que `npm run dev` (frontend) + `node backend/src/server.js`
    fonctionnent ensemble
  - Tester le flux principal : capture photo → OCR → création recette →
    consultation → modification → suppression
  - Tester l'installation PWA sur Chrome Android (menu « Ajouter à l'écran »)
  - Poser des questions à l'utilisateur si des points restent flous.

- [ ] 17. Documentation finale
  - [ ] 17.1 Compléter le README racine
    - Section « Architecture » : décrire les deux couches (frontend Vue 3,
      backend Express + SQLite), le rôle de chaque couche, le flux OCR
    - Section « Prérequis » : Node.js ≥ 20 LTS, compte Google Cloud avec
      Vision API activée, navigateur moderne (Chrome 90+, Safari 15+)
    - Section « Lancement local » : étapes numérotées (cloner le dépôt,
      copier `.env.example` → `.env`, renseigner les variables, `npm install`
      dans chaque dossier, lancer backend puis frontend)
    - Section « Variables d'environnement » : décrire chaque variable, son
      format et sa sensibilité
    - _Requirements: 11.6_

  - [ ] 17.2 Compléter `.env.example` avec les commentaires définitifs
    - Vérifier que toutes les variables utilisées dans le code sont présentes
    - S'assurer qu'aucune vraie valeur n'est commise (scanner avec `git diff`)
    - _Requirements: 11.2, 11.3_

- [ ] 18. Checkpoint final — Qualité et sécurité
  - Lancer `npm test` dans `backend/` — tous les tests doivent passer
  - Vérifier le `.gitignore` : s'assurer que `backend/data/`, `backend/uploads/`,
    `.env` et `credentials.json` ne sont pas trackés par Git
  - Passer en revue les commentaires de code : chaque module, route et
    fonction utilitaire doit avoir son commentaire pédagogique
  - Poser des questions à l'utilisateur si des points restent flous.

---

## Notes

- Les sous-tâches marquées `*` sont optionnelles et peuvent être sautées pour
  un MVP rapide ; elles restent fortement recommandées pour ce projet pédagogique.
- Chaque tâche référence les requirements couverts pour assurer la traçabilité.
- Les checkpoints (tâches 7, 11, 16, 18) sont des points de validation explicites
  — ne pas les sauter.
- Les tests de propriétés (tâche 10) utilisent `fast-check` avec minimum 100
  itérations par propriété, annotés `// Feature: recipe-management-mvp, Property N`.
- La DB de test est toujours une instance SQLite en mémoire (`:memory:`) créée
  et détruite à chaque fichier de test.
- Les secrets (`API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`) ne doivent jamais
  apparaître dans le code source ou les logs.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "5.1", "5.2"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "10.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "10.7"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "12.4"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 11, "tasks": ["13.5"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3", "14.4"] },
    { "id": 13, "tasks": ["15.1", "15.2"] },
    { "id": 14, "tasks": ["15.3"] },
    { "id": 15, "tasks": ["17.1", "17.2"] }
  ]
}
```
