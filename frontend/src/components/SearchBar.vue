<!--
  SearchBar.vue — Barre de recherche à deux champs
  
  Fournit deux champs de saisie (nom et ingrédient) avec debounce de 300 ms.
  Émet l'événement `search` avec { name, ingredient } à chaque changement.
  
  Exigences couvertes :
    Req. 7.1 : deux champs (nom / ingrédient), limités à 100 caractères
    Req. 7.8 : validation JS — caractères de contrôle rejetés avant émission
    Req. 9.5 : surface tactile ≥ 44×44 px sur chaque champ
  
  Événements émis :
    search : { name: string, ingredient: string }
-->
<template>
  <div class="search-bar" role="search" aria-label="Rechercher des recettes">
    <!-- Champ de recherche par nom -->
    <div class="search-field">
      <label for="search-name" class="search-label">Recherche par nom</label>
      <input
        id="search-name"
        v-model="localName"
        type="search"
        placeholder="Tarte aux pommes…"
        maxlength="100"
        autocomplete="off"
        class="search-input"
        aria-label="Rechercher par nom de recette"
        @input="onInput"
      />
    </div>

    <!-- Champ de recherche par ingrédient -->
    <div class="search-field">
      <label for="search-ingredient" class="search-label">Recherche par ingrédient</label>
      <input
        id="search-ingredient"
        v-model="localIngredient"
        type="search"
        placeholder="Farine, sucre…"
        maxlength="100"
        autocomplete="off"
        class="search-input"
        aria-label="Rechercher par ingrédient"
        @input="onInput"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * SearchBar — Composant de recherche avec debounce 300 ms.
 *
 * Émet { name, ingredient } après un délai de 300 ms d'inactivité pour éviter
 * de déclencher une requête API à chaque frappe (Req. 7.1).
 * Les termes contenant des caractères de contrôle (U+0000–U+001F) sont
 * silencieusement filtrés avant l'émission (Req. 7.8).
 */
import { ref, onBeforeUnmount } from 'vue'

const emit = defineEmits(['search'])

const localName = ref('')
const localIngredient = ref('')

/** Timer de debounce — annulé à chaque nouvelle saisie */
let debounceTimer = null

/**
 * REGEXP_CONTROL_CHARS — Détecte les caractères de contrôle Unicode (U+0000–U+001F).
 * Ces caractères ne sont pas autorisés dans les termes de recherche (Req. 7.8).
 */
const REGEXP_CONTROL_CHARS = /[\u0000-\u001F]/

/**
 * containsControlChars — Retourne true si la chaîne contient des caractères
 * de contrôle non autorisés.
 *
 * @param {string} str - Chaîne à tester
 * @returns {boolean}
 */
function containsControlChars(str) {
  return REGEXP_CONTROL_CHARS.test(str)
}

/**
 * onInput — Déclenché à chaque modification d'un champ de recherche.
 * Remet le timer de debounce à zéro puis émet `search` après 300 ms.
 */
function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    // Tronquer à 100 car. (double sécurité JS en plus de maxlength HTML — Req. 7.1)
    const name = localName.value.slice(0, 100)
    const ingredient = localIngredient.value.slice(0, 100)

    // Rejeter silencieusement si un caractère de contrôle est présent (Req. 7.8)
    // La validation complète est également effectuée côté backend.
    if (containsControlChars(name) || containsControlChars(ingredient)) return

    emit('search', { name, ingredient })
  }, 300)
}

// Nettoyage du timer lors de la destruction du composant
onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})
</script>

<style scoped>
.search-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.search-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 200px;
}

.search-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

/* Surface tactile ≥ 44×44 px (Req. 9.5) */
.search-input {
  min-height: 44px;
  padding: 8px 12px;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  width: 100%;
  box-sizing: border-box;
  background-color: #ffffff;
  color: #111827;
  /* Supprimer le style natif du champ type="search" sur Safari/Chrome */
  -webkit-appearance: none;
  appearance: none;
}

.search-input::placeholder {
  color: #9ca3af;
}

.search-input:focus {
  outline: 2px solid #2d6a4f;
  outline-offset: 2px;
  border-color: transparent;
}
</style>
