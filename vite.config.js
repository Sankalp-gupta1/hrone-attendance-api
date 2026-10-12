import { defineConfig } from "vite";

export default defineConfig({
  base: "/ui/",
  build: { outDir: "app/static", emptyOutDir: true, assetsInlineLimit: 65536 },
  server: {
    proxy: Object.fromEntries(
      [
        "/health",
        "/employees",
        "/attendance",
        "/analytics",
        "/admin",
        "/docs",
        "/openapi.json",
      ].map((path) => [path, "http://127.0.0.1:8000"]),
    ),
  },
});
