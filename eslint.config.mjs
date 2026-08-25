import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/**",
      "static/bundles/**",
      "static/js/lib/**",
      "**/*.min.js",
      "node/webpack-stats*.json",
    ],
  },
  js.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactHooksPlugin.configs.flat["recommended-latest"],
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["node/**/*.js", "**/*.config.js", "**/*.config.mjs", "**/*.config.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettierConfig,
];
