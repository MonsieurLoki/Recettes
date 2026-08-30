/**
 * sanitize.js — Fonctions de sanitisation des entrées texte
 *
 * Ce module fournit deux fonctions de nettoyage appliquées à toutes les
 * données texte avant leur stockage en base de données ou leur utilisation
 * dans une réponse API.
 *
 * Pourquoi sanitiser côté serveur ?
 * - La validation côté client est contournable : le backend est la dernière
 *   ligne de défense.
 * - Les injections de template ({{ }}, <% %>) peuvent déclencher une évaluation
 *   non intentionnelle si le texte est réutilisé dans un moteur de template.
 * - Les balises HTML exécutables (<script>, <style>) et les attributs de
 *   gestion d'événements (onclick, onload…) constituent un vecteur XSS si
 *   le contenu est rendu dans un navigateur sans encodage supplémentaire.
 *
 * Requirements couverts : 2.6 (rejet template injection OCR), 5.8 (sanitisation
 * champs recette), 11.5 (commentaires pédagogiques)
 */

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeText
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nettoie une chaîne de caractères ordinaire (nom de recette, ingrédient,
 * instructions, nom de catégorie) pour la rendre sûre au stockage et à
 * l'affichage.
 *
 * Opérations effectuées, dans l'ordre :
 *  1. trim()   — supprime les espaces/tabulations/sauts de ligne en début et
 *                fin de chaîne, évitant les doublons invisibles en base.
 *  2. Suppression des balises <script …> … </script> (y compris multi-lignes)
 *     — vecteur principal d'injection JavaScript.
 *  3. Suppression des balises <style …> … </style> (y compris multi-lignes)
 *     — peut injecter du CSS malveillant (positionnement abusif, vol de contenu).
 *  4. Suppression des attributs de gestion d'événements HTML : on* = "…"
 *     (onclick, onload, onerror, onmouseover, etc.) — vecteur XSS inline.
 *  5. Suppression des balises HTML ouvrantes/fermantes restantes — par
 *     précaution, pour éviter tout balisage résiduel non désiré.
 *
 * Note : cette fonction ne rejette pas la chaîne, elle la modifie. Utilisez
 * validateRecipe / validateCategory pour les vérifications de règles métier
 * (longueur, unicité, champ vide).
 *
 * @param {string} str - La chaîne brute saisie par l'utilisateur.
 * @returns {string} La chaîne nettoyée. Retourne "" si str est null/undefined.
 *
 * @example
 * sanitizeText('  Tarte Tatin  ')
 * // → 'Tarte Tatin'
 *
 * @example
 * sanitizeText('Recette<script>alert(1)</script>')
 * // → 'Recette'
 *
 * @example
 * sanitizeText('Beurre <b onclick="steal()">fondu</b>')
 * // → 'Beurre fondu'
 */
function sanitizeText(str) {
  if (str == null) return '';

  let result = String(str).trim();

  // Suppression des blocs <script>...</script> (insensible à la casse,
  // multi-lignes, avec ou sans attributs sur la balise ouvrante).
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // Suppression des blocs <style>...</style> — même logique que script.
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Suppression des attributs d'événements HTML inline (on* = "...").
  // Le pattern cible : on[a-z]+ suivi d'espaces optionnels, d'un "=",
  // puis d'une valeur entre guillemets simples, doubles ou sans guillemets,
  // jusqu'au prochain espace ou fin de balise.
  // Exemple : onclick="alert(1)" ou onmouseover='x' ou onload=foo()
  result = result.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  // Suppression de toutes les balises HTML ouvrantes et fermantes restantes.
  // <tag ...> ou </tag> — par ex. <b>, </b>, <img src="x">, <br/>, etc.
  // Cela garantit qu'aucun balisage résiduel (après suppression des attributs
  // on*) ne subsiste dans la valeur stockée.
  result = result.replace(/<[^>]*>/g, '');

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeOcrText
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nettoie le texte brut retourné par le service OCR avant son stockage et son
 * affichage à l'utilisateur.
 *
 * Différence avec sanitizeText :
 *  Cette fonction applique les mêmes nettoyages HTML que sanitizeText, MAIS
 *  elle lève une erreur (Error) si le texte contient des séquences de template
 *  ou d'injection dangereuses. L'objectif est de rejeter explicitement tout
 *  texte OCR dont le contenu ressemble à du code injecté dans une photo
 *  (attaque par « prompt injection » physique ou manipulation de document).
 *
 * Séquences rejetées (throw) :
 *  - `{{`    — syntaxe de template Mustache / Handlebars / Vue
 *  - `<%`    — syntaxe de template EJS / ERB
 *  - `<script` — balise JavaScript inline (redondant avec sanitizeText mais
 *               détecté avant nettoyage pour lever une erreur claire)
 *
 * Pourquoi lever une erreur plutôt que supprimer silencieusement ?
 *  Un texte OCR contenant ces séquences est statistiquement anormal : une
 *  vraie recette de cuisine ne contient pas `{{` ni `<%`. Lever une erreur
 *  permet à la route appelante de retourner HTTP 422 avec un message explicite,
 *  ce qui alerte l'utilisateur et simplifie le débogage.
 *
 * @param {string} str - Le texte brut retourné par le service OCR.
 * @returns {string} Le texte nettoyé des balises HTML.
 * @throws {Error} Si le texte contient `{{`, `<%` ou `<script`.
 *
 * @example
 * sanitizeOcrText('Ingrédients : farine, sucre')
 * // → 'Ingrédients : farine, sucre'
 *
 * @example
 * sanitizeOcrText('{{ recette }}')
 * // → Error: 'Le texte contient des séquences non autorisées : "{{"'
 *
 * @example
 * sanitizeOcrText('<% include header %>')
 * // → Error: 'Le texte contient des séquences non autorisées : "<%"'
 *
 * @example
 * sanitizeOcrText('<script>alert(1)</script>')
 * // → Error: 'Le texte contient des séquences non autorisées : "<script"'
 */
function sanitizeOcrText(str) {
  if (str == null) return '';

  const raw = String(str);

  // ── Vérification des séquences interdites AVANT nettoyage ──────────────────
  // On vérifie sur la chaîne brute (avant trim/nettoyage) pour ne manquer
  // aucune occurrence, même si elle est masquée par des espaces.
  // La vérification est insensible à la casse pour détecter <SCRIPT, <Script…
  const forbidden = [
    { seq: '{{',      label: '"{{"' },
    { seq: '<%',      label: '"<%"' },
    { seq: '<script', label: '"<script"' },
  ];

  for (const { seq, label } of forbidden) {
    if (raw.toLowerCase().includes(seq.toLowerCase())) {
      throw new Error(
        `Le texte contient des séquences non autorisées : ${label}`
      );
    }
  }

  // ── Nettoyage HTML standard (réutilise la logique de sanitizeText) ──────────
  // À ce stade, les séquences dangereuses ont déjà été rejetées ; on nettoie
  // les éventuelles balises HTML restantes (ex. <b>, <em>) pour uniformiser
  // le texte OCR stocké.
  let result = raw.trim();

  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  result = result.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  result = result.replace(/<[^>]*>/g, '');

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { sanitizeText, sanitizeOcrText };
