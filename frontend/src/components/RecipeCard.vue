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

      <!-- Thumbnail — only when photo exists (Req. 8.3, 8.4) -->
      <div v-if="thumbnailSrc" class="card-thumbnail">
        <img
          :src="thumbnailSrc"
          :alt="`Photo de ${recipe.name}`"
          class="card-thumb-img"
          @error="thumbnailError = true"
        />
      </div>

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

        <!-- Time badge (Req. 4.1, 4.2) -->
        <div v-if="totalTime" class="card-time">
          ⏱ {{ formattedTime }}
        </div>

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
import { computed, ref } from 'vue'
import { formatTime } from '@/utils/servings.js'

const props = defineProps({
  /** Recipe object: { id, name, categories, updated_at, photo_path, prep_time, cook_time } */
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

/**
 * totalTime — Sum of prep_time and cook_time in minutes.
 * Returns null when both fields are null (badge is hidden).
 */
const totalTime = computed(() => {
  const p = props.recipe.prep_time ?? 0
  const c = props.recipe.cook_time ?? 0
  if (!props.recipe.prep_time && !props.recipe.cook_time) return null
  return p + c
})

/** formattedTime — Human-readable total time string, e.g. "45 min", "1h 30min". */
const formattedTime = computed(() => totalTime.value ? formatTime(totalTime.value) : '')

/** thumbnailError — Set to true when the photo fails to load (hides the broken image). */
const thumbnailError = ref(false)

/**
 * thumbnailSrc — Constructs the photo URL from photo_path.
 * Returns null when no photo or after an error, so the <img> is hidden.
 */
const thumbnailSrc = computed(() => {
  if (!props.recipe.photo_path || thumbnailError.value) return null
  const filename = props.recipe.photo_path.split('/').pop()
  return `/api/photos/${filename}`
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

/* ── Thumbnail ── */
.card-thumbnail {
  width: 100%;
  height: 160px;
  overflow: hidden;
  background: var(--color-bg);
}

.card-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ── Time badge ── */
.card-time {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
