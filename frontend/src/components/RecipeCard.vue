<!--
  RecipeCard.vue — Recipe card for the list view

  Displays a recipe summary (name, categories, update date)
  with a clickable link to the detail view.

  Requirements covered:
    Req. 8.1 : display name + categories + date in the list
    Req. 9.1 : navigation to /recipes/:id via RouterLink
    Req. 9.5 : touch target ≥ 44×44 px on the whole card

  Props:
    recipe (Object) : { id, name, categories: [{id, name}], updated_at }
-->
<template>
  <article class="recipe-card" :aria-label="recipe.name">
    <router-link
      :to="`/recipes/${recipe.id}`"
      class="card-link"
      :aria-label="`Consulter la recette : ${recipe.name}`"
    >
      <!-- Gradient accent bar at the top -->
      <div class="card-accent-bar" aria-hidden="true"></div>

      <div class="card-body">
        <!-- Recipe name -->
        <h2 class="card-title">{{ recipe.name }}</h2>

        <!-- Associated categories -->
        <div
          v-if="recipe.categories?.length"
          class="card-categories"
          aria-label="Catégories"
        >
          <span
            v-for="cat in recipe.categories"
            :key="cat.id"
            class="category-badge"
          >{{ cat.name }}</span>
        </div>
        <div v-else class="card-no-cat">Sans catégorie</div>

        <!-- Last update date -->
        <p class="card-date">
          <time :datetime="recipe.updated_at">
            Mis à jour le {{ formattedDate }}
          </time>
        </p>
      </div>
    </router-link>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** Recipe object: { id, name, categories, updated_at } */
  recipe: {
    type: Object,
    required: true,
  },
})

/**
 * formattedDate — Formats updated_at as a human-readable French date.
 * Example: "15 janvier 2025"
 */
const formattedDate = computed(() => {
  if (!props.recipe.updated_at) return ''
  try {
    return new Date(props.recipe.updated_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return props.recipe.updated_at
  }
})
</script>

<style scoped>
.recipe-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.recipe-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--color-shadow);
}

/* Gradient top bar — decorative */
.card-accent-bar {
  height: 4px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
}

/* Full-card clickable link — touch target ≥ 44×44 px (Req. 9.5) */
.card-link {
  display: block;
  min-height: 44px;
  text-decoration: none;
  color: inherit;
}

.card-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}

/* ── Card body ── */
.card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Title ── */
.card-title {
  font-family: var(--font-heading);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.3;
}

/* ── Category badges ── */
.card-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.category-badge {
  display: inline-block;
  background: var(--color-accent-light);
  color: var(--color-secondary);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid #fde68a;
  line-height: 1.5;
}

.card-no-cat {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  font-style: italic;
}

/* ── Date ── */
.card-date {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0;
}
</style>
