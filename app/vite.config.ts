import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// SPA: no server rendering of routes. The build prerenders the document shell
// once to `dist/client/_shell.html`; the host serves that file for every path
// (see `public/_redirects`) and the router takes over on the client.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  // No source maps in production — don't expose internals to the public.
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
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
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/d3-")
          ) {
            return "charts-vendor";
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
});
