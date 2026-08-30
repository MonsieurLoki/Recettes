/**
 * stores/categories.js — Store Pinia pour la gestion des catégories
 *
 * État :
 *   categories : liste complète des catégories disponibles
 *   loading    : indicateur de chargement
 *   error      : message d'erreur
 *
 * Actions :
 *   fetchCategories  : charger toutes les catégories
 *   createCategory   : créer une nouvelle catégorie
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '@/services/api.js'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])
  const loading = ref(false)
  const error = ref(null)

  /**
   * fetchCategories — Charge la liste complète des catégories.
   * Ce chargement est typiquement effectué une seule fois au démarrage.
   */
  async function fetchCategories() {
    loading.value = true
    error.value = null
    try {
      categories.value = await apiFetch('/api/categories')
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  /**
   * createCategory — Crée une nouvelle catégorie.
   *
   * @param {string} name - Nom de la nouvelle catégorie
   * @returns {Promise<object>} La catégorie créée { id, name, created_at }
   * @throws {ApiError} En cas d'erreur (doublon → 409, nom invalide → 400)
   */
  async function createCategory(name) {
    loading.value = true
    error.value = null
    try {
      const created = await apiFetch('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      // Ajouter la nouvelle catégorie à la liste locale
      categories.value = [...categories.value, created].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
      return created
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  return { categories, loading, error, fetchCategories, createCategory }
})
