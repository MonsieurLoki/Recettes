<!--
  RecipeCard.vue — Carte de recette pour la vue liste
  
  Affiche un résumé d'une recette (nom, catégories, date de mise à jour)
  avec un lien cliquable vers la vue détail.
  
  Exigences couvertes :
    Req. 8.1 : afficher nom + catégories + date dans la liste
    Req. 9.1 : navigation vers /recipes/:id via RouterLink
    Req. 9.5 : surface tactile ≥ 44×44 px sur toute la carte
  
  Props :
    recipe (Object) : { id, name, categories: [{id, name}], updated_at }
-->
<template>
  <article class="recipe-card" :aria-label="recipe.name">
    <router-link
      :to="`/recipes/${recipe.id}`"
      class="card-link"
      :aria-label="`Consulter la recette : ${recipe.name}`"
    >
      <!-- Nom de la recette -->
      <h2 class="card-title">{{ recipe.name }}</h2>

      <!-- Catégories associées -->
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

      <!-- Date de dernière mise à jour -->
      <p class="card-date">
        <time :datetime="recipe.updated_at">
          Mis à jour le {{ formattedDate }}
        </time>
      </p>
    </router-link>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** Objet recette : { id, name, categories, updated_at } */
  recipe: {
    type: Object,
    required: true,
  },
})

/**
 * formattedDate — Formate updated_at en date lisible en français.
 * Exemple : "15 janvier 2025"
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
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.recipe-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #2d6a4f;
}

/* Lien qui couvre toute la carte — surface tactile ≥ 44×44 px (Req. 9.5) */
.card-link {
  display: block;
  min-height: 44px;
  padding: 16px;
  text-decoration: none;
  color: inherit;
}

.card-link:focus-visible {
  outline: 2px solid #2d6a4f;
  outline-offset: 2px;
  border-radius: 6px;
}

/* ── Titre ── */
.card-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 10px;
  color: #111827;
  /* Taille ≥ 16px (Req. 9.5 implicite pour la lisibilité) */
  line-height: 1.4;
}

/* ── Badges catégories ── */
.card-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.category-badge {
  display: inline-block;
  background: #d1fae5;
  color: #065f46;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.5;
  /* Contraste : #065f46 sur #d1fae5 ≈ 7:1 (WCAG AA+) */
}

/* ── Date ── */
.card-date {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0;
}
</style>
