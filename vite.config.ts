import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "git-repo-comitter",
      fileName: "index",
      formats: ["cjs"],
    },
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      external: [
        "openai",
        "yaml",
        "dotenv",
        "fs",
        "path",
        "os",
        "child_process",
        "readline/promises",
      ],
    },
  },
});
