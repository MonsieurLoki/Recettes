<template>
  <div id="app">
    <!-- Persistent top navigation bar -->
    <header class="app-nav">
      <router-link to="/" class="app-nav-brand">
        <span class="app-nav-icon" aria-hidden="true">🍽️</span>
        <span class="app-nav-title">Mes Recettes</span>
      </router-link>
    </header>

    <!-- Route content -->
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
// Vue 3 application shell — router is registered in main.js
</script>

<style>
/* Non-scoped styles to affect the global layout */
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--color-primary);
  box-shadow: 0 2px 8px var(--color-shadow);
  padding: 0 16px;
  height: 56px;
  display: flex;
  align-items: center;
}

.app-nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #ffffff;
}

.app-nav-brand:hover {
  color: #ffffff;
  opacity: 0.9;
}

.app-nav-icon {
  font-size: 1.5rem;
  line-height: 1;
}

.app-nav-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.01em;
}

.app-content {
  flex: 1;
  padding-bottom: 32px;
}
</style>
