<template>
  <main class="capture-view">
    <nav class="capture-nav">
      <router-link to="/" class="back-link">← Retour</router-link>
    </nav>

    <h1 class="capture-title">Capturer une recette</h1>

    <!-- Étape 1 : Sélection de la photo -->
    <section v-if="!ocrResult" class="capture-section">
      <p class="capture-hint">
        Prenez une photo de votre recette. L'application extraira automatiquement
        le texte et proposera un nom.
      </p>

      <label class="photo-label" for="photo-input">
        <span class="photo-btn">📷 Choisir ou photographier</span>
        <input
          id="photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          class="photo-input-hidden"
          aria-label="Sélectionner ou photographier une recette"
          @change="onFileChange"
        />
      </label>

      <!-- Prévisualisation -->
      <div v-if="previewUrl" class="preview-wrapper">
        <img
          :src="previewUrl"
          alt="Aperçu de la photo sélectionnée"
          class="preview-img"
        />
        <button class="btn btn-secondary" @click="clearPhoto">
          Changer de photo
        </button>
      </div>

      <!-- Erreur de validation -->
      <p v-if="uploadError" class="error-msg" role="alert">{{ uploadError }}</p>

      <!-- Bouton Envoyer -->
      <div class="capture-actions">
        <button
          class="btn btn-primary"
          :disabled="!selectedFile || uploading"
          @click="uploadPhoto"
        >
          {{ uploading ? 'Analyse en cours…' : 'Envoyer et extraire le texte' }}
        </button>
      </div>

      <!-- Spinner -->
      <div v-if="uploading" class="spinner-wrapper" aria-live="polite">
        <LoadingSpinner :size="40" label="Analyse de la photo en cours…" />
      </div>
    </section>

    <!-- Étape 2 : Résultats OCR -->
    <section v-else class="ocr-section">
      <h2 class="ocr-title">Résultat de l'analyse</h2>

      <!-- Nom candidat -->
      <div class="form-field">
        <label for="ocr-name" class="field-label">Nom de la recette (modifiable)</label>
        <input
          id="ocr-name"
          v-model="ocrResult.suggested_name"
          type="text"
          maxlength="200"
          class="field-input"
          placeholder="Nom de la recette…"
          aria-label="Nom suggéré pour la recette"
        />
      </div>

      <!-- Texte OCR brut -->
      <div class="form-field">
        <label for="ocr-text" class="field-label">Texte extrait (modifiable)</label>
        <textarea
          id="ocr-text"
          v-model="ocrResult.ocr_text"
          rows="12"
          class="field-textarea"
          placeholder="Le texte extrait de la photo apparaîtra ici…"
          aria-label="Texte extrait de la photo par l'OCR"
        />
      </div>

      <!-- Actions -->
      <div class="ocr-actions">
        <button class="btn btn-secondary" @click="resetCapture">
          ← Reprendre une photo
        </button>
        <button class="btn btn-primary" @click="goToEdit">
          Créer la recette →
        </button>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import { apiFetch } from '@/services/api.js'
import { useRecipesStore } from '@/stores/recipes.js'

const router = useRouter()
const recipesStore = useRecipesStore()

const selectedFile = ref(null)
const previewUrl = ref('')
const uploading = ref(false)
const uploadError = ref('')
const ocrResult = ref(null)

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  selectedFile.value = file
  uploadError.value = ''

  // Générer l'URL de prévisualisation
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
}

function clearPhoto() {
  selectedFile.value = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  uploadError.value = ''
}

function resetCapture() {
  clearPhoto()
  ocrResult.value = null
}

async function uploadPhoto() {
  if (!selectedFile.value) return

  uploading.value = true
  uploadError.value = ''

  const formData = new FormData()
  formData.append('photo', selectedFile.value)

  try {
    const result = await apiFetch('/api/photos', {
      method: 'POST',
      body: formData,
      // Ne pas définir Content-Type — le navigateur le fera avec le boundary
    })
    ocrResult.value = result
  } catch (err) {
    if (err.status === 400) {
      uploadError.value = err.message ?? 'La photo est invalide (format, taille ou résolution non supportés).'
    } else if (err.status === 502) {
      uploadError.value = "Le service d'extraction de texte est temporairement indisponible. Réessayez dans quelques instants."
    } else {
      uploadError.value = "Une erreur est survenue lors de l'envoi. Réessayez."
    }
  } finally {
    uploading.value = false
  }
}

function goToEdit() {
  // Si Gemini a structuré la recette, stocker les données dans le store Pinia
  // pour pré-remplir le formulaire d'édition. On utilise le store plutôt que
  // history.state car Vue Router 4 fusionne son propre état avec history.state,
  // ce qui le rend non fiable en contexte PWA (notamment sur Safari).
  if (ocrResult.value.structured) {
    recipesStore.setPendingPrefill({
      name: ocrResult.value.suggested_name,
      instructions: ocrResult.value.structured.instructions || '',
      ingredients: ocrResult.value.structured.ingredients || [],
      ocr_text: ocrResult.value.ocr_text,
    })
  }
  router.push(`/recipes/${ocrResult.value.recipe_id}/edit`)
}
</script>

<style scoped>
.capture-view {
  max-width: 680px;
  margin: 0 auto;
  padding: 24px 16px;
}

.capture-nav { margin-bottom: 12px; }

.back-link {
  display: inline-block;
  color: #2d6a4f;
  text-decoration: none;
  font-size: 0.875rem;
  min-height: 44px;
  line-height: 44px;
}
.back-link:hover { text-decoration: underline; }

.capture-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 24px;
}

.capture-hint {
  color: #6b7280;
  font-size: 0.9375rem;
  line-height: 1.6;
  margin: 0 0 20px;
}

/* ── Sélecteur de photo ── */
.photo-label { display: inline-block; cursor: pointer; }

.photo-btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 20px;
  font-size: 1rem;
  font-weight: 500;
  background: #f0fdf4;
  color: #2d6a4f;
  border: 2px dashed #2d6a4f;
  border-radius: 8px;
  cursor: pointer;
}
.photo-btn:hover { background: #dcfce7; }

.photo-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}

/* ── Prévisualisation ── */
.preview-wrapper {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.preview-img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  object-fit: contain;
}

/* ── Actions ── */
.capture-actions { margin-top: 20px; }
.ocr-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }

/* ── Boutons ── */
.btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 18px;
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: 6px;
  text-decoration: none;
  border: none;
  cursor: pointer;
}
.btn-primary  { background: #2d6a4f; color: #fff; }
.btn-secondary { background: #ffffff; color: #374151; border: 1px solid #d1d5db; }
.btn-primary:hover  { background: #1f4d38; }
.btn-secondary:hover { background: #f9fafb; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Spinner ── */
.spinner-wrapper {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

/* ── Erreur ── */
.error-msg {
  margin-top: 12px;
  color: #dc2626;
  font-size: 0.9375rem;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 10px 14px;
}

/* ── OCR section ── */
.ocr-section { display: flex; flex-direction: column; gap: 20px; }
.ocr-title { font-size: 1.25rem; font-weight: 600; margin: 0; }

.form-field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 0.875rem; font-weight: 600; color: #374151; }

.field-input {
  min-height: 44px;
  padding: 8px 12px;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  background: #ffffff;
  color: #111827;
}
.field-input:focus { outline: 2px solid #2d6a4f; outline-offset: 2px; border-color: transparent; }

.field-textarea {
  padding: 10px 12px;
  font-size: 1rem;
  font-family: inherit;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  resize: vertical;
  box-sizing: border-box;
  background: #ffffff;
  color: #111827;
  line-height: 1.6;
  min-height: 200px;
}
.field-textarea:focus { outline: 2px solid #2d6a4f; outline-offset: 2px; border-color: transparent; }
</style>
