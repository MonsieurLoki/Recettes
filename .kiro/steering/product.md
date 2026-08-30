# Steering — Recettes

## Contexte du projet
Application personnelle de gestion de recettes de cuisine. Projet éducatif :
le développeur est junior, le code doit être commenté et compréhensible,
pas seulement fonctionnel.

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
- Backend séparé : stockage (base de données), logique métier, appel au
  service OCR cloud.
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
- Code testé (tests unitaires au minimum sur la logique métier et la
  validation des entrées).
- Documentation claire (README, commentaires pédagogiques dans le code).
- Versionné avec Git, historique de commits propre et compréhensible.

## Hors périmètre pour l'instant
- Les fonctionnalités de suggestion de recettes / variantes et le futur
  chatbot vocal sont des évolutions prévues mais traitées dans des specs
  séparées, après le MVP de gestion de base des recettes.