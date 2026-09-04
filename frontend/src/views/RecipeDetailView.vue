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

.loading-center {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}

.error-block {
  text-align: center;
  padding: 40px 0;
  color: var(--color-danger);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* ── Header ── */
.back-link {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  min-height: 44px;
  line-height: 44px;
  transition: color 0.15s ease;
}

.back-link:hover {
  color: var(--color-primary-dark);
  text-decoration: underline;
}

.detail-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 32px;
}

.detail-title {
  font-family: var(--font-heading);
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.3;
}

.detail-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.category-badge {
  background: var(--color-accent-light);
  color: var(--color-secondary);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid #fde68a;
}

.detail-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 10px 18px;
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: var(--radius-sm);
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
}

.btn-danger {
  background: var(--color-danger);
  color: #ffffff;
}

.btn-danger:hover:not(:disabled) {
  background: #b91c1c;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* ── Content sections ── */
.detail-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
  margin-bottom: 20px;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0 0 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--color-border);
}

/* ── Ingredients ── */
.ingredient-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ingredient-item {
  display: flex;
  gap: 10px;
  font-size: 1rem; /* ≥ 16 px (Req. 8.3) */
  color: var(--color-text);
  line-height: 1.6;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-bg);
}

.ingredient-item:last-child {
  border-bottom: none;
}

/* Quantity displayed in accent color */
.ingredient-qty {
  font-weight: 600;
  color: var(--color-secondary);
  min-width: 72px;
  flex-shrink: 0;
}

.ingredient-name {
  flex: 1;
}

/* ── Instructions ── */
.instruction-list {
  margin: 0;
  padding-left: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  list-style: none;
  counter-reset: step-counter;
}

.instruction-step {
  display: flex;
  gap: 14px;
  font-size: 1rem; /* ≥ 16 px */
  color: var(--color-text);
  line-height: 1.7;
  counter-increment: step-counter;
}

/* Custom step number */
.instruction-step::before {
  content: counter(step-counter);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-pill);
  font-size: 0.8125rem;
  font-weight: 600;
  font-family: var(--font-body);
  margin-top: 2px;
}

.empty-instructions {
  color: var(--color-text-muted);
  font-style: italic;
  font-size: 1rem;
}

/* ── Delete confirmation dialog ── */
.confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border: none;
  border-radius: var(--radius-lg);
  padding: 28px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  background: var(--color-surface);
  z-index: 100;
}

.confirm-dialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

.dialog-message {
  font-size: 1rem;
  color: var(--color-text);
  line-height: 1.6;
  margin: 0 0 20px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
