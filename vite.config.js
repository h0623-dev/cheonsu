import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // Ignore extracted project copies and Android's generated HTML when scanning dependencies.
  optimizeDeps: { entries: ['index.html', 'tests/fixtures/*.html'] },
  server: { watch: { ignored: ['**/tmp/**', '**/android/**'] } },
})
