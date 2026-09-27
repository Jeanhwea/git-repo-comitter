/** Conventional Commits 类型参考表（提交类三套提示词共用，单一来源）。 */
export const COMMIT_TYPES = `<commit_types>
- feat: 新增功能（语义化版本 MINOR）
- fix: 修复缺陷（语义化版本 PATCH）
- docs: 仅修改文档，例如 README、API 文档、代码注释
- style: 仅调整代码样式，例如缩进、空格、空行、分号（不改变代码逻辑）
- refactor: 重构代码，例如调整代码结构、重命名变量或函数（不改变外部行为）
- perf: 优化性能，例如提升执行效率、降低内存占用
- test: 修改测试用例，例如新增、删除、调整测试代码
- build: 修改构建系统或外部依赖，例如依赖库、外部接口、Node 版本
- ci: 修改持续集成配置，例如 GitHub Actions、Jenkins、Travis 工作流
- chore: 修改非业务性内容，例如构建流程、工具配置、脚本
- revert: 回退提交（脚注中必须包含被回退的提交哈希）
</commit_types>`;

/**
 * type 判定优先级（单一来源）：生成、分批、合并三阶段共用，保证选出一致的 type。
 * 每项 = 判定释义 + 对应 type，按次序从前到后裁决。
 */
export const TYPE_PRIORITY_LIST = [
  { type: "fix", hint: "修正既有缺陷" },
  { type: "feat", hint: "新增用户可见的功能、接口或命令" },
  { type: "refactor", hint: "仅调整代码结构而不改变外部行为" },
  { type: "perf", hint: "仅提升执行性能或降低资源占用" },
  { type: "style", hint: "仅调整代码格式" },
  { type: "test", hint: "仅改动测试用例" },
  { type: "docs", hint: "仅改动文档或注释" },
  { type: "build", hint: "改动构建系统或外部依赖" },
  { type: "ci", hint: "改动持续集成流水线配置" },
  { type: "revert", hint: "回退已有提交" },
  { type: "chore", hint: "以上均不适用" },
] as const;

/** 仅取 type 部分的次序文本（如 "fix → feat → ..."），供合并阶段的类型冲突裁决引用。 */
export const TYPE_PRIORITY_TEXT = TYPE_PRIORITY_LIST.map((t) => t.type).join(
  " → ",
);

/** type 判定优先级的完整规则句（带释义），供生成与分批阶段引用。 */
export const TYPE_SELECTION_RULE = `type 必须按以下顺序判定且只取唯一结果，禁止堆叠多个 type：${TYPE_PRIORITY_LIST.map((t) => `${t.hint} → ${t.type}`).join("；")}。混合变更时必须按主要意图判定，次要变更在正文中补述。`;
