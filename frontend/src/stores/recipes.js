/**
 * stores/recipes.js — Store Pinia pour la gestion des recettes
 *
 * État :
 *   recipes        : tableau de résumés de recettes (liste)
 *   currentRecipe  : recette complète actuellement consultée/éditée
 *   total          : nombre total de recettes correspondant aux filtres actifs
 *   page           : page courante (pagination)
 *   loading        : indicateur de chargement
 *   error          : message d'erreur global
 *   pendingPrefill : données Gemini temporaires à pré-remplir dans RecipeEditView
 *                    (canal de communication entre PhotoCaptureView et RecipeEditView,
 *                    plus fiable que history.state en contexte PWA)
 *
 * Actions :
 *   fetchRecipes(filters)      : charger la liste avec filtres optionnels
 *   fetchRecipe(id)            : charger une recette complète par ID
 *   createRecipe(body)         : créer une nouvelle recette
 *   updateRecipe(id, body)     : mettre à jour une recette existante
 *   deleteRecipe(id)           : supprimer une recette
 *   setPendingPrefill(data)    : stocker les données de pré-remplissage Gemini
 *   clearPendingPrefill()      : effacer les données après utilisation
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '@/services/api.js'

export const useRecipesStore = defineStore('recipes', () => {
  // ── État ───────────────────────────────────────────────────────────────────
  const recipes = ref([])
  const currentRecipe = ref(null)
  const total = ref(0)
  const page = ref(1)
  const loading = ref(false)
  const error = ref(null)

  /**
   * pendingPrefill — Données Gemini à pré-remplir dans RecipeEditView.
   *
   * Utilisé comme canal de communication entre PhotoCaptureView (producteur)
   * et RecipeEditView (consommateur). On préfère le store à history.state
   * car history.state est fusionné par Vue Router 4 et peut être inaccessible
   * dans certains contextes PWA / Safari.
   *
   * Structure : { name, instructions, ingredients, ocr_text } | null
   */
  const pendingPrefill = ref(null)

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * fetchRecipes — Charge la liste paginée des recettes avec filtres optionnels.
   *
   * @param {object} [filters={}] - Filtres : { name, ingredient, categories, page, limit }
   */
  async function fetchRecipes(filters = {}) {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (filters.name)       params.set('name',       filters.name)
      if (filters.ingredient) params.set('ingredient', filters.ingredient)
      if (filters.categories?.length) params.set('categories', filters.categories.join(','))
      if (filters.page)  params.set('page',  String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))

      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await apiFetch(`/api/recipes${query}`)
      recipes.value = data.data
      total.value   = data.total
      page.value    = data.page
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  /**
   * fetchRecipe — Charge une recette complète par son identifiant.
   *
   * @param {number|string} id - Identifiant de la recette
   */
  async function fetchRecipe(id) {
    loading.value = true
    error.value = null
    currentRecipe.value = null
    try {
      currentRecipe.value = await apiFetch(`/api/recipes/${id}`)
    } catch (err) {
      error.value = err.message
      throw err // Re-throw pour que la vue puisse afficher le 404
    } finally {
      loading.value = false
    }
  }

  /**
   * createRecipe — Crée une nouvelle recette.
   *
   * @param {object} body - Corps de la recette { name, instructions, ingredients, category_ids }
   * @returns {Promise<object>} La recette créée
   * @throws {ApiError} En cas d'erreur de validation (400/409) ou serveur
   */
  async function createRecipe(body) {
    loading.value = true
    error.value = null
    try {
      const created = await apiFetch('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return created
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * updateRecipe — Met à jour une recette existante.
   *
   * @param {number|string} id   - Identifiant de la recette à modifier
   * @param {object}        body - Corps mis à jour
   * @returns {Promise<object>} La recette mise à jour
   */
  async function updateRecipe(id, body) {
    loading.value = true
    error.value = null
    try {
      const updated = await apiFetch(`/api/recipes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      currentRecipe.value = updated
      return updated
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * deleteRecipe — Supprime une recette.
   *
   * @param {number|string} id - Identifiant de la recette à supprimer
   */
  async function deleteRecipe(id) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' })
      // Retirer la recette de la liste locale immédiatement
      recipes.value = recipes.value.filter(r => r.id !== id)
      if (currentRecipe.value?.id === id) {
        currentRecipe.value = null
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * setPendingPrefill — Stocke les données Gemini à pré-remplir.
   *
   * Appelé par PhotoCaptureView juste avant la navigation vers RecipeEditView.
   *
   * @param {{ name: string, instructions: string, ingredients: string[], ocr_text: string }} data
   */
  function setPendingPrefill(data) {
    pendingPrefill.value = data
  }

  /**
   * clearPendingPrefill — Efface les données de pré-remplissage.
   *
   * Appelé par RecipeEditView après avoir consommé les données,
   * pour éviter qu'un rechargement ultérieur ne les réapplique.
   */
  function clearPendingPrefill() {
    pendingPrefill.value = null
  }

  return { recipes, currentRecipe, total, page, loading, error, pendingPrefill, fetchRecipes, fetchRecipe, createRecipe, updateRecipe, deleteRecipe, setPendingPrefill, clearPendingPrefill }
})
