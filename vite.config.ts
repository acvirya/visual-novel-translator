import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // 4. Optimize code splitting and vendor chunking
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          // Keep React and its scheduler together. Broad substring checks also
          // matched lucide-react and caused circular vendor chunks.
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) return "vendor-react";
          if (normalized.includes("/node_modules/lucide-react/")) return "vendor-icons";
          if (normalized.includes("/node_modules/@tauri-apps/")) return "vendor-tauri";
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));
