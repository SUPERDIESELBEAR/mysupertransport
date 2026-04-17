import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Build-time constants — baked into the bundle on every build
const buildTime = new Date().toISOString();
const buildVersion = Buffer.from(buildTime).toString("hex").slice(-6);

// Writes a tiny version manifest used by the in-app "new version available" toast.
// Served at /version.json (no cache) so running clients can detect new builds.
function versionManifestPlugin(): Plugin {
  const payload = JSON.stringify({ version: buildVersion, buildTime }, null, 2);
  return {
    name: "superdrive-version-manifest",
    apply: () => true,
    buildStart() {
      try {
        const publicDir = path.resolve(__dirname, "public");
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        fs.writeFileSync(path.join(publicDir, "version.json"), payload, "utf8");
      } catch {
        // Non-fatal: the toast simply won't fire if the file is missing
      }
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: payload,
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    versionManifestPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
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
