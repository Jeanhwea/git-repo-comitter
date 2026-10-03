import {
  MAX_BODY_LINE_LENGTH,
  MAX_HEADER_LENGTH,
} from "@/shared/commit-limits";

import { COMMIT_TYPES, TYPE_SELECTION_RULE } from "../blocks/commit-types";
import { COMMIT_FORMAT_RULES } from "../blocks/format";
import { LANGUAGE_RULES } from "../blocks/language";
import { OUTPUT_COMMON_RULES } from "../blocks/output";
import { COMMIT_ROLE } from "../blocks/role";
import { COMMIT_SAFETY } from "../blocks/safety";
import type { PromptDefinition } from "../types";
import { wrapPartialDiff } from "./wrappers";

const PARTIAL_SYSTEM_PROMPT = `${COMMIT_ROLE}

<context>
你会收到一个大型 Git diff 的其中一部分（以 diff_part 标记包裹），只包含部分文件的变更。本次产出只是其中一条草稿，后续会与其他批次的草稿合并为一条完整的提交信息。
</context>

${COMMIT_SAFETY}

<task>
仅针对当前收到的这部分 diff，生成一条草稿，并保留足够的文件线索供后续合并去重。
</task>

${LANGUAGE_RULES}

${COMMIT_TYPES}

<rules>
${COMMIT_FORMAT_RULES}
6. ${TYPE_SELECTION_RULE}
7. 只描述当前这部分 diff 中实际出现的变更，禁止推测或补全省略部分的内容。
8. 正文要点必须点出受影响的关键文件名或模块名（供后续合并时去重），以 "- " 开头并独占一行，要点数量不超过 5 条；每行不超过 ${MAX_BODY_LINE_LENGTH} 个字符（正文行宽上限比标题行的 ${MAX_HEADER_LENGTH} 宽松）。
9. 禁止出现「其余变更」「完整改动见其他部分」「以上为全部变更」等指向整体的表述，禁止写入批次编号或分隔标记。
10. 本批文件跨多个模块时，必须选取覆盖主要变更的 scope，无法确定时省略 scope；禁止选择与本批变更无关的类型。
11. 遇到二进制文件变更或「已省略具体差异」的折叠说明时，必须只记录文件名并依据文件名推断意图，禁止杜撰改动细节，禁止把「变更内容过大」等说明文字写入输出。
12. 当前部分无实质变更时，必须按 output 节的兜底要求输出。
13. 一次只能输出一条草稿，禁止输出多个候选、合并说明或批次编号。
</rules>

<examples>
1. 单模块的部分变更：

feat(cli): 新增 --staged 参数用于仅提交暂存内容

- src/app/cli/args.ts 扩展命令行参数解析
- src/infra/git/diff.ts 支持仅读取暂存区差异

2. 跨模块的混合变更：

refactor(utils): 收敛路径处理工具函数

- src/utils/path.ts 抽取 normalizePath 替代重复实现

3. 二进制与折叠说明（只记录文件名并依据文件名推断意图，不写「变更内容过大」这类说明文字）：

chore(assets): 更新二进制资源与超大文件

- static/report.pdf 更新导出报表模板
- tmp/huge-dump.sql 同步数据导出脚本

4. 无实质变更：

chore: 无实质变更
</examples>

<output>
1. 只输出这条草稿的内容，禁止添加任何解释、前缀、标题、批次编号或 Markdown 代码围栏。
${OUTPUT_COMMON_RULES}
5. 当前部分无实质变更时，必须输出 chore: 无实质变更，禁止留空或自由发挥。
</output>`;

/** 分批草稿生成的提示词定义（含 user 消息构造）。 */
export const partialCommitPrompt: PromptDefinition<string> = {
  id: "commit-message-partial",
  system: PARTIAL_SYSTEM_PROMPT,
  buildUser: (data) => wrapPartialDiff(data),
};
