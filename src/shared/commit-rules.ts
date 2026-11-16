/**
 * 公共层 —— F04 规则编号清单（提示词、修复提示与对账脚本的单一来源）。
 *
 * 编号一旦发布不再重排：模型反馈与失败原因都以编号为准。
 * level 与 docs/feat/F04 的判定层级表一致：
 * L1 必须拦截、L2 只告警、L3 仅约束模型。
 * F 组是边界场景而非格式规则，不参与校验，也不进入提示词编号对照。
 */
export type RuleLevel = "L1" | "L2" | "L3";

export interface CommitRule {
  id: string;
  level: RuleLevel;
  /** 修复提示里的一句话释义。 */
  hint: string;
}

export const COMMIT_RULES: readonly CommitRule[] = [
  { id: "A1", level: "L1", hint: "type 必填且取自允许清单" },
  { id: "A2", level: "L1", hint: "! 最多一次且紧贴冒号之前" },
  {
    id: "A3",
    level: "L1",
    hint: "scope 小写英文连字符分词，空 scope 省略括号",
  },
  { id: "A4", level: "L1", hint: "半角冒号后恰好一个半角空格" },
  { id: "A5", level: "L1", hint: "! 不能替代 description，标题仍须完整可读" },
  { id: "A6", level: "L1", hint: "description 非空且不以句号结尾" },
  { id: "A7", level: "L3", hint: "description 以动词开头" },
  { id: "A8", level: "L1", hint: "标题宽度不超过上限（按半角字符宽）" },
  { id: "A9", level: "L2", hint: "标题使用简体中文" },
  { id: "B1", level: "L1", hint: "一条消息只允许一个标题行" },
  { id: "B2", level: "L1", hint: "禁止分隔线拼接痕迹" },
  { id: "B3", level: "L1", hint: "禁止序号候选输出多个版本" },
  { id: "B4", level: "L3", hint: "多主题变更合并为一条标题加一组要点" },
  { id: "C1", level: "L1", hint: "正文与标题相隔一个空行" },
  { id: "C2", level: "L1", hint: "正文每行以半角 '- ' 开头" },
  { id: "C3", level: "L1", hint: "正文要点数量不超过上限" },
  { id: "C4", level: "L1", hint: "正文每行宽度不超过上限" },
  { id: "C5", level: "L3", hint: "标题已完整表达时省略正文" },
  { id: "D1", level: "L1", hint: "脚注使用 git trailer 格式" },
  { id: "D2", level: "L1", hint: "多个脚注逐行排列，禁止同行并列或加项目符号" },
  { id: "D3", level: "L1", hint: "! 必须配 BREAKING CHANGE 脚注" },
  { id: "D4", level: "L1", hint: "revert 必须配 Refs 脚注" },
  { id: "E1", level: "L1", hint: "纯文本输出，首行即标题" },
  { id: "E2", level: "L2", hint: "禁止 emoji 与中英混排句式" },
  { id: "E3", level: "L2", hint: "标识符、路径、命令与专有名词保留原文" },
  { id: "E4", level: "L2", hint: "禁止繁体字、方言与网络用语，中文用全角标点" },
  { id: "E5", level: "L3", hint: "只写 diff 支撑的事实" },
  { id: "E6", level: "L1", hint: "整条消息不得为空" },
];

/** 提示词中展示的编号对照：让模型知道失败原因里的编号对应哪条规则。 */
export const COMMIT_RULE_REFERENCE = `<rule_ids>
校验失败时会按以下编号回显，规则与校验器同源：
${COMMIT_RULES.filter((rule) => rule.level !== "L3")
  .map((rule) => `[${rule.id}]`)
  .join(" ")}
（[A7] / [B4] / [C5] / [E5] 为仅提示词约束，不参与机器拦截。）
</rule_ids>`;

/**
 * 修复提示的完整规则清单，供 repair.ts 直接插值。
 * 原先手写清单漏掉 8 个编号，重试时模型只能看到部分规则。
 */
export const COMMIT_RULE_REPAIR_LIST = COMMIT_RULES.filter(
  (rule) => rule.level !== "L3",
)
  .map((rule) => `[${rule.id}] ${rule.hint}`)
  .join("；");
