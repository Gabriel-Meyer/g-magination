import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// The 3D scene is loaded via React.lazy(), so three.js / R3F / drei are
// already code-split into their own chunk — the hero paints without them.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
