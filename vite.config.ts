import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * 库构建配置（F05）。
 *
 * 以 src/lib.ts 为入口产出 ESM + CJS 双格式供其他代码调用：
 * - dist/index.js   ESM（package.json 为 "type": "module"，.js 即 ESM）
 * - dist/index.cjs  CJS
 * 类型声明由 dts-bundle-generator 另行产出（见 package.json 的 build:types）。
 *
 * 注意：不带 shebang；且本配置先于 CLI 构建运行，以便正常清空 outDir。
 */
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib.ts"),
      name: "git-repo-comitter",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      external: [
        "openai",
        "fs",
        "path",
        "os",
        "child_process",
        "readline/promises",
      ],
    },
  },
});
