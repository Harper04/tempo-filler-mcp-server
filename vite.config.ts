import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import { renameSync, existsSync, mkdirSync } from "fs";

// Get the UI to build from command line args
const uiArg = process.argv.find(arg => arg.startsWith("--ui="));
const ui = uiArg ? uiArg.split("=")[1] : "get-schedule";

export default defineConfig({
  plugins: [
    viteSingleFile(),
    {
      name: "rename-output",
      closeBundle() {
        // Rename index.html to the appropriate filename
        const outDir = resolve(__dirname, "dist/ui");
        const srcPath = resolve(outDir, "index.html");
        const destPath = resolve(outDir, `${ui}.html`);

        if (!existsSync(outDir)) {
          mkdirSync(outDir, { recursive: true });
        }

        if (existsSync(srcPath) && srcPath !== destPath) {
          renameSync(srcPath, destPath);
          console.log(`Renamed: index.html -> ${ui}.html`);
        }
      },
    },
  ],
  root: resolve(__dirname, `src/ui/${ui}`),
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyDirOnce: false,
    // Keep bundle sizes minimal
    minify: "esbuild",
    rollupOptions: {
      // Do NOT externalize - the singlefile plugin needs everything inline
      // The MCP Apps SDK will be bundled (~300KB) but is required for postMessage communication
    },
  },
});
