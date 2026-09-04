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
      <!-- Photo header (Req. 8.1, 8.2) -->
      <div v-if="photoSrc" class="recipe-photo-header">
        <img
          :src="photoSrc"
          :alt="`Photo de ${recipe.name}`"
          class="recipe-photo-img"
          @error="photoError = true"
        />
      </div>

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

        <!-- Temps de préparation et cuisson (Req. 4.3, 4.4) -->
        <div v-if="hasTimes" class="detail-times">
          <span v-if="recipe.prep_time" class="time-pill">
            🥄 Préparation : {{ formatTime(recipe.prep_time) }}
          </span>
          <span v-if="recipe.cook_time" class="time-pill">
            🔥 Cuisson : {{ formatTime(recipe.cook_time) }}
          </span>
          <span class="time-pill time-total">
            ⏱ Total : {{ formatTime(totalTime) }}
          </span>
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

        <!-- Contrôle des portions (Req. 2.1–2.10) -->
        <div class="servings-control" aria-label="Ajuster les portions">
          <span class="servings-label">Portions :</span>
          <button
            class="servings-btn"
            :disabled="currentServings <= 1"
            aria-label="Réduire les portions"
            @click="currentServings = Math.max(1, currentServings - 1)"
          >−</button>
          <span class="servings-count" aria-live="polite">{{ currentServings }}</span>
          <button
            class="servings-btn"
            :disabled="currentServings >= 100"
            aria-label="Augmenter les portions"
            @click="currentServings = Math.min(100, currentServings + 1)"
          >+</button>
          <span v-if="currentServings !== recipe.servings" class="servings-original">
            (recette originale : {{ recipe.servings }})
          </span>
        </div>

        <ul class="ingredient-list">
          <li
            v-for="(ing, idx) in scaledIngredients"
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

      <!-- Notes personnelles (Req. 10.1–10.10) -->
      <section class="detail-section" aria-labelledby="notes-title">
        <div class="notes-header">
          <h2 id="notes-title" class="section-title">Mes notes</h2>
          <button
            v-if="!editingNotes"
            class="btn-edit-notes"
            aria-label="Modifier les notes"
            @click="startEditNotes"
          >
            ✏️
          </button>
        </div>

        <!-- Read mode -->
        <div v-if="!editingNotes">
          <p v-if="recipe.notes?.trim()" class="notes-text">{{ recipe.notes }}</p>
          <p v-else class="notes-placeholder">Ajouter une note… (conseils, variantes, souvenirs)</p>
        </div>

        <!-- Edit mode -->
        <div v-else class="notes-edit">
          <textarea
            v-model="notesDraft"
            class="notes-textarea"
            rows="5"
            maxlength="2000"
            placeholder="Vos notes personnelles sur cette recette…"
            aria-label="Notes personnelles"
          />
          <div class="notes-counter" :class="{ 'notes-counter--warn': notesDraft.length > 1800 }">
            {{ notesDraft.length }} / 2000
          </div>
          <p v-if="notesError" class="notes-error" role="alert">{{ notesError }}</p>
          <div class="notes-actions">
            <button class="btn btn-secondary" @click="cancelEditNotes">Annuler</button>
            <button
              class="btn btn-primary"
              :disabled="savingNotes"
              @click="saveNotes"
            >
              {{ savingNotes ? 'Sauvegarde…' : 'Sauvegarder' }}
            </button>
          </div>
        </div>
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
import { scaleQuantity, formatTime } from '@/utils/servings.js'

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

// ── Photo header ──────────────────────────────────────────────────────────────
const photoError = ref(false)
const photoSrc = computed(() => {
  if (!recipe.value?.photo_path || photoError.value) return null
  const filename = recipe.value.photo_path.split('/').pop()
  return `/api/photos/${filename}`
})

// ── Temps ─────────────────────────────────────────────────────────────────────
const hasTimes = computed(() =>
  recipe.value && (recipe.value.prep_time || recipe.value.cook_time)
)
const totalTime = computed(() => {
  if (!hasTimes.value) return 0
  return (recipe.value.prep_time ?? 0) + (recipe.value.cook_time ?? 0)
})

// ── Portions ajustables ────────────────────────────────────────────────────────
const currentServings = ref(4)
const scaledIngredients = computed(() => {
  if (!recipe.value?.ingredients) return []
  return recipe.value.ingredients.map(ing => ({
    ...ing,
    quantity: scaleQuantity(ing.quantity, recipe.value.servings, currentServings.value),
  }))
})

// ── Notes inline ───────────────────────────────────────────────────────────────
const editingNotes = ref(false)
const notesDraft = ref('')
const notesError = ref('')
const savingNotes = ref(false)

function startEditNotes() {
  notesDraft.value = recipe.value?.notes ?? ''
  notesError.value = ''
  editingNotes.value = true
}

function cancelEditNotes() {
  editingNotes.value = false
  notesError.value = ''
}

async function saveNotes() {
  if (!recipe.value) return
  savingNotes.value = true
  notesError.value = ''
  try {
    const updated = await recipesStore.updateRecipe(recipe.value.id, {
      name: recipe.value.name,
      instructions: recipe.value.instructions,
      ingredients: recipe.value.ingredients,
      category_ids: recipe.value.categories?.map(c => c.id) ?? [],
      servings: recipe.value.servings,
      prep_time: recipe.value.prep_time,
      cook_time: recipe.value.cook_time,
      notes: notesDraft.value,
    })
    recipe.value = { ...recipe.value, notes: updated.notes }
    editingNotes.value = false
  } catch (err) {
    notesError.value = err.message ?? 'Impossible de sauvegarder les notes.'
  } finally {
    savingNotes.value = false
  }
}

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
    currentServings.value = recipesStore.currentRecipe?.servings ?? 4
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

/* ── Photo header ── */
.recipe-photo-header {
  width: 100%;
  max-height: 320px;
  overflow: hidden;
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.recipe-photo-img {
  width: 100%;
  height: 320px;
  object-fit: cover;
  display: block;
}

/* ── Times ── */
.detail-times {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.time-pill {
  background: var(--color-primary-light);
  color: var(--color-primary);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid var(--color-border);
}

.time-total {
  background: var(--color-accent-light);
  color: var(--color-secondary);
  border-color: #fde68a;
}

/* ── Servings control ── */
.servings-control {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.servings-label {
  font-weight: 500;
  font-size: 0.9375rem;
}

.servings-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-primary);
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.servings-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: #fff;
}

.servings-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.servings-count {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
  min-width: 2ch;
  text-align: center;
}

.servings-original {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  font-style: italic;
}

/* ── Notes ── */
.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.notes-header .section-title {
  margin-bottom: 0;
  border-bottom: none;
  padding-bottom: 0;
}

.btn-edit-notes {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.125rem;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.btn-edit-notes:hover {
  background: var(--color-primary-light);
}

.notes-text {
  font-size: 1rem;
  color: var(--color-text);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
}

.notes-placeholder {
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  font-style: italic;
  margin: 0;
}

.notes-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notes-textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 1rem;
  font-family: inherit;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  resize: vertical;
  box-sizing: border-box;
  background: var(--color-surface);
  color: var(--color-text);
  line-height: 1.6;
}

.notes-textarea:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.notes-counter {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: right;
}

.notes-counter--warn {
  color: var(--color-danger);
}

.notes-error {
  color: var(--color-danger);
  font-size: 0.875rem;
  margin: 0;
}

.notes-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.notes-actions .btn {
  min-height: 40px;
  padding: 8px 16px;
  font-size: 0.875rem;
  border-radius: var(--radius-sm);
  font-weight: 500;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.notes-actions .btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.notes-actions .btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.notes-actions .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notes-actions .btn-secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.notes-actions .btn-secondary:hover {
  background: var(--color-primary-light);
}
</style>
