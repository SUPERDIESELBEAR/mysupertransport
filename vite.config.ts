import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Build-time constants — baked into the bundle on every build
const buildTime = new Date().toISOString();
const buildVersion = Buffer.from(buildTime).toString("hex").slice(-6);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force a single copy of @tiptap/core to avoid duplicate-instance TS errors
      // caused by nested node_modules inside individual extension packages.
      "@tiptap/core": path.resolve(__dirname, "node_modules/@tiptap/core"),
      "@tiptap/pm": path.resolve(__dirname, "node_modules/@tiptap/pm"),
    },
    dedupe: ["@tiptap/core", "@tiptap/pm", "@tiptap/react"],
  },
}));
