import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suite only exercises server/domain modules. A browser environment
    // and global React/Next mocks added startup cost while hiding accidental
    // client-only dependencies in those modules.
    environment: "node",
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "mcp-server/node_modules", ".next", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", ".next", "dist", "**/*.d.ts", "**/*.config.{ts,js}", "**/types/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
});
