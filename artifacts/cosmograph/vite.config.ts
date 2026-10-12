import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
const port = Number(process.env.PORT ?? 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error("PORT must be a positive number when provided.");
}

const basePath = process.env.APP_BASE_PATH ?? process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // three.js + R3F is ~60% of the bundle and changes far less often than app
    // code; splitting it lets returning visitors keep it cached across deploys.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/](three|three-stdlib|@react-three|postprocessing|maath|troika-[^\\/]+)[\\/]/.test(id)) return "three";
          if (/[\\/](@clerk)[\\/]/.test(id)) return "auth";
          if (/[\\/](react|react-dom|scheduler|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
