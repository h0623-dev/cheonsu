import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { webBuildInfo } from './scripts/update-build-info.mjs'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), { name: 'cheonsu-update-build-info', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'ota-build.json', source: JSON.stringify(webBuildInfo(fileURLToPath(new URL('.', import.meta.url)))) });
  } }],
  resolve: { dedupe: ['react', 'react-dom'] },
  // Ignore extracted project copies and Android's generated HTML when scanning dependencies.
  optimizeDeps: { entries: ['index.html', 'tests/fixtures/*.html'] },
  server: { watch: { ignored: ['**/tmp/**', '**/android/**'] } },
})
