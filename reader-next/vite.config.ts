import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  // PORT (set by the preview tool) wins; otherwise a fixed port so e2e tests and bookmarks stay stable.
  server: { port: Number(process.env.PORT) || 3100, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(), // must come before react()
    viteReact(),
  ],
});
