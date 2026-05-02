/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// GitHub Pages serves at https://<user>.github.io/<repo>/, so we need the
// repo name as the base path for production. Local dev uses '/'.
const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  base: isProd ? "/fi-racing/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules"],
  },
});
