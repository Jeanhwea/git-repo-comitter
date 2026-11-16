/**
 * 规则自动对账（W3）：替代已失效的 tmp/prompt-check.cjs。
 *
 * 三张差异表：
 *   1. 有规则无校验 —— F04 的 L1/L2 规则在 checker.ts 中没有编号回显；
 *   2. 有校验无规则 —— checker.ts 回显了 F04 未定义的编号；
 *   3. 提示词与阈值差异 —— L1/L2 规则未在提示词出现，或规格/实现阈值不一致。
 * 任一表非空即退出 1，供本地与 CI 共用。
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ids = (text) =>
  new Set([...text.matchAll(/\[([A-F]\d)\]/g)].map((m) => m[1]));

const doc = read("docs/feat/F04.提交消息严格校验.md");
// checker 已按职责拆为入口 + checker/ 子模块；编号判定分散在各子模块，
// 对账时读取整个目录的合并文本，避免拆分造成「有规则无校验」误报。
const checkerDir = "src/domain/commit-message/checker";
const checkerFiles = [
  "src/domain/commit-message/checker.ts",
  ...fs
    .readdirSync(path.join(root, checkerDir))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `${checkerDir}/${f}`),
];
const checker = checkerFiles.map(read).join("\n");
const ruleSource = read("src/shared/commit-rules.ts");
const limitsSource = read("src/shared/commit-limits.ts");

/** F04 规则表中的全部编号。 */
const defined = new Set(
  [...doc.matchAll(/^\| ([A-F]\d) \|/gm)].map((match) => match[1]),
);

/** F04 判定层级表：编号 → L1 / L2 / L3。 */
const levels = new Map();
for (const line of doc.match(/^\| \*\*L[123][^\n]*$/gm) ?? []) {
  const level = line.match(/\*\*(L[123])/)?.[1];
  if (!level) continue;
  for (const id of line.match(/[A-F]\d/g) ?? []) levels.set(id, level);
}

/** 共享规则清单（提示词与修复提示的单一来源）。 */
const sharedRules = new Map(
  [...ruleSource.matchAll(/id: "([A-F]\d)",\s*level: "(L[123])"/g)].map(
    (match) => [match[1], match[2]],
  ),
);

const implemented = ids(checker);

// 提示词覆盖：三套提交提示词必须引用共享编号对照块；修复提示取共享清单。
const promptFiles = [
  "src/prompts/commit-message/generate.ts",
  "src/prompts/commit-message/partial.ts",
  "src/prompts/commit-message/merge.ts",
  "src/prompts/commit-message/repair.ts",
];
// 编号由共享清单在运行时插值，静态文本里只有 id 字段，需一并计入。
const inPrompts = new Set([
  ...ids(promptFiles.map(read).join("\n")),
  ...sharedRules.keys(),
]);

const missingInChecker = [];
const missingInRules = [];
const missingInPrompts = [];
const specMismatch = [];

for (const [id, level] of levels) {
  if (level === "L1" || level === "L2") {
    if (!implemented.has(id)) missingInChecker.push(`${id} (${level})`);
    if (!inPrompts.has(id)) missingInPrompts.push(`${id} (${level})`);
  }
  if (!defined.has(id)) missingInRules.push(`${id} 不在 F04 规则表中`);
  if (!sharedRules.has(id)) missingInRules.push(`${id} 不在共享规则清单中`);
}

for (const id of implemented) {
  if (!defined.has(id)) missingInRules.push(`${id} 有校验无规格`);
}

for (const [id, level] of sharedRules) {
  if (levels.get(id) !== level) {
    specMismatch.push(
      `${id} 层级：规格 ${levels.get(id) ?? "无"} / 实现 ${level}`,
    );
  }
}

// 阈值对账：F04 文档、shared 常量与硬编码字面量三方一致。
const limit = (name) =>
  Number(limitsSource.match(new RegExp(`export const ${name} = (\\d+)`))?.[1]);
const headerLimit = limit("MAX_HEADER_LENGTH");
const bodyLineLimit = limit("MAX_BODY_LINE_LENGTH");
const bulletLimit = limit("MAX_BODY_BULLETS");
const expected = [
  [
    "标题宽度",
    /标题行(?:总长|显示宽度)不超过 \*\*(\d+)\*\*/.exec(doc),
    headerLimit,
  ],
  [
    "正文行宽",
    /正文每行(?:显示宽度)?不超过 \*\*(\d+)\*\*/.exec(doc),
    bodyLineLimit,
  ],
  ["要点上限", /要点数量不超过 \*\*(\d+)\*\*/.exec(doc), bulletLimit],
];
for (const [label, match, value] of expected) {
  if (!match) specMismatch.push(`${label}：F04 中找不到规格数字`);
  else if (Number(match[1]) !== value) {
    specMismatch.push(`${label}：规格 ${match[1]} / shared ${value}`);
  }
}

for (const file of promptFiles.slice(0, 3)) {
  if (!read(file).includes("COMMIT_RULE_REFERENCE")) {
    missingInPrompts.push(`${file} 未引用共享规则编号对照`);
  }
}
if (!read(promptFiles[3]).includes("COMMIT_RULE_REPAIR_LIST")) {
  missingInPrompts.push("repair.ts 未引用完整规则清单");
}

for (const file of [checker, ...promptFiles.map(read)]) {
  const code = file
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("*"))
    .join("\n");
  if (/\b78\b/.test(code) || /\b118\b/.test(code)) {
    specMismatch.push(
      `${file === checker ? "checker.ts" : "提示词"} 存在硬编码行宽数字，应引用 shared/limits`,
    );
  }
}
if (!checker.includes("COMMIT_TYPES")) {
  specMismatch.push("checker.ts 的 type 白名单未从 shared/limits 引用");
}
if (
  !read("src/domain/file-review/checker.ts").includes(
    "REVIEW_REASON_MAX_LENGTH",
  )
) {
  specMismatch.push("审查 reason 上限未从 shared/limits 引用");
}
if (
  !read("src/prompts/file-review/review.ts").includes("REVIEW_MAX_FILE_CHARS")
) {
  specMismatch.push("审查文件体积上限未从 shared/limits 引用");
}

const tables = [
  ["有规则无校验", missingInChecker],
  ["有校验无规则", missingInRules],
  ["提示词 / 阈值差异", [...missingInPrompts, ...specMismatch]],
];

let failed = false;
for (const [title, rows] of tables) {
  console.log(`\n=== ${title} ===`);
  if (rows.length === 0) console.log("(无)");
  else {
    failed = true;
    for (const row of rows) console.log(`- ${row}`);
  }
}

if (failed) {
  console.error("\n规则对账未通过，请修复上述差异。\n");
  process.exit(1);
}
console.log("\n规则对账全部通过 ✅\n");
