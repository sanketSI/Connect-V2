import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // .env.local lives at the REPO root (one env file for the whole monorepo),
  // not next to this config — point Vite there.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  },
})
