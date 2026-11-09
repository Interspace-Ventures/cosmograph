// ESLint flat config (ESLint 10, typescript-eslint 8, react-hooks 7).
// Why ESLint and not Biome: see the libraries-first note in docs/testing/lint.md.
//
// The rule set is the stock recommended presets. Rules that the existing code
// breaks in many places are listed in BASELINE below as warnings, so `pnpm
// run lint` passes today without rewriting working code, and new errors still
// fail the Render build gate. Shrink BASELINE over time; never add to it to
// silence a new violation.
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Baseline at adoption (2026-11-08, 71 findings, 0 behavior changes). Each
// count is what the code had then.
const REACT_FILES = ["artifacts/cosmograph/**/*.{ts,tsx}", "artifacts/trailer/**/*.{ts,tsx}"];

const HOOKS_BASELINE = {
  // React Compiler advisories from react-hooks 7. The R3F scene code mutates
  // refs and three.js objects on purpose; rewriting it is product work.
  "react-hooks/immutability": "warn", // 15
  "react-hooks/set-state-in-effect": "warn", // 9
  "react-hooks/preserve-manual-memoization": "warn", // 9
  "react-hooks/refs": "warn", // 7
  "react-hooks/purity": "warn", // 5
  // react-hooks/exhaustive-deps is already "warn" in the preset (4).
};

const BASELINE = {
  // Defensive `let x = fallback; try { x = ... }` in scripts and Convex libs.
  "no-useless-assignment": "warn", // 12
  "@typescript-eslint/no-explicit-any": "warn", // 5
  "@typescript-eslint/no-unused-expressions": "warn", // 3
  "@typescript-eslint/no-unused-vars": "warn", // 2
};

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vite/**",
      "**/coverage/**",
      "convex/_generated/**",
      "lib/api-zod/src/generated/**",
      "lib/api-client-react/src/generated/**",
      "artifacts/cosmograph/public/**",
      ".agents/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
  },
  { rules: BASELINE },
  {
    files: REACT_FILES,
    extends: [reactHooks.configs.flat.recommended],
  },
  { files: REACT_FILES, rules: HOOKS_BASELINE },
);
