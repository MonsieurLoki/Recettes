/**
 * geminiService.js
 *
 * Utilise l'API Gemini Flash pour structurer le texte brut extrait par OCR
 * en un objet recette JSON : { name, ingredients, instructions }.
 *
 * Pourquoi Gemini plutôt qu'un parsing heuristique ?
 *   Les recettes papier n'ont pas de format standard. Un parsing basé sur
 *   des règles (chercher des listes à puces, des étapes numérotées…) échoue
 *   sur des dizaines de cas limites. Gemini comprend le contexte et produit
 *   une structure fiable même avec des mises en page variées.
 *
 * Modèle utilisé : gemini-2.5-flash
 *   Rapide, peu coûteux (~0.075$/million tokens), suffisant pour ce cas.
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * structureRecipeFromOcr
 *
 * Envoie le texte OCR brut à Gemini et retourne une recette structurée.
 *
 * @param {string} ocrText - Texte brut extrait par Google Cloud Vision
 * @returns {Promise<{ name: string, ingredients: Array, instructions: string }>}
 * @throws {Error} Si la clé API est absente ou si Gemini retourne une réponse invalide
 */
async function structureRecipeFromOcr(ocrText) {
  if (!ocrText || !ocrText.trim()) {
    return { name: '', ingredients: [], instructions: '' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non définie dans les variables d\'environnement.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Tu es un assistant qui extrait des informations de recettes de cuisine.

Voici le texte extrait par OCR d'une photo d'une recette :

---
${ocrText}
---

Extrais les informations et retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :
{
  "name": "nom de la recette",
  "ingredients": [
    { "name": "nom ingrédient", "quantity": "quantité ou null", "unit": "unité ou null" }
  ],
  "instructions": "étapes de préparation en texte libre, séparées par des sauts de ligne"
}

Règles :
- Si une information est absente ou illisible, utilise une chaîne vide "" ou un tableau vide []
- Pour les ingrédients sans quantité ou unité, utilise null
- Retourne UNIQUEMENT le JSON, sans texte avant ou après, sans blocs de code markdown
- Les instructions doivent être en français si possible`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Nettoyer les éventuels blocs markdown ```json ... ```
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Si Gemini retourne du texte invalide, on retourne une structure minimale
    console.error('[Gemini] Réponse non-JSON :', cleaned.slice(0, 200));
    return {
      name: '',
      ingredients: [],
      instructions: ocrText, // fallback : mettre le texte OCR dans les instructions
    };
  }

  return {
    name:         typeof parsed.name         === 'string' ? parsed.name.slice(0, 200) : '',
    ingredients:  Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
  };
}

module.exports = { structureRecipeFromOcr };



