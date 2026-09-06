import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
	base: process.env.VITE_BASE_PATH ?? "/chat/",
	server: { host: process.env.HOST ?? "127.0.0.1", port: 5174 },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
