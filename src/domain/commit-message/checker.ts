/**
 * 领域层 —— 提交信息格式校验。
 *
 * 规则编号与 docs/feat/F04.提交消息严格校验.md 的 A~F 组一一对应：
 * 失败原因带编号回显，便于模型按编号逐条修正。一次调用返回全部命中项，
 * 避免「改一条、下次又命中另一条」的返工循环把重试次数耗光。
 *
 * 校验失败时的修复提示文本已归入 prompts/commit-message/repair.ts（I06 的 P4）。
 */
import type { ValidationOutcome } from "@/infra/llm/retry";
import {
  MAX_BODY_BULLETS,
  MAX_BODY_LINE_LENGTH,
  MAX_HEADER_LENGTH,
} from "@/shared/commit-limits";

const ALLOWED_TYPES = new Set([
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
]);

const FULL_WIDTH_COLON = "：";

/**
 * 松散标题行：只负责把字段切出来，空格写错等细节交由各条规则自行判定，
 * 以保证失败原因能精确到「全角冒号 / 缺空格 / 多空格」。
 */
const LOOSE_HEADER =
  /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!*)?:(?<space>[ \t]*)(?<description>.*)$/;

/** scope 形状：以小写字母开头，只允许小写字母、数字，分词只用连字符。 */
const SCOPE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** git trailer 脚注：Token: value 或 Token #value，Token 允许含空格与连字符（如 BREAKING CHANGE）。 */
const TRAILER_PATTERN = /^[A-Za-z][A-Za-z0-9 -]*(?:: | #)\S/;

/** 疑似脚注但写法不对（Refs:123 之类），单独按 D1 给原因而不是笼统的格式错误。 */
const TRAILER_LIKE_PATTERN = /^[A-Za-z][A-Za-z0-9 -]*[:#]/;

/**
 * 拼接多条提交信息时残留的分隔线（如 ======= 、------ ）。
 * 提交信息正文里不存在合法用途，出现即判定为多条消息被并在一起。
 */
const SEPARATOR_PATTERN = /^[=-]{3,}$/;

/** 候选序号前缀： "1. "、"2) "、"3、"。模型输出多个版本时的典型痕迹。 */
const CANDIDATE_MARK_PATTERN = /^\d+[.、)]\s+/;

/** 要点前缀：半角连字符加一个半角空格。 */
const BULLET_PREFIX = "- ";

/** emoji 与装饰性符号区段（emoji、箭头、 dingbats、杂项符号）。 */
const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

const CJK_PATTERN = /[\u4e00-\u9fff]/;

/** 解析出的标题字段。解析失败时为 undefined，此时只保留格式类命中项。 */
interface HeaderFields {
  type: string;
  scope: string | undefined;
  breaking: boolean;
  description: string;
}

const MAX_REASON_SNIPPET = 40;

function snippet(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_REASON_SNIPPET
    ? `${trimmed.slice(0, MAX_REASON_SNIPPET)}...`
    : trimmed;
}

/** 判定一行是否为 Conventional Commits 标题行（type 必须取自允许列表）。 */
function isHeaderLine(line: string): boolean {
  const type = line.match(LOOSE_HEADER)?.groups?.type;
  return !!type && ALLOWED_TYPES.has(type);
}

/** 标题行校验：A 组规则。返回 fields 供 D3 / D4 联动判定使用。 */
function validateHeader(header: string): {
  reasons: string[];
  fields?: HeaderFields;
} {
  const reasons: string[] = [];

  if (!header.includes(":")) {
    reasons.push(
      header.includes(FULL_WIDTH_COLON)
        ? `[A4] type 与 description 之间必须使用半角冒号加一个半角空格，禁止使用全角冒号（当前标题："${snippet(header)}"）`
        : `[A4] 标题缺少 type 与 description 之间的半角冒号，必须形如 type[(scope)][!]: description（当前标题："${snippet(header)}"）`,
    );
    return { reasons };
  }

  const groups = header.match(LOOSE_HEADER)?.groups;
  if (!groups) {
    reasons.push(
      `[A1] 标题行必须形如 type[(scope)][!]: description，type 必须取自 ${[...ALLOWED_TYPES].join(", ")}（当前标题："${snippet(header)}"）`,
    );
    return { reasons };
  }

  const { type, scope, bang = "", space = "", description = "" } = groups;

  if (!ALLOWED_TYPES.has(type)) {
    reasons.push(
      `[A1] type 字段的值 "${type}" 不在允许的列表中 (${[...ALLOWED_TYPES].join(", ")})`,
    );
  }

  if (bang.length > 1) {
    reasons.push(
      `[A2] 破坏性标记 ! 最多出现一次且必须紧贴冒号之前，当前出现 ${bang.length} 次`,
    );
  }

  if (scope !== undefined) {
    if (scope.trim() === "") {
      reasons.push("[A3] scope 为空时必须省略括号整段，禁止写成空括号 ()");
    } else if (!SCOPE_PATTERN.test(scope)) {
      reasons.push(
        `[A3] scope "${scope}" 必须是小写英文并以连字符分词，禁止包含空格、大写字母或右圆括号`,
      );
    }
  }

  if (space !== " ") {
    reasons.push(
      space === ""
        ? "[A4] 半角冒号后必须紧跟恰好一个半角空格，禁止直接接 description"
        : `[A4] 半角冒号后只能是恰好一个半角空格，当前为 ${space.length} 个空白字符`,
    );
  }

  const trimmedDescription = description.trim();
  if (trimmedDescription === "") {
    reasons.push("[A6] description 不允许为空");
  } else if (/[。.]$/.test(trimmedDescription)) {
    reasons.push(
      `[A6] description 禁止以句号结尾（当前以 "${trimmedDescription.slice(-1)}" 结尾）`,
    );
  }

  if (header.length > MAX_HEADER_LENGTH) {
    reasons.push(
      `[A8] 标题行超过 ${MAX_HEADER_LENGTH} 字符限制 (当前 ${header.length} 字符)，请压缩 description，禁止直接截断`,
    );
  }

  return {
    reasons,
    fields: {
      type,
      scope,
      breaking: bang === "!",
      description: trimmedDescription,
    },
  };
}

export function validateCommitMessage(
  message: string,
): ValidationOutcome<string> {
  // 部分模型输出 CRLF，分析前统一为 LF；返回值保持模型原样输出。
  const normalized = message.replace(/\r\n/g, "\n");
  if (normalized.trim() === "") {
    return { valid: false, reason: "[E6] 提交信息为空，禁止提交空内容" };
  }

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (normalized !== normalized.trim()) {
    reasons.push(
      "[E1] 输出的第一行必须是标题行且结尾禁止追加空行，禁止以空行或空白开头",
    );
  }

  const lines = normalized.trim().split("\n");
  const header = lines[0];
  const { reasons: headerReasons, fields } = validateHeader(header);
  reasons.push(...headerReasons);

  const fence = lines.find((line) => line.trim().startsWith("```"));
  if (fence) {
    reasons.push(
      `[E1] 输出必须是纯文本，禁止使用代码块围栏（发现行："${snippet(fence)}"）`,
    );
  }

  const bodyLines = lines.slice(1);
  const contentLines = bodyLines.filter((line) => line.trim() !== "");

  // C1：正文行紧接标题行，说明中间少了那个空行。
  if (contentLines.length > 0 && bodyLines[0].trim() !== "") {
    reasons.push(
      `[C1] 正文必须与标题相隔一个空行，禁止用单个换行直接接正文（当前第二行："${snippet(bodyLines[0])}"）`,
    );
  }

  const bullets: string[] = [];
  const footers: string[] = [];
  const extraHeaders: string[] = [];
  const candidates: string[] = [];
  const malformed: string[] = [];
  const brokenTrailers: string[] = [];

  for (const rawLine of contentLines) {
    const line = rawLine.trim();
    if (SEPARATOR_PATTERN.test(line)) continue;

    if (line.startsWith(BULLET_PREFIX)) {
      bullets.push(line);
      // "- Refs: xxx" 把脚注写成了要点，仍计入脚注参与 D3 / D4 判定。
      const inner = line.slice(BULLET_PREFIX.length).trim();
      if (TRAILER_PATTERN.test(inner)) footers.push(inner);
      continue;
    }

    if (TRAILER_PATTERN.test(line)) {
      footers.push(line);
      continue;
    }

    if (TRAILER_LIKE_PATTERN.test(line)) {
      brokenTrailers.push(line);
      continue;
    }

    if (CANDIDATE_MARK_PATTERN.test(line)) {
      const stripped = line.replace(CANDIDATE_MARK_PATTERN, "");
      if (isHeaderLine(stripped)) candidates.push(line);
      else malformed.push(line);
      continue;
    }

    if (isHeaderLine(line)) {
      extraHeaders.push(line);
      continue;
    }

    malformed.push(line);
  }

  const separator = contentLines.find((line) => SEPARATOR_PATTERN.test(line));
  if (separator) {
    reasons.push(
      `[B2] 提交信息中禁止出现分隔线 "${separator}"，一次只能输出一条提交信息，禁止把多条提交信息拼在一起`,
    );
  }

  if (extraHeaders.length > 0) {
    reasons.push(
      `[B1] 提交信息中共出现 ${extraHeaders.length + 1} 条 Conventional Commits 标题行（第二条为 "${snippet(extraHeaders[0])}"），` +
        "一次只能输出一条提交信息，多主题变更必须合并为一条标题加一组要点",
    );
  }

  if (candidates.length > 0) {
    reasons.push(
      `[B3] 禁止用序号或候选标记输出多个版本（违规行："${snippet(candidates[0])}"），必须择优输出唯一一条`,
    );
  }

  if (brokenTrailers.length > 0) {
    reasons.push(
      `[D1] 脚注必须使用 git trailer 格式 Token: value 或 Token #value，冒号或 # 后必须有一个半角空格（违规行："${snippet(brokenTrailers[0])}"）`,
    );
  }

  if (malformed.length > 0) {
    reasons.push(
      `[C2] 正文每行必须是以 "${BULLET_PREFIX.trim()} " 开头的要点或 git trailer 脚注，禁止 Markdown 标题、加粗、星号列表与不换行长段落（违规行："${snippet(malformed[0])}"）`,
    );
  }

  if (bullets.length > MAX_BODY_BULLETS) {
    reasons.push(
      `[C3] 正文要点数量不得超过 ${MAX_BODY_BULLETS} 条 (当前 ${bullets.length} 条)，请按主题归并`,
    );
  }

  const longLines = bodyLines.filter(
    (line) => line.length > MAX_BODY_LINE_LENGTH,
  );
  if (longLines.length > 0) {
    reasons.push(
      `[C4] 正文行超出 ${MAX_BODY_LINE_LENGTH} 字符限制 (最长 ${Math.max(...longLines.map((line) => line.length))} 字符): ${longLines.slice(0, 3).map(snippet).join(", ")}`,
    );
  }

  if (fields) {
    if (
      fields.breaking &&
      !footers.some((footer) => footer.startsWith("BREAKING CHANGE"))
    ) {
      reasons.push(
        "[D3] 标题含破坏性标记 ! 时，必须在脚注中补充一行 BREAKING CHANGE: 影响说明",
      );
    }
    if (
      fields.type === "revert" &&
      !footers.some((f) => f.startsWith("Refs:"))
    ) {
      reasons.push("[D4] revert 提交必须在脚注中用 Refs: 给出被回退的提交哈希");
    }
  }

  // L2：语言类问题无法可靠机器判定，降级为告警而不是拦截。
  if (
    fields &&
    fields.description !== "" &&
    !CJK_PATTERN.test(fields.description)
  ) {
    warnings.push(
      `[A9] 标题疑似整句英文（"${snippet(fields.description)}"），输出语言应为简体中文`,
    );
  }
  const emojiLine = lines.find((line) => EMOJI_PATTERN.test(line));
  if (emojiLine) {
    warnings.push(`[E2] 输出禁止使用 emoji（发现于："${snippet(emojiLine)}"）`);
  }

  if (reasons.length > 0) {
    return { valid: false, reason: reasons.join("\n  ") };
  }
  return {
    valid: true,
    value: message,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
