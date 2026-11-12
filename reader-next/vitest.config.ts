import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";

const shared = [viteReact()];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        plugins: shared,
        test: {
          name: "unit",
          globals: true,
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          ...shared,
          storybookTest({ configDir: path.join(import.meta.dirname, ".storybook") }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
