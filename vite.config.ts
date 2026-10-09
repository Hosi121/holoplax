import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "client-boundary",
      load(id) {
        if (
          /\/server\/|\/modules\/[^/]+\/infrastructure\/|\/index\.server\.[jt]s$|\/database\/(?:client|schema)\.[jt]s$/.test(
            id,
          )
        ) {
          throw new Error(`Server-only module reached the browser build: ${id}`);
        }
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
        defaultHandler(warning);
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    hmr: { clientPort: 5173 },
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  esbuild: { jsx: "automatic" },
});
