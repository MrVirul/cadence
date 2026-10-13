import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static site: every route is prerendered to HTML at build time and the
// output under `dist/` deploys as plain files to a CDN. `crawlLinks` follows
// internal links from the rendered pages, so new routes linked from an
// existing page are picked up without touching this config.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  // No source maps in production — don't expose internals to the public.
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split vendor code so the landing page JS stays small and cacheable.
        manualChunks: (id) => {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "react-vendor";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "tanstack-vendor";
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
      pages: [{ path: "/" }, { path: "/404" }],
    }),
    viteReact(),
  ],
});
