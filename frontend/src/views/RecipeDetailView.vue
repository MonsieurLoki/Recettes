<template>
  <main class="detail-view">
    <!-- Chargement -->
    <div v-if="loading" class="loading-center">
      <LoadingSpinner :size="48" label="Chargement de la recette…" />
    </div>

    <!-- Erreur (404 ou autre) -->
    <div v-else-if="error" class="error-block" role="alert">
      <p>{{ error }}</p>
      <router-link to="/" class="btn btn-secondary">← Retour à la liste</router-link>
    </div>

    <!-- Contenu de la recette -->
    <template v-else-if="recipe">
      <!-- En-tête -->
      <header class="detail-header">
        <router-link to="/" class="back-link" aria-label="Retour à la liste">
          ← Mes recettes
        </router-link>
        <h1 class="detail-title">{{ recipe.name }}</h1>

        <!-- Catégories -->
        <div v-if="recipe.categories?.length" class="detail-categories">
          <span
            v-for="cat in recipe.categories"
            :key="cat.id"
            class="category-badge"
          >{{ cat.name }}</span>
        </div>

        <!-- Actions -->
        <div class="detail-actions">
          <router-link
            :to="`/recipes/${recipe.id}/edit`"
            class="btn btn-secondary"
            aria-label="Modifier la recette"
          >
            ✏️ Modifier
          </router-link>
          <button
            class="btn btn-danger"
            :disabled="deleting"
            aria-label="Supprimer la recette"
            @click="confirmDelete"
          >
            🗑 Supprimer
          </button>
        </div>
      </header>

      <!-- Ingrédients -->
      <section class="detail-section" aria-labelledby="ingredients-title">
        <h2 id="ingredients-title" class="section-title">Ingrédients</h2>
        <ul class="ingredient-list">
          <li
            v-for="(ing, idx) in recipe.ingredients"
            :key="ing.id ?? idx"
            class="ingredient-item"
          >
            <span v-if="ing.quantity || ing.unit" class="ingredient-qty">
              {{ ing.quantity }}{{ ing.unit ? ' ' + ing.unit : '' }}
            </span>
            <span class="ingredient-name">{{ ing.name }}</span>
          </li>
        </ul>
      </section>

      <!-- Instructions -->
      <section class="detail-section" aria-labelledby="instructions-title">
        <h2 id="instructions-title" class="section-title">Instructions</h2>
        <div v-if="!recipe.instructions?.trim()" class="empty-instructions">
          Aucune instruction fournie pour cette recette.
        </div>
        <ol v-else class="instruction-list">
          <li
            v-for="(step, idx) in instructionSteps"
            :key="idx"
            class="instruction-step"
          >
            {{ step }}
          </li>
        </ol>
      </section>
    </template>

    <!-- Dialogue de confirmation de suppression -->
    <dialog
      v-if="showDeleteDialog"
      ref="deleteDialog"
      class="confirm-dialog"
      open
      aria-modal="true"
      :aria-label="`Confirmer la suppression de ${recipe?.name}`"
    >
      <p class="dialog-message">
        Êtes-vous sûr de vouloir supprimer la recette
        <strong>« {{ recipe?.name }} »</strong> ?
        Cette action est irréversible.
      </p>
      <div class="dialog-actions">
        <button class="btn btn-secondary" @click="cancelDelete">Annuler</button>
        <button class="btn btn-danger" :disabled="deleting" @click="doDelete">
          {{ deleting ? 'Suppression…' : 'Supprimer' }}
        </button>
      </div>
    </dialog>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecipesStore } from '@/stores/recipes.js'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const recipesStore = useRecipesStore()

const recipe = ref(null)
const loading = ref(true)
const error = ref('')
const deleting = ref(false)
const showDeleteDialog = ref(false)

// ── Instructions découpées par lignes non vides ──────────────────────────────
const instructionSteps = computed(() => {
  if (!recipe.value?.instructions) return []
  return recipe.value.instructions
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
})

// ── Wake Lock ─────────────────────────────────────────────────────────────────
let wakeLock = null

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  } catch (err) {
    // TypeError (API non supportée) ou NotAllowedError (permission refusée)
    // → ignorer silencieusement (Req. 8.4)
    if (err.name !== 'TypeError' && err.name !== 'NotAllowedError') {
      console.warn('[WakeLock]', err.message)
    }
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {})
  wakeLock = null
}

// ── Chargement de la recette ─────────────────────────────────────────────────
onMounted(async () => {
  try {
    await recipesStore.fetchRecipe(route.params.id)
    recipe.value = recipesStore.currentRecipe
    await requestWakeLock()
  } catch (err) {
    error.value = err.status === 404
      ? 'Cette recette est introuvable.'
      : 'Impossible de charger la recette. Réessayez.'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  releaseWakeLock()
})

// ── Suppression ───────────────────────────────────────────────────────────────
function confirmDelete() {
  showDeleteDialog.value = true
}

function cancelDelete() {
  showDeleteDialog.value = false
}

async function doDelete() {
  if (!recipe.value) return
  deleting.value = true
  try {
    await recipesStore.deleteRecipe(recipe.value.id)
    router.push('/')
  } catch (err) {
    error.value = 'Impossible de supprimer la recette. Réessayez.'
    showDeleteDialog.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.detail-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 16px;
}

.loading-center { display: flex; justify-content: center; padding: 80px 0; }

.error-block {
  text-align: center;
  padding: 40px 0;
  color: #dc2626;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* ── En-tête ── */
.back-link {
  display: inline-block;
  color: #2d6a4f;
  text-decoration: none;
  font-size: 0.875rem;
  margin-bottom: 16px;
  min-height: 44px;
  line-height: 44px;
}
.back-link:hover { text-decoration: underline; }

.detail-header { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }

.detail-title {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  line-height: 1.3;
}

.detail-categories { display: flex; flex-wrap: wrap; gap: 6px; }

.category-badge {
  background: #d1fae5;
  color: #065f46;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
}

.detail-actions { display: flex; gap: 10px; flex-wrap: wrap; }

/* ── Boutons ── */
.btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 18px;
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: 6px;
  text-decoration: none;
  border: none;
  cursor: pointer;
}
.btn-secondary { background: #ffffff; color: #374151; border: 1px solid #d1d5db; }
.btn-secondary:hover { background: #f9fafb; }
.btn-danger { background: #dc2626; color: #ffffff; }
.btn-danger:hover:not(:disabled) { background: #b91c1c; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Sections ── */
.detail-section { margin-bottom: 32px; }

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e5e7eb;
}

/* ── Ingrédients ── */
.ingredient-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

.ingredient-item {
  display: flex;
  gap: 8px;
  font-size: 1rem;  /* ≥ 16 px (Req. 8.3) */
  color: #374151;
  line-height: 1.6;
}

.ingredient-qty { font-weight: 600; color: #2d6a4f; min-width: 60px; }
.ingredient-name { flex: 1; }

/* ── Instructions ── */
.instruction-list {
  margin: 0;
  padding-left: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.instruction-step {
  font-size: 1rem; /* ≥ 16 px */
  color: #374151;
  line-height: 1.7;
}

.empty-instructions { color: #6b7280; font-style: italic; font-size: 1rem; }

/* ── Dialogue de confirmation ── */
.confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border: none;
  border-radius: 10px;
  padding: 28px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  background: #ffffff;
  z-index: 100;
}

.confirm-dialog::backdrop { background: rgba(0,0,0,0.5); }

.dialog-message {
  font-size: 1rem;
  color: #374151;
  line-height: 1.6;
  margin: 0 0 20px;
}

.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
