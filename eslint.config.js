import importPlugin from "eslint-plugin-import"
import stylistic from "@stylistic/eslint-plugin"
import react from "eslint-plugin-react"
import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { globalIgnores } from "eslint/config"

export default tseslint.config([
  globalIgnores(["**/dist", "release", "node_modules"]),
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      react,
      "@stylistic": stylistic,
      import: importPlugin,
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      quotes: ["error", "double"],
      "keyword-spacing": ["error", { "before": true, "after": true }],
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"], // Built-in modules and external packages
            ["internal"], // Internal modules (e.g., aliased paths)
            ["parent", "sibling", "index"], // Relative imports
            ["type"], // Type imports (if using TypeScript)
            ["object"], // Side-effect imports (e.g., CSS imports without assigned variables)
          ],
          pathGroups: [
            {
              pattern: "**/*.css",
              group: "object", // Assign CSS imports to the 'object' group
              position: "after", // Ensure they appear after other imports in this group
            },
            {
              pattern: "**/*.scss", // Include SCSS if applicable
              group: "object",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin", "external"], // Exclude these from path group matching
        },
      ],
      // Enforce a single newline at the end of non-empty files
      "eol-last": "error",

      // Prevent multiple consecutive empty lines, allowing only one
      "no-multiple-empty-lines": ["error", { max: 1 }],
      semi: ["error", "never"],
      "no-unexpected-multiline": "error",
      "arrow-parens": ["error", "always"],
      "comma-dangle": [
        "error",
        {
          arrays: "always-multiline",
          objects: "always-multiline",
          imports: "never",
          exports: "never",
          functions: "always-multiline", // This is the key for function arguments
        },
      ],
      "max-len": [
        "error",
        {
          code: 145,
          ignoreComments: false,
          ignoreUrls: false,
          ignoreStrings: false,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      "object-curly-spacing": ["error", "always"],
      "@stylistic/indent": ["error", 2],
      "@stylistic/space-infix-ops": "error",
      "react/jsx-sort-props": [
        "error",
        {
          noSortAlphabetically: false,
        },
      ],
    },
  },
])
