import globals from "globals";
import pluginJs from "@eslint/js";
import pluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import tsdoc from "eslint-plugin-tsdoc";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    ignores: ["dist/**", "tmp/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: parserTs,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": pluginTs,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginTs.configs.recommended.rules,
      ...eslintConfigPrettier.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // JSDoc 逻辑预设（错误检测类规则）
  {
    files: ["src/**/*.ts"],
    ...jsdoc.configs["flat/logical-typescript-flavor-error"],
  },

  // 注释规则（TSDoc 语法 + JSDoc 必填项 / 风格）+ Import 顺序
  {
    files: ["src/**/*.ts"],
    plugins: {
      "import-x": importX,
      tsdoc,
      jsdoc,
    },
    settings: {
      "import-x/resolver": {
        typescript: true,
      },
      jsdoc: {
        mode: "typescript",
      },
    },
    rules: {
      // Import 顺序
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "error",

      // TSDoc 语法
      "tsdoc/syntax": "error",

      // JSDoc 必填项
      "jsdoc/require-param": [
        "error",
        { checkDestructured: false, checkDestructuredRoots: false },
      ],
      "jsdoc/require-param-name": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",

      // JSDoc 风格统一
      "jsdoc/check-alignment": "error",
      "jsdoc/multiline-blocks": "error",
      "jsdoc/no-blank-block-descriptions": "error",
      "jsdoc/no-multi-asterisks": "error",
      "jsdoc/require-hyphen-before-param-description": ["error", "always"],
      "jsdoc/tag-lines": ["error", "never"],

      // 关闭与 tsdoc 职责重叠、或无法解析 TS 类型易误报的规则
      "jsdoc/check-syntax": "off",
      "jsdoc/no-undefined-types": "off",
    },
  },
];
