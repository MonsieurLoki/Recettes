<!--
  LoadingSpinner.vue — Indicateur de chargement accessible
  
  Affiche un spinner animé SVG avec les attributs ARIA requis pour les
  lecteurs d'écran (Req. 9.7). Le spinner est dimensionnable via la prop
  `size` (minimum 24 px pour respecter le contraste et la visibilité).
  
  Props :
    size  (Number) : dimension en pixels du spinner (défaut : 24)
    label (String) : texte lu par les lecteurs d'écran (défaut : 'Chargement en cours…')
-->
<template>
  <div
    role="status"
    aria-live="polite"
    :aria-label="label"
    class="spinner-wrapper"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <svg
      class="spinner"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Piste de fond (opacité réduite pour le contraste) -->
      <circle
        class="spinner-track"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="3"
        opacity="0.25"
      />
      <!-- Arc animé en rotation -->
      <path
        class="spinner-arc"
        d="M12 2 a10 10 0 0 1 10 10"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <!-- Texte uniquement visible pour les lecteurs d'écran (Req. 9.7) -->
    <span class="visually-hidden">{{ label }}</span>
  </div>
</template>

<script setup>
/**
 * LoadingSpinner — composant d'indicateur de chargement.
 *
 * Ce composant doit être affiché pour toute opération durant plus de 500 ms
 * (Req. 9.7) et retiré dès que l'opération est terminée.
 */
defineProps({
  /** Dimension en pixels du spinner (min. recommandé : 24 pour Req. 9.7) */
  size: {
    type: Number,
    default: 24,
    validator: (v) => v >= 24,
  },
  /** Texte lu par les lecteurs d'écran pour décrire l'opération en cours */
  label: {
    type: String,
    default: 'Chargement en cours…',
  },
})
</script>

<style scoped>
.spinner-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Couleur verte principale du thème — contraste élevé sur fond blanc */
  color: #2d6a4f;
}

.spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Masque visuellement le texte tout en le laissant accessible aux lecteurs d'écran */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
