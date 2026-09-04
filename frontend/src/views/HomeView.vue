<!--
  HomeView.vue — Vue principale : liste des recettes avec recherche et filtres
  
  Exigences couvertes :
    Req. 7.2 : lancer la recherche à chaque changement de filtre
    Req. 7.3 : filtre par nom
    Req. 7.4 : filtre par ingrédient
    Req. 7.5 : filtre par catégorie
    Req. 7.6 : afficher le résultat ou « Aucune recette trouvée »
    Req. 7.7 : pagination de la liste
    Req. 9.1 : navigation vers /capture et /recipes/new/edit
    Req. 9.5 : surface tactile ≥ 44×44 px sur tous les contrôles interactifs
    Req. 9.7 : spinner visible après 500 ms de chargement
-->
<template>
  <main class="home-view">
    <!-- ── En-tête ── -->
    <header class="home-header">
      <div class="home-heading">
        <h1 class="home-title">Bonjour 👋</h1>
        <p class="home-subtitle">Que cuisinez-vous aujourd'hui ?</p>
      </div>
      <div class="header-actions">
        <router-link
          to="/capture"
          class="btn btn-secondary"
          aria-label="Ajouter une recette par photo"
        >
          📷 Ajouter par photo
        </router-link>
        <router-link
          to="/recipes/new/edit"
          class="btn btn-primary"
          aria-label="Créer une nouvelle recette"
        >
          + Nouvelle recette
        </router-link>
      </div>
    </header>

    <!-- ── Filtres de recherche ── -->
    <section class="search-section" aria-label="Filtres de recherche">
      <!-- Recherche par nom / ingrédient (Req. 7.3, 7.4) -->
      <SearchBar @search="onSearch" />

      <!-- Filtre par temps total (Req. 5.1, 5.2, 5.5) -->
      <select
        v-model="maxTime"
        class="time-filter"
        aria-label="Filtrer par temps de préparation"
      >
        <option :value="null">⏱ Toutes les durées</option>
        <option :value="30">Moins de 30 min</option>
        <option :value="60">Moins de 1 h</option>
        <option :value="120">Moins de 2 h</option>
      </select>

      <!-- Filtre par catégorie (Req. 7.5) -->
      <details class="category-filter">
        <summary class="category-filter-toggle">
          Filtrer par catégorie
          <span
            v-if="selectedCategories.length"
            class="filter-badge"
            aria-label="`${selectedCategories.length} catégorie(s) sélectionnée(s)`"
          >{{ selectedCategories.length }}</span>
        </summary>
        <div class="category-filter-body">
          <CategorySelector
            v-model="selectedCategories"
            :categories="categoriesStore.categories"
          />
        </div>
      </details>
    </section>

    <!-- ── Spinner différé > 500 ms (Req. 9.7) ── -->
    <div v-if="showSpinner" class="spinner-container" aria-live="polite">
      <LoadingSpinner :size="40" label="Chargement des recettes…" />
    </div>

    <!-- ── Résultats ── -->
    <section v-else class="recipes-section" aria-label="Liste des recettes">
      <!-- Message vide (Req. 7.6) -->
      <p
        v-if="recipesStore.total === 0 && !recipesStore.loading"
        class="empty-msg"
        role="status"
      >
        Aucune recette trouvée.
      </p>

      <!-- Grille de RecipeCards -->
      <div v-else class="recipe-grid">
        <RecipeCard
          v-for="recipe in recipesStore.recipes"
          :key="recipe.id"
          :recipe="recipe"
        />
      </div>

      <!-- Pagination (Req. 7.7) -->
      <nav
        v-if="totalPages > 1"
        class="pagination"
        aria-label="Pagination des recettes"
      >
        <button
          class="btn btn-secondary"
          :disabled="currentPage <= 1"
          @click="changePage(currentPage - 1)"
          aria-label="Page précédente"
        >
          ← Précédent
        </button>
        <span class="page-info" aria-current="page">
          Page {{ currentPage }} / {{ totalPages }}
        </span>
        <button
          class="btn btn-secondary"
          :disabled="currentPage >= totalPages"
          @click="changePage(currentPage + 1)"
          aria-label="Page suivante"
        >
          Suivant →
        </button>
      </nav>
    </section>

    <!-- Erreur globale -->
    <p v-if="recipesStore.error" class="error-msg" role="alert">
      {{ recipesStore.error }}
    </p>
  </main>
</template>

<script setup>
/**
 * HomeView — Page d'accueil de l'application.
 *
 * Orchestre les filtres (nom, ingrédient, catégories) et la pagination,
 * déclenche fetchRecipes à chaque changement de filtre (Req. 7.2),
 * et affiche un spinner différé à 500 ms (Req. 9.7).
 */
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRecipesStore } from '@/stores/recipes.js'
import { useCategoriesStore } from '@/stores/categories.js'
import SearchBar from '@/components/SearchBar.vue'
import RecipeCard from '@/components/RecipeCard.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import CategorySelector from '@/components/CategorySelector.vue'

const recipesStore = useRecipesStore()
const categoriesStore = useCategoriesStore()

// ── État des filtres ────────────────────────────────────────────────────────
const searchName = ref('')
const searchIngredient = ref('')
const selectedCategories = ref([])
const currentPage = ref(1)
const PAGE_SIZE = 20
const maxTime = ref(null)

// ── Spinner différé (> 500 ms) ──────────────────────────────────────────────
const showSpinner = ref(false)
let spinnerTimer = null

watch(
  () => recipesStore.loading,
  (loading) => {
    if (loading) {
      spinnerTimer = setTimeout(() => {
        showSpinner.value = true
      }, 500)
    } else {
      clearTimeout(spinnerTimer)
      showSpinner.value = false
    }
  }
)

// Nettoyage du timer lors de la destruction du composant
onBeforeUnmount(() => {
  clearTimeout(spinnerTimer)
})

// ── Pagination ──────────────────────────────────────────────────────────────
const totalPages = computed(() =>
  Math.max(1, Math.ceil(recipesStore.total / PAGE_SIZE))
)

// ── Chargement des recettes ─────────────────────────────────────────────────
function loadRecipes() {
  recipesStore.fetchRecipes({
    name: searchName.value,
    ingredient: searchIngredient.value,
    categories: selectedCategories.value,
    page: currentPage.value,
    limit: PAGE_SIZE,
    maxTime: maxTime.value,
  })
}

// ── Gestionnaires d'événements ──────────────────────────────────────────────

/**
 * onSearch — Reçoit { name, ingredient } depuis SearchBar (Req. 7.2, 7.3, 7.4).
 * Remet la pagination à la page 1 avant de recharger.
 */
function onSearch({ name, ingredient }) {
  searchName.value = name
  searchIngredient.value = ingredient
  currentPage.value = 1
  loadRecipes()
}

/**
 * Réagit aux changements de sélection de catégories (Req. 7.5).
 * Déclenchée par le watch sur selectedCategories.
 */
watch(selectedCategories, () => {
  currentPage.value = 1
  loadRecipes()
})

/**
 * Réagit aux changements de filtre par temps total (Req. 5.1, 5.2, 5.5).
 */
watch(maxTime, () => {
  currentPage.value = 1
  loadRecipes()
})

/**
 * changePage — Passe à une page donnée et remonte en haut de la page.
 *
 * @param {number} page - Numéro de la page cible
 */
function changePage(page) {
  currentPage.value = page
  loadRecipes()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Chargement initial ──────────────────────────────────────────────────────
onMounted(async () => {
  // Charger les catégories si pas encore disponibles
  if (categoriesStore.categories.length === 0) {
    await categoriesStore.fetchCategories()
  }
  // Charger la liste des recettes
  loadRecipes()
})
</script>

<style scoped>
/* ── General layout ── */
.home-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px;
}

/* ── Header ── */
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 28px;
}

.home-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.home-title {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
}

.home-subtitle {
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Buttons — touch target ≥ 44×44 px (Req. 9.5) ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 10px 18px;
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: var(--radius-sm);
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.btn-primary {
  background: var(--color-primary);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--color-primary-dark);
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* ── Search section ── */
.search-section {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Category filter (accessible details/summary) ── */
.category-filter {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.category-filter-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  min-height: 44px; /* Req. 9.5 */
  font-weight: 500;
  font-size: 0.9375rem;
  color: var(--color-text);
  cursor: pointer;
  list-style: none; /* hide native triangle on Chrome */
  user-select: none;
}

/* Custom arrow */
.category-filter-toggle::before {
  content: '▶';
  font-size: 0.625rem;
  transition: transform 0.2s ease;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

details[open] .category-filter-toggle::before {
  transform: rotate(90deg);
}

.category-filter-toggle::-webkit-details-marker {
  display: none;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}

.category-filter-body {
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

/* ── Results section ── */
.recipes-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Responsive recipe card grid */
.recipe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* "No recipes found" message (Req. 7.6) */
.empty-msg {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 1rem;
  padding: 48px 0;
}

/* ── Spinner ── */
.spinner-container {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

/* ── Pagination (Req. 7.7) ── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding-top: 16px;
  flex-wrap: wrap;
}

.page-info {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* ── Global error ── */
.error-msg {
  color: var(--color-danger);
  font-size: 0.875rem;
  margin-top: 16px;
  text-align: center;
}

/* ── Time filter ── */
.time-filter {
  min-height: 44px;
  padding: 8px 12px;
  font-size: 0.9375rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  align-self: flex-start;
}

.time-filter:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
