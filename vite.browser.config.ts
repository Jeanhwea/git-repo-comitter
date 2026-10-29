import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * 浏览器构建配置（F07）。
 *
 * 以 src/lib-browser.ts 为入口产出纯 ESM 浏览器产物：只保留 openai 为外部依赖，
 * 不打包任何 Node 内置模块（纯核零污染，详见 F07）。
 *
 * 本配置在库 / CLI 构建之后运行，故关闭 emptyOutDir，产物写入 dist/browser/，
 * 不与库（dist/index.*）或 CLI（dist/cli.cjs）产物冲突。
 */
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    emptyOutDir: false, // 保留 vite.config.ts / vite.cli.config.ts 产出的文件
    lib: {
      entry: resolve(__dirname, "src/lib-browser.ts"),
      name: "git-repo-comitter-browser",
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist/browser",
    sourcemap: false,
    rollupOptions: {
      external: ["openai"],
    },
  },
});
