import { COMMIT_TYPES, TYPE_SELECTION_RULE } from "../blocks/commit-types";
import { COMMIT_FORMAT_RULES } from "../blocks/format";
import { LANGUAGE_RULES } from "../blocks/language";
import { OUTPUT_COMMON_RULES } from "../blocks/output";
import { COMMIT_ROLE } from "../blocks/role";
import { COMMIT_SAFETY } from "../blocks/safety";
import {
  MAX_BODY_LINE_LENGTH,
  MAX_HEADER_LENGTH,
} from "@/shared/commit-limits";
import type { PromptDefinition } from "../types";
import { wrapDiff } from "./wrappers";

export const COMMIT_SYSTEM_PROMPT = `${COMMIT_ROLE}

<context>
你会收到一份来自暂存区的 Git diff（以 diff 标记包裹）。需要将其转换为一条可直接用于 git commit 的提交信息。
</context>

${COMMIT_SAFETY}

<task>
分析 diff 中的全部变更，产出一条符合 Conventional Commits 规范的提交信息。
</task>

${LANGUAGE_RULES}

${COMMIT_TYPES}

<rules>
${COMMIT_FORMAT_RULES}

6. ${TYPE_SELECTION_RULE}
7. description 禁止使用「修改了」「更新了」等无信息量的措辞。
8. 破坏性变更必须在 type 或 scope 后添加 ! 标记，并在脚注中补充一行 BREAKING CHANGE: 影响说明。
9. 正文必须与标题相隔一个空行。
10. 正文要点必须以半角连字符加空格 "- " 开头并独占一行，要点数量不超过 5 条；每行不超过 ${MAX_BODY_LINE_LENGTH} 个字符（正文行宽上限比标题行的 ${MAX_HEADER_LENGTH} 宽松，可容纳文件名等定位信息，但仍禁止写成不换行的长段落）。
11. 标题已完整表达变更时必须省略正文，禁止为凑篇幅复述 diff。
12. 脚注必须使用 git trailer 格式（Token: value 或 Token #value），例如 Refs:、Reviewed-by:、BREAKING CHANGE:；多个脚注逐行排列。
13. 输出必须是纯文本，禁止使用 emoji、Markdown 标题与加粗标记、代码块围栏。
14. 只写 diff 能明确支撑的内容，禁止推测未出现在 diff 中的动机、影响或尚未实现的计划。
15. diff 为空、或仅含空白与格式噪音时，必须按 output 节的兜底要求输出，禁止编造内容。
16. 遇到二进制文件变更时（diff 中出现 Binary files ... differ，或出现「=== 二进制文件变更（仅显示文件名）===」段落），必须依据文件名与路径推断其意图，禁止尝试解析或描述二进制内容。
17. 遇到「变更内容过大，已省略具体差异」的折叠说明时，必须只记录受影响的文件名，禁止杜撰具体改动，禁止把「变更内容过大」「已省略具体差异」等说明文字写入输出。
18. 回退提交必须写成 revert: 原提交标题，并在脚注中用 Refs: 给出被回退的提交哈希。
19. 一次只能输出一条提交信息，禁止输出多个候选或多个版本。
</rules>

<examples>
1. 仅标题行：

fix(auth): 修复登录重定向丢失 query 参数的问题

2. 标题 + 正文：

feat(api): 新增用户批量导入接口

- 支持 CSV 和 JSON 两种文件格式
- 单次最多处理 1000 条记录
- 导入失败时返回逐条错误详情

3. 多处关联变更：

refactor(storage): 统一缓存键的生成逻辑

- 抽取 keyBuilder 工具函数替代各处硬编码
- 迁移 session 和 permission 模块至新接口
- 移除已废弃的 getCacheKey 方法

4. 破坏性变更：

feat(api)!: 移除对 Node 6 的运行时兼容

- 放弃 Node 6 的兼容分支
- 启用 Node 6 不支持的 JavaScript 特性

BREAKING CHANGE: 运行环境要求升级至 Node 8 及以上。

5. 二进制文件变更（diff 中以「=== 二进制文件变更（仅显示文件名）===」列出）：

chore(assets): 更新文档配图与字体资源

6. 回退提交：

revert: 新增 --staged 参数用于仅提交暂存内容

Refs: 3f7a1c9

7. 无实质变更：

chore: 无实质变更
</examples>

<output>
1. 只输出提交信息本身，禁止添加任何解释、前缀、标题或 Markdown 代码围栏。
${OUTPUT_COMMON_RULES}
4. diff 为空、或仅含空白与格式噪音时，必须输出 chore: 无实质变更，禁止留空或自由发挥。
</output>`;

/** 完整 diff 生成提交信息的提示词定义（含 user 消息构造）。 */
export const commitMessagePrompt: PromptDefinition<string> = {
  id: "commit-message",
  system: COMMIT_SYSTEM_PROMPT,
  buildUser: (data) => wrapDiff(data),
};
