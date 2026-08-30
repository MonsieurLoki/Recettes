# Requirements Document

## Introduction

Ce document décrit les exigences fonctionnelles et non fonctionnelles du MVP
d'un système personnel de gestion de recettes de cuisine. L'application
permet de capturer des recettes papier par photo, d'en extraire le texte via
un service OCR cloud, d'éditer, catégoriser, rechercher et supprimer des
recettes. L'interface est une web app responsive installable en PWA, conçue
pour une utilisation principale sur téléphone Android en cuisine, et aussi
sur iPhone et laptop. L'usage est strictement personnel (un seul utilisateur).

---

## Glossary

- **Application** : la web app responsive / PWA de gestion de recettes.
- **Backend** : le serveur applicatif exposant l'API REST, gérant la logique
  métier, la base de données et les appels au service OCR.
- **Service_OCR** : le service cloud tiers chargé de la reconnaissance optique
  de caractères sur les photos de recettes.
- **Recette** : entité principale du système, composée d'un nom, d'une ou
  plusieurs catégories, d'une liste d'ingrédients et d'instructions de
  préparation.
- **Ingredient** : composant nommé d'une recette, avec optionnellement une
  quantité et une unité.
- **Categorie** : étiquette thématique associée à une ou plusieurs recettes
  (ex. dessert, plat principal, entrée).
- **Texte_OCR** : texte brut extrait d'une photo de recette par le
  Service_OCR, avant correction manuelle.
- **Cle_API** : secret partagé entre les appareils de l'utilisateur et le
  Backend, utilisé pour authentifier chaque requête.
- **Validateur** : composant du Backend responsable de la validation et de la
  sanitisation de toutes les données entrantes.
- **Stockage_Fichiers** : composant du Backend responsable de la persistance
  des photos originales.

---

## Requirements

---

### Requirement 1: Capture de photo et lancement de l'OCR

**User Story:** En tant qu'utilisateur, je veux prendre une photo d'une
recette papier directement depuis mon téléphone, afin de capturer une recette
sans la ressaisir manuellement.

#### Acceptance Criteria

1. WHEN l'utilisateur sélectionne l'action « Ajouter une recette par photo »,
   THE Application SHALL ouvrir l'interface de capture de la caméra native
   du téléphone.
2. WHEN l'utilisateur valide une photo, THE Application SHALL envoyer la photo
   au Backend et afficher un indicateur de traitement visible pendant toute
   la durée de l'envoi et de l'OCR.
3. WHEN le Backend reçoit une photo valide (format JPEG ou PNG, taille ≤ 10 Mo,
   résolution ≥ 640 × 480 px), THE Backend SHALL stocker la photo dans le
   Stockage_Fichiers et transmettre la photo au Service_OCR.
4. IF le Backend reçoit un fichier dont le format n'est pas JPEG ou PNG,
   THEN THE Validateur SHALL rejeter la requête et retourner un message
   d'erreur indiquant que le format n'est pas supporté.
5. IF le Backend reçoit un fichier d'une taille supérieure à 10 Mo, THEN THE
   Validateur SHALL rejeter la requête et retourner un message d'erreur
   indiquant que la taille maximale est dépassée.
6. IF le Backend reçoit un fichier dont la résolution est inférieure à
   640 × 480 px, THEN THE Validateur SHALL rejeter la requête et retourner
   un message d'erreur indiquant que la résolution est insuffisante.
7. IF le Stockage_Fichiers ne peut pas enregistrer la photo, THEN THE Backend
   SHALL rejeter la requête et retourner un message d'erreur sans transmettre
   le fichier au Service_OCR.
8. WHEN le Service_OCR retourne le Texte_OCR extrait, THE Backend SHALL
   stocker le Texte_OCR en base de données et notifier l'Application que
   l'extraction est terminée, en incluant l'identifiant de la recette associée.
9. IF le Service_OCR retourne une erreur ou ne répond pas dans un délai de
   30 secondes, THEN THE Backend SHALL enregistrer l'erreur et retourner un
   message d'erreur indiquant que l'extraction a échoué.

---

### Requirement 2: Affichage et correction du texte OCR

**User Story:** En tant qu'utilisateur, je veux pouvoir relire et corriger
le texte extrait par l'OCR, afin d'obtenir une recette exacte malgré les
imperfections de la reconnaissance.

#### Acceptance Criteria

1. WHEN l'extraction OCR est terminée, THE Application SHALL afficher le
   Texte_OCR dans un champ de texte éditable.
2. WHILE le texte OCR n'a pas encore été soumis, THE Application SHALL
   permettre à l'utilisateur de modifier librement le contenu du champ
   Texte_OCR.
3. WHEN l'utilisateur soumet le texte corrigé, THE Validateur SHALL vérifier
   que le texte n'est pas vide.
4. IF le texte soumis est vide, THEN THE Validateur SHALL rejeter la soumission
   et afficher un message d'erreur indiquant que le champ ne peut pas être vide.
5. IF le texte soumis dépasse 50 000 caractères, THEN THE Validateur SHALL
   rejeter la soumission et afficher un message d'erreur indiquant la limite
   maximale autorisée.
6. IF le texte soumis contient des séquences de balisage exécutable ou de
   template (par exemple `{{`, `<%`, `<script`), THEN THE Validateur SHALL
   rejeter la soumission et afficher un message d'erreur indiquant que le
   contenu n'est pas autorisé.
7. WHEN le texte corrigé est validé et soumis avec succès, THE Application
   SHALL enregistrer le texte et afficher une confirmation visible à
   l'utilisateur.

---

### Requirement 3: Proposition automatique du nom de la recette

**User Story:** En tant qu'utilisateur, je veux que le système me propose
automatiquement un nom de recette en français à partir du texte extrait,
afin de gagner du temps tout en gardant la main sur le nommage final.

#### Acceptance Criteria

1. WHEN le Texte_OCR est disponible et contient au moins un mot, THE Backend
   SHALL extraire les 5 premiers mots non vides du texte, les concaténer et
   tronquer le résultat à 200 caractères pour former le nom candidat de la
   recette.
2. IF le Texte_OCR est vide ou ne contient aucun mot, THEN THE Backend SHALL
   produire un nom candidat vide.
3. WHEN le nom candidat est disponible, THE Application SHALL afficher le nom
   proposé dans un champ de texte pré-rempli et éditable.
4. WHILE la recette n'a pas encore été validée, THE Application SHALL permettre
   à l'utilisateur de modifier ou remplacer le nom proposé.
5. WHEN l'utilisateur soumet le nom de la recette, THE Validateur SHALL
   vérifier que le nom n'est pas vide et ne dépasse pas 200 caractères.
6. IF le nom soumis est vide ou dépasse 200 caractères, THEN THE Validateur
   SHALL rejeter la soumission et afficher un message d'erreur indiquant la
   contrainte non respectée.

---

### Requirement 4: Catégorisation des recettes

**User Story:** En tant qu'utilisateur, je veux associer une ou plusieurs
catégories à chaque recette, afin d'organiser ma collection et de retrouver
rapidement les recettes par type.

#### Acceptance Criteria

1. THE Backend SHALL fournir un ensemble de catégories par défaut incluant
   au minimum : entrée, plat principal, dessert, soupe, salade, sauce,
   boisson, autre.
2. WHEN l'utilisateur crée ou édite une recette, THE Application SHALL
   afficher la liste complète des catégories disponibles sous forme de
   sélection multiple.
3. THE Application SHALL permettre à l'utilisateur d'associer zéro, une ou
   plusieurs catégories à une recette.
4. WHEN l'utilisateur saisit le nom d'une nouvelle catégorie et la valide,
   THE Backend SHALL créer la Categorie et la rendre immédiatement disponible
   dans la liste des catégories pour toutes les recettes.
5. WHEN l'utilisateur soumet le nom d'une nouvelle catégorie, THE Validateur
   SHALL vérifier que le nom n'est pas vide, ne dépasse pas 100 caractères,
   et n'est pas identique (en ignorant la casse et les espaces de début/fin)
   à une catégorie existante.
6. IF la validation du nom de catégorie échoue, THEN THE Validateur SHALL
   rejeter la soumission et afficher un message d'erreur indiquant la règle
   violée.
7. WHEN une nouvelle catégorie est créée avec succès, THE Application SHALL
   l'afficher sélectionnée dans la liste des catégories de la recette en cours
   d'édition.

---

### Requirement 5: Création et édition d'une recette

**User Story:** En tant qu'utilisateur, je veux pouvoir créer et modifier
une recette complète (nom, catégories, ingrédients, instructions), afin de
maintenir ma collection de recettes à jour et correcte.

#### Acceptance Criteria

1. THE Application SHALL permettre la création d'une recette avec au minimum
   les champs suivants : nom (1–200 caractères), catégories (0–10 catégories),
   liste d'ingrédients (1–50 entrées), instructions de préparation
   (1–10 000 caractères).
2. WHEN l'utilisateur soumet une recette, THE Validateur SHALL vérifier que
   le nom n'est pas vide et ne dépasse pas 200 caractères, que la liste
   d'ingrédients contient au moins un élément et ne dépasse pas 50 entrées,
   que les instructions ne sont pas vides et ne dépassent pas 10 000 caractères,
   et que le nombre de catégories ne dépasse pas 10.
3. IF la validation d'une recette soumise échoue, THEN THE Validateur SHALL
   rejeter la soumission et afficher un message d'erreur inline sous chaque
   champ invalide, indiquant la contrainte non respectée.
4. WHEN l'utilisateur sélectionne une recette existante et choisit « Modifier »,
   THE Application SHALL afficher un formulaire pré-rempli avec les données
   actuelles de la recette.
5. WHEN l'utilisateur soumet les modifications d'une recette valide, THE Backend
   SHALL mettre à jour la Recette en base de données.
6. WHEN la mise à jour est confirmée par le Backend, THE Application SHALL
   afficher un message de confirmation visible pendant au moins 3 secondes.
7. WHEN l'utilisateur soumet un nom de recette, THE Validateur SHALL vérifier
   que ce nom n'est pas identique (insensible à la casse) à celui d'une recette
   existante ; IF c'est le cas, THEN THE Validateur SHALL rejeter la soumission
   et afficher un message d'erreur inline sur le champ nom.
8. THE Validateur SHALL sanitiser tous les champs texte d'une recette (nom,
   ingrédients, instructions) pour neutraliser toute injection SQL et injection
   de template avant le stockage.

---

### Requirement 6: Suppression d'une recette

**User Story:** En tant qu'utilisateur, je veux pouvoir supprimer une recette
de ma collection, afin de garder une liste propre et pertinente.

#### Acceptance Criteria

1. WHEN l'utilisateur sélectionne une recette et choisit « Supprimer »,
   THE Application SHALL afficher une demande de confirmation explicite
   mentionnant le nom de la recette et proposant deux actions distinctes :
   confirmer la suppression et annuler.
2. WHEN l'utilisateur confirme la suppression et THE Backend retourne une
   réponse HTTP 2xx, THE Application SHALL retirer la Recette de la liste
   affichée sans rechargement complet de la page.
3. IF l'utilisateur se trouve sur la vue détail de la recette au moment de la
   confirmation, THEN THE Application SHALL naviguer vers la liste des recettes
   après suppression.
4. IF l'utilisateur annule la demande de confirmation, THEN THE Application
   SHALL ne pas supprimer la Recette et rester sur la vue courante.
5. IF le Backend retourne une erreur lors de la suppression, THEN THE
   Application SHALL afficher un message d'erreur visible et conserver la
   Recette dans la liste affichée.

---

### Requirement 7: Recherche de recettes

**User Story:** En tant qu'utilisateur, je veux rechercher des recettes par
nom, par catégorie ou par ingrédient, afin de retrouver rapidement ce que
je cherche dans ma collection.

#### Acceptance Criteria

1. THE Application SHALL fournir un champ de recherche par nom et un champ de
   recherche par ingrédient, chacun limité à 100 caractères.
2. WHEN l'utilisateur saisit un terme d'au moins 1 caractère dans le champ de
   recherche par nom, THE Backend SHALL retourner toutes les recettes dont le
   nom contient le terme (recherche insensible à la casse et aux accents).
3. WHEN l'utilisateur sélectionne une ou plusieurs catégories comme filtre,
   THE Backend SHALL retourner uniquement les recettes associées à toutes les
   catégories sélectionnées.
4. WHEN l'utilisateur saisit un terme d'au moins 1 caractère dans le champ de
   recherche par ingrédient, THE Backend SHALL retourner toutes les recettes
   contenant un ingrédient dont le nom contient le terme (recherche insensible
   à la casse et aux accents).
5. WHEN l'utilisateur saisit un terme dans le champ de recherche par nom ET
   sélectionne une ou plusieurs catégories, THE Backend SHALL retourner
   uniquement les recettes satisfaisant simultanément les deux critères
   (logique ET).
6. WHEN aucun résultat ne correspond à la recherche, THE Application SHALL
   afficher un message indiquant qu'aucune recette n'a été trouvée.
7. WHEN le champ de recherche est vidé et qu'aucun autre filtre n'est actif,
   THE Application SHALL afficher la liste complète des recettes.
8. IF un terme de recherche contient des caractères non autorisés (ex.
   caractères de contrôle), THEN THE Validateur SHALL rejeter la saisie et
   afficher un message d'erreur avant toute interrogation de la base de données.

---

### Requirement 8: Consultation d'une recette

**User Story:** En tant qu'utilisateur, je veux consulter une recette
complète depuis mon téléphone pendant que je cuisine, afin de suivre les
instructions facilement sans interaction complexe.

#### Acceptance Criteria

1. WHEN l'utilisateur sélectionne une recette dans la liste, THE Application
   SHALL afficher la vue détail de la Recette avec : le nom, les catégories,
   la liste d'ingrédients (chaque ingrédient affiché avec sa quantité, son
   unité et son nom), et les instructions de préparation affichées sous forme
   d'étapes numérotées dans leur ordre de saisie.
2. THE Application SHALL afficher la vue détail d'une recette avec une taille
   de texte d'au moins 16 px et un contraste texte/fond d'au moins 4,5:1.
3. WHILE l'utilisateur consulte la vue détail d'une recette, THE Application
   SHALL tenter d'activer l'API Wake Lock pour maintenir l'écran allumé.
4. IF l'API Wake Lock n'est pas disponible dans le navigateur ou si la
   permission est refusée, THEN THE Application SHALL continuer à afficher la
   recette normalement sans afficher de message d'erreur à l'utilisateur.
5. IF une recette ne contient aucune instruction de préparation, THEN THE
   Application SHALL afficher un message indiquant qu'aucune instruction n'est
   disponible pour cette recette.

---

### Requirement 9: Interface utilisateur responsive et PWA

**User Story:** En tant qu'utilisateur, je veux accéder à l'application
depuis mon téléphone Android, mon iPhone et mon laptop, et pouvoir
l'installer comme une application, afin d'avoir une expérience fluide
sur tous mes appareils.

#### Acceptance Criteria

1. THE Application SHALL s'afficher sur des écrans de 320 px à 1920 px de
   large sans défilement horizontal, sans chevauchement de contenu, et avec
   tous les éléments interactifs visibles dans la fenêtre d'affichage.
2. THE Application SHALL être installable en tant que PWA sur Android (Chrome)
   et iOS (Safari) en fournissant un manifeste web conforme à la spécification
   W3C Web App Manifest et un service worker enregistré.
3. WHILE l'application est utilisée hors connexion, THE Application SHALL
   permettre la consultation des recettes consultées lors d'une session
   connectée précédente grâce au cache du service worker.
4. IF l'utilisateur tente d'accéder hors connexion à une recette non présente
   dans le cache, THEN THE Application SHALL afficher un message indiquant que
   la recette n'est pas disponible sans connexion.
5. THE Application SHALL afficher les éléments interactifs (boutons, liens)
   avec une surface tactile minimale de 44 × 44 px.
6. THE Application SHALL utiliser des libellés d'actions en français courant,
   sans termes techniques ni anglicismes.
7. IF une opération dure plus de 500 ms, THEN THE Application SHALL afficher
   un indicateur de chargement contrasté d'au moins 24 × 24 px, et le retirer
   dès que l'opération est terminée.

---

### Requirement 10: Sécurité de l'accès au Backend

**User Story:** En tant qu'utilisateur, je veux que le backend ne soit pas
accessible à n'importe qui sur internet, afin de protéger mes données
personnelles même sans système de comptes.

#### Acceptance Criteria

1. THE Backend SHALL exiger la présence dans l'en-tête HTTP `X-API-Key` d'une
   valeur correspondant caractère par caractère, avec distinction
   majuscules/minuscules, à la valeur de la variable d'environnement dédiée ;
   cette valeur doit comporter au moins 32 caractères.
2. IF une requête ne contient pas de Cle_API ou contient une Cle_API invalide,
   THEN THE Backend SHALL retourner un code HTTP 401 avec un corps indiquant
   « accès non autorisé » sans inclure aucune donnée applicative.
3. THE Backend SHALL charger la valeur de la Cle_API exclusivement depuis une
   variable d'environnement et jamais depuis le code source ou un fichier
   commité dans le dépôt Git.
4. THE Backend SHALL enregistrer dans les logs chaque tentative d'accès
   refusée (date, heure, adresse IP source) sans enregistrer la valeur de la
   Cle_API soumise.

---

### Requirement 11: Sécurité et qualité du code source

**User Story:** En tant que développeur junior, je veux que le code soit
sécurisé, commenté et maintenable, afin d'apprendre de bonnes pratiques tout
en conservant un projet sain sur un dépôt public.

#### Acceptance Criteria

1. THE Backend SHALL utiliser des requêtes paramétrées (prepared statements)
   pour toutes les interactions avec la base de données, sans aucune
   concaténation directe de données utilisateur dans les chaînes de requête.
2. THE Backend SHALL ne stocker dans le dépôt Git aucun secret, clé API, mot
   de passe ou identifiant de service tiers ; ces valeurs doivent être
   référencées exclusivement via des variables d'environnement.
3. THE Backend SHALL inclure un fichier `.gitignore` qui exclut au minimum les
   fichiers `.env`, `.env.local`, `.env.production`, les dossiers de
   dépendances (`node_modules`, `venv`, `__pycache__`) et tout fichier dont
   le nom correspond aux patterns `*.key`, `*.pem` ou `secrets.*`.
4. THE Backend SHALL inclure des tests automatisés comportant au minimum un
   test par règle de validation d'entrée documentée et au minimum un test par
   opération CRUD (créer, lire, mettre à jour, supprimer) sur les recettes ;
   chaque test doit produire un résultat pass/fail déterministe sans
   intervention manuelle.
5. THE Backend SHALL inclure des commentaires explicatifs au niveau de chaque
   module, de chaque route et de chaque fonction utilitaire, indiquant en une
   à cinq phrases son rôle, ses paramètres d'entrée et sa valeur de retour ;
   les sections de code dont la logique dépasse une comparaison ou une
   transformation simple SHALL être accompagnées d'un commentaire expliquant
   le raisonnement.
6. THE Application SHALL inclure un fichier README contenant les sections
   suivantes, chacune non vide : (a) description de l'architecture du projet
   et du rôle de chaque couche technique, (b) liste des prérequis logiciels
   avec les versions minimales requises, (c) étapes numérotées permettant de
   lancer le projet en environnement local depuis un dépôt cloné, et (d)
   description de la structure des variables d'environnement nécessaires.
