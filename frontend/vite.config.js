import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // /api ile baslayan istekler backend'e gider (CORS derdi olmaz)
    proxy: {
      "/api": "http://localhost:5001",
    },
  },
});
