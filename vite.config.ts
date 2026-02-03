import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Inject correct base href into index.html for GitHub Pages (so assets and relative URLs resolve)
function baseHrefPlugin() {
  const base = process.env.BASE_PATH ?? "/";
  return {
    name: "base-href",
    transformIndexHtml(html: string) {
      return html.replace(
        /<base href="[^"]*" data-base-placeholder \/>/,
        `<base href="${base}" />`
      );
    },
  };
}

// Copy index.html to 404.html for GitHub Pages SPA fallback (so /repo/dashboard etc. load the app)
function copy404Plugin() {
  return {
    name: "copy-404",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const indexPath = path.join(outDir, "index.html");
      const notFoundPath = path.join(outDir, "404.html");
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, notFoundPath);
      }
    },
  };
}

// https://vitejs.dev/config/
// For GitHub Pages: set BASE_PATH to your repo name, e.g. BASE_PATH=/edunet/ npm run build
const base = process.env.BASE_PATH ?? "/";

export default defineConfig(({ mode }) => ({
  base,
  server: {
    host: "::",
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:3003", // Your backend API
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    baseHrefPlugin(),
    copy404Plugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
