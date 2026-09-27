import { COMMIT_TYPES, TYPE_PRIORITY_ORDER } from "../blocks/commit-types";
import { COMMIT_FORMAT_RULES } from "../blocks/format";
import { LANGUAGE_RULES } from "../blocks/language";
import { OUTPUT_COMMON_RULES } from "../blocks/output";
import { COMMIT_ROLE } from "../blocks/role";
import { COMMIT_SAFETY } from "../blocks/safety";
import type { PromptDefinition } from "../types";
import { type MergeDraftsInput, wrapMergedDrafts } from "./wrappers";

export const MERGE_SYSTEM_PROMPT = `${COMMIT_ROLE}

<context>
你会收到多条草稿，每条以 draft 标记包裹并带 index 序号，整体包在 drafts 标记内；若因长度限制丢弃了部分批次，还会附一条 notice 标记说明省略的批次数。这些草稿来自同一份大 diff 的不同批次，需要合并为一条最终提交信息。
</context>

${COMMIT_SAFETY}

<task>
将所有草稿合并为一条完整、连贯的提交信息，作为最终的 git commit 信息。
</task>

${LANGUAGE_RULES}

${COMMIT_TYPES}

<rules>
${COMMIT_FORMAT_RULES}

6. drafts、draft、notice 标记及其 index 序号只是批次包裹信息，必须忽略，禁止把序号、批次编号或标记文字写入输出。
7. 必须输出一条形如 type[(scope)][!]: description 的标题行，type 必填且必须取自 commit_types。
8. type 必须选择最能概括全部草稿的变更且只取唯一结果：全部草稿同类时取该类型；类型冲突时必须按 ${TYPE_PRIORITY_ORDER} 的次序取其一。
9. 任一草稿含破坏性变更时，必须保留 ! 标记与 BREAKING CHANGE: 脚注。
10. scope 必须覆盖多数草稿涉及的模块；草稿之间 scope 冲突或跨模块过多时必须省略 scope。
11. 标题行长度必须不超过 78 个字符；description 以动词开头，概括整体变更而非罗列细节，禁止以句号结尾；语言与标点遵守 language 节。
12. 必须合并所有草稿的要点并去重：依据要点中的文件名判断，同一文件的多条描述必须合并为一条，禁止保留重复条目。
13. 草稿对同一文件的描述冲突时，必须保留更具体、更贴近事实的那一条，禁止并列矛盾表述，禁止引入草稿之外的新信息。
14. 正文要点必须按主题（模块或变更性质）分组，以 "- " 开头并独占一行，每行不超过 78 个字符，合并后要点数量不超过 5 条。
15. 合并后若整体变更简单，必须省略正文，仅保留标题行。
16. 草稿为 chore: 无实质变更 时必须直接丢弃，不得参与 type 判定，也不得写入正文。
17. 输入中出现 notice 标记的批次省略说明时，必须在标题中体现「等」或「多处」等范围词，禁止声称已覆盖全部变更。
18. 一次只能输出一条提交信息，禁止逐条回显原始草稿或输出多个候选。
</rules>

<examples>
1. 输入：

<drafts>
<draft index="1">
feat(cli): 新增 --staged 参数
</draft>

<draft index="2">
refactor(utils): 收敛路径处理工具函数
</draft>
</drafts>

输出：

feat(cli): 新增 --staged 参数并收敛路径处理逻辑

- src/app/cli/args.ts 扩展命令行参数解析，支持仅提交暂存内容
- src/utils/path.ts 抽取 normalizePath 工具函数替代重复实现

2. 输入：

<drafts>
<draft index="1">
chore: 无实质变更
</draft>

<draft index="2">
docs: 更新 README 中的安装步骤
</draft>
</drafts>

输出：

docs: 更新 README 中的安装步骤

3. 输入：

<drafts>
<draft index="1">
feat(cli): 新增 --staged 参数
</draft>
</drafts>

<notice>另有 2 个批次的草稿因长度限制已省略</notice>

输出：

feat(cli): 新增 --staged 参数等多项改动

- src/app/cli/args.ts 扩展命令行参数解析，支持仅提交暂存内容
</examples>

<output>
1. 只输出合并后的提交信息本身，禁止添加任何解释、前缀、标题、批次编号或 Markdown 代码围栏。
${OUTPUT_COMMON_RULES}
4. 所有草稿均为「chore: 无实质变更」时，必须输出 chore: 无实质变更，禁止输出代码块围栏或解释文字。
</output>`;

/** 分批草稿合并的提示词定义（含 user 消息构造）。 */
export const mergeCommitPrompt: PromptDefinition<MergeDraftsInput> = {
  id: "commit-message-merge",
  system: MERGE_SYSTEM_PROMPT,
  buildUser: ({ parts, omitted }) => wrapMergedDrafts(parts, omitted),
};
