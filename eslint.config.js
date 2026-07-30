import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Roadside Presentation Mode renders from IndexedDB with no session. These
    // files sit on the /roadside boot path and must never reach the backend
    // client. The import-graph test catches deeper reaches; this catches the
    // obvious ones at the point of writing.
    files: [
      "src/roadside/**/*.{ts,tsx}",
      "src/components/eld/Roadside*.{ts,tsx}",
      "src/lib/eld/offline/db.ts",
      "src/lib/eld/offline/renderability.ts",
      "src/lib/eld/offline/roadsideManifest.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/integrations/supabase/*", "@supabase/*"], message: "The /roadside boot path must render from IndexedDB with no backend client." },
          { group: ["@/hooks/useAuth"], message: "/roadside is session-independent — do not read auth state here." },
        ],
      }],
    },
  },
);
