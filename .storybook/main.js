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
          name: "mock-sefaria-module",
          enforce: "pre",
          resolveId(source) {
            if (/\/sefaria(\.js)?$/.test(source)) {
              return path.resolve(configDirname, "./mocks/sefaria.js");
            }
            return null;
          },
        },
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
            find: /static\/js\/sefaria\/sefaria(?:\.js)?$/,
            replacement: path.resolve(configDirname, "./mocks/sefaria.js"),
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
