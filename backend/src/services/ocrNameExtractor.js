/**
 * ocrNameExtractor.js
 *
 * Service responsable de l'extraction du nom candidat d'une recette à partir
 * du texte brut retourné par l'OCR.
 *
 * Rôle : produire une suggestion de nom lisible en prenant les premiers mots
 * significatifs du texte OCR, sans nécessiter d'appel réseau ni de dépendance
 * externe.
 *
 * Requirement 3.1 : extraire les 5 premiers mots non vides, les concaténer,
 * tronquer à 200 caractères.
 * Requirement 3.2 : retourner "" si le texte est vide ou sans mot.
 */

/**
 * Extrait un nom candidat à partir du texte OCR d'une recette.
 *
 * Définition de « mot non vide » :
 *   Une séquence d'un ou plusieurs caractères obtenue après avoir découpé le
 *   texte sur tout caractère d'espacement Unicode (\s : espace, tabulation,
 *   saut de ligne, retour chariot…). Un fragment résultant vide — produit par
 *   des espaces consécutifs — est ignoré.
 *
 * Comportement de troncature :
 *   Les 5 premiers mots non vides sont joints par un espace simple. Si la
 *   chaîne résultante dépasse 200 caractères (cas théorique avec des mots très
 *   longs), elle est tronquée à exactement 200 caractères via .slice(0, 200).
 *   Aucun caractère de remplacement (ellipse…) n'est ajouté, conformément à
 *   la spécification qui ne l'exige pas.
 *
 * @param {string} ocrText - Texte brut extrait par le service OCR. Peut être
 *   null, undefined, une chaîne vide ou un texte quelconque.
 * @returns {string} Les 5 premiers mots non vides joints par un espace,
 *   tronqués à 200 caractères. Retourne "" si aucun mot n'est présent.
 *
 * @example
 * extractCandidateName("Tarte aux pommes\nIngrédients : farine sucre beurre")
 * // → "Tarte aux pommes Ingrédients :"
 *
 * @example
 * extractCandidateName("   ")
 * // → ""
 *
 * @example
 * extractCandidateName("")
 * // → ""
 *
 * @example
 * extractCandidateName(null)
 * // → ""
 */
function extractCandidateName(ocrText) {
  // Cas dégénérés : null, undefined, ou type non-string → nom vide
  if (!ocrText || typeof ocrText !== 'string') {
    return '';
  }

  // Découpage sur tout caractère d'espacement Unicode.
  // split(/\s+/) sur une chaîne vide ou uniquement blanche produit [""] ou
  // ["", ""] selon le moteur ; le filtre Boolean() élimine ces fragments vides.
  const words = ocrText.split(/\s+/).filter(Boolean);

  // Requirement 3.2 : aucun mot → chaîne vide
  if (words.length === 0) {
    return '';
  }

  // Requirement 3.1 : prendre au plus les 5 premiers mots, les joindre par
  // un espace, puis tronquer à 200 caractères.
  const candidate = words.slice(0, 5).join(' ');

  // La troncature à 200 caractères est une sécurité : avec 5 mots ordinaires
  // elle ne se déclenche pas, mais elle garantit la contrainte dans tous les cas.
  return candidate.slice(0, 200);
}

module.exports = { extractCandidateName };
