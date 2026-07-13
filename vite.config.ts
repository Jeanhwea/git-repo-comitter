import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  envDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "git-repo-comitter",
      fileName: "index",
      formats: ["cjs"],
    },
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        banner: "#!/usr/bin/env node\n",
      },
      external: [
        "openai",
        "yaml",
        "commander",
        "fs",
        "path",
        "os",
        "child_process",
        "readline",
        "../package.json",
      ],
    },
  },
});
