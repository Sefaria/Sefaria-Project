import { mergeConfig } from "vite";
import path, { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const configDirname = path.dirname(fileURLToPath(import.meta.url));

const getAbsolutePath = (value) => {
  try {
    return dirname(require.resolve(join(value, "package.json")));
  } catch (error) {
    console.warn(
      `[storybook] Could not resolve package "${value}", falling back to direct import.`,
    );
    return value;
  }
};

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],

  addons: [
    getAbsolutePath("@storybook/addon-essentials"),
    getAbsolutePath("@storybook/addon-docs"),
    getAbsolutePath("@storybook/addon-interactions"),
  ],

  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
    options: {},
  },

  typescript: {
    reactDocgen: false,
  },

  async viteFinal(baseConfig) {
    return mergeConfig(baseConfig, {
      plugins: [
        {
          name: "mock-sefaria-jquery",
          enforce: "pre",
          resolveId(source) {
            if (source.includes("sefaria/sefariaJquery")) {
              return source;
            }
            return null;
          },
          load(id) {
            if (id.includes("sefaria/sefariaJquery")) {
              return `
                const jQueryModule = await import("jquery");
                const jQuery = jQueryModule.default ?? jQueryModule;

                if (typeof window !== "undefined") {
                  window.$ = jQuery;
                  window.jQuery = jQuery;
                  await import("jquery.cookie");
                  await import("jquery-ui");
                  await import("jquery.scrollto");
                }

                export default jQuery;
              `;
            }
            return null;
          },
        },
        {
          // sefaria.js loads two helpers with CommonJS require(), which webpack
          // accepts but Vite does not in the browser. Rewrite just those lines as imports,
          // plus one line that only works after Babel's let -> var conversion.
          name: "sefaria-js-require-to-import",
          enforce: "pre",
          transform(code, id) {
            if (!id.endsWith("/static/js/sefaria/sefaria.js")) {
              return null;
            }
            const original =
              "var extend     = require('extend'),\n    param      = require('querystring').stringify;";
            if (!code.includes(original)) {
              this.error("sefaria.js require() lines changed; update .storybook/main.js");
            }
            // `let Sefaria = Sefaria || {...}` reads Sefaria before it exists, which native
            // `let` forbids. Babel turns it into `var` for the real site, where Sefaria is
            // always undefined at that point, so the line always takes the `{...}` branch.
            const selfReference = "let Sefaria = Sefaria || {";
            if (!code.includes(selfReference)) {
              this.error("sefaria.js `let Sefaria = Sefaria ||` line changed; update .storybook/main.js");
            }
            return code
              .replace(
                original,
                "import extend from 'extend';\nimport querystring from 'querystring';\nvar param = querystring.stringify;",
              )
              .replace(selfReference, "let Sefaria = {");
          },
        },
        {
          name: "context-jsx-loader",
          enforce: "pre",
          async transform(code, id) {
            if (id.endsWith("/static/js/context.js")) {
              const esbuild = await import("esbuild");
              const result = await esbuild.transform(code, {
                loader: "jsx",
                sourcemap: true,
              });
              return {
                code: result.code,
                map: result.map,
              };
            }
            return null;
          },
        },
      ],
      resolve: {
        alias: [
          {
            find: "@static",
            replacement: path.resolve(configDirname, "../static"),
          },
          {
            find: "jquery",
            replacement: "jquery/dist/jquery.js",
          },
        ],
        extensions: [
          ".mjs",
          ".js",
          ".jsx",
          ".json",
          ".ts",
          ".tsx",
          ".cjs",
        ],
      },
      optimizeDeps: {
        esbuildOptions: {
          loader: {
            ".js": "jsx",
          },
        },
      },
      esbuild: {
        loader: "jsx",
        include: [
          /\.storybook\/.*\.[jt]sx?$/,
          /stories\/.*\.[jt]sx?$/,
          /static\/js\/.*\.[jt]sx?$/,
        ],
      },
    });
  }
};

export default config;
