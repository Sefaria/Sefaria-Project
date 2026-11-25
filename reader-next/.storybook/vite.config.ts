// Storybook's own Vite config: no TanStack Start (it expects a full app/router entry).
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
});
