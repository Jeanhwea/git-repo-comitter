import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * CLI 构建配置（F05）。
 *
 * 库产物与 CLI 产物分离：CLI 是单文件可执行包，需要 shebang 与 commander。
 * 本配置在库构建之后运行，因此必须关闭 emptyOutDir，否则会清掉库产物。
 */
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    emptyOutDir: false, // 保留 vite.config.ts 产出的库文件
    lib: {
      entry: resolve(__dirname, "src/cli.ts"),
      name: "grc",
      fileName: "cli",
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
        "readline/promises",
        "../package.json",
      ],
    },
  },
});
