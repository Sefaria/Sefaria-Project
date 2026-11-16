import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

// Sefaria-specific globals injected via Django templates or loaded as page-level scripts
const sefariaGlobals = {
  Sefaria: "readonly",
  DJANGO_VARS: "readonly",
  GLOBALS: "readonly",
  STRAPI_INSTANCE: "readonly",
  LANGUAGES_DICT: "readonly",
  CKEDITOR: "readonly",
  gtag: "readonly",
  sa_event: "readonly",
  // jQuery — loaded globally; some files import via sefariaJquery, others rely on the global
  $: "readonly",
  jQuery: "readonly",
  // Legacy s1/ namespace
  sjs: "readonly",
  // Utility functions exposed globally in some Django templates
  parseRef: "readonly",
  normRef: "readonly",
  makeRef: "readonly",
  getUrlVars: "readonly",
  isHebrew: "readonly",
  launchOffset: "readonly",
  zoomScale: "readonly",
  // Other template-injected globals
  DEBUG: "readonly",
  USE_VARNISH: "readonly",
  ga: "readonly",
  mixpanel: "readonly",
  FB: "readonly",
  Intercom: "readonly",
  zE: "readonly",
  zESettings: "readonly",
  // Sentry DSN injected via base.html template
  sentryDSN: "readonly",
  // Page-specific JSON props injected via Django templates
  JSON_PROPS: "readonly",
  // Server-side data injected via Django templates
  DJANGO_DATA_VARS: "readonly",
  // Virtual keyboard external library (loaded separately via script tag)
  VKI_attach: "readonly",
  // Google Maps API (loaded via script tag)
  google: "readonly",
  // Hotjar analytics
  hj: "readonly",
};

export default [
  {
    ignores: [
      "node_modules/**",
      "static/bundles/**",
      "static/js/lib/**",
      "static/js/s1/**",
      "static/ckeditor/**",
      "**/*.min.js",
      "node/webpack-stats*.json",
    ],
  },
  js.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactHooksPlugin.configs.flat.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...sefariaGlobals,
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
    rules: {
      // PropTypes enforcement is not feasible across this legacy codebase; defer to TypeScript migration
      "react/prop-types": "off",
      // React 16 bundles share scope via webpack; explicit import not enforced here
      "react/react-in-jsx-scope": "off",

      // ── Deferred to follow-up work ────────────────────────────────────────────

      // 475 violations: variable prefixing with _ requires a separate dedicated pass
      "no-unused-vars": "off",

      // 98 violations: var redeclarations common in legacy files; refactor separately
      "no-redeclare": "off",

      // 73 violations: exhaustive-deps produces false positives in legacy useEffect patterns
      "react-hooks/exhaustive-deps": "off",

      // 89/38/38 violations: experimental react-hooks v7 rules (refs, immutability, set-state-in-effect)
      // These did not exist in earlier react-hooks versions and require design-level changes
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",

      // 2/1 violations: additional react-hooks v7 purity rules — require design-level changes
      // globals: fires on test harness assignments outside component; purity: fires on render-time side effects
      "react-hooks/globals": "off",
      "react-hooks/purity": "off",

      // 36 violations: findDOMNode is deprecated but migration to refs is a non-trivial refactor
      "react/no-find-dom-node": "off",

      // 22 violations: direct state mutation requires migrating setState patterns
      "react/no-direct-mutation-state": "off",

      // 12 violations: deprecated lifecycle methods (componentWillMount etc.) still work in React 16
      "react/no-deprecated": "off",

      // 8 violations: anonymous components and HOCs don't always have inferrable display names
      "react/display-name": "off",
    },
  },
  {
    // Jest test files — need access to the `global` object and `require` for JSDOM setup and JSON imports
    files: ["**/*.test.{js,jsx}", "**/__mocks__/**/*.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
        global: "writable",
        require: "readonly",
      },
    },
  },
  {
    // Legacy sheets scripts that depend on s1 globals injected via Django templates
    files: ["static/js/sheets.js", "static/js/sheets-visual.js"],
    languageOptions: {
      globals: {
        humanRef: "writable",
        encodeHebrewNumeral: "readonly",
        stripNikkud: "readonly",
        findAndReplaceDOMText: "readonly",
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
  {
    // CommonJS files that use require/module.exports
    files: ["static/js/sefaria-d3/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Files that use require() for conditional browser/server loading (webpack handles these)
    files: ["static/js/sefaria/sefariaJquery.js"],
    languageOptions: {
      globals: {
        require: "readonly",
      },
    },
  },
  prettierConfig,
];
