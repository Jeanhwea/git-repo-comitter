import { resolve } from "path";

import { defineConfig } from "vitest/config";

/**
 * 单元测试配置（F07 配套）。
 *
 * 复用主 vite.config 的 `@` → src 别名，使测试文件能用与源码一致的模块路径导入。
 * 测试文件统一放在仓库根的 tests/ 目录（不在 src/ 内），避免：
 * - 被 tsconfig.build.json 的 include 误编进 dist 类型声明；
 * - 被库构建 / 浏览器构建打包进去。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
