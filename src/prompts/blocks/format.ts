/**
 * 标题/格式公共规则（提交类三套提示词共用，单一来源）。
 * 从原 prompts.ts 中抽取，消除 SYSTEM / PARTIAL / MERGE 三处重复（对应 I04 的 P1）。
 */
export const COMMIT_FORMAT_RULES = `1. 标题行必须形如 type[(scope)][!]: description，type 必填且必须取自 commit_types，scope 与 ! 可选。
2. type 与 description 之间必须使用半角冒号后接一个半角空格分隔，禁止使用全角冒号。
3. scope 必须使用小写英文并以连字符分词，禁止包含空格或右圆括号；无法确定时省略 scope。
4. description 必须以动词开头（中文用动词原形），禁止以句号结尾；语言与标点必须遵守 language 节。
5. 标题行长度必须不超过 78 个字符；超长时必须压缩描述，禁止直接截断。`;
