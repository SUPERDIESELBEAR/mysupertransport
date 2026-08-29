import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Guarantees node_modules/canvas points at tools/canvas-stub before any
    // jsdom environment is created — see tools/canvas-stub/globalSetup.mjs.
    // Does NOT depend on the postinstall hook, which some installers skip.
    globalSetup: ["./tools/canvas-stub/globalSetup.mjs"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
