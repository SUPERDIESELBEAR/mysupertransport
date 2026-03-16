import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
