<!--
  CategorySelector.vue — Sélecteur multi-catégories avec création à la volée
  
  Affiche les catégories disponibles sous forme de cases à cocher.
  Permet aussi de créer une nouvelle catégorie via un champ texte + bouton.
  
  Props :
    modelValue (Array<number>) : tableau des IDs de catégories sélectionnées
    categories (Array<{id, name}>) : liste des catégories disponibles
  
  Événements émis :
    update:modelValue : tableau d'IDs mis à jour (v-model support)
    category-created  : nouvelle catégorie créée { id, name, created_at }
  
  Requirements : 4.2, 4.3, 4.4, 9.5
-->
<template>
  <div class="category-selector">
    <!-- Liste des catégories existantes -->
    <fieldset class="category-list">
      <legend class="category-legend">Catégories</legend>

      <p v-if="categories.length === 0" class="empty-msg">
        Aucune catégorie disponible.
      </p>

      <label
        v-for="cat in categories"
        :key="cat.id"
        class="category-item"
      >
        <input
          type="checkbox"
          :value="cat.id"
          :checked="modelValue.includes(cat.id)"
          class="category-checkbox"
          @change="onToggle(cat.id)"
        />
        <span class="category-name">{{ cat.name }}</span>
      </label>
    </fieldset>

    <!-- Section création d'une nouvelle catégorie -->
    <div class="new-category">
      <label for="new-cat-input" class="new-cat-label">
        Nouvelle catégorie
      </label>
      <div class="new-cat-row">
        <input
          id="new-cat-input"
          v-model="newCatName"
          type="text"
          placeholder="Apéritif, Brunch…"
          maxlength="100"
          class="new-cat-input"
          aria-label="Nom de la nouvelle catégorie"
          @keyup.enter="addCategory"
        />
        <button
          type="button"
          class="btn-add"
          :disabled="!newCatName.trim() || adding"
          @click="addCategory"
          aria-label="Ajouter la catégorie"
        >
          {{ adding ? '…' : 'Ajouter' }}
        </button>
      </div>
      <p v-if="addError" class="error-msg" role="alert">{{ addError }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useCategoriesStore } from '@/stores/categories.js'

const props = defineProps({
  /** Tableau des IDs de catégories sélectionnées (v-model) */
  modelValue: {
    type: Array,
    default: () => [],
  },
  /** Liste des catégories disponibles à afficher */
  categories: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue', 'category-created'])

const store = useCategoriesStore()
const newCatName = ref('')
const adding = ref(false)
const addError = ref('')

/**
 * onToggle — Ajoute ou retire un ID de catégorie de la sélection.
 * Émet `update:modelValue` avec le nouveau tableau d'IDs.
 *
 * @param {number} id - ID de la catégorie à basculer
 */
function onToggle(id) {
  const current = [...props.modelValue]
  const idx = current.indexOf(id)
  if (idx === -1) {
    current.push(id)
  } else {
    current.splice(idx, 1)
  }
  emit('update:modelValue', current)
}

/**
 * addCategory — Crée une nouvelle catégorie via le store et émet les événements
 * appropriés pour que le parent puisse mettre à jour sa liste.
 */
async function addCategory() {
  const name = newCatName.value.trim()
  if (!name) return

  adding.value = true
  addError.value = ''

  try {
    const created = await store.createCategory(name)
    newCatName.value = ''
    emit('category-created', created)
  } catch (err) {
    addError.value = err.message ?? 'Erreur lors de la création de la catégorie.'
  } finally {
    adding.value = false
  }
}
</script>

<style scoped>
.category-selector {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Liste des catégories ── */
.category-list {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 0;
}

.category-legend {
  font-weight: 600;
  font-size: 0.875rem;
  padding: 0 4px;
  color: #374151;
}

/* Surface tactile ≥ 44×44 px sur chaque case (Req. 9.5) */
.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
  padding: 2px 0;
}

.category-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: #2d6a4f;
}

.category-name {
  font-size: 1rem;
  color: #111827;
}

.empty-msg {
  color: #6b7280;
  font-style: italic;
  margin: 8px 0 0;
}

/* ── Nouvelle catégorie ── */
.new-category {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.new-cat-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.new-cat-row {
  display: flex;
  gap: 8px;
}

.new-cat-input {
  flex: 1;
  min-height: 44px;
  padding: 8px 12px;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  background: #ffffff;
  color: #111827;
}

.new-cat-input:focus {
  outline: 2px solid #2d6a4f;
  outline-offset: 2px;
  border-color: transparent;
}

.btn-add {
  min-width: 90px;
  min-height: 44px;
  padding: 8px 16px;
  font-size: 1rem;
  font-weight: 500;
  background: #2d6a4f;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-add:hover:not(:disabled) {
  background: #1f4d38;
}

.btn-add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-msg {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0;
}
</style>
