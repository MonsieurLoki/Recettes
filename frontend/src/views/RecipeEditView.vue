<!--
  RecipeEditView.vue — Vue de création/modification de recette

  Mode création (/recipes/new/edit) : formulaire vide
  Mode édition  (/recipes/:id/edit) : charge la recette via le store et pré-remplit RecipeForm

  Après sauvegarde réussie : redirige vers la vue détail de la recette (/recipes/:id)

  Requirements : 5.1, 5.4, 5.5, 5.6
-->
<template>
  <main class="edit-view">
    <!-- Retour -->
    <nav class="edit-nav">
      <router-link
        :to="isEditMode ? `/recipes/${recipeId}` : '/'"
        class="back-link"
      >
        ← {{ isEditMode ? 'Retour à la recette' : 'Retour à la liste' }}
      </router-link>
    </nav>

    <!-- Titre de la page -->
    <h1 class="edit-title">
      {{ isEditMode ? 'Modifier la recette' : 'Nouvelle recette' }}
    </h1>

    <!-- Chargement en mode édition -->
    <div v-if="loading" class="loading-center">
      <LoadingSpinner :size="40" label="Chargement de la recette…" />
    </div>

    <!-- Erreur de chargement -->
    <div v-else-if="loadError" class="error-block" role="alert">
      <p>{{ loadError }}</p>
      <router-link to="/" class="btn btn-secondary">← Retour à la liste</router-link>
    </div>

    <!-- Formulaire -->
    <RecipeForm
      v-else
      :initial-data="initialData"
      :recipe-id="recipeId"
      @saved="onSaved"
    />
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipesStore } from '@/stores/recipes.js'
import RecipeForm from '@/components/RecipeForm.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const recipesStore = useRecipesStore()

// Détecter le mode : édition si :id est présent et ≠ 'new'
const isEditMode = computed(() => route.params.id && route.params.id !== 'new')
const recipeId = computed(() => isEditMode.value ? Number(route.params.id) : null)

const loading = ref(false)
const loadError = ref('')
const initialData = ref(null)

onMounted(async () => {
  if (!isEditMode.value) return // mode création : formulaire vide

  loading.value = true
  try {
    await recipesStore.fetchRecipe(recipeId.value)
    initialData.value = recipesStore.currentRecipe

    // Fusionner les ingrédients Gemini si disponibles dans le store
    // (déposés par PhotoCaptureView après une analyse Gemini réussie).
    // Le store est plus fiable que history.state en contexte PWA / Safari,
    // car Vue Router 4 fusionne son propre état dans history.state.
    const prefill = recipesStore.pendingPrefill
    if (prefill?.ingredients?.length) {
      initialData.value = {
        ...initialData.value,
        ingredients: prefill.ingredients,
      }
      // Nettoyer après utilisation pour éviter une ré-application au prochain montage
      recipesStore.clearPendingPrefill()
    }
  } catch (err) {
    loadError.value = err.status === 404
      ? 'Cette recette est introuvable.'
      : 'Impossible de charger la recette. Réessayez.'
  } finally {
    loading.value = false
  }
})

function onSaved(savedRecipe) {
  // Naviguer vers la vue détail après sauvegarde (Req. 5.5)
  router.push(`/recipes/${savedRecipe.id}`)
}
</script>

<style scoped>
.edit-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 16px;
}

.edit-nav { margin-bottom: 12px; }

.back-link {
  display: inline-block;
  color: #2d6a4f;
  text-decoration: none;
  font-size: 0.875rem;
  min-height: 44px;
  line-height: 44px;
}
.back-link:hover { text-decoration: underline; }

.edit-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 24px;
}

.loading-center { display: flex; justify-content: center; padding: 60px 0; }

.error-block {
  text-align: center;
  padding: 40px 0;
  color: #dc2626;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 18px;
  font-size: 0.9375rem;
  border-radius: 6px;
  text-decoration: none;
  border: none;
  cursor: pointer;
}
.btn-secondary { background: #ffffff; color: #374151; border: 1px solid #d1d5db; }
.btn-secondary:hover { background: #f9fafb; }
</style>
