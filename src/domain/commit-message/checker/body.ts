/**
 * 提交消息校验：正文与载体（B/C/D/E 组规则）。
 *
 * 先把正文行分类（要点 / 脚注 / 标题 / 候选 / 畸形），再逐组判定规则。
 * 一次调用返回全部命中项，避免模型「改一条又命中另一条」耗尽重试。
 */
import { MAX_BODY_BULLETS, MAX_BODY_LINE_LENGTH } from "@/shared/limits";
import { displayWidth } from "@/shared/text";

import {
  BULLET_PREFIX,
  CANDIDATE_MARK_PATTERN,
  CJK_PATTERN,
  EMOJI_PATTERN,
  HALF_WIDTH_IN_CJK,
  isHeaderLine,
  SEPARATOR_PATTERN,
  SLANG,
  snippet,
  TRAILER_LIKE_PATTERN,
  TRAILER_PATTERN,
  TRAILER_VALUE_PATTERN,
  TRANSLATED_IDENTIFIER,
  TRANSLATED_PATH,
  TRADITIONAL_CHARS,
  type HeaderFields,
} from "./patterns";

/** 正文行分类结果，供各规则组取用。 */
interface LineClasses {
  bullets: string[];
  footers: string[];
  extraHeaders: string[];
  candidates: string[];
  malformed: string[];
  brokenTrailers: string[];
  bulletTrailers: string[];
  joinedTrailers: string[];
  separator?: string;
}

/**
 * 把正文行分成要点、脚注、标题、候选与畸形等类别。
 * @param lines - 标题行之后的全部行（含空行）。
 */
function classifyLines(lines: string[]): LineClasses {
  const classes: LineClasses = {
    bullets: [],
    footers: [],
    extraHeaders: [],
    candidates: [],
    malformed: [],
    brokenTrailers: [],
    bulletTrailers: [],
    joinedTrailers: [],
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (SEPARATOR_PATTERN.test(line)) {
      // 与原实现一致：只报告第一条分隔线。
      if (classes.separator === undefined) classes.separator = line;
      continue;
    }

    if (line.startsWith(BULLET_PREFIX)) {
      classes.bullets.push(line);
      // "- Refs: xxx" 违反 D2：不计入脚注，避免 D3 / D4 被错误放行。
      const inner = line.slice(BULLET_PREFIX.length).trim();
      if (TRAILER_PATTERN.test(inner)) classes.bulletTrailers.push(line);
      continue;
    }

    if (TRAILER_PATTERN.test(line)) {
      // "Refs: a, b" 属于脚注同行并列，同样违反 D2。
      const value = line.match(TRAILER_VALUE_PATTERN)?.[1] ?? "";
      if (/,\s*\S/.test(value)) classes.joinedTrailers.push(line);
      classes.footers.push(line);
      continue;
    }

    if (TRAILER_LIKE_PATTERN.test(line)) {
      classes.brokenTrailers.push(line);
      continue;
    }

    if (CANDIDATE_MARK_PATTERN.test(line)) {
      const stripped = line.replace(CANDIDATE_MARK_PATTERN, "");
      if (isHeaderLine(stripped)) classes.candidates.push(line);
      else classes.malformed.push(line);
      continue;
    }

    if (isHeaderLine(line)) {
      classes.extraHeaders.push(line);
      continue;
    }

    classes.malformed.push(line);
  }
  return classes;
}

/**
 * 正文与载体规则校验：B（单条性）、C（正文）、D（脚注）、E（载体）。
 * @param lines - 提交信息按行切分后的全部行（已规范化为 LF）。
 * @param bodyLines - 标题行之后的行。
 * @param fields - 标题解析字段，供 D3 / D4 判定；解析失败时为 undefined。
 * @param hasLeadingBlank - 标题与正文之间是否恰好缺一个空行（C1）。
 */
export function validateBody(
  lines: string[],
  bodyLines: string[],
  fields: HeaderFields | undefined,
  hasLeadingBlank: boolean,
): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const contentLines = bodyLines.filter((line) => line.trim() !== "");

  // C1：正文行紧接标题行，说明中间少了那个空行。
  if (contentLines.length > 0 && hasLeadingBlank) {
    reasons.push(
      `[C1] 正文必须与标题相隔一个空行，禁止用单个换行直接接正文（当前第二行："${snippet(bodyLines[0] ?? "")}"）`,
    );
  }

  const classes = classifyLines(contentLines);

  if (classes.separator) {
    reasons.push(
      `[B2] 提交信息中禁止出现分隔线 "${classes.separator}"，一次只能输出一条提交信息，禁止把多条提交信息拼在一起`,
    );
  }

  if (classes.extraHeaders.length > 0) {
    reasons.push(
      `[B1] 提交信息中共出现 ${classes.extraHeaders.length + 1} 条 Conventional Commits 标题行（第二条为 "${snippet(classes.extraHeaders[0] ?? "")}"），` +
        "一次只能输出一条提交信息，多主题变更必须合并为一条标题加一组要点",
    );
  }

  if (classes.candidates.length > 0) {
    reasons.push(
      `[B3] 禁止用序号或候选标记输出多个版本（违规行："${snippet(classes.candidates[0] ?? "")}"），必须择优输出唯一一条`,
    );
  }

  if (classes.brokenTrailers.length > 0) {
    reasons.push(
      `[D1] 脚注必须使用 git trailer 格式 Token: value 或 Token #value，冒号或 # 后必须有一个半角空格（违规行："${snippet(classes.brokenTrailers[0] ?? "")}"）`,
    );
  }

  const d2Violations = [...classes.bulletTrailers, ...classes.joinedTrailers];
  if (d2Violations.length > 0) {
    reasons.push(
      `[D2] 脚注必须逐行排列，禁止加项目符号或同行并列（违规行："${snippet(d2Violations[0] ?? "")}"）`,
    );
  }

  if (classes.malformed.length > 0) {
    reasons.push(
      `[C2] 正文每行必须是以 "${BULLET_PREFIX.trim()} " 开头的要点或 git trailer 脚注，禁止 Markdown 标题、加粗、星号列表与不换行长段落（违规行："${snippet(classes.malformed[0] ?? "")}"）`,
    );
  }

  if (classes.bullets.length > MAX_BODY_BULLETS) {
    reasons.push(
      `[C3] 正文要点数量不得超过 ${MAX_BODY_BULLETS} 条 (当前 ${classes.bullets.length} 条)，请按主题归并`,
    );
  }

  const longLines = bodyLines.filter(
    (line) => displayWidth(line) > MAX_BODY_LINE_LENGTH,
  );
  if (longLines.length > 0) {
    reasons.push(
      `[C4] 正文行超出 ${MAX_BODY_LINE_LENGTH} 个半角字符宽度的限制 (最长 ${Math.max(...longLines.map((line) => displayWidth(line)))}，中文按 2 计): ${longLines.slice(0, 3).map(snippet).join(", ")}`,
    );
  }

  if (fields) {
    if (
      fields.breaking &&
      !classes.footers.some((footer) => footer.startsWith("BREAKING CHANGE"))
    ) {
      reasons.push(
        "[D3] 标题含破坏性标记 ! 时，必须在脚注中补充一行 BREAKING CHANGE: 影响说明",
      );
    }
    if (
      fields.type === "revert" &&
      !classes.footers.some((f) => f.startsWith("Refs:"))
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

  // E3 / E4 属 L2：只给出启发式告警，不因可能的误判拦住提交。
  if (fields) {
    const translated =
      fields.description.match(TRANSLATED_IDENTIFIER) ??
      fields.description.match(TRANSLATED_PATH);
    if (translated) {
      warnings.push(
        `[E3] "${snippet(translated[0])}" 疑似把标识符或路径译成了中文，代码标识符、文件名、命令与专有名词应保留原文`,
      );
    }
  }
  const traditionalLine = lines.find((line) => TRADITIONAL_CHARS.test(line));
  if (traditionalLine) {
    warnings.push(
      `[E4] 疑似出现繁体字（"${snippet(traditionalLine)}"），输出语言应为简体中文`,
    );
  }
  const slangLine = lines.find((line) => SLANG.test(line));
  if (slangLine) {
    warnings.push(
      `[E4] 疑似使用网络用语（"${snippet(slangLine)}"），请改为书面表达`,
    );
  }
  const halfWidthLine = lines.find((line) => HALF_WIDTH_IN_CJK.test(line));
  if (halfWidthLine) {
    warnings.push(
      `[E4] 中文语句中疑似使用半角标点（"${snippet(halfWidthLine)}"），描述文字应使用全角标点`,
    );
  }

  return { reasons, warnings };
}
