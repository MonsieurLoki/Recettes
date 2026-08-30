<!--
  RecipeForm.vue — Formulaire de création/modification de recette
  
  Gère la saisie complète d'une recette : nom, catégories (multi-select),
  liste dynamique d'ingrédients et instructions en texte libre.
  
  Props :
    initialData (Object) : recette existante pour le mode édition (optionnel)
    recipeId (Number|null) : ID de la recette à modifier (null en création)
  
  Événements :
    saved : recette créée/mise à jour { id, name, ... }
  
  Requirements : 5.1, 5.2, 5.3, 5.6, 9.5, 9.6
-->
<template>
  <form class="recipe-form" novalidate @submit.prevent="handleSubmit">
    <!-- ── Nom de la recette ── -->
    <div class="form-field">
      <label for="recipe-name" class="field-label">
        Nom de la recette <span class="required" aria-hidden="true">*</span>
      </label>
      <input
        id="recipe-name"
        v-model="form.name"
        type="text"
        maxlength="200"
        placeholder="Tarte aux pommes…"
        class="field-input"
        :class="{ 'field-input--error': errors.name }"
        aria-required="true"
        :aria-describedby="errors.name ? 'name-error' : undefined"
      />
      <p v-if="errors.name" id="name-error" class="field-error" role="alert">
        {{ errors.name }}
      </p>
    </div>

    <!-- ── Catégories ── -->
    <div class="form-field">
      <CategorySelector
        v-model="form.category_ids"
        :categories="categoriesStore.categories"
        @category-created="onCategoryCreated"
      />
    </div>

    <!-- ── Ingrédients ── -->
    <div class="form-field">
      <fieldset class="ingredients-fieldset">
        <legend class="field-label">
          Ingrédients <span class="required" aria-hidden="true">*</span>
        </legend>

        <div
          v-for="(ing, idx) in form.ingredients"
          :key="idx"
          class="ingredient-row"
        >
          <input
            v-model="ing.name"
            type="text"
            :placeholder="`Ingrédient ${idx + 1}`"
            maxlength="200"
            class="field-input ing-name"
            :aria-label="`Nom de l'ingrédient ${idx + 1}`"
          />
          <input
            v-model="ing.quantity"
            type="text"
            placeholder="Qté"
            maxlength="50"
            class="field-input ing-qty"
            :aria-label="`Quantité de l'ingrédient ${idx + 1}`"
          />
          <input
            v-model="ing.unit"
            type="text"
            placeholder="Unité"
            maxlength="50"
            class="field-input ing-unit"
            :aria-label="`Unité de l'ingrédient ${idx + 1}`"
          />
          <button
            v-if="form.ingredients.length > 1"
            type="button"
            class="btn-remove"
            :aria-label="`Supprimer l'ingrédient ${idx + 1}`"
            @click="removeIngredient(idx)"
          >
            ✕
          </button>
        </div>

        <p v-if="errors.ingredients" class="field-error" role="alert">
          {{ errors.ingredients }}
        </p>

        <button
          type="button"
          class="btn-add-ingredient"
          :disabled="form.ingredients.length >= 50"
          @click="addIngredient"
        >
          + Ajouter un ingrédient
        </button>
      </fieldset>
    </div>

    <!-- ── Instructions ── -->
    <div class="form-field">
      <label for="recipe-instructions" class="field-label">
        Instructions <span class="required" aria-hidden="true">*</span>
      </label>
      <textarea
        id="recipe-instructions"
        v-model="form.instructions"
        rows="8"
        maxlength="10000"
        placeholder="Décrivez les étapes de préparation…"
        class="field-textarea"
        :class="{ 'field-input--error': errors.instructions }"
        aria-required="true"
        :aria-describedby="errors.instructions ? 'instructions-error' : undefined"
      />
      <p v-if="errors.instructions" id="instructions-error" class="field-error" role="alert">
        {{ errors.instructions }}
      </p>
    </div>

    <!-- ── Erreur globale ── -->
    <p v-if="globalError" class="global-error" role="alert">
      {{ globalError }}
    </p>

    <!-- ── Message de succès ── -->
    <p v-if="successMessage" class="success-msg" role="status" aria-live="polite">
      {{ successMessage }}
    </p>

    <!-- ── Bouton Enregistrer ── -->
    <div class="form-actions">
      <button
        type="submit"
        class="btn-submit"
        :disabled="submitting"
      >
        {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import CategorySelector from '@/components/CategorySelector.vue'
import { useCategoriesStore } from '@/stores/categories.js'
import { useRecipesStore } from '@/stores/recipes.js'

const props = defineProps({
  /** Recette existante à pré-remplir (mode édition) */
  initialData: {
    type: Object,
    default: null,
  },
  /** ID de la recette en cours de modification (null en création) */
  recipeId: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits(['saved'])

const categoriesStore = useCategoriesStore()
const recipesStore = useRecipesStore()

// ── Formulaire ──────────────────────────────────────────────────────────────

const form = reactive({
  name: '',
  instructions: '',
  ingredients: [{ name: '', quantity: '', unit: '' }],
  category_ids: [],
})

const errors = reactive({
  name: '',
  instructions: '',
  ingredients: '',
})

const submitting = ref(false)
const globalError = ref('')
const successMessage = ref('')

// ── Initialisation en mode édition ─────────────────────────────────────────

onMounted(async () => {
  // Charger les catégories si pas encore disponibles
  if (categoriesStore.categories.length === 0) {
    await categoriesStore.fetchCategories()
  }

  // Pré-remplir le formulaire si on est en mode édition
  if (props.initialData) {
    form.name = props.initialData.name ?? ''
    form.instructions = props.initialData.instructions ?? ''
    form.ingredients = props.initialData.ingredients?.length
      ? props.initialData.ingredients.map(i => ({
          name: i.name ?? '',
          quantity: i.quantity ?? '',
          unit: i.unit ?? '',
        }))
      : [{ name: '', quantity: '', unit: '' }]
    form.category_ids = props.initialData.categories?.map(c => c.id) ?? []
  }
})

// ── Gestion des ingrédients ─────────────────────────────────────────────────

function addIngredient() {
  if (form.ingredients.length < 50) {
    form.ingredients.push({ name: '', quantity: '', unit: '' })
  }
}

function removeIngredient(idx) {
  if (form.ingredients.length > 1) {
    form.ingredients.splice(idx, 1)
  }
}

// ── Gestion des catégories ─────────────────────────────────────────────────

function onCategoryCreated(newCat) {
  // La nouvelle catégorie est déjà ajoutée au store par CategorySelector.
  // On la sélectionne automatiquement.
  if (!form.category_ids.includes(newCat.id)) {
    form.category_ids.push(newCat.id)
  }
}

// ── Validation locale ───────────────────────────────────────────────────────

function validate() {
  errors.name = ''
  errors.instructions = ''
  errors.ingredients = ''
  let valid = true

  if (!form.name.trim()) {
    errors.name = 'Le nom de la recette est obligatoire.'
    valid = false
  } else if (form.name.trim().length > 200) {
    errors.name = 'Le nom ne peut pas dépasser 200 caractères.'
    valid = false
  }

  const filledIngredients = form.ingredients.filter(i => i.name.trim())
  if (filledIngredients.length === 0) {
    errors.ingredients = 'Ajoutez au moins un ingrédient.'
    valid = false
  } else if (form.ingredients.length > 50) {
    errors.ingredients = 'Maximum 50 ingrédients.'
    valid = false
  }

  if (!form.instructions.trim()) {
    errors.instructions = 'Les instructions sont obligatoires.'
    valid = false
  } else if (form.instructions.trim().length > 10000) {
    errors.instructions = 'Les instructions ne peuvent pas dépasser 10 000 caractères.'
    valid = false
  }

  return valid
}

// ── Soumission ──────────────────────────────────────────────────────────────

async function handleSubmit() {
  globalError.value = ''
  successMessage.value = ''

  if (!validate()) return

  submitting.value = true

  const body = {
    name: form.name.trim(),
    instructions: form.instructions.trim(),
    ingredients: form.ingredients
      .filter(i => i.name.trim())
      .map(i => ({
        name: i.name.trim(),
        quantity: i.quantity.trim() || undefined,
        unit: i.unit.trim() || undefined,
      })),
    category_ids: form.category_ids,
  }

  try {
    let saved
    if (props.recipeId) {
      saved = await recipesStore.updateRecipe(props.recipeId, body)
    } else {
      saved = await recipesStore.createRecipe(body)
    }

    // Message de succès visible ≥ 3 secondes (Req. 9.6)
    successMessage.value = props.recipeId
      ? 'Recette mise à jour avec succès !'
      : 'Recette créée avec succès !'

    setTimeout(() => {
      successMessage.value = ''
    }, 3000)

    emit('saved', saved)
  } catch (err) {
    // Erreurs de validation backend → afficher inline
    if (err.errors) {
      if (err.errors.name)         errors.name         = err.errors.name
      if (err.errors.instructions) errors.instructions = err.errors.instructions
      if (err.errors.ingredients)  errors.ingredients  = err.errors.ingredients
    } else {
      globalError.value = err.message ?? 'Une erreur est survenue. Réessayez.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.recipe-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.required {
  color: #dc2626;
  margin-left: 2px;
}

/* ── Champs de saisie ── */
.field-input {
  min-height: 44px; /* Surface tactile ≥ 44px (Req. 9.5) */
  padding: 8px 12px;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  background: #ffffff;
  color: #111827;
}

.field-input:focus,
.field-textarea:focus {
  outline: 2px solid #2d6a4f;
  outline-offset: 2px;
  border-color: transparent;
}

.field-input--error {
  border-color: #dc2626;
}

.field-textarea {
  padding: 10px 12px;
  font-size: 1rem;
  font-family: inherit;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  resize: vertical;
  min-height: 160px;
  box-sizing: border-box;
  background: #ffffff;
  color: #111827;
  line-height: 1.6;
}

/* ── Ingrédients ── */
.ingredients-fieldset {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ingredient-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ing-name  { flex: 3; }
.ing-qty   { flex: 1; min-width: 70px; }
.ing-unit  { flex: 1; min-width: 70px; }

.btn-remove {
  min-width: 36px;
  min-height: 36px;
  padding: 4px;
  border: none;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.btn-remove:hover { background: #fca5a5; }

.btn-add-ingredient {
  align-self: flex-start;
  min-height: 36px;
  padding: 6px 12px;
  font-size: 0.875rem;
  background: #f0fdf4;
  color: #2d6a4f;
  border: 1px dashed #2d6a4f;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 4px;
}

.btn-add-ingredient:hover:not(:disabled) { background: #dcfce7; }
.btn-add-ingredient:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Messages ── */
.field-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0;
}

.global-error {
  color: #dc2626;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.875rem;
  margin: 0;
}

.success-msg {
  color: #065f46;
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.875rem;
  margin: 0;
}

/* ── Actions ── */
.form-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-submit {
  min-height: 44px;
  padding: 10px 24px;
  font-size: 1rem;
  font-weight: 600;
  background: #2d6a4f;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-submit:hover:not(:disabled) { background: #1f4d38; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
