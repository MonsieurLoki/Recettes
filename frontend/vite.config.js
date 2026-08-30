import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // injectManifest : vite-plugin-pwa injecte self.__WB_MANIFEST dans notre
      // service worker personnalisé (src/sw.js) au lieu de générer un SW
      // entièrement automatique. Cela permet d'ajouter le handler setCatchHandler
      // pour le fallback offline.json (Req. 9.4).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',

      registerType: 'autoUpdate',

      // Inclure offline.json et les icônes PNG dans le précache (Req. 9.3, 9.4)
      includeAssets: ['offline.json', 'icons/*.png'],

      // Manifeste Web App (Req. 9.2)
      manifest: {
        name: 'Recettes',
        short_name: 'Recettes',
        description: 'Application personnelle de gestion de recettes de cuisine',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2d6a4f',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable any',
          },
        ],
      },

      // Configuration injectManifest : liste des assets à précacher
      injectManifest: {
        // Précache tous les assets Vite (JS, CSS, HTML, images, fonts)
        // avec leur hash de contenu → stratégie CacheFirst implicite
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
    }),
  ],

  resolve: {
    alias: {
      // Alias @ → src/ pour des imports propres dans tous les composants
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    proxy: {
      // Proxy dev : redirige /api/* vers le backend Express sur le port 3000
      // Évite les problèmes CORS en développement en faisant passer toutes
      // les requêtes API par le serveur Vite comme si elles étaient locales.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
