import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { pageKindCssPlugin } from "./vite-plugins/page-kind-css";

export default defineConfig({
  // PORT (set by the preview tool) wins; otherwise a fixed port so e2e tests and bookmarks stay stable.
  server: { port: Number(process.env.PORT) || 3100, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(), // must come before react()
    viteReact(),
    pageKindCssPlugin(), // each page kind's CSS in the server-rendered head (vite-plugins/page-kind-css.ts)
  ],
});
