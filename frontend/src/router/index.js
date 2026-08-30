/**
 * router/index.js — Configuration de Vue Router 4
 *
 * Routes définies :
 *   /               → HomeView         : liste et recherche de recettes (Req. 8.1, 9.1)
 *   /recipes/:id    → RecipeDetailView : consultation d'une recette (Req. 8.1)
 *   /recipes/new/edit → RecipeEditView : création d'une nouvelle recette
 *   /recipes/:id/edit → RecipeEditView : modification d'une recette existante (Req. 5.4)
 *   /capture          → PhotoCaptureView : capture d'une recette par photo (Req. 1.1)
 *
 * Mode history (createWebHistory) :
 *   Utilise l'API History du navigateur pour des URLs sans hash (#).
 *   Avantage : URLs propres (/recipes/42 au lieu de /#/recipes/42).
 *   Contrainte : le serveur web doit renvoyer index.html pour toutes les routes
 *   (géré en dev par Vite, en prod par la config du serveur).
 */
import { createRouter, createWebHistory } from 'vue-router'

// Import paresseux (lazy loading) des vues pour le code splitting.
// Chaque vue est chargée uniquement quand l'utilisateur navigue vers elle,
// ce qui réduit le bundle initial et accélère le premier affichage.
const HomeView = () => import('@/views/HomeView.vue')
const RecipeDetailView = () => import('@/views/RecipeDetailView.vue')
const RecipeEditView = () => import('@/views/RecipeEditView.vue')
const PhotoCaptureView = () => import('@/views/PhotoCaptureView.vue')

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: 'Mes recettes' },
  },
  {
    path: '/recipes/:id',
    name: 'recipe-detail',
    component: RecipeDetailView,
    props: true, // Passe :id comme prop au composant
    meta: { title: 'Recette' },
  },
  {
    // Route pour la création : id = 'new'
    path: '/recipes/new/edit',
    name: 'recipe-create',
    component: RecipeEditView,
    meta: { title: 'Nouvelle recette' },
  },
  {
    path: '/recipes/:id/edit',
    name: 'recipe-edit',
    component: RecipeEditView,
    props: true,
    meta: { title: 'Modifier la recette' },
  },
  {
    path: '/capture',
    name: 'photo-capture',
    component: PhotoCaptureView,
    meta: { title: 'Capturer une recette' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Mise à jour du titre de la page lors des navigations
router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} — Recettes`
    : 'Recettes'
})

export default router
